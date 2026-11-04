// End-to-end tests in a real Chrome: the FastAPI server serves the built app (run `npm run build`
// first). No model key is set, so nothing is billed: Meta's answers are stood in for by the tests.
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineConfig } from "@playwright/test";

const PORT = 8091;
const PYTHON = process.env.PYTHON ?? ".venv/bin/python"; // relative to the repository, where the server runs

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    channel: "chrome", // the installed Google Chrome: nothing to download
    viewport: { width: 1400, height: 900 },
    permissions: ["microphone"],
    launchOptions: { args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] },
    trace: "retain-on-failure",
  },
  webServer: {
    command: `${PYTHON} -m uvicorn app.server:app --port ${PORT}`,
    cwd: "..",
    url: `http://127.0.0.1:${PORT}/api/health`,
    reuseExistingServer: false,
    env: { DATA_DIR: join(tmpdir(), "timalens-e2e"), MODEL_API_KEY: "", MISTRAL_API_KEY: "", PLANNER_BASE_URL: "" },
  },
});
