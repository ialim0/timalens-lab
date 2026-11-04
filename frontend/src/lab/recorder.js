// Recording a whole lab session, as the student lived it: the lab's tab (the bench, Tima, the
// missions), the student's face in a round inset, and every sound (Tima's voice from the tab,
// mixed with the microphone). It all stays in the browser until the student downloads the video.
// The browser asks which tab to share (preferring this one): no page can film the screen without it.

const FPS = 30;
const MAX_WIDTH = 1920;
const TYPES = ["video/mp4;codecs=avc1,mp4a.40.2", "video/mp4", "video/webm;codecs=vp9,opus", "video/webm"];

/** The latest frame of a stream's video, to draw on a canvas: { frame, width, height, stop() }.
 *  Where the browser can (Chrome, Edge), frames are read straight from the track. A <video>
 *  element is only the fallback: browsers pause muted, unseen videos to save power, which once
 *  froze a whole recording on its first second. */
function frames(stream) {
  const track = stream.getVideoTracks()[0];
  if (typeof MediaStreamTrackProcessor !== "undefined") {
    const reader = new MediaStreamTrackProcessor({ track }).readable.getReader();
    const latest = { frame: null, width: 0, height: 0, stop: () => { reader.cancel().catch(() => {}); latest.frame?.close(); } };
    (async () => {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        latest.frame?.close();
        Object.assign(latest, { frame: value, width: value.displayWidth, height: value.displayHeight });
      }
    })().catch(() => {});
    return latest;
  }
  const video = Object.assign(document.createElement("video"), { srcObject: stream, muted: true, playsInline: true });
  Object.assign(video.style, { position: "fixed", left: "0", bottom: "0", width: "4px", height: "4px", opacity: "0.01", pointerEvents: "none" });
  document.body.append(video);
  video.play().catch(() => {}); // play(), not autoplay: autoplaying muted videos are paused when unseen
  return {
    get frame() { return video.readyState >= 2 ? video : null; },
    get width() { return video.videoWidth; },
    get height() { return video.videoHeight; },
    stop: () => video.remove(),
  };
}

export class SessionRecorder {
  /** camera(): a webcam stream already open (hand mode's), or null to open one. */
  constructor({ camera = () => null } = {}) {
    this.camera = camera;
  }

  get recording() { return this.recorder?.state === "recording"; }
  get seconds() { return this.startedAt ? (performance.now() - this.startedAt) / 1000 : 0; }

  async start() {
    this.display = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: FPS, displaySurface: "browser" }, audio: true,
      preferCurrentTab: true, selfBrowserSurface: "include", surfaceSwitching: "exclude", systemAudio: "include",
    });
    const shared = this.camera();
    this.face = shared ?? (await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } }).catch(() => null));
    this.ownFace = !shared && Boolean(this.face); // a camera we opened, we close
    this.mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }).catch(() => null);

    const screen = frames(this.display);
    const face = this.face ? frames(this.face) : null;
    this.sources = [screen, face].filter(Boolean);
    const settings = this.display.getVideoTracks()[0].getSettings();
    const scale = Math.min(1, MAX_WIDTH / (settings.width || 1280));
    const canvas = Object.assign(document.createElement("canvas"), {
      width: Math.round((settings.width || 1280) * scale), height: Math.round((settings.height || 720) * scale),
    });
    const g = canvas.getContext("2d");
    const draw = () => { // the screen, then the student's face in a round inset at the bottom left
      // drawn every tick, whatever happens: a canvas left untouched sends no frames, and then the
      // recorder writes nothing at all, not even the sound
      if (screen.frame) g.drawImage(screen.frame, 0, 0, canvas.width, canvas.height);
      else { g.fillStyle = "#0b1530"; g.fillRect(0, 0, canvas.width, canvas.height); }
      if (face?.frame && face.width) {
        const r = Math.round(canvas.height * 0.14), cx = r + 24, cy = canvas.height - r - 24;
        const side = Math.min(face.width, face.height);
        g.save();
        g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.clip();
        g.translate(cx + r, cy - r); g.scale(-1, 1); // a mirror, as the student sees themselves
        g.drawImage(face.frame, (face.width - side) / 2, (face.height - side) / 2, side, side, 0, 0, 2 * r, 2 * r);
        g.restore();
        g.lineWidth = 5; g.strokeStyle = "#3ad1ff";
        g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke();
      }
    };
    // each drawn picture is sent as a frame at once: not waiting for the browser to repaint the canvas
    const picture = canvas.captureStream(0).getVideoTracks()[0];
    this.timer = setInterval(() => { draw(); picture.requestFrame?.(); }, 1000 / FPS); // not requestAnimationFrame: it keeps going if the tab is busy

    this.audio = new AudioContext();
    const mix = this.audio.createMediaStreamDestination();
    for (const source of [this.display, this.mic]) {
      if (source?.getAudioTracks().length) this.audio.createMediaStreamSource(source).connect(mix);
    }
    const stream = new MediaStream([picture, ...mix.stream.getAudioTracks()]);
    this.type = TYPES.find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
    this.chunks = [];
    this.recorder = new MediaRecorder(stream, { mimeType: this.type || undefined, videoBitsPerSecond: 5_000_000 });
    this.recorder.ondataavailable = (e) => { if (e.data.size) this.chunks.push(e.data); };
    this.recorder.start(1000);
    this.startedAt = performance.now();
    this.display.getVideoTracks()[0].addEventListener("ended", () => this.onEnded?.()); // the student stopped sharing
  }

  /** Stop, and hand back the video: { blob, extension, seconds }. */
  stop() {
    const seconds = this.seconds;
    return new Promise((done) => {
      this.recorder.onstop = () => {
        clearInterval(this.timer);
        this.sources.forEach((source) => source.stop());
        for (const stream of [this.display, this.mic, this.ownFace ? this.face : null]) stream?.getTracks().forEach((track) => track.stop());
        this.audio.close();
        const type = this.recorder.mimeType || this.type || "video/webm";
        done({ blob: new Blob(this.chunks, { type }), extension: type.includes("mp4") ? "mp4" : "webm", seconds });
      };
      this.recorder.stop();
    });
  }
}
