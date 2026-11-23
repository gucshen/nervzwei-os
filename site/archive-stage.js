/* ===== 视图转场 3D 舞台（three.js） =====
   一张档案纸从下方带倾角压上来：透视里纸面从远端滑近、落定时轻微回弹；纸后还有两层同规格纸页，
   位移滞后形成厚度；纸缘一道 1.6px 骨白扫线（终端扫描线的余韵），空间里 90 颗纸屑浮动。
   纸张纹理现场用 Canvas 画：细线、等宽小字、四角短刻、中央菱形、纤维点、斜向受光、压边暗角。
   三拍：进场 / 停留 / 抽离，参数写死在顶部，便于统一调。 */
import * as THREE from './vendor/three.module.min.js';

const DEG = Math.PI / 180;
const FOV = 30;
const CAM_Z = 100;
const COVER_MS = 360;
const COVER_MS_FULL = 400;
const HOLD_MS = 200;
const OUT_MS = 440;
const OUT_MS_FULL = 480;
const OVERSCAN = 1.04;

let renderer = null;
let scene = null;
let camera = null;
let group = null;
let plates = [];
let dust = null;
let bar = null;
let shadow = null;
let sweep = null;
let hud = null;
let hudFill = null;
let hudPct = null;
let tex = null;
let stageCanvas = null;
let paperCanvas = null;
let ctx = null;
let viewW = 0;
let viewH = 0;
let viewportH = 900;
let running = false;
let rafId = 0;
let lost = false;

const easeOutQuart = (t) => 1 - Math.pow(1 - t, 4);
const easeInCubic = (t) => t * t * t;
const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);

/* ---------- 纸张纹理 ---------- */
function paintPaper(label, index, total, aspect) {
  const w = 1600;
  const h = Math.max(600, Math.round(w / Math.max(0.6, aspect)));
  paperCanvas.width = w;
  paperCanvas.height = h;

  ctx.fillStyle = '#e8e5e1';
  ctx.fillRect(0, 0, w, h);

  let g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, 'rgba(255,255,255,0.10)');
  g.addColorStop(0.55, 'rgba(255,255,255,0)');
  g.addColorStop(1, 'rgba(20,22,15,0.055)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  g = ctx.createLinearGradient(0, 0, w * 0.85, h);
  g.addColorStop(0, 'rgba(255,255,255,0.15)');
  g.addColorStop(0.42, 'rgba(255,255,255,0.03)');
  g.addColorStop(1, 'rgba(20,22,15,0.05)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  for (let i = 0; i < 620; i++) {
    const x = Math.random() * w;
    const y = Math.random() * h;
    const a = 0.015 + Math.random() * 0.045;
    ctx.fillStyle = Math.random() > 0.45 ? 'rgba(20,22,15,' + a + ')' : 'rgba(255,255,255,' + a + ')';
    ctx.fillRect(x, y, 1 + Math.random() * 1.6, 1);
  }

  const pad = Math.round(w * 0.062);
  const ink = 'rgba(20,22,15,';
  const fs = Math.max(11, Math.round(h * 0.0112));

  ctx.fillStyle = ink + '0.22)';
  ctx.fillRect(pad, Math.round(h * 0.088), w - pad * 2, 1);

  const tick = Math.round(w * 0.012);
  const inset = Math.round(w * 0.032);
  ctx.fillStyle = ink + '0.34)';
  ctx.fillRect(inset, inset, tick, 1);
  ctx.fillRect(inset, inset, 1, tick);
  ctx.fillRect(w - inset - tick, inset, tick, 1);
  ctx.fillRect(w - inset - 1, inset, 1, tick);

  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.rotate(45 * DEG);
  ctx.strokeStyle = ink + '0.26)';
  ctx.lineWidth = 1.4;
  const d = Math.round(h * 0.040);
  ctx.strokeRect(-d, -d, d * 2, d * 2);
  ctx.restore();

  ctx.textBaseline = 'middle';
  try {
    ctx.letterSpacing = Math.round(fs * 0.28) + 'px';
  } catch (e) {
    /* 忽略不支持字距的浏览器 */
  }

  /* 中央题头：序号 + 视图名 + 六格索引 */
  ctx.textAlign = 'center';
  ctx.font = '400 ' + Math.round(fs * 1.5) + 'px "Space Mono", Consolas, monospace';
  ctx.fillStyle = ink + '0.62)';
  ctx.fillText(((index < 10 ? '0' : '') + index) + '  —  ' + label, w / 2, h / 2 + d * 2 + h * 0.055);

  const ticks = 6;
  const tw = Math.round(w * 0.022);
  const gap = Math.round(w * 0.010);
  const totalW = ticks * tw + (ticks - 1) * gap;
  const ty = h / 2 + d * 2 + h * 0.055 + fs * 4.6;
  let tx = (w - totalW) / 2;
  for (let i = 0; i < ticks; i++) {
    const active = i === index - 1;
    ctx.fillStyle = active ? 'rgba(176,113,47,0.92)' : ink + '0.24)';
    const th = active ? 2 : 1;
    ctx.fillRect(tx, ty - th / 2, tw, th);
    tx += tw + gap;
  }
  ctx.textAlign = 'left';

  /* 纸缘计量刻线：左缘一组短刻，每三道加长一道 */
  const railX = Math.round(w * 0.030);
  const railTop = Math.round(h * 0.16);
  const railBottom = Math.round(h * 0.84);
  const step = Math.round(h * 0.030);
  for (let k = 0; railTop + k * step < railBottom; k++) {
    const y = railTop + k * step;
    const long = k % 3 === 0;
    ctx.fillStyle = ink + (long ? '0.26)' : '0.16)');
    ctx.fillRect(railX, y, Math.round(w * (long ? 0.016 : 0.009)), 1);
  }
  ctx.fillStyle = ink + '0.12)';
  ctx.fillRect(railX + Math.round(w * 0.016), railTop, 1, railBottom - railTop);

  const topY = Math.round(h * 0.088) - fs * 1.6;
  ctx.font = '700 ' + fs + 'px "Space Mono", Consolas, monospace';
  ctx.fillStyle = ink + '0.80)';
  ctx.textAlign = 'left';
  ctx.fillText('ARCHIVE', pad, topY);
  const archW = ctx.measureText('ARCHIVE').width;

  ctx.font = '400 ' + fs + 'px "Space Mono", Consolas, monospace';
  ctx.fillStyle = ink + '0.46)';
  const num = (index < 10 ? '0' : '') + index + ' / ' + (total < 10 ? '0' : '') + total;
  ctx.fillText(num, pad + archW + fs * 1.7, topY);

  ctx.fillStyle = ink + '0.80)';
  ctx.textAlign = 'right';
  ctx.fillText(label, w - pad, topY);

  // 底边留给舞台读数条（HUD），纸面不再压线，免得和读数打架

  // 左侧斜线带：像档案封套的装订区
  ctx.save();
  ctx.strokeStyle = 'rgba(20,22,15,0.07)';
  ctx.lineWidth = 1;
  const hatchW = Math.round(w * 0.075);
  for (let hx = -h; hx < hatchW; hx += 9) {
    ctx.beginPath();
    ctx.moveTo(hx, h);
    ctx.lineTo(hx + h, 0);
    ctx.stroke();
  }
  ctx.restore();

  // 红色短杠：终端式的系统标记
  ctx.fillStyle = 'rgba(176,46,38,0.62)';
  ctx.fillRect(pad, topY + fs * 1.05, Math.round(fs * 2.4), 2);

  const vg = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.34, w / 2, h / 2, Math.max(w, h) * 0.8);
  vg.addColorStop(0, 'rgba(20,22,15,0)');
  vg.addColorStop(1, 'rgba(20,22,15,0.11)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle = ink + '0.30)';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, w - 2, h - 2);

  if (tex) tex.dispose();
  tex = new THREE.CanvasTexture(paperCanvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  for (const p of plates) {
    p.material.map = tex;
    p.material.needsUpdate = true;
  }
}

/* ---------- 场景 ---------- */
function build() {
  if (renderer) return true;
  try {
    stageCanvas = document.createElement('canvas');
    stageCanvas.id = 'stage-canvas';
    renderer = new THREE.WebGLRenderer({ canvas: stageCanvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
    renderer.setClearAlpha(0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
  } catch (e) {
    lost = true;
    renderer = null;
    return false;
  }

  paperCanvas = document.createElement('canvas');
  ctx = paperCanvas.getContext('2d');

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 1000);
  camera.position.set(0, 0, CAM_Z);

  group = new THREE.Group();
  scene.add(group);

  const geo = new THREE.PlaneGeometry(1, 1, 1, 1);
  const spec = [
    { z: 0, y: 0, rz: 0, s: 1, o: 1, c: 0xffffff },
    { z: -1.0, y: -0.1, rz: 0.4, s: 0.994, o: 0.97, c: 0xece9e4 },
    { z: -2.0, y: -0.2, rz: -0.55, s: 0.988, o: 0.94, c: 0xdfdbd4 }
  ];
  plates = spec.map((sp) => {
    const geo = new THREE.PlaneGeometry(1, 1, 28, 28);
    geo.userData.base = Float32Array.from(geo.attributes.position.array);
    const mat = new THREE.MeshBasicMaterial({ color: sp.c, transparent: true, opacity: sp.o, depthWrite: false });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(0, sp.y, sp.z);
    mesh.rotation.z = sp.rz * DEG;
    mesh.userData.base = sp;
    group.add(mesh);
    return mesh;
  });

  // 扫光：一条斜向的柔光带，进场时贴着纸面跑一趟
  const swCanvas = document.createElement('canvas');
  swCanvas.width = 8;
  swCanvas.height = 128;
  const wctx = swCanvas.getContext('2d');
  const wg = wctx.createLinearGradient(0, 0, 0, 128);
  wg.addColorStop(0, 'rgba(255,255,255,0)');
  wg.addColorStop(0.34, 'rgba(255,250,238,0.14)');
  wg.addColorStop(0.5, 'rgba(255,252,244,0.34)');
  wg.addColorStop(0.62, 'rgba(255,248,232,0.12)');
  wg.addColorStop(1, 'rgba(255,255,255,0)');
  wctx.fillStyle = wg;
  wctx.fillRect(0, 0, 8, 128);
  const sweepTex = new THREE.CanvasTexture(swCanvas);
  sweep = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1, 1, 1),
    new THREE.MeshBasicMaterial({
      map: sweepTex,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      color: 0xfff3df
    })
  );
  sweep.position.set(0, 0, 0.9);
  sweep.rotation.z = -7 * DEG;
  group.add(sweep);

  // 纸面下方的投影（只露出边缘外的一圈，负责「浮在页面之上」的重量感）
  const shadowCanvas = document.createElement('canvas');
  shadowCanvas.width = 64;
  shadowCanvas.height = 128;
  const sctx = shadowCanvas.getContext('2d');
  const sg = sctx.createLinearGradient(0, 0, 0, 128);
  sg.addColorStop(0, 'rgba(0,0,0,0)');
  sg.addColorStop(0.55, 'rgba(0,0,0,0.10)');
  sg.addColorStop(0.82, 'rgba(0,0,0,0.30)');
  sg.addColorStop(1, 'rgba(0,0,0,0.42)');
  sctx.fillStyle = sg;
  sctx.fillRect(0, 0, 64, 128);
  const shadowTex = new THREE.CanvasTexture(shadowCanvas);
  shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1, 1, 1),
    new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, opacity: 0.85, depthWrite: false })
  );
  shadow.position.set(0, -0.9, -0.6);
  group.add(shadow);

  bar = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1, 1, 1),
    new THREE.MeshBasicMaterial({ color: 0xf7f0e2, transparent: true, opacity: 0, depthWrite: false })
  );
  bar.position.set(0, 0, 0.6);
  group.add(bar);

  const N = 90;
  const pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 64;
    pos[i * 3 + 1] = (Math.random() - 0.5) * 36;
    pos[i * 3 + 2] = -6 + Math.random() * 6;
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  dust = new THREE.Points(
    dustGeo,
    new THREE.PointsMaterial({ color: 0xd8d1c2, size: 0.07, transparent: true, opacity: 0, depthWrite: false })
  );
  group.add(dust);

  document.body.appendChild(stageCanvas);
  stageCanvas.style.display = 'none';
  resize();
  return true;
}

function resize() {
  if (!renderer) return;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  viewportH = vh || 900;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(vw, vh, false);
  camera.aspect = vw / vh;
  camera.updateProjectionMatrix();

  viewH = 2 * CAM_Z * Math.tan((FOV * DEG) / 2);
  viewW = viewH * camera.aspect;

  for (const p of plates) {
    p.scale.set(viewW * OVERSCAN, viewH * OVERSCAN, 1);
  }
  // 扫线 = 1.6 屏幕像素厚，贴在纸面上缘
  const px = viewH / viewportH;
  bar.scale.set(viewW * OVERSCAN, px * 1.6, 1);
  bar.position.y = (viewH * OVERSCAN) / 2 - px * 1.6;
  bar.position.z = 0.6;

  // 投影平面比纸面略宽、向下偏移，只露出一圈软边
  shadow.scale.set(viewW * 1.02, viewH * 1.02, 1);
  shadow.position.y = -(viewH * OVERSCAN) / 2 - viewH * 0.06;

  sweep.scale.set(viewW * 1.06, viewH * 0.36, 1);

  const cv = renderer.domElement;
  cv.style.width = vw + 'px';
  cv.style.height = vh + 'px';
}

/* ---------- 纸的形变 ---------- */
// bow：整张纸的横向弧度；lift：上缘掀起；curl：下缘两角翻卷
function bend(mesh, bow, lift, curl) {
  const attr = mesh.geometry.attributes.position;
  const base = mesh.geometry.userData.base;
  if (!base) return;
  const arr = attr.array;
  for (let i = 0; i < arr.length; i += 3) {
    const x = base[i];
    const y = base[i + 1];
    let z = bow * ((x * x - 0.25) * 1.7 + (y * y - 0.25) * 0.5);
    if (lift) {
      const t = Math.max(0, (y - 0.06) / 0.44);
      z += lift * t * t;
    }
    if (curl) {
      const cy = Math.max(0, (-y - 0.28) / 0.22);
      const cx = Math.max(0, (Math.abs(x) - 0.32) / 0.18);
      z += curl * cy * cy * cx;
    }
    arr[i + 2] = z;
  }
  attr.needsUpdate = true;
}

/* ---------- 终端读数 ---------- */
function ensureHud() {
  if (hud) return hud;
  const style = document.createElement('style');
  style.textContent = [
    '#stage-hud{position:fixed;inset:0;z-index:9988;pointer-events:none;display:none;opacity:0',
    ';transition:opacity .26s ease;font-family:"Space Mono",ui-monospace,Consolas,monospace;font-size:9px',
    ';letter-spacing:.24em;text-transform:uppercase;color:rgba(20,22,15,.5)}',
    '#stage-hud.on{display:block}',
    '#stage-hud.lit{opacity:1}',
    '.shx-row{position:absolute;left:clamp(20px,5vw,72px);right:clamp(20px,5vw,72px);bottom:26px',
    ';display:flex;justify-content:space-between;align-items:flex-end}',
    '.shx-row b{font-weight:400;color:rgba(20,22,15,.8)}',
    '.shx-track{position:absolute;left:clamp(20px,5vw,72px);right:clamp(20px,5vw,72px);bottom:16px',
    ';height:1px;background:rgba(20,22,15,.16)}',
    '.shx-fill{display:block;height:1px;width:0;background:rgba(176,113,47,.92)',
    ';box-shadow:0 0 8px rgba(176,113,47,.45)}',
    '.shx-cur{display:inline-block;width:5px;height:9px;margin-left:10px;vertical-align:-1px',
    ';background:rgba(20,22,15,.62);animation:shx-blink 1.05s steps(2,end) infinite}',
    '@keyframes shx-blink{0%,49%{opacity:1}50%,100%{opacity:0}}',
    '.shx-tick{position:absolute;background:rgba(20,22,15,.14);opacity:0;transition:opacity .5s ease}',
    '.shx-tick.a-left{top:50%;left:0;width:20px;height:1px}',
    '.shx-tick.b-left{top:50%;right:0;width:20px;height:1px}',
    '.shx-tick.t-top{left:50%;top:0;width:1px;height:20px}',
    '.shx-tick.t-bot{left:50%;bottom:0;width:1px;height:20px}',
    '#stage-hud.lock .shx-tick{opacity:1}'
  ].join('');
  document.head.appendChild(style);

  hud = document.createElement('div');
  hud.id = 'stage-hud';
  hud.innerHTML =
    '<div class="shx-row"><span>TRANSFER <b class="shx-idx">03</b> / 06</span>' +
    '<span><b class="shx-pct">000</b>%<i class="shx-cur"></i></span></div>' +
    '<div class="shx-track"><i class="shx-fill"></i></div>' +
    '<i class="shx-tick a-left"></i><i class="shx-tick b-left"></i>' +
    '<i class="shx-tick t-top"></i><i class="shx-tick t-bot"></i>';
  document.body.appendChild(hud);
  hudFill = hud.querySelector('.shx-fill');
  hudPct = hud.querySelector('.shx-pct');
  return hud;
}

function hudShow(index) {
  const h = ensureHud();
  const idx = h.querySelector('.shx-idx');
  if (idx) idx.textContent = (index < 10 ? '0' : '') + index;
  h.classList.add('on');
  h.style.opacity = '0';
}

function hudHide() {
  if (!hud) return;
  hud.style.opacity = '0';
  hud.classList.remove('lock');
  window.setTimeout(function () {
    if (hud && hud.style.opacity === '0') hud.classList.remove('on');
  }, 300);
}

function hudSet(el, cfg) {
  if (!hud) return;
  // 读数覆盖「进场 + 停顿」，纸面落定时正好跑到 100%
  const span = cfg.cover + cfg.hold;
  const v = Math.max(0, Math.min(100, Math.round(clamp01(el / span) * 100)));
  const s = (v < 10 ? '00' : v < 100 ? '0' : '') + v;
  if (hudPct.textContent !== s) {
    hudPct.textContent = s;
    hudFill.style.width = v + '%';
  }
  if (v > 96) hud.classList.add('lock');
  else if (v < 40) hud.classList.remove('lock');

  // 纸面没盖满时不显示读数（否则会落在深色页面上看不清）
  let alpha;
  if (el < cfg.cover + cfg.hold) alpha = clamp01((v - 62) / 18);
  else alpha = Math.max(0, 1 - ((el - cfg.cover - cfg.hold) / cfg.out) * 2.2);
  hud.style.opacity = String(alpha);
}

/* ---------- 播放 ---------- */
function frame(ts, cfg, onCommit, done) {
  // 以第一帧的时间戳为原点：页面刚打开时的启动抖动不会吞掉动画时长
  if (cfg.origin === null) cfg.origin = ts;
  const el = ts - cfg.origin;

  const total = cfg.cover + cfg.hold + cfg.out;
  hudSet(el, cfg);

  if (el < cfg.cover) {
    const p = clamp01(el / cfg.cover);
    const e = easeOutQuart(p);
    const settle = p > 0.86 ? Math.sin(((p - 0.86) / 0.14) * Math.PI) * 0.014 : 0;
    // 起始留 12% 的边：纸是一张有边的实物，落定后才铺满视口
    const s = 0.88 + 0.12 * e;
    group.scale.setScalar(s);
    group.position.y = -viewH * 1.1 * (1 - e);
    group.position.z = -16 * (1 - e);
    group.rotation.x = 0.36 * (1 - e) - settle;
    group.rotation.y = 0.055 * (1 - e);
    group.rotation.z = 0.02 * (1 - e);
    // 行进中纸张是弯的，落定时才慢慢摊平
    const bow = 5.5 * (1 - e) + 0.7;
    const lift = 3.2 * (1 - e);
    for (let i = 0; i < plates.length; i++) {
      plates[i].position.y = plates[i].userData.base.y - viewH * 1.1 * (1 - e) * i * 0.012;
      bend(plates[i], bow * (1 - i * 0.12), lift * (1 - i * 0.2), 0);
    }
    // 扫光跟着纸面上缘一起走
    sweep.position.y = (viewH * 1.06) / 2 - viewH * 1.06 * e - viewH * 0.1;
    sweep.material.opacity = 0.55 * Math.min(1, p * 2.2) * Math.max(0, 1 - Math.max(0, p - 0.72) / 0.28);
    bar.material.opacity = 0.7 * Math.min(1, p * 3) * Math.max(0, 1 - p * 1.05);
    dust.material.opacity = 0.34 * Math.min(1, p * 2);
    dust.position.y = -viewH * 0.3 * (1 - e);
  } else if (el < cfg.cover + cfg.hold) {
    if (!cfg.committed) {
      cfg.committed = true;
      onCommit();
    }
    group.scale.setScalar(1);
    group.position.set(0, 0, 0);
    group.rotation.set(0, 0, 0);
    for (let i = 0; i < plates.length; i++) {
      plates[i].position.y = plates[i].userData.base.y;
      bend(plates[i], 0.7 * (1 - i * 0.12), 0, 0);
    }
    sweep.material.opacity = 0;
    bar.material.opacity = 0;
    dust.material.opacity = 0.34;
    dust.position.y = 0;
  } else if (el < cfg.cover + cfg.hold + cfg.out) {
    if (!cfg.committed) {
      cfg.committed = true;
      onCommit();
    }
    const p = clamp01((el - cfg.cover - cfg.hold) / cfg.out);
    const e = easeInCubic(p);
    group.position.y = viewH * 1.1 * e;
    group.position.z = -10 * e;
    group.rotation.x = -0.26 * e;
    group.rotation.y = -0.04 * e;
    group.rotation.z = -0.015 * e;
    // 抽走时下缘两角先卷起来，像被人捏住往上提
    const curl = 4.2 * Math.min(1, Math.pow(p, 0.7));
    const liftOut = 1.4 * Math.min(1, p * 1.6);
    for (let i = 0; i < plates.length; i++) {
      plates[i].position.y = plates[i].userData.base.y + viewH * 1.1 * e * (plates.length - 1 - i) * 0.012;
      bend(plates[i], 0.7 + 2.6 * e, liftOut * (1 - i * 0.25), curl * (1 - i * 0.2));
    }
    sweep.material.opacity = 0;
    bar.material.opacity = 0;
    dust.material.opacity = 0.34 * (1 - e);
    dust.position.y = viewH * 0.35 * e;
    // 纸被抽走后阴影不该压在已经露出的页面上
    shadow.material.opacity = 0.85 * Math.max(0, 1 - p * 3);
  } else {
    renderer.render(scene, camera);
    done();
    return;
  }

  renderer.render(scene, camera);
  rafId = window.requestAnimationFrame((t) => frame(t, cfg, onCommit, done));
}

function stop() {
  running = false;
  if (rafId) window.cancelAnimationFrame(rafId);
  rafId = 0;
  if (renderer) renderer.domElement.style.display = 'none';
  hudHide();
}

/* ---------- 对外 API ---------- */
function run(opts) {
  return new Promise((resolve) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      stop();
      resolve();
    };
    try {
      if (!build()) {
        opts.commit();
        done();
        return;
      }
      if (running) {
        opts.commit();
        done();
        return;
      }

      paintPaper(opts.label || 'ARCHIVE', opts.index || 1, opts.total || 6, window.innerWidth / window.innerHeight);
      resize();

      const spd = opts.speed || 1; // 调试用：放慢整段时间轴（默认 1）
      const cfg = {
        cover: (opts.full ? COVER_MS_FULL : COVER_MS) / spd,
        hold: HOLD_MS / spd,
        out: (opts.full ? OUT_MS_FULL : OUT_MS) / spd,
        committed: false,
        origin: null
      };

      renderer.domElement.style.display = 'block';
      group.position.set(0, -viewH * 1.08, -16);
      group.rotation.set(0.34, 0, 0.02);
      running = true;
      hudShow(opts.index || 1);

      const t0 = performance.now();
      rafId = window.requestAnimationFrame((t) => frame(t, cfg, opts.commit, done));

      window.setTimeout(() => {
        if (!settled) {
          if (!cfg.committed) {
            cfg.committed = true;
            try {
              opts.commit();
            } catch (e) {
              /* 忽略 */
            }
          }
          done();
        }
      }, cfg.cover + cfg.hold + cfg.out + 420);
      void t0;
    } catch (e) {
      lost = true;
      console.warn('[archive-stage] 舞台启动失败，退回 2D 转场：', e && e.message);
      try {
        opts.commit();
      } catch (err) {
        /* 忽略 */
      }
      done();
    }
  });
}

window.addEventListener('resize', () => {
  if (running) resize();
});

window.__archiveStage = {
  get supported() {
    return !lost;
  },
  run: run
};

/* 预热：页面空闲时先建好渲染器、画一遍纸纹理并渲染一帧，
   把着色器编译和首帧的开销挪到用户第一次点导航之前。 */
function warmup() {
  try {
    if (build()) {
      paintPaper('HOME', 1, 6, window.innerWidth / window.innerHeight);
      resize();
      renderer.render(scene, camera);
      renderer.domElement.style.display = 'none';
    }
  } catch (e) {
    /* 预热失败不影响后续，run 里有兜底 */
  }
}

if (document.readyState === 'complete') {
  window.setTimeout(warmup, 900);
} else {
  window.addEventListener('load', function () {
    window.setTimeout(warmup, 900);
  });
}
