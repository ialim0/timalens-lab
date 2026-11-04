// The circuit engine against hand-worked answers.
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkLayout, layout, meets, solve, format } from "../frontend/src/lab/circuit.js";

const close = (actual, expected, tolerance, what) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${what}: ${actual} is not ${expected} ± ${tolerance}`);
const build = (preset) => { const { components } = layout(preset); assert.deepEqual(checkLayout(components), []); return components; };

test("Ohm's law: 6 V across 100 Ω drives 60 mA, and the meters read it", () => {
  const s = solve(build({ topology: "series", battery: { V: 6 }, elements: [{ id: "R1", type: "resistor", R: 100 }], ammeter: true, voltmeter_on: "R1" }));
  close(s.components.R1.I, 0.06, 0.0005, "current through R1");
  close(s.components.A1.reading, 0.06, 0.0005, "ammeter");
  close(s.components.V1.reading, 6, 0.01, "voltmeter across R1");
  assert.equal(s.shorted, false);
});

test("in series the current is shared and the voltage divides", () => {
  const s = solve(build({ topology: "series", battery: { V: 6 }, elements: [{ id: "R1", type: "resistor", R: 100 }, { id: "R2", type: "resistor", R: 200 }], ammeter: true, voltmeter_on: "R1" }));
  close(s.components.A1.reading, 0.02, 0.0002, "current");
  close(s.components.V1.reading, 2, 0.01, "voltage across R1");
  close(Math.abs(s.components.R2.V), 4, 0.01, "voltage across R2");
});

test("in parallel each branch gets the full voltage, and the currents add", () => {
  const s = solve(build({ topology: "parallel", battery: { V: 6 }, elements: [{ id: "R1", type: "resistor", R: 100 }, { id: "R2", type: "resistor", R: 300 }], ammeter: true, branch_ammeters: true }));
  close(Math.abs(s.components.R1.I), 0.06, 0.0005, "R1");
  close(Math.abs(s.components.R2.I), 0.02, 0.0005, "R2");
  close(s.components.A1.reading, 0.08, 0.0008, "total");
  close(s.components.A2.reading + s.components.A3.reading, s.components.A1.reading, 1e-6, "branch currents add up");
});

test("series then parallel: 100 Ω + (200 Ω ∥ 200 Ω) is 200 Ω", () => {
  const s = solve(build({ topology: "series_parallel", battery: { V: 6 }, elements: [{ id: "R1", type: "resistor", R: 100 }, { id: "R2", type: "resistor", R: 200 }, { id: "R3", type: "resistor", R: 200 }], ammeter: true }));
  close(s.components.A1.reading, 0.03, 0.0003, "total current");
});

test("an LED lights forwards with a resistor, stays dark backwards, and burns out without one", () => {
  const lit = solve(build({ topology: "series", battery: { V: 6 }, elements: [{ id: "R1", type: "resistor", R: 330 }, { id: "D1", type: "led" }], ammeter: true }));
  assert.equal(lit.components.D1.lit, true);
  close(lit.components.A1.reading, (6 - 2) / 338, 0.0003, "LED current");
  const back = solve(build({ topology: "series", battery: { V: 6 }, elements: [{ id: "R1", type: "resistor", R: 330 }, { id: "D1", type: "led", reversed: true }], ammeter: true })
    .map((c) => (c.id === "D1" ? { ...c, a: c.b, b: c.a } : c)));
  assert.equal(back.components.D1.lit, false);
  close(back.components.A1.reading, 0, 1e-6, "no current backwards");
  const burnt = solve(build({ topology: "series", battery: { V: 6 }, elements: [{ id: "D1", type: "led" }], ammeter: true }));
  assert.equal(burnt.components.D1.burnt, true);
  close(burnt.components.A1.reading, 0, 1e-6, "a burnt LED is an open circuit");
});

test("a bare wire across the battery is a short circuit; an open switch stops the current", () => {
  const short = solve(build({ topology: "series", battery: { V: 6 }, elements: [], ammeter: true }));
  assert.equal(short.shorted, true);
  const open = solve(build({ topology: "series", battery: { V: 6 }, elements: [{ id: "S1", type: "switch", closed: false }, { id: "L1", type: "bulb", R: 12 }], ammeter: true }));
  close(open.components.A1.reading, 0, 1e-6, "open switch");
  assert.equal(open.components.L1.brightness, 0);
});

test("a bulb's brightness follows its power: two in series are dimmer than one", () => {
  const one = solve(build({ topology: "series", battery: { V: 6 }, elements: [{ id: "L1", type: "bulb", R: 12, P: 3 }] }));
  const two = solve(build({ topology: "series", battery: { V: 6 }, elements: [{ id: "L1", type: "bulb", R: 12, P: 3 }, { id: "L2", type: "bulb", R: 12, P: 3 }] }));
  close(one.components.L1.brightness, 1, 0.02, "one bulb at full power (less the battery's own resistance)");
  close(two.components.L1.brightness, 0.25, 0.01, "each of two in series at a quarter");
});

test("goals are checked against the solved circuit", () => {
  const s = solve(build({ topology: "series", battery: { V: 6 }, elements: [{ id: "R1", type: "resistor", R: 200 }], ammeter: true }));
  assert.equal(meets(s, [{ quantity: "current", component: "R1", min: 0.025, max: 0.035 }, { not_shorted: true }]).ok, true);
  const miss = meets(s, [{ quantity: "current", component: "R1", min: 0.05 }]);
  assert.equal(miss.ok, false);
  assert.match(miss.failures[0], /current of R1/);
  assert.equal(format(0.0213, "A"), "21.3 mA");
});
