"use client";

// The teacher's page: drop a lesson, get a lab. Generation runs on the server as a job; this
// page follows it, then hands the teacher one link to share.
import { useCallback, useEffect, useState, type DragEvent, type FormEvent } from "react";
import { TEACHER } from "@/lab/i18n.js";
import { Brand } from "./Brand";
import { LanguageSwitch } from "./LanguageSwitch";
import { useUiLanguage, type UiLanguage } from "./useUiLanguage";

type Strings = (typeof TEACHER)["fr"];
type Stage = "reading" | "designing" | "checking" | "ready";
type LabEntry = { id: string; title: string; origin: "sample" | "generated"; view: "2d" | "3d" };
type View = "auto" | "2d" | "3d";

const STAGES: Stage[] = ["reading", "designing", "checking", "ready"];
const PROGRESS = [12, 45, 80, 100];
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
        <Maker T={T} />
        <HowItWorks T={T} />
        <h2 className="section-title">{T.labs}</h2>
        <Labs T={T} lang={lang} />
        <footer>{T.footer} · <a href="https://github.com/ialim0/timalens-lab" rel="noopener">GitHub</a></footer>
      </main>
    </>
  );
}

// ---------------------------------------------------------------- making a lab
function Maker({ T }: { T: Strings }) {
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState("");
  const [language, setLanguage] = useState("auto");
  const [level, setLevel] = useState("");
  const [view, setView] = useState<View>("auto");
  const [open, setOpen] = useState({ paste: false, options: false });
  const [over, setOver] = useState(false);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState<{ stage: Stage; detail: string } | null>(null);
  const [ready, setReady] = useState<string | null>(null);

  const drop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    if (e.dataTransfer.files[0]) setFile(e.dataTransfer.files[0]);
  };

  const follow = useCallback(async (job: string) => {
    for (;;) {
      await wait(1200);
      const r = await fetch(`/api/jobs/${job}`);
      if (!r.ok) throw new Error(T.interrupted);
      const s = await r.json();
      if (s.stage === "unsupported") throw new Error(`${T.unsupported} ${s.detail}`);
      if (s.stage === "failed") throw new Error(`${T.failed} ${s.detail}`);
      setProgress({ stage: s.stage, detail: s.stage === "ready" ? "" : s.detail ?? "" });
      if (s.stage === "ready") return s.lab as string;
    }
  }, [T]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    if (!file && text.trim().length < 200) {
      setError(T.need_lesson);
      setOpen((o) => ({ ...o, paste: true }));
      return;
    }
    const form = new FormData();
    if (file) form.append("file", file);
    form.append("text", text);
    form.append("language", language);
    form.append("level", level);
    form.append("view", view);
    setProgress({ stage: "reading", detail: "" });
    try {
      const r = await fetch("/api/labs", { method: "POST", body: form });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body.detail ?? T.server_error);
      setReady(await follow(body.job));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setProgress(null);
    }
  };

  const again = () => { setReady(null); setFile(null); setText(""); };

  if (ready) return <section className="maker" aria-label="Create"><Ready T={T} id={ready} onAgain={again} /></section>;
  if (progress) {
    const at = Math.max(0, STAGES.indexOf(progress.stage));
    return (
      <section className="maker" aria-label="Create">
        <div className="progress" aria-live="polite">
          <p className="stage">{T[`stage_${STAGES[at]}` as keyof Strings]}</p>
          <div className="meter"><i style={{ width: `${PROGRESS[at]}%` }} /></div>
          <div className="muted">{progress.detail}</div>
        </div>
      </section>
    );
  }
  return (
    <section className="maker" aria-label="Create">
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
        {error && <div className="error" role="alert">{error}</div>}
      </form>
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
        <a key={l.id} href={labLink(l.id)}>
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
