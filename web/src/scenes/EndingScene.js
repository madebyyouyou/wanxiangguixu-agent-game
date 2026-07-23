// 结局场景：真结局（复盘问答）/ 死亡结局（随行交流 + 回溯钟）。
import { AGENTS, AGENT_STATES, STATE_MAP } from '../data/agents.js';
import { ITEMS } from '../data/items.js';

const REVIEW_QS = [
  '茶馆那对男女为何想帮我？',
  '按茶馆男人的规则（去井边）走，为何反而会死？',
  '杜司衡为何救我？',
  '第六天米店的秤为何会崩？',
  '时空管理局知道献祭真相吗？',
];
const restSprite = (k) => `assets/images/agent/${k}_${k === 'wuyou' ? 'surprised' : 'normal'}.png`;
// 灵球状态机：模型 <state> → 该人格可用立绘（不可用则回退常态）
const emoteSprite = (k, want) => `assets/images/agent/${k}_${(AGENT_STATES[k] || []).includes(want) ? want : (k === 'wuyou' ? 'surprised' : 'normal')}.png`;

export function EndingScene(ctx) {
  const { state, scenes, agent, audio } = ctx;
  return {
    async mount(root, _c, params) {
      const seg = params.ending || { id: 'END_TRUE', title: '结局', text: '' };
      const isTrue = seg.id === 'END_TRUE';
      const p = AGENTS[state.persona] || AGENTS.queshe;
      const clockN = state.inventory['ITEM_REWIND_CLOCK']?.qty || 0;

      const reviewScreen = `
        <div class="rv-frame">
          <button class="rv-close" data-act="title" aria-label="退出">✕</button>
          <div class="rv-orb-col" style="--g:${p.glow}">
            <div class="rv-orb"><img src="${restSprite(p.key)}" onerror="this.style.display='none'"></div>
            <div class="rv-name" style="color:${p.accent}">${p.name}</div>
          </div>
          <div class="rv-chat-col">
            <div class="rv-msgs chat-body" id="rvMsgs"></div>
            <div class="rv-qs" id="rvQs">${REVIEW_QS.map((q, i) => `<button class="rv-q" data-i="${i}"><span class="rv-q-ar">→</span>${q}</button>`).join('')}</div>
            <div class="rv-inputbar"><input id="rvInput" placeholder="请输入你的问题……" /><button id="rvSend" aria-label="发送">➤</button></div>
          </div>
        </div>`;
      const deathBlock = `
        <div class="death-talk" style="--c:${p.accent};--g:${p.glow}">
          <div class="dt-head"><span class="dt-orb"><img src="${restSprite(p.key)}" onerror="this.style.display='none'"></span><span class="dt-name" style="color:${p.accent}">系统 · ${p.name}</span></div>
          <div class="dt-body" id="acBody"></div>
          <div class="dt-foot"><input id="acInput" placeholder="对${p.name}说点什么……" /><button id="acSend" style="background:${p.accent}">➤</button></div>
        </div>`;

      root.innerHTML = isTrue ? `
        <div class="ending good review-screen">
          ${reviewScreen}
        </div>` : `
        <div class="ending bad">
          <div class="ending-inner">
            <div class="ending-kicker">✕ 副本失败</div>
            <h1 class="ending-title">${seg.title}</h1>
            <p class="ending-text">${(seg.text || '').replace(/\n/g, '<br>')}</p>
            ${deathBlock}
            <div class="ending-btns">
              <button class="tbtn rewind${clockN > 0 ? '' : ' disabled'}" data-act="rewind">🕰️ 使用回溯钟${clockN > 0 ? ' ×' + clockN : '（无）'}</button>
              <button class="tbtn" data-act="restart">重新开始本副本</button>
              <button class="tbtn ghost" data-act="title">返回标题</button>
            </div>
          </div>
        </div>`;

      // 回溯钟按钮随库存实时刷新（玩家可能在死亡对话里让随行帮忙兑换回溯钟）
      const refreshRewind = () => {
        const n = state.inventory['ITEM_REWIND_CLOCK']?.qty || 0;
        const b = root.querySelector('.tbtn.rewind'); if (!b) return;
        b.classList.toggle('disabled', n <= 0);
        b.textContent = `🕰️ 使用回溯钟${n > 0 ? ' ×' + n : '（无）'}`;
      };

      // ---- 死亡结局：随行自动反应 + 可继续交流（含商城兑换）----
      if (!isTrue) {
        agent._dead = true;   // 死亡屏：让系统知道宿主已死(无论清醒值数字)，引导用回溯钟，而非"还活着、先熬一夜"
        const acBody = root.querySelector('#acBody'), input = root.querySelector('#acInput');
        const orbImg = root.querySelector('.dt-orb img');
        const setEmote = (st) => { if (orbImg && st) orbImg.src = emoteSprite(p.key, STATE_MAP[st] || 'normal'); };
        agent.uiLog = agent.uiLog || [];   // ★与局内对话框同一份持久记录：跨场景/回溯都留存
        const render = (text, kind) => { const d = document.createElement('div'); d.className = 'ac-msg ' + (kind === true ? 'me' : kind === 'sys' ? 'sys' : 'bot'); d.textContent = text; acBody.appendChild(d); acBody.scrollTop = acBody.scrollHeight; };
        const add = (text, kind) => { render(text, kind); agent.uiLog.push({ text, kind }); };   // 渲染 + 写入共享记录（修：死亡屏对话以前没记进 uiLog）
        agent.uiLog.forEach((m) => render(m.text, m.kind));   // 回放此前对话（局内/上次死亡屏）——死亡屏与局内是同一条对话线
        if (agent.uiEmote && orbImg) orbImg.src = emoteSprite(p.key, agent.uiEmote);   // 头像沿用最近一次情绪
        agent.ask({ directive: { type: '死亡', text: '' } }).then((r) => { setEmote(r.state); add(r.text, false); });
        const send = async () => {
          const v = input.value.trim(); if (!v) return; add(v, true); input.value = '';
          const r = await agent.ask({ playerInput: v }); setEmote(r.state); add(r.text, false);
          if (r.action) {                       // 随行帮忙兑换（多半是回溯钟）→ 执行并刷新按钮
            const pr = agent.applyAction(r.action);
            if (pr) {
              const it = ITEMS[pr.item_id];
              add(pr.ok ? `（系统：已兑换 ${it?.name || pr.item_id}，剩余积分 ${pr.points_after}）`
                        : `（系统：兑换未成功——${pr.reason}）`, 'sys');
              refreshRewind();
            }
          }
        };
        root.querySelector('#acSend').addEventListener('click', send);
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') send(); });
      }

      // ---- 按钮 ----
      root.querySelector('.ending-btns, .rv-close')?.addEventListener('click', async (e) => {
        const b = e.target.closest('.tbtn, .rv-close'); if (!b) return;
        const act = b.dataset.act; const persona = state.persona;
        agent._dead = false;   // 离开死亡屏（回溯/重开/返回标题）→ 清除"已死"标记
        audio.play('ui_cursor', { volume: 0.4 });
        if (act === 'rewind') {
          if ((state.inventory['ITEM_REWIND_CLOCK']?.qty || 0) <= 0) { ctx.bus.emit('toast', '你没有回溯钟——可问系统用积分兑换，或去商城'); return; }
          state.removeItem('ITEM_REWIND_CLOCK');
          state.ending = null;
          audio.play('key_event', { volume: 0.5 });
          // 回溯钟特效（huisuzhong.mp4），放完再跳回游戏
          await new Promise((res) => {
            const layer = document.createElement('div'); layer.className = 'fx-layer full';
            const vid = document.createElement('video'); vid.src = 'assets/images/fx/rewind.mp4'; vid.muted = true; vid.autoplay = true; vid.playsInline = true; vid.setAttribute('playsinline', '');
            layer.appendChild(vid); root.appendChild(layer);
            let d = false; const fin = () => { if (d) return; d = true; res(); };
            vid.addEventListener('ended', fin); vid.addEventListener('error', fin);
            try { const p = vid.play(); if (p && p.catch) p.catch(() => {}); } catch (e) {}
            setTimeout(fin, 6000);
          });
          if (seg.rewind) {
            const r = seg.rewind;
            const i = state.completed.lastIndexOf(r.to); if (i >= 0) state.completed = state.completed.slice(0, i + 1);
            const j = state.triggerLog.lastIndexOf(r.to); if (j >= 0) state.triggerLog = state.triggerLog.slice(0, j + 1);
            state.lastEvent = r.to;
            state.setTime(r.day, r.time, r.sky);
            state.location = r.loc || state.location;
            if (r.sanity != null) state.sanity = r.sanity;
          } else {
            state.sanity = Math.max(50, state.sanity);   // 通用兜底：回血复活，留在原地
          }
          agent._rewound = true;   // 回到游戏后让系统知道"刚发生回溯"（renderStateText 注入一次）
          await scenes.goto('game', { resume: true });
        } else if (act === 'restart') {
          state.reset(); state.persona = persona; await scenes.goto('game', { newGame: true });
        } else {
          state.reset(); state.persona = persona; await scenes.goto('title');
        }
      });

      // ---- 真结局：游戏复盘（全屏 sci-fi UI·灵球 + 聊天气泡 + 推荐问 + 输入框）----
      if (isTrue) {
        const msgs = root.querySelector('#rvMsgs'), rvInput = root.querySelector('#rvInput');
        const orbImg = root.querySelector('.rv-orb img');
        const setEmote = (st) => { if (orbImg && st) orbImg.src = emoteSprite(p.key, STATE_MAP[st] || 'normal'); };
        const render = (text, kind) => { const row = document.createElement('div'); row.className = 'row-msg ' + (kind === true ? 'me' : 'bot'); const m = document.createElement('div'); m.className = 'msg ' + (kind === true ? 'me' : 'bot'); m.textContent = text; row.appendChild(m); msgs.appendChild(row); msgs.scrollTop = msgs.scrollHeight; return row; };
        let busy = false;
        const askReview = async (q) => {
          if (busy) return; busy = true;
          if (q) render(q, true);
          const typing = render('……', false);
          const res = await agent.ask({ playerInput: q || '', directive: { type: '复盘', text: '' } });
          typing.remove(); setEmote(res.state); render(res.text, false);
          busy = false;
        };
        askReview('');   // 自动开场：复盘 directive（后端带真相包）→ 系统开场白
        root.querySelector('#rvQs').addEventListener('click', (e) => { const b = e.target.closest('.rv-q'); if (b) askReview(REVIEW_QS[+b.dataset.i]); });
        const send = () => { const v = rvInput.value.trim(); if (!v) return; rvInput.value = ''; askReview(v); };
        root.querySelector('#rvSend').addEventListener('click', send);
        rvInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') send(); });
      }
    },
    unmount() {},
  };
}
