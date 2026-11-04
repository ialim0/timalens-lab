// Sessions, the video's timeline and the resistor colour code: the pieces that turn a
// student's lab into a replayable record. (The pixels themselves are checked in a browser.)
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Session } from "../frontend/src/lab/session.js";
import { timeline } from "../frontend/src/lab/video.js";
import { boardSvg, chargePaths, resistorBands, standaloneSvg } from "../frontend/src/lab/board.js";
import { layout, normalise, solve } from "../frontend/src/lab/circuit.js";
import { strings } from "../frontend/src/lab/i18n.js";

const lab = JSON.parse(readFileSync(new URL("../samples/ohm_fr.lab.json", import.meta.url), "utf8"));
const circuit = () => layout(lab.presets[0]).components.map(normalise);

test("resistor colour bands follow the code", () => {
  const [BLACK, BROWN, RED, , YELLOW, , , VIOLET] = ["#111111", "#7b3f00", "#d0201c", "#f07b13", "#f2d11b", "#2f9e44", "#1f5fd1", "#7a3db8"];
  const GOLD = "#c9a227";
  assert.deepEqual(resistorBands(470), [YELLOW, VIOLET, BROWN, GOLD]);
  assert.deepEqual(resistorBands(100), [BROWN, BLACK, BROWN, GOLD]);
  assert.deepEqual(resistorBands(1000), [BROWN, BLACK, RED, GOLD]);
  assert.deepEqual(resistorBands(4.7), [YELLOW, VIOLET, GOLD, GOLD]);
  assert.deepEqual(resistorBands(10), [BROWN, BLACK, BLACK, GOLD]);
});

test("a session keeps one circuit per quarter second while a slider moves, and skips repeats", () => {
  const s = new Session("sample-ohm-fr", lab);
  const parts = circuit();
  s.circuit(parts);
  s.circuit(parts); // unchanged: not recorded again
  for (let v = 1; v <= 20; v++) { parts.find((c) => c.type === "battery").V = v; s.circuit(parts); }
  const circuits = s.events.filter((e) => e.kind === "circuit");
  assert.ok(circuits.length <= 3, `${circuits.length} circuit events`);
  assert.equal(circuits.at(-1).components.find((c) => c.type === "battery").V, 20); // the last value wins
  assert.ok(JSON.stringify(s.doc).length < 5000);
});

test("the summary counts what the student did", () => {
  const s = new Session("sample-ohm-fr", lab);
  s.add("predict", { question: "?", choice: "x", right: true });
  s.add("measure", { part: "R1", U: 6, I: 0.06 });
  s.add("success", { id: "led20", title: "LED" });
  s.add("success", { id: "led20", title: "LED" });
  s.add("quiz", { question: "?", right: false });
  const sum = s.finish(lab).summary;
  assert.equal(sum.measures, 1);
  assert.deepEqual(sum.challenges, { solved: 1, total: lab.challenges.length });
  assert.deepEqual(sum.predictions, { right: 1, total: 1 });
  assert.equal(sum.quiz.right, 0);
});

test("the video's timeline: intro, every action, report; slider runs play quickly", () => {
  const s = new Session("sample-ohm-fr", lab);
  const parts = circuit();
  s.circuit(parts);
  s.add("mode", { mode: "activity", title: "Découvrir" });
  s.add("predict", { question: "Si on double U ?", choice: "Elle double", right: true });
  // a slider dragged over three seconds: twelve recorded circuits
  for (let v = 1; v <= 12; v++) { parts.find((c) => c.type === "battery").V = v; s.events.push({ t: 1 + v / 4, kind: "circuit", components: structuredClone(parts) }); }
  s.add("measure", { part: "R1", U: 12, I: 0.12 });
  s.add("tutor", { q: "Pourquoi ?", a: "Regarde l'ampèremètre." });
  const { segments, duration } = timeline(s.finish(lab), lab, strings("fr"));
  assert.equal(segments[0].card, "intro");
  assert.equal(segments.at(-1).card, "report");
  const run = segments.find((x) => x.run?.length === 12);
  assert.ok(run && run.dur <= 4, "twelve changes play as one short sequence");
  assert.ok(segments.some((x) => x.caption?.title === strings("fr").tutor));
  assert.equal(segments.at(-1).measures.length, 1);
  assert.ok(duration > 15 && duration < 40, `${duration}`);
  let start = 0;
  for (const x of segments) { assert.equal(x.start, start); start += x.dur; }
});

test("the board renders on its own: a standalone SVG the video can rasterise", () => {
  const parts = circuit(), solution = solve(parts);
  const content = boardSvg({ components: parts, solution, t: strings("fr") });
  const svg = standaloneSvg(content, 800, 600);
  assert.match(svg, /^<svg xmlns="http:\/\/www.w3.org\/2000\/svg"/);
  assert.match(svg, /60\.0 mA/); // the ammeter's reading is in the picture
  assert.ok(chargePaths(parts, solution).length > 0);
});
