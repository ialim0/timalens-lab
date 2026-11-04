// Hand tracking runs in the browser, from files we serve ourselves (no CDN in class): MediaPipe's
// WebAssembly engine (from node_modules) and its hand-landmark model (downloaded once).
import { cp, mkdir, stat, writeFile } from "node:fs/promises";

const OUT = new URL("../public/mediapipe/", import.meta.url);
const MODEL = "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

await mkdir(OUT, { recursive: true });
await cp(new URL("../node_modules/@mediapipe/tasks-vision/wasm/", import.meta.url), new URL("wasm/", OUT), { recursive: true });
const model = new URL("hand_landmarker.task", OUT);
const have = await stat(model).then((s) => s.size > 1_000_000, () => false);
if (!have) {
  const r = await fetch(MODEL);
  if (!r.ok) throw new Error(`could not download the hand model: ${r.status}`);
  await writeFile(model, Buffer.from(await r.arrayBuffer()));
}
console.log("hand tracking files ready in public/mediapipe/");
