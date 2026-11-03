// TimaLens Lab: the student's bench. The circuit is solved by circuit.js on every change;
// nothing here guesses at physics. The panel guides the student (predict, do, measure,
// observe), checks challenges against the solved circuit, keeps a measurement log with its
// U(I) graph, runs the quiz, and talks to the tutor (Muse Spark, through the server).
import { TYPES, format, layout, meets, normalise, solve } from "./circuit.js";
import { boardSvg, chargeAt, chargePaths, px, symbol } from "./board.js";
import { mountLanguageSwitch, strings, uiLanguage } from "./i18n.js";
import { Session } from "./session.js";

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
};
let bench3d = null; // the 3D bench, loaded on first use

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
    lab = await (await fetch(`samples/ohm_${state.ui}.lab.json`)).json(); // served statically, without the server
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
  $("#electrons-label").textContent = state.t.electrons;
  $("#hint").textContent = state.t.place_hint;
  $("#finish").textContent = state.t.finish;
  state.session = new Session(state.labId, lab);
  buildToolbar();
  buildTabs();
  usePreset(lab.presets[0].id);
  if (params.get("view") === "3d" || (lab.view === "3d" && params.get("view") !== "2d")) setView("3d");
}

function usePreset(id, locked = []) {
  const preset = state.lab.presets.find((p) => p.id === id) ?? state.lab.presets[0];
  state.preset = preset.id;
  state.components = layout(preset).components.map(normalise);
  state.locked = locked;
  state.selected = null;
  const first = state.components.find((c) => ["resistor", "bulb", "led"].includes(c.type));
  state.log.target = first?.id ?? null;
  recompute();
}

// ---------------------------------------------------------------- physics, on every change
function recompute() {
  state.solution = solve(state.components);
  for (const c of state.components) if (state.solution.components[c.id]?.burntNow) c.burnt = true;
  if (Object.values(state.solution.components).some((r) => r.burntNow)) state.solution = solve(state.components);
  state.session?.circuit(state.components);
  drawBoard();
  drawInspector();
  refreshPanel(false);
}

// ---------------------------------------------------------------- drawing
function drawBoard() {
  const svg = $("#board");
  const { viewBox, html } = boardSvg({ components: state.components, solution: state.solution, selected: state.selected, locked: state.locked, tool: state.tool, t: state.t });
  svg.setAttribute("viewBox", viewBox.join(" "));
  svg.innerHTML = html;
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
    const off = state.view === "3d" && tool !== "select"; // building happens on the schematic
    return `<button type="button" class="tool" data-tool="${tool}" aria-pressed="${state.tool === tool}" ${off ? "disabled" : ""}>${icon}<span>${esc(name)}</span></button>`;
  }).join("") + `<button type="button" class="tool reset" data-reset="1"><svg viewBox="0 0 24 24"><path d="M4 12a8 8 0 1 0 3-6.2M4 4v5h5" stroke="currentColor" stroke-width="2.2" fill="none"/></svg><span>${esc(t.reset)}</span></button>`;
}
$("#toolbar").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
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

$("#board").addEventListener("click", (e) => {
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
  const a = hit.dataset.a.split(",").map(Number), b = hit.dataset.b.split(",").map(Number);
  const existing = state.components.find((c) => sameEdge(c, a, b));
  if (existing && state.locked.includes(existing.id)) return;
  if (state.tool === "erase") { if (existing) state.components = state.components.filter((c) => c !== existing); recompute(); return; }
  if (existing) state.components = state.components.filter((c) => c !== existing);
  const c = normalise({ id: newId(state.tool), type: state.tool, a, b });
  state.components.push(c);
  if (c.type !== "wire") state.selected = c.id;
  recompute();
});

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
    for (const x of state.components) if (state.solution.components[x.id]?.burntNow) x.burnt = true;
    state.session.circuit(state.components);
    drawBoard();
    box.querySelector(".readings").outerHTML = (() => { const rr = state.solution.components[c.id] ?? {}; return `<div class="readings"><div><span>${t.voltage}</span>${format(Math.abs(rr.V ?? 0), "V")}</div><div><span>${t.current}</span>${format(Math.abs(rr.I ?? 0), "A")}</div><div><span>${t.power}</span>${format(rr.P ?? 0, "W")}</div></div>`; })();
    refreshPanel(false);
  };
  box.querySelector("#toggle")?.addEventListener("click", () => { c.closed = !c.closed; recompute(); });
  box.querySelector("#flip")?.addEventListener("click", () => { [c.a, c.b] = [c.b, c.a]; recompute(); });
  box.querySelector("#repair")?.addEventListener("click", () => { c.burnt = false; recompute(); });
  box.querySelector("#remove")?.addEventListener("click", () => { state.components = state.components.filter((x) => x !== c); state.selected = null; recompute(); });
}

// ---------------------------------------------------------------- the panel
const TABS = ["guide", "challenges", "measures", "tutor", "quiz"];
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
  if (full || state.tab === "guide" || state.tab === "challenges" || state.tab === "measures") {
    const body = $("#tab-body");
    const focus = document.activeElement?.id;
    if (!full && (state.tab === "tutor" || state.tab === "quiz")) return;
    if (!full) { updateLive(); return; }
    body.innerHTML = { guide: guideHtml, challenges: challengesHtml, measures: measuresHtml, tutor: tutorHtml, quiz: quizHtml }[state.tab]();
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
    if (ok && !state.done.has(c.id)) { state.done.add(c.id); state.session.add("success", { id: c.id, title: c.title }); }
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
      else if (s.kind === "measure") inner = `${esc(s.instruction)}${done ? "" : `<div class="row"><button class="btn primary" data-record>${t.record}</button></div>`}<div class="muted"><span id="log-count">0</span> / ${s.points} ${t.points_needed} · <a href="#" data-goto="measures">${t.measures}</a></div>`;
      else inner = `${esc(s.question)}<div class="row" style="margin-top:6px"><button class="btn" data-ask="${esc(s.question)}">${t.explain_this}</button></div>`;
      return `<div class="step ${done ? "done" : ""}">${inner}</div>`;
    }).join("");
    const last = m.step >= a.steps.length;
    return `<h2>${esc(a.title)}</h2><div class="steps">${steps}</div>
      ${last ? `<div class="takeaway"><b>${t.takeaway}</b><br>${esc(a.takeaway ?? "")}</div><div class="row" style="margin-top:10px"><button class="btn" id="back">${t.done}</button></div>`
        : `<div class="row"><button class="btn primary" id="next-step">${m.step + 1 >= a.steps.length ? t.done : t.next}</button></div>`}`;
  }
  const offer = state.offerTranslation && lab.origin !== "sample"
    ? `<div class="translate-offer"><div>${esc(t.content_in.replace("{lang}", t.lang_names[lab.language?.slice(0, 2)] ?? lab.language))}</div><div class="row"><button class="btn primary" id="translate">${esc(t.translate)}</button></div><div class="muted" id="translate-status"></div></div>` : "";
  return `${offer}<h2>${esc(lab.title)}</h2><p>${esc(lab.summary)}</p>
    <h3>${t.objectives}</h3><ul>${lab.objectives.map((o) => `<li>${esc(o)}</li>`).join("")}</ul>
    ${lab.formulas?.length ? `<h3>${t.formulas}</h3>${lab.formulas.map((f) => `<div class="card"><div class="formula">${esc(f.text)}</div><div class="muted">${esc(f.meaning ?? "")}</div></div>`).join("")}` : ""}
    <h3>${t.guide}</h3>${lab.activities.map((a) => `<div class="card"><b>${esc(a.title)}</b><div class="row"><button class="btn primary" data-activity="${a.id}">${t.start}</button></div></div>`).join("")}`;
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
    }));
    body.querySelectorAll("[data-predict]").forEach((b) => (b.onclick = () => {
      const k = Number(b.dataset.k), [id, i] = b.dataset.predict.split(":");
      const step = state.lab.activities.find((x) => x.id === id).steps[Number(i)];
      state.predicted[b.dataset.predict] = k;
      state.session.add("predict", { question: step.question, choice: step.choices[k], right: k === step.answer });
      refreshPanel(true);
    }));
    body.querySelector("#next-step")?.addEventListener("click", () => { state.mode.step += 1; refreshPanel(true); });
    body.querySelector("#back")?.addEventListener("click", () => { state.mode = { kind: "free" }; state.session.add("mode", {}); refreshPanel(true); });
    body.querySelectorAll("[data-ask]").forEach((b) => (b.onclick = () => { showTab("tutor"); askTutor(b.dataset.ask); }));
    body.querySelectorAll("[data-goto]").forEach((b) => (b.onclick = (e) => { e.preventDefault(); showTab(b.dataset.goto); }));
    body.querySelectorAll("[data-record]").forEach((b) => (b.onclick = () => { recordMeasure(); updateLive(); flash(b); }));
    body.querySelector("#translate")?.addEventListener("click", translateLab);
  },
  challenges() {
    const body = $("#tab-body");
    body.querySelectorAll("[data-challenge]").forEach((b) => (b.onclick = () => {
      const c = state.lab.challenges.find((x) => x.id === b.dataset.challenge);
      state.mode = { kind: "challenge", id: c.id };
      usePreset(c.preset, c.locked ?? []);
      state.session.add("mode", { mode: "challenge", title: c.title });
      refreshPanel(true);
    }));
    body.querySelectorAll("[data-hint]").forEach((b) => (b.onclick = () => { b.outerHTML = `<div class="muted">💡 ${esc(state.lab.challenges.find((x) => x.id === b.dataset.hint).hint)}</div>`; }));
  },
  measures() {
    const body = $("#tab-body");
    body.querySelector("#target").onchange = (e) => { state.log.target = e.target.value; };
    body.querySelector("#record").onclick = () => { recordMeasure(); refreshPanel(true); };
    body.querySelector("#clear").onclick = () => { state.log.rows = []; refreshPanel(true); };
    body.querySelector("#export").onclick = () => {
      const csv = ["part,U (V),I (A),U/I (ohm)", ...state.log.rows.map((r) => `${r.part},${r.U.toFixed(3)},${r.I.toFixed(5)},${r.I > 0 ? (r.U / r.I).toFixed(1) : ""}`)].join("\n");
      const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(new Blob([csv], { type: "text/csv" })), download: "timalens-lab-measures.csv" });
      a.click();
    };
  },
  tutor() {
    const body = $("#tab-body");
    const input = body.querySelector("#question");
    body.querySelector("#send").onclick = () => { const q = input.value.trim(); if (q) { input.value = ""; askTutor(q); } };
    input.onkeydown = (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); body.querySelector("#send").click(); } };
    body.querySelector("#mic").onclick = toggleMic;
    body.querySelector("#speak").onchange = (e) => { state.speak = e.target.checked; };
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
function flash(el) { el.animate?.([{ transform: "scale(1.06)" }, { transform: "none" }], { duration: 220 }); }

// --- challenges
function challengesHtml() {
  const t = state.t, m = state.mode;
  return `<h2>${t.challenges}</h2>` + state.lab.challenges.map((c) => {
    const active = m.kind === "challenge" && m.id === c.id;
    return `<div class="card ${active ? "active" : ""}"><b>${state.done.has(c.id) ? "✅ " : ""}${esc(c.title)}</b><div>${esc(c.statement)}</div>
      ${active ? `<div style="margin:6px 0">${goalChips(c.goals, `c|${c.id}`)}</div><div id="challenge-status" class="muted"></div>${c.hint ? `<button class="btn" data-hint="${c.id}">${t.hint}</button>` : ""}`
        : `<div class="row"><button class="btn primary" data-challenge="${c.id}">${t.start}</button></div>`}</div>`;
  }).join("");
}

// --- measurements and the U(I) graph
function measuresHtml() {
  const t = state.t;
  const options = state.components.filter((c) => ["resistor", "bulb", "led"].includes(c.type))
    .map((c) => `<option value="${c.id}" ${c.id === state.log.target ? "selected" : ""}>${c.id}</option>`).join("");
  const rows = state.log.rows;
  const table = rows.length ? `<table class="log"><tr><th>#</th><th>U</th><th>I</th><th>U / I</th></tr>${rows.map((r, i) => `<tr><td>${i + 1} · ${r.part}</td><td>${format(r.U, "V")}</td><td>${format(r.I, "A")}</td><td>${r.I > 1e-6 ? `${(r.U / r.I).toFixed(0)} Ω` : "—"}</td></tr>`).join("")}</table>` : "";
  return `<h2>${t.measures}</h2>
    <div class="row"><label>${t.measure_on} <select id="target">${options}</select></label><button class="btn primary" id="record">${t.record}</button></div>
    ${plotHtml(rows)}${table}
    <div class="row"><button class="btn" id="clear">${t.clear}</button><button class="btn" id="export">${t.export}</button></div>`;
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
  return `<h2>${t.tutor}</h2><div class="chat" id="chat">${state.chat.map((m) => `<div class="msg ${m.role === "user" ? "me" : "ai"}">${esc(m.content)}</div>`).join("")}</div>
    <div class="ask"><textarea id="question" placeholder="${esc(t.ask_placeholder)}"></textarea>
    <button class="btn" id="mic" title="${t.mic}">🎤</button><button class="btn primary" id="send">${t.send}</button></div>
    <label class="muted" style="display:block;margin-top:6px"><input type="checkbox" id="speak" ${state.speak ? "checked" : ""}> ${t.speak}</label>`;
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
  try {
    const r = await fetch(`/api/labs/${encodeURIComponent(state.labId)}/tutor`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ question, history: state.chat.slice(0, -2).slice(-8), context: circuitContext(), language: state.ui }),
    });
    if (!r.ok) throw new Error(await r.text());
    thinking.content = (await r.json()).answer;
  } catch {
    thinking.content = offlineAnswer();
  }
  state.session.add("tutor", { q: question, a: thinking.content });
  if (state.tab === "tutor") refreshPanel(true);
  if (state.speak && "speechSynthesis" in window) {
    const u = new SpeechSynthesisUtterance(thinking.content);
    u.lang = state.ui === "fr" ? "fr-FR" : "en-US"; // the tutor answers in the interface's language
    speechSynthesis.speak(u);
  }
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
// voice questions: record, send to Muse Voice Transcribe through the server, ask
let recorder = null;
async function toggleMic() {
  const button = $("#mic");
  if (recorder) { recorder.stop(); return; }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const chunks = [];
    recorder = new MediaRecorder(stream);
    recorder.ondataavailable = (e) => chunks.push(e.data);
    recorder.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      recorder = null;
      button.classList.remove("on");
      button.textContent = "🎤";
      const form = new FormData();
      form.append("audio", new Blob(chunks, { type: chunks[0]?.type || "audio/webm" }), "question.webm");
      form.append("language", state.ui);
      try {
        const r = await fetch("/api/transcribe", { method: "POST", body: form });
        const text = (await r.json()).text?.trim();
        if (text) askTutor(text);
      } catch { /* the typed question still works */ }
    };
    recorder.start();
    button.classList.add("on");
    button.textContent = "■";
  } catch { /* no microphone: typing still works */ }
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
function pick3d(id) {
  const c = state.components.find((x) => x.id === id);
  if (!c || c.type === "wire") { state.selected = null; drawBoard(); drawInspector(); return; }
  if (c.type === "switch" && !state.locked.includes(c.id)) c.closed = !c.closed;
  state.selected = c.id;
  recompute();
}
$("#view-switch").addEventListener("click", (e) => { const b = e.target.closest("[data-view]"); if (b) setView(b.dataset.view); });

// ---------------------------------------------------------------- the end: report, video, save
$("#finish").addEventListener("click", openFinish);
function openFinish() {
  const t = state.t, dialog = $("#finish-dialog");
  const s = state.session.summary(state.lab);
  dialog.innerHTML = `<div class="in">
    <h2>${t.finish_title}</h2>
    <div class="tiles">
      <div><b>${s.measures}</b><span>${t.measures}</span></div>
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
    const link = new URL(`replay.html?session=${id}`, location.href).href;
    out.innerHTML = `<div class="takeaway">${t.saved}<br><code>${esc(link)}</code></div>
      <div class="row"><button class="btn" id="copy-link">${t.copy}</button><a class="btn" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(`${state.lab.title} : ${link}`)}">WhatsApp</a></div>`;
    out.querySelector("#copy-link").onclick = async (e) => { try { await navigator.clipboard.writeText(link); e.target.textContent = t.copied; } catch { /* the link is shown */ } };
  } catch {
    out.innerHTML = `<div class="muted">${t.save_failed}</div>`;
  }
}

loadLab();
requestAnimationFrame(animate);
