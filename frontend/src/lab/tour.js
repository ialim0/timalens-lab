// The guided tour: on a first visit, Tima shows the student around the lab. Each part of the
// page is lit up in turn while she explains it aloud; the next one comes when she has finished
// speaking (or at "Next"). The page stays usable underneath.

/** steps: [{ at: CSS selector, say: text }]. Resolves when the tour is over (or skipped). */
export async function runTour({ steps, tima, t }) {
  const spot = Object.assign(document.createElement("div"), { className: "tour-spot" });
  const card = Object.assign(document.createElement("div"), { className: "tour-card" });
  card.setAttribute("role", "dialog");
  document.body.append(spot, card);
  let skip = false, next = null;
  card.addEventListener("click", (e) => {
    const act = e.target.closest("[data-tour]")?.dataset.tour;
    if (act === "skip") { skip = true; tima?.hush(); }
    if (act) next?.();
  });
  try {
    for (const [i, step] of steps.entries()) {
      const target = document.querySelector(step.at);
      if (!target || skip) continue;
      target.scrollIntoView({ block: "nearest", behavior: "smooth" });
      place(spot, card, target);
      card.innerHTML = `<div class="tour-count">${i + 1} / ${steps.length}</div><p>${escape(step.say)}</p>
        <div class="tour-row"><button type="button" class="btn" data-tour="skip">${escape(t.tour_skip)}</button>
        <button type="button" class="btn primary" data-tour="next">${escape(t.tour_next)}</button></div>`;
      const said = tima?.sayAndWait(step.say, { interrupt: true }) ?? new Promise((done) => setTimeout(done, 2500));
      await Promise.race([said.then(() => wait(700)), new Promise((done) => { next = done; })]);
      if (skip) break;
    }
  } finally {
    spot.remove();
    card.remove();
  }
  return !skip;
}

function place(spot, card, target) {
  const r = target.getBoundingClientRect(), pad = 8;
  Object.assign(spot.style, { left: `${r.left - pad}px`, top: `${r.top - pad}px`, width: `${r.width + 2 * pad}px`, height: `${r.height + 2 * pad}px` });
  // the card sits below the lit part, or above it when there is no room below
  const below = r.bottom + 190 < innerHeight;
  Object.assign(card.style, {
    left: `${Math.min(Math.max(12, r.left), innerWidth - 352)}px`,
    top: below ? `${r.bottom + 16}px` : "auto",
    bottom: below ? "auto" : `${innerHeight - r.top + 16}px`,
  });
}

const wait = (ms) => new Promise((done) => setTimeout(done, ms));
const escape = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
