import { expect, type Page } from "@playwright/test";

/** A speech recogniser the test can make "hear" things, and a voice that records what Tima says. */
export async function fakeVoice(page: Page, { sentenceMs = 250 } = {}) {
  await page.addInitScript((ms) => {
    type Result = { transcript: string }[] & { isFinal: boolean };
    class FakeRecognition {
      on = false;
      onstart?: () => void;
      onend?: () => void;
      onresult?: (e: { resultIndex: number; results: Result[] }) => void;
      constructor() { (window as any).__rec = this; }
      start() { this.on = true; setTimeout(() => this.onstart?.(), 10); }
      abort() { this.on = false; setTimeout(() => this.onend?.(), 10); }
      stop() { this.abort(); }
    }
    Object.assign(window, { SpeechRecognition: FakeRecognition, webkitSpeechRecognition: FakeRecognition, __said: [] as string[] });
    (window as any).__hear = (text: string, isFinal: boolean) => {
      const result = Object.assign([{ transcript: text }], { isFinal }) as Result;
      (window as any).__rec.onresult({ resultIndex: 0, results: [result] });
    };
    speechSynthesis.speak = (u: SpeechSynthesisUtterance) => { (window as any).__said.push(u.text); setTimeout(() => u.onend?.(new Event("end") as SpeechSynthesisEvent), ms); };
  }, sentenceMs);
}

export const said = (page: Page): Promise<string[]> => page.evaluate(() => (window as any).__said);
export const hear = (page: Page, text: string, isFinal: boolean) => page.evaluate(([t, f]) => (window as any).__hear(t, f), [text, isFinal] as const);

/** Open a lab and get past the intro, with Tima's voice on (or not). */
export async function openLab(page: Page, query: string, { voice = false, tour = false } = {}) {
  if (!tour) await page.addInitScript(() => { try { localStorage.setItem("timalens-tour-done", "1"); } catch { /* no storage */ } });
  await page.goto(`/lab?${query}`);
  await expect(page.locator("#intro")).toBeVisible();
  await page.locator(voice ? "#intro-start" : "#intro-quiet").click();
  await expect(page.locator("#intro")).toBeHidden();
}

/** Drag from the centre of one element to a point, the way a hand does (in steps). */
export async function dragTo(page: Page, from: string, to: { x: number; y: number }) {
  const box = (await page.locator(from).boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 12 });
  await page.mouse.up();
}
