// The 3D bench: the same circuit, the same solution, drawn as real parts on a lab table.
// Nothing here computes physics. Brightness, readings, burnt parts and the flow of charges
// all come from circuit.js, through update(). Loaded only when a student opens the 3D view,
// so a phone that never does pays nothing for it.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { format } from "./circuit.js";
import { chargeAt, chargePaths, resistorBands } from "./board.js";

const WIRE_Y = 0.06;
const SIZE = 1.45; // parts are drawn larger than the grid would make them, to read on a phone
const cache = new Map();
const mat = (key, make) => cache.get(key) ?? (cache.set(key, make()), cache.get(key));
const std = (color, extra = {}) => mat(`std:${color}:${JSON.stringify(extra)}`, () => new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.05, ...extra }));
const geo = (key, make) => cache.get(`g:${key}`) ?? (cache.set(`g:${key}`, make()), cache.get(`g:${key}`));

function textTexture(lines, { width = 256, height = 96, bg = null, fg = "#1d1f22", font = "600 40px system-ui, sans-serif", lcd = false } = {}) {
  const canvas = document.createElement("canvas");
  canvas.width = width; canvas.height = height;
  const g = canvas.getContext("2d");
  if (bg) { g.fillStyle = bg; g.beginPath(); g.roundRect?.(0, 0, width, height, 18) ?? g.rect(0, 0, width, height); g.fill(); }
  g.fillStyle = fg; g.textAlign = "center"; g.textBaseline = "middle";
  lines.forEach((line, i) => {
    g.font = i === 0 || !lcd ? font : `700 ${Math.round(height * 0.27)}px ui-monospace, monospace`;
    g.fillText(line, width / 2, height * (lines.length === 1 ? 0.5 : (i + 0.7) / (lines.length + 0.4)));
  });
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}
function label(text, scale = 0.62) {
  const width = Math.max(220, 34 * text.length + 60);
  const texture = textTexture([text], { bg: "rgba(255,255,255,0.94)", width, height: 104, font: "700 58px system-ui, sans-serif" });
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true }));
  sprite.scale.set((scale * width) / 104 * 0.5, scale * 0.5, 1);
  sprite.renderOrder = 10;
  return sprite;
}
let glowTexture = null;
function glow(color, size) {
  if (!glowTexture) {
    const c = document.createElement("canvas"); c.width = c.height = 128;
    const g = c.getContext("2d"); const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, "rgba(255,255,255,1)"); grad.addColorStop(0.25, "rgba(255,255,255,0.55)"); grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
    glowTexture = new THREE.CanvasTexture(c);
  }
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture, color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  sprite.scale.set(size, size, 1);
  return sprite;
}
function matTexture() {
  const c = document.createElement("canvas"); c.width = c.height = 256;
  const g = c.getContext("2d");
  g.fillStyle = "#26302f"; g.fillRect(0, 0, 256, 256);
  g.strokeStyle = "rgba(255,255,255,0.07)"; g.lineWidth = 2;
  for (let i = 0; i <= 256; i += 32) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 256); g.moveTo(0, i); g.lineTo(256, i); g.stroke(); }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function woodTexture() {
  const c = document.createElement("canvas"); c.width = 512; c.height = 512;
  const g = c.getContext("2d");
  g.fillStyle = "#b88a5a"; g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 90; i++) {
    g.strokeStyle = `rgba(${90 + (i * 37) % 40}, ${55 + (i * 17) % 25}, 30, ${0.08 + ((i * 13) % 10) / 100})`;
    g.lineWidth = 1 + (i % 4);
    g.beginPath();
    const y = (i * 5.7) % 512;
    for (let x = 0; x <= 512; x += 16) g.lineTo(x, y + Math.sin(x / 60 + i) * 4);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 3); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A cylinder from p to q (Vector3s). */
function rod(p, q, radius, material) {
  const length = p.distanceTo(q);
  const mesh = new THREE.Mesh(geo(`rod:${radius}`, () => new THREE.CylinderGeometry(radius, radius, 1, 14)), material);
  mesh.scale.y = length;
  mesh.position.copy(p).add(q).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), q.clone().sub(p).normalize());
  return mesh;
}

export class Bench3D {
  constructor(canvas, { interactive = true, onPick = () => {}, quality = "auto", margin = 1.02 } = {}) {
    this.canvas = canvas;
    this.margin = margin;
    const low = quality === "low" || (quality === "auto" && (navigator.hardwareConcurrency ?? 4) <= 4);
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: !interactive });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, low ? 1.25 : 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.shadowMap.enabled = !low;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color("#e9e4da");
    this.camera = new THREE.PerspectiveCamera(38, 16 / 9, 0.1, 100);
    this.scene.add(new THREE.HemisphereLight("#ffffff", "#8a7a66", 1.1));
    const sun = new THREE.DirectionalLight("#fff6e8", 2.2);
    sun.position.set(3, 7, 5);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8 });
    this.scene.add(sun);
    const table = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshStandardMaterial({ map: woodTexture(), roughness: 0.8 }));
    table.rotation.x = -Math.PI / 2; table.receiveShadow = true;
    this.scene.add(table);
    this.mat = new THREE.Mesh(new THREE.BoxGeometry(1, 0.02, 1), new THREE.MeshStandardMaterial({ color: "#ffffff", map: matTexture(), roughness: 0.92 }));
    this.mat.receiveShadow = true; this.mat.position.y = 0.01;
    this.scene.add(this.mat);
    this.parts = new THREE.Group(); this.scene.add(this.parts);
    this.chargeMesh = null; this.paths = []; this.dynamic = [];
    this.target = new THREE.Vector3(); this.distance = 8; this.fitted = "";
    if (interactive) {
      this.controls = new OrbitControls(this.camera, canvas);
      Object.assign(this.controls, { enableDamping: true, dampingFactor: 0.08, maxPolarAngle: Math.PI * 0.46, minDistance: 2.5, maxDistance: 18, enablePan: true });
      let down = null;
      canvas.addEventListener("pointerdown", (e) => { down = [e.clientX, e.clientY]; });
      canvas.addEventListener("pointerup", (e) => {
        if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 6) return;
        onPick(this.pick(e.clientX, e.clientY));
      });
      new ResizeObserver(() => this.resize()).observe(canvas);
    }
    this.raycaster = new THREE.Raycaster();
  }

  /** World position of a grid point. */
  at([x, y], h = WIRE_Y) { return new THREE.Vector3(x - this.cx, h, y - this.cy); }

  update(components, solution, { selected = null, electrons = false, t = {} } = {}) {
    for (const child of [...this.parts.children]) { this.parts.remove(child); child.traverse((o) => { if (o.material?.map && o.material.map !== glowTexture && o.isSprite) o.material.map.dispose(); if (o.isSprite) o.material.dispose(); }); }
    this.dynamic = [];
    const xs = components.flatMap((c) => [c.a[0], c.b[0]]), ys = components.flatMap((c) => [c.a[1], c.b[1]]);
    const [x0, x1, y0, y1] = xs.length ? [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)] : [0, 4, 0, 4];
    this.cx = (x0 + x1) / 2; this.cy = (y0 + y1) / 2;
    const w = x1 - x0 + 1.6, d = y1 - y0 + 1.6;
    this.mat.scale.set(w, 1, d);
    this.mat.material.map.repeat.set(w / 2, d / 2);
    const key = `${x0},${x1},${y0},${y1}`;
    if (key !== this.fitted) { this.fit(w, d); this.fitted = key; }
    const nodes = new Map();
    for (const c of components) for (const p of [c.a, c.b]) nodes.set(String(p), p);
    for (const p of nodes.values()) {
      const solder = new THREE.Mesh(geo("node", () => new THREE.SphereGeometry(0.055, 12, 10)), std("#9aa0a6", { metalness: 0.8, roughness: 0.3 }));
      solder.position.copy(this.at(p)); this.parts.add(solder);
    }
    for (const c of components) this.parts.add(this.part(c, solution?.components[c.id] ?? {}, { selected: selected === c.id, shorted: solution?.shorted, t }));
    // charges: one small bright sphere per path, moved every frame
    this.paths = chargePaths(components, solution, electrons).map((ch) => ({ ...ch, pa: this.at(ch.a, WIRE_Y + 0.07), pb: this.at(ch.b, WIRE_Y + 0.07) }));
    if (this.chargeMesh) { this.scene.remove(this.chargeMesh); this.chargeMesh.dispose(); }
    this.chargeMesh = null;
    if (this.paths.length) {
      const color = solution?.shorted ? "#ff3b30" : electrons ? "#4aa3ff" : "#ffd54a";
      this.chargeMesh = new THREE.InstancedMesh(geo("charge", () => new THREE.SphereGeometry(0.05, 10, 8)), new THREE.MeshBasicMaterial({ color }), this.paths.length);
      this.scene.add(this.chargeMesh);
    }
  }

  fit(w, d) {
    this.target.set(0, 0.1, 0.25);
    const fov = (this.camera.fov * Math.PI) / 180;
    const span = Math.max(w / Math.max(this.camera.aspect, 0.6), d * 0.92);
    this.distance = Math.max(3.5, (span / 2 / Math.tan(fov / 2)) * this.margin);
    this.orbit(0);
    if (this.controls) { this.controls.target.copy(this.target); this.controls.update(); }
  }
  /** Put the camera on its orbit: azimuth in radians (0 = the student's side), elevation. */
  orbit(azimuth, elevation = 0.92) {
    const r = this.distance;
    this.camera.position.set(this.target.x + r * Math.cos(elevation) * Math.sin(azimuth), r * Math.sin(elevation), this.target.z + r * Math.cos(elevation) * Math.cos(azimuth));
    this.camera.lookAt(this.target);
  }

  part(c, r, { selected, shorted, t }) {
    const g = new THREE.Group();
    g.userData.id = c.id;
    const a = this.at(c.a), b = this.at(c.b), mid = a.clone().add(b).multiplyScalar(0.5);
    const dir = b.clone().sub(a).normalize();
    const along = (s, h = WIRE_Y) => mid.clone().addScaledVector(dir, s).setY(h);
    const lead = std("#b8bec4", { metalness: 0.85, roughness: 0.25 });
    const insulation = std("#c8372d");
    const body = new THREE.Group(); // the part itself, built along +x, then turned onto the edge
    body.position.copy(mid);
    body.rotation.y = -Math.atan2(dir.z, dir.x);
    body.scale.setScalar(SIZE);
    const add = (mesh, cast = true) => { mesh.castShadow = cast; body.add(mesh); return mesh; };
    const leads = (half) => { if (half * SIZE < 0.5) { g.add(rod(a, along(-half * SIZE), 0.02, lead)); g.add(rod(along(half * SIZE), b, 0.02, lead)); } };
    let tag = null, tagHeight = 0.42;

    switch (c.type) {
      case "wire":
        g.add(rod(a, b, 0.035, insulation));
        break;
      case "battery": {
        leads(0.34);
        const cell = add(new THREE.Mesh(geo("cell", () => new THREE.CylinderGeometry(0.17, 0.17, 0.62, 28)), shorted ? std("#7a1410", { emissive: "#ff2a1a", emissiveIntensity: 0.6 }) : std("#22252a", { roughness: 0.35 })));
        cell.rotation.z = Math.PI / 2; cell.position.y = 0.18;
        const stripe = add(new THREE.Mesh(geo("stripe", () => new THREE.CylinderGeometry(0.172, 0.172, 0.22, 28)), std("#e0453a")));
        stripe.rotation.z = Math.PI / 2; stripe.position.set(0.12, 0.18, 0);
        const cap = add(new THREE.Mesh(geo("cap", () => new THREE.CylinderGeometry(0.07, 0.07, 0.06, 16)), std("#c9a227", { metalness: 0.9, roughness: 0.2 })));
        cap.rotation.z = Math.PI / 2; cap.position.set(0.34, 0.18, 0); // the + terminal is on the b side
        tag = `${c.V} V`; tagHeight = 0.62;
        break;
      }
      case "resistor": {
        leads(0.19);
        const res = add(new THREE.Mesh(geo("res", () => new THREE.CapsuleGeometry(0.07, 0.24, 6, 18)), std("#e2cfa3", { roughness: 0.6 })));
        res.rotation.z = Math.PI / 2; res.position.y = WIRE_Y + 0.02;
        resistorBands(c.R).forEach((colour, i) => {
          const band = add(new THREE.Mesh(geo("band", () => new THREE.CylinderGeometry(0.073, 0.073, 0.028, 18)), std(colour)), false);
          band.rotation.z = Math.PI / 2; band.position.set(-0.1 + i * 0.055 + (i === 3 ? 0.03 : 0), WIRE_Y + 0.02, 0);
        });
        tag = `${c.id} · ${c.R} Ω`;
        break;
      }
      case "bulb": {
        const brightness = c.burnt ? 0 : r.brightness ?? 0;
        leads(0.12);
        const socket = add(new THREE.Mesh(geo("socket", () => new THREE.CylinderGeometry(0.11, 0.12, 0.16, 20)), std("#3a3d42", { metalness: 0.6 })));
        socket.position.y = 0.08;
        const glass = add(new THREE.Mesh(geo("glass", () => new THREE.SphereGeometry(0.18, 28, 20)), new THREE.MeshStandardMaterial({
          color: c.burnt ? "#4a4a4a" : "#fffaf0", transparent: true, opacity: c.burnt ? 0.8 : 0.35 + 0.5 * brightness, roughness: 0.1,
          emissive: "#ffcc55", emissiveIntensity: 2.4 * brightness })), false);
        glass.position.y = 0.33;
        const filament = add(new THREE.Mesh(geo("filament", () => new THREE.TorusGeometry(0.05, 0.008, 6, 20)), new THREE.MeshBasicMaterial({ color: brightness > 0.02 ? "#fff3c4" : "#555" })), false);
        filament.position.y = 0.33;
        if (brightness > 0.02) {
          const halo = glow("#ffd54a", 0.6 + 1.4 * brightness); halo.position.y = 0.33; body.add(halo);
          const light = new THREE.PointLight("#ffcf66", 2.5 * brightness, 3, 2); light.position.y = 0.4; body.add(light);
        }
        tag = `${c.id} · ${c.R} Ω`; tagHeight = 0.72;
        break;
      }
      case "led": {
        const brightness = c.burnt ? 0 : r.lit ? Math.max(0.15, r.brightness ?? 0) : 0;
        leads(0.06);
        const rim = add(new THREE.Mesh(geo("ledrim", () => new THREE.CylinderGeometry(0.085, 0.085, 0.03, 20)), std(c.burnt ? "#222" : "#b3121a")));
        rim.position.y = WIRE_Y + 0.02;
        const dome = add(new THREE.Mesh(geo("leddome", () => new THREE.CapsuleGeometry(0.07, 0.08, 6, 18)), new THREE.MeshStandardMaterial({
          color: c.burnt ? "#1b1b1b" : "#ff3a3a", transparent: true, opacity: c.burnt ? 1 : 0.82, roughness: 0.15,
          emissive: "#ff2020", emissiveIntensity: c.burnt ? 0 : 3 * brightness })));
        dome.position.y = WIRE_Y + 0.12;
        if (brightness > 0.02) { const halo = glow("#ff3030", 0.45 + 0.9 * brightness); halo.position.y = WIRE_Y + 0.14; body.add(halo); }
        tag = c.burnt ? `${c.id} · ${t.burnt ?? "burnt"}` : c.id; tagHeight = 0.45;
        break;
      }
      case "switch": {
        leads(0.21);
        const base = add(new THREE.Mesh(geo("swbase", () => new THREE.BoxGeometry(0.5, 0.05, 0.2)), std("#2d3035")));
        base.position.y = 0.025;
        for (const x of [-0.19, 0.19]) { const post = add(new THREE.Mesh(geo("post", () => new THREE.CylinderGeometry(0.03, 0.03, 0.08, 12)), lead)); post.position.set(x, 0.08, 0); }
        const pivot = new THREE.Group(); pivot.position.set(-0.19, 0.11, 0); body.add(pivot);
        const lever = new THREE.Mesh(geo("lever", () => new THREE.BoxGeometry(0.4, 0.025, 0.05)), std("#c27c2c", { metalness: 0.7, roughness: 0.3 }));
        lever.position.x = 0.2; lever.castShadow = true; pivot.add(lever);
        pivot.rotation.z = c.closed ? 0 : 0.55;
        tag = c.id;
        break;
      }
      case "ammeter": case "voltmeter": {
        leads(0.24);
        const box = add(new THREE.Mesh(geo("meter", () => new THREE.BoxGeometry(0.48, 0.14, 0.4)), std(c.type === "ammeter" ? "#f2c230" : "#3ba3d9", { roughness: 0.5 })));
        box.position.y = 0.07;
        const reading = format(r.reading ?? 0, c.type === "ammeter" ? "A" : "V");
        const face = new THREE.Mesh(geo("face", () => new THREE.PlaneGeometry(0.4, 0.3)), new THREE.MeshBasicMaterial({ map: textTexture([c.type === "ammeter" ? "A" : "V", reading], { width: 400, height: 300, bg: "#c9d6b8", fg: "#1a2214", font: "700 58px system-ui, sans-serif", lcd: true }) }));
        // the screen faces up and reads from the student's side, whatever way the meter lies
        face.rotation.x = -Math.PI / 2;
        face.position.copy(mid).setY(mid.y + 0.14 * SIZE + 0.004);
        face.scale.setScalar(SIZE);
        g.add(face);
        break;
      }
    }
    if (c.burnt) {
      const smoke = glow("#333333", 0.5); smoke.material.blending = THREE.NormalBlending; smoke.material.opacity = 0.55;
      smoke.position.copy(mid).setY(0.7); g.add(smoke);
    }
    if (selected) {
      const ring = new THREE.Mesh(geo("ring", () => new THREE.RingGeometry(0.36, 0.42, 40)), new THREE.MeshBasicMaterial({ color: "#e0453a", side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2; ring.position.copy(mid).setY(0.025); ring.scale.setScalar(SIZE); g.add(ring);
    }
    if (tag) { const s = label(tag); s.position.copy(mid).setY(tagHeight * SIZE + 0.18); g.add(s); }
    // an invisible box the student taps
    const hit = new THREE.Mesh(geo("hit", () => new THREE.BoxGeometry(0.95, 0.7, 0.7)), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.copy(mid).setY(0.2); hit.rotation.y = -Math.atan2(dir.z, dir.x); hit.userData.id = c.id; hit.userData.hit = true;
    g.add(hit);
    g.add(body);
    return g;
  }

  pick(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const p = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(p, this.camera);
    const hits = this.raycaster.intersectObjects(this.parts.children, true).filter((h) => h.object.userData.hit);
    const wire = (id) => id?.startsWith("w");
    return hits.find((h) => !wire(h.object.userData.id))?.object.userData.id ?? hits[0]?.object.userData.id ?? null;
  }

  resize(width = this.canvas.clientWidth, height = this.canvas.clientHeight) {
    if (!width || !height) return;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  /** Draw the bench at time t (seconds): charges move, the camera follows the controls. */
  frame(t) {
    if (this.chargeMesh) {
      const m = new THREE.Matrix4(), p = new THREE.Vector3();
      this.paths.forEach((ch, i) => { p.lerpVectors(ch.pa, ch.pb, chargeAt(ch, t)); m.makeTranslation(p.x, p.y, p.z); this.chargeMesh.setMatrixAt(i, m); });
      this.chargeMesh.instanceMatrix.needsUpdate = true;
    }
    this.controls?.update();
    this.renderer.render(this.scene, this.camera);
  }

  start() {
    if (this.running) return;
    this.running = true;
    const loop = (now) => { if (!this.running) return; this.frame(now / 1000); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }
  stop() { this.running = false; }
  dispose() { this.stop(); this.controls?.dispose(); this.renderer.dispose(); }
}
