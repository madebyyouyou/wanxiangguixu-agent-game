// 怪物追击玩法 —— 美术按最新方案重做（《倒茶+追击游戏》资产）。
// 玩家=所选灵球(agentball)三态立绘：常规/吃血包(excited)/触怪(scared)，移动拖出程序渲染的细碎光点尾迹。
// WSAD 8向移动躲紫鬼；5命(血滴HP·受伤不可回复)，碰怪-1命+0.8s无敌；红布「渡」=积分拾取(呼吸红光会游动)，吃1个+1分；
// 6阶段难度(怪越来越多越快)；撑过60秒→胜利(杜司衡救援)。失败-10清醒值，可重来。
// play(host, ctx) -> Promise<{result:'win'}>
export function play(host, ctx) {
  const { audio, state, bus } = ctx;
  const scoreMode = !!(ctx && ctx.scoreMode);   // 练习/赚积分模式(商城「赚取积分·再战怪物追击」入口)：不走剧情结算、不发 P_GAIN_03、失败不再额外扣清醒(每局 -5 由外部预扣)
  const persona = (state && state.persona) || 'queshe';
  const AGENT_URL = (st) => `assets/images/agent/${persona}_${st}.png`;
  const GLOW = { queshe: '#ffd27a', wuyou: '#9a6fd0', shuheng: '#bfe2f5' }[persona] || '#ffd27a';
  const RGB = { queshe: [255, 210, 122], wuyou: [154, 111, 208], shuheng: [191, 226, 245] }[persona] || [255, 210, 122];

  return new Promise((resolve) => {
    const C = {
      W: 600, H: 500, hud: 50,
      playerSpeed: 250, maxLives: 5, invincible: 0.8, pHitR: 22, sHitR: 25,
      total: 60, sanityPenalty: 10,
      // 怪物移速 = 原方案 80%(250/290/330/370/410/450 ×0.8)。
      // 同屏密度 max：梯度压平、向中位(~7)靠拢——前半段(0~20s)各 +1 更紧、后半段(30~50s)各降 1~2 更松，
      // 避免后期糊成一面墙逼到无解。上版 4/5/6/8/10/11 → 现 5/6/7/7/8/9。
      phases: [
        { time: 0, max: 5, speed: 200, interval: 0.8 }, { time: 10, max: 6, speed: 232, interval: 0.6 },
        { time: 20, max: 7, speed: 264, interval: 0.5 }, { time: 30, max: 7, speed: 296, interval: 0.4 },
        { time: 40, max: 8, speed: 328, interval: 0.32 }, { time: 50, max: 9, speed: 360, interval: 0.28 },
      ],
      pickupFirstDelay: 5, pickupHeal: 1, pickupMinDist: 100, pickupHitR: 16, pickupSpeed: 120,
    };
    const S = {
      px: C.W / 2, py: C.H / 2, lives: C.maxLives, inv: false, invT: 0,
      keys: { W: false, A: false, S: false, D: false }, moving: false,
      countdown: C.total, phase: 0, shadows: [], spawnT: 0.5, nextId: 0,
      playing: false, over: false, pickup: null, pickupT: C.pickupFirstDelay,
      parts: [], pSprite: 'normal', eatT: 0, dead: false, clothPoints: 0,
    };

    host.className = 'minigame-host chase';
    const img = (f, e) => `<img src="assets/images/ui/minigame/${f}" onerror="this.replaceWith(document.createTextNode('${e}'))">`;
    host.innerHTML = `
      <div class="chase-box" id="chaseBox">
        <canvas class="chase-trail" id="chaseTrail" width="${C.W}" height="${C.H}"></canvas>
        <div class="chase-hud">
          <div class="chase-lives" id="chaseLives"></div>
          <div class="chase-timer" id="chaseTimer">00:60</div>
          <div class="chase-phase" id="chasePhase">第 1 波</div>
        </div>
        <div class="chase-player" id="chasePlayer"><img id="chasePlayerImg" src="${AGENT_URL('normal')}" style="filter:drop-shadow(0 0 9px ${GLOW})" onerror="this.replaceWith(document.createTextNode('🔆'))"></div>
        <div class="chase-flash" id="chaseFlash"></div>
        <div class="chase-intro" id="chaseIntro">
          <div class="t">逃 命</div>
          <span class="k">W A S D</span> 控制灵球移动（支持斜向）<br>
          避开<b style="color:#caa">紫色鬼影</b>，撑过 <b style="color:#ffcc60">60 秒</b><br>
          <span style="color:#ffcc60">「渡」字红布（会游动）吃一个 +1 积分；5 条命，受伤不可恢复</span>
          <button class="chase-btn" id="chaseStart">开 始</button>
        </div>
        <div class="chase-modal" id="chaseWin"><div class="chase-modal-in">
          <div class="t">你成功甩开了怪物一段距离</div><div class="d">一只手从窄巷里伸出，扣住了你的手腕……</div>
          <button class="chase-btn" id="chaseNext">进入下一段</button></div></div>
        <div class="chase-modal" id="chaseLose"><div class="chase-modal-in">
          <div class="t">你被怪物咬伤了胳膊</div><div class="d" id="chaseLoseD">清醒值 -10</div>
          <button class="chase-btn" id="chaseRetry">重新开始</button></div></div>
      </div>`;

    const $ = (id) => host.querySelector('#' + id);
    const box = $('chaseBox'), player = $('chasePlayer'), pimg = $('chasePlayerImg'), flash = $('chaseFlash');
    const cv = $('chaseTrail'), cx = cv.getContext('2d');
    const fit = () => { box.style.transform = `scale(${Math.min(1.5, (window.innerWidth - 30) / C.W, (window.innerHeight - 30) / C.H)})`; };
    fit(); window.addEventListener('resize', fit);

    // 玩家三态立绘切换（优先级：触怪 scared > 吃血包 excited > 常规 normal）
    function setP(st) { if (S.pSprite === st) return; S.pSprite = st; if (pimg) pimg.src = AGENT_URL(st); }

    function renderLives() {
      const el = $('chaseLives'); el.innerHTML = '';
      for (let i = 0; i < C.maxLives; i++) {
        const alive = i < S.lives;
        const s = document.createElement('span');
        s.className = 'chase-life' + (alive ? '' : ' lost');
        s.innerHTML = img(alive ? 'HPBar_Bright.png' : 'HPBar_Dim.png', alive ? '🩸' : '🩶');
        el.appendChild(s);
      }
    }
    const kd = (e) => { const k = e.key.toUpperCase(); if ('WASD'.includes(k) && k.length === 1) { e.preventDefault(); S.keys[k] = true; } };
    const ku = (e) => { const k = e.key.toUpperCase(); if ('WASD'.includes(k) && k.length === 1) S.keys[k] = false; };
    window.addEventListener('keydown', kd); window.addEventListener('keyup', ku);
    $('chaseStart').addEventListener('click', () => { $('chaseIntro').style.display = 'none'; S.playing = true; });
    $('chaseNext').addEventListener('click', () => { cleanup(); resolve({ result: 'win' }); });
    $('chaseRetry').addEventListener('click', () => { if (scoreMode) { cleanup(); resolve({ result: 'lose' }); } else if (S.dead) { cleanup(); resolve({ result: 'dead' }); } else restart(); });

    function updPlayer(dt) {
      let dx = 0, dy = 0; if (S.keys.W) dy -= 1; if (S.keys.S) dy += 1; if (S.keys.A) dx -= 1; if (S.keys.D) dx += 1;
      S.moving = !!(dx || dy);
      if (dx || dy) { if (dx && dy) { const inv = 1 / Math.sqrt(2); dx *= inv; dy *= inv; } S.px = Math.max(20, Math.min(C.W - 20, S.px + dx * C.playerSpeed * dt)); S.py = Math.max(C.hud + 20, Math.min(C.H - 20, S.py + dy * C.playerSpeed * dt)); player.style.left = S.px + 'px'; player.style.top = S.py + 'px'; }
    }

    // 程序渲染的细碎光点拖尾（人格辉光色，加色混合发光，移动时持续喷出、迅速淡出）
    function spawnTrail() {
      const n = 2;
      for (let i = 0; i < n; i++) {
        const ang = Math.random() * Math.PI * 2, sp = Math.random() * 16;
        S.parts.push({ x: S.px + (Math.random() - 0.5) * 12, y: S.py + (Math.random() - 0.5) * 14, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - 4, life: 0.45 + Math.random() * 0.35, max: 0.8, r: 1.4 + Math.random() * 2.6 });
      }
    }
    function updTrail(dt) {
      if (S.moving && !S.over) spawnTrail();
      cx.clearRect(0, 0, C.W, C.H);
      cx.globalCompositeOperation = 'lighter';
      for (let i = S.parts.length - 1; i >= 0; i--) {
        const p = S.parts[i]; p.life -= dt;
        if (p.life <= 0) { S.parts.splice(i, 1); continue; }
        p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 16 * dt;
        const a = Math.max(0, p.life / p.max), rad = p.r * (0.5 + a * 0.7) * 3;
        const g = cx.createRadialGradient(p.x, p.y, 0, p.x, p.y, rad);
        g.addColorStop(0, `rgba(${RGB[0]},${RGB[1]},${RGB[2]},${(a * 0.85).toFixed(3)})`);
        g.addColorStop(1, `rgba(${RGB[0]},${RGB[1]},${RGB[2]},0)`);
        cx.fillStyle = g; cx.beginPath(); cx.arc(p.x, p.y, rad, 0, Math.PI * 2); cx.fill();
      }
      cx.globalCompositeOperation = 'source-over';
    }
    function clearTrail() { S.parts = []; cx.clearRect(0, 0, C.W, C.H); }

    function spawnShadow() {
      const ph = C.phases[S.phase], m = 20, cx0 = C.W / 2, cy = (C.H + C.hud) / 2, side = Math.floor(Math.random() * 4);
      let x, y;
      if (side === 0) { x = m + Math.random() * (C.W - m * 2); y = -10; }
      else if (side === 1) { x = C.W + 10; y = C.hud + m + Math.random() * (C.H - C.hud - m * 2); }
      else if (side === 2) { x = m + Math.random() * (C.W - m * 2); y = C.H + 10; }
      else { x = -10; y = C.hud + m + Math.random() * (C.H - C.hud - m * 2); }
      const a = Math.atan2(cy - y, cx0 - x) + (Math.random() - 0.5) * (Math.PI * 2 / 3);
      const el = document.createElement('div'); el.className = 'chase-shadow spawning'; el.innerHTML = img('Monster.png', '👤'); el.style.left = x + 'px'; el.style.top = y + 'px'; box.appendChild(el);
      S.shadows.push({ id: S.nextId++, x, y, vx: Math.cos(a) * ph.speed, vy: Math.sin(a) * ph.speed, el });
    }
    function updShadows(dt) {
      for (let i = S.shadows.length - 1; i >= 0; i--) { const s = S.shadows[i]; s.x += s.vx * dt; s.y += s.vy * dt; if (s.x < -50 || s.x > C.W + 50 || s.y < -50 || s.y > C.H + 50) { s.el.remove(); S.shadows.splice(i, 1); continue; } s.el.style.left = s.x + 'px'; s.el.style.top = s.y + 'px'; }
      S.spawnT -= dt; const ph = C.phases[S.phase]; if (S.spawnT <= 0 && S.shadows.length < ph.max) { spawnShadow(); S.spawnT = ph.interval; }
    }
    function spawnPickup() {
      let x, y, t = 0; do { x = 40 + Math.random() * (C.W - 80); y = C.hud + 40 + Math.random() * (C.H - C.hud - 80); if (Math.hypot(x - S.px, y - S.py) >= C.pickupMinDist) break; t++; } while (t < 20);
      const el = document.createElement('div'); el.className = 'chase-pickup spawning'; el.innerHTML = img('bright_red_cloth.png', '🟥'); el.style.left = x + 'px'; el.style.top = y + 'px'; box.appendChild(el);
      const a = Math.random() * Math.PI * 2; S.pickup = { x, y, el, vx: Math.cos(a), vy: Math.sin(a) };
    }
    function updPickup(dt) {
      if (S.pickup) { const p = S.pickup, m = 20; p.x += p.vx * C.pickupSpeed * dt; p.y += p.vy * C.pickupSpeed * dt; if (p.x < m) { p.x = m; p.vx = Math.abs(p.vx); } if (p.x > C.W - m) { p.x = C.W - m; p.vx = -Math.abs(p.vx); } if (p.y < C.hud + m) { p.y = C.hud + m; p.vy = Math.abs(p.vy); } if (p.y > C.H - m) { p.y = C.H - m; p.vy = -Math.abs(p.vy); } p.el.style.left = p.x + 'px'; p.el.style.top = p.y + 'px'; if (Math.hypot(p.x - S.px, p.y - S.py) < C.pHitR + C.pickupHitR) eatPickup(); }
      else { S.pickupT -= dt; if (S.pickupT <= 0) spawnPickup(); }
    }
    function eatPickup() {
      // 红布=积分拾取（吃 1 个 +1 分）；生命不可回复。积分不立即入账——仅本局累计，
      // 胜利 win() 时才一次性结算；失败/重来由 restart() 清零作废 → 失败局的红布不计入真实积分 gain。
      S.clothPoints = (S.clothPoints || 0) + 1;
      healFx(S.pickup.x, S.pickup.y, '+1 分', false);
      if (!S.inv) { setP('excited'); S.eatT = 0.7; }   // 吃红布→兴奋态（触怪无敌期间不抢镜）
      audio?.play('key_event', { volume: 0.5 }); const el = S.pickup.el; el.classList.add('eaten'); setTimeout(() => el.remove(), 500); S.pickup = null; S.pickupT = 0;
    }
    function healFx(x, y, text, gray) { const f = document.createElement('div'); f.className = 'chase-heal' + (gray ? ' gray' : ''); f.textContent = text; f.style.left = x + 'px'; f.style.top = y + 'px'; box.appendChild(f); setTimeout(() => f.remove(), 1000); }
    function checkHit() { if (S.inv) return; for (const s of S.shadows) { if (Math.hypot(s.x - S.px, s.y - S.py) < C.pHitR + C.sHitR) { onHit(); return; } } }
    function onHit() { S.lives--; S.inv = true; S.invT = C.invincible; S.eatT = 0; setP('scared'); player.classList.add('hit'); flash.classList.add('on'); setTimeout(() => flash.classList.remove('on'), 300); renderLives(); audio?.play('hit', { volume: 0.5 }); if (S.lives <= 0) lose(); }
    function updInv(dt) { if (S.inv) { S.invT -= dt; if (S.invT <= 0) { S.inv = false; player.classList.remove('hit'); setP('normal'); } } }
    function updPhase() { const el = C.total - S.countdown; let ph = 0; for (let i = C.phases.length - 1; i >= 0; i--) { if (el >= C.phases[i].time) { ph = i; break; } } if (ph !== S.phase) { S.phase = ph; $('chasePhase').textContent = `第 ${ph + 1} 波`; } }
    function updTimer(dt) { S.countdown -= dt; if (S.countdown <= 0) { S.countdown = 0; win(); return; } const s = Math.ceil(S.countdown); $('chaseTimer').textContent = '00:' + String(s).padStart(2, '0'); $('chaseTimer').classList.toggle('urgent', s <= 10); }
    function win() {
      S.playing = false; S.over = true; S.shadows.forEach((s) => s.el.remove()); S.shadows = []; if (S.pickup) { S.pickup.el.remove(); S.pickup = null; } clearTrail(); audio?.play('key_event', { volume: 0.4 });
      const d = $('chaseWin')?.querySelector('.d');
      // 红布积分：胜利一次性结算入账（失败局的红布已在 restart() 清零，不计入真实积分 gain）
      if (S.clothPoints > 0) state.changePoints?.(S.clothPoints);
      if (scoreMode) {
        // 练习模式(赚积分)：改积分结算文案、按钮"离开"；不走剧情"一只手伸出"、不发 P_GAIN_03 满血一次性奖励
        $('chaseWin').querySelector('.t').textContent = '撑过了 60 秒！';
        if (d) d.innerHTML = S.clothPoints > 0 ? `<span style="color:#ffd479">拾得红布 ${S.clothPoints} 个 · 积分 +${S.clothPoints}</span>` : '这一局没拾到红布，没拿到积分。';
        const nb = $('chaseNext'); if (nb) nb.textContent = '离 开';
      } else {
        if (S.clothPoints > 0 && d) d.innerHTML += `<br><span style="color:#ffd479">拾得红布 ${S.clothPoints} 个 · 积分 +${S.clothPoints}</span>`;
        // P_GAIN_03：脱险时生命保留 ≥3 格 → 额外 +15，全程仅一次(FLAG)；与红布积分并存
        if (S.lives >= 3 && state) { state.flags = state.flags || {}; if (!state.flags.t16PerfectRewarded) { state.flags.t16PerfectRewarded = true; state.changePoints?.(15); if (d) d.innerHTML += `<br><span style="color:#ffd479">生命保留 ${S.lives} 格 · 积分 +15</span>`; } }
      }
      setTimeout(() => $('chaseWin').classList.add('show'), 500);
    }
    function lose() {
      S.playing = false; S.over = true; player.classList.add('dying'); clearTrail();
      if (scoreMode) {
        // 练习模式：每局 -5 清醒已由商城「赚取积分」入口预扣，这里不再额外扣；失败=没拿到积分，按钮"离开"
        const m = $('chaseLose'); m.querySelector('.t').textContent = '没撑住';
        $('chaseLoseD').textContent = '这一局没拿到积分（每局 -5 清醒值已结算）。';
        $('chaseRetry').textContent = '离 开';
        audio?.play('fail', { volume: 0.4 }); setTimeout(() => m.classList.add('show'), 1200);
        return;
      }
      S.dead = (state.sanity - C.sanityPenalty) <= 0;   // 这一下是否把清醒值扣到归零
      const _sb = state.sanity;
      state.sanity = Math.max(0, state.sanity - C.sanityPenalty);
      state._logSanity?.(state.sanity - _sb, '嵌入玩法·怪物追击失败');   // 记入清醒值手账（追击失败·明确原因）
      bus.emit('sanityChanged', { value: state.sanity, delta: -C.sanityPenalty });
      const modal = $('chaseLose');
      if (S.dead) {
        // 清醒值归零 → 不再给重试，点按钮即接受死亡结局（由 GameScene._runMinigame 触发 END_SANITY_ZERO）
        modal.querySelector('.t').textContent = '你倒在了巷子里';
        $('chaseLoseD').textContent = '清醒值归零……你再没能从这条巷子里跑出去。';
        $('chaseRetry').textContent = '接受结局';
      } else {
        $('chaseLoseD').textContent = `清醒值 -${C.sanityPenalty}（剩余 ${state.sanity}）`;
      }
      audio?.play('fail', { volume: 0.4 }); setTimeout(() => modal.classList.add('show'), 1200);
    }
    function restart() { Object.assign(S, { px: C.W / 2, py: C.H / 2, lives: C.maxLives, inv: false, invT: 0, countdown: C.total, phase: 0, spawnT: 0.5, playing: true, over: false, pickupT: C.pickupFirstDelay, eatT: 0, dead: false, clothPoints: 0, keys: { W: false, A: false, S: false, D: false } }); S.shadows.forEach((s) => s.el.remove()); S.shadows = []; if (S.pickup) { S.pickup.el.remove(); S.pickup = null; } clearTrail(); S.pSprite = ''; setP('normal'); renderLives(); player.classList.remove('dying', 'hit'); player.style.left = S.px + 'px'; player.style.top = S.py + 'px'; $('chaseWin').classList.remove('show'); $('chaseLose').classList.remove('show'); }

    let raf = 0, last = performance.now();
    function loop(t) {
      const dt = Math.min((t - last) / 1000, 0.1); last = t;
      if (S.playing && !S.over) {
        updPhase(); updTimer(dt); updPlayer(dt); updShadows(dt); updPickup(dt); updInv(dt);
        if (S.eatT > 0) { S.eatT -= dt; if (S.eatT <= 0 && !S.inv) setP('normal'); }
        updTrail(dt); checkHit();
      }
      raf = requestAnimationFrame(loop);
    }
    function cleanup() { cancelAnimationFrame(raf); window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); window.removeEventListener('resize', fit); }
    renderLives(); player.style.left = S.px + 'px'; player.style.top = S.py + 'px'; raf = requestAnimationFrame(loop);
  });
}
