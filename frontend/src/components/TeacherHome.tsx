"use client";

// The teacher's page: drop a lesson, get a lab. Generation runs on the server as a job, in the
// background. Meanwhile Tima, the voice guide, tells the teacher what is happening (from the job's
// real events) and answers their questions about the lesson; when the lab is ready, it opens.
import { useCallback, useEffect, useRef, useState, type DragEvent, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { MAKING, TEACHER, strings } from "@/lab/i18n.js";
import { Tima } from "@/lab/tima.js";
import { Brand } from "./Brand";
import { LanguageSwitch } from "./LanguageSwitch";
import { useUiLanguage, type UiLanguage } from "./useUiLanguage";

type Strings = (typeof TEACHER)["fr"];
type Stage = "reading" | "designing" | "checking" | "ready";
type LabEntry = { id: string; title: string; origin: "sample" | "generated"; view: "2d" | "3d"; cover?: string };
type View = "auto" | "2d" | "3d";
type JobEvent = { kind: string; [fact: string]: unknown };
type Line = { who: "tima" | "you"; text: string };

const STAGES: Stage[] = ["reading", "designing", "checking", "ready"];
const PROGRESS = [12, 45, 80, 100];
const IDLE_MS = 14_000; // Muse Spark quiet that long: Tima says what it is busy with
const OPEN_IN = 3;
const ACCEPT = ".pdf,.docx,.pptx,.txt,.md,.jpg,.jpeg,.png,.webp,.mp3,.wav,.m4a,.ogg,.webm,.mp4,.mov";
const OTHER_LANGUAGES = [["Wolof", "Wolof"], ["Hausa", "Hausa"], ["Yoruba", "Yorùbá"], ["Fon", "Fɔngbè"], ["Swahili", "Kiswahili"], ["Bambara", "Bamanankan"]];

const wait = (ms: number) => new Promise((done) => setTimeout(done, ms));
const labLink = (id: string) => `/lab?lab=${encodeURIComponent(id)}`;

export default function TeacherHome() {
  const lang = useUiLanguage();
  if (!lang) return <Header />;
  return <Home lang={lang} />;
}

function Header({ lang }: { lang?: UiLanguage }) {
  return (
    <header className="top">
      <Brand />
      <div className="lesson-title" />
      {lang && <LanguageSwitch current={lang} />}
    </header>
  );
}

function Home({ lang }: { lang: UiLanguage }) {
  const T: Strings = TEACHER[lang];
  useEffect(() => { document.title = T.page_title; }, [T]);

  return (
    <>
      <Header lang={lang} />
      <main className="wrap">
        <section className="hero">
          {/* the headline holds a line break and an <em>, from our own strings */}
          <h1 dangerouslySetInnerHTML={{ __html: T.hero }} />
          <p>{T.hero_text}</p>
        </section>
        <Maker T={T} lang={lang} />
        <HowItWorks T={T} />
        <h2 className="section-title">{T.labs}</h2>
        <Labs T={T} lang={lang} />
        <footer>{T.footer} · <a href="https://github.com/ialim0/timalens-lab" rel="noopener">GitHub</a></footer>
      </main>
    </>
  );
}

// ---------------------------------------------------------------- making a lab
/** Tima, ready before the teacher's tap (browsers only let her speak during one). */
function useTima(root: React.RefObject<HTMLDivElement | null>, lang: UiLanguage, onAsk: (question: string) => void) {
  const tima = useRef<InstanceType<typeof Tima> | null>(null);
  const ask = useRef(onAsk);
  ask.current = onAsk;
  useEffect(() => {
    let alive = true;
    fetch("/api/health").then((r) => r.json()).catch(() => ({})).then((health) => {
      if (!alive || !root.current) return;
      tima.current = new Tima(root.current, {
        lang, t: strings(lang), onAsk: (q: string) => ask.current(q),
        live: { ears: health.live_ears, voice: health.voice },
      });
    });
    return () => { alive = false; tima.current?.hush(); tima.current?.toggleWake(false); };
  }, [root, lang]);
  return tima;
}

function Maker({ T, lang }: { T: Strings; lang: UiLanguage }) {
  const M = MAKING[lang];
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState("");
  const [language, setLanguage] = useState("auto");
  const [level, setLevel] = useState("");
  const [view, setView] = useState<View>("auto");
  const [open, setOpen] = useState({ paste: false, options: false });
  const [over, setOver] = useState(false);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState<Stage | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [opening, setOpening] = useState<number | null>(null);
  const [ready, setReady] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [cover, setCover] = useState<string | null>(null); // drawn by Muse Image while the lab is made // the server cannot reach Meta: say so before the teacher waits
  const job = useRef("");
  const chat = useRef<{ role: string; content: string }[]>([]);
  const root = useRef<HTMLDivElement>(null);

  const note = (line: Line) => setLines((all) => [...all.slice(-5), line]);

  // the teacher asks while the lab is made: Tima answers from the lesson, out loud
  const askTima = useCallback(async (question: string) => {
    note({ who: "you", text: question });
    tima.current?.think(true);
    let answer: string;
    try {
      const r = await fetch(`/api/jobs/${job.current}/ask`, { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ question, history: chat.current.slice(-8), language: lang }) });
      if (!r.ok) throw new Error(String(r.status));
      answer = (await r.json()).answer;
    } catch {
      answer = M.idle[0];
    }
    tima.current?.think(false);
    chat.current.push({ role: "user", content: question }, { role: "assistant", content: answer });
    note({ who: "tima", text: answer });
    tima.current?.say(answer, { interrupt: true, followUp: true });
  }, [lang, M]); // `tima` and `note` never change
  const tima = useTima(root, lang, askTima);
  useEffect(() => {
    fetch("/api/health").then((r) => r.json()).then((h) => setOffline(h.meta_key && h.meta_reachable === false)).catch(() => {});
  }, []);
  const cancelled = useRef(false); // the teacher chose to stay on this page

  const drop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    if (e.dataTransfer.files[0]) setFile(e.dataTransfer.files[0]);
  };

  /** Follow the job: each new event becomes something Tima says; silence gets a word too. */
  const follow = useCallback(async (id: string) => {
    let seen = 0, quietSince = Date.now(), idle = 0;
    for (;;) {
      await wait(1200);
      const r = await fetch(`/api/jobs/${id}`);
      if (!r.ok) throw new Error(T.interrupted);
      const s = await r.json();
      for (const event of (s.events ?? []).slice(seen) as JobEvent[]) {
        if (event.kind === "cover" && typeof event.url === "string") setCover(event.url);
        const say = (M as Record<string, unknown>)[event.kind];
        if (typeof say === "function" && !["failed", "unsupported"].includes(event.kind)) {
          const line = say(event) as string;
          note({ who: "tima", text: line });
          tima.current?.say(line);
        }
        quietSince = Date.now();
      }
      seen = s.events?.length ?? seen;
      if (s.stage === "unsupported") throw new Error(`${T.unsupported} ${s.detail}`);
      if (s.stage === "failed") throw new Error(`${T.failed} ${s.detail}`);
      if (STAGES.includes(s.stage)) setProgress(s.stage);
      if (s.stage === "ready") return s.lab as string;
      if (Date.now() - quietSince > IDLE_MS && idle < M.idle.length && !tima.current?.awake) {
        tima.current?.say(M.idle[idle]);
        note({ who: "tima", text: M.idle[idle++] });
        quietSince = Date.now();
      }
    }
  }, [T, M, tima]);

  /** Once Tima has finished speaking, count down and open the lab (with her voice still allowed). */
  const openWhenQuiet = useCallback(async (id: string) => {
    while (tima.current?.speaking || tima.current?.awake) await wait(300);
    for (let n = OPEN_IN; n > 0; n--) {
      setOpening(n);
      await wait(1000);
      if (cancelled.current) return;
    }
    router.push(`${labLink(id)}&fresh=1`); // same page session: the lab may speak without another tap
  }, [router, tima]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    if (!file && text.trim().length < 200) {
      setError(T.need_lesson);
      setOpen((o) => ({ ...o, paste: true }));
      return;
    }
    tima.current?.start(); // during the tap: from now on she may speak
    tima.current?.toggleWake(true);
    const form = new FormData();
    if (file) form.append("file", file);
    form.append("text", text);
    form.append("language", language);
    form.append("level", level);
    form.append("view", view);
    form.append("ui", lang); // Muse Spark reasons in the teacher's language: Tima reads its thoughts aloud
    setLines([]);
    setCover(null);
    setProgress("reading");
    cancelled.current = false;
    try {
      const r = await fetch("/api/labs", { method: "POST", body: form });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body.detail ?? T.server_error);
      job.current = body.job;
      const id = await follow(body.job);
      setReady(id);
      await openWhenQuiet(id);
    } catch (err) {
      const message = (err as Error).message;
      setError(message);
      setProgress(null);
      tima.current?.say(M.failed({ detail: "" }), { interrupt: true });
    }
  };

  const stay = () => { cancelled.current = true; setOpening(null); setProgress(null); };
  const again = () => { setReady(null); setFile(null); setText(""); setLines([]); };

  const working = progress !== null;
  return (
    <section className={`maker ${working ? "working" : ""}`} aria-label="Create">
      {/* Tima lives here from the start, hidden until the lab is being made */}
      <div className="agent" hidden={!working}>
        {cover && <img className="cover" src={cover} alt="" />}
        <div ref={root} />
        <div className="meter"><i style={{ width: `${PROGRESS[Math.max(0, STAGES.indexOf(progress ?? "reading"))]}%` }} /></div>
        <ol className="journal" aria-live="polite">
          {lines.slice(0, -1).slice(-3).map((line, i) => (
            <li key={`${i}-${line.text}`} className={line.who}>
              <span className="mark" aria-hidden="true">{line.who === "you" ? "›" : "✓"}</span>
              <span>{line.who === "you" ? `${M.you} : ` : ""}{line.text}</span>
            </li>
          ))}
        </ol>
        {opening !== null ? (
          <div className="opening">{M.opening} {opening} s · <button type="button" className="link" onClick={stay}>{M.stay}</button></div>
        ) : (
          <form className="ask-tima" onSubmit={(e) => { e.preventDefault(); const q = new FormData(e.currentTarget).get("q")?.toString().trim(); if (q) { askTima(q); e.currentTarget.reset(); } }}>
            <input name="q" placeholder={M.ask} autoComplete="off" />
            <button type="submit" className="btn primary">{M.send}</button>
          </form>
        )}
      </div>

      {!working && ready && <Ready T={T} id={ready} onAgain={again} />}
      {!working && !ready && (
        <form onSubmit={submit}>
          <label className={`drop ${over ? "over" : ""} ${file ? "has-file" : ""}`}
            onDragEnter={(e) => { e.preventDefault(); setOver(true); }} onDragOver={(e) => { e.preventDefault(); setOver(true); }}
            onDragLeave={() => setOver(false)} onDrop={drop}>
            <span className="icon" aria-hidden="true">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 16V4M7 9l5-5 5 5" /><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" /></svg>
            </span>
            <b>{file?.name ?? T.drop}</b>
            <span className="muted">{file ? T.change_file : T.drop_hint}</span>
            <input type="file" name="file" accept={ACCEPT} hidden onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </label>

          <div className="more">
            <button type="button" className="link" onClick={() => setOpen((o) => ({ ...o, paste: !o.paste }))}>{T.or_paste}</button>
            <button type="button" className="link" onClick={() => setOpen((o) => ({ ...o, options: !o.options }))}>{T.options}</button>
          </div>

          {open.paste && (
            <div className="reveal">
              <textarea className="lesson" name="text" placeholder={T.paste_placeholder} value={text} onChange={(e) => setText(e.target.value)} autoFocus />
            </div>
          )}

          {open.options && (
            <div className="reveal fields">
              <label><span>{T.language}</span>
                <select value={language} onChange={(e) => setLanguage(e.target.value)}>
                  <option value="auto">{T.same_as_lesson}</option>
                  <option value="fr">Français</option>
                  <option value="en">English</option>
                  <optgroup label={T.other_languages}>
                    {OTHER_LANGUAGES.map(([value, name]) => <option key={value} value={value}>{name}</option>)}
                  </optgroup>
                </select>
              </label>
              <label><span>{T.level}</span>
                <input value={level} placeholder={T.level_placeholder} onChange={(e) => setLevel(e.target.value)} />
              </label>
              <div className="wide">
                <label style={{ marginBottom: 6 }}><span>{T.view}</span></label>
                <div className="seg" role="group">
                  {(["auto", "2d", "3d"] as View[]).map((v) => (
                    <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)}>{v === "auto" ? T.view_auto : v.toUpperCase()}</button>
                  ))}
                </div>
              </div>
            </div>
          )}

          <button className="btn primary go" type="submit">{T.create}</button>
          {offline && <div className="notice">{T.unreachable}</div>}
          {error && <div className="error" role="alert">{error}</div>}
        </form>
      )}
    </section>
  );
}

function Ready({ T, id, onAgain }: { T: Strings; id: string; onAgain: () => void }) {
  const [copied, setCopied] = useState(false);
  const url = new URL(labLink(id), location.href).href;
  const copy = async () => { try { await navigator.clipboard.writeText(url); setCopied(true); } catch { /* the link is shown */ } };
  return (
    <div className="result">
      <div className="check" aria-hidden="true">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
      </div>
      <h2>{T.ready}</h2>
      <div className="linkbox"><code>{url}</code><button type="button" className="btn" onClick={copy}>{copied ? T.copied : T.copy}</button></div>
      <div className="row">
        <a className="btn primary" href={url}>{T.open_lab}</a>
        <a className="btn" href={`https://wa.me/?text=${encodeURIComponent(`${T.share_text} ${url}`)}`} target="_blank" rel="noopener">WhatsApp</a>
        <button type="button" className="btn" onClick={onAgain}>{T.another}</button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- how it works, and the labs
const ICONS = [
  <svg key="file" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M9 13h6M9 17h4" /></svg>,
  <svg key="spark" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" /><path d="M19 17l.8 2.2L22 20l-2.2.8L19 23l-.8-2.2L16 20l2.2-.8z" /></svg>,
  <svg key="bulb" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18h6M10 21h4" /><path d="M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.8 1-2.5A6 6 0 0 0 12 3z" /></svg>,
];

function HowItWorks({ T }: { T: Strings }) {
  const steps = [[T.how1, T.how1_text], [T.how2, T.how2_text], [T.how3, T.how3_text]];
  return (
    <section className="steps3">
      {steps.map(([title, text], i) => (
        <div key={title}><span className="icon" aria-hidden="true">{ICONS[i]}</span><b>{title}</b><span>{text}</span></div>
      ))}
    </section>
  );
}

function Labs({ T, lang }: { T: Strings; lang: UiLanguage }) {
  const fallback: LabEntry[] = [{ id: `sample-lampes-${lang}`, title: lang === "fr" ? "Lampes en série et en dérivation" : "Bulbs in series and in parallel", origin: "sample", view: "3d" }];
  const [labs, setLabs] = useState<LabEntry[]>([]);
  useEffect(() => {
    fetch(`/api/labs?lang=${lang}`).then((r) => r.json()).then(setLabs).catch(() => setLabs(fallback));
  }, [lang]); // once per language: the fallback is only a stand-in
  return (
    <div className="labs">
      {labs.map((l) => (
        <a key={l.id} href={labLink(l.id)} className={l.cover ? "with-cover" : ""}>
          {l.cover && <img src={l.cover} alt="" loading="lazy" />}
          <span>{l.title}</span>
          <span className="badges">
            {l.origin === "sample" ? <span className="pill">{T.sample}</span> : <span className="pill blue">{T.generated}</span>}
            <span className="pill">{l.view === "3d" ? "3D" : "2D"}</span>
          </span>
        </a>
      ))}
    </div>
  );
}
