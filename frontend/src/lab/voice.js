// Tima's live ears and mouth, in the browser.
//
// LiveEars streams the microphone to the server (/api/live), which relays it to Muse Voice
// Transcribe realtime: live transcripts come back, and Meta says when the student has
// finished a sentence. Mouth speaks with Voxtral (/api/tts) when the server has a voice key,
// else with the browser's own voice. Both report a level, so Tima's orb moves with the sound.

const RATE = 24_000;
// the FastAPI server's WebSocket: the same origin in production; `next dev` points it at port 8080
const LIVE_URL = process.env.NEXT_PUBLIC_LIVE_URL;
const CHUNK = 1920; // 80 ms at 24 kHz, as Muse Voice Transcribe takes it

// Runs on the audio thread: any input rate → 24 kHz mono 16-bit PCM, in 80 ms chunks.
const WORKLET = `
class Pcm24k extends AudioWorkletProcessor {
  constructor() { super(); this.step = sampleRate / ${RATE}; this.at = 0; this.out = new Int16Array(${CHUNK}); this.n = 0; this.energy = 0; this.count = 0; }
  process(inputs) {
    const input = inputs[0] && inputs[0][0];
    if (!input) return true;
    for (let i = 0; i < input.length; i++) { this.energy += input[i] * input[i]; this.count++; }
    while (this.at < input.length) {
      const i = Math.floor(this.at), f = this.at - i, a = input[i], b = i + 1 < input.length ? input[i + 1] : a;
      const v = Math.max(-1, Math.min(1, a + (b - a) * f));
      this.out[this.n++] = v < 0 ? v * 0x8000 : v * 0x7fff;
      if (this.n === ${CHUNK}) {
        this.port.postMessage({ pcm: this.out.buffer, level: Math.sqrt(this.energy / this.count) }, [this.out.buffer]);
        this.out = new Int16Array(${CHUNK}); this.n = 0; this.energy = 0; this.count = 0;
      }
      this.at += this.step;
    }
    this.at -= input.length;
    return true;
  }
}
registerProcessor("pcm-24k", Pcm24k);`;

export class LiveEars {
  /** on: { ready, speechStart, partial(text), final(text), level(x), error(message) } */
  constructor({ lang = "fr", on = {} } = {}) {
    this.lang = lang;
    this.on = on;
    this.running = false;
    this.retry = 0;
  }

  async start() {
    if (this.running) return;
    this.running = true;
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } });
    this.audio = new AudioContext();
    const url = URL.createObjectURL(new Blob([WORKLET], { type: "text/javascript" }));
    await this.audio.audioWorklet.addModule(url);
    URL.revokeObjectURL(url);
    this.node = new AudioWorkletNode(this.audio, "pcm-24k");
    this.audio.createMediaStreamSource(this.stream).connect(this.node);
    this.node.port.onmessage = ({ data }) => {
      this.on.level?.(Math.min(1, data.level * 6));
      if (this.socket?.readyState === WebSocket.OPEN && this.ready) this.socket.send(data.pcm);
    };
    this.connect();
  }

  connect() {
    const scheme = location.protocol === "https:" ? "wss" : "ws";
    const socket = new WebSocket(LIVE_URL || `${scheme}://${location.host}/api/live`);
    this.socket = socket;
    this.ready = false;
    socket.onopen = () => socket.send(JSON.stringify({ language: this.lang }));
    socket.onmessage = ({ data }) => {
      const event = JSON.parse(data);
      if (event.type === "ready") { this.ready = true; this.retry = 0; this.on.ready?.(); }
      else if (event.type === "speechStart") this.on.speechStart?.();
      else if (event.type === "transcript" && !event.final) this.on.partial?.(event.transcript ?? "");
      else if (event.type === "speechComplete" || (event.type === "transcript" && event.final)) {
        // a turn may end both ways (a final transcript, then speechComplete): count it once
        if (event.turnId && event.turnId === this.lastTurn) return;
        this.lastTurn = event.turnId;
        this.on.final?.(event.transcript ?? "");
      }
      else if (event.type === "error") { this.failed = event.message; this.on.error?.(event.message); }
    };
    socket.onclose = () => {
      this.ready = false;
      if (!this.running || this.failed) return;
      // sessions end (an hour at most, or a network blip): open a new one, a little later each time
      this.retry = Math.min(this.retry + 1, 5);
      setTimeout(() => this.running && this.connect(), 500 * 2 ** this.retry);
    };
  }

  stop() {
    this.running = false;
    try { this.socket?.send('{"type":"stop"}'); } catch { /* closed already */ }
    this.socket?.close();
    this.stream?.getTracks().forEach((track) => track.stop());
    this.audio?.close();
  }
}

// ---------------------------------------------------------------- the mouth
export class Mouth {
  constructor({ lang = "fr", serverVoice = false, browserVoice = null, onLevel = () => {} } = {}) {
    Object.assign(this, { lang, serverVoice, browserVoice, onLevel });
    this.cache = new Map(); // sentence → its audio, fetched ahead while the previous one plays
  }

  /** Called during a tap: browsers only let audio start after one. */
  unlock() {
    this.audio ??= new AudioContext();
    this.audio.resume();
  }

  /** Ask for a sentence's audio now, so it is ready when its turn comes. */
  prefetch(text) {
    if (!this.serverVoice || this.cache.has(text)) return;
    // resolves to the audio, or to null when Voxtral could not say it (never rejects: it may be dropped unheard)
    this.cache.set(text, fetch("/api/tts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text, language: this.lang }) })
      .then((r) => {
        if (r.status === 503) this.serverVoice = false; // the server has no voice: the browser speaks from now on
        return r.ok ? r.arrayBuffer() : null; // one refused sentence: the browser says just that one
      })
      .catch(() => null));
  }

  /** Speak one sentence; resolves when it has been said (or stopped). */
  async speak(text) {
    if (this.serverVoice) {
      this.prefetch(text);
      const bytes = await this.cache.get(text);
      this.cache.delete(text);
      if (bytes) {
        try { return await this.play(bytes); } catch { /* undecodable: the browser says it instead */ }
      }
    }
    return this.speakInBrowser(text);
  }

  async play(bytes) {
    this.audio ??= new AudioContext();
    await this.audio.resume();
    const buffer = await this.audio.decodeAudioData(bytes);
    const source = this.audio.createBufferSource();
    const analyser = this.audio.createAnalyser();
    analyser.fftSize = 256;
    source.buffer = buffer;
    source.connect(analyser).connect(this.audio.destination);
    this.source = source;
    const samples = new Uint8Array(analyser.fftSize);
    let playing = true;
    const meter = () => { // the orb swells with her voice
      if (!playing) return;
      analyser.getByteTimeDomainData(samples);
      let sum = 0;
      for (const v of samples) sum += ((v - 128) / 128) ** 2;
      this.onLevel(Math.min(1, Math.sqrt(sum / samples.length) * 4));
      requestAnimationFrame(meter);
    };
    return new Promise((done) => {
      source.onended = () => { playing = false; this.onLevel(0); done(); };
      source.start();
      meter();
    });
  }

  speakInBrowser(text) {
    if (!("speechSynthesis" in window)) return new Promise((done) => setTimeout(done, 900 + 45 * text.length));
    return new Promise((done) => {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = this.lang === "fr" ? "fr-FR" : "en-US";
      const voice = this.browserVoice?.();
      if (voice) utterance.voice = voice;
      utterance.rate = 1.02;
      utterance.pitch = 1.05;
      utterance.onend = done;
      utterance.onerror = done;
      utterance.onboundary = () => { this.onLevel(0.6); setTimeout(() => this.onLevel(0), 120); };
      speechSynthesis.resume(); // Chrome can leave the queue paused
      speechSynthesis.speak(utterance);
    });
  }

  stop() {
    try { this.source?.stop(); } catch { /* not started */ }
    if ("speechSynthesis" in window) speechSynthesis.cancel();
    this.cache.clear();
    this.onLevel(0);
  }
}
