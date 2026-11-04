// TimaLens Lab: the student's bench. The circuit is solved by circuit.js on every change;
// nothing here guesses at physics. Parts are dragged onto the bench (2D or 3D); Tima, the
// voice guide, explains each mission and reacts to what the circuit does; the panel lists
// the missions (guided activities and challenges), takes measurements on its own and draws
// their U(I) graph, runs the quiz, and talks to the tutor (Muse Spark, through the server).
//
// It drives the DOM that the Next.js page renders (components/LabView.tsx): import it once that
// markup is on the page, then call mountLab().
import { TYPES, format, layout, meets, normalise, solve } from "./circuit.js";
import { CELL, PAD, boardSvg, chargeAt, chargePaths, nearestEdge, px, standaloneSvg, symbol, view as boardView } from "./board.js";
import { mountLanguageSwitch, strings, uiLanguage } from "./i18n.js";
import { Session } from "./session.js";
import { Tima, lines } from "./tima.js";

const E12 = [1, 1.2, 1.5, 1.8, 2.2, 2.7, 3.3, 3.9, 4.7, 5.6, 6.8, 8.2];
const SERIES = (min, max) => [1, 10, 100, 1000].flatMap((d) => E12.map((m) => Math.round(m * d * 10) / 10)).filter((v) => v >= min && v <= max);
const VALUES = { resistor: SERIES(1, 1000), bulb: SERIES(2, 200) };
const TOOLS = ["select", "wire", "battery", "resistor", "bulb", "switch", "led", "ammeter", "voltmeter", "erase"];
const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

const state = {
  lab: null, labId: null, t: strings("fr"), components: [], solution: null, selected: null, tool: "select",
  electrons: false, preset: null, locked: [], mode: { kind: "free" }, tab: "guide",
  log: { rows: [], target: null }, predicted: {}, quiz: {}, chat: [], done: new Set(), hover: null, view: "2d",
  finished: new Set(), announced: new Set(), shorted: false, quiet: false, frozenView: null, spot: [],
};
let bench3d = null; // the 3D bench, loaded on first use
let tima = null, voice = lines("fr"); // the voice guide, and what she says

// ---------------------------------------------------------------- loading
async function fetchLab(id) {
  const r = await fetch(`/api/labs/${encodeURIComponent(id)}`);
  if (!r.ok) throw new Error(r.status);
  return r.json();
}
async function loadLab() {
  const params = new URLSearchParams(location.search);
  state.ui = uiLanguage();
  state.labId = params.get("lab") ?? `sample-ohm-${state.ui}`;
  let lab;
  try {
    lab = await fetchLab(state.labId);
    // the interface is in the visitor's language; the content too, when a translation exists
    const other = lab.translations?.[state.ui];
    if (!lab.language?.startsWith(state.ui) && other && other !== state.labId) {
      lab = await fetchLab(other);
      state.labId = other;
      params.set("lab", other);
      history.replaceState(null, "", `?${params}`);
    }
  } catch {
    lab = await (await fetch(`/samples/ohm_${state.ui}.lab.json`)).json(); // served statically, without the API
    lab.origin = "sample";
  }
  state.lab = lab;
  state.t = strings(state.ui);
  state.offerTranslation = !lab.language?.startsWith(state.ui);
  document.documentElement.lang = state.ui;
  mountLanguageSwitch($("#lang-switch"), state.ui);
  document.title = `${lab.title} · TimaLens Lab`;
  $("#lab-title").textContent = lab.title;
  $("#lab-origin").textContent = lab.origin === "sample" ? state.t.sample : state.t.generated;
  $("#lab-origin").classList.toggle("ai", lab.origin !== "sample");
  $("#electrons-label").textContent = state.t.electrons;
  $("#hint").textContent = state.t.place_hint;
  $("#finish").textContent = state.t.finish;
  $("#hands").title = $("#hands").ariaLabel = state.t.hands;
  $("#tour").title = $("#tour").ariaLabel = state.t.tour;
  fillDock();
  state.session = new Session(state.labId, lab);
  buildToolbar();
  buildTabs();
  usePreset(lab.presets[0].id);
  await setUpTima();
  const asked = params.get("view");
  if (asked === "3d" || (asked !== "2d" && (lab.view === "3d" || immersiveDevice()))) await setView("3d");
  showIntro();
  navigator.xr?.isSessionSupported?.("immersive-vr").then((ok) => { $("#vr").hidden = !ok; }).catch(() => {});
}
/** A computer with room and power for the 3D world opens in it; a small phone opens in 2D. */
const immersiveDevice = () => matchMedia("(min-width: 900px)").matches && (navigator.hardwareConcurrency ?? 4) > 4;

function usePreset(id, locked = []) {
  const preset = state.lab.presets.find((p) => p.id === id) ?? state.lab.presets[0];
  state.preset = preset.id;
  state.components = layout(preset).components.map(normalise);
  state.locked = locked;
  state.selected = null;
  const first = state.components.find((c) => ["resistor", "bulb", "led"].includes(c.type));
  state.log.target = first?.id ?? null;
  state.announced = new Set();
  state.quiet = true; // a fresh circuit is not news: Tima only remarks on what the student changes
  recompute();
  state.quiet = false;
}

// ---------------------------------------------------------------- physics, on every change
function recompute() {
  state.solution = solve(state.components);
  const burntNow = state.components.filter((c) => state.solution.components[c.id]?.burntNow);
  for (const c of burntNow) c.burnt = true;
  if (burntNow.length) state.solution = solve(state.components);
  state.session?.circuit(state.components);
  drawBoard();
  drawInspector();
  refreshPanel(false);
  react(burntNow);
}

// ---------------------------------------------------------------- drawing
function drawBoard() {
  const svg = $("#board");
  const { viewBox, html } = boardSvg({ components: state.components, solution: state.solution, selected: state.selected, locked: state.locked, tool: state.tool, t: state.t, bounds: state.frozenView });
  svg.setAttribute("viewBox", viewBox.join(" "));
  svg.innerHTML = `${html}<g id="drop-preview"></g>`;
  for (const id of state.spot) svg.querySelector(`#parts g[data-id="${id}"]`)?.classList.add("spot");
  prepareCharges();
  const banner = $("#banner");
  const burnt = state.components.find((c) => c.burnt);
  if (state.solution?.shorted) { banner.hidden = false; banner.className = "banner"; banner.textContent = state.t.short; }
  else if (burnt) { banner.hidden = false; banner.className = "banner"; banner.textContent = `${burnt.id} ${state.t.burnt_advice}`; }
  else banner.hidden = true;
  bench3d?.update(state.components, state.solution, { selected: state.selected, electrons: state.electrons, t: state.t });
}

// ---------------------------------------------------------------- moving charges
let charges = [];
function prepareCharges() {
  const layer = $("#charges");
  charges = chargePaths(state.components, state.solution, state.electrons).map((ch) => {
    const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    dot.setAttribute("r", ch.shorted ? 4 : 3.4);
    dot.setAttribute("class", state.electrons ? "charge electron" : "charge");
    if (ch.shorted) dot.setAttribute("fill", "var(--danger)");
    layer.appendChild(dot);
    return { ...ch, dot, pa: px(ch.a), pb: px(ch.b) };
  });
}
function animate(now) {
  const t = now / 1000;
  if (state.view === "2d") for (const ch of charges) {
    const u = chargeAt(ch, t);
    ch.dot.setAttribute("cx", ch.pa[0] + (ch.pb[0] - ch.pa[0]) * u);
    ch.dot.setAttribute("cy", ch.pa[1] + (ch.pb[1] - ch.pa[1]) * u);
  }
  requestAnimationFrame(animate);
}

// ---------------------------------------------------------------- tools and touch
function toolIcon(type) {
  const fake = normalise({ id: "x", type, a: [0, 0], b: [1, 0], ...(type === "switch" ? { closed: true } : {}) });
  return `<svg viewBox="-34 -22 68 44">${symbol(fake, null)}</svg>`;
}
function buildToolbar() {
  const t = state.t;
  const names = { select: t.select, wire: t.wire, erase: t.erase };
  $("#toolbar").innerHTML = TOOLS.map((tool) => {
    const icon = tool === "select" ? `<svg viewBox="0 0 24 24"><path d="M5 3l14 8-6 2-3 6z" fill="currentColor"/></svg>`
      : tool === "erase" ? `<svg viewBox="0 0 24 24"><path d="M6 18L18 6M6 6l12 12" stroke="currentColor" stroke-width="2.5" fill="none"/></svg>` : toolIcon(tool);
    const name = names[tool] ?? TYPES[tool].name[state.ui];
    return `<button type="button" class="tool" data-tool="${tool}" aria-pressed="${state.tool === tool}">${icon}<span>${esc(name)}</span></button>`;
  }).join("") + `<button type="button" class="tool reset" data-reset="1"><svg viewBox="0 0 24 24"><path d="M4 12a8 8 0 1 0 3-6.2M4 4v5h5" stroke="currentColor" stroke-width="2.2" fill="none"/></svg><span>${esc(t.reset)}</span></button>`;
}
$("#toolbar").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b || performance.now() - drag.ended < 300) return;
  if (b.dataset.reset) { usePreset(state.preset, state.locked); return; }
  state.tool = b.dataset.tool;
  for (const x of document.querySelectorAll(".tool[data-tool]")) x.setAttribute("aria-pressed", String(x.dataset.tool === state.tool));
  state.selected = null;
  drawBoard();
  drawInspector();
});
$("#electrons").addEventListener("change", (e) => { state.electrons = e.target.checked; drawBoard(); });

let ids = 0;
function newId(type) {
  const prefix = { battery: "B", resistor: "R", bulb: "L", switch: "S", led: "D", ammeter: "A", voltmeter: "V", wire: "w" }[type];
  for (let n = 1; ; n++) { const id = `${prefix}${n}${type === "wire" ? `_${++ids}` : ""}`; if (!state.components.some((c) => c.id === id)) return id; }
}
const sameEdge = (c, a, b) => (String(c.a) === String(a) && String(c.b) === String(b)) || (String(c.a) === String(b) && String(c.b) === String(a));

/** Put a part (or the eraser) on a grid edge; a locked part there stays. */
function placeAt(type, a, b) {
  const existing = state.components.find((c) => sameEdge(c, a, b));
  if (existing && state.locked.includes(existing.id)) return false;
  if (existing) state.components = state.components.filter((c) => c !== existing);
  if (type !== "erase") {
    const c = normalise({ id: newId(type), type, a, b });
    state.components.push(c);
    if (c.type !== "wire") state.selected = c.id;
  }
  recompute();
  return true;
}

$("#board").addEventListener("click", (e) => {
  if (performance.now() - drag.ended < 300) return;
  const hit = e.target.closest("[data-a]");
  const part = e.target.closest("[data-id]");
  if (state.tool === "select") {
    if (!part) { state.selected = null; drawBoard(); drawInspector(); return; }
    const c = state.components.find((x) => x.id === part.dataset.id);
    if (c.type === "switch" && !state.locked.includes(c.id)) c.closed = !c.closed;
    state.selected = c.type === "wire" ? null : c.id;
    recompute();
    return;
  }
  if (!hit) return;
  placeAt(state.tool, hit.dataset.a.split(",").map(Number), hit.dataset.b.split(",").map(Number));
});

// ---------------------------------------------------------------- drag and drop
// Parts come off the tray and land on the bench, in 2D or 3D; a placed part can be picked up
// and moved, or dropped off the bench to take it away. The circuit is solved again the
// moment a part leaves or lands, so a bulb goes dark while its part is in the student's hand.
const drag = { pending: null, active: null, ended: 0 };

function overBench(x, y) {
  const box = $(".canvas-wrap").getBoundingClientRect();
  return x >= box.left && x <= box.right && y >= box.top && y <= box.bottom;
}
function edgeUnder(x, y) {
  if (state.view === "3d") return bench3d?.edgeAt(x, y) ?? null;
  const svg = $("#board"), box = svg.getBoundingClientRect();
  if (x < box.left || x > box.right || y < box.top || y > box.bottom) return null;
  const p = new DOMPoint(x, y).matrixTransform(svg.getScreenCTM().inverse());
  return nearestEdge((p.x - PAD) / CELL, (p.y - PAD) / CELL, state.frozenView ?? boardView(state.components));
}
function showDropPreview(type, edge) {
  bench3d?.preview(state.view === "3d" ? edge : null);
  const layer = $("#drop-preview");
  if (!layer) return;
  if (!edge || state.view === "3d") { layer.innerHTML = ""; return; }
  const [ax, ay] = px(edge.a), [bx, by] = px(edge.b), angle = Math.atan2(by - ay, bx - ax) * 180 / Math.PI;
  const ghost = normalise({ id: "preview", type, a: edge.a, b: edge.b, ...(type === "switch" ? { closed: true } : {}) });
  layer.innerHTML = `<line class="drop-glow" x1="${ax}" y1="${ay}" x2="${bx}" y2="${by}"/>
    <g class="drop-ghost" transform="translate(${(ax + bx) / 2} ${(ay + by) / 2}) rotate(${angle})">${symbol(ghost, null, angle)}</g>`;
}
function beginDrag(item, e) {
  const ghost = document.createElement("div");
  ghost.className = "drag-ghost";
  ghost.innerHTML = toolIcon(item.type);
  document.body.appendChild(ghost);
  state.frozenView = boardView(state.components);
  bench3d?.setDragging(true);
  if (item.comp) { // lifted: out of the circuit until it lands
    state.components = state.components.filter((c) => c !== item.comp);
    if (state.selected === item.comp.id) state.selected = null;
    recompute();
  }
  drag.active = { ...item, ghost, edge: null, key: undefined };
  moveDrag(e);
}
function moveDrag(e) {
  const d = drag.active;
  d.ghost.style.translate = `${e.clientX}px ${e.clientY}px`; // not transform: the ghost's scale would scale its position too
  const edge = edgeUnder(e.clientX, e.clientY);
  const blocked = edge && state.components.some((c) => sameEdge(c, edge.a, edge.b) && state.locked.includes(c.id));
  d.ghost.classList.toggle("snap", Boolean(edge && !blocked));
  d.ghost.classList.toggle("trash", Boolean(d.comp) && !overBench(e.clientX, e.clientY));
  const key = edge && !blocked ? `${edge.a}|${edge.b}` : "";
  if (key !== d.key) { d.key = key; d.edge = key ? edge : null; showDropPreview(d.type, d.edge); }
}
function endDrag(e, cancelled = false) {
  const d = drag.active;
  drag.active = null;
  drag.ended = performance.now();
  d.ghost.remove();
  showDropPreview(null, null);
  bench3d?.setDragging(false);
  state.frozenView = null;
  if (d.edge && !cancelled) {
    if (!d.comp) { placeAt(d.type, d.edge.a, d.edge.b); return; }
    state.components = state.components.filter((c) => !sameEdge(c, d.edge.a, d.edge.b));
    Object.assign(d.comp, { a: d.edge.a, b: d.edge.b });
    state.components.push(d.comp);
    if (d.comp.type !== "wire") state.selected = d.comp.id;
  } else if (d.comp && (cancelled || overBench(e.clientX, e.clientY))) {
    state.components.push(d.comp); // nowhere to land: back where it was
  } // a part dropped off the bench is gone
  recompute();
}
$("#toolbar").addEventListener("pointerdown", (e) => {
  const b = e.target.closest(".tool[data-tool]");
  if (b && !["select", "erase"].includes(b.dataset.tool)) drag.pending = { type: b.dataset.tool, x: e.clientX, y: e.clientY, tray: true };
});
$("#board").addEventListener("pointerdown", (e) => {
  if (state.tool !== "select") return;
  const comp = state.components.find((c) => c.id === e.target.closest("[data-id]")?.dataset.id);
  if (comp && !state.locked.includes(comp.id)) drag.pending = { type: comp.type, comp, x: e.clientX, y: e.clientY };
});
$("#bench3d").addEventListener("pointerdown", (e) => { // capture: runs before the camera controls
  if (state.tool !== "select" || !bench3d) return;
  const comp = state.components.find((c) => c.id === bench3d.pick(e.clientX, e.clientY));
  if (!comp || comp.type === "wire" || state.locked.includes(comp.id)) return;
  drag.pending = { type: comp.type, comp, x: e.clientX, y: e.clientY };
  bench3d.holdControls(true);
}, { capture: true });
window.addEventListener("pointermove", (e) => {
  if (drag.active) { moveDrag(e); return; }
  const p = drag.pending;
  if (!p) return;
  const dx = e.clientX - p.x, dy = e.clientY - p.y;
  if (Math.hypot(dx, dy) < 8) return;
  drag.pending = null;
  if (p.tray && e.pointerType !== "mouse" && Math.abs(dx) > Math.abs(dy)) return; // a sideways swipe scrolls the tray
  beginDrag(p, e);
});
window.addEventListener("pointerup", (e) => { if (drag.active) endDrag(e); drag.pending = null; bench3d?.holdControls(false); });
window.addEventListener("pointercancel", (e) => { if (drag.active) endDrag(e, true); drag.pending = null; bench3d?.holdControls(false); });

// ---------------------------------------------------------------- the inspector
function drawInspector() {
  const box = $("#inspector");
  const c = state.components.find((x) => x.id === state.selected);
  if (!c) { box.hidden = true; return; }
  const t = state.t, r = state.solution.components[c.id] ?? {};
  const lang = state.ui;
  const locked = state.locked.includes(c.id);
  let control = "";
  if (c.type === "battery") control = `<label>${t.value} : <b id="val">${c.V} V</b><input type="range" id="slider" min="0" max="24" step="0.5" value="${c.V}" ${locked ? "disabled" : ""}></label>`;
  if (c.type === "resistor" || c.type === "bulb") {
    const list = VALUES[c.type];
    const i = list.reduce((best, v, k) => (Math.abs(v - c.R) < Math.abs(list[best] - c.R) ? k : best), 0);
    control = `<label>${t.value} : <b id="val">${c.R} Ω</b><input type="range" id="slider" min="0" max="${list.length - 1}" step="1" value="${i}" ${locked ? "disabled" : ""}></label>`;
  }
  if (c.type === "switch") control = `<div class="row"><button class="btn primary" id="toggle" ${locked ? "disabled" : ""}>${c.closed ? t.closed : t.open}</button></div>`;
  const readings = `<div class="readings"><div><span>${t.voltage}</span>${format(Math.abs(r.V ?? 0), "V")}</div><div><span>${t.current}</span>${format(Math.abs(r.I ?? 0), "A")}</div><div><span>${t.power}</span>${format(r.P ?? 0, "W")}</div></div>`;
  box.innerHTML = `<h3>${esc(TYPES[c.type].name[lang])} ${esc(c.id)}${locked ? ` <small class="muted">${t.locked}</small>` : ""}<button class="close" id="close" aria-label="close">×</button></h3>
    ${readings}${control}
    <div class="row">${["battery", "led"].includes(c.type) && !locked ? `<button class="btn" id="flip">${t.flip}</button>` : ""}
    ${c.burnt ? `<button class="btn primary" id="repair">${t.repair}</button>` : ""}
    ${!locked ? `<button class="btn" id="remove">${t.remove}</button>` : ""}</div>`;
  box.hidden = false;
  box.querySelector("#close").onclick = () => { state.selected = null; drawBoard(); drawInspector(); };
  const slider = box.querySelector("#slider");
  if (slider) slider.oninput = () => {
    if (c.type === "battery") c.V = Number(slider.value); else c.R = VALUES[c.type][Number(slider.value)];
    box.querySelector("#val").textContent = c.type === "battery" ? `${c.V} V` : `${c.R} Ω`;
    state.solution = solve(state.components);
    const burntNow = state.components.filter((x) => state.solution.components[x.id]?.burntNow);
    for (const x of burntNow) x.burnt = true;
    state.session.circuit(state.components);
    drawBoard();
    box.querySelector(".readings").outerHTML = (() => { const rr = state.solution.components[c.id] ?? {}; return `<div class="readings"><div><span>${t.voltage}</span>${format(Math.abs(rr.V ?? 0), "V")}</div><div><span>${t.current}</span>${format(Math.abs(rr.I ?? 0), "A")}</div><div><span>${t.power}</span>${format(rr.P ?? 0, "W")}</div></div>`; })();
    refreshPanel(false);
    react(burntNow);
  };
  box.querySelector("#toggle")?.addEventListener("click", () => { c.closed = !c.closed; recompute(); });
  box.querySelector("#flip")?.addEventListener("click", () => { [c.a, c.b] = [c.b, c.a]; recompute(); });
  box.querySelector("#repair")?.addEventListener("click", () => { c.burnt = false; recompute(); });
  box.querySelector("#remove")?.addEventListener("click", () => { state.components = state.components.filter((x) => x !== c); state.selected = null; recompute(); });
}

// ---------------------------------------------------------------- the panel
const TABS = ["guide", "tutor", "quiz"];
function buildTabs() {
  $("#tabs").innerHTML = TABS.map((tab) => `<button class="tab" role="tab" data-tab="${tab}" aria-selected="${state.tab === tab}">${esc(state.t[tab])}</button>`).join("");
  $("#tabs").onclick = (e) => { const b = e.target.closest("[data-tab]"); if (b) showTab(b.dataset.tab); };
  refreshPanel(true);
}
function showTab(tab) {
  state.tab = tab;
  for (const b of document.querySelectorAll(".tab")) b.setAttribute("aria-selected", String(b.dataset.tab === tab));
  refreshPanel(true);
}
// Live parts of the panel (goals, counts) update on every change; the rest only when asked.
function refreshPanel(full) {
  if (!state.lab) return;
  if (full || state.tab === "guide") {
    const body = $("#tab-body");
    const focus = document.activeElement?.id;
    if (!full && (state.tab === "tutor" || state.tab === "quiz")) return;
    if (!full) { updateLive(); return; }
    body.innerHTML = { guide: guideHtml, tutor: tutorHtml, quiz: quizHtml }[state.tab]();
    wire[state.tab]?.();
    updateLive();
    if (focus) document.getElementById(focus)?.focus();
  }
}

function goalLabel(g) {
  const t = state.t;
  const fr = state.ui === "fr";
  if (g.lit) return `${g.lit} ${fr ? "allumée" : "lit"}`;
  if (g.not_burnt) return fr ? "rien de grillé" : "nothing burnt";
  if (g.not_shorted) return fr ? "pas de court-circuit" : "no short circuit";
  const unit = { current: "A", voltage: "V", power: "W", brightness: "" }[g.quantity];
  const range = [g.min, g.max].map((v) => (v === undefined ? "…" : unit ? format(v, unit) : v)).join(" – ");
  return `${t[g.quantity] ?? g.quantity} ${g.component} : ${range}`;
}
const goalChips = (goals, key) => (goals ?? []).map((g, i) => `<span class="goal" data-goal="${key}:${i}">${esc(goalLabel(g))}</span>`).join("");

function updateLive() {
  // goal chips light up as soon as the circuit meets them
  for (const chip of document.querySelectorAll("[data-goal]")) {
    const [key, i] = chip.dataset.goal.split(":");
    const goals = goalsFor(key);
    if (!goals) continue;
    const met = meets(state.solution, [goals[Number(i)]]).ok && state.preset === presetFor(key);
    chip.classList.toggle("met", met);
  }
  const m = state.mode;
  if (m.kind === "challenge") {
    const c = state.lab.challenges.find((x) => x.id === m.id);
    const ok = state.preset === c.preset && meets(state.solution, c.goals).ok;
    const banner = $("#banner");
    if (ok && !state.done.has(c.id)) {
      state.done.add(c.id);
      state.session.add("success", { id: c.id, title: c.title });
      tima?.say(voice.success, { interrupt: true });
      celebrate();
    }
    if (ok) { banner.hidden = false; banner.className = "banner ok"; banner.textContent = state.t.success; }
    document.getElementById("challenge-status")?.replaceChildren(document.createTextNode(ok ? state.t.success : ""));
  }
  if (m.kind === "activity") {
    const a = state.lab.activities.find((x) => x.id === m.id);
    const step = a.steps[m.step];
    const next = document.getElementById("next-step");
    if (next && step) next.disabled = !stepComplete(a, step);
  }
  const count = document.getElementById("log-count");
  if (count) count.textContent = String(state.log.rows.filter((r) => r.preset === state.preset).length);
}
function goalsFor(key) {
  const [kind, id, step] = key.split("|");
  if (kind === "c") return state.lab.challenges.find((x) => x.id === id)?.goals;
  if (kind === "a") return state.lab.activities.find((x) => x.id === id)?.steps[Number(step)]?.goals;
  return null;
}
function presetFor(key) {
  const [kind, id] = key.split("|");
  return kind === "c" ? state.lab.challenges.find((x) => x.id === id)?.preset : state.lab.activities.find((x) => x.id === id)?.preset;
}

// --- guide: the lesson, then guided activities
function stepComplete(a, step) {
  if (step.kind === "predict") return state.predicted[`${a.id}:${a.steps.indexOf(step)}`] !== undefined;
  if (step.kind === "do") return !step.goals || meets(state.solution, step.goals).ok;
  if (step.kind === "measure") return state.log.rows.filter((r) => r.preset === a.preset).length >= (step.points ?? 3);
  return true;
}
function guideHtml() {
  const t = state.t, lab = state.lab, m = state.mode;
  if (m.kind === "activity") {
    const a = lab.activities.find((x) => x.id === m.id);
    const steps = a.steps.slice(0, m.step + 1).map((s, i) => {
      const done = i < m.step;
      const key = `${a.id}:${i}`;
      let inner = "";
      if (s.kind === "predict") {
        const picked = state.predicted[key];
        inner = `<b>${t.predict}</b><div>${esc(s.question)}</div><div class="choices">${s.choices.map((c, k) => `<button class="choice ${picked === undefined ? "" : k === s.answer ? "right" : k === picked ? "wrong" : ""}" data-predict="${key}" data-k="${k}" ${picked !== undefined ? "disabled" : ""}>${esc(c)}</button>`).join("")}</div>
          ${picked !== undefined ? `<div>${picked === s.answer ? t.correct : t.not_quite} <span class="muted">${esc(s.why ?? "")}</span></div>` : ""}`;
      } else if (s.kind === "do") inner = `${esc(s.instruction)}<div>${goalChips(s.goals, `a|${a.id}|${i}`)}</div>`;
      else if (s.kind === "measure") inner = `${esc(s.instruction)}${plotHtml(state.log.rows.filter((r) => r.preset === a.preset))}<div class="muted"><span id="log-count">0</span> / ${s.points} ${t.points_needed}</div>`;
      else inner = `${esc(s.question)}<div class="row" style="margin-top:6px"><button class="btn" data-ask="${esc(s.question)}">${t.explain_this}</button></div>`;
      return `<div class="step ${done ? "done" : ""}">${inner}</div>`;
    }).join("");
    const last = m.step >= a.steps.length;
    return `<div class="mission-head"><button type="button" class="back" data-back aria-label="${t.done}">‹</button><h2>${esc(a.title)}</h2></div><div class="steps">${steps}</div>
      ${last ? `<div class="takeaway"><b>${t.takeaway}</b><br>${esc(a.takeaway ?? "")}</div><div class="row" style="margin-top:10px"><button class="btn primary" data-back>${t.done}</button></div>`
        : `<div class="row"><button class="btn primary" id="next-step">${m.step + 1 >= a.steps.length ? t.done : t.next}</button></div>`}`;
  }
  if (m.kind === "challenge") {
    const c = lab.challenges.find((x) => x.id === m.id);
    return `<div class="mission-head"><button type="button" class="back" data-back aria-label="${t.done}">‹</button><h2>${esc(c.title)}</h2></div>
      <p>${esc(c.statement)}</p><div style="margin:6px 0">${goalChips(c.goals, `c|${c.id}`)}</div><div id="challenge-status" class="muted"></div>
      ${c.hint ? `<div class="row"><button class="btn" data-hint="${c.id}">💡 ${t.hint}</button></div>` : ""}`;
  }
  const offer = state.offerTranslation && lab.origin !== "sample"
    ? `<div class="translate-offer"><div>${esc(t.content_in.replace("{lang}", t.lang_names[lab.language?.slice(0, 2)] ?? lab.language))}</div><div class="row"><button class="btn primary" id="translate">${esc(t.translate)}</button></div><div class="muted" id="translate-status"></div></div>` : "";
  // what to do first; what to know, folded until asked for
  const play = `<svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l12-7.5z" fill="currentColor"/></svg>`;
  const target = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.5"/></svg>`;
  const mission = (kind, id, title, icon, done) => `<button type="button" class="activity ${kind} ${done ? "done" : ""}" data-${kind}="${id}"><span class="play">${icon}</span><span>${esc(title)}</span><span class="chev" aria-hidden="true">${done ? "✓" : "›"}</span></button>`;
  const formulas = lab.formulas ?? [];
  return `${offer}<div class="activities">${lab.activities.map((a) => mission("activity", a.id, a.title, play, state.finished.has(a.id))).join("")}
    ${(lab.challenges ?? []).map((c) => mission("challenge", c.id, c.title, target, state.done.has(c.id))).join("")}</div>
    ${formulas.length ? `<div class="formulas">${formulas.map((f) => `<span class="formula" title="${esc(f.meaning ?? "")}">${esc(f.text)}</span>`).join("")}</div>` : ""}
    <details class="about"><summary>${t.about}</summary><p>${esc(lab.summary)}</p>
      <h3>${t.objectives}</h3><ul>${lab.objectives.map((o) => `<li>${esc(o)}</li>`).join("")}</ul>
      ${formulas.length ? `<h3>${t.formulas}</h3><ul>${formulas.map((f) => `<li><b>${esc(f.text)}</b> <span class="muted">${esc(f.meaning ?? "")}</span></li>`).join("")}</ul>` : ""}</details>`;
}
const wire = {
  guide() {
    const body = $("#tab-body");
    body.querySelectorAll("[data-activity]").forEach((b) => (b.onclick = () => {
      const a = state.lab.activities.find((x) => x.id === b.dataset.activity);
      state.mode = { kind: "activity", id: a.id, step: 0 };
      usePreset(a.preset);
      state.session.add("mode", { mode: "activity", title: a.title }); // after the preset: the video shows its circuit
      refreshPanel(true);
      tima?.say(voice.activity(a), { interrupt: true });
      narrateStep();
    }));
    body.querySelectorAll("[data-challenge]").forEach((b) => (b.onclick = () => {
      const c = state.lab.challenges.find((x) => x.id === b.dataset.challenge);
      state.mode = { kind: "challenge", id: c.id };
      usePreset(c.preset, c.locked ?? []);
      state.session.add("mode", { mode: "challenge", title: c.title });
      refreshPanel(true);
      tima?.say(voice.challenge(c), { interrupt: true });
      idleHint();
    }));
    body.querySelectorAll("[data-hint]").forEach((b) => (b.onclick = () => {
      const hint = state.lab.challenges.find((x) => x.id === b.dataset.hint).hint;
      b.outerHTML = `<div class="muted">💡 ${esc(hint)}</div>`;
      tima?.say(hint, { interrupt: true });
    }));
    body.querySelectorAll("[data-predict]").forEach((b) => (b.onclick = () => {
      const k = Number(b.dataset.k), [id, i] = b.dataset.predict.split(":");
      const step = state.lab.activities.find((x) => x.id === id).steps[Number(i)];
      state.predicted[b.dataset.predict] = k;
      state.session.add("predict", { question: step.question, choice: step.choices[k], right: k === step.answer });
      refreshPanel(true);
      tima?.say(k === step.answer ? voice.right(step.why) : voice.wrong(step.why), { interrupt: true });
    }));
    body.querySelector("#next-step")?.addEventListener("click", advance);
    body.querySelectorAll("[data-back]").forEach((b) => (b.onclick = () => { state.mode = { kind: "free" }; state.session.add("mode", {}); refreshPanel(true); tima?.hush(); }));
    body.querySelectorAll("[data-ask]").forEach((b) => (b.onclick = () => askTutor(b.dataset.ask)));
    body.querySelector("#translate")?.addEventListener("click", translateLab);
  },
  tutor() {
    const body = $("#tab-body");
    const input = body.querySelector("#question");
    body.querySelector("#send").onclick = () => { const q = input.value.trim(); if (q) { input.value = ""; askTutor(q); } };
    input.onkeydown = (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); body.querySelector("#send").click(); } };
    body.querySelector("#mic").onclick = () => tima?.tap();
  },
  quiz() {
    $("#tab-body").querySelectorAll("[data-q]").forEach((b) => (b.onclick = () => {
      const q = state.lab.quiz[Number(b.dataset.q)], k = Number(b.dataset.k);
      state.quiz[b.dataset.q] = k;
      state.session.add("quiz", { question: q.question, right: k === q.answer });
      refreshPanel(true);
    }));
  },
};

function recordMeasure() {
  const r = state.solution.components[state.log.target];
  if (!r) return;
  const battery = state.components.find((c) => c.type === "battery");
  state.log.rows.push({ preset: state.preset, part: state.log.target, U: Math.abs(r.V), I: Math.abs(r.I), source: battery?.V });
  state.session.add("measure", { part: state.log.target, U: Math.abs(r.V), I: Math.abs(r.I) });
}

// --- steps the circuit completes move on by themselves; measurements are taken for the student
let stepTimer = null, measureTimer = null, hintTimer = null;
function advance() {
  state.mode.step += 1;
  refreshPanel(true);
  narrateStep();
}
function narrateStep() {
  const m = state.mode, a = state.lab.activities.find((x) => x.id === m.id);
  const step = a.steps[m.step];
  if (step) { tima?.say(voice.step(step)); autoStep(); return; }
  state.finished.add(a.id);
  tima?.say(`${voice.takeaway(a.takeaway)} ${voice.mission_done}`);
  celebrate();
}
function autoStep() {
  const m = state.mode;
  if (m.kind !== "activity") return;
  const a = state.lab.activities.find((x) => x.id === m.id), step = a.steps[m.step];
  if (!step) return;
  if (step.kind === "measure") { clearTimeout(measureTimer); measureTimer = setTimeout(autoMeasure, 650); }
  if ((step.kind === "do" || step.kind === "measure") && stepComplete(a, step)) {
    clearTimeout(stepTimer);
    const at = m.step;
    stepTimer = setTimeout(() => { if (state.mode === m && m.step === at) { tima?.say(voice.praise()); advance(); } }, 1500);
  }
}
/** A new, settled reading on the part being studied becomes a point of the U(I) graph. */
function autoMeasure() {
  const r = state.solution.components[state.log.target];
  if (!r || Math.abs(r.I) < 1e-6 || state.mode.kind !== "activity") return;
  const U = Math.abs(r.V);
  const rows = state.log.rows.filter((x) => x.preset === state.preset && x.part === state.log.target);
  if (rows.some((x) => Math.abs(x.U - U) < Math.max(0.05, U * 0.04))) return;
  recordMeasure();
  if (!rows.length) tima?.say(voice.first_point);
  refreshPanel(true);
  autoStep();
}
/** Stuck on a challenge for a while: Tima offers its hint, once. */
function idleHint() {
  clearTimeout(hintTimer);
  const m = state.mode;
  if (m.kind !== "challenge" || state.done.has(m.id) || m.hinted) return;
  const c = state.lab.challenges.find((x) => x.id === m.id);
  if (c.hint) hintTimer = setTimeout(() => { if (state.mode === m && !state.done.has(m.id)) { m.hinted = true; tima?.say(voice.hint(c.hint)); } }, 25_000);
}

// --- Tima reacts to what the circuit does: a short, a burnt part, a part lighting up
function react(burntNow = []) {
  const sol = state.solution;
  const lit = state.components.filter((c) => !c.burnt && ((sol.components[c.id]?.brightness ?? 0) > 0.05 || sol.components[c.id]?.lit));
  bench3d?.poke();
  if (state.quiet) { for (const c of lit) state.announced.add(c.id); state.shorted = sol.shorted; return; }
  if (sol.shorted && !state.shorted) tima?.say(voice.short, { interrupt: true });
  else if (burntNow.length) { tima?.say(voice.burnt(burntNow[0].id), { interrupt: true }); burntNow.forEach((c) => burst(c.id)); }
  else {
    const fresh = lit.find((c) => !state.announced.has(c.id));
    if (fresh) tima?.say(voice.lit(TYPES[fresh.type].name[state.ui], fresh.id));
  }
  for (const c of lit) state.announced.add(c.id);
  state.shorted = sol.shorted;
  idleHint();
  autoStep();
}
/** A part burning out flashes on the schematic and throws sparks on the 3D bench. */
function burst(id) {
  bench3d?.burst(id);
  document.querySelector(`#board g[data-id="${id}"]`)?.animate?.([{ filter: "drop-shadow(0 0 0 #ff9500)" }, { filter: "drop-shadow(0 0 14px #ff9500)" }, { filter: "drop-shadow(0 0 0 #ff9500)" }], { duration: 700 });
}
function celebrate() {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const wrap = $(".canvas-wrap"), colours = ["#0a66ff", "#3ad1ff", "#ffd54a", "#ff4fa3", "#34c759"];
  for (let i = 0; i < 40; i++) {
    const bit = document.createElement("i");
    bit.className = "confetti";
    bit.style.background = colours[i % colours.length];
    bit.style.left = `${8 + Math.random() * 84}%`;
    wrap.appendChild(bit);
    bit.animate([{ transform: "translate(0, -20px) rotate(0)", opacity: 1 }, { transform: `translate(${(Math.random() - 0.5) * 180}px, ${280 + Math.random() * 220}px) rotate(${Math.random() * 720}deg)`, opacity: 0 }],
      { duration: 1400 + Math.random() * 700, easing: "cubic-bezier(.2,.6,.4,1)" }).onfinish = () => bit.remove();
  }
}

function plotHtml(rows) {
  if (rows.length < 1) return "";
  const W = 320, H = 220, m = 34;
  const maxI = Math.max(...rows.map((r) => r.I), 1e-6) * 1.15, maxU = Math.max(...rows.map((r) => r.U), 1e-6) * 1.15;
  const X = (i) => m + (i / maxI) * (W - m - 10), Y = (u) => H - m - (u / maxU) * (H - m - 10);
  // the line through the origin that fits best: U = R I, R = Σ U I / Σ I²
  const sII = rows.reduce((s, r) => s + r.I * r.I, 0), sUI = rows.reduce((s, r) => s + r.U * r.I, 0);
  const R = sII > 0 ? sUI / sII : 0;
  const fit = rows.length >= 2 && R > 0 ? `<line x1="${X(0)}" y1="${Y(0)}" x2="${X(maxI)}" y2="${Y(R * maxI)}" stroke="var(--accent)" stroke-width="2" stroke-dasharray="6 4"/>
    <text x="${W - 12}" y="18" text-anchor="end" class="label" fill="var(--accent)">${state.t.slope} ≈ ${R.toFixed(0)} Ω</text>` : "";
  return `<svg class="plot" viewBox="0 0 ${W} ${H}" role="img" aria-label="U(I)">
    <line x1="${m}" y1="${H - m}" x2="${W - 6}" y2="${H - m}" stroke="var(--muted)"/><line x1="${m}" y1="${H - m}" x2="${m}" y2="8" stroke="var(--muted)"/>
    <text x="${W - 8}" y="${H - m + 18}" text-anchor="end" class="label" style="font-size:11px">I (mA) → ${(maxI * 1000).toFixed(0)}</text>
    <text x="${m - 6}" y="16" text-anchor="end" class="label" style="font-size:11px">U (V)</text>
    <text x="${m - 6}" y="${Y(maxU / 1.15) + 4}" text-anchor="end" class="label" style="font-size:10px">${(maxU / 1.15).toFixed(1)}</text>
    ${fit}${rows.map((r) => `<circle cx="${X(r.I)}" cy="${Y(r.U)}" r="4.5" fill="var(--blue)"/>`).join("")}</svg>`;
}

// --- quiz
function quizHtml() {
  const t = state.t, quiz = state.lab.quiz ?? [];
  const answered = Object.keys(state.quiz).length, right = quiz.filter((q, i) => state.quiz[i] === q.answer).length;
  return `<h2>${t.quiz}</h2>` + quiz.map((q, i) => {
    const picked = state.quiz[i];
    return `<div class="card"><b>${i + 1}. ${esc(q.question)}</b><div class="choices">${q.choices.map((c, k) => `<button class="choice ${picked === undefined ? "" : k === q.answer ? "right" : k === picked ? "wrong" : ""}" data-q="${i}" data-k="${k}" ${picked !== undefined ? "disabled" : ""}>${esc(c)}</button>`).join("")}</div>
      ${picked !== undefined ? `<div class="muted">${esc(q.explanation ?? "")}</div>` : ""}</div>`;
  }).join("") + (answered === quiz.length && quiz.length ? `<div class="takeaway"><b>${t.score} : ${right} / ${quiz.length}</b></div>` : "");
}

// ---------------------------------------------------------------- the tutor
function tutorHtml() {
  const t = state.t;
  return `<div class="chat" id="chat">${state.chat.map((m) => `<div class="msg ${m.role === "user" ? "me" : "ai"}">${esc(m.content)}</div>`).join("")}</div>
    <div class="ask"><textarea id="question" placeholder="${esc(t.ask_placeholder)}"></textarea>
    <button class="btn" id="mic" title="${t.mic}" aria-label="${t.mic}">🎤</button><button class="btn primary" id="send">${t.send}</button></div>`;
}
/** What the tutor sees: the circuit as solved, what the student is doing, their measurements. */
function circuitContext() {
  const parts = state.components.filter((c) => c.type !== "wire").map((c) => {
    const r = state.solution.components[c.id] ?? {};
    return { id: c.id, type: c.type, value: c.type === "battery" ? `${c.V} V` : c.R !== undefined ? `${c.R} ohm` : c.type === "switch" ? (c.closed ? "closed" : "open") : undefined,
      voltage_V: +Math.abs(r.V ?? 0).toFixed(4), current_A: +Math.abs(r.I ?? 0).toFixed(6), power_W: +(r.P ?? 0).toFixed(5),
      ...(r.reading !== undefined ? { reading: +r.reading.toFixed(5) } : {}), ...(r.lit !== undefined ? { lit: r.lit } : {}), ...(c.burnt ? { burnt: true } : {}), ...(r.brightness !== undefined ? { brightness: +r.brightness.toFixed(2) } : {}) };
  });
  const m = state.mode;
  const doing = m.kind === "challenge" ? { challenge: state.lab.challenges.find((x) => x.id === m.id)?.statement }
    : m.kind === "activity" ? { activity: state.lab.activities.find((x) => x.id === m.id)?.title, step: state.lab.activities.find((x) => x.id === m.id)?.steps[m.step] } : {};
  return { preset: state.preset, parts, short_circuit: state.solution.shorted, ...doing, measurements: state.log.rows.slice(-10) };
}
async function askTutor(question) {
  state.chat.push({ role: "user", content: question });
  if (state.tab === "tutor") refreshPanel(true);
  const thinking = { role: "assistant", content: state.t.thinking };
  state.chat.push(thinking);
  if (state.tab === "tutor") refreshPanel(true);
  const image = await lookAtBench(); // Muse Spark's vision sees the bench as the student does
  tima?.think(true);
  try {
    const r = await fetch(`/api/labs/${encodeURIComponent(state.labId)}/tutor/stream`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ question, history: state.chat.slice(0, -2).slice(-8), context: circuitContext(), language: state.ui, ...(image ? { image } : {}) }),
    });
    if (!r.ok || !r.body) throw new Error(r.status);
    // the answer streams in; each finished sentence goes to Tima at once, so she speaks while Muse Spark writes
    let written = "", said = 0, pending = "";
    const speakUpTo = (end) => {
      if (end <= said) return;
      if (!said) tima?.hush();
      tima?.say(written.slice(said, end));
      said = end;
    };
    const reader = r.body.pipeThrough(new TextDecoderStream()).getReader();
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      pending += value;
      let cut;
      while ((cut = pending.indexOf("\n\n")) >= 0) {
        const line = pending.slice(0, cut);
        pending = pending.slice(cut + 2);
        if (!line.startsWith("data: ")) continue;
        const event = JSON.parse(line.slice(6));
        if (event.error) throw new Error(event.error);
        if (!event.delta) continue;
        if (!written) tima?.think(false);
        written += event.delta;
        thinking.content = written;
        showLastAnswer(written);
        speakUpTo(lastSentenceEnd(written));
      }
    }
    if (!written) throw new Error("empty answer");
    speakUpTo(written.length);
    tima?.say("", { followUp: true }); // then she listens for a reply, without her name
  } catch {
    if (thinking.content === state.t.thinking) { // nothing came: the engine answers instead
      thinking.content = offlineAnswer();
      tima?.say(thinking.content, { interrupt: true });
    }
  }
  tima?.think(false);
  state.session.add("tutor", { q: question, a: thinking.content });
  if (state.tab === "tutor") refreshPanel(true);
}
/** Where the last complete sentence of a text ends (0 if none yet): ". " but not "1.5". */
function lastSentenceEnd(text) {
  let end = 0;
  for (const m of text.matchAll(/[.!?…]+(?=\s)/g)) end = m.index + m[0].length;
  return end;
}
function showLastAnswer(text) {
  const last = document.querySelector("#chat .msg.ai:last-child");
  if (last && state.tab === "tutor") last.textContent = text;
}
/** Without a connection the tutor falls back on what the engine knows: the readings, U/I for
 *  each part, the short circuit or the burnt part, and the challenge's hint. */
function offlineAnswer() {
  const fr = state.ui === "fr", sol = state.solution;
  const lines = [state.t.tutor_offline];
  if (sol.shorted) lines.push(state.t.short);
  for (const c of state.components) {
    const r = sol.components[c.id];
    if (!r) continue;
    if (c.burnt) lines.push(`${c.id} ${state.t.burnt}.`);
    else if (["resistor", "bulb", "led"].includes(c.type) && Math.abs(r.I) > 1e-6)
      lines.push(`${c.id} : U = ${format(Math.abs(r.V), "V")}, I = ${format(Math.abs(r.I), "A")}${c.type !== "led" ? `, U / I ≈ ${(Math.abs(r.V) / Math.abs(r.I)).toFixed(0)} Ω` : ""}.`);
  }
  const m = state.mode;
  if (m.kind === "challenge") {
    const c = state.lab.challenges.find((x) => x.id === m.id);
    const miss = meets(sol, c.goals).failures?.[0];
    if (c.hint) lines.push(`💡 ${c.hint}`);
    else if (miss) lines.push(fr ? `Il reste : ${miss}` : `Still to do: ${miss}`);
  }
  const f = state.lab.formulas?.[0];
  if (f) lines.push(`${fr ? "Rappel" : "Remember"} : ${f.text}`);
  return lines.join("\n");
}
// ---------------------------------------------------------------- Tima, the voice guide
/** What the server offers Tima: Meta's realtime ears (with a key), and Voxtral's voice. */
async function serverVoice() {
  try { const h = await (await fetch("/api/health")).json(); return { ears: h.live_ears, voice: h.voice }; } catch { return {}; }
}
async function setUpTima() {
  voice = lines(state.ui);
  tima = new Tima($("#tima"), {
    lang: state.ui, t: state.t, onAsk: askTutor, live: await serverVoice(),
    onLook: () => askTutor(state.t.look_question),
    onSentence: spotlight,
  });
}
/** The parts Tima names in the sentence she is saying glow on the bench (R1, L2, D1...). */
function spotlight(line) {
  const named = new Set(String(line).match(/\b[BRLSDAV]\d{1,2}\b/g) ?? []);
  state.spot = state.components.filter((c) => named.has(c.id)).map((c) => c.id);
  for (const g of document.querySelectorAll("#board #parts g.spot")) g.classList.remove("spot");
  for (const id of state.spot) document.querySelector(`#board #parts g[data-id="${id}"]`)?.classList.add("spot");
  bench3d?.spotlight(state.spot);
}
/** A picture of the bench as it is on screen (the 3D table or the schematic), at most 1024
 *  pixels wide, while a scan line sweeps over it. Null when it cannot be taken. */
async function lookAtBench() {
  const stage = $(".stage");
  stage.classList.remove("scan");
  void stage.offsetWidth; // restart the sweep
  stage.classList.add("scan");
  tima?.look(true);
  try {
    let source;
    if (state.view === "3d" && bench3d) source = bench3d.snapshot();
    else {
      const svg = $("#board"), box = svg.viewBox.baseVal;
      const markup = standaloneSvg({ viewBox: [box.x, box.y, box.width, box.height], html: svg.innerHTML }, box.width * 2, box.height * 2);
      source = new Image();
      source.src = URL.createObjectURL(new Blob([markup], { type: "image/svg+xml" }));
      await source.decode();
    }
    const width = Math.min(1024, source.width), height = Math.round((source.height * width) / source.width);
    const canvas = Object.assign(document.createElement("canvas"), { width, height });
    canvas.getContext("2d").drawImage(source, 0, 0, width, height);
    if (source.src?.startsWith("blob:")) URL.revokeObjectURL(source.src);
    return canvas.toDataURL("image/jpeg", 0.82);
  } catch (error) {
    console.warn("no picture of the bench", error);
    return null;
  } finally {
    setTimeout(() => { tima?.look(false); stage.classList.remove("scan"); }, 900);
  }
}
const missionCount = () => (state.lab.activities?.length ?? 0) + (state.lab.challenges?.length ?? 0);
/** One tap opens the lab: browsers only let a page speak after one. Then the camera flies in
 *  and Tima says what the lab is about and what its missions are. */
function showIntro() {
  const intro = $("#intro"), t = state.t;
  $("#intro-title").textContent = state.lab.title;
  if (state.lab.cover) Object.assign($("#intro-cover"), { src: state.lab.cover, hidden: false }); // drawn by Muse Image
  $("#intro-sub").textContent = voice.missions(missionCount());
  $("#intro-start").textContent = t.intro_start;
  $("#intro-quiet").textContent = t.intro_quiet;
  intro.hidden = false;
  const open = (quiet) => {
    intro.classList.add("out");
    setTimeout(() => { intro.hidden = true; }, 650);
    tima.start({ quiet });
    bench3d?.flyIn();
    if (!quiet) tima.toggleWake(true);
    if (toured()) tima.say(voice.welcome(state.lab, missionCount()));
    else setTimeout(guidedTour, 900); // after the camera's swoop: a first visit gets the tour
  };
  $("#intro-start").onclick = () => open(false);
  $("#intro-quiet").onclick = () => open(true);
  $("#intro-start").focus();
  // straight from the teacher's page, which has just made this lab: the tap there still counts,
  // so the lab opens by itself and Tima speaks at once
  const params = new URLSearchParams(location.search);
  if (params.get("fresh") === "1" && navigator.userActivation?.hasBeenActive) {
    params.delete("fresh");
    history.replaceState(null, "", `${location.pathname}?${params}`); // a reload shows the intro again
    open(false);
  }
}

// ---------------------------------------------------------------- translation (Muse Spark)
async function translateLab(e) {
  const t = state.t, status = $("#translate-status");
  e.target.disabled = true;
  status.textContent = t.translating;
  try {
    const r = await fetch(`/api/labs/${encodeURIComponent(state.labId)}/translate`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ language: state.ui }) });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(body.detail ?? r.status);
    const url = new URL(location.href);
    url.searchParams.set("lab", body.id);
    location.assign(url);
  } catch (error) {
    status.textContent = `${t.translate_failed} ${error.message}`;
    e.target.disabled = false;
  }
}

// ---------------------------------------------------------------- 2D / 3D
async function setView(next) {
  if (next === state.view) return;
  const canvas = $("#bench3d");
  if (next === "3d" && !bench3d) {
    try {
      const { Bench3D } = await import("./bench3d.js");
      bench3d = new Bench3D(canvas, { onPick: pick3d });
      bench3d.setHands(Boolean(hands));
    } catch (error) { console.error(error); return; } // no WebGL: stay in 2D
  }
  state.view = next;
  state.session.add("view", { view: next });
  for (const b of document.querySelectorAll("#view-switch [data-view]")) b.setAttribute("aria-pressed", String(b.dataset.view === next));
  $("#board").toggleAttribute("hidden", next === "3d"); // an <svg> has no .hidden property
  canvas.hidden = next !== "3d";
  if (next === "3d") { state.tool = "select"; buildToolbar(); bench3d.resize(); bench3d.start(); } else { bench3d?.stop(); buildToolbar(); }
  $("#hint").textContent = next === "3d" ? state.t.build_in_2d : state.t.place_hint;
  drawBoard();
}
function pick3d(id, point) {
  if (state.tool !== "select" && point) { // a part in hand: tapping the bench puts it there
    const edge = bench3d.edgeAt(point.x, point.y);
    if (edge) placeAt(state.tool, edge.a, edge.b);
    return;
  }
  const c = state.components.find((x) => x.id === id);
  if (!c || c.type === "wire") { state.selected = null; drawBoard(); drawInspector(); return; }
  if (c.type === "switch" && !state.locked.includes(c.id)) c.closed = !c.closed;
  state.selected = c.id;
  recompute();
}
$("#view-switch").addEventListener("click", (e) => { const b = e.target.closest("[data-view]"); if (b) setView(b.dataset.view); });
// ---------------------------------------------------------------- the guided tour
const TOUR_KEY = "timalens-tour-done";
const toured = () => { try { return localStorage.getItem(TOUR_KEY) === "1"; } catch { return true; } };
let touring = false;
async function guidedTour() {
  if (touring) return;
  touring = true;
  const { runTour } = await import("./tour.js");
  await tima?.sayAndWait(voice.tour_intro, { interrupt: true });
  const finished = await runTour({ steps: voice.tour, tima, t: state.t });
  try { localStorage.setItem(TOUR_KEY, "1"); } catch { /* private window: the tour comes back next time */ }
  if (finished) tima?.say(voice.tour_end(missionCount()));
  touring = false;
}
$("#tour").addEventListener("click", () => { tima?.start(); guidedTour(); });

// ---------------------------------------------------------------- the dock: the other labs, and the teacher's page
async function fillDock() {
  let labs = [];
  try { labs = await (await fetch(`/api/labs?lang=${state.ui}`)).json(); } catch { /* offline: the teacher's link still shows */ }
  $("#dock").innerHTML = `<span class="dock-title">${esc(state.t.labs)}</span>`
    + labs.map((l) => `<a class="dock-lab ${l.id === state.labId ? "current" : ""}" href="/lab?lab=${encodeURIComponent(l.id)}">${l.cover ? `<img src="${esc(l.cover)}" alt="">` : ""}<span>${esc(l.title)}</span><span class="pill">${l.view === "3d" ? "3D" : "2D"}</span></a>`).join("")
    + `<a class="dock-teach" href="/teach">＋ ${esc(state.t.teach)}</a>`;
}

// ---------------------------------------------------------------- hands (the webcam, tracked in the browser)
let hands = null;
const GESTURES = ["point", "pinch", "open", "fist"];
async function toggleHands() {
  const button = $("#hands"), view = $("#hand-view");
  if (hands) {
    hands.stop();
    hands = window.timalensHands = null;
    bench3d?.setHands(false);
    view.hidden = true;
    button.setAttribute("aria-pressed", "false");
    return;
  }
  button.disabled = true;
  try {
    const { HandControl } = await import("./hands.js");
    $("#gestures").innerHTML = GESTURES.map((g) => `<span data-g="${g}">${esc(state.t[`g_${g}`])}</span>`).join("");
    const control = new HandControl({
      video: $("#hand-video"), sketch: $("#hand-sketch"), cursor: $("#hand-cursor"),
      onRotate: (dx, dy) => bench3d?.turn(dx, dy),
      onTalk: () => tima?.talk(),
      onGesture: (g) => { for (const chip of $("#gestures").children) chip.classList.toggle("on", chip.dataset.g === g); },
    });
    view.hidden = false;
    await control.start();
    hands = window.timalensHands = control; // the end-to-end tests feed it hands
    bench3d?.setHands(true);
    button.setAttribute("aria-pressed", "true");
    tima?.say(voice.hands, { interrupt: true });
  } catch (error) {
    view.hidden = true;
    console.warn("hands", error);
    tima?.say(`${state.t.hands_failed} ${error.message ?? error}`, { interrupt: true });
  } finally {
    button.disabled = false;
  }
}
$("#hands").addEventListener("click", toggleHands);

$("#vr").addEventListener("click", async () => {
  await setView("3d");
  try { await bench3d?.enterVR(); } catch (error) { console.error(error); }
});

// ---------------------------------------------------------------- the end: report, video, save
$("#finish").addEventListener("click", openFinish);
function openFinish() {
  const t = state.t, dialog = $("#finish-dialog");
  const s = state.session.summary(state.lab);
  dialog.innerHTML = `<div class="in">
    <h2>${t.finish_title}</h2>
    <div class="tiles">
      <div><b>${s.challenges.solved} / ${s.challenges.total}</b><span>${t.challenges}</span></div>
      <div><b>${s.predictions.right} / ${s.predictions.total}</b><span>${t.predictions_label}</span></div>
      <div><b>${s.quiz.right} / ${s.quiz.total}</b><span>${t.quiz}</span></div>
    </div>
    <div class="row"><span class="muted">${t.video_view}</span>
      <div class="seg" id="video-view"><button type="button" data-view="2d" aria-pressed="${state.view === "2d"}">2D</button><button type="button" data-view="3d" aria-pressed="${state.view === "3d"}">3D</button></div>
      <button class="btn primary" id="make-video">🎬 ${t.make_video}</button></div>
    <div id="video-out"></div>
    <div class="row"><button class="btn" id="save">💾 ${t.save_session}</button><button class="btn" id="download-log">${t.download_log}</button></div>
    <div id="save-out"></div>
    <div class="row" style="justify-content:flex-end"><button class="btn" id="keep-going">${t.keep_going}</button></div>
  </div>`;
  let videoView = state.view;
  dialog.querySelector("#video-view").onclick = (e) => {
    const b = e.target.closest("[data-view]"); if (!b) return;
    videoView = b.dataset.view;
    for (const x of dialog.querySelectorAll("#video-view [data-view]")) x.setAttribute("aria-pressed", String(x.dataset.view === videoView));
  };
  dialog.querySelector("#keep-going").onclick = () => dialog.close();
  dialog.querySelector("#make-video").onclick = (e) => makeVideo(e.target, videoView);
  dialog.querySelector("#save").onclick = saveSession;
  dialog.querySelector("#download-log").onclick = () => download(new Blob([JSON.stringify(state.session.finish(state.lab))], { type: "application/json" }), `timalens-lab-${slug()}.json`);
  dialog.showModal();
}
const slug = () => (state.lab.title ?? "lab").toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
function download(blob, name) {
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: name });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
}
async function makeVideo(button, view) {
  const t = state.t, out = $("#video-out");
  button.disabled = true;
  out.innerHTML = `<div class="muted">${t.making_video} <span id="pct">0</span> %</div><div class="bar"><i id="bar"></i></div>`;
  const live3d = state.view === "3d";
  bench3d?.stop(); // one 3D renderer at a time: the video's
  try {
    const { renderVideo } = await import("./video.js");
    const doc = state.session.finish(state.lab);
    const video = await renderVideo({ lab: state.lab, session: doc, t, view, onProgress: (p) => { $("#bar").style.width = `${Math.round(p * 100)}%`; $("#pct").textContent = Math.round(p * 100); } });
    let blob = video.blob, ext = video.extension;
    if (!video.h264) { // WhatsApp and phones want H.264: the server converts when it can
      try { const r = await fetch("/api/video/mp4", { method: "POST", body: blob }); if (r.ok) { blob = await r.blob(); ext = "mp4"; } } catch { /* keep what we have */ }
    }
    const url = URL.createObjectURL(blob), name = `timalens-lab-${slug()}.${ext}`;
    out.innerHTML = `<video src="${url}" controls playsinline></video>
      <div class="row"><a class="btn primary" href="${url}" download="${name}">⬇ ${t.download_video}</a>
      ${navigator.canShare?.({ files: [new File([blob], name, { type: blob.type })] }) ? `<button class="btn" id="share-video">${t.share}</button>` : ""}
      <span class="muted">${Math.round(video.seconds)} s · ${(blob.size / 1e6).toFixed(1)} Mo</span></div>`;
    out.querySelector("#share-video")?.addEventListener("click", () => navigator.share({ files: [new File([blob], name, { type: blob.type })], title: state.lab.title }).catch(() => {}));
  } catch (error) {
    out.innerHTML = `<div class="muted">${t.video_failed} ${esc(error.message)}</div>`;
  } finally {
    button.disabled = false;
    if (live3d) bench3d.start();
  }
}
async function saveSession() {
  const t = state.t, out = $("#save-out");
  try {
    const r = await fetch(`/api/labs/${encodeURIComponent(state.labId)}/sessions`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(state.session.finish(state.lab)) });
    if (!r.ok) throw new Error(r.status);
    const { id } = await r.json();
    const link = new URL(`/replay?session=${id}`, location.origin).href;
    out.innerHTML = `<div class="takeaway">${t.saved}<br><code>${esc(link)}</code></div>
      <div class="row"><button class="btn" id="copy-link">${t.copy}</button><a class="btn" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(`${state.lab.title} : ${link}`)}">WhatsApp</a></div>`;
    out.querySelector("#copy-link").onclick = async (e) => { try { await navigator.clipboard.writeText(link); e.target.textContent = t.copied; } catch { /* the link is shown */ } };
  } catch {
    out.innerHTML = `<div class="muted">${t.save_failed}</div>`;
  }
}

let mounted = false;
/** Start the lab on the page's markup (once: React may run its effects twice in development). */
export function mountLab() {
  if (mounted) return;
  mounted = true;
  loadLab();
  requestAnimationFrame(animate);
}
