// 灵球三选一（随行系统）。移植自《万象归墟·灵球选择界面》原型。
import { AGENTS, SYS_LINES, STATE_MAP, AGENT_STATES } from '../data/agents.js';

export function AgentSelectScene(ctx) {
  let sysIdx = -1, sysDone = false, lockedKey = null, hoverKey = null;
  let chatKey = null, sampleIdx = 0, chatBusy = false;
  let cleanup = [];

  return {
    mount(root) {
      const { state, audio, scenes, agent } = ctx;
      const REST = { queshe: 'normal', wuyou: 'surprised', shuheng: 'normal' };
      // 灵球立绘：按可用状态回退（用于试聊头像随 <state> 切表情）
      const spriteUrl = (k, want) => `assets/images/agent/${k}_${(AGENT_STATES[k] || []).includes(want) ? want : (REST[k] || 'normal')}.png`;
      const setChatAvatar = (st) => { const img = root.querySelector('#chatAvatar img'); if (img && chatKey) img.src = spriteUrl(chatKey, st); };
      // 灵球＝局内同款脉动 agentball：idle 精灵条（23 帧）+ 下方 rAF 逐帧驱动，替换原静态立绘
      const orbSheet = (k) => `assets/images/agent/${k}_idle.webp`;
      const orbHtml = Object.values(AGENTS).map((o) => `
        <div class="orb-wrap" data-key="${o.key}" style="--c:${o.accent};--g:${o.glow}">
          <div class="orb"><div class="orb-img orb-sprite-sel" style="background-image:url('${orbSheet(o.key)}')"></div></div>
          <div class="orb-name">${o.name}</div><div class="reflection"></div>
        </div>`).join('');

      root.innerHTML = `
        <div class="liminal-bg"><div class="horizon"></div><div class="water"></div>
          <div class="mist"><span></span><span></span><span></span></div></div>
        <div class="sysbar"><div class="sysline" id="sysline"></div><div class="sys-hint" id="sysHint">▼ 点击继续</div></div>
        <div class="orbs">${orbHtml}</div>
        <div class="infobox" id="infobox">
          <div class="ib-code" id="ibCode"></div><div class="ib-name" id="ibName"></div>
          <div class="ib-tags" id="ibTags"></div><div class="ib-style" id="ibStyle"></div>
          <div class="ib-btns"><button class="btn-bind" id="btnBind">绑 定</button><button class="btn-try" id="btnTry">试 聊</button></div>
        </div>
        <div class="chatpop" id="chatpop"><aside class="chatcard" id="chatcard">
          <div class="chat-head"><div class="chat-avatar" id="chatAvatar"></div>
            <div class="head-txt"><h3 id="chatName">试聊</h3><div class="sub" id="chatSub"></div></div>
            <span class="x" id="chatClose">✕</span></div>
          <div class="chat-body" id="chatBody"></div>
          <div class="chat-foot"><input id="chatInput" placeholder="随便说点什么……" /><button class="send" id="chatSend">➤</button></div>
        </aside></div>
        <div class="demo-note">试聊已接入真实大模型 · 绑定该系统后这段对话会延续到副本内</div>`;

      const $ = (s) => root.querySelector(s);
      const syslineEl = $('#sysline'), sysHintEl = $('#sysHint'), infobox = $('#infobox');

      const nextSysLine = () => {
        if (sysIdx >= SYS_LINES.length - 1) {
          syslineEl.classList.remove('show');
          setTimeout(() => { syslineEl.textContent = '【请将意识投向其一……】'; syslineEl.classList.add('show'); sysHintEl.textContent = '悬停灵球查看 · 点击信息框绑定'; }, 300);
          sysDone = true; return;
        }
        sysIdx++; syslineEl.classList.remove('show');
        setTimeout(() => { syslineEl.textContent = SYS_LINES[sysIdx]; syslineEl.classList.add('show'); if (sysIdx === SYS_LINES.length - 1) sysHintEl.textContent = '▼ 点击完成'; }, sysIdx === 0 ? 100 : 300);
      };

      const fillBox = (key) => {
        const o = AGENTS[key];
        infobox.style.setProperty('--accent', o.accent);
        $('#ibCode').textContent = '代号 · ' + o.code;
        $('#ibName').textContent = o.name; $('#ibName').style.color = o.accent;
        const tg = $('#ibTags'); tg.innerHTML = '';
        o.tags.forEach((t) => { const s = document.createElement('span'); s.textContent = t; tg.appendChild(s); });
        $('#ibStyle').textContent = o.style;
      };
      const positionBox = (wrap) => {
        const orb = wrap.querySelector('.orb'); const r = orb.getBoundingClientRect();
        const bw = infobox.offsetWidth;
        let left = r.left + r.width / 2 - bw / 2; const top = r.top + r.height * 0.62;
        left = Math.max(12, Math.min(left, window.innerWidth - bw - 12));
        infobox.style.left = left + 'px'; infobox.style.top = top + 'px';
      };
      const showBox = (key, wrap) => { fillBox(key); infobox.classList.remove('locked'); positionBox(wrap); infobox.classList.add('show'); };
      const hideBox = () => { infobox.classList.remove('show', 'locked'); lockedKey = null; root.querySelectorAll('.orb-wrap').forEach((w) => w.classList.remove('active')); };

      root.querySelectorAll('.orb-wrap').forEach((wrap) => {
        const key = wrap.dataset.key;
        wrap.addEventListener('mouseenter', () => { hoverKey = key; if (lockedKey) return; audio.play('ui_cursor', { volume: 0.4 }); showBox(key, wrap); });
        wrap.addEventListener('mouseleave', () => { hoverKey = null; if (lockedKey) return; hideBox(); });
        wrap.addEventListener('click', (e) => { e.stopPropagation(); lockedKey = key; root.querySelectorAll('.orb-wrap').forEach((w) => w.classList.toggle('active', w === wrap)); showBox(key, wrap); infobox.classList.add('locked'); });
      });
      infobox.addEventListener('click', (e) => e.stopPropagation());

      const docClick = () => { if (lockedKey) { hideBox(); return; } if (!sysDone) nextSysLine(); };
      root.addEventListener('click', docClick);

      // 绑定
      $('#btnBind').addEventListener('click', async (e) => {
        e.stopPropagation();
        const key = lockedKey || hoverKey; if (!key) return;
        state.persona = key;
        agent.endTrial(key);   // 试聊过该人格→保留对话带入副本；试了别的人格→清空，避免错配
        audio.play('key_event', { volume: 0.5 });
        infobox.classList.add('bound');
        $('#btnBind').textContent = '已绑定 · 选择副本…';
        setTimeout(() => scenes.goto('dungeonselect'), 900);
      });

      // 试聊：接真实大模型（用 ctx.agent 同一单例 + 临时人格；后端不可用→自动人格 mock）。
      // 绑定该人格后，这段 history/uiLog 会原样带进副本内的对话框（"和局内打通"）。
      const chatpop = $('#chatpop'), chatBody = $('#chatBody');
      // 思考气泡（3 点跳动）→ 真模型回复后逐字打字机；返回 finish(text) 收尾并写入共享 uiLog
      const thinkingBubble = () => {
        chatBusy = true; $('#chatcard')?.classList.add('thinking');   // 思考中→左侧呼吸边线上下起伏
        const row = document.createElement('div'); row.className = 'row-msg bot';
        row.innerHTML = `<div class="mini-orb"><img src="${spriteUrl(chatKey, 'normal')}" onerror="this.remove()"></div><div class="msg bot typing"><span></span><span></span><span></span></div>`;
        chatBody.appendChild(row); chatBody.scrollTop = chatBody.scrollHeight;
        return (text, mood) => {
          $('#chatcard')?.classList.remove('thinking');
          const miniImg = row.querySelector('.mini-orb img'); if (miniImg && mood) miniImg.src = spriteUrl(chatKey, mood);   // 文字左侧头像＝这句话的 state（定格，不随后续对话变化）
          const bubble = row.querySelector('.msg'); bubble.classList.remove('typing'); bubble.textContent = '';
          let i = 0; (function type() {
            if (i <= text.length) { bubble.textContent = text.slice(0, i++); chatBody.scrollTop = chatBody.scrollHeight; setTimeout(type, 22); }
            else { chatBusy = false; (agent.uiLog = agent.uiLog || []).push({ text, kind: false }); }
          })();
        };
      };
      const askShow = async (opts) => {
        const finish = thinkingBubble();
        let res = null;
        try { res = await agent.ask(opts); } catch (e) {}
        const mood = (res && res.state) ? (STATE_MAP[res.state] || 'normal') : 'normal';
        if (res && res.state) setChatAvatar(mood);   // 顶部头像＝最近一条回复的 state（随对话更新）
        finish((res && res.text) || '（……信号好像断了一下，再说一次？）', mood);   // 文字左侧＝这条回复的 state（定格）
      };
      const openChat = (key) => {
        chatKey = key; chatBusy = false; const o = AGENTS[key];
        agent.beginTrial(key);   // 用该人格开一段独立对话（切到别的人格会自动重置）
        $('#chatcard').style.setProperty('--accent', o.accent); $('#chatcard').style.setProperty('--glow', o.glow); $('#chatcard').style.setProperty('--accent-rgb', o.accentRgb || '120,140,160');
        $('#chatName').textContent = '试聊 · ' + o.name; $('#chatName').style.color = o.accent;
        $('#chatSub').textContent = o.tags.join(' · '); chatBody.innerHTML = ''; $('#chatInput').value = '';
        $('#chatAvatar').innerHTML = `<img src="${spriteUrl(key, 'normal')}" onerror="this.remove()">`;   // 头像用人格立绘
        chatpop.classList.add('show'); setTimeout(() => askShow({ directive: { type: '试聊', text: '宿主正在三个候选系统里挑选其一，跟 ta 打个照面、用你的性格做段自我介绍（你还是候选、未被选定/绑定，别提已绑定、别提进副本）' } }), 280);
      };
      const addMsg = (text, who) => {
        const row = document.createElement('div'); row.className = 'row-msg ' + (who === 'me' ? 'me' : 'bot');
        if (who !== 'me') { const orb = document.createElement('div'); orb.className = 'mini-orb'; orb.innerHTML = `<img src="${spriteUrl(chatKey, 'normal')}" onerror="this.remove()">`; row.appendChild(orb); }
        const m = document.createElement('div'); m.className = 'msg ' + (who === 'me' ? 'me' : 'bot'); m.textContent = text;
        row.appendChild(m); chatBody.appendChild(row); chatBody.scrollTop = chatBody.scrollHeight;
        if (who === 'me') (agent.uiLog = agent.uiLog || []).push({ text, kind: true });
      };
      const chatSend = () => {
        if (chatBusy) return; const v = $('#chatInput').value.trim(); if (!v) return;
        addMsg(v, 'me'); $('#chatInput').value = '';
        askShow({ playerInput: v });
      };
      $('#btnTry').addEventListener('click', (e) => { e.stopPropagation(); const key = lockedKey || hoverKey; if (key) openChat(key); });
      $('#chatSend').addEventListener('click', (e) => { e.stopPropagation(); chatSend(); });
      $('#chatInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') chatSend(); });
      $('#chatInput').addEventListener('click', (e) => e.stopPropagation());
      $('#chatClose').addEventListener('click', (e) => { e.stopPropagation(); chatpop.classList.remove('show'); });
      $('#chatcard').addEventListener('click', (e) => e.stopPropagation());

      const onResize = () => { const key = lockedKey || hoverKey; if (key && infobox.classList.contains('show')) { const w = root.querySelector(`.orb-wrap[data-key="${key}"]`); if (w) positionBox(w); } };
      window.addEventListener('resize', onResize); cleanup.push(() => window.removeEventListener('resize', onResize));

      // 三颗灵球脉动：idle 精灵条逐帧推进（~8fps·舒缓，frame/(N-1)*100%），三球错相位更自然；
      // 上下浮动由 CSS `.orb .orb-img{animation:float}` 提供，与脉动叠加、保留。
      // 注：rAF 在无头预览里不跑→预览中停在第 0 帧属正常，真机才动。
      const orbSprites = [...root.querySelectorAll('.orb-sprite-sel')];
      if (orbSprites.length) {
        const NF = 23, FRAME_MS = 1000 / 8, PHASE = [0, 8, 15];   // 帧率↓=脉动更慢（原 14fps 偏快）
        orbSprites.forEach((s) => { s.style.backgroundSize = NF * 100 + '% 100%'; s.style.backgroundRepeat = 'no-repeat'; });
        let frame = 0, acc = 0, last = 0, raf = 0;
        const paint = () => orbSprites.forEach((s, i) => { const f = (frame + (PHASE[i] || 0)) % NF; s.style.backgroundPositionX = (f / (NF - 1) * 100) + '%'; });
        paint();
        // 钳制单帧 delta：最小化/切后台时 rAF 暂停，恢复那一帧 t-last 可达几十秒，若全量累进 acc 会狂追帧→球飞速滚动。封顶 1 帧即可。
        const tick = (t) => { if (last) acc += Math.min(t - last, FRAME_MS); last = t; if (acc >= FRAME_MS) { acc -= FRAME_MS; frame = (frame + 1) % NF; paint(); } raf = requestAnimationFrame(tick); };
        raf = requestAnimationFrame(tick);
        cleanup.push(() => cancelAnimationFrame(raf));
      }

      nextSysLine();
    },
    unmount() { cleanup.forEach((fn) => fn()); cleanup = []; },
  };
}
