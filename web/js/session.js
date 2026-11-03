// A lab session as a log of events: the circuit after every change, each prediction,
// measurement, challenge met, tutor exchange and quiz answer. A whole session is a few KB,
// light enough to save on a 2G connection; the video is rendered from it (video.js), and
// because the engine is deterministic, the replay shows exactly what the student saw.

const FIELDS = ["id", "type", "a", "b", "V", "R", "P", "closed", "burnt"];
const snapshot = (components) => components.map((c) => Object.fromEntries(FIELDS.filter((k) => c[k] !== undefined).map((k) => [k, c[k]])));

export class Session {
  constructor(labId, lab) {
    this.doc = { version: 1, lab: labId, title: lab.title, language: lab.language ?? "fr", started: new Date().toISOString(), events: [] };
    this.t0 = performance.now();
  }
  get events() { return this.doc.events; }
  now() { return Math.round(performance.now() - this.t0) / 1000; }

  add(kind, data = {}) {
    const event = { t: this.now(), kind, ...data };
    const last = this.events.at(-1);
    // a slider being dragged: keep one circuit every quarter second, not every pixel
    if (kind === "circuit" && last?.kind === "circuit" && event.t - last.t < 0.25) { this.events[this.events.length - 1] = { ...event, t: last.t }; return; }
    this.events.push(event);
  }
  circuit(components, extra = {}) {
    const parts = snapshot(components);
    const last = [...this.events].reverse().find((e) => e.components);
    if (last && JSON.stringify(last.components) === JSON.stringify(parts) && !Object.keys(extra).length) return;
    this.add("circuit", { components: parts, ...extra });
  }

  /** What the student achieved, for the end card and the teacher. */
  summary(lab) {
    const measures = this.events.filter((e) => e.kind === "measure");
    const solved = [...new Set(this.events.filter((e) => e.kind === "success").map((e) => e.id))];
    const quiz = this.events.filter((e) => e.kind === "quiz");
    return {
      duration_s: this.now(), measures: measures.length,
      challenges: { solved: solved.length, total: lab.challenges?.length ?? 0 },
      predictions: { right: this.events.filter((e) => e.kind === "predict" && e.right).length, total: this.events.filter((e) => e.kind === "predict").length },
      quiz: { right: quiz.filter((e) => e.right).length, total: lab.quiz?.length ?? 0, answered: quiz.length },
      questions: this.events.filter((e) => e.kind === "tutor").length,
    };
  }
  finish(lab) {
    this.doc.ended = new Date().toISOString();
    this.doc.summary = this.summary(lab);
    return this.doc;
  }
}
