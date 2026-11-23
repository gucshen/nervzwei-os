// 首页 3D 背景：太空时代的铬球 + 环绕轨道 + 小卫星
// 独立模块，只负责 #view-home 里的 #hm-canvas；WebGL 不可用时保留 .hm-img 兜底
import * as THREE from './vendor/three.module.min.js';

const canvas = document.getElementById('hm-canvas');
const home = document.getElementById('view-home');
if (canvas && home) {
  try {
    build();
  } catch (err) {
    console.warn('[home-orbit] 3D 背景启动失败，保留静态图：', err);
    canvas.remove();
  }
}

function build() {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.26;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x08090b);

  const camera = new THREE.PerspectiveCamera(34, 1, 1, 400);
  camera.position.set(0, 0, 100);

  const tanHalf = Math.tan((34 / 2) * (Math.PI / 180));
  const viewW = { v: 2 };
  const viewH = { v: 2 };

  // —— 环境：程序化“影棚”，给铬面提供反射（不下载 HDRI）
  const env = new THREE.Scene();

  const sky = document.createElement('canvas');
  sky.width = 1024;
  sky.height = 512;
  const skyCtx = sky.getContext('2d');
  const grad = skyCtx.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, '#e6edf8');
  grad.addColorStop(0.18, '#a3b2c6');
  grad.addColorStop(0.26, '#8fa0b4');
  grad.addColorStop(0.40, '#0e1114');
  grad.addColorStop(0.55, '#16181d');
  grad.addColorStop(0.78, '#4a2712');
  grad.addColorStop(0.9, '#a55c2a');
  grad.addColorStop(1, '#e0a066');
  skyCtx.fillStyle = grad;
  skyCtx.fillRect(0, 0, 1024, 512);

  const skyBand = skyCtx.createLinearGradient(0, 0, 0, 70);
  skyBand.addColorStop(0, 'rgba(255,255,255,0.9)');
  skyBand.addColorStop(1, 'rgba(255,255,255,0)');
  skyCtx.fillStyle = skyBand;
  skyCtx.fillRect(0, 0, 1024, 70);

  const skyTex = new THREE.CanvasTexture(sky);
  skyTex.mapping = THREE.EquirectangularReflectionMapping;
  skyTex.colorSpace = THREE.SRGBColorSpace;
  env.background = skyTex;

  const panel = (color, w, h, pos, rotY, intensity) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide })
    );
    m.position.set(pos[0], pos[1], pos[2]);
    m.rotation.y = rotY;
    m.material.color.multiplyScalar(intensity);
    env.add(m);
    return m;
  };
  // 主光：右上一条细而长的柔光板，在球面上走成一道硬高光
  panel(0xffffff, 1.15, 24, [28, 9, 10], -0.85, 6.4);
  // 相机后方的大片暗光，避免正脸全黑
  panel(0x2b323b, 26, 22, [0, 0, 44], 0, 1.0);
  // 顶部柔白，压出球顶亮区
  panel(0xf7f9ff, 30, 10, [0, 27, -2], 0, 2.2);
  // 一颗小小的“太阳”，在本体上打出一个硬高光点
  panel(0xffffff, 3.4, 3.4, [-15, 13, -9], 0.3, 6);

  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const envMap = pmrem.fromScene(env, 0.03).texture;
  pmrem.dispose();

  // —— 铬球
  const chromeMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    metalness: 1,
    roughness: 0.02,
    envMap,
    envMapIntensity: 1.35,
    clearcoat: 0.35,
    clearcoatRoughness: 0.08
  });

  const blob = new THREE.Group();
  scene.add(blob);

  const sphere = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 96), chromeMat);
  blob.add(sphere);

  // 球面经纬线
  const graticule = new THREE.Mesh(
    new THREE.SphereGeometry(1.003, 36, 18),
    new THREE.MeshBasicMaterial({
      color: 0xe8dcc4,
      wireframe: true,
      transparent: true,
      opacity: 0.055,
      depthWrite: false
    })
  );
  sphere.add(graticule);

  // 边缘光：菲涅尔外圈，给球体描一道暖色轮廓光（太空时代海报里那种“勾边”）
  const rim = new THREE.Mesh(
    new THREE.SphereGeometry(1.014, 64, 48),
    new THREE.ShaderMaterial({
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      uniforms: {
        uColor: { value: new THREE.Color(0xffb279) },
        uPower: { value: 2.4 },
        uInt: { value: 0.85 }
      },
      vertexShader: [
        'varying vec3 vN; varying vec3 vP;',
        'void main() {',
        '  vN = normalize(normalMatrix * normal);',
        '  vec4 p = modelViewMatrix * vec4(position, 1.0);',
        '  vP = -p.xyz;',
        '  gl_Position = projectionMatrix * p;',
        '}'
      ].join('\n'),
      fragmentShader: [
        'varying vec3 vN; varying vec3 vP;',
        'uniform vec3 uColor; uniform float uPower; uniform float uInt;',
        'void main() {',
        '  float f = pow(1.0 - clamp(dot(normalize(vN), normalize(vP)), 0.0, 1.0), uPower);',
        '  gl_FragColor = vec4(uColor * f * uInt, f * 0.9);',
        '}'
      ].join('\n')
    })
  );
  sphere.add(rim);

  // —— 轨道组：倾斜的环平面
  const orbit = new THREE.Group();
  orbit.rotation.set(1.16, 0.06, -0.2);
  blob.add(orbit);

  // 主环：亮一点的金属线，从球前穿过，是画面的“骨架”
  const metalRing = new THREE.Mesh(
    new THREE.TorusGeometry(1.26, 0.008, 8, 256),
    new THREE.MeshBasicMaterial({
      color: 0xf0dfc2,
      transparent: true,
      opacity: 0.46,
      depthWrite: false
    })
  );
  orbit.add(metalRing);

  // 点状轨道：一圈等距小点，呼应终端读数与未许之地里那种虚线轨道
  const dotCount = 96;
  const dotPos = new Float32Array(dotCount * 3);
  for (let i = 0; i < dotCount; i++) {
    const a = (i / dotCount) * Math.PI * 2;
    dotPos[i * 3] = Math.cos(a) * 1.6;
    dotPos[i * 3 + 1] = 0;
    dotPos[i * 3 + 2] = Math.sin(a) * 1.6;
  }
  const dotGeo = new THREE.BufferGeometry();
  dotGeo.setAttribute('position', new THREE.BufferAttribute(dotPos, 3));
  const dotMat = new THREE.PointsMaterial({
    color: 0xffeccc,
    size: 0.15,
    transparent: true,
    opacity: 0.6,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true
  });
  orbit.add(new THREE.Points(dotGeo, dotMat));

  // 两圈更淡的线环
  [
    { r: 1.52, o: 0.26, c: 0xd9813f },
    { r: 1.86, o: 0.14, c: 0xe8dcc4 }
  ].forEach((spec) => {
    const m = new THREE.MeshBasicMaterial({
      color: spec.c,
      transparent: true,
      opacity: spec.o,
      depthWrite: false
    });
    orbit.add(new THREE.Mesh(new THREE.TorusGeometry(spec.r, 0.004, 6, 256), m));
  });

  // —— 小卫星（Sputnik 式：小球 + 四根细天线），沿环匀速绕行
  const satellite = new THREE.Group();
  satellite.position.set(1.52, 0, 0);
  orbit.add(satellite);

  const satBody = new THREE.Mesh(
    new THREE.SphereGeometry(0.042, 24, 16),
    new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      metalness: 1,
      roughness: 0.2,
      envMap,
      envMapIntensity: 1.3
    })
  );
  satellite.add(satBody);

  const antennaMat = new THREE.MeshBasicMaterial({ color: 0xcfc3ab, transparent: true, opacity: 0.6 });
  for (let i = 0; i < 4; i++) {
    const a = new THREE.Mesh(new THREE.CylinderGeometry(0.0022, 0.0022, 0.1, 5), antennaMat);
    const angle = (i / 4) * Math.PI * 2;
    a.position.set(Math.cos(angle) * 0.05, 0.035, Math.sin(angle) * 0.05);
    a.rotation.z = -Math.cos(angle) * 0.5;
    a.rotation.x = Math.sin(angle) * 0.5;
    satellite.add(a);
  }

  const satGlow = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: radialTexture('rgba(255,214,160,', 0.6),
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    })
  );
  satGlow.scale.set(0.22, 0.22, 1);
  satellite.add(satGlow);

  // —— 环平面上的尘埃
  const dustCount = 520;
  const dustPos = new Float32Array(dustCount * 3);
  for (let i = 0; i < dustCount; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = 1.22 + Math.random() * 0.72;
    const y = (Math.random() - 0.5) * 0.04;
    dustPos[i * 3] = Math.cos(a) * r;
    dustPos[i * 3 + 1] = y;
    dustPos[i * 3 + 2] = Math.sin(a) * r;
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  const dustMat = new THREE.PointsMaterial({
    color: 0xe6d8bd,
    size: 0.02,
    transparent: true,
    opacity: 0.6,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true
  });
  orbit.add(new THREE.Points(dustGeo, dustMat));

  // —— 球后暖色辉光
  const glow = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: radialTexture('rgba(217,129,63,', 0.55),
      transparent: true,
      opacity: 0.42,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    })
  );
  scene.add(glow);

  // —— 原子轨道：三条倾斜的椭圆细线，原子时代那种“交叉轨道”
  const atom = new THREE.Group();
  blob.add(atom);
  const atomMat = new THREE.LineBasicMaterial({
    color: 0xd8ccb4,
    transparent: true,
    opacity: 0.15,
    depthWrite: false
  });
  for (let i = 0; i < 3; i++) {
    const pts = [];
    const R = 1.66;
    for (let s = 0; s <= 128; s++) {
      const a2 = (s / 128) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(a2) * R, 0, Math.sin(a2) * R));
    }
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), atomMat);
    line.rotation.z = (i / 3) * Math.PI;
    line.rotation.x = (i / 3) * Math.PI * 0.5 - 0.4;
    atom.add(line);
  }

  // —— 远处放射线，呼应站点原有的细线网格
  const wireGroup = new THREE.Group();
  wireGroup.position.z = -34;
  scene.add(wireGroup);
  const wireMat = new THREE.LineBasicMaterial({
    color: 0x8c8578,
    transparent: true,
    opacity: 0.055,
    depthWrite: false
  });
  for (let i = 0; i < 22; i++) {
    const a = (i / 22) * Math.PI * 2 + 0.12;
    const len = 46 + Math.random() * 18;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute(
      'position',
      new THREE.BufferAttribute(
        new Float32Array([Math.cos(a) * 1.2, Math.sin(a) * 1.2, 0, Math.cos(a) * len, Math.sin(a) * len, 0]),
        3
      )
    );
    wireGroup.add(new THREE.Line(geo, wireMat));
  }

  function radialTexture(rgbPrefix, innerAlpha) {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    g.addColorStop(0, rgbPrefix + innerAlpha + ')');
    g.addColorStop(0.42, rgbPrefix + innerAlpha * 0.42 + ')');
    g.addColorStop(1, rgbPrefix + '0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  // —— 尺寸：球占到视口高度的 3/4，环跨出画面
  function resize() {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    viewH.v = 2 * camera.position.z * tanHalf;
    viewW.v = viewH.v * (w / h);

    const R = viewH.v * 0.302;
    blob.scale.setScalar(R);
    blob.position.set(viewW.v * 0.13, viewH.v * 0.042, 0);

    glow.scale.set(R * 2.6, R * 2.6, 1);
    glow.position.set(blob.position.x, blob.position.y - R * 0.35, -R * 0.9);

    wireGroup.scale.setScalar(viewH.v * 0.42);
    dustMat.size = R * 0.0065;
    satGlow.scale.set(R * 0.34, R * 0.34, 1);
  }

  // 首页不在前台就停画
  function active() {
    return document.body.getAttribute('data-view') === 'home' && document.visibilityState === 'visible';
  }

  let t = 0;
  let last = 0;

  function tick(now) {
    requestAnimationFrame(tick);
    if (!active()) {
      last = now;
      return;
    }
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    t += dt;

    sphere.rotation.y = t * 0.028;
    sphere.rotation.x = 0.05;
    orbit.rotation.z = -0.2 + Math.sin(t * 0.14) * 0.01;
    satellite.position.set(
      Math.cos(t * 0.16) * 1.52,
      0,
      Math.sin(t * 0.16) * 1.52
    );
    satellite.rotation.y = -t * 0.16;
    atom.rotation.y = t * 0.01;
    dustMat.opacity = 0.4 + Math.sin(t * 0.9) * 0.07;
    glow.material.opacity = 0.38 + Math.sin(t * 0.5) * 0.05;

    renderer.render(scene, camera);
  }

  resize();
  window.addEventListener('resize', resize);
  new ResizeObserver(resize).observe(canvas);

  renderer.render(scene, camera);
  requestAnimationFrame(() => canvas.classList.add('is-live'));

  if (!reduced) {
    last = performance.now();
    requestAnimationFrame(tick);
  }

  const img = document.querySelector('.hm-img');
  if (img) img.style.opacity = '0';

  window.__homeOrbit = { scene, renderer, resize, get paused() { return !active(); } };
}
