// The circuit as a schematic: pure functions from (components, solution) to SVG, shared by
// the live bench and the video renderer, so a lab's video shows exactly what the student saw.
import { format } from "./circuit.js";

export const CELL = 64, PAD = 36, COLS = 13, ROWS = 8;
const L = CELL / 2;
export const px = ([x, y]) => [PAD + x * CELL, PAD + y * CELL];
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/** One part's symbol, drawn along +x and centred on 0 (French school symbols). */
export function symbol(c, r, angle = 0) {
  const up = `transform="rotate(${-angle})"`; // text stays upright whatever the edge's direction
  switch (c.type) {
    case "wire": return `<line class="wire" x1="${-L}" y1="0" x2="${L}" y2="0"/>`;
    case "battery": return `<line class="wire" x1="${-L}" y1="0" x2="-6" y2="0"/><line class="wire" x1="6" y1="0" x2="${L}" y2="0"/>
      <line class="ink" x1="6" y1="-16" x2="6" y2="16" style="stroke-width:3"/><line class="ink" x1="-6" y1="-9" x2="-6" y2="9" style="stroke-width:6"/>
      <text class="label" x="14" y="-12" ${up}>+</text><text class="label" x="-22" y="-12" ${up}>−</text>`;
    case "resistor": return `<line class="wire" x1="${-L}" y1="0" x2="-17" y2="0"/><line class="wire" x1="17" y1="0" x2="${L}" y2="0"/>
      <rect class="ink-fill" x="-17" y="-7" width="34" height="14" rx="2"/>`;
    case "bulb": {
      const b = r?.brightness ?? 0;
      return `<line class="wire" x1="${-L}" y1="0" x2="-13" y2="0"/><line class="wire" x1="13" y1="0" x2="${L}" y2="0"/>
      ${b > 0.01 ? `<circle r="${14 + 20 * b}" fill="var(--glow)" opacity="${0.15 + 0.6 * b}"/>` : ""}
      <circle class="ink-fill" r="13" style="${c.burnt ? "fill:#555" : b > 0.01 ? `fill:color-mix(in srgb, var(--glow) ${Math.round(40 + 60 * b)}%, var(--board))` : ""}"/>
      <path class="ink" d="M -9 -9 L 9 9 M -9 9 L 9 -9"/>`;
    }
    case "switch": return `<line class="wire" x1="${-L}" y1="0" x2="-14" y2="0"/><line class="wire" x1="14" y1="0" x2="${L}" y2="0"/>
      <circle class="ink-fill" cx="-14" r="3"/><circle class="ink-fill" cx="14" r="3"/>
      <line class="ink" x1="-14" y1="0" x2="${c.closed ? 14 : 10}" y2="${c.closed ? 0 : -15}" style="stroke-width:3.2"/>`;
    case "led": {
      const lit = r?.lit, burnt = c.burnt;
      const colour = burnt ? "#666" : "#e3262c";
      return `<line class="wire" x1="${-L}" y1="0" x2="-10" y2="0"/><line class="wire" x1="10" y1="0" x2="${L}" y2="0"/>
      ${lit ? `<circle r="${12 + 16 * (r.brightness ?? 0)}" fill="${colour}" opacity="${0.15 + 0.45 * (r.brightness ?? 0)}"/>` : ""}
      <path d="M -10 -11 L -10 11 L 10 0 Z" fill="${lit ? colour : "var(--board)"}" stroke="${burnt ? "#666" : "var(--wire)"}" stroke-width="2.4" stroke-linejoin="round"/>
      <line class="ink" x1="10" y1="-11" x2="10" y2="11"/>
      <path class="ink" d="M 2 -13 L 9 -22 M 9 -22 L 4 -21 M 9 -22 L 9 -17 M 9 -11 L 16 -20 M 16 -20 L 11 -19 M 16 -20 L 16 -15" style="stroke-width:1.6"/>
      ${burnt ? `<path d="M -6 -6 L 6 6 M -6 6 L 6 -6" stroke="#000" stroke-width="2.4"/>` : ""}`;
    }
    case "ammeter": case "voltmeter": return `<line class="wire" x1="${-L}" y1="0" x2="-15" y2="0"/><line class="wire" x1="15" y1="0" x2="${L}" y2="0"/>
      <circle class="ink-fill" r="15"/><text class="label" text-anchor="middle" dominant-baseline="central" style="font-size:15px" ${up}>${c.type === "ammeter" ? "A" : "V"}</text>`;
  }
  return "";
}

/** The value and reading beside a part, never rotated, on the outside of the loop. */
function labelFor(c, r, { t, locked }) {
  const [ax, ay] = px(c.a), [bx, by] = px(c.b);
  const mx = (ax + bx) / 2, my = (ay + by) / 2, horizontal = ay === by;
  const above = horizontal && c.a[1] === 0;
  const tx = mx + (horizontal ? 0 : 34), ty = my + (horizontal ? (above ? -24 : 36) : 4);
  const anchor = horizontal ? "middle" : "start";
  let text = "";
  if (c.type === "battery") text = `${c.V} V`;
  else if (c.type === "resistor" || c.type === "bulb") text = `${c.id} · ${c.R} Ω`;
  else if (c.type === "led") text = c.burnt ? `${c.id} · ${t.burnt}` : c.id;
  else if (c.type === "switch") text = c.id;
  let reading = "";
  if (c.type === "ammeter") reading = format(r?.reading ?? 0, "A");
  if (c.type === "voltmeter") reading = format(r?.reading ?? 0, "V");
  const lock = locked.includes(c.id) ? ` 🔒` : "";
  return `${text ? `<text class="label" x="${tx}" y="${ty}" text-anchor="${anchor}">${esc(text)}${lock}</text>` : ""}
    ${reading ? `<text class="reading" x="${tx}" y="${ty}" dy="${text ? 16 : 0}" text-anchor="${anchor}">${reading}</text>` : ""}`;
}

/** The part of the grid shown: the circuit and a margin round it, so it fills a phone's screen. */
export function view(components) {
  const xs = components.flatMap((c) => [c.a[0], c.b[0]]), ys = components.flatMap((c) => [c.a[1], c.b[1]]);
  if (!xs.length) return { x0: 0, y0: 0, x1: COLS - 1, y1: ROWS - 1 };
  return { x0: Math.max(0, Math.min(...xs) - 2), x1: Math.min(COLS - 1, Math.max(...xs) + 2), y0: Math.max(0, Math.min(...ys) - 1), y1: Math.min(ROWS - 1, Math.max(...ys) + 1) };
}
/** The grid edge nearest to a point in grid units (gx, gy), within the bounds v, or null when
 *  the point is off the board. Dragged parts snap to it, in 2D and on the 3D bench alike. */
export function nearestEdge(gx, gy, v = { x0: 0, y0: 0, x1: COLS - 1, y1: ROWS - 1 }) {
  if (gx < v.x0 - 0.6 || gx > v.x1 + 0.6 || gy < v.y0 - 0.6 || gy > v.y1 + 0.6) return null;
  const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
  const rx = clamp(Math.round(gx), v.x0, v.x1), ry = clamp(Math.round(gy), v.y0, v.y1);
  const fx = clamp(Math.floor(gx), v.x0, v.x1 - 1), fy = clamp(Math.floor(gy), v.y0, v.y1 - 1);
  const horizontal = v.x1 > v.x0 && (v.y1 === v.y0 || Math.abs(gy - ry) <= Math.abs(gx - rx));
  return horizontal ? { a: [fx, ry], b: [fx + 1, ry] } : { a: [rx, fy], b: [rx, fy + 1] };
}
export function viewBox(v) {
  return [v.x0 * CELL, v.y0 * CELL, (v.x1 - v.x0) * CELL + 2 * PAD, (v.y1 - v.y0) * CELL + 2 * PAD];
}

/** The board's SVG content (without the <svg> element): grid, parts, labels, and the edges a
 *  tool can be placed on. Charges are drawn by the caller, from chargePaths(). */
export function boardSvg({ components, solution, selected = null, locked = [], tool = "select", t, bounds = null }) {
  const v = bounds ?? view(components); // a drag keeps the board still while a part is lifted
  let dots = "", hits = "";
  for (let y = v.y0; y <= v.y1; y++) for (let x = v.x0; x <= v.x1; x++) {
    const [cx, cy] = px([x, y]);
    dots += `<circle class="grid-dot" cx="${cx}" cy="${cy}" r="2.2"/>`;
  }
  if (tool !== "select") {
    for (let y = v.y0; y <= v.y1; y++) for (let x = v.x0; x <= v.x1; x++) {
      if (x + 1 <= v.x1) hits += edgeHit([x, y], [x + 1, y]);
      if (y + 1 <= v.y1) hits += edgeHit([x, y], [x, y + 1]);
    }
  }
  const parts = components.map((c) => {
    const r = solution?.components[c.id];
    const [ax, ay] = px(c.a), [bx, by] = px(c.b);
    const angle = Math.atan2(by - ay, bx - ax) * 180 / Math.PI;
    const sel = selected === c.id ? `<rect class="selected-ring" x="${-L + 4}" y="-19" width="${CELL - 8}" height="38" rx="8"/>` : "";
    return `<g transform="translate(${(ax + bx) / 2} ${(ay + by) / 2}) rotate(${angle})" data-id="${c.id}">${sel}${symbol(c, r, angle)}
      <rect class="comp-hit" x="${-L}" y="-18" width="${CELL}" height="36" data-id="${c.id}"/></g>`;
  }).join("");
  const labels = components.map((c) => labelFor(c, solution?.components[c.id], { t, locked })).join("");
  return { viewBox: viewBox(v), html: `${dots}<g id="parts">${parts}</g><g id="charges"></g><g>${labels}</g><g id="hits">${hits}</g>` };
}

function edgeHit(a, b) {
  const [ax, ay] = px(a), [bx, by] = px(b);
  return `<line class="edge-hit" x1="${ax}" y1="${ay}" x2="${bx}" y2="${by}" data-a="${a}" data-b="${b}"/>`;
}

/** Moving charges: two per part that carries current, faster as the current grows (log scale). */
export function chargePaths(components, solution, electrons = false) {
  const out = [];
  for (const c of components) {
    const r = solution?.components[c.id];
    if (!r || c.type === "voltmeter" || c.burnt) continue;
    if (Math.abs(r.I) < 2e-5) continue;
    const speed = Math.min(3.2, 0.35 + 0.75 * Math.log10(1 + Math.abs(r.I) * 1000));
    for (let k = 0; k < 2; k++) out.push({ id: c.id, a: c.a, b: c.b, forward: (r.I > 0) !== electrons, speed, phase: k / 2, shorted: !!solution.shorted });
  }
  return out;
}
/** Where a charge is at time t (seconds), as a fraction 0..1 from a to b. */
export const chargeAt = (ch, t) => { const u = (t * ch.speed + ch.phase) % 1; return ch.forward ? u : 1 - u; };

/** The board's colours, for drawing it outside the page (a video frame): the light theme. */
export const LIGHT = { board: "#fbfaf6", wire: "#2b2d31", grid: "#d7d3c8", glow: "#ffd54a", accent: "#0a66ff", danger: "#d93a2f", blue: "#0a66ff", ink: "#03102f", muted: "#5b6478" };

/** A standalone SVG document of the board (styles inlined), to rasterise into a video frame. */
export function standaloneSvg(content, width, height, colours = LIGHT) {
  const css = `svg{--board:${colours.board};--wire:${colours.wire};--grid:${colours.grid};--glow:${colours.glow};--accent:${colours.accent};--blue:${colours.blue}}
    .grid-dot{fill:${colours.grid}}.wire{stroke:${colours.wire};stroke-width:2.6;stroke-linecap:round;fill:none}
    .ink{stroke:${colours.wire};stroke-width:2.6;fill:none;stroke-linecap:round}.ink-fill{fill:${colours.board};stroke:${colours.wire};stroke-width:2.6}
    .label{fill:${colours.ink};font:600 13px system-ui,sans-serif}.reading{fill:${colours.blue};font:700 14px system-ui,sans-serif}
    .comp-hit,.edge-hit{fill:transparent;stroke:none}.selected-ring{fill:none;stroke:${colours.accent};stroke-width:2;stroke-dasharray:5 4}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${content.viewBox.join(" ")}" width="${width}" height="${height}"><style>${css}</style><rect x="${content.viewBox[0]}" y="${content.viewBox[1]}" width="${content.viewBox[2]}" height="${content.viewBox[3]}" fill="${colours.board}"/>${content.html}</svg>`;
}

const BAND = ["#111111", "#7b3f00", "#d0201c", "#f07b13", "#f2d11b", "#2f9e44", "#1f5fd1", "#7a3db8", "#8a8a8a", "#f5f5f5"];
const GOLD = "#c9a227";

/** The four colour bands of a resistor (two digits, multiplier, gold tolerance), e.g. 470 Ω →
 *  yellow, violet, brown, gold. */
export function resistorBands(ohms) {
  let exp = Math.floor(Math.log10(ohms)) - 1;
  let digits = Math.round(ohms / 10 ** exp);
  if (digits >= 100) { digits = Math.round(digits / 10); exp += 1; }
  const d1 = Math.floor(digits / 10), d2 = digits % 10;
  const multiplier = exp === -1 ? GOLD : BAND[Math.max(0, exp)];
  return [BAND[d1], BAND[d2], multiplier, GOLD];
}

