import { expect, test, type Page } from "@playwright/test";
import { fakeVoice, openLab } from "./fixtures";

/** A hand whose index finger (or pinch) is at a screen point, making a gesture: what MediaPipe
 *  would report for it, fed to the lab's hand controller frame by frame. */
async function handAt(page: Page, x: number, y: number, gesture: "point" | "pinch" | "fist" | "open", frames = 8) {
  await page.evaluate(([sx, sy, g, n]) => {
    const reach = 0.15, ax = 1 - (reach + (sx / innerWidth) * (1 - 2 * reach)), ay = reach + (sy / innerHeight) * (1 - 2 * reach);
    const p = Array.from({ length: 21 }, () => ({ x: ax, y: ay }));
    p[0] = { x: ax + 0.02, y: ay + 0.32 };
    [[5, 0], [9, 0.04], [13, 0.08], [17, 0.12]].forEach(([k, dx], finger) => {
      const straight = g === "open" || (finger === 0 && (g === "point" || g === "pinch"));
      const kx = ax + dx, ky = ay + 0.14;
      p[k] = { x: kx, y: ky };
      p[k + 1] = { x: kx, y: straight ? ky - 0.06 : ky + 0.03 };
      p[k + 2] = { x: kx, y: straight ? ky - 0.1 : ky + 0.05 };
      p[k + 3] = { x: kx, y: straight ? ky - 0.14 : ky + 0.07 };
    });
    p[1] = { x: ax - 0.04, y: ay + 0.26 }; p[2] = { x: ax - 0.08, y: ay + 0.22 }; p[3] = { x: ax - 0.1, y: ay + 0.18 };
    p[4] = g === "pinch" ? { x: ax, y: ay + 0.005 } : g === "fist" ? { x: ax + 0.04, y: ay + 0.2 } : { x: ax - 0.12, y: ay + 0.16 };
    for (let i = 0; i < n; i++) (window as any).timalensHands.feed(p);
  }, [x, y, gesture, frames] as const);
}

/** Turn hand mode on, and wait for MediaPipe; the fake camera shows no hand, so its loop is paused
 *  and only the test's hand counts. */
async function startHands(page: Page) {
  await page.locator("#hands").click();
  await expect(page.locator("#hand-view")).toBeVisible();
  await expect.poll(() => page.evaluate(() => Boolean((window as any).timalensHands)), { timeout: 30_000 }).toBe(true);
  await page.evaluate(() => { (window as any).timalensHands.running = false; });
}

test.describe("hands", () => {
  test("the webcam starts, MediaPipe tracks in the browser, and a pinch drags a bulb onto the bench", async ({ page }) => {
    await openLab(page, "lab=sample-ohm-en&lang=en&view=2d");
    await startHands(page);
    await expect(page.locator("#hands")).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("#gestures")).toContainText("Pinch · grab");

    const parts = () => page.locator("#board #parts > g").count();
    const before = await parts();
    const tool = (await page.locator('.tool[data-tool="bulb"]').boundingBox())!;
    const board = (await page.locator("#board").boundingBox())!;
    const from = { x: tool.x + tool.width / 2, y: tool.y + tool.height / 2 };
    const to = { x: board.x + board.width * 0.62, y: board.y + board.height * 0.18 };
    await handAt(page, from.x, from.y, "point", 12);
    await expect(page.locator("#hand-cursor")).toBeVisible();
    await handAt(page, from.x, from.y, "pinch", 3);
    for (let k = 1; k <= 10; k++) await handAt(page, from.x + ((to.x - from.x) * k) / 10, from.y + ((to.y - from.y) * k) / 10, "pinch", 3);
    await handAt(page, to.x, to.y, "pinch", 8);
    await handAt(page, to.x, to.y, "point", 3);
    await expect.poll(parts).toBe(before + 1);
    await expect(page.locator("#inspector h3")).toContainText("Bulb");
  });

  test("a fist held a moment wakes Tima; an open hand lights up its gesture", async ({ page }) => {
    await fakeVoice(page);
    await openLab(page, "lab=sample-lampes-en&lang=en&view=2d", { voice: true });
    await startHands(page);
    await handAt(page, 600, 400, "open", 4);
    await expect(page.locator('#gestures [data-g="open"]')).toHaveClass(/on/);
    await handAt(page, 600, 400, "fist", 2);
    await page.waitForTimeout(800); // held
    await handAt(page, 600, 400, "fist", 2);
    await expect(page.locator(".tima")).toHaveClass(/listening/);
    await page.locator("#hands").click(); // off again: the camera stops
    await expect(page.locator("#hand-view")).toBeHidden();
  });
});
