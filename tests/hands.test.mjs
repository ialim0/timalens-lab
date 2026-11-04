// Reading gestures from MediaPipe's 21 hand landmarks.
import { test } from "node:test";
import assert from "node:assert/strict";
import { classify, toScreen } from "../frontend/src/lab/hands.js";

/** A synthetic hand (image coordinates, y down): which fingers are straight, and where the thumb tip is. */
function hand({ up = [], thumb = { x: 0.62, y: 0.62 } } = {}) {
  const p = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.9 }));
  p[0] = { x: 0.5, y: 0.9 }; // wrist
  const knuckles = { index: [5, 0.44], middle: [9, 0.5], ring: [13, 0.56], pinky: [17, 0.62] };
  for (const [finger, [k, x]] of Object.entries(knuckles)) {
    p[k] = { x, y: 0.6 };
    const straight = up.includes(finger);
    p[k + 1] = { x, y: straight ? 0.52 : 0.55 }; // middle joint
    p[k + 2] = { x, y: straight ? 0.46 : 0.66 };
    p[k + 3] = { x, y: straight ? 0.4 : 0.7 }; // tip: far from the wrist, or back in the palm
  }
  p[1] = { x: 0.58, y: 0.8 }; p[2] = { x: 0.62, y: 0.72 }; p[3] = { x: 0.63, y: 0.66 }; p[4] = thumb;
  return p;
}

test("an open hand, a fist, a pointing finger", () => {
  assert.equal(classify(hand({ up: ["index", "middle", "ring", "pinky"], thumb: { x: 0.7, y: 0.65 } })).gesture, "open");
  assert.equal(classify(hand({ up: [], thumb: { x: 0.52, y: 0.68 } })).gesture, "fist");
  assert.equal(classify(hand({ up: ["index"], thumb: { x: 0.66, y: 0.68 } })).gesture, "point");
});

test("thumb and index together: a pinch, whatever the hand's distance to the camera", () => {
  const near = hand({ up: ["middle", "ring", "pinky"], thumb: { x: 0.45, y: 0.69 } });
  near[8] = { x: 0.45, y: 0.7 }; // the index tip meets the thumb
  assert.equal(classify(near).gesture, "pinch");
  const far = near.map((q) => ({ x: 0.5 + (q.x - 0.5) * 0.4, y: 0.5 + (q.y - 0.5) * 0.4 })); // the same hand, farther away
  assert.equal(classify(far).gesture, "pinch");
});

test("the camera is mirrored, and its edges reach the screen's corners", () => {
  assert.deepEqual(toScreen({ x: 0.9, y: 0.1 }, 1000, 800), { x: 0, y: 0 });
  assert.deepEqual(toScreen({ x: 0.5, y: 0.5 }, 1000, 800), { x: 500, y: 400 });
});
