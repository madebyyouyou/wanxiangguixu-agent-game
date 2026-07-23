// 窃听玩法「瓦洞偷听」—— 照《T12窃听玩法设计文档_v6》实现（无 demo，从零做）。
// 长按空格=趴下贴瓦洞听对话(打字机+进度)；松手=直起身(安全,暂停)。
// 危险事件：椅子声+边缘泛红——反应窗口0.5s(按下不算)→危险期3.0s(按下=暴露+1/事件)。
// 危险事件无限生成(每次危险结束后随机安全期4~8s再来,无固定上限)；暴露1次→弹"继续窃听"(进度暂停,文字回退~10字)；2次→失败可重来；进度100%→成功。
// play(host, ctx) -> Promise<{result:'success'}>
export function play(host, ctx) {
  const { audio } = ctx;
  return new Promise((resolve) => {
    const SCRIPT =
      '〔女人〕ta今天喝茶了？　' +
      '〔中年男人〕喝了。我在桌上写了个「见」字，ta看到了。这种人不需要教，ta自己会看。　' +
      '〔女人〕让ta去用井口的红水洗红布。那个液滴不是血，是裂缝的代谢废物。　' +
      '〔中年男人〕你确定？上一个——　' +
      '〔女人〕上一个就是洗了红布才多活了一天！八天后他幻觉了，以为脉搏是虫，拿指甲去抠——不是红水杀的他，是他自己抠的。';
    const TEXT_PER_SEC = 3.6, TOTAL = SCRIPT.length, REACT = 0.5, DANGER_END = 3.5;   // REACT 反应窗口 0.5s=原 1.0s 的一半（再缩短=更难反应；危险期=DANGER_END-REACT=3.0s）
    // 危险事件【无限生成】：每次危险结束后，隔一段随机安全期(4~8s)必再来一次。
    // 杜绝旧 bug：原本是固定 7 个事件，玩家干等到 7 次过完后就永久安全、可一直按空格刷满进度。
    const SAFE_MIN = 4, SAFE_RND = 4;
    const S = { revealed: 0, pressing: false, exposures: 0, elapsed: 0, over: false, waiting: false, started: false, nextEventAt: 2 + Math.random() * 6, ev: null, evRec: false, exposeFlash: 0 };

    host.className = 'minigame-host eav';
    host.innerHTML = `
      <div class="eav-box" id="eavBox">
        <div class="eav-bg eav-bg-far" style="background-image:url('assets/images/bg/eav_a.webp')"></div>
        <div class="eav-bg eav-bg-near" style="background-image:url('assets/images/bg/eav_b.webp')"></div>
        <div class="eav-danger" id="eavDanger"></div>
        <div class="eav-text" id="eavText"></div>
        <div class="eav-bottom">
          <div class="eav-bar"><div class="eav-bar-fill" id="eavFill"></div></div>
          <div class="eav-hint" id="eavHint">长按 <b>空格</b>：贴近瓦洞听清对话 · 松手：直起身躲开</div>
        </div>
        <div class="eav-expose" id="eavExpose" style="background-image:url('assets/images/bg/eav_c.webp')"><div class="eav-expose-cap">他抬起了头——一双猩红的眼睛正盯着上方……</div></div>
        <div class="eav-cont" id="eavCont"><div>被看见了一眼……他们好像还没确定。</div><button class="eav-btn" id="eavContBtn">继续窃听</button></div>
        <div class="eav-intro" id="eavIntro">
          <div class="t">瓦 洞 偷 听</div>
          <b>长按空格</b>贴瓦缝听屋内对话；<b>松手</b>直起身躲开（安全）<br>
          听到<b style="color:#ff8060">椅子拖动声、画面边缘泛红</b>=他要抬头了——<b style="color:#ff8060">立刻松手</b><br>
          被发现 <b>2 次</b>就暴露了；听完全部对话过关
          <button class="eav-btn" id="eavStart">开 始</button>
        </div>
        <div class="eav-modal" id="eavWin"><div class="eav-modal-in"><div class="t">听清了</div><div class="d">井口红水、裂缝的代谢废物……你把这些都记下了。</div><button class="eav-btn" id="eavNext">进入下一段</button></div></div>
        <div class="eav-modal" id="eavLose"><div class="eav-modal-in"><div class="t">「上面有人！」</div><div class="d">推门声炸响，急促的脚步逼近——你被发现了。</div><button class="eav-btn" id="eavRetry">重新潜回</button></div></div>
      </div>`;

    const $ = (id) => host.querySelector('#' + id);
    const box = $('eavBox'), danger = $('eavDanger'), txt = $('eavText'), fill = $('eavFill'), expose = $('eavExpose'), cont = $('eavCont');
    const fit = () => { box.style.transform = `scale(${Math.min(1.3, (window.innerWidth - 40) / 700, (window.innerHeight - 40) / 500)})`; };
    fit(); window.addEventListener('resize', fit);

    const kd = (e) => { if (e.code === 'Space' || e.key === ' ') { e.preventDefault(); if (S.started && !S.over && !S.waiting) S.pressing = true; } };
    const ku = (e) => { if (e.code === 'Space' || e.key === ' ') { e.preventDefault(); S.pressing = false; } };
    window.addEventListener('keydown', kd); window.addEventListener('keyup', ku);
    $('eavStart').addEventListener('click', () => { $('eavIntro').style.display = 'none'; S.started = true; audio?.loop('amb_woodhouse', { volume: 0.35 }); });
    $('eavContBtn').addEventListener('click', () => { S.waiting = false; cont.classList.remove('show'); });
    $('eavNext').addEventListener('click', () => { cleanup(); resolve({ result: 'success' }); });
    $('eavRetry').addEventListener('click', restart);

    function onExpose() {
      S.exposures++; S.exposeFlash = 0.5; expose.classList.add('show'); audio?.play('shadow', { volume: 0.4 });
      S.revealed = Math.max(0, S.revealed - 10); // 文字回退约10字
      // 突脸特写多停一会儿再弹提示框，别一下就被遮住：被发现保持 ~1.4s、单次被瞥见 ~0.9s
      if (S.exposures >= 2) { setTimeout(lose, 1400); }   // 被发现：红眼男特写一直留着，1.4s 后才弹"上面有人"
      else { S.waiting = true; S.pressing = false; setTimeout(() => { expose.classList.remove('show'); cont.classList.add('show'); }, 900); }
    }
    function lose() { S.over = true; audio?.stopLoop('amb_woodhouse'); audio?.play('door_push', { volume: 0.5 }); $('eavLose').classList.add('show'); }
    function winGame() { S.over = true; audio?.stopLoop('amb_woodhouse'); audio?.play('key_event', { volume: 0.3 }); $('eavWin').classList.add('show'); }
    function restart() { Object.assign(S, { revealed: 0, pressing: false, exposures: 0, elapsed: 0, over: false, waiting: false, nextEventAt: 2 + Math.random() * 6, ev: null, evRec: false, exposeFlash: 0 }); $('eavLose').classList.remove('show'); $('eavWin').classList.remove('show'); cont.classList.remove('show'); expose.classList.remove('show'); audio?.loop('amb_woodhouse', { volume: 0.35 }); }

    let raf = 0, last = performance.now();
    function loop(t) {
      const dt = Math.min((t - last) / 1000, 0.1); last = t;
      if (S.started && !S.over) {
        S.elapsed += dt;
        if (S.exposeFlash > 0) S.exposeFlash -= dt;
        // 触发危险事件（到点且当前无事件就开一次；无固定上限）
        if (!S.ev && S.elapsed >= S.nextEventAt) { S.ev = { start: S.elapsed }; S.evRec = false; audio?.play('chair', { volume: 0.5 }); }
        // 处理当前危险事件
        if (S.ev) {
          const e = S.elapsed - S.ev.start;
          if (e < REACT) danger.className = 'eav-danger react';
          else if (e < 3.0) danger.className = 'eav-danger on';
          else if (e < DANGER_END) danger.className = 'eav-danger fade';
          else { danger.className = 'eav-danger'; S.ev = null; S.nextEventAt = S.elapsed + SAFE_MIN + Math.random() * SAFE_RND; }   // 本次结束→排下一次(安全期 4~8s)
          // 暴露判定：危险期(REACT~DANGER_END)内按下 = +1（单事件最多1次）
          if (S.ev && e >= REACT && e < DANGER_END && S.pressing && !S.evRec) { S.evRec = true; onExpose(); }
        } else danger.className = 'eav-danger';
        // 文字/进度（长按、非等待、非被发现闪帧时推进）
        box.classList.toggle('crouch', S.pressing);
        if (S.pressing && !S.waiting && S.exposeFlash <= 0) {
          S.revealed = Math.min(TOTAL, S.revealed + TEXT_PER_SEC * dt);
          if (S.revealed >= TOTAL) winGame();
        }
        txt.textContent = SCRIPT.slice(0, Math.floor(S.revealed));
        txt.classList.toggle('dim', !S.pressing);
        fill.style.width = (S.revealed / TOTAL * 100) + '%';
      }
      raf = requestAnimationFrame(loop);
    }
    function cleanup() { cancelAnimationFrame(raf); window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); window.removeEventListener('resize', fit); audio?.stopLoop('amb_woodhouse'); }
    raf = requestAnimationFrame(loop);
  });
}
