import { expect, test } from "@playwright/test";
import { fakeVoice, said } from "./fixtures";

test.beforeEach(async ({ page }) => {
  await fakeVoice(page);
});

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

  test("warns before a teacher waits for nothing, when Meta cannot be reached", async ({ page }) => {
    await page.route("**/api/health", (route) => route.fulfill({ json: { meta_key: true, meta_reachable: false, live_ears: true, voice: "browser" } }));
    await page.goto("/?lang=en");
    await expect(page.locator(".notice")).toContainText("Meta's API can't be reached from this network");
  });

  test("asks for a lesson before making a lab", async ({ page }) => {
    await page.goto("/?lang=en");
    await page.getByRole("button", { name: "Create the lab" }).click();
    await expect(page.locator(".error[role=alert]")).toContainText("paste a few paragraphs"); // not Next.js's route announcer
  });

  test("Tima tells the story of the generation, answers questions, then opens the lab", async ({ page }) => {
    const steps = [
      [{ kind: "reading", source: "pdf" }, { kind: "read", chars: 4200, words: 700, title: "La loi d'Ohm" }],
      [{ kind: "designing", attempt: 1 }, { kind: "thinking", text: "Two bulbs in series show the current is shared." }],
      [{ kind: "designed", title: "Ohm's law in the lab", circuits: 2, activities: 2, challenges: 2, view: "2d" }, { kind: "cover", url: "/img/timalens-icon.png" }],
      [{ kind: "checking" }, { kind: "problems", count: 1 }, { kind: "designing", attempt: 2 }],
      [{ kind: "checking" }, { kind: "checked", count: 0 }, { kind: "ready", lab: "sample-ohm-en" }],
    ];
    let polls = 0, asked = "";
    await page.route("**/api/labs", (route) => (route.request().method() === "POST" ? route.fulfill({ json: { job: "j1" } }) : route.fallback()));
    await page.route("**/api/jobs/j1", (route) => {
      const upTo = asked ? ++polls : Math.min(++polls, 2); // she waits for the teacher's question at step 2
      const done = upTo >= steps.length;
      return route.fulfill({ json: { stage: done ? "ready" : "designing", lab: done ? "sample-ohm-en" : undefined, events: steps.slice(0, upTo).flat() } });
    });
    await page.route("**/api/jobs/j1/ask", (route) => {
      asked = route.request().postDataJSON().question;
      return route.fulfill({ json: { answer: "Your lesson insists on U equals R times I." } });
    });

    await page.goto("/?lang=en");
    await page.locator('input[type="file"]').setInputFiles("../samples/lecon_loi_ohm.pdf");
    await page.getByRole("button", { name: "Create the lab" }).click();

    await expect.poll(() => said(page)).toContain("Reading your lesson…");
    await expect.poll(() => said(page)).toContain("I've read “La loi d'Ohm”: 700 words.");
    await page.getByPlaceholder("Ask me about your lesson…").fill("What does my lesson insist on?");
    await page.getByRole("button", { name: "Send" }).click();
    await expect.poll(() => said(page)).toContain("Your lesson insists on U equals R times I.");
    expect(asked).toBe("What does my lesson insist on?");

    await expect.poll(() => said(page)).toContain("Muse Spark is thinking: Two bulbs in series show the current is shared.");
    await expect.poll(() => said(page)).toContain("First draft: “Ohm's law in the lab”, with 2 circuits, 2 experiments and 2 challenges, in 2D.");
    await expect.poll(() => said(page)).toContain("Muse Image has drawn your lab's cover.");
    await expect(page.locator(".agent img.cover")).toBeVisible();
    await expect.poll(() => said(page)).toContain("The engine found 1 problem.");
    await expect.poll(() => said(page)).toContain("Everything checks out: every challenge can be met.");
    await expect(page.getByText("Opening the lab in")).toBeVisible({ timeout: 15_000 });

    // the lab opens by itself, and Tima speaks there at once: no second tap
    await expect(page).toHaveURL(/\/lab\?lab=sample-ohm-en$/, { timeout: 15_000 });
    await expect(page.locator("#intro")).toBeHidden();
    await expect.poll(() => said(page)).toContain("Hi, I'm Tima, your lab guide.");
  });

  test("the teacher can stay on the page instead", async ({ page }) => {
    await page.route("**/api/labs", (route) => (route.request().method() === "POST" ? route.fulfill({ json: { job: "j2" } }) : route.fallback()));
    await page.route("**/api/jobs/j2", (route) => route.fulfill({ json: { stage: "ready", lab: "sample-ohm-en", events: [{ kind: "reused" }, { kind: "ready", lab: "sample-ohm-en" }] } }));
    await page.goto("/?lang=en");
    await page.locator('input[type="file"]').setInputFiles("../samples/lecon_loi_ohm.pdf");
    await page.getByRole("button", { name: "Create the lab" }).click();
    await page.getByRole("button", { name: "Stay here" }).click();
    await expect(page.getByRole("heading", { name: "Your lab is ready" })).toBeVisible();
    await expect(page.locator(".linkbox code")).toContainText("/lab?lab=sample-ohm-en");
    await expect(page).toHaveURL(/\/\?lang=en$/);
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
