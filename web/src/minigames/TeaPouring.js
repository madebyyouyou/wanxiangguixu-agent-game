// 倒茶玩法 —— 移植自《渡厄镇_倒茶玩法_demo_v3》，数值与设计文档一致。
// 鼠标控壶嘴 + WSAD 控杯；双光标进白圈→金环填充2s→满后0.35s内点击=完美；
// 30秒内倒完3杯过关（白圈逐局缩小 80/69/58）；2+杯完美给积分。
// play(host, ctx) -> Promise<{perfectCount}>（胜利后 resolve；失败可重来）。
export function play(host, ctx) {
  const { audio } = ctx;
  return new Promise((resolve) => {
    const CONFIG = {
      W: 700, H: 500, hud: 50,
      targetRadius: 80, targetRadiusShrink: 11, targetMinRadius: 30, targetSpeed: 110,
      driftStrength: 1.2, suddenMin: 1.0, suddenMax: 2.0, suddenAngle: 1.5, suddenMinAngle: 1.0,
      cupSpeed: 320, fillDuration: 2.0, perfectWindow: 0.35, perfectsNeeded: 2,
      totalRounds: 3, totalTimeLimit: 30, normalizeDiagonal: true,
    };
    const S = {
      mouseX: 350, mouseY: 250, cupX: 200, cupY: 300,
      targetX: 350, targetY: 250, targetVx: 1, targetVy: 0.5, curR: 80, nextSudden: 1.5,
      progress: 0, ready: false, readyTimer: 0,
      keys: { W: false, A: false, S: false, D: false },
      playing: false, round: 0, over: false, elapsed: 0, perfectCount: 0, results: [],
    };

    host.className = 'minigame-host tea';
    host.innerHTML = `
      <div class="tea-box" id="teaBox">
        <div class="tea-hud">
          <div class="tea-score">已完成 <span class="num" id="teaScore">0</span> / 3 杯 <span id="teaDots" class="tea-dots"></span></div>
          <div class="tea-timer" id="teaTimer">⏱ <span id="teaTimerNum">30.0</span>s</div>
          <div class="tea-round">第 <span id="teaRound">1</span> 局</div>
        </div>
        <svg id="teaRing" class="tea-ring" width="176" height="176" viewBox="0 0 176 176">
          <circle id="teaArc" cx="88" cy="88" r="80" fill="none" stroke="#ffd070" stroke-width="3"
            stroke-dasharray="502" stroke-dashoffset="502" transform="rotate(-90 88 88)" stroke-linecap="round"/>
        </svg>
        <div class="tea-target" id="teaTarget"></div>
        <div class="tea-cursor pourer" id="teaPourer"><img src="assets/images/ui/minigame/teapot.png" onerror="this.replaceWith(document.createTextNode('🫖'))"></div>
        <div class="tea-cursor cup" id="teaCup"><img src="assets/images/ui/minigame/cup.png" onerror="this.replaceWith(document.createTextNode('🍵'))"></div>
        <div class="tea-hint" id="teaHint">将茶壶嘴与茶杯都对准白圈</div>
        <div class="tea-intro" id="teaIntro">
          <div class="ti-title">斟 茶</div>
          <div class="ti-sub">忍着恶心，把这三杯虫茶稳稳倒好</div>
          <div class="ti-rules">
            <div class="ti-row"><span class="ti-key">鼠标</span><span class="ti-d">控制茶壶嘴 🫖</span></div>
            <div class="ti-row"><span class="ti-key">W A S D</span><span class="ti-d">控制茶杯 🍵</span></div>
            <div class="ti-row"><span class="ti-ic">◎</span><span class="ti-d">壶嘴与杯<b>同时</b>进白圈 → 进度增长，任一离开即归零</span></div>
            <div class="ti-row"><span class="ti-ic">✦</span><span class="ti-d">进度满后点左键：<b class="ti-pf">立刻点 = 完美</b>，慢了 = 合格</span></div>
            <div class="ti-row"><span class="ti-ic">⏱</span><span class="ti-d">30 秒内倒完 3 杯过关</span></div>
          </div>
          <button class="tea-btn" id="teaStart">开 始</button>
        </div>
        <div class="tea-modal" id="teaWin"><div class="tea-modal-in">
          <div class="t">茶，倒好了</div><div class="d">虫茶平稳落桌<br><span id="teaPerfect"></span></div>
          <button class="tea-btn" id="teaNext">进入下一段</button></div></div>
        <div class="tea-modal" id="teaLose"><div class="tea-modal-in">
          <div class="t">手抖了</div><div class="d">茶水没能送到杯中——时间用尽</div>
          <button class="tea-btn" id="teaRetry">重新开始</button></div></div>
      </div>`;

    const $ = (id) => host.querySelector('#' + id);
    const box = $('teaBox'), target = $('teaTarget'), pourer = $('teaPourer'), cup = $('teaCup');
    const arc = $('teaArc'), ring = $('teaRing'), hint = $('teaHint');
    // 700×500 固定逻辑坐标系，按视口等比缩放（鼠标映射用 getBoundingClientRect 自动适配）
    const fit = () => { box.style.transform = `scale(${Math.min(1.3, (window.innerWidth - 30) / CONFIG.W, (window.innerHeight - 30) / CONFIG.H)})`; };
    fit(); window.addEventListener('resize', fit);

    // 输入
    box.addEventListener('mousemove', (e) => { const r = box.getBoundingClientRect(); S.mouseX = (e.clientX - r.left) * (CONFIG.W / r.width); S.mouseY = (e.clientY - r.top) * (CONFIG.H / r.height); });
    box.addEventListener('click', () => { if (S.playing && S.ready) onPour(); });
    const kd = (e) => { const k = e.key.toUpperCase(); if ('WASD'.includes(k) && k.length === 1) { e.preventDefault(); S.keys[k] = true; } };
    const ku = (e) => { const k = e.key.toUpperCase(); if ('WASD'.includes(k) && k.length === 1) S.keys[k] = false; };
    window.addEventListener('keydown', kd); window.addEventListener('keyup', ku);
    $('teaStart').addEventListener('click', () => { $('teaIntro').style.display = 'none'; S.playing = true; S.round = 1; updRound(); startRound(); });
    $('teaNext').addEventListener('click', () => { cleanup(); resolve({ perfectCount: S.perfectCount }); });
    $('teaRetry').addEventListener('click', restart);

    function rotV(a) { const c = Math.cos(a), s = Math.sin(a), vx = S.targetVx, vy = S.targetVy; S.targetVx = vx * c - vy * s; S.targetVy = vx * s + vy * c; const l = Math.hypot(S.targetVx, S.targetVy) || 1; S.targetVx /= l; S.targetVy /= l; }
    function updTarget(dt) {
      rotV((Math.random() - 0.5) * 2 * CONFIG.driftStrength * dt);
      S.nextSudden -= dt;
      if (S.nextSudden <= 0) { const sign = Math.random() < 0.5 ? -1 : 1; const mag = CONFIG.suddenMinAngle + Math.random() * (CONFIG.suddenAngle - CONFIG.suddenMinAngle); rotV(sign * mag); S.nextSudden = CONFIG.suddenMin + Math.random() * (CONFIG.suddenMax - CONFIG.suddenMin); }
      S.targetX += S.targetVx * CONFIG.targetSpeed * dt; S.targetY += S.targetVy * CONFIG.targetSpeed * dt;
      const r = S.curR, minX = r, maxX = CONFIG.W - r, minY = CONFIG.hud + r, maxY = CONFIG.H - r;
      if (S.targetX < minX) { S.targetX = minX; S.targetVx = Math.abs(S.targetVx); }
      if (S.targetX > maxX) { S.targetX = maxX; S.targetVx = -Math.abs(S.targetVx); }
      if (S.targetY < minY) { S.targetY = minY; S.targetVy = Math.abs(S.targetVy); }
      if (S.targetY > maxY) { S.targetY = maxY; S.targetVy = -Math.abs(S.targetVy); }
      target.style.left = S.targetX + 'px'; target.style.top = S.targetY + 'px'; target.style.width = (r * 2) + 'px'; target.style.height = (r * 2) + 'px';
      ring.style.left = S.targetX + 'px'; ring.style.top = S.targetY + 'px';
      const rr = r + 8; ring.setAttribute('width', rr * 2); ring.setAttribute('height', rr * 2); ring.setAttribute('viewBox', `0 0 ${rr * 2} ${rr * 2}`);
      arc.setAttribute('cx', rr); arc.setAttribute('cy', rr); arc.setAttribute('r', rr - 4); arc.setAttribute('transform', `rotate(-90 ${rr} ${rr})`);
      const circ = 2 * Math.PI * (rr - 4); arc.setAttribute('stroke-dasharray', circ); arc.setAttribute('stroke-dashoffset', circ * (1 - S.progress));
    }
    function updCup(dt) {
      let dx = 0, dy = 0; if (S.keys.W) dy -= 1; if (S.keys.S) dy += 1; if (S.keys.A) dx -= 1; if (S.keys.D) dx += 1;
      if (dx || dy) { if (CONFIG.normalizeDiagonal && dx && dy) { const inv = 1 / Math.sqrt(2); dx *= inv; dy *= inv; } S.cupX = Math.max(20, Math.min(CONFIG.W - 20, S.cupX + dx * CONFIG.cupSpeed * dt)); S.cupY = Math.max(CONFIG.hud + 20, Math.min(CONFIG.H - 20, S.cupY + dy * CONFIG.cupSpeed * dt)); }
      cup.style.left = S.cupX + 'px'; cup.style.top = S.cupY + 'px';
    }
    function bothInside() { const r = S.curR; if ((S.mouseX - S.targetX) ** 2 + (S.mouseY - S.targetY) ** 2 > r * r) return false; if ((S.cupX - S.targetX) ** 2 + (S.cupY - S.targetY) ** 2 > r * r) return false; return true; }
    let wasInside = false;
    function updProgress(dt) {
      const inside = bothInside();
      if (inside) { if (!wasInside) audio?.play('ui_cursor', { volume: 0.3 }); S.progress = Math.min(1, S.progress + dt / CONFIG.fillDuration); target.classList.add('in'); pourer.classList.add('in'); cup.classList.add('in'); }
      else { if (S.progress > 0 && !S.ready) S.progress = 0; target.classList.remove('in'); pourer.classList.remove('in'); cup.classList.remove('in'); }
      wasInside = inside;
      if (S.progress >= 1 && !S.ready) { S.ready = true; S.readyTimer = 0; }
      if (S.ready) { S.readyTimer += dt; hint.textContent = S.readyTimer <= CONFIG.perfectWindow ? '✦ 立刻点击左键 = 完美 ✦' : '点击左键完成（合格）'; hint.classList.toggle('ready', S.readyTimer <= CONFIG.perfectWindow); arc.setAttribute('stroke', S.readyTimer <= CONFIG.perfectWindow ? '#80ff80' : '#c0c0c0'); }
      else { hint.textContent = inside ? '保持稳定…' : '将茶壶嘴与茶杯都对准白圈'; hint.classList.remove('ready'); arc.setAttribute('stroke', '#ffd070'); }
    }
    function onPour() {
      const perfect = S.readyTimer <= CONFIG.perfectWindow; S.results.push(perfect ? 'perfect' : 'normal'); if (perfect) S.perfectCount++;
      floatText(S.targetX, S.targetY, perfect); audio?.play('tea_done', { volume: 0.6 });
      S.ready = false; S.readyTimer = 0; target.classList.add('flash'); setTimeout(() => target.classList.remove('flash'), 600);
      $('teaScore').textContent = S.round; updDots();
      if (S.round >= CONFIG.totalRounds) win(); else { S.round++; updRound(); startRound(); }
    }
    function floatText(x, y, perfect) { const f = document.createElement('div'); f.className = 'tea-float ' + (perfect ? 'perfect' : 'normal'); f.textContent = perfect ? '完美！' : '合格'; f.style.left = x + 'px'; f.style.top = y + 'px'; box.appendChild(f); setTimeout(() => f.remove(), 1200); }
    function updDots() { const d = $('teaDots'); d.innerHTML = ''; for (let i = 0; i < CONFIG.totalRounds; i++) { const done = i < S.results.length; const img = document.createElement('img'); img.className = 'tea-dot-ic' + (done ? ' done' : ''); img.src = `assets/images/ui/minigame/tea_${done ? 'light' : 'dark'}.png`; img.alt = done ? '已完成' : '未完成'; d.appendChild(img); } }
    function startRound() { S.progress = 0; S.curR = Math.max(CONFIG.targetMinRadius, CONFIG.targetRadius - (S.round - 1) * CONFIG.targetRadiusShrink); const r = S.curR; S.targetX = r + 50 + Math.random() * (CONFIG.W - 2 * r - 100); S.targetY = CONFIG.hud + r + 30 + Math.random() * (CONFIG.H - CONFIG.hud - 2 * r - 60); const a = Math.random() * Math.PI * 2; S.targetVx = Math.cos(a); S.targetVy = Math.sin(a); S.nextSudden = CONFIG.suddenMin + Math.random() * (CONFIG.suddenMax - CONFIG.suddenMin); }
    function updRound() { $('teaRound').textContent = S.round; }
    function updTimer() { const rem = Math.max(0, CONFIG.totalTimeLimit - S.elapsed); $('teaTimerNum').textContent = rem.toFixed(1); $('teaTimer').classList.toggle('urgent', rem <= 5); }
    function win() { S.playing = false; S.over = true; const got = S.perfectCount, need = CONFIG.perfectsNeeded; $('teaPerfect').innerHTML = got >= need ? `完美 <b style="color:#80ff80">${got}</b> 杯 · 达成奖励` : `完美 <b>${got}</b> 杯 · 未达成奖励（需 ${need} 杯）`; $('teaWin').classList.add('show'); }
    function lose() { S.playing = false; S.over = true; audio?.play('tea_fail', { volume: 0.5 }); $('teaLose').classList.add('show'); }
    function restart() { Object.assign(S, { round: 1, progress: 0, ready: false, readyTimer: 0, elapsed: 0, perfectCount: 0, results: [], playing: true, over: false }); $('teaScore').textContent = 0; updRound(); updDots(); startRound(); $('teaWin').classList.remove('show'); $('teaLose').classList.remove('show'); }

    let raf = 0, last = performance.now();
    function loop(t) {
      const dt = Math.min((t - last) / 1000, 0.1); last = t;
      pourer.style.left = S.mouseX + 'px'; pourer.style.top = S.mouseY + 'px';
      if (S.playing && !S.over) { S.elapsed += dt; updTimer(); updTarget(dt); updCup(dt); updProgress(dt); if (S.elapsed >= CONFIG.totalTimeLimit) lose(); }
      raf = requestAnimationFrame(loop);
    }
    function cleanup() { cancelAnimationFrame(raf); window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); window.removeEventListener('resize', fit); }
    updDots(); raf = requestAnimationFrame(loop);
  });
}
