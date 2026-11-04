"use client";

// The student's lab. React lays out the page once; the bench itself (the circuit engine, the
// 2D board, the 3D world, Tima) is driven by src/lab/lab.js, which takes over this markup.
// The component holds no state, so React never re-renders what the bench has changed.
import { useEffect } from "react";
import { Brand } from "./Brand";

export default function LabView() {
  useEffect(() => {
    import("@/lab/lab.js").then(({ mountLab }) => mountLab());
  }, []);

  return (
    <>
      <header className="top">
        <Brand />
        <div className="lesson-title" id="lab-title">…</div>
        <div className="origin" id="lab-origin" />
        <div id="lang-switch" />
        <button type="button" className="btn vr" id="vr" hidden>VR</button>
        <div className="seg" role="group" id="view-switch">
          <button type="button" data-view="2d" aria-pressed="true">2D</button>
          <button type="button" data-view="3d" aria-pressed="false">3D</button>
        </div>
        <button type="button" className="btn primary" id="finish" />
      </header>

      <main className="layout">
        <section className="bench" aria-label="Circuit">
          <div className="toolbar" id="toolbar" role="toolbar" />
          <div className="canvas-wrap">
            <div className="stage">
              <svg id="board" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Circuit" />
              <canvas id="bench3d" hidden aria-label="Circuit 3D" />
              <div id="tima" />
            </div>
            <div className="banner" id="banner" hidden />
            <div className="inspector" id="inspector" hidden />
          </div>
          <div className="bench-foot">
            <span className="hint" id="hint" />
            <label className="flow"><input type="checkbox" id="electrons" /> <span id="electrons-label" /></label>
          </div>
        </section>

        <aside className="panel">
          <nav className="tabs" id="tabs" role="tablist" />
          <div className="tab-body" id="tab-body" />
        </aside>
      </main>

      <dialog id="finish-dialog" className="sheet" />

      <div className="intro" id="intro" hidden>
        <div className="intro-card">
          <div className="intro-orb" aria-hidden="true"><span className="tima-ring" /><span className="tima-core" /></div>
          <h1 id="intro-title" />
          <p id="intro-sub" />
          <button type="button" className="btn primary intro-go" id="intro-start" />
          <button type="button" className="intro-quiet" id="intro-quiet" />
        </div>
      </div>
    </>
  );
}
