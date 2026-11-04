import { expect, test } from "@playwright/test";
import { dragTo, fakeVoice, openLab, said } from "./fixtures";

const parts = (page: import("@playwright/test").Page) => page.locator("#board #parts > g").count();

test.describe("the student's lab", () => {
  test("opens on an intro that names the lab and its missions", async ({ page }) => {
    await page.goto("/lab?lab=sample-lampes-en&lang=en");
    await expect(page.locator("#intro-title")).toHaveText("Bulbs in series and in parallel");
    await expect(page.locator("#intro-sub")).toContainText("4 missions");
    await expect(page.locator("#intro-start")).toHaveText("Start with Tima");
  });

  test("a part dragged from the tray lands on the 2D bench, and leaves it again", async ({ page }) => {
    await openLab(page, "lab=sample-ohm-en&lang=en&view=2d");
    const before = await parts(page);
    const board = (await page.locator("#board").boundingBox())!;
    await dragTo(page, '.tool[data-tool="bulb"]', { x: board.x + board.width * 0.62, y: board.y + board.height * 0.18 });
    await expect.poll(() => parts(page)).toBe(before + 1);
    await expect(page.locator("#inspector h3")).toContainText("Bulb");
    // dragged off the bench, the new bulb is gone
    const placed = page.locator('#board #parts g[data-id="L1"]');
    const at = (await placed.boundingBox())!;
    await page.mouse.move(at.x + at.width / 2, at.y + at.height / 2);
    await page.mouse.down();
    await page.mouse.move(at.x + 40, 860, { steps: 12 });
    await page.mouse.up();
    await expect.poll(() => parts(page)).toBe(before);
  });

  test("a part dragged onto the 3D bench is placed there", async ({ page }) => {
    await openLab(page, "lab=sample-lampes-en&lang=en&view=3d");
    await expect(page.locator("#bench3d")).toBeVisible();
    const bench = (await page.locator("#bench3d").boundingBox())!;
    await dragTo(page, '.tool[data-tool="resistor"]', { x: bench.x + bench.width * 0.5, y: bench.y + bench.height * 0.78 });
    await expect(page.locator("#inspector h3")).toContainText("Resistor R1");
  });

  test("a mission starts, and Tima's captions say what to do", async ({ page }) => {
    await openLab(page, "lab=sample-lampes-en&lang=en&view=2d");
    await page.locator("[data-activity]").first().click();
    await expect(page.locator(".mission-head h2")).toHaveText("Light a bulb");
    await expect(page.locator(".tima-bubble")).toContainText("Mission: Light a bulb");
    await page.locator(".choice").nth(1).click();
    await expect(page.locator(".choice.right")).toHaveCount(1);
  });

  test("closing the switch lights the bulb, and the step moves on by itself", async ({ page }) => {
    await openLab(page, "lab=sample-lampes-en&lang=en&view=2d");
    await page.locator("[data-activity]").first().click();
    await page.locator(".choice").nth(1).click();
    await page.getByRole("button", { name: "Next" }).click();
    await page.locator('#board g[data-id="S1"] .comp-hit').click(); // close S1
    await expect(page.locator(".step").nth(1)).toHaveClass(/done/, { timeout: 8000 });
  });

  test("the quiz checks answers, and Finish sums the lab up", async ({ page }) => {
    await openLab(page, "lab=sample-ohm-en&lang=en&view=2d");
    await page.getByRole("tab", { name: "Quiz" }).click();
    await page.locator('[data-q="0"]').first().click();
    await expect(page.locator(".choice.right")).toHaveCount(1);
    await page.getByRole("button", { name: "Finish" }).click();
    await expect(page.getByRole("heading", { name: "Your lab is done!" })).toBeVisible();
  });
});

test.describe("a first visit", () => {
  test("the address opens a lab, with the other labs and the teacher's page at the bottom", async ({ page }) => {
    await page.goto("/?lang=en");
    await expect(page).toHaveURL(/\/lab\?lab=sample-lampes-en&lang=en$/);
    await expect(page.locator("#intro-title")).toHaveText("Bulbs in series and in parallel");
    await expect(page.locator("#dock .dock-lab")).toHaveCount(2);
    await expect(page.locator("#dock .dock-lab.current")).toContainText("Bulbs in series");
    await page.locator("#intro-quiet").click();
    await page.locator("#dock .dock-teach").click();
    await expect(page).toHaveURL(/\/teach$/);
    await expect(page.getByRole("button", { name: /Create the lab|Créer le laboratoire/ })).toBeVisible();
  });

  test("Tima shows the student around, part by part, then once is enough", async ({ page }) => {
    await fakeVoice(page, { sentenceMs: 2500 }); // a sentence takes seconds to say: the tour waits for each
    await openLab(page, "lab=sample-lampes-en&lang=en&view=2d", { voice: true, tour: true });
    await expect.poll(() => said(page)).toContain("Hi, I'm Tima, your guide.");
    await expect(page.locator(".tour-card")).toContainText("This is your bench.");
    await expect(page.locator(".tour-card")).toContainText("To build, drag a part", { timeout: 15_000 }); // the next part, once she has said it
    await page.getByRole("button", { name: "Next" }).click();
    await expect(page.locator(".tour-card")).toContainText("Your missions are here");
    await page.getByRole("button", { name: "Skip" }).click();
    await expect(page.locator(".tour-card")).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem("timalens-tour-done"))).toBe("1");
    await page.locator("#tour").click(); // the ? replays it
    await expect(page.locator(".tour-card")).toContainText("This is your bench.");
  });
});
