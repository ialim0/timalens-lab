// Recording a whole lab session, as the student lived it: the lab's tab (the bench, Tima, the
// missions), the student's face in a round inset, and every sound (Tima's voice from the tab,
// mixed with the microphone). It all stays in the browser until the student downloads the video.
// The browser asks which tab to share (preferring this one): no page can film the screen without it.

const FPS = 30;
const MAX_WIDTH = 1920;
const TYPES = ["video/mp4;codecs=avc1,mp4a.40.2", "video/mp4", "video/webm;codecs=vp9,opus", "video/webm"];

/** A muted <video> of a stream, to draw its frames on a canvas. It sits in the page, invisible
 *  (a detached video may never start), and nothing waits for it: frames are drawn once it has some. */
function play(stream) {
  const video = Object.assign(document.createElement("video"), { srcObject: stream, muted: true, playsInline: true, autoplay: true });
  Object.assign(video.style, { position: "fixed", width: "2px", height: "2px", opacity: "0", pointerEvents: "none", left: "0", top: "0" });
  document.body.append(video);
  video.play().catch(() => {});
  return video;
}

export class SessionRecorder {
  /** camera(): a webcam stream already open (hand mode's), or null to open one. */
  constructor({ camera = () => null } = {}) {
    this.camera = camera;
  }

  get recording() { return this.recorder?.state === "recording"; }
  get seconds() { return this.startedAt ? (performance.now() - this.startedAt) / 1000 : 0; }

  async start() {
    this.display = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: FPS, displaySurface: "browser" }, audio: true,
      preferCurrentTab: true, selfBrowserSurface: "include", surfaceSwitching: "exclude", systemAudio: "include",
    });
    const shared = this.camera();
    this.face = shared ?? (await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } }).catch(() => null));
    this.ownFace = !shared && Boolean(this.face); // a camera we opened, we close
    this.mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }).catch(() => null);

    const screen = play(this.display);
    const face = this.face ? play(this.face) : null;
    this.videos = [screen, face].filter(Boolean);
    const settings = this.display.getVideoTracks()[0].getSettings();
    const scale = Math.min(1, MAX_WIDTH / (settings.width || 1280));
    const canvas = Object.assign(document.createElement("canvas"), {
      width: Math.round((settings.width || 1280) * scale), height: Math.round((settings.height || 720) * scale),
    });
    const g = canvas.getContext("2d");
    const draw = () => { // the screen, then the student's face in a round inset at the bottom left
      if (screen.readyState >= 2) g.drawImage(screen, 0, 0, canvas.width, canvas.height);
      if (face?.videoWidth) {
        const r = Math.round(canvas.height * 0.14), cx = r + 24, cy = canvas.height - r - 24;
        const side = Math.min(face.videoWidth, face.videoHeight);
        g.save();
        g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.clip();
        g.translate(cx + r, cy - r); g.scale(-1, 1); // a mirror, as the student sees themselves
        g.drawImage(face, (face.videoWidth - side) / 2, (face.videoHeight - side) / 2, side, side, 0, 0, 2 * r, 2 * r);
        g.restore();
        g.lineWidth = 5; g.strokeStyle = "#3ad1ff";
        g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke();
      }
    };
    this.timer = setInterval(draw, 1000 / FPS); // not requestAnimationFrame: it keeps drawing if the tab is busy

    this.audio = new AudioContext();
    const mix = this.audio.createMediaStreamDestination();
    for (const source of [this.display, this.mic]) {
      if (source?.getAudioTracks().length) this.audio.createMediaStreamSource(source).connect(mix);
    }
    const stream = new MediaStream([...canvas.captureStream(FPS).getVideoTracks(), ...mix.stream.getAudioTracks()]);
    this.type = TYPES.find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
    this.chunks = [];
    this.recorder = new MediaRecorder(stream, { mimeType: this.type || undefined, videoBitsPerSecond: 5_000_000 });
    this.recorder.ondataavailable = (e) => { if (e.data.size) this.chunks.push(e.data); };
    this.recorder.start(1000);
    this.startedAt = performance.now();
    this.display.getVideoTracks()[0].addEventListener("ended", () => this.onEnded?.()); // the student stopped sharing
  }

  /** Stop, and hand back the video: { blob, extension, seconds }. */
  stop() {
    const seconds = this.seconds;
    return new Promise((done) => {
      this.recorder.onstop = () => {
        clearInterval(this.timer);
        this.videos.forEach((video) => video.remove());
        for (const stream of [this.display, this.mic, this.ownFace ? this.face : null]) stream?.getTracks().forEach((track) => track.stop());
        this.audio.close();
        const type = this.recorder.mimeType || this.type || "video/webm";
        done({ blob: new Blob(this.chunks, { type }), extension: type.includes("mp4") ? "mp4" : "webm", seconds });
      };
      this.recorder.stop();
    });
  }
}
