// Hands: the lab, driven by the student's hands through the webcam. MediaPipe finds 21 points
// on the hand in the browser (the video never leaves the computer). Gestures become the same
// pointer events a mouse makes, so taking parts from the tray, dropping them on the bench,
// moving them and tapping buttons all work by hand, in 2D and in 3D, without new code paths.
//
//   point ☝  the cursor follows the index finger
//   pinch 🤏  grab / release (a short pinch is a tap)
//   open ✋   move the open hand to turn the 3D bench
//   fist ✊   held a moment: "Tima, I'm talking to you"

const THUMB_TIP = 4, INDEX_TIP = 8, WRIST = 0, MIDDLE_KNUCKLE = 9;
const FINGERS = { index: [6, 8], middle: [10, 12], ring: [14, 16], pinky: [18, 20] }; // [middle joint, tip]
const PINCH_ON = 0.32, PINCH_OFF = 0.45; // thumb–index gap, in hand sizes, with hysteresis so it doesn't flicker
const REACH = 0.15; // the camera's outer 15% maps past the screen edge: easier to reach the corners
const SMOOTH = 0.45; // how far the cursor moves towards the finger each frame
const FIST_MS = 700;
const TAP_PX = 14, TAP_MS = 700;

export const BONES = [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [0, 17], [17, 18], [18, 19], [19, 20]];

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/** What a hand is doing, from its 21 landmarks (normalised image coordinates). */
export function classify(points) {
  const size = dist(points[WRIST], points[MIDDLE_KNUCKLE]) || 1e-6; // the hand's scale, whatever its distance to the camera
  const pinch = dist(points[THUMB_TIP], points[INDEX_TIP]) / size;
  const up = Object.entries(FINGERS).filter(([, [joint, tip]]) => dist(points[WRIST], points[tip]) > dist(points[WRIST], points[joint]) * 1.15).map(([f]) => f);
  const curled = [INDEX_TIP, 12].every((tip) => dist(points[WRIST], points[tip]) / size < 1.05); // fingertips back in the palm
  let gesture = "none";
  if (up.length === 0 && curled) gesture = "fist";
  else if (pinch < PINCH_ON) gesture = "pinch";
  else if (up.length >= 4) gesture = "open";
  else if (up.length === 1 && up[0] === "index") gesture = "point";
  return { gesture, pinch, up: up.length };
}

/** Where on the screen a point of the (mirrored) camera image falls. */
export function toScreen(point, width, height) {
  const at = (v) => Math.min(1, Math.max(0, (v - REACH) / (1 - 2 * REACH)));
  return { x: at(1 - point.x) * width, y: at(point.y) * height };
}

export class HandControl {
  /** video, sketch (a canvas over it) and cursor are elements of the page; onRotate(dx, dy) turns
   *  the bench, onTalk() wakes Tima, onGesture(name) shows what the hand is doing. */
  constructor({ video, sketch, cursor, onRotate = () => {}, onTalk = () => {}, onGesture = () => {} }) {
    Object.assign(this, { video, sketch, cursor, onRotate, onTalk, onGesture });
    this.x = innerWidth / 2;
    this.y = innerHeight / 2;
    this.down = null; // the press in progress: { x, y, at, target }
  }

  async start() {
    const { FilesetResolver, HandLandmarker } = await import("@mediapipe/tasks-vision");
    const files = await FilesetResolver.forVisionTasks("/mediapipe/wasm");
    const options = (delegate) => ({ baseOptions: { modelAssetPath: "/mediapipe/hand_landmarker.task", delegate }, runningMode: "VIDEO", numHands: 1 });
    try {
      this.tracker = await HandLandmarker.createFromOptions(files, options("GPU"));
    } catch {
      this.tracker = await HandLandmarker.createFromOptions(files, options("CPU")); // no usable GPU: slower, still fine
    }
    this.stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, facingMode: "user" }, audio: false });
    this.video.srcObject = this.stream;
    await this.video.play();
    this.running = true;
    const loop = () => {
      if (!this.running) return;
      if (this.video.readyState >= 2 && this.video.currentTime !== this.seen) {
        this.seen = this.video.currentTime;
        this.feed(this.tracker.detectForVideo(this.video, performance.now()).landmarks?.[0] ?? null);
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  stop() {
    this.running = false;
    if (this.down) this.release();
    this.stream?.getTracks().forEach((track) => track.stop());
    this.tracker?.close();
    this.cursor.hidden = true;
  }

  /** One camera frame: the hand's landmarks, or null when no hand is in view. */
  feed(points) {
    this.draw(points);
    if (!points) {
      if (this.down) this.release();
      this.cursor.hidden = true;
      this.palm = null;
      this.onGesture("none");
      return;
    }
    const { gesture, pinch } = classify(points);
    const pinched = this.down ? pinch < PINCH_OFF && gesture !== "fist" : gesture === "pinch";
    const anchor = pinched ? { x: (points[THUMB_TIP].x + points[INDEX_TIP].x) / 2, y: (points[THUMB_TIP].y + points[INDEX_TIP].y) / 2 } : points[INDEX_TIP];
    const target = toScreen(anchor, innerWidth, innerHeight);
    this.x += (target.x - this.x) * SMOOTH;
    this.y += (target.y - this.y) * SMOOTH;
    this.cursor.hidden = false;
    this.cursor.style.translate = `${this.x}px ${this.y}px`;
    this.cursor.dataset.gesture = pinched ? "pinch" : gesture;

    if (pinched && !this.down) this.press();
    else if (!pinched && this.down) this.release();
    else this.send("pointermove", this.under());

    if (gesture === "open" && !this.down) { // the open hand turns the bench, like a hand on a turntable
      const palm = points[MIDDLE_KNUCKLE];
      if (this.palm) this.onRotate((this.palm.x - palm.x) * -6, (palm.y - this.palm.y) * 4);
      this.palm = palm;
    } else this.palm = null;

    if (gesture === "fist") {
      this.fistSince ??= performance.now();
      if (!this.fistFired && performance.now() - this.fistSince > FIST_MS) { this.fistFired = true; this.onTalk(); }
    } else { this.fistSince = null; this.fistFired = false; }
    this.onGesture(pinched ? "pinch" : gesture);
  }

  // ---------------------------------------------------------------- the pointer events a mouse would make
  under() {
    return document.elementFromPoint(this.x, this.y) ?? document.body; // the cursor itself lets events through (pointer-events: none)
  }

  send(type, target) {
    target.dispatchEvent(new PointerEvent(type, {
      bubbles: true, cancelable: true, composed: true, clientX: this.x, clientY: this.y,
      pointerId: 7, pointerType: "mouse", isPrimary: true, button: type === "pointermove" ? -1 : 0, buttons: this.down ? 1 : 0,
    }));
  }

  press() {
    const target = this.under();
    this.down = { x: this.x, y: this.y, at: performance.now(), target };
    this.send("pointerdown", target);
  }

  release() {
    const { x, y, at, target } = this.down;
    const end = this.under();
    this.down = null;
    this.send("pointerup", end);
    if (Math.hypot(this.x - x, this.y - y) < TAP_PX && performance.now() - at < TAP_MS) { // a short pinch is a tap
      target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, clientX: this.x, clientY: this.y }));
    }
  }

  /** The hand's skeleton over the little camera view. */
  draw(points) {
    const g = this.sketch.getContext("2d");
    const { width, height } = this.sketch;
    g.clearRect(0, 0, width, height);
    if (!points) return;
    g.strokeStyle = "#3ad1ff";
    g.lineWidth = 3;
    g.beginPath();
    for (const [a, b] of BONES) { g.moveTo(points[a].x * width, points[a].y * height); g.lineTo(points[b].x * width, points[b].y * height); }
    g.stroke();
    g.fillStyle = "#ffffff";
    for (const p of points) { g.beginPath(); g.arc(p.x * width, p.y * height, 3.5, 0, Math.PI * 2); g.fill(); }
  }
}
