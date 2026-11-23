/* 首页背景的 3D 层：只画建筑，透出底下的云海画面
   铬面飞碟 ×3 / 圆环平台 ×5 / 细白塔 / 芥末黄光束，指针轻微视差 */
import * as THREE from './vendor/three.module.min.js';

const canvas = document.getElementById('sky-canvas');
if (!canvas) throw new Error('sky-canvas not found');

const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function radialTexture(rgb, inner) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, `rgba(${rgb},${inner})`);
  g.addColorStop(0.45, `rgba(${rgb},${inner * 0.4})`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  x.fillStyle = g;
  x.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function beamTexture() {
  const c = document.createElement('canvas');
  c.width = 16;
  c.height = 256;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 256, 0, 0);
  g.addColorStop(0, 'rgba(236,178,72,0.9)');
  g.addColorStop(0.3, 'rgba(232,170,64,0.42)');
  g.addColorStop(1, 'rgba(228,164,58,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 16, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* ---------- 渲染器：透明画布叠在插画上 ---------- */
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
renderer.setClearAlpha(0);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 900);
camera.position.set(0, 12, 96);
camera.lookAt(0, 4, 0);

/* ---------- 反射环境（不进入主场景） ---------- */
const envScene = new THREE.Scene();
const skyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide,
  uniforms: {
    uTop: { value: new THREE.Color('#8fb4be') },
    uMid: { value: new THREE.Color('#cbdbd6') },
    uLow: { value: new THREE.Color('#f7ecd4') }
  },
  vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    varying vec3 vP;
    uniform vec3 uTop; uniform vec3 uMid; uniform vec3 uLow;
    void main(){
      vec3 dir = normalize(vP);
      float h = clamp(dir.y * 0.5 + 0.5, 0.0, 1.0);
      vec3 col = mix(uLow, uMid, smoothstep(0.2, 0.5, h));
      col = mix(col, uTop, smoothstep(0.5, 0.95, h));
      gl_FragColor = vec4(col, 1.0);
    }`
});
envScene.add(new THREE.Mesh(new THREE.SphereGeometry(60, 32, 24), skyMat));
function envPanel(color, w, h, pos, intensity) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }));
  m.position.set(pos[0], pos[1], pos[2]);
  m.lookAt(0, 0, 0);
  m.material.color.multiplyScalar(intensity);
  envScene.add(m);
}
envPanel(0xffffff, 44, 8, [0, 52, 0], 2.2);
envPanel(0xfff2d6, 24, 4, [-28, 8, -36], 2.8);
envPanel(0xf3e8d0, 56, 26, [0, -20, -38], 1.1);
const pmrem = new THREE.PMREMGenerator(renderer);
const envMap = pmrem.fromScene(envScene, 0.04).texture;

/* ---------- 灯光 ---------- */
scene.add(new THREE.HemisphereLight(0xeaf4f6, 0xf0e0c4, 1.25));
const sun = new THREE.DirectionalLight(0xfff0d2, 2.05);
sun.position.set(-38, 26, 22);
scene.add(sun);
const fill = new THREE.DirectionalLight(0xcfdfe6, 0.6);
fill.position.set(30, 14, 38);
scene.add(fill);

/* ---------- 材质 ---------- */
const cream = new THREE.MeshStandardMaterial({ color: 0xf3e8d2, metalness: 0.1, roughness: 0.72, envMap, envMapIntensity: 0.5 });
const deepCream = new THREE.MeshStandardMaterial({ color: 0xd6c7a9, metalness: 0.12, roughness: 0.8, envMap, envMapIntensity: 0.4 });
const silver = new THREE.MeshStandardMaterial({ color: 0xf3f6f6, metalness: 1, roughness: 0.09, envMap, envMapIntensity: 1.7 });
const darkTrim = new THREE.MeshStandardMaterial({ color: 0x63605a, metalness: 0.5, roughness: 0.55, envMap, envMapIntensity: 0.5 });
const brightTrim = new THREE.MeshStandardMaterial({ color: 0xfff8e8, metalness: 0.35, roughness: 0.35, envMap, envMapIntensity: 1.1 });
const glowWarm = new THREE.MeshBasicMaterial({ color: 0xffd79a });
const shadowTex = radialTexture('46,52,44', 0.5);

function panelTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = '#f0e4cb';
  x.fillRect(0, 0, 256, 256);
  x.strokeStyle = 'rgba(120,100,64,0.24)';
  x.lineWidth = 1.2;
  for (let i = 1; i <= 4; i++) {
    x.beginPath();
    x.arc(128, 128, i * 30, 0, Math.PI * 2);
    x.stroke();
  }
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    x.beginPath();
    x.moveTo(128 + Math.cos(a) * 38, 128 + Math.sin(a) * 38);
    x.lineTo(128 + Math.cos(a) * 120, 128 + Math.sin(a) * 120);
    x.stroke();
  }
  x.fillStyle = 'rgba(255,214,150,0.9)';
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    x.beginPath();
    x.arc(128 + Math.cos(a) * 104, 128 + Math.sin(a) * 104, 3, 0, Math.PI * 2);
    x.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const deckTex = panelTexture();

function windows(parent, radius, y, count) {
  const geo = new THREE.SphereGeometry(radius * 0.013, 5, 5);
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    const m = new THREE.Mesh(geo, glowWarm);
    m.position.set(Math.cos(a) * radius * 0.93, y, Math.sin(a) * radius * 0.93);
    parent.add(m);
  }
}

/* 圆环平台：厚盘 + 深色包边 + 底部锥 + 桅杆 + 灯点 + 投影 */
function makePlatform(r) {
  const g = new THREE.Group();
  const deckMat = new THREE.MeshStandardMaterial({ map: deckTex, metalness: 0.1, roughness: 0.78, envMap, envMapIntensity: 0.35 });
  const deck = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.99, r * 0.2, 64), [deckMat, cream, cream]);
  deck.position.y = r * 0.1;
  g.add(deck);
  // 侧壁：比顶面暗一档，撑出高度
  const band = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.99, r * 0.9, r * 0.34, 64), deepCream);
  band.position.y = -r * 0.17;
  g.add(band);
  // 亮边：一圈奶油高光
  const rim = new THREE.Mesh(new THREE.TorusGeometry(r * 1.0, r * 0.026, 8, 80), brightTrim);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = r * 0.2;
  g.add(rim);
  const under = new THREE.Mesh(new THREE.TorusGeometry(r * 0.9, r * 0.024, 8, 64), darkTrim);
  under.rotation.x = Math.PI / 2;
  under.position.y = -r * 0.34;
  g.add(under);
  const cone = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.34, r * 0.03, r * 0.56, 24), deepCream);
  cone.position.y = -r * 0.6;
  g.add(cone);
  // 甲板上的小体量：塔架 + 舱室
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.022, r * 0.04, r * 0.7, 10), brightTrim);
  mast.position.set(r * 0.1, r * 0.45, -r * 0.08);
  g.add(mast);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(r * 0.03, 10, 8), glowWarm);
  lamp.position.set(r * 0.1, r * 0.8, -r * 0.08);
  g.add(lamp);
  const box = new THREE.Mesh(new THREE.BoxGeometry(r * 0.3, r * 0.16, r * 0.2), cream);
  box.position.set(-r * 0.34, r * 0.27, r * 0.22);
  g.add(box);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.05, r * 0.05, r * 0.22, 10), silver);
  cap.position.set(r * 0.42, r * 0.28, r * 0.3);
  g.add(cap);
  windows(g, r, -r * 0.2, 30);
  const sh = new THREE.Sprite(new THREE.SpriteMaterial({ map: shadowTex, transparent: true, depthWrite: false, opacity: 0.45 }));
  sh.scale.set(r * 2.3, r * 1.0, 1);
  sh.position.y = -r * 1.2;
  g.add(sh);
  return g;
}

/* 铬面飞碟：车削碟体 + 边缘环 + 舱盖 + 底部暖光 */
function makeSaucer(r) {
  const g = new THREE.Group();
  const pts = [];
  const N = 20;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    pts.push(new THREE.Vector2(Math.max(t * r, 0.001), Math.cos(t * Math.PI * 0.92) * r * 0.15 - r * 0.04));
  }
  for (let i = N; i >= 0; i--) {
    const t = i / N;
    pts.push(new THREE.Vector2(Math.max(t * r, 0.001), -Math.cos(t * Math.PI * 0.92) * r * 0.075 - r * 0.02));
  }
  g.add(new THREE.Mesh(new THREE.LatheGeometry(pts, 72), silver));
  const ring = new THREE.Mesh(new THREE.TorusGeometry(r * 0.985, r * 0.02, 8, 88), darkTrim);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = -r * 0.028;
  g.add(ring);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(r * 0.28, 30, 16, 0, Math.PI * 2, 0, Math.PI / 2), silver);
  dome.position.y = r * 0.11;
  g.add(dome);
  const collar = new THREE.Mesh(new THREE.TorusGeometry(r * 0.28, r * 0.03, 8, 40), darkTrim);
  collar.rotation.x = Math.PI / 2;
  collar.position.y = r * 0.11;
  g.add(collar);
  const lamp = new THREE.Sprite(new THREE.SpriteMaterial({
    map: radialTexture('255,198,124', 0.8), transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, opacity: 0.6
  }));
  lamp.scale.set(r * 2.2, r * 2.2, 1);
  lamp.position.y = -r * 0.1;
  g.add(lamp);
  windows(g, r * 0.97, -r * 0.045, 20);
  return g;
}

/* 细白塔：收分塔身 + 两圈观景盘 + 尖顶 */
function makeTower(h) {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 3.4, h * 0.12, 24), deepCream);
  base.position.y = h * 0.06;
  g.add(base);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 2.0, h * 0.9, 24), cream);
  shaft.position.y = h * 0.55;
  g.add(shaft);
  [0.52, 0.78].forEach((k) => {
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 3.4, 0.5, 48), cream);
    disc.position.y = h * k;
    g.add(disc);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(3.62, 0.09, 8, 60), darkTrim);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = h * k + 0.25;
    g.add(rim);
    windows(g, 3.4, h * k + 0.12, 22);
  });
  const spire = new THREE.Mesh(new THREE.ConeGeometry(0.3, h * 0.2, 14), silver);
  spire.position.y = h * 1.06;
  g.add(spire);
  return g;
}

/* ---------- 组装 ---------- */
const tower = makeTower(26);
tower.position.set(-40, -20, -14);
scene.add(tower);

const saucerBig = makeSaucer(5.6);
saucerBig.position.set(30, 8, -4);
saucerBig.rotation.z = -0.06;
scene.add(saucerBig);

const saucerMid = makeSaucer(3.6);
saucerMid.position.set(12, 15, -30);
saucerMid.rotation.z = 0.05;
scene.add(saucerMid);

const saucerFar = makeSaucer(2.6);
saucerFar.position.set(-12, 19, -60);

const saucerTiny1 = makeSaucer(1.7);
saucerTiny1.position.set(-24, 6, -74);
scene.add(saucerTiny1);

const saucerTiny2 = makeSaucer(1.4);
saucerTiny2.position.set(6, 3, -88);
scene.add(saucerTiny2);

const saucerLeft = makeSaucer(2.4);
saucerLeft.position.set(-20, 12, -34);
scene.add(saucerLeft);
scene.add(saucerFar);

const platforms = [];
[
  [6, -16, 10, 7.4],
  [-16, -19, -14, 5.4],
  [24, -15, -20, 6.0],
  [34, -21, -38, 4.0],
  [-8, -20, -34, 4.6],
  [40, -11, 4, 3.6],
  [18, -14, -6, 4.4],
  [-26, -22, -46, 3.2],
  [30, -25, -60, 2.8]
].forEach((p, i) => {
  const g = makePlatform(p[3]);
  g.position.set(p[0], p[1], p[2]);
  g.rotation.y = i * 0.7;
  platforms.push(g);
  scene.add(g);
});

const sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({
  map: radialTexture('255,232,180', 0.9), transparent: true, depthWrite: false,
  blending: THREE.AdditiveBlending, opacity: 0.55
}));
sunGlow.scale.set(70, 40, 1);
sunGlow.position.set(26, -4, -70);
scene.add(sunGlow);

/* 芥末黄光束 */
const beamTex = beamTexture();
const beam = new THREE.Mesh(
  new THREE.PlaneGeometry(1.1, 140),
  new THREE.MeshBasicMaterial({ map: beamTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.5 })
);
beam.position.set(-10, 4, -52);
beam.rotation.z = 0.62;
scene.add(beam);
const beamGlow = new THREE.Mesh(
  new THREE.PlaneGeometry(3.4, 140),
  new THREE.MeshBasicMaterial({ map: beamTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.16 })
);
beamGlow.position.copy(beam.position);
beamGlow.rotation.z = beam.rotation.z;
scene.add(beamGlow);

/* ---------- 尺寸 ---------- */
function resize() {
  const w = canvas.clientWidth || 1;
  const h = canvas.clientHeight || 1;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
resize();
window.addEventListener('resize', resize);

/* ---------- 视差 ---------- */
const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
window.addEventListener('pointermove', (e) => {
  pointer.tx = (e.clientX / window.innerWidth - 0.5) * 2;
  pointer.ty = (e.clientY / window.innerHeight - 0.5) * 2;
}, { passive: true });
const scroll = { y: 0, ty: 0 };
window.addEventListener('scroll', () => { scroll.ty = window.scrollY / 520; }, { passive: true });

function active() {
  return document.body.getAttribute('data-view') === 'home' && document.visibilityState === 'visible';
}

/* ---------- 循环 ---------- */
let raf = 0;
const clockStart = performance.now();

function frame(now) {
  raf = requestAnimationFrame(frame);
  if (!active()) return;
  const t = (now - clockStart) / 1000;

  pointer.x += (pointer.tx - pointer.x) * 0.06;
  pointer.y += (pointer.ty - pointer.y) * 0.06;
  scroll.y += (scroll.ty - scroll.y) * 0.05;

  camera.position.x = pointer.x * 3.2;
  camera.position.y = 12 - pointer.y * 2.0 + Math.sin(t * 0.22) * 0.45 + scroll.y * 1.4;
  camera.lookAt(0, 4 + scroll.y * 0.8, 0);

  saucerBig.position.y = 8 + Math.sin(t * 0.4) * 0.9;
  saucerBig.rotation.y = Math.sin(t * 0.18) * 0.12;
  saucerMid.position.y = 15 + Math.sin(t * 0.31 + 1.2) * 0.7;
  saucerMid.rotation.y = Math.sin(t * 0.14 + 1) * 0.1;
  saucerFar.position.y = 19 + Math.sin(t * 0.24 + 2) * 0.5;

  platforms.forEach((p, i) => {
    p.position.y += Math.sin(t * 0.28 + i * 1.3) * 0.0012;
    p.rotation.y += 0.00022 * (i % 2 ? 1 : -1);
  });

  beam.material.opacity = 0.44 + Math.sin(t * 1.4) * 0.08;

  renderer.render(scene, camera);
}

if (REDUCED) {
  renderer.render(scene, camera);
  requestAnimationFrame(() => canvas.classList.add('is-live'));
} else {
  raf = requestAnimationFrame(frame);
  requestAnimationFrame(() => requestAnimationFrame(() => canvas.classList.add('is-live')));
}

window.__homeSky = { scene, renderer, camera, resize };
