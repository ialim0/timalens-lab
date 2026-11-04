// Tima, the lab's voice guide. She listens live with Muse Voice Transcribe (realtime, through
// the server) and wakes up on "Hey Tima"; she speaks with Voxtral when the server has a voice,
// else with the browser's. After she answers she keeps listening a few seconds, so the
// student can simply reply. What she says about the circuit comes from the engine's solution
// or from the lab's own text: she never invents a number. Answers come from the tutor (Muse Spark).
import { LiveEars, Mouth } from "./voice.js";

const PREFERRED_VOICES = {
  fr: [/premium|enhanced|natural|neural/i, /amélie|audrey|aurélie|marie/i, /google français/i, /thomas/i],
  en: [/premium|enhanced|natural|neural/i, /samantha|ava|allison|zoe|serena/i, /google us english/i, /karen|daniel|moira/i],
};
// "Hey Tima" as speech recognisers tend to write it, in French and English, without accents
const WAKE = /\b(?:hey|he|hei|eh|ok|dis|hi|allo)?[\s,]*(?:t[iy]h?m+(?:a|ah|as|ha|e|er)|tina|teema|thema|tema|dima|tim a|time a|team a)\b[\s,.!?]*/;
const plain = (text) => text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""); // same length as the input
/** Did the microphone just pick up her own voice? Most of the words heard are in what she is saying. */
function echoes(heard, line) {
  const words = plain(heard).match(/[a-z0-9]+/g) ?? [];
  const hers = new Set(plain(line).match(/[a-z0-9]+/g) ?? []);
  return words.length > 0 && words.filter((w) => hers.has(w)).length / words.length >= 0.6;
}
const MUTE_KEY = "tima-muted";

const EYE = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>`;
const ICONS = {
  on: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5L6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/></svg>`,
  off: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5L6 9H3v6h3l5 4z"/><path d="M22 9l-6 6M16 9l6 6"/></svg>`,
};

/** Sentences, spoken one at a time: browsers cut long utterances, and captions read better. */
export const sentences = (text) => String(text ?? "").replace(/\s+/g, " ").trim().split(/(?<=[.!?…])\s+/).filter(Boolean);
const firstSentence = (text) => sentences(text)[0] ?? "";
const pick = (list) => list[Math.floor(Math.random() * list.length)];

function pickVoice(lang) {
  if (!("speechSynthesis" in window)) return null;
  const voices = speechSynthesis.getVoices().filter((v) => v.lang?.toLowerCase().startsWith(lang));
  for (const pattern of PREFERRED_VOICES[lang] ?? []) {
    const voice = voices.find((v) => pattern.test(v.name));
    if (voice) return voice;
  }
  return voices[0] ?? null;
}

// ---------------------------------------------------------------- what Tima says
const LINES = {
  fr: {
    welcome: (lab, n) => `Bonjour, je suis Tima, ton guide. Bienvenue dans « ${lab.title} ». ${firstSentence(lab.summary)} Tu as ${n} missions. Choisis la première quand tu veux. Et si tu as une question, dis simplement : Hey Tima.`,
    missions: (n) => `${n} missions · guidé par Tima`,
    activity: (a) => `Mission : ${a.title}.`,
    step: (s) => (s.kind === "predict" ? `${s.question} Choisis ta réponse.` : s.kind === "measure" ? `${s.instruction} Je note chaque point pour toi.` : s.instruction ?? s.question ?? ""),
    right: (why) => `Exact ! ${why ?? ""}`,
    wrong: (why) => `Pas tout à fait. ${why ?? ""}`,
    praise: () => pick(["Bien joué.", "Parfait, on continue.", "Super !"]),
    first_point: "Je note ce point. Change encore la valeur, je trace la courbe.",
    takeaway: (x) => (x ? `À retenir : ${x}` : ""),
    mission_done: "Mission accomplie ! Choisis la suivante.",
    challenge: (c) => `Défi : ${c.statement}`,
    success: "Bravo, défi réussi !",
    short: "Attention, court-circuit ! Rien ne freine le courant. Ajoute une résistance ou une lampe.",
    burnt: (id) => `Oups, ${id} a grillé : trop de courant. Augmente la résistance, puis répare-la.`,
    lit: (name, id) => `${name} ${id} s'allume !`,
    hint: (h) => `Un petit indice : ${h}`,
  },
  en: {
    welcome: (lab, n) => `Hi, I'm Tima, your lab guide. Welcome to “${lab.title}”. ${firstSentence(lab.summary)} You have ${n} missions. Pick the first one whenever you like. And if you have a question, just say: Hey Tima.`,
    missions: (n) => `${n} missions · guided by Tima`,
    activity: (a) => `Mission: ${a.title}.`,
    step: (s) => (s.kind === "predict" ? `${s.question} Pick your answer.` : s.kind === "measure" ? `${s.instruction} I'll record every point for you.` : s.instruction ?? s.question ?? ""),
    right: (why) => `Right! ${why ?? ""}`,
    wrong: (why) => `Not quite. ${why ?? ""}`,
    praise: () => pick(["Nice work.", "Perfect, let's keep going.", "Great!"]),
    first_point: "Got that point. Change the value again and I'll draw the curve.",
    takeaway: (x) => (x ? `Key idea: ${x}` : ""),
    mission_done: "Mission complete! Pick the next one.",
    challenge: (c) => `Challenge: ${c.statement}`,
    success: "Well done, challenge complete!",
    short: "Careful, short circuit! Nothing is limiting the current. Add a resistor or a bulb.",
    burnt: (id) => `Oops, ${id} burnt out: too much current. Raise the resistance, then repair it.`,
    lit: (name, id) => `${name} ${id} lights up!`,
    hint: (h) => `A little hint: ${h}`,
  },
};
export const lines = (lang) => LINES[lang] ?? LINES.en;

// ---------------------------------------------------------------- Tima
const FOLLOW_UP_MS = 8000; // after an answer, she listens without needing her name

export class Tima {
  /** root: the element she lives in. onAsk(question) answers a question; onLook() asks what
   *  she sees; onSentence(line) runs as she starts each sentence (to light up the parts she
   *  names). live: what the server offers, { ears: Meta's realtime ears?, voice: "voxtral" | "browser" }. */
  constructor(root, { lang = "fr", t = {}, onAsk = () => {}, onLook = null, onSentence = () => {}, live = {} } = {}) {
    Object.assign(this, { root, lang, t, onAsk, onLook, onSentence });
    this.queue = [];
    this.epoch = 0; // bumped by hush(): a cancelled sentence must not start the next one
    this.speaking = false;
    this.ready = false; // browsers only let a page speak after a tap
    this.wakeOn = false;
    this.awake = false;
    this.liveEars = Boolean(live.ears);
    this.Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null;
    try { this.muted = localStorage.getItem(MUTE_KEY) === "1"; } catch { this.muted = false; }
    if ("speechSynthesis" in window) {
      this.voice = pickVoice(lang);
      speechSynthesis.addEventListener?.("voiceschanged", () => { this.voice = pickVoice(this.lang); });
    }
    this.mouth = new Mouth({ lang, serverVoice: live.voice === "voxtral", browserVoice: () => this.voice, onLevel: (x) => this.level(x) });

    root.classList.add("tima");
    root.innerHTML = `<div class="tima-controls">
        <button type="button" class="tima-ctl" data-act="mute" aria-label="${t.tima_mute ?? "Sound"}"></button>
        ${this.liveEars || this.Recognition ? `<button type="button" class="tima-ctl wake" data-act="wake" aria-pressed="false">Hey Tima</button>` : ""}
        ${onLook ? `<button type="button" class="tima-ctl look" data-act="look">${EYE} ${t.tima_look ?? "Look"}</button>` : ""}
      </div>
      <div class="tima-ear" hidden></div>
      <button type="button" class="tima-orb" data-act="orb" aria-label="Tima"><span class="tima-ring"></span><span class="tima-core"></span></button>
      <div class="tima-bubble" hidden aria-live="polite"></div>`;
    this.bubble = root.querySelector(".tima-bubble");
    this.ear = root.querySelector(".tima-ear");
    this.orb = root.querySelector(".tima-orb");
    root.addEventListener("click", (e) => {
      const act = e.target.closest("[data-act]")?.dataset.act;
      if (act === "orb") this.tap();
      else if (act === "mute") this.setMuted(!this.muted);
      else if (act === "wake") this.toggleWake();
      else if (act === "look") this.onLook?.();
    });
    this.showMuted();
  }

  /** Called from the tap that opens the lab, so the browser lets her speak. */
  start({ quiet = false } = {}) {
    this.ready = true;
    this.mouth.unlock();
    if (quiet) this.setMuted(true);
  }

  /** Queue words to say. followUp: once said, she listens for a reply without her name. */
  say(text, { interrupt = false, followUp = false } = {}) {
    const parts = sentences(text);
    if (!this.ready) return;
    if (followUp && !parts.length && !this.speaking) { this.attend(FOLLOW_UP_MS, { quiet: true }); return; }
    if (followUp) this.followUp = true;
    if (!parts.length) return;
    if (interrupt) this.hush();
    this.queue.push(...parts);
    if (!this.speaking) this.next();
    else if (!this.muted) this.mouth.prefetch(this.queue[0]);
  }

  hush() {
    this.epoch += 1;
    this.queue = [];
    this.followUp = false;
    clearTimeout(this.timer);
    this.cut?.();
    this.mouth.stop();
    this.speaking = false;
    this.mark("speaking", false);
  }

  async next() {
    const line = this.queue.shift();
    if (!line) {
      this.speaking = false;
      this.mark("speaking", false);
      this.line = "";
      this.onSentence("");
      if (this.followUp) { this.followUp = false; this.attend(FOLLOW_UP_MS, { quiet: true }); }
      clearTimeout(this.hideTimer);
      this.hideTimer = setTimeout(() => { if (!this.speaking && !this.awake) this.bubble.hidden = true; }, 4500);
      return;
    }
    this.speaking = true;
    this.mark("speaking", true);
    this.heardSelf = `${this.line ?? ""} ${line}`; // her last words: the microphone may still be picking them up
    this.line = line;
    this.show(line);
    this.onSentence(line);
    const epoch = this.epoch;
    if (this.queue[0] && !this.muted) this.mouth.prefetch(this.queue[0]); // the next sentence is fetched while this one plays
    if (this.muted) await new Promise((done) => { this.cut = done; this.timer = setTimeout(done, 900 + 45 * line.length); }); // captions only
    else await this.mouth.speak(line);
    if (epoch === this.epoch) this.next();
  }

  /** Tapping the orb stops her if she is talking; otherwise it means "I'm talking to you". */
  async tap() {
    if (this.speaking) { this.hush(); return; }
    if (this.awake) { this.sleep(); return; }
    if (!this.wakeOn) await this.toggleWake(true);
    if (this.wakeOn) this.attend(9000);
  }

  /** Listen for a question, without waiting for her name, for `ms`. */
  attend(ms, { quiet = false } = {}) {
    if (!this.wakeOn) return;
    this.awake = true;
    this.mark("listening", true);
    if (!quiet) { this.chime(); this.show(this.t.tima_listening); }
    clearTimeout(this.sleepTimer);
    this.sleepTimer = setTimeout(() => this.sleep(), ms);
  }

  think(on) {
    this.mark("thinking", on);
    if (on) this.show("…");
  }

  /** She looks at the bench (Muse Spark's vision): the orb's eye opens. */
  look(on) {
    this.mark("looking", on);
    if (on) this.show(this.t.tima_looking ?? "…");
  }

  setMuted(muted) {
    this.muted = muted;
    try { localStorage.setItem(MUTE_KEY, muted ? "1" : "0"); } catch { /* private window */ }
    if (muted) this.mouth.stop(); // the captions carry on
    this.showMuted();
  }

  // ---------------------------------------------------------------- ears
  /** Turn her ears on or off: Meta's realtime ears when the server has them, else the browser's. */
  async toggleWake(on = !this.wakeOn) {
    if (!on) {
      this.wakeOn = false;
      this.sleep();
      this.ears?.stop();
      this.ears = null;
      try { this.rec?.abort(); } catch { /* already stopped */ }
      this.rec = null;
      this.showWake();
      return;
    }
    if (this.wakeOn) return;
    this.wakeOn = true;
    this.showWake();
    if (this.liveEars) {
      this.ears = new LiveEars({ lang: this.lang, on: {
        ready: () => this.mark("ear", true),
        partial: (text) => this.hear(text, false),
        final: (text) => this.hear(text, true),
        level: (x) => { if (this.awake && !this.speaking) this.level(x); }, // the orb swells with the student's voice
        error: (message) => { console.warn("Meta's realtime ears:", message); this.fallBackToBrowserEars(); },
      } });
      try { await this.ears.start(); } catch { this.toggleWake(false); this.show(this.t.tima_mic_blocked); }
      return;
    }
    this.startBrowserEars();
  }

  fallBackToBrowserEars() {
    this.ears?.stop();
    this.ears = null;
    this.mark("ear", false);
    this.liveEars = false;
    if (this.Recognition && this.wakeOn) this.startBrowserEars();
    else { this.toggleWake(false); this.show(this.t.tima_no_network); }
  }

  startBrowserEars() {
    if (!this.Recognition) { this.toggleWake(false); return; }
    const rec = new this.Recognition();
    rec.lang = this.lang === "fr" ? "fr-FR" : "en-US";
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 3;
    rec.onstart = () => { this.hearing = true; this.mark("ear", true); };
    rec.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) this.hear(e.results[i][0].transcript, e.results[i].isFinal, [...e.results[i]].map((alt) => alt.transcript));
    };
    rec.onerror = (e) => {
      if (["not-allowed", "service-not-allowed", "audio-capture"].includes(e.error)) { this.toggleWake(false); this.show(this.t.tima_mic_blocked); }
      else if (e.error === "network") { this.toggleWake(false); this.show(this.t.tima_no_network); }
    };
    rec.onend = () => { // browsers stop after a silence: start again
      this.hearing = false;
      this.mark("ear", false);
      if (this.wakeOn && this.rec === rec) setTimeout(() => { try { if (this.wakeOn && this.rec === rec) rec.start(); } catch { /* listening */ } }, 300);
    };
    this.rec = rec;
    try { rec.start(); } catch { /* already listening */ }
  }

  /** What her ears caught: `text` so far in this sentence (final once the student stops). */
  hear(text, isFinal, alternatives = [text]) {
    // any alternative may hold her name: recognisers often write it as another word
    const said = alternatives.find((alt) => WAKE.test(plain(alt))) ?? text;
    const match = WAKE.exec(plain(said));
    if (!this.awake) this.overhear(text);
    if (!this.awake && match) {
      if (this.speaking && echoes(said, this.heardSelf)) return; // that was her own voice
      this.hush();
      this.overhear("");
      this.attend(9000, { quiet: true });
      this.chime();
      if (!said.slice(match.index + match[0].length).trim()) this.say(this.t.tima_yes ?? "?"); // "Oui ?": she heard
    }
    if (!this.awake) return;
    const question = (match ? said.slice(match.index + match[0].length) : text).trim();
    if (this.speaking && question && echoes(question, this.heardSelf)) return; // her own "Oui ?"
    if (question) { this.show(question); if (this.speaking) this.hush(); } // live: the words appear as they are said; she stops to listen
    if (isFinal && question.length > 2) { this.sleep(); this.onAsk(question); }
  }

  /** What her ears pick up, faintly, under the orb: proof that she is listening. */
  overhear(text) {
    clearTimeout(this.earTimer);
    this.ear.textContent = text ? `« ${text.trim().slice(-60)} »` : "";
    this.ear.hidden = !text;
    if (text) this.earTimer = setTimeout(() => { this.ear.hidden = true; }, 2200);
  }

  sleep() {
    this.awake = false;
    clearTimeout(this.sleepTimer);
    this.mark("listening", false);
    this.level(0);
  }

  // ---------------------------------------------------------------- looks and sounds
  show(text) {
    clearTimeout(this.hideTimer);
    this.bubble.textContent = text;
    this.bubble.hidden = false;
    this.bubble.animate?.([{ opacity: 0.4, transform: "translateY(4px)" }, { opacity: 1, transform: "none" }], { duration: 220, easing: "ease-out" });
  }
  level(x) { this.orb.style.setProperty("--level", x.toFixed(3)); }
  mark(name, on) { this.root.classList.toggle(name, on); }
  showMuted() {
    const b = this.root.querySelector('[data-act="mute"]');
    b.innerHTML = this.muted ? ICONS.off : ICONS.on;
    b.setAttribute("aria-pressed", String(this.muted));
  }
  showWake() {
    this.root.querySelector('[data-act="wake"]')?.setAttribute("aria-pressed", String(this.wakeOn));
    this.mark("wake-on", this.wakeOn);
    if (!this.wakeOn) this.mark("ear", false);
  }
  /** A soft rising two-note chime: "I'm listening". */
  chime() {
    if (this.muted) return;
    try {
      const ctx = (this.sound ??= new AudioContext());
      const osc = ctx.createOscillator(), gain = ctx.createGain(), now = ctx.currentTime;
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.exponentialRampToValueAtTime(1320, now + 0.12);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.12, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.32);
    } catch { /* no Web Audio */ }
  }
}
