// The lab checker: what stands between Muse Spark's design and a student.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { checkLab, presetCircuit, achievable } from "../web/js/labcheck.js";
import { solve } from "../web/js/circuit.js";

const sample = JSON.parse(readFileSync(new URL("../samples/ohm_fr.lab.json", import.meta.url), "utf8"));
const copy = () => structuredClone(sample);

test("the sample lab is accepted", () => assert.deepEqual(checkLab(sample), []));

test("an impossible challenge is caught", () => {
  const lab = copy();
  lab.challenges[0].goals = [{ quantity: "current", component: "D1", min: 5, max: 6 }];
  assert.ok(checkLab(lab).some((p) => p.includes("led20")));
});

test("a challenge already met at the start is caught", () => {
  const lab = copy();
  const ohm = lab.presets.find((p) => p.id === "ohm");
  lab.challenges.push({ id: "free", title: "x", statement: "x", preset: "ohm", locked: [], goals: [{ quantity: "current", component: "R1", min: 0.05, max: 0.07 }] });
  const problems = checkLab(lab);
  assert.ok(ohm && problems.some((p) => p.includes("free")), problems.join("; "));
});

test("a preset that shorts the battery is caught", () => {
  const lab = copy();
  lab.presets[0].elements = [{ id: "S1", type: "switch", closed: true }];
  assert.ok(checkLab(lab).length > 0);
});

test("unknown presets, components and quiz answers are caught", () => {
  const lab = copy();
  lab.activities[0].preset = "nowhere";
  lab.quiz[0].answer = 9;
  const problems = checkLab(lab);
  assert.ok(problems.some((p) => p.includes("nowhere")));
  assert.ok(problems.some((p) => /quiz/i.test(p)));
});

test("achievability: the LED challenge is solvable by changing R1 only", () => {
  const c = sample.challenges.find((x) => x.id === "led20");
  const circuit = presetCircuit(sample.presets.find((p) => p.id === c.preset));
  assert.ok(achievable(circuit, c.goals, c.locked));
  assert.ok(!achievable(circuit, c.goals, ["B1", "R1"]) || solve(circuit).components.D1.I > 0.015);
});
