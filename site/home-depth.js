/* 首页背景的多层视差驱动：把指针/滚轮换算成 --px / --py / --sc，
   交给 CSS 让远中近三层以不同幅度位移，形成缓慢的“镜头漂移” */
const bg = document.querySelector('.hm-bg');
const stack = document.getElementById('sky-stack');

if (bg) {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const p = { x: 0, y: 0, tx: 0, ty: 0 };
  let sc = 0;
  let tsc = 0;

  window.addEventListener('pointermove', (e) => {
    p.tx = (e.clientX / window.innerWidth - 0.5) * 2;
    p.ty = (e.clientY / window.innerHeight - 0.5) * 2;
  }, { passive: true });

  window.addEventListener('scroll', () => {
    tsc = Math.min(window.scrollY / 620, 1);
  }, { passive: true });

  function loop() {
    requestAnimationFrame(loop);
    if (document.body.getAttribute('data-view') !== 'home') return;
    if (document.visibilityState !== 'visible') return;
    const k = reduced ? 0.004 : 0.045;
    p.x += (p.tx - p.x) * k;
    p.y += (p.ty - p.y) * k;
    sc += (tsc - sc) * 0.05;
    bg.style.setProperty('--px', p.x.toFixed(3));
    bg.style.setProperty('--py', p.y.toFixed(3));
    bg.style.setProperty('--sc', sc.toFixed(3));
  }

  requestAnimationFrame(loop);

  const live = () => stack && stack.classList.add('is-live');
  if (document.readyState === 'complete') live();
  else window.addEventListener('load', live, { once: true });
}
