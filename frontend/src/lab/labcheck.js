// Check a lab before a student sees it: its shape, every preset circuit (laid out and
// solved: no short circuit), and every goal (it names parts that exist, and some setting
// of the controls the student is allowed to touch meets it). The server runs this on each
// lab a model writes and sends the problems back to the model in these words.
import { TYPES, checkLayout, layout, meets, solve } from "./circuit.js";

const ELEMENT_TYPES = ["resistor", "bulb", "led", "switch"];
const isText = (v) => typeof v === "string" && v.trim().length > 0;

/** The components a preset lays out (the battery is B1, the meters A1, A2… and V1). */
export function presetCircuit(preset) {
  return layout(preset).components;
}

/** Every setting a student could give the circuit: battery voltages, resistances, switches. */
function* settings(components, locked, tries, seed = 7) {
  let s = seed;
  const random = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const adjustable = components.filter((c) => !locked.includes(c.id) && (["battery", "resistor", "bulb"].includes(c.type) || c.type === "switch"));
  yield components; // as given
  for (let t = 0; t < tries; t++) {
    yield components.map((c) => {
      if (!adjustable.includes(c)) return c;
      if (c.type === "switch") return { ...c, closed: random() < 0.75 };
      const spec = TYPES[c.type];
      // resistances spread over their range on a log scale, voltages on a line
      const x = random();
      const value = c.type === "battery" ? Math.round((spec.min + x * (spec.max - spec.min)) / spec.step) * spec.step
        : Math.round(Math.exp(Math.log(spec.min) + x * (Math.log(spec.max) - Math.log(spec.min))));
      return { ...c, [spec.value]: value };
    });
  }
}

/** Whether some setting of the circuit meets the goals; the first that does, if any. */
export function achievable(components, goals, locked = [], tries = 4000) {
  for (const circuit of settings(components, locked, tries)) if (meets(solve(circuit), goals).ok) return circuit;
  return null;
}

function checkGoals(goals, ids, where, problems) {
  if (!Array.isArray(goals) || !goals.length) return problems.push(`${where}: needs goals`);
  for (const g of goals) {
    if (g.quantity) {
      if (!["current", "voltage", "power", "brightness"].includes(g.quantity)) problems.push(`${where}: quantity "${g.quantity}" is not current, voltage, power or brightness`);
      if (!ids.has(g.component)) problems.push(`${where}: goal names "${g.component}", which is not in its circuit (it has ${[...ids].join(", ")})`);
      if (g.min === undefined && g.max === undefined) problems.push(`${where}: a goal on ${g.component} needs min or max`);
      if (g.min !== undefined && g.max !== undefined && g.min > g.max) problems.push(`${where}: min is above max`);
    } else if (g.lit !== undefined) {
      if (!ids.has(g.lit)) problems.push(`${where}: "lit" names "${g.lit}", which is not in its circuit`);
    } else if (!g.not_burnt && !g.not_shorted) problems.push(`${where}: a goal is quantity, lit, not_burnt or not_shorted`);
  }
}

/** Problems with a lab, in words a model can act on; empty when it is ready. */
export function checkLab(lab) {
  const problems = [];
  if (!lab || typeof lab !== "object") return ["the lab is not an object"];
  if (lab.lab !== "circuits") problems.push('lab must be "circuits" (the only lab so far)');
  for (const k of ["title", "summary", "language"]) if (!isText(lab[k])) problems.push(`${k}: needed`);
  if (!Array.isArray(lab.objectives) || lab.objectives.length < 2) problems.push("objectives: at least two");
  const presets = new Map();
  for (const [i, p] of (lab.presets ?? []).entries()) {
    const where = `presets[${i}] (${p.id ?? "?"})`;
    if (!isText(p.id)) { problems.push(`${where}: needs an id`); continue; }
    if (presets.has(p.id)) problems.push(`${where}: the id is used twice`);
    if (!["series", "parallel", "series_parallel"].includes(p.topology)) problems.push(`${where}: topology must be series, parallel or series_parallel`);
    const V = p.battery?.V;
    if (!(typeof V === "number" && V > 0 && V <= 24)) problems.push(`${where}: battery.V must be a number from 0 to 24`);
    const elements = p.elements ?? [];
    if (elements.length > 4) problems.push(`${where}: at most 4 elements`);
    if (p.topology !== "series" && elements.length < 2) problems.push(`${where}: a ${p.topology} circuit needs at least 2 elements`);
    const seen = new Set();
    for (const e of elements) {
      if (!ELEMENT_TYPES.includes(e.type)) problems.push(`${where}: element type "${e.type}" is not one of ${ELEMENT_TYPES.join(", ")}`);
      if (!/^[A-Z][A-Za-z0-9]*$/.test(e.id ?? "") || ["B1", "A1", "V1"].includes(e.id) || seen.has(e.id)) problems.push(`${where}: element id "${e.id}" must be unique, like R1, L1, D1 or S1 (B1, A1 and V1 are taken)`);
      seen.add(e.id);
      if ((e.type === "resistor" || e.type === "bulb") && !(typeof e.R === "number" && e.R >= 1 && e.R <= 1000)) problems.push(`${where}: ${e.id}.R must be from 1 to 1000 ohms`);
    }
    if (p.voltmeter_on !== undefined && !elements.some((e) => e.id === p.voltmeter_on)) problems.push(`${where}: voltmeter_on names "${p.voltmeter_on}", not one of its elements`);
    let circuit;
    try {
      circuit = presetCircuit(p);
      problems.push(...checkLayout(circuit).map((x) => `${where}: ${x}`));
      const s = solve(circuit);
      if (s.shorted) problems.push(`${where}: the battery is short-circuited (add a resistor, a bulb or an LED)`);
    } catch (error) {
      problems.push(`${where}: cannot be laid out: ${error.message}`);
    }
    presets.set(p.id, circuit ?? []);
  }
  if (!presets.size) problems.push("presets: at least one");
  const goalsIn = (where, presetId, goals, locked = []) => {
    const circuit = presets.get(presetId);
    if (!circuit) return problems.push(`${where}: preset "${presetId}" is not one of ${[...presets.keys()].join(", ")}`);
    const ids = new Set(circuit.map((c) => c.id));
    const before = problems.length;
    checkGoals(goals, ids, where, problems);
    if (problems.length === before && !achievable(circuit, goals, locked)) problems.push(`${where}: no setting of the controls the student can touch meets its goals; widen min/max, or unlock a part`);
  };
  for (const [i, a] of (lab.activities ?? []).entries()) {
    const where = `activities[${i}] (${a.id ?? "?"})`;
    if (!isText(a.title) || !Array.isArray(a.steps) || !a.steps.length) { problems.push(`${where}: needs a title and steps`); continue; }
    if (!presets.has(a.preset)) problems.push(`${where}: preset "${a.preset}" is not one of ${[...presets.keys()].join(", ")}`);
    for (const [j, s] of a.steps.entries()) {
      const at = `${where}.steps[${j}]`;
      if (s.kind === "predict") {
        if (!isText(s.question) || !Array.isArray(s.choices) || s.choices.length < 2 || !(s.answer >= 0 && s.answer < s.choices.length)) problems.push(`${at}: a prediction needs a question, 2 or more choices and the index of the answer`);
      } else if (s.kind === "do") {
        if (!isText(s.instruction)) problems.push(`${at}: needs an instruction`);
        if (s.goals) goalsIn(at, a.preset, s.goals, s.locked ?? []);
      } else if (s.kind === "measure") {
        if (!isText(s.instruction) || !(s.points >= 2 && s.points <= 10)) problems.push(`${at}: a measurement needs an instruction and 2 to 10 points`);
      } else if (s.kind === "observe") {
        if (!isText(s.question)) problems.push(`${at}: needs a question`);
      } else problems.push(`${at}: kind must be predict, do, measure or observe`);
    }
  }
  for (const [i, c] of (lab.challenges ?? []).entries()) {
    const where = `challenges[${i}] (${c.id ?? "?"})`;
    if (!isText(c.statement)) problems.push(`${where}: needs a statement`);
    const before = problems.length;
    goalsIn(where, c.preset, c.goals, c.locked ?? []);
    // a challenge the starting circuit already meets is no challenge
    const circuit = presets.get(c.preset);
    if (problems.length === before && circuit?.length && meets(solve(circuit), c.goals).ok) problems.push(`${where}: the preset already meets these goals before the student changes anything; start from other values`);
  }
  if (lab.view !== undefined && !["2d", "3d"].includes(lab.view)) problems.push(`view: "2d" or "3d", not ${JSON.stringify(lab.view)}`);
  for (const [i, q] of (lab.quiz ?? []).entries()) {
    if (!isText(q.question) || !Array.isArray(q.choices) || q.choices.length < 2 || !(q.answer >= 0 && q.answer < q.choices.length)) problems.push(`quiz[${i}]: needs a question, 2 or more choices and the index of the answer`);
  }
  return problems;
}
