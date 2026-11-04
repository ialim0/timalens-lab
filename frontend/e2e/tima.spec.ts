import { expect, test } from "@playwright/test";
import { fakeVoice, hear, openLab, said } from "./fixtures";

const ANSWER = ["I can see both of your bulbs, ", "L1 and L2, in series. Look at L1: ", "it is dimmer than a bulb on its own. ", "Why, do you think?"];

test.describe("Tima, the voice guide", () => {
  test.beforeEach(async ({ page }) => {
    await fakeVoice(page);
  });

  test("welcomes the student and explains the lab out loud", async ({ page }) => {
    await openLab(page, "lab=sample-lampes-en&lang=en&view=2d", { voice: true });
    await expect.poll(() => said(page)).toContain("Hi, I'm Tima, your lab guide.");
    await expect(page.locator(".tima")).toHaveClass(/ear/); // she is listening
  });

  test("hears her name, looks at the bench, answers aloud, points, and listens for a reply", async ({ page }) => {
    const asked: { question: string; image?: string }[] = [];
    await page.route("**/tutor/stream", (route) => {
      asked.push(route.request().postDataJSON());
      const body = ANSWER.map((delta) => `data: ${JSON.stringify({ delta })}\n\n`).join("") + 'data: {"done": true}\n\n';
      return route.fulfill({ status: 200, headers: { "content-type": "text/event-stream" }, body });
    });
    await openLab(page, "lab=sample-lampes-en&lang=en&view=2d", { voice: true });
    await expect(page.locator(".tima")).toHaveClass(/ear/);

    await hear(page, "hey Timah", false); // talking over her welcome
    await expect(page.locator(".tima")).toHaveClass(/listening/); // a chime and a look, no spoken "Yes?"
    await hear(page, "why are the bulbs dim", true);

    await expect.poll(() => asked.length).toBe(1);
    expect(asked[0].question).toBe("why are the bulbs dim");
    expect(asked[0].image).toMatch(/^data:image\/jpeg;base64,/); // Muse Spark's vision gets the bench
    await expect.poll(() => page.locator("#board g.spot").evaluateAll((gs) => gs.map((g) => g.getAttribute("data-id")))).toContain("L1");
    await expect.poll(() => said(page)).toContain("Why, do you think?");

    // after an answer she keeps listening: a reply needs no "Hey Tima"
    await expect(page.locator(".tima")).toHaveClass(/listening/);
    await hear(page, "what if I add a third bulb", true);
    await expect.poll(() => asked.length).toBe(2);
    expect(asked[1].question).toBe("what if I add a third bulb");
  });

  test("does not wake up on her own voice", async ({ page }) => {
    await openLab(page, "lab=sample-lampes-en&lang=en&view=2d", { voice: true });
    await expect.poll(() => said(page)).toContain("Hi, I'm Tima, your lab guide.");
    await hear(page, "I'm Tima your lab guide", false);
    await expect(page.locator(".tima")).not.toHaveClass(/listening/);
  });

  test("the Look button asks what she sees", async ({ page }) => {
    let question = "";
    await page.route("**/tutor/stream", (route) => {
      question = route.request().postDataJSON().question;
      return route.fulfill({ status: 200, headers: { "content-type": "text/event-stream" }, body: 'data: {"delta": "I see two bulbs."}\n\ndata: {"done": true}\n\n' });
    });
    await openLab(page, "lab=sample-lampes-en&lang=en&view=2d", { voice: true });
    await page.locator(".tima").hover();
    await page.getByRole("button", { name: "Look" }).click();
    await expect.poll(() => question).toContain("Look at my bench");
    await expect.poll(() => said(page)).toContain("I see two bulbs.");
  });

  test("without the tutor, she answers from the engine's own readings", async ({ page }) => {
    await page.route("**/tutor/stream", (route) => route.fulfill({ status: 503, json: { detail: "MODEL_API_KEY is not set" } }));
    await openLab(page, "lab=sample-lampes-en&lang=en&view=2d", { voice: true });
    await page.getByRole("tab", { name: "Tima" }).click();
    await page.locator("#question").fill("what is happening?");
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.locator("#chat .msg.ai").last()).toContainText("I can't reach Muse Spark right now");
  });
});
