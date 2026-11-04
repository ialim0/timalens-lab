import { stat } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { fakeVoice, openLab } from "./fixtures";

test("the session is filmed from the first tap, and its video is downloaded at the end", async ({ page }) => {
  await fakeVoice(page);
  await page.addInitScript(() => { // the browser's "share this tab": a moving picture stands in for the tab
    navigator.mediaDevices.getDisplayMedia = async () => {
      const canvas = Object.assign(document.createElement("canvas"), { width: 640, height: 360 });
      const g = canvas.getContext("2d")!;
      setInterval(() => { g.fillStyle = `hsl(${(Date.now() / 10) % 360} 70% 50%)`; g.fillRect(0, 0, 640, 360); }, 40);
      return canvas.captureStream(30);
    };
  });
  await openLab(page, "lab=sample-lampes-en&lang=en&view=2d", { voice: true, record: true });
  await expect(page.locator("#rec")).toBeVisible();
  await expect(page.locator("#rec-time")).toHaveText(/0:0[2-9]/, { timeout: 10_000 }); // it runs
  await page.getByRole("button", { name: "Finish" }).click();
  const link = page.locator("#rec-download");
  await expect(link).toBeVisible({ timeout: 15_000 });
  await expect(page.locator(".filmed video")).toHaveCount(1);
  const [file] = await Promise.all([page.waitForEvent("download"), link.click()]);
  expect(file.suggestedFilename()).toMatch(/^timalens-lab-.*\.(mp4|webm)$/);
  expect((await stat(await file.path())).size).toBeGreaterThan(10_000);
  await expect(page.locator("#rec")).toBeHidden();
});
