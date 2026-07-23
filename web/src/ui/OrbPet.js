// 灵球桌宠 OrbPet：动画精灵(脉动序列) + 拖拽回弹 + 看向鼠标 + 心情陪伴 + 甩飞弹球 + 亲密度彩蛋。
// 灵球本体＝WebP 精灵图(每情绪 N 帧)：idle 静息 duangduang 脉动，按情绪切 excited/nervous/confirm/deny/speak。
// 手势：轻点=逗它(随机播个情绪动画+冒泡+亲密度↑)；拖动=抓住(慢放手→弹簧回弹·快甩→弹球绕屏反弹+光尾·飞行中点=接住)；
//   右键/双击=对话(取消长按——按住本就是拖拽前提)。紧张剧情(isTense)收敛：不打盹/不闲话/不主动乱飞。
// 单 rAF 同时驱动 .agent-orb 的 transform 与精灵帧；子精灵的 CSS float 叠加其上、互不冲突。
import { AGENTS } from '../data/agents.js';
const rand = (a) => a[Math.floor(Math.random() * a.length)];
// 逗它/陪伴小台词按人格分三套，存在 agents.js 的 quips（poke/warm/pet/bored/sleepy/cheer）——雀舌活泼·乌有刻薄·枢衡惜字
const POKE_MOODS = ['confirm', 'excited', 'deny'];   // 逗它时随机播的情绪动画（人格无关）

export function mountOrbPet(orb, deps) {
  const noop = { setBusy() {}, setMood() {}, idle() {}, destroy() {} };
  if (!orb) return noop;
  const { img, audio, state, save, bus, sheetUrl, frames, bubble, openChat, isTense } = deps;
  const Q = (AGENTS[state.persona] && AGENTS[state.persona].quips) || AGENTS.queshe.quips;   // 当前人格的逗它/陪伴台词（雀舌/乌有/枢衡 三套不同）
  const N = frames || 23;
  const now = () => performance.now();
  const W = () => window.innerWidth, H = () => window.innerHeight;
  const glow = (getComputedStyle(orb).getPropertyValue('--g') || '#ffd27a').trim();

  let mode = 'idle';                                  // idle | drag | fling | spring
  const pos = { x: 0, y: 0 }, vel = { x: 0, y: 0 }, cursor = { x: W() / 2, y: H() / 2 };
  let pokeImp = 0, spin = 0, busy = false, parked = false, lastInteract = now(), lastQuip = 0;
  let home = { cx: 0, cy: 0 }, half = 38, trailN = 0;
  let curMood = '', frame = 0, frameMs = 0, moodRevert = 0;     // 精灵帧
  const FRAME_INT = 1000 / 14;                                  // ~14fps

  state.flags = state.flags || {};
  const aff = () => state.flags.orbAffinity || 0;
  const addAff = (n) => { state.flags.orbAffinity = Math.min(9999, aff() + n); if (save && save.autosave) save.autosave(); };
  const tense = () => !!(isTense && isTense());

  // ---- 精灵情绪：切换精灵图 + 逐帧由主循环推进 ----
  if (img && sheetUrl) { img.style.backgroundRepeat = 'no-repeat'; img.style.backgroundSize = (N * 100) + '% 100%'; }
  function setMood(mood, hold) {
    if (mood !== curMood) {
      curMood = mood;
      if (img && sheetUrl) {
        const url = sheetUrl(mood);
        // 先解码新精灵图，解码完成后再换 background-image；在此之前保留旧图继续播。
        // 否则换图那一帧浏览器会先清旧图、新图尚未解码贴上＝球先消失再出现（即使已缓存，解码也在"用时"才发生）。
        const pre = new Image(); pre.src = url;
        const apply = () => { if (curMood === mood && img) { frame = 0; frameMs = 0; img.style.backgroundImage = `url('${url}')`; img.style.backgroundPositionX = '0%'; } };
        if (pre.decode) pre.decode().then(apply, apply); else apply();
      } else { frame = 0; frameMs = 0; }
    }
    moodRevert = hold ? 0 : now() + 2400;             // 非 hold 的情绪播 ~2.4s 后回 idle
  }
  const idle = () => setMood('idle', true);

  // ---- 逗它 / 抚摸 / 欢呼 ----
  function poke() {
    lastInteract = now(); addAff(1); pokeImp = 0.18;
    if (audio && audio.play) audio.play('ui_cursor', { volume: 0.3 });
    if (aff() >= 14 && Math.random() < 0.32) { spin = 360; setMood('excited', false); if (bubble) bubble('❤'); }   // 高亲密度彩蛋
    else { setMood(rand(POKE_MOODS), false); if (bubble) bubble(rand(aff() >= 6 ? Q.warm : Q.poke)); }
  }
  function pet() { lastInteract = now(); addAff(1); setMood('confirm', false); if (bubble) bubble(rand(Q.pet)); if (audio && audio.play) audio.play('ui_cursor', { volume: 0.25 }); }
  function cheer() { if (busy) return; lastInteract = now(); setMood('excited', false); if (!tense() && bubble) bubble(rand(Q.cheer)); }

  // ---- 指针手势：拖动=玩；轻点=逗它；双击/右键=对话 ----
  let dragging = false, start = null, samples = [], lastTap = 0;
  const onDown = (e) => {
    if (e.button === 2) return;
    if (mode === 'fling') { mode = 'spring'; if (bubble) bubble('抓到啦~'); addAff(1); lastInteract = now(); return; }
    dragging = false; start = { x: e.clientX, y: e.clientY, px: pos.x, py: pos.y };
    samples = [{ x: e.clientX, y: e.clientY, t: now() }];
    window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp);
  };
  const onMove = (e) => {
    cursor.x = e.clientX; cursor.y = e.clientY; if (!start) return;
    const dx = e.clientX - start.x, dy = e.clientY - start.y;
    if (!dragging && Math.hypot(dx, dy) > 7) { dragging = true; mode = 'drag'; }
    if (dragging) { pos.x = start.px + dx; pos.y = start.py + dy; samples.push({ x: e.clientX, y: e.clientY, t: now() }); if (samples.length > 6) samples.shift(); }
  };
  const onUp = () => {
    window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp);
    if (dragging) {
      vel.x = 0; vel.y = 0; const tn = now(), recent = samples.filter((s) => tn - s.t < 90);
      if (recent.length >= 2) { const a = recent[0], b = recent[recent.length - 1], dt = b.t - a.t; if (dt > 0) { vel.x = (b.x - a.x) / dt; vel.y = (b.y - a.y) / dt; } }
      if (Math.hypot(vel.x, vel.y) > 0.35) mode = 'fling'; else { mode = 'spring'; pet(); }   // 玩家主动甩=随时生效(进副本即可玩)；自主乱飞/闲话仍受 tense 收敛
      dragging = false;
    } else { const tn = now(); if (tn - lastTap < 300) { lastTap = 0; if (openChat) openChat(); } else { lastTap = tn; poke(); } }
    start = null;
  };
  const onCtx = (e) => { e.preventDefault(); if (openChat) openChat(); };
  const onDocMove = (e) => { cursor.x = e.clientX; cursor.y = e.clientY; };
  function measure() { const r = orb.getBoundingClientRect(); home = { cx: r.left + r.width / 2 - pos.x, cy: r.top + r.height / 2 - pos.y }; half = r.width / 2; }
  orb.addEventListener('pointerdown', onDown); orb.addEventListener('contextmenu', onCtx);
  window.addEventListener('pointermove', onDocMove); window.addEventListener('resize', measure);

  // ---- 心情 / 闲置（每 1.5s）----
  const moodIv = setInterval(() => {
    if (busy) return;
    if (state.sanity < 20) { setMood('nervous', true); orb.classList.add('pet-scared'); orb.classList.remove('pet-sleepy'); return; }
    orb.classList.remove('pet-scared');
    if (curMood === 'nervous') idle();                          // 清醒值恢复 → 回 idle
    if (tense()) { orb.classList.remove('pet-sleepy'); return; }
    if (mode !== 'idle') return;
    const idleT = now() - lastInteract;
    if (idleT > 42000) { orb.classList.add('pet-sleepy'); if (now() - lastQuip > 6000 && Math.random() < 0.5) { if (bubble) bubble(rand(Q.sleepy)); lastQuip = now(); } }
    else { orb.classList.remove('pet-sleepy'); if (idleT > 16000 && now() - lastQuip > 9000 && Math.random() < 0.35) { if (bubble) bubble(rand(Q.bored)); lastQuip = now(); } }
  }, 1500);
  const offPts = (bus && bus.on) ? bus.on('pointsChanged', (p) => { if (p && p.delta > 0) cheer(); }) : null;

  // ---- 光尾层 ----
  let trail = document.querySelector('.orb-trail-layer');
  if (!trail) { trail = document.createElement('div'); trail.className = 'orb-trail-layer'; document.body.appendChild(trail); }
  const spawnTrail = () => { const d = document.createElement('div'); d.className = 'orb-trail-dot'; d.style.left = (home.cx + pos.x) + 'px'; d.style.top = (home.cy + pos.y) + 'px'; d.style.background = `radial-gradient(circle,${glow},transparent 70%)`; trail.appendChild(d); setTimeout(() => d.remove(), 520); };

  // ---- 主循环：transform + 精灵帧 ----
  measure(); idle();
  let lastT = now();
  const tick = (t) => {
    const dms = t - lastT; lastT = t; const dt = Math.min(dms / 16.7, 3);
    frameMs += dms; if (frameMs >= FRAME_INT) { frameMs %= FRAME_INT; frame = (frame + 1) % N; if (img) img.style.backgroundPositionX = (N > 1 ? (frame / (N - 1) * 100) : 0) + '%'; }
    if (moodRevert && now() > moodRevert) { moodRevert = 0; idle(); }
    pokeImp *= 0.86; if (pokeImp < 0.002) pokeImp = 0;
    if (spin > 0) spin = Math.max(0, spin - 8 * dt);
    // 聊天中：钉在 CSS 锚点(左下)，由 .orb-chatting 的 bottom 关键帧上下跳；不漂移、不被拖走、不挡对话框
    if (parked) { pos.x = 0; pos.y = 0; orb.style.transform = 'translate(0px,0px) scale(1)'; raf = requestAnimationFrame(tick); return; }
    if (mode === 'fling') {
      pos.x += vel.x * 16.7 * dt; pos.y += vel.y * 16.7 * dt;
      const bx0 = half - home.cx, bx1 = W() - half - home.cx, by0 = half - home.cy, by1 = H() - half - home.cy;
      if (pos.x < bx0) { pos.x = bx0; vel.x = Math.abs(vel.x) * 0.72; } else if (pos.x > bx1) { pos.x = bx1; vel.x = -Math.abs(vel.x) * 0.72; }
      if (pos.y < by0) { pos.y = by0; vel.y = Math.abs(vel.y) * 0.72; } else if (pos.y > by1) { pos.y = by1; vel.y = -Math.abs(vel.y) * 0.72; }
      vel.x *= 0.985; vel.y *= 0.985; if ((++trailN) % 2 === 0) spawnTrail();
      if (Math.hypot(vel.x, vel.y) < 0.06) mode = 'spring';
    } else if (mode === 'spring') {
      pos.x += (0 - pos.x) * 0.18 * dt; pos.y += (0 - pos.y) * 0.18 * dt;
      if (Math.abs(pos.x) < 0.6 && Math.abs(pos.y) < 0.6) { pos.x = 0; pos.y = 0; mode = 'idle'; }
    } else if (mode === 'idle') {
      const dx = cursor.x - home.cx, dy = cursor.y - home.cy, d = Math.hypot(dx, dy) || 1, m = Math.min(16, d * 0.07);   // 看向鼠标幅度（封顶 16px·偏移更明显）
      pos.x += (dx / d * m - pos.x) * 0.06 * dt; pos.y += (dy / d * m - pos.y) * 0.06 * dt;
    }
    const sc = (mode === 'drag' ? 1.08 : 1) + pokeImp;
    orb.style.transform = `translate(${pos.x.toFixed(1)}px,${pos.y.toFixed(1)}px) scale(${sc.toFixed(3)})` + (spin > 0 ? ` rotate(${(360 - spin).toFixed(0)}deg)` : '');
    raf = requestAnimationFrame(tick);
  };
  let raf = requestAnimationFrame(tick);

  return {
    setBusy(b) { busy = !!b; if (b) orb.classList.remove('pet-sleepy', 'pet-scared'); },
    park(on) { parked = !!on; if (on) { pos.x = 0; pos.y = 0; mode = 'idle'; } },   // 聊天时把灵球钉在左下原地(配 .orb-chatting 上下跳)，停掉漂移/拖拽位移
    setMood, idle,
    destroy() {
      cancelAnimationFrame(raf); clearInterval(moodIv);
      orb.removeEventListener('pointerdown', onDown); orb.removeEventListener('contextmenu', onCtx);
      window.removeEventListener('pointermove', onDocMove); window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); window.removeEventListener('resize', measure);
      if (offPts) offPts(); orb.style.transform = ''; orb.classList.remove('pet-sleepy', 'pet-scared');
    },
  };
}
