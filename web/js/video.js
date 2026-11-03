// The video of a lab session, rendered from its event log (session.js).
//
// Every frame is a pure function of (session, time). The circuit at that moment is solved
// again by the same engine, drawn by the same code as the bench (board.js, or bench3d.js for
// the 3D view), with captions for what the student did. Frames are encoded with WebCodecs
// into an MP4 (H.264, so it plays in WhatsApp and on any phone), faster than real time. A
// browser without WebCodecs records the same frames with MediaRecorder instead.
import { format, normalise, solve } from "./circuit.js";
import { LIGHT, boardSvg, chargeAt, chargePaths, px, standaloneSvg } from "./board.js";
import { ArrayBufferTarget, Muxer } from "../vendor/mp4-muxer/mp4-muxer.mjs";

const FPS = 24, W = 1280, H = 720;
const AREA = { x: 24, y: 84, w: 800, h: 590 }; // the circuit
const PANEL = { x: 848, y: 84, w: 408, h: 590 }; // what is happening
const C = { ...LIGHT, ground: "#f3f5f9", card: "#ffffff", line: "#dde2ec", ok: "#1f9456", okBg: "#e3f3ea", warnBg: "#fdecea", tutorBg: "#e7f0ff" };
const LOGO = new URL("../img/timalens-logo.png", import.meta.url).href;

// ---------------------------------------------------------------- the timeline
/** The session as segments of video: each with a duration and what to show. */
export function timeline(session, lab, t) {
  const segments = [];
  const state = { components: null, mode: null, measures: [], view: "2d" };
  const push = (dur, extra = {}) => segments.push({ dur, components: state.components, mode: state.mode, measures: [...state.measures], ...extra });
  const events = session.events;
  const first = events.find((e) => e.components);
  state.components = first?.components ?? [];
  push(3, { card: "intro" });
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    if (e.components && (e.kind === "circuit" || e.kind === "start")) {
      // a run of changes (a slider dragged) plays as one quick sequence
      const run = [];
      while (i < events.length && events[i].components && (events[i].kind === "circuit" || events[i].kind === "start")) run.push(events[i++].components);
      i--;
      // the circuit a new activity or challenge starts from shows under that activity's title
      const next = events[i + 1];
      if (next?.kind === "mode") state.mode = next.title ? { kind: next.mode, title: next.title, text: next.text } : null;
      const dur = Math.min(4, 0.5 + 0.28 * run.length);
      segments.push({ dur, run, mode: state.mode, measures: [...state.measures] });
      state.components = run.at(-1);
      continue;
    }
    if (e.kind === "mode") {
      state.mode = e.title ? { kind: e.mode, title: e.title, text: e.text } : null;
      if (e.components) state.components = e.components;
      if (state.mode) push(3, { caption: { title: e.mode === "challenge" ? t.challenge_label : t.experiment_label, text: e.title } });
    } else if (e.kind === "predict") {
      push(3.5, { caption: { title: t.predict, text: `${e.question}\n→ ${e.choice}  ${e.right ? "✓" : "✗"}`, tone: e.right ? "ok" : "warn" } });
    } else if (e.kind === "measure") {
      state.measures.push(e);
      push(2, { caption: { title: `${t.measure_label} ${state.measures.length}`, text: `${e.part} : U = ${format(e.U, "V")} · I = ${format(e.I, "A")}` } });
    } else if (e.kind === "success") {
      push(3, { success: e.title });
    } else if (e.kind === "tutor") {
      push(7, { caption: { title: t.tutor, text: `« ${clip(e.q, 120)} »\n${clip(e.a, 300)}`, tone: "tutor" } });
    } else if (e.kind === "quiz") {
      push(1.8, { caption: { title: t.quiz, text: `${clip(e.question, 120)}  ${e.right ? "✓" : "✗"}`, tone: e.right ? "ok" : "warn" } });
    } else if (e.kind === "view") {
      state.view = e.view;
    }
  }
  push(6, { card: "report", summary: session.summary });
  let start = 0;
  for (const s of segments) { s.start = start; start += s.dur; }
  return { segments, duration: start };
}
/** A session's length as people say it: "45 s", "3 min". */
export const duration = (seconds = 0) => (seconds < 60 ? `${Math.round(seconds)} s` : `${Math.round(seconds / 60)} min`);
const clip = (s, n) => (String(s ?? "").length > n ? `${String(s).slice(0, n - 1)}…` : String(s ?? ""));

// ---------------------------------------------------------------- drawing a frame
function wrap(g, text, maxWidth, maxLines = 99) {
  const lines = [];
  for (const paragraph of String(text).split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (g.measureText(next).width > maxWidth && line) { lines.push(line); line = word; } else line = next;
    }
    lines.push(line);
  }
  if (lines.length > maxLines) { lines.length = maxLines; lines[maxLines - 1] += " …"; }
  return lines;
}
function box(g, x, y, w, h, r, fill, stroke) {
  g.beginPath(); g.roundRect(x, y, w, h, r);
  if (fill) { g.fillStyle = fill; g.fill(); }
  if (stroke) { g.strokeStyle = stroke; g.lineWidth = 1.5; g.stroke(); }
}
const font = (weight, size) => `${weight} ${size}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;

function plot(g, measures, x, y, w, h, t) {
  box(g, x, y, w, h, 12, C.ground);
  if (!measures.length) return;
  const m = 34;
  const maxI = Math.max(...measures.map((r) => r.I), 1e-6) * 1.15, maxU = Math.max(...measures.map((r) => r.U), 1e-6) * 1.15;
  const X = (i) => x + m + (i / maxI) * (w - m - 14), Y = (u) => y + h - m - (u / maxU) * (h - m - 14);
  g.strokeStyle = C.muted; g.lineWidth = 1.2;
  g.beginPath(); g.moveTo(x + m, y + 10); g.lineTo(x + m, y + h - m); g.lineTo(x + w - 8, y + h - m); g.stroke();
  g.fillStyle = C.muted; g.font = font(600, 13);
  g.textAlign = "left"; g.fillText("U (V)", x + 8, y + 20);
  g.textAlign = "right"; g.fillText("I", x + w - 10, y + h - m + 20);
  const sII = measures.reduce((s, r) => s + r.I * r.I, 0), sUI = measures.reduce((s, r) => s + r.U * r.I, 0);
  const R = sII > 0 ? sUI / sII : 0;
  if (measures.length >= 2 && R > 0) {
    g.setLineDash([7, 5]); g.strokeStyle = C.accent; g.lineWidth = 2.2;
    g.beginPath(); g.moveTo(X(0), Y(0)); g.lineTo(X(maxI), Y(R * maxI)); g.stroke(); g.setLineDash([]);
    g.fillStyle = C.accent; g.font = font(700, 16); g.textAlign = "right"; g.fillText(`${t.slope} ≈ ${R.toFixed(0)} Ω`, x + w - 12, y + 24);
  }
  g.fillStyle = C.blue;
  for (const r of measures) { g.beginPath(); g.arc(X(r.I), Y(r.U), 5.5, 0, Math.PI * 2); g.fill(); }
}

class Painter {
  constructor(lab, t, view) {
    this.lab = lab; this.t = t; this.view = view;
    this.canvas = Object.assign(document.createElement("canvas"), { width: W, height: H });
    this.g = this.canvas.getContext("2d");
    this.circuits = new Map(); // snapshot → solved, drawn board
  }
  async init() {
    this.logo = new Image();
    this.logo.src = LOGO;
    try { await this.logo.decode(); } catch { this.logo = null; } // the title is drawn as text instead
    if (this.view === "3d") {
      const { Bench3D } = await import("./bench3d.js");
      this.glCanvas = document.createElement("canvas");
      this.bench = new Bench3D(this.glCanvas, { interactive: false, quality: "high", margin: 1.1 }); // room for the camera's orbit
      this.bench.renderer.setPixelRatio(1);
      this.bench.resize(AREA.w, AREA.h);
    }
  }
  async circuit(snapshot) {
    const key = JSON.stringify(snapshot);
    if (this.circuits.has(key)) return this.circuits.get(key);
    const components = snapshot.map((c) => normalise({ ...c }));
    const solution = solve(components);
    const entry = { key, components, solution, charges: chargePaths(components, solution) };
    if (this.view === "2d") {
      const content = boardSvg({ components, solution, t: this.t });
      const [vx, vy, vw, vh] = content.viewBox;
      const scale = Math.min(AREA.w / vw, AREA.h / vh);
      entry.fit = { vx, vy, scale, ox: AREA.x + (AREA.w - vw * scale) / 2, oy: AREA.y + (AREA.h - vh * scale) / 2, w: vw * scale, h: vh * scale };
      const url = URL.createObjectURL(new Blob([standaloneSvg(content, Math.round(vw * scale), Math.round(vh * scale))], { type: "image/svg+xml" }));
      entry.image = new Image();
      entry.image.src = url;
      await entry.image.decode();
      URL.revokeObjectURL(url);
    }
    this.circuits.set(key, entry);
    return entry;
  }

  async frame(seg, local, time, progress) {
    const { g, t } = this;
    g.fillStyle = C.ground; g.fillRect(0, 0, W, H);
    // header
    if (seg.card !== "intro") { // the intro card shows the logo large
      this.brand(24, 22, 32);
      g.fillStyle = C.ink; g.font = font(600, 20); g.textAlign = "right"; g.fillText(clip(this.lab.title, 70), W - 24, 48);
    }

    if (seg.card) { this.card(seg, local); this.progress(progress); return; }

    const snapshot = seg.run ? seg.run[Math.min(seg.run.length - 1, Math.floor((local / seg.dur) * seg.run.length))] : seg.components;
    const circuit = await this.circuit(snapshot ?? []);
    box(g, AREA.x, AREA.y, AREA.w, AREA.h, 16, this.view === "3d" ? "#e9e4da" : C.board, C.line);
    if (this.view === "3d") {
      if (this.bench.shown !== circuit.key) { this.bench.update(circuit.components, circuit.solution, { t }); this.bench.shown = circuit.key; }
      this.bench.orbit(0.32 * Math.sin(time * 0.22), 0.95);
      this.bench.frame(time);
      g.save(); g.beginPath(); g.roundRect(AREA.x, AREA.y, AREA.w, AREA.h, 16); g.clip();
      g.drawImage(this.glCanvas, AREA.x, AREA.y, AREA.w, AREA.h); g.restore();
    } else {
      const f = circuit.fit;
      g.drawImage(circuit.image, f.ox, f.oy, f.w, f.h);
      for (const ch of circuit.charges) {
        const u = chargeAt(ch, time), [ax, ay] = px(ch.a), [bx, by] = px(ch.b);
        g.fillStyle = ch.shorted ? C.danger : "#f2b705";
        g.beginPath(); g.arc(f.ox + (ax + (bx - ax) * u - f.vx) * f.scale, f.oy + (ay + (by - ay) * u - f.vy) * f.scale, 4.2 * Math.max(0.8, f.scale), 0, Math.PI * 2); g.fill();
      }
    }
    if (circuit.solution.shorted) this.banner(t.short, C.danger);
    else if (seg.success) this.banner(`✓ ${t.success} ${seg.success}`, C.ok, Math.min(1, local / 0.3));
    this.panel(seg, circuit, local);
    this.progress(progress);
  }

  /** The TimaLens logo, then "Lab" in a blue pill, from (x, y), height h. */
  brand(x, y, h) {
    const { g } = this;
    let right = x;
    if (this.logo) { const w = (this.logo.naturalWidth / this.logo.naturalHeight) * h; g.drawImage(this.logo, x, y, w, h); right = x + w; }
    else { g.fillStyle = C.ink; g.font = font(800, h * 0.75); g.textAlign = "left"; g.fillText("TimaLens", x, y + h * 0.8); right = x + g.measureText("TimaLens").width; }
    g.font = font(800, h * 0.62);
    const pw = g.measureText("Lab").width + h * 0.5;
    box(g, right + h * 0.3, y + h * 0.08, pw, h * 0.84, h * 0.2, "#e3edff");
    g.fillStyle = C.accent; g.textAlign = "left"; g.fillText("Lab", right + h * 0.3 + h * 0.25, y + h * 0.72);
  }

  banner(text, colour, alpha = 1) {
    const { g } = this;
    g.globalAlpha = alpha;
    g.font = font(800, 24);
    const w = Math.min(AREA.w - 40, g.measureText(text).width + 48);
    box(g, AREA.x + (AREA.w - w) / 2, AREA.y + 18, w, 52, 12, colour);
    g.fillStyle = "#fff"; g.textAlign = "center"; g.fillText(clip(text, 60), AREA.x + AREA.w / 2, AREA.y + 53);
    g.globalAlpha = 1;
  }

  panel(seg, circuit, local) {
    const { g, t } = this;
    let y = PANEL.y;
    box(g, PANEL.x, PANEL.y, PANEL.w, PANEL.h, 16, C.card, C.line);
    const x = PANEL.x + 20, w = PANEL.w - 40;
    y += 36;
    if (seg.mode) {
      g.fillStyle = C.muted; g.font = font(700, 13); g.textAlign = "left";
      g.fillText((seg.mode.kind === "challenge" ? t.challenge_label : t.experiment_label).toUpperCase(), x, y);
      g.fillStyle = C.ink; g.font = font(700, 20);
      for (const line of wrap(g, seg.mode.title, w, 2)) { y += 26; g.fillText(line, x, y); }
      y += 14;
    }
    // the meters, as the engine reads them
    g.fillStyle = C.muted; g.font = font(700, 13); g.fillText(t.readings_label.toUpperCase(), x, y += 18);
    y += 8;
    const rows = circuit.components.filter((c) => ["battery", "ammeter", "voltmeter"].includes(c.type)).slice(0, 5);
    for (const c of rows) {
      const r = circuit.solution.components[c.id] ?? {};
      const value = c.type === "battery" ? `${c.V} V` : format(r.reading ?? 0, c.type === "ammeter" ? "A" : "V");
      y += 30;
      g.fillStyle = C.ink; g.font = font(600, 18); g.textAlign = "left"; g.fillText(c.id, x, y);
      g.fillStyle = c.type === "battery" ? C.ink : C.blue; g.font = font(800, 20); g.textAlign = "right"; g.fillText(value, x + w, y);
    }
    g.textAlign = "left";
    y += 18;
    if (seg.measures.length) { plot(g, seg.measures, x, y, w, 170, t); y += 182; }
    g.textAlign = "left";
    // the caption: what just happened
    if (seg.caption) {
      const alpha = Math.min(1, local / 0.25, (seg.dur - local) / 0.25 + 0.2);
      g.globalAlpha = Math.max(0, alpha);
      g.font = font(500, 16);
      const lines = wrap(g, seg.caption.text, w - 28, 7);
      const h = 50 + lines.length * 22;
      const top = PANEL.y + PANEL.h - h - 16;
      const fill = seg.caption.tone === "ok" ? C.okBg : seg.caption.tone === "warn" ? C.warnBg : seg.caption.tone === "tutor" ? C.tutorBg : C.ground;
      box(g, x - 6, top, w + 12, h, 12, fill);
      g.fillStyle = seg.caption.tone === "ok" ? C.ok : seg.caption.tone === "warn" ? C.danger : seg.caption.tone === "tutor" ? C.blue : C.ink;
      g.font = font(800, 16); g.fillText(seg.caption.title, x + 8, top + 28);
      g.fillStyle = C.ink; g.font = font(500, 16);
      lines.forEach((line, i) => g.fillText(line, x + 8, top + 54 + i * 22));
      g.globalAlpha = 1;
    }
  }

  card(seg, local) {
    const { g, t } = this;
    const alpha = Math.min(1, local / 0.4, (seg.dur - local) / 0.4);
    g.globalAlpha = Math.max(0, alpha);
    g.textAlign = "center";
    if (seg.card === "intro") {
      if (this.logo) { const h = 64, w = (this.logo.naturalWidth / this.logo.naturalHeight) * h; this.brand(W / 2 - (w + 90) / 2, 120, h); g.textAlign = "center"; }
      g.fillStyle = C.muted; g.font = font(700, 20); g.fillText(t.video_kicker.toUpperCase(), W / 2, 260);
      g.fillStyle = C.ink; g.font = font(800, 48);
      wrap(g, this.lab.title, 1000, 2).forEach((line, i) => g.fillText(line, W / 2, 330 + i * 58));
      g.fillStyle = C.muted; g.font = font(500, 20); g.fillText(t.video_engine, W / 2, 470);
    } else {
      const s = seg.summary ?? {};
      g.fillStyle = C.ink; g.font = font(800, 40); g.fillText(t.report, W / 2, 170);
      const tiles = [
        [t.measures, `${s.measures ?? 0}`],
        [t.challenges, `${s.challenges?.solved ?? 0} / ${s.challenges?.total ?? 0}`],
        [t.predictions_label, `${s.predictions?.right ?? 0} / ${s.predictions?.total ?? 0}`],
        [t.quiz, `${s.quiz?.right ?? 0} / ${s.quiz?.total ?? 0}`],
        [t.questions_label, `${s.questions ?? 0}`],
        [t.duration_label, duration(s.duration_s)],
      ];
      tiles.forEach(([name, value], i) => {
        const x = 170 + (i % 3) * 320, y = 230 + Math.floor(i / 3) * 170;
        box(g, x, y, 300, 145, 16, C.card, C.line);
        g.fillStyle = C.accent; g.font = font(800, 52); g.fillText(value, x + 150, y + 78);
        g.fillStyle = C.muted; g.font = font(600, 18); g.fillText(name, x + 150, y + 118);
      });
      g.fillStyle = C.muted; g.font = font(500, 18); g.fillText(t.video_engine, W / 2, 640);
    }
    g.globalAlpha = 1; g.textAlign = "left";
  }

  progress(p) {
    const { g } = this;
    g.fillStyle = C.line; g.fillRect(24, H - 22, W - 48, 5);
    g.fillStyle = C.accent; g.fillRect(24, H - 22, (W - 48) * p, 5);
  }
  dispose() { this.bench?.dispose(); }
}

// ---------------------------------------------------------------- encoding
async function pickEncoder() {
  if (!("VideoEncoder" in window)) return null;
  for (const [codec, mux] of [["avc1.42001f", "avc"], ["avc1.4d0028", "avc"], ["vp09.00.31.08", "vp9"]]) {
    const config = { codec, width: W, height: H, bitrate: 2_500_000, framerate: FPS, ...(mux === "avc" ? { avc: { format: "avc" } } : {}) };
    try { if ((await VideoEncoder.isConfigSupported(config)).supported) return { config, mux }; } catch { /* try the next */ }
  }
  return null;
}

/** The video of a session: { blob, type, extension, seconds }. view: "2d" or "3d". */
export async function renderVideo({ lab, session, t, view = "2d", onProgress = () => {}, signal } = {}) {
  const { segments, duration } = timeline(session, lab, t);
  const painter = new Painter(lab, t, view);
  await painter.init();
  const frames = Math.ceil(duration * FPS);
  const at = (f) => {
    const time = f / FPS;
    let seg = segments.find((s) => time < s.start + s.dur) ?? segments.at(-1);
    return { seg, local: time - seg.start, time };
  };
  try {
    const encoder = await pickEncoder();
    if (encoder) {
      const muxer = new Muxer({ target: new ArrayBufferTarget(), video: { codec: encoder.mux, width: W, height: H, frameRate: FPS }, fastStart: "in-memory", firstTimestampBehavior: "offset" });
      let failure = null;
      const video = new VideoEncoder({ output: (chunk, meta) => muxer.addVideoChunk(chunk, meta), error: (e) => { failure = e; } });
      video.configure(encoder.config);
      for (let f = 0; f < frames; f++) {
        if (signal?.aborted) throw new DOMException("cancelled", "AbortError");
        if (failure) throw failure;
        const { seg, local, time } = at(f);
        await painter.frame(seg, local, time, f / frames);
        const frame = new VideoFrame(painter.canvas, { timestamp: Math.round((f * 1e6) / FPS), duration: Math.round(1e6 / FPS) });
        video.encode(frame, { keyFrame: f % (FPS * 2) === 0 });
        frame.close();
        while (video.encodeQueueSize > 6) await new Promise((ok) => setTimeout(ok, 4));
        if (f % 10 === 0) { onProgress(f / frames); await new Promise((ok) => setTimeout(ok, 0)); }
      }
      await video.flush();
      if (failure) throw failure;
      muxer.finalize();
      onProgress(1);
      return { blob: new Blob([muxer.target.buffer], { type: "video/mp4" }), type: "video/mp4", extension: "mp4", seconds: duration, h264: encoder.mux === "avc" };
    }
    // no WebCodecs: the same frames, recorded in real time
    const type = ["video/mp4;codecs=avc1", "video/webm;codecs=vp9", "video/webm"].find((m) => window.MediaRecorder?.isTypeSupported?.(m));
    if (!type) throw new Error("this browser cannot record video");
    const stream = painter.canvas.captureStream(FPS);
    const recorder = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 3_000_000 });
    const chunks = [];
    recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const done = new Promise((ok) => (recorder.onstop = ok));
    recorder.start(500);
    const t0 = performance.now();
    for (let f = 0; f < frames; f++) {
      if (signal?.aborted) { recorder.stop(); throw new DOMException("cancelled", "AbortError"); }
      const { seg, local, time } = at(f);
      await painter.frame(seg, local, time, f / frames);
      const wait = t0 + (f + 1) * (1000 / FPS) - performance.now();
      if (wait > 0) await new Promise((ok) => setTimeout(ok, wait));
      if (f % 10 === 0) onProgress(f / frames);
    }
    recorder.stop();
    await done;
    stream.getTracks().forEach((track) => track.stop());
    onProgress(1);
    const base = type.split(";")[0];
    return { blob: new Blob(chunks, { type: base }), type: base, extension: base === "video/mp4" ? "mp4" : "webm", seconds: duration, h264: base === "video/mp4" };
  } finally {
    painter.dispose();
  }
}
