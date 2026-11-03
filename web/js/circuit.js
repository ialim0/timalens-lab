// TimaLens Lab: the circuit engine. Deterministic DC physics, the same in the browser and
// on the server (which uses it to check every lab a model writes).
//
// A circuit is a list of components, each on one edge of a grid: from node a to node b,
// two adjacent grid points. Nodes where ends meet are joined. The engine solves the
// circuit by nodal analysis (Kirchhoff's current law at every node):
// - wires, closed switches and ammeters are tiny resistances (so every one carries a
//   definite current, which the page animates);
// - a battery is a source with a small internal resistance, so a short circuit shows as a
//   huge current instead of breaking the maths;
// - an LED conducts only forwards, past its threshold voltage (solved by iterating its
//   state), and burns out above its maximum current, as a real one does;
// - a voltmeter draws no current and reads V(b) - V(a).

export const TYPES = {
  wire: { name: { en: "Wire", fr: "Fil" } },
  battery: { name: { en: "Battery", fr: "Pile" }, value: "V", unit: "V", min: 0, max: 24, step: 0.5, default: 6 },
  resistor: { name: { en: "Resistor", fr: "Résistance" }, value: "R", unit: "Ω", min: 1, max: 1000, step: 1, default: 100 },
  bulb: { name: { en: "Bulb", fr: "Ampoule" }, value: "R", unit: "Ω", min: 2, max: 200, step: 1, default: 12 },
  switch: { name: { en: "Switch", fr: "Interrupteur" } },
  led: { name: { en: "LED", fr: "DEL" } },
  ammeter: { name: { en: "Ammeter", fr: "Ampèremètre" } },
  voltmeter: { name: { en: "Voltmeter", fr: "Voltmètre" } },
};

const R_WIRE = 1e-3; // ohms: wires, closed switches, ammeters
const R_INTERNAL = 0.05; // a battery's internal resistance
const G_LEAK = 1e-9; // every node to ground, so a node left floating still has a voltage
const SHORT_AMPS = 3; // a battery delivering more than this is shorted
const LED_DEFAULT = { Vf: 2.0, Ron: 8, Imax: 0.03, colour: "red" };
const BULB_DEFAULT_P = 3; // watts at which a bulb is fully bright

const key = ([x, y]) => `${x},${y}`;
const adjacent = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) === 1;

/** A copy of a component with its defaults filled in. */
export function normalise(c) {
  const out = { ...c, a: [...c.a], b: [...c.b] };
  if (out.type === "battery") out.V = Number(out.V ?? TYPES.battery.default);
  if (out.type === "resistor") out.R = Number(out.R ?? TYPES.resistor.default);
  if (out.type === "bulb") { out.R = Number(out.R ?? TYPES.bulb.default); out.P = Number(out.P ?? BULB_DEFAULT_P); }
  if (out.type === "switch") out.closed = out.closed !== false;
  if (out.type === "led") Object.assign(out, { ...LED_DEFAULT, ...out });
  return out;
}

/** Problems with a circuit's layout, in words (empty when it can be solved). */
export function checkLayout(components) {
  const problems = [];
  const ids = new Set();
  const edges = new Set();
  for (const c of components) {
    if (!TYPES[c.type]) problems.push(`${c.id}: unknown type "${c.type}"`);
    if (ids.has(c.id)) problems.push(`${c.id}: the id is used twice`);
    ids.add(c.id);
    if (!Array.isArray(c.a) || !Array.isArray(c.b) || !adjacent(c.a, c.b)) { problems.push(`${c.id}: a and b must be adjacent grid points`); continue; }
    const edge = [key(c.a), key(c.b)].sort().join("|");
    if (edges.has(edge)) problems.push(`${c.id}: two components on the same edge`);
    edges.add(edge);
  }
  return problems;
}

/** Solve G v = i by Gaussian elimination with partial pivoting. */
function solveLinear(G, I) {
  const n = I.length;
  const A = G.map((row, r) => [...row, I[r]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(A[r][col]) > Math.abs(A[pivot][col])) pivot = r;
    [A[col], A[pivot]] = [A[pivot], A[col]];
    const p = A[col][col];
    if (Math.abs(p) < 1e-300) continue;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = A[r][col] / p;
      if (f === 0) continue;
      for (let k = col; k <= n; k++) A[r][k] -= f * A[col][k];
    }
  }
  return A.map((row, r) => (Math.abs(row[r]) < 1e-300 ? 0 : row[n] / row[r]));
}

/**
 * Solve a circuit. Returns the voltage at every node and, for every component, the
 * voltage across it (V(b) - V(a)), the current through it (from a to b), its power,
 * and what it shows: a bulb's brightness, an LED lit or burnt, a meter's reading.
 * LEDs (and bulbs far over their power) that burn out are marked `burnt` in the result;
 * the caller keeps that state on the component.
 */
export function solve(input) {
  const components = input.map(normalise);
  const nodes = new Map();
  const node = (p) => { const k = key(p); if (!nodes.has(k)) nodes.set(k, nodes.size); return nodes.get(k); };
  for (const c of components) { c.na = node(c.a); c.nb = node(c.b); }
  const n = nodes.size;
  const battery = components.find((c) => c.type === "battery");
  const ground = battery ? battery.na : 0;
  const ledOn = new Map(components.filter((c) => c.type === "led").map((c) => [c.id, false]));

  const conducts = (c) => {
    if (c.burnt) return null;
    switch (c.type) {
      case "wire": case "ammeter": return { g: 1 / R_WIRE };
      case "switch": return c.closed ? { g: 1 / R_WIRE } : null;
      case "resistor": case "bulb": return { g: 1 / Math.max(c.R, 1e-6) };
      case "battery": return { g: 1 / R_INTERNAL, source: c.V / R_INTERNAL }; // pushes current from a to b inside it
      case "led": return ledOn.get(c.id) ? { g: 1 / c.Ron, source: -c.Vf / c.Ron } : { g: 1e-9 };
      default: return null; // voltmeter: no current
    }
  };

  let v = new Array(n).fill(0);
  for (let pass = 0; pass < 30; pass++) {
    const G = Array.from({ length: n }, () => new Array(n).fill(0));
    const I = new Array(n).fill(0);
    for (let i = 0; i < n; i++) G[i][i] += G_LEAK;
    for (const c of components) {
      const e = conducts(c);
      if (!e) continue;
      const { na: a, nb: b } = c;
      G[a][a] += e.g; G[b][b] += e.g; G[a][b] -= e.g; G[b][a] -= e.g;
      // a current source from a to b (through the component): leaves a, enters b
      if (e.source) { I[a] -= e.source; I[b] += e.source; }
    }
    // ground: V = 0 at the battery's negative end
    G[ground] = new Array(n).fill(0); G[ground][ground] = 1; I[ground] = 0;
    v = solveLinear(G, I);
    // LEDs: on when pushed past their threshold, off when their current would run backwards
    let changed = false;
    for (const c of components) {
      if (c.type !== "led" || c.burnt) continue;
      const vd = v[c.na] - v[c.nb];
      const on = ledOn.get(c.id);
      const current = on ? (vd - c.Vf) / c.Ron : 0;
      if (!on && vd > c.Vf + 1e-9) { ledOn.set(c.id, true); changed = true; }
      else if (on && current < 0) { ledOn.set(c.id, false); changed = true; }
    }
    if (!changed) {
      // an LED over its limit burns out, and the circuit is solved again without it
      let burnt = false;
      for (const c of components) {
        if (c.type === "led" && !c.burnt && ledOn.get(c.id) && (v[c.na] - v[c.nb] - c.Vf) / c.Ron > c.Imax * 1.6) { c.burnt = true; c.burntNow = true; burnt = true; }
        if (c.type === "bulb" && !c.burnt && (v[c.nb] - v[c.na]) ** 2 / c.R > c.P * 4) { c.burnt = true; c.burntNow = true; burnt = true; }
      }
      if (!burnt) break;
    }
  }

  const results = {};
  let shorted = false;
  for (const c of components) {
    const V = v[c.nb] - v[c.na];
    // every component: I(a to b) = g (V(a) - V(b)) + its source; for a battery, the current it delivers
    const e = conducts(c);
    const I = e ? e.g * (v[c.na] - v[c.nb]) + (e.source ?? 0) : 0;
    const r = { V, I, P: Math.abs(V * I), burnt: !!c.burnt, burntNow: !!c.burntNow };
    if (c.type === "battery") { r.P = Math.abs(c.V * I); r.terminal = V; if (Math.abs(I) > SHORT_AMPS) shorted = true; }
    if (c.type === "bulb") r.brightness = c.burnt ? 0 : Math.min(1, r.P / c.P);
    if (c.type === "led") { r.lit = !c.burnt && I > 1e-4; r.brightness = c.burnt ? 0 : Math.min(1, Math.max(0, I) / c.Imax); }
    if (c.type === "ammeter") r.reading = I;
    if (c.type === "voltmeter") { r.reading = V; r.I = 0; r.P = 0; }
    results[c.id] = r;
  }
  return { nodes: Object.fromEntries([...nodes].map(([k, i]) => [k, v[i]])), components: results, shorted };
}

// ---------------------------------------------------------------- presets: from a description to a layout
/**
 * Lay out a circuit described by its topology, as a model writes it in a lab:
 *   { topology: "series" | "parallel" | "series_parallel",
 *     battery: { V }, elements: [{ id, type, ...values }], ammeter: true,
 *     voltmeter_on: "R1", branch_ammeters: true }
 * series: the elements in a row, in one loop. parallel: one branch per element.
 * series_parallel: the first element in series, the others in parallel after it.
 * Returns the components, placed on the grid, and the grid's size.
 */
export function layout(preset) {
  const out = [];
  const add = (c) => out.push(c);
  let wires = 0;
  const wire = (a, b) => add({ id: `w${++wires}`, type: "wire", a, b });
  const path = (points) => { for (let i = 0; i + 1 < points.length; i++) wire(points[i], points[i + 1]); };
  const elements = (preset.elements ?? []).slice(0, 4);
  const topology = preset.topology ?? "series";
  const place = (e, a, b) => add({ ...e, a, b });
  let right;
  add({ id: preset.battery?.id ?? "B1", type: "battery", V: preset.battery?.V ?? 6, a: [1, 4], b: [1, 3] });
  const top = 1, bottom = 6;
  path([[1, 3], [1, 2], [1, top]]);
  path([[1, 4], [1, 5], [1, bottom]]);
  const voltmeterFor = preset.voltmeter_on;

  const voltmeterAcross = (a, b, horizontal) => {
    // a parallel path beside the element: up (or right) one, across, back
    const off = horizontal ? [0, -1] : [1, 0];
    const a2 = [a[0] + off[0], a[1] + off[1]], b2 = [b[0] + off[0], b[1] + off[1]];
    wire(a, a2); wire(b, b2);
    // its + probe on the side the current enters, so it reads the drop as positive
    add({ id: "V1", type: "voltmeter", a: b2, b: a2 });
  };

  // a straight run of unit wires from p to q
  const run = (p, q) => {
    const dx = Math.sign(q[0] - p[0]), dy = Math.sign(q[1] - p[1]);
    for (let at = [...p]; key(at) !== key(q); ) { const next = [at[0] + dx, at[1] + dy]; wire(at, next); at = next; }
  };
  let x = 1;
  let branches = topology === "series" ? [] : elements;
  const inSeries = topology === "series" ? elements : topology === "series_parallel" && elements.length > 1 ? [elements[0]] : [];
  if (inSeries.length) branches = topology === "series" ? [] : elements.slice(1);
  for (const e of inSeries) {
    run([x, top], [x + 1, top]);
    place(e, [x + 1, top], [x + 2, top]);
    if (voltmeterFor === e.id) voltmeterAcross([x + 1, top], [x + 2, top], true);
    x += 2;
  }
  if (!branches.length) {
    right = x + 1;
    run([x, top], [right, top]);
    run([right, top], [right, bottom]);
  } else {
    branches.forEach((e, i) => {
      const bx = x + 1 + 2 * i;
      run([i === 0 ? x : bx - 2, top], [bx, top]);
      run([bx, top], [bx, 2]);
      place(e, [bx, 2], [bx, 3]);
      if (voltmeterFor === e.id) voltmeterAcross([bx, 2], [bx, 3], false);
      if (preset.branch_ammeters) { run([bx, 3], [bx, 4]); add({ id: `A${i + 2}`, type: "ammeter", a: [bx, 4], b: [bx, 5] }); run([bx, 5], [bx, bottom]); }
      else run([bx, 3], [bx, bottom]);
    });
    right = x + 1 + 2 * (branches.length - 1);
  }
  // the bottom rail back to the battery, with the main ammeter on it
  const rail = [];
  for (let x = right; x > 1; x--) rail.push([[x, bottom], [x - 1, bottom]]);
  // the main ammeter on the last stretch into the battery, which every branch's current shares
  const meterAt = preset.ammeter ? rail.length - 1 : -1;
  // the current comes back along the rail from right to left: the ammeter reads it positive
  rail.forEach(([a, b], i) => (i === meterAt ? add({ id: "A1", type: "ammeter", a, b }) : wire(a, b)));
  const seen = new Set();
  const unique = out.filter((c) => { const k = [key(c.a), key(c.b)].sort().join("|"); if (seen.has(k)) return false; seen.add(k); return true; });
  return { components: unique, width: right + 3, height: bottom + 2 };
}

// ---------------------------------------------------------------- challenges
/**
 * Whether a solved circuit meets a goal a lab sets:
 *   { quantity: "current" | "voltage" | "power" | "brightness", component: id, min, max }
 *   or { lit: id } (an LED or bulb visibly on), { not_burnt: true }, { not_shorted: true }.
 * Every goal in the list must hold.
 */
export function meets(solution, goals) {
  const failures = [];
  for (const g of goals ?? []) {
    if (g.not_shorted && solution.shorted) failures.push("short circuit");
    if (g.not_burnt && Object.values(solution.components).some((r) => r.burnt)) failures.push("something burnt out");
    if (g.lit) { const r = solution.components[g.lit]; if (!r || !(r.brightness > 0.25)) failures.push(`${g.lit} is not lit`); }
    if (g.quantity) {
      const r = solution.components[g.component];
      if (!r) { failures.push(`no ${g.component} in the circuit`); continue; }
      const value = { current: Math.abs(r.I), voltage: Math.abs(r.V), power: r.P, brightness: r.brightness ?? 0 }[g.quantity];
      if (value === undefined || (g.min !== undefined && value < g.min) || (g.max !== undefined && value > g.max)) failures.push(`${g.quantity} of ${g.component} is ${value?.toPrecision(3)}`);
    }
  }
  return { ok: failures.length === 0, failures };
}

/** A number with its unit, readable: 0.0213 A as "21.3 mA". */
export function format(value, unit) {
  const a = Math.abs(value);
  if (unit === "A" && a < 1 && a >= 1e-4) return `${(value * 1000).toFixed(a < 0.01 ? 2 : 1)} mA`;
  if (unit === "W" && a < 1 && a >= 1e-4) return `${(value * 1000).toFixed(1)} mW`;
  if (a < 1e-4) return `0 ${unit}`;
  return `${value.toFixed(a < 10 ? 2 : 1)} ${unit}`;
}
