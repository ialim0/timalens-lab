"use client";

// A saved session, made into its video again: from ?session=<id> (saved on the server) or from
// a lab file the student downloaded. Every frame is recomputed by the same engine as the lab.
import { useCallback, useEffect, useState, type ChangeEvent } from "react";
import { strings } from "@/lab/i18n.js";
import { Brand } from "./Brand";
import { LanguageSwitch } from "./LanguageSwitch";
import { useUiLanguage, type UiLanguage } from "./useUiLanguage";

type Lab = { title: string; view?: "2d" | "3d" };
type Summary = {
  measures?: number; questions?: number; duration_s?: number;
  challenges?: { solved: number; total: number }; predictions?: { right: number; total: number }; quiz?: { right: number; total: number };
};
type Session = { lab: string; summary?: Summary; events: { kind: string; view?: string }[] };
type Video = { url: string; extension: string; seconds: number };

export default function ReplayView() {
  const lang = useUiLanguage();
  return (
    <>
      <header className="top">
        <Brand />
        <div className="lesson-title" id="title" />
        {lang && <LanguageSwitch current={lang} />}
      </header>
      {lang && <Replay lang={lang} />}
    </>
  );
}

function Replay({ lang }: { lang: UiLanguage }) {
  const t = strings(lang);
  const [lab, setLab] = useState<Lab | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [view, setView] = useState<"2d" | "3d">("2d");
  const [progress, setProgress] = useState<number | null>(null);
  const [video, setVideo] = useState<Video | null>(null);
  const [problem, setProblem] = useState("");

  const make = useCallback(async (forLab: Lab, forSession: Session, inView: "2d" | "3d") => {
    setVideo(null);
    setProblem("");
    setProgress(0);
    try {
      const { renderVideo } = await import("@/lab/video.js");
      const made = await renderVideo({ lab: forLab, session: forSession, t, view: inView, onProgress: (p: number) => setProgress(p) });
      setVideo({ url: URL.createObjectURL(made.blob), extension: made.extension, seconds: made.seconds });
    } catch (error) {
      setProblem(`${t.video_failed} ${(error as Error).message}`);
    } finally {
      setProgress(null);
    }
  }, [t]);

  const open = useCallback((forLab: Lab, forSession: Session) => {
    const lastView = forSession.events.filter((e) => e.kind === "view").at(-1)?.view ?? forLab.view ?? "2d";
    const chosen = lastView === "3d" ? "3d" : "2d";
    setLab(forLab);
    setSession(forSession);
    setView(chosen);
    document.title = `${forLab.title} · TimaLens Lab`;
    make(forLab, forSession, chosen);
  }, [make]);

  useEffect(() => {
    const id = new URLSearchParams(location.search).get("session");
    if (!id) return;
    fetch(`/api/sessions/${encodeURIComponent(id)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((body) => open(body.lab, body.session))
      .catch(() => setProblem("?"));
  }, [open]);

  const fromFile = async (e: ChangeEvent<HTMLInputElement>) => {
    try {
      const saved = JSON.parse(await e.target.files![0].text()) as Session;
      const savedLab = await (await fetch(`/api/labs/${encodeURIComponent(saved.lab)}`)).json();
      open(savedLab, saved);
    } catch (error) {
      setProblem((error as Error).message);
    }
  };

  const s = session?.summary ?? {};
  const seconds = s.duration_s ?? 0;
  const tiles: [string | number, string][] = [
    [s.measures ?? 0, t.measures],
    [`${s.challenges?.solved ?? 0} / ${s.challenges?.total ?? 0}`, t.challenges],
    [`${s.predictions?.right ?? 0} / ${s.predictions?.total ?? 0}`, t.predictions_label],
    [`${s.quiz?.right ?? 0} / ${s.quiz?.total ?? 0}`, t.quiz],
    [s.questions ?? 0, t.questions_label],
    [seconds < 60 ? `${Math.round(seconds)} s` : `${Math.round(seconds / 60)} min`, t.duration_label],
  ];

  return (
    <main className="wrap">
      <section className="box">
        <h1>{lab ? lab.title : t.replay_title}</h1>
        {session && <div className="tiles">{tiles.map(([value, name]) => <div key={name}><b>{value}</b><span>{name}</span></div>)}</div>}
        <div className="row">
          <span className="muted">{t.video_view}</span>
          <div className="seg" role="group">
            {(["2d", "3d"] as const).map((v) => <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)}>{v.toUpperCase()}</button>)}
          </div>
          <button type="button" className="btn primary" disabled={!session || progress !== null} onClick={() => lab && session && make(lab, session, view)}>🎬 {t.make_video}</button>
          <label className="btn">{t.open_file}<input type="file" accept=".json,application/json" hidden onChange={fromFile} /></label>
        </div>
        {progress !== null && (
          <>
            <div className="muted">{t.making_video} {Math.round(progress * 100)} %</div>
            <div className="bar"><i style={{ width: `${Math.round(progress * 100)}%` }} /></div>
          </>
        )}
        {video && (
          <>
            <video src={video.url} controls autoPlay muted playsInline />
            <div className="row">
              <a className="btn primary" href={video.url} download={`timalens-lab.${video.extension}`}>⬇ {t.download_video}</a>
              <span className="muted">{Math.round(video.seconds)} s</span>
            </div>
          </>
        )}
        {problem && <div className="muted">{problem}</div>}
      </section>
    </main>
  );
}
