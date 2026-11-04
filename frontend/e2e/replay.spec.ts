import { expect, test } from "@playwright/test";

test("a saved session opens on its replay page", async ({ page, request }) => {
  const session = { version: 1, lab: "sample-ohm-en", events: [{ t: 0, kind: "start", preset: "ohm" }], summary: { challenges: { solved: 1, total: 2 } } };
  const saved = await request.post("/api/labs/sample-ohm-en/sessions", { data: session });
  const { id } = await saved.json();
  await page.goto(`/replay?session=${id}&lang=en`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Ohm's law in the lab");
  await expect(page.locator(".tiles")).toContainText("1 / 2");
});
