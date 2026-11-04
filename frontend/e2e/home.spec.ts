import { expect, test } from "@playwright/test";

test.describe("the teacher's page", () => {
  test("is calm: one headline, one action, the rest folded away", async ({ page }) => {
    await page.goto("/?lang=en");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("experiencing");
    await expect(page.getByRole("button", { name: "Create the lab" })).toBeVisible();
    await expect(page.locator("textarea")).toHaveCount(0);
    await page.getByRole("button", { name: "Paste text" }).click();
    await expect(page.locator("textarea")).toBeVisible();
    await page.getByRole("button", { name: "Options" }).click();
    await expect(page.getByRole("combobox")).toBeVisible();
  });

  test("speaks French too", async ({ page }) => {
    await page.goto("/?lang=en");
    await page.getByRole("button", { name: "FR" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("vit");
    await expect(page.getByRole("button", { name: "Créer le laboratoire" })).toBeVisible();
  });

  test("asks for a lesson before making a lab", async ({ page }) => {
    await page.goto("/?lang=en");
    await page.getByRole("button", { name: "Create the lab" }).click();
    await expect(page.locator(".error[role=alert]")).toContainText("paste a few paragraphs"); // not Next.js's route announcer
  });

  test("follows the generation to a link to share", async ({ page }) => {
    let polls = 0;
    await page.route("**/api/labs", (route) => (route.request().method() === "POST" ? route.fulfill({ json: { job: "j1" } }) : route.fallback()));
    await page.route("**/api/jobs/j1", (route) =>
      route.fulfill({ json: ++polls < 2 ? { stage: "designing", detail: "" } : { stage: "ready", lab: "sample-ohm-en" } }));
    await page.goto("/?lang=en");
    await page.locator('input[type="file"]').setInputFiles("../samples/lecon_loi_ohm.pdf");
    await expect(page.getByText("lecon_loi_ohm.pdf")).toBeVisible();
    await page.getByRole("button", { name: "Create the lab" }).click();
    await expect(page.getByText("Muse Spark is designing…")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Your lab is ready" })).toBeVisible();
    await expect(page.locator(".linkbox code")).toContainText("/lab?lab=sample-ohm-en");
    await page.getByRole("link", { name: "Open the lab" }).click();
    await expect(page).toHaveURL(/\/lab\?lab=sample-ohm-en/);
  });

  test("lists the sample labs, which open", async ({ page }) => {
    await page.goto("/?lang=en");
    const labs = page.locator(".labs a");
    await expect(labs).toHaveCount(2);
    await labs.first().click();
    await expect(page).toHaveURL(/\/lab\?lab=sample-/);
    await expect(page.locator("#intro-title")).not.toBeEmpty();
  });

  test("keeps links shared before the Next.js app working", async ({ page }) => {
    await page.goto("/lab.html?lab=sample-ohm-en&lang=en");
    await expect(page).toHaveURL(/\/lab\?lab=sample-ohm-en&lang=en$/);
    await expect(page.locator("#intro-title")).toHaveText("Ohm's law in the lab");
  });
});
