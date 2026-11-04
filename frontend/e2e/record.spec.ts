import { execFileSync } from "node:child_process";
import { stat } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { fakeVoice, openLab } from "./fixtures";

test("the session is filmed from the first tap, and its video is downloaded at the end", async ({ page }) => {
  await fakeVoice(page);
  await page.addInitScript(() => { // the browser's "share this tab": a moving picture stands in for the tab
    navigator.mediaDevices.getDisplayMedia = async () => {
      const canvas = Object.assign(document.createElement("canvas"), { width: 640, height: 360 });
      Object.assign(canvas.style, { position: "fixed", right: "0", top: "0", width: "64px", height: "36px", opacity: "0.01" });
      document.documentElement.append(canvas); // in the page, painted, like a real tab
      const g = canvas.getContext("2d")!;
      setInterval(() => { g.fillStyle = `hsl(${(Date.now() / 10) % 360} 70% 50%)`; g.fillRect(0, 0, 640, 360); }, 40);
      return canvas.captureStream(30);
    };
  });
  await openLab(page, "lab=sample-lampes-en&lang=en&view=2d", { voice: true, record: true });
  await expect(page.locator("#rec")).toBeVisible();
  await expect(page.locator("#rec-time")).toHaveText(/0:0[4-9]/, { timeout: 12_000 }); // it runs
  await page.getByRole("button", { name: "Finish" }).click();
  const link = page.locator("#rec-download");
  await expect(link).toBeVisible({ timeout: 15_000 });
  await expect(page.locator(".filmed video")).toHaveCount(1);
  const [file] = await Promise.all([page.waitForEvent("download"), link.click()]);
  expect(file.suggestedFilename()).toMatch(/^timalens-lab-.*\.(mp4|webm)$/);
  const path = await file.path();
  expect((await stat(path)).size).toBeGreaterThan(10_000);
  // the picture must last as long as the sound: a recording once froze on its first second
  // (0.8 s of picture for 5 minutes of sound), when the browser paused the unseen video it read
  const seconds = (stream: string) => Number(execFileSync("ffprobe", ["-v", "error", "-select_streams", stream, "-show_entries", "stream=duration", "-of", "csv=p=0", path]).toString().trim());
  expect(seconds("a:0")).toBeGreaterThan(3);
  expect(seconds("v:0")).toBeGreaterThan(seconds("a:0") * 0.8);
  await expect(page.locator("#rec")).toBeHidden();
});
