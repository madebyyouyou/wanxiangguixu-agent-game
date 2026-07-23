// 主玩法场景：按原型图重排版面 + 真实美术 + 三球表情 + 光影飞入特效。
// 同时作为 StoryEngine 的 presenter（say/choice/act/agentSpeak/ending）。
import { LOCATIONS, MAP_ORDER } from '../data/locations.js';
import { ITEMS, SHOP } from '../data/items.js';
import { AGENTS, AGENT_STATES, STATE_MAP } from '../data/agents.js';
import { mountBackpack } from '../ui/Backpack.js';
import { mountOrbPet } from '../ui/OrbPet.js';
import { play as playTea } from '../minigames/TeaPouring.js';
import { play as playChase } from '../minigames/MonsterChase.js';
import { play as playEavesdrop } from '../minigames/EavesDrop.js';

const REST = { queshe: 'normal', wuyou: 'surprised', shuheng: 'normal' };
const spriteState = (p, want) => (AGENT_STATES[p] || []).includes(want) ? want : REST[p];
const spriteUrl = (p, st) => `assets/images/agent/${p}_${spriteState(p, st)}.png`;
// 灵球动画精灵图(WebP·每情绪一张·23帧·脉动序列)：idle/excited/nervous/confirm/deny/speak（对话框/聊天头像仍用上面静态 png）
const sheetUrl = (p, mood) => `assets/images/agent/${p}_${mood}.webp`;
// mp4 特效：id → 文件（FX001 孩童异常影子 / FX003 秤乱跳 / FX004 agent扫描 / 回溯钟）
const FX_FILE = { shadow: 'shadow.mp4', scale: 'tongcheng.mp4', scan: 'scan.mp4', rewind: 'rewind.mp4' };
// 回溯钟落点表：回到第 N 天清晨。cut=截断 completed 到此节点(含)之前 → 该日之后的节点重新可触发；
// run=直接重跑当日首节点(绕过 after，兼容 T06 这种"无 after、只靠 next 链"的日首节点)。
const REWIND_TARGETS = {
  1: { cut: null,  run: 'T01', loc: '主街', day: 1, time: '上午', sky: '昏黄' },
  2: { cut: 'T05', run: 'T06', loc: '祠堂', day: 2, time: '上午', sky: '昏黄' },
  3: { cut: 'T09', run: 'T10', loc: '米店', day: 3, time: '上午', sky: '昏黄' },
  4: { cut: 'T13', run: 'T14', loc: '米店', day: 4, time: '上午', sky: '昏黄' },
  5: { cut: 'T18', run: 'T19', loc: '米店', day: 5, time: '上午', sky: '昏黄' },
  6: { cut: 'T22', run: 'T23', loc: '米店', day: 6, time: '上午', sky: '昏黄' },
};
// 对白文本转 HTML：转义 + 把 \n 渲染成换行（剧情原文按段落断行用）
const escBr = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
// 对白渲染：转义 + 把系统提示「〔…〕」整段标成不同颜色，与剧情正文区分
const dlgHtml = (t) => { const h = escBr(t); const i = h.indexOf('〔'); return i < 0 ? h : h.slice(0, i) + '<span class="sys-hint-inline">' + h.slice(i) + '</span>'; };

export function GameScene(ctx) {
  const { bus, state, audio, assets, agent, engine, scenes, save } = ctx;
  let root, unsub = [], typer = null;

  const iconHtml = (icon, emoji) =>
    `<img class="ic-img" src="assets/images/icon/${icon}.png" onerror="this.style.display='none';this.nextElementSibling.style.display='inline'"><span class="ic-emoji" style="display:none">${emoji}</span>`;

  const scene = {
    async mount(el, _ctx, params = {}) {
      root = el;
      const p = AGENTS[state.persona] || AGENTS.queshe;
      root.innerHTML = `
        <div class="bg-layer" id="bg"><div class="bg-label" id="bgLabel"></div></div>
        <div class="vignette"></div>

        <div class="hud">
          <div class="hud-left">
            <button class="hud-btn map" data-panel="map">🗺️ 地图</button>
            <span class="hud-stat sanity" id="hudSanity" title="清醒值 · 点击查看升降记录">🧠 清醒 <b id="sanVal">90</b></span>
            <span class="hud-stat day" id="hudDay">Day 1 · 上午</span>
            <button class="hud-resume" id="hudResume" title="续接：跳回当初按下回溯钟的那一刻" style="display:none">⏩ 续接</button>
          </div>
          <div class="hud-right">
            <button class="hud-btn" data-panel="log" id="btnLog" title="日志（线索）">📓 日志</button>
            <button class="hud-btn" data-panel="rules" id="btnRules" title="规则簿">📜 规则簿</button>
            <button class="hud-btn" data-panel="inventory" title="背包">🎒 背包</button>
            <button class="hud-btn" data-panel="shop" title="系统商城">◈ 商城 <b id="ptsVal">20</b></button>
            <button class="hud-btn small" data-panel="menu" title="菜单">☰</button>
          </div>
        </div>

        <div class="game-main" id="gameMain">
          <div class="dialogue" id="dlg">
            <div class="dlg-avatar" id="dlgAvatar"></div>
            <div class="dlg-col"><div class="dlg-name" id="dlgName"></div><div class="dlg-text" id="dlgText"></div></div>
            <div class="dlg-advance" id="dlgAdv">▼</div>
          </div>
          <div class="choice-menu" id="choices"></div>
        </div>

        <button class="agent-orb" id="agentOrb" style="--c:${p.accent};--g:${p.glow}" title="系统 · ${p.name}　·　右键/双击=对话，左键=逗它">
          <span class="orb-core"></span>
          <div class="orb-sprite" id="orbImg" style="background-image:url('${sheetUrl(state.persona, 'idle')}')"></div>
          <span class="orb-typing" id="orbTyping"><i></i><i></i><i></i></span>
        </button>

        <div class="pickup-layer" id="pickupLayer"></div>
        <div class="drop-zone" id="dropZone" title="被丢弃的道具 · 点击拾回"></div>
        <div class="panel-host" id="panelHost"></div>
        <div class="fly-layer" id="flyLayer"></div>`;

      this._cache(root);
      engine.bind(scene);
      this._bindHud();
      // 预加载该人格全部 agent 美术：6 张情绪精灵 webp + 4 张静态立绘 png。
      // 否则逗灵球/切表情时换 background-image/src 到「未缓存的图」会先空白再出现（=点一下先消失再出现）。
      ['idle', 'excited', 'nervous', 'confirm', 'deny', 'speak'].forEach((m) => { const im = new Image(); im.src = sheetUrl(state.persona, m); });
      ['normal', 'excited', 'scared', 'surprised'].forEach((s) => { const im = new Image(); im.src = spriteUrl(state.persona, s); });
      // 稳妥型背景预热：稍候(让当前场景先加载完)再 resolve 地图上可去地点的默认底图——resolve 内部 _tryLoad 即把图拉进浏览器缓存 + 记住解析结果，之后切场景命中缓存、不必现下。
      // 只预热默认态(BG001a…BG007a)，剧情专属变体(BG002b 抬头/BG005b 年轻态/BG006c 铭文…)仍由剧情触发时再现下，避免一上来抢带宽。
      setTimeout(() => MAP_ORDER.forEach((loc) => { const bg = LOCATIONS[loc]?.bg; if (bg) assets.resolve('bg', bg); }), 600);
      this._subscribe();
      this._normalizeRedCloth();   // 修历史存档里红布被刷成 >1（回溯重发等）→ 归一到唯一
      this._rescueT18Night();      // 救援老存档：卡在 Day4·夜晚(T18 曾漏推进时间)→补推进到第五天
      this._refreshHud();
      this._renderDropZone();
      await this.setBg(LOCATIONS[state.location]?.bg || 'BG001a');
      audio.setBgm('amb_horror', { volume: 0.16 });   // 幽冷氛围配乐（BGM 专用通道·贯穿主玩法·不被小游戏打断）

      if (params.newGame) {
        const start = engine.startNode();
        setTimeout(() => engine.runNode(start.id), 200);
      } else if (params.resume) {
        const an = state.activeNode;
        if (an && engine.nodes[an] && !state.completed.includes(an)) {
          // 上次在本节点中途退出（多半卡在小玩法里）→ 重跑该节点，续上剧情，避免死锁
          setTimeout(() => this.say({ who: 'sys', text: `（继续未完成的事件）Day ${state.day} · ${state.time}…` }).then(() => engine.runNode(an)), 200);
        } else {
          setTimeout(() => this.say({ who: 'sys', text: `（继续）Day ${state.day} · ${state.time} · 你在${state.location}。` }).then(() => bus.emit('freeRoam', {})), 200);
        }
      }
    },

    unmount() { unsub.forEach((fn) => fn()); unsub = []; clearTimeout(typer); this._pet?.destroy(); audio.stopBgm(); },

    _cache(r) {
      this.bg = r.querySelector('#bg'); this.bgLabel = r.querySelector('#bgLabel');
      this.dlg = r.querySelector('#dlg'); this.dlgName = r.querySelector('#dlgName');
      this.dlgText = r.querySelector('#dlgText'); this.dlgAdv = r.querySelector('#dlgAdv');
      this.dlgAvatar = r.querySelector('#dlgAvatar');
      this.choices = r.querySelector('#choices'); this.gameMain = r.querySelector('#gameMain');
      this.panelHost = r.querySelector('#panelHost'); this.orbTyping = r.querySelector('#orbTyping');
      this.orbImg = r.querySelector('#orbImg'); this.flyLayer = r.querySelector('#flyLayer');
      this.pickupLayer = r.querySelector('#pickupLayer');
      this.dropZone = r.querySelector('#dropZone');
    },

    _bindHud() {
      const handler = (e) => { const b = e.target.closest('.hud-btn'); if (!b) return; audio.play('ui_cursor', { volume: 0.4 }); this._openPanel(b.dataset.panel); };
      root.querySelector('.hud-left').addEventListener('click', handler);
      root.querySelector('.hud-right').addEventListener('click', handler);
      root.querySelector('#hudResume')?.addEventListener('click', () => { audio.play('ui_cursor', { volume: 0.4 }); this._doResumeForward(); });
      root.querySelector('#hudSanity')?.addEventListener('click', () => { audio.play('ui_cursor', { volume: 0.4 }); this._renderSanity(); });   // 点清醒值→升降记录面板
      // 灵球桌宠：轻点=逗它(切表情+冒泡+亲密度)；拖动=抓住(慢放手回弹/快甩弹球)；右键/双击=对话。详见 ui/OrbPet.js
      this._pet = mountOrbPet(root.querySelector('#agentOrb'), {
        img: this.orbImg, audio, state, save, bus,
        sheetUrl: (mood) => sheetUrl(state.persona, mood),
        frames: 23,
        bubble: (t) => this._orbBubble(t),
        openChat: () => { audio.play('ui_cursor', { volume: 0.4 }); this._openPanel('agentchat'); },
        isTense: () => engine.busy || this.choices.classList.contains('show'),
      });
      // 首次进入：给"右键打开对话"这个不常见操作弹一次引导（看过就不再弹，存档记住）
      if (!state.flags.orbHintSeen) {
        setTimeout(() => {
          if (!root.querySelector('#agentOrb')) return;
          this._orbHint('👉 <b>右键/双击</b>和系统说话<br><span class="oh-sub">点我逗我 · 拖我玩 · 甩出去会弹</span>');
          state.flags.orbHintSeen = true; save?.autosave?.();
        }, 1600);
      }
    },
    _refreshHud() {
      root.querySelector('#hudDay').textContent = `Day ${state.day} · ${state.time}`;
      root.querySelector('#sanVal').textContent = state.sanity;
      root.querySelector('#ptsVal').textContent = state.points;
      const rb = root.querySelector('#hudResume'); if (rb) rb.style.display = state.rewindGrant ? '' : 'none';
    },
    _subscribe() {
      const flash = (sel, cls) => { const e = root.querySelector(sel); e?.classList.add(cls); setTimeout(() => e?.classList.remove(cls), 700); };
      unsub.push(bus.on('timeChanged', () => this._refreshHud()));
      unsub.push(bus.on('nodeStart', () => { this._sceneBuf = []; }));   // 新事件开始→清空"当前场景原文"缓冲（node_text 只含本事件）
      unsub.push(bus.on('rewindUse', () => this._openRewindPicker()));   // 背包点回溯钟「使用」→ 弹滚轮选日
      unsub.push(bus.on('titleAdded', ({ name }) => { audio.play('key_event', { volume: 0.4 }); this.toast(`✦ 获得称号 · ${name}`, 'good'); }));   // 解锁成就称号→金色 toast（菜单·成就称号可查看）
      unsub.push(bus.on('sanityChanged', ({ value, delta, text }) => {
        root.querySelector('#sanVal').textContent = value; flash('#hudSanity', delta < 0 ? 'down' : 'up');
        this.toast(text || `清醒值 ${delta > 0 ? '+' : ''}${delta}`, delta < 0 ? 'bad' : 'good');
      }));
      unsub.push(bus.on('pointsChanged', ({ value, delta }) => { root.querySelector('#ptsVal').textContent = value; flash('#ptsVal', 'up'); this.toast(`积分 ${delta > 0 ? '+' : ''}${delta}`, 'good'); }));
      unsub.push(bus.on('clueAdded', ({ id, text }) => { this._collectNotice('clue', id, text); this._flyTo('#btnLog', 'clue'); }));
      unsub.push(bus.on('ruleAdded', ({ id, text }) => { this._collectNotice('rule', id, text); this._flyTo('#btnRules', 'rule'); }));
      unsub.push(bus.on('itemChanged', ({ id, op, silent }) => { if (op !== 'remove' && !silent) this.toast(`获得道具 · ${ITEMS[id]?.name || id}`, 'item'); }));
      unsub.push(bus.on('unlock', ({ locs }) => state.unlock(locs)));
      unsub.push(bus.on('droppedChanged', () => this._renderDropZone()));
      // 自由行动：收起对话框
      unsub.push(bus.on('freeRoam', () => { this.dlg.className = 'dialogue'; this.dlgText.textContent = ''; this.dlgName.textContent = ''; this.dlgAvatar.style.display = 'none'; }));
      unsub.push(bus.on('sanityZero', () => { if (!state.ending) scene.ending({ id: 'END_SANITY_ZERO', title: '死亡结局 · 清醒值归零', text: '清醒值耗尽，你的自我意识被裂缝彻底侵蚀，沦为渡厄镇新的空心镇民。\n（此结局可回溯）' }); }));
      // 空闲点击反馈：点击场景但没推进任何事（自由探索，或在原地等操作——如祠堂没挂红布、下一段不触发）→ 给提示。
      // 对话进行中的点击被 say 的 onClick 消化(stopPropagation)、不会到这；弹出卡片/选项(choices.show)时不打扰。
      root.addEventListener('click', (e) => {
        if (this.choices.classList.contains('show')) return;
        // 点击的元素已从 DOM 移除（如点地图地点/面板按钮→面板随即关闭）→ 属于 UI 操作，别误判成"空闲点击"弹反馈
        if (!e.target.isConnected) return;
        if (e.target.closest('.hud, .agent-orb, .panel-host, .choice-menu, .drop-zone, .pickup-spot, .collect-notice, .fx-layer, .hang-layer, .placed-layer, .minigame-host, .closeup-layer')) return;
        const now = Date.now();
        if (this._idleAt && now - this._idleAt < 1600) return;
        this._idleAt = now;
        const an = AGENTS[state.persona]?.name || '随行';
        // 待办引导优先级：当前"等玩家动手"提示(_pendingHint·如刮青苔) > 强制推理(activeGate·可带自定义 idleHint) > 默认
        const hint = this._pendingHint
          || (state.activeGate && (state.activeGate.idleHint || `跟${an}分析一下现有的线索吧～`));
        this.toast(hint ? hint.replace('{随行}', an) : '四下无事。也许该去别的地点，或回想手里的线索。', 'clue');
        // 推理卡点(非"动手"型，如扫描铭文)且聊天框没开：玩家在场景里乱点找不到出路 → 替 ta 把聊天框打开，
        // 别让 ta 卡在"空闲反馈"循环里出不来（这类门只能靠跟随行对话解，扫描门尤其不自动弹框）
        if (state.activeGate && !this._pendingHint && !this.panelHost?.querySelector('.chatcard')) {
          setTimeout(() => this._openPanel('agentchat'), 240);
        }
      });
    },

    async setBg(id) {
      this._clearActor();   // 切景=换场 → 清掉上一场的常驻立绘(如怪物现身后玩家逃跑切到巷景)
      const url = await assets.resolve('bg', id);
      if (url) { this.bg.style.background = `center/cover no-repeat url("${url}")`; this.bgLabel.style.display = 'none'; }
      else { this.bg.style.background = assets.placeholderGradient(id); this.bgLabel.style.display = 'block'; this.bgLabel.textContent = `［场景：${assets.label(id)}］`; }
      this._renderPlacedCloth();   // 切到该地点后重绘持久放置物（如已挂的红布）
    },

    // 播放 mp4 特效覆盖层；视频播完(或兜底超时)后继续剧情。预览里视频冻结→靠兜底超时推进。
    playFx(id, { ms = 7000, full = false } = {}) {
      return new Promise((resolve) => {
        const file = FX_FILE[id] || id;
        // full=true：全屏播片（孩童异常影子等）→ 挂到 body、固定铺满视口，避免被场景容器(可能带 transform)裁切
        const layer = document.createElement('div'); layer.className = full ? 'fx-layer fs' : 'fx-layer';
        const v = document.createElement('video');
        v.src = `assets/images/fx/${file}`; v.muted = !full; if (full) v.volume = 0.85; v.autoplay = true; v.playsInline = true; v.setAttribute('playsinline', '');   // 全屏播片(孩童影子)放声音；其余特效仍静音
        layer.appendChild(v); (full ? document.body : (this.gameMain || root)).appendChild(layer);
        let done = false;
        const finish = () => { if (done) return; done = true; layer.classList.add('out'); setTimeout(() => layer.remove(), 350); resolve(); };
        v.addEventListener('ended', finish); v.addEventListener('error', finish);
        try { const pr = v.play(); if (pr && pr.catch) pr.catch(() => {}); } catch (e) {}
        setTimeout(finish, ms); // 兜底：到时强制结束（视频比这短→ended 先触发；预览冻结→到时继续）
      });
    },

    // ---- 回溯钟：滚轮选日 → 真回溯 → 续接 ----
    _openRewindPicker() {
      if (engine.busy) { this.toast('有剧情正在进行，结束后再用回溯钟', 'bad'); return; }
      if (root.querySelector('.rewind-picker')) return;
      const clockN = state.inventory['ITEM_REWIND_CLOCK']?.qty || 0;
      if (clockN <= 0) { this.toast('你没有回溯钟——去商城或问系统兑换', 'bad'); return; }
      const maxDay = Math.min(state.day, 6);
      let rows = '';
      for (let d = 1; d <= maxDay; d++) rows += `<button class="rw-day" data-day="${d}">第 ${d} 天 · 清晨</button>`;
      const ov = document.createElement('div'); ov.className = 'rewind-picker';
      ov.innerHTML = `<div class="rw-box">
          <div class="rw-title">🕰️ 回溯钟</div>
          <div class="rw-sub">滚动选择回到哪一天的清晨重新开始。<br>已收集的线索 / 规则 / 道具都会跟着你——带着记忆重来。</div>
          <div class="rw-wheel" id="rwWheel">${rows}</div>
          <div class="rw-acts"><button class="rw-btn cancel" data-act="cancel">取消</button><button class="rw-btn ok" data-act="ok" disabled>回到这一天</button></div>
          <div class="rw-clock">剩余回溯钟 ×${clockN}</div>
        </div>`;
      root.appendChild(ov);
      let sel = null;
      const wheel = ov.querySelector('#rwWheel'), okBtn = ov.querySelector('.rw-btn.ok');
      wheel.addEventListener('click', (e) => {
        const b = e.target.closest('.rw-day'); if (!b) return;
        wheel.querySelectorAll('.rw-day').forEach((x) => x.classList.remove('sel'));
        b.classList.add('sel'); sel = +b.dataset.day; okBtn.disabled = false;
        audio.play('ui_cursor', { volume: 0.3 }); b.scrollIntoView({ block: 'center' });
      });
      ov.addEventListener('click', (e) => {
        if (e.target === ov) { ov.remove(); return; }   // 点遮罩=取消
        const b = e.target.closest('.rw-btn'); if (!b) return;
        if (b.dataset.act === 'cancel') { audio.play('ui_cursor', { volume: 0.3 }); ov.remove(); }
        else if (b.dataset.act === 'ok' && sel) { ov.remove(); this._doRewind(sel); }
      });
    },

    // T19 报米数滚轮（复用回溯钟选择器外观）：选对 seg.answer 才关闭继续；每选错一次 -5 清醒值（S08，可叠加）。
    _ricePick(seg) {
      return new Promise((resolve) => {
        const NUMS = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
        let rows = '';
        for (let i = 1; i <= 10; i++) rows += `<button class="rw-day" data-n="${i}">${NUMS[i - 1]}两</button>`;
        // 玩家记下的线索（报数时可退出滚轮查看·别被困在窗里答不出来又没处查）
        const clueHtml = (state.clueLog && state.clueLog.length)
          ? state.clueLog.map((c) => `<div style="padding:5px 2px;border-bottom:1px solid rgba(184,146,63,.2)">${c.id} ${c.text}</div>`).join('')
          : '<div style="opacity:.7">（你还没记下什么线索。）</div>';
        const ov = document.createElement('div'); ov.className = 'rewind-picker';
        ov.innerHTML = `<div class="rw-box">
            <div class="rw-title">⚖️ 报米数</div>
            <div class="rw-rice-wheel">
              <div class="rw-sub">${seg.prompt || '滚动选择今天该报的米数'}</div>
              <div class="rw-wheel" id="riceWheel"><div class="rw-pad"></div>${rows}<div class="rw-pad"></div></div>
              <div class="rw-acts"><button class="rw-btn" data-act="clue">📓 看线索</button><button class="rw-btn ok" data-act="ok" disabled>就报这个数</button></div>
              <div class="rw-clock" id="riceFb">前两日是八两、六两……</div>
            </div>
            <div class="rw-rice-clue" style="display:none">
              <div class="rw-sub">你记下的线索（看完回来报数）</div>
              <div style="max-height:40vh;overflow:auto;text-align:left;font-size:13px;line-height:1.7;margin:8px 0;padding-right:4px">${clueHtml}</div>
              <div class="rw-acts"><button class="rw-btn" data-act="back">← 返回报数</button></div>
            </div>
          </div>`;
        root.appendChild(ov);
        let sel = null;
        const wheel = ov.querySelector('#riceWheel'), okBtn = ov.querySelector('.rw-btn.ok'), fb = ov.querySelector('#riceFb');
        const items = [...wheel.querySelectorAll('.rw-day')];
        // 上下垫片：让首/尾项也能滚到正中（吸附式滚轮）
        const setPads = () => { const ih = items[0].offsetHeight || 42, ph = Math.max(0, (wheel.clientHeight - ih) / 2); wheel.querySelectorAll('.rw-pad').forEach((p) => { p.style.height = ph + 'px'; p.style.flex = 'none'; }); };
        // 离垂直中心最近的项=自动选中（滚到哪选到哪、不用再点），切到新项给个轻 tick
        const centerSel = () => {
          const mid = wheel.scrollTop + wheel.clientHeight / 2; let best = null, bd = Infinity;
          items.forEach((it) => { const c = it.offsetTop + it.offsetHeight / 2, d = Math.abs(c - mid); if (d < bd) { bd = d; best = it; } });
          if (!best) return;
          if (!best.classList.contains('sel')) { items.forEach((x) => x.classList.remove('sel')); best.classList.add('sel'); audio.play('ui_cursor', { volume: 0.16 }); }
          sel = +best.dataset.n; okBtn.disabled = false;
        };
        let st = null;
        wheel.addEventListener('scroll', () => { centerSel(); clearTimeout(st); st = setTimeout(centerSel, 90); });   // CSS scroll-snap 负责吸附，这里负责"中间项即选中"
        wheel.addEventListener('click', (e) => { const b = e.target.closest('.rw-day'); if (b) b.scrollIntoView({ block: 'center', behavior: 'smooth' }); });   // 点某项→平滑滚到正中
        okBtn.addEventListener('click', () => {
          if (!sel) return;
          if (sel === seg.answer) { audio.play('key_event', { volume: 0.4 }); ov.remove(); resolve(); return; }
          // 选错：扣 5 清醒值，留在选择器继续猜（S08·可叠加）
          state.changeSanity(-5, '你报的数目不对。米店老板缓缓摇头，秤杆又翘了起来，一阵凉意顺着脊背爬上来。', '在米店报错米数');
          if (state.ending) { ov.remove(); resolve(); return; }   // 扣到归零触发死亡 → 关掉选择器交给结局
          fb.textContent = '数目不对，再想想（前两日八两、六两……）　清醒值 -5';
        });
        // 退出滚轮看线索 / 返回报数（不必答对才能查线索；返回时重算垫片——滚轮 display:none 期间量不到高度）
        const wheelView = ov.querySelector('.rw-rice-wheel'), clueViewEl = ov.querySelector('.rw-rice-clue');
        ov.querySelector('[data-act="clue"]').addEventListener('click', () => { wheelView.style.display = 'none'; clueViewEl.style.display = ''; audio.play('ui_cursor', { volume: 0.3 }); });
        ov.querySelector('[data-act="back"]').addEventListener('click', () => { clueViewEl.style.display = 'none'; wheelView.style.display = ''; audio.play('ui_cursor', { volume: 0.3 }); requestAnimationFrame(() => { setPads(); centerSel(); }); });
        requestAnimationFrame(() => { setPads(); wheel.scrollTop = 0; centerSel(); });   // 初始：垫片就位、停在第一项居中
      });
    },

    async _doRewind(day) {
      const T = REWIND_TARGETS[day]; if (!T) return;
      if ((state.inventory['ITEM_REWIND_CLOCK']?.qty || 0) <= 0) { this.toast('你没有回溯钟', 'bad'); return; }
      // 1) 快照"按下回溯钟那一刻"的进度指针（供续接快进跳回；线索/道具不入快照=始终保留当前）
      state.rewindAnchor = {
        completed: state.completed.slice(), triggerLog: (state.triggerLog || []).slice(),
        lastEvent: state.lastEvent, day: state.day, time: state.time, sky: state.sky,
      };
      state.rewindGrant = true;
      // 2) 消耗一枚回溯钟
      state.removeItem('ITEM_REWIND_CLOCK');
      // 3) 截断进度到目标日之前（线索/规则/道具/选择=带记忆重来，全部保留）
      if (T.cut) {
        const i = state.completed.lastIndexOf(T.cut); state.completed = i >= 0 ? state.completed.slice(0, i + 1) : [];
        const j = (state.triggerLog || []).lastIndexOf(T.cut); state.triggerLog = j >= 0 ? state.triggerLog.slice(0, j + 1) : [];
        state.lastEvent = T.cut;
      } else { state.completed = []; state.triggerLog = []; state.lastEvent = null; }
      state.activeNode = null;   // 清掉"进行中节点"，免得 resume 逻辑重跑旧节点
      // 4) 拨回时空（往回走不触发过夜结算）、回安全屋、回血止损、清每日flag（当天事件可重新发生）
      state.day = T.day; state.time = T.time; state.sky = T.sky; state.location = T.loc;
      const _sanBefore = state.sanity;
      state.sanity = Math.max(state.sanity, 70);
      state._logSanity(state.sanity - _sanBefore, `使用回溯钟（回到第${T.day}天）`);   // 始终记录使用回溯钟（回血可能为0，事件本身要入手账）
      state.dayFlags = {};
      bus.emit('timeChanged', { day: state.day, time: state.time, sky: state.sky });
      agent._rewound = true;     // 让随行知道"刚发生回溯"（AgentClient 注入一次）
      save?.autosave?.();
      this._refreshHud();
      this.toast(`回溯钟 · 回到第 ${T.day} 天清晨`, 'good');
      // 5) 回溯特效 → 直接重跑当日首节点（绕过 after，兼容无 after 的日首节点）
      await this.playFx('rewind', {});
      await engine.runNode(T.run);
    },

    _doResumeForward() {
      const a = state.rewindAnchor;
      if (!state.rewindGrant || !a) { this.toast('当前没有可续接的回溯点', 'bad'); return; }
      if (engine.busy) { this.toast('有剧情正在进行，结束后再续接', 'bad'); return; }
      // 续接=把"进度指针"快进回按钟那一刻；线索/规则/道具/选择保持当前（回溯途中补上的都留着）
      state.completed = (a.completed || []).slice();
      state.triggerLog = (a.triggerLog || []).slice();
      state.lastEvent = a.lastEvent;
      state.day = a.day; state.time = a.time; state.sky = a.sky;
      state.location = '祠堂';   // 回到安全的住处
      state.activeNode = null;
      state.rewindGrant = false; state.rewindAnchor = null;
      bus.emit('timeChanged', { day: state.day, time: state.time, sky: state.sky });
      save?.autosave?.();
      this._refreshHud();
      audio.play('key_event', { volume: 0.4 });
      this.setBg(LOCATIONS['祠堂']?.bg || 'BG008a').then(() =>
        this.say({ who: 'sys', text: `（续接）你回到了按下回溯钟的那一刻——第 ${state.day} 天 · ${state.time}，人在祠堂。该补的线索已经补上，接着往下走吧。` }).then(() => bus.emit('freeRoam', {}))
      );
    },

    // ---------- presenter ----------
    say(seg) {
      return new Promise((resolve) => {
        this.choices.classList.remove('show');
        const who = seg.who || 'narr';
        this.dlg.className = 'dialogue show who-' + who;
        // 头像（仅随行）
        if (who === 'agent') {
          this.dlgAvatar.style.display = 'block';
          this.dlgAvatar.innerHTML = `<img src="${spriteUrl(state.persona, seg.state || 'normal')}" onerror="this.style.display='none'">`;
        } else this.dlgAvatar.style.display = 'none';
        this.dlgName.textContent = who === 'me' ? '你' : (who === 'agent' ? (AGENTS[state.persona]?.name || '系统') : (seg.name || ''));   // 全程第二人称：玩家说话人显示「你」
        if (who === 'agent') this.dlg.style.setProperty('--agentc', AGENTS[state.persona]?.accent || '#9bd');
        const full = seg.text || '';
        // 累积"当前事件触发到此刻的剧情原文"——聊天时当 node_text 发给随行，它才接得上此时此刻（nodeStart 时清空）
        if (full) { const pre = who === 'me' ? '你：' : who === 'npc' ? (seg.name || '') + '：' : who === 'agent' ? (AGENTS[state.persona]?.name || '系统') + '：' : ''; (this._sceneBuf = this._sceneBuf || []).push(pre + full); if (this._sceneBuf.length > 8) this._sceneBuf.shift(); }
        // 长文本按句拆成多页，每次点击只翻一页，玩家看得更细（短句/对白≤一页不受影响）
        const pages = this._paginate(full);
        let pi = 0, typing = false;
        const speed = who === 'sys' ? 12 : 20;
        const renderPage = () => {
          const txt = pages[pi]; let i = 0; typing = true; this.dlgAdv.classList.remove('show');
          const tick = () => {
            if (i <= txt.length) { this.dlgText.innerHTML = dlgHtml(txt.slice(0, i++)); typer = setTimeout(tick, speed); }
            else { typing = false; this.dlgAdv.classList.add('show'); }
          };
          tick();
        };
        renderPage();
        const onClick = (e) => {
          if (e.target.closest('.choice-menu, .agent-orb, .hud, .panel-host')) return;
          e.stopPropagation();   // 对话推进的点击不冒泡到"空闲点击反馈"
          if (typing) { clearTimeout(typer); this.dlgText.innerHTML = dlgHtml(pages[pi]); typing = false; this.dlgAdv.classList.add('show'); return; }
          if (pi < pages.length - 1) { pi++; renderPage(); return; }   // 本段还有下一页→翻页
          this.gameMain.removeEventListener('click', onClick); resolve();
        };
        this.gameMain.addEventListener('click', onClick);
      });
    },

    // 把对白/旁白拆细：【只在句末标点 。！？ 断句】（禁止在逗号/顿号处断），累积到约 max 字断页。
    // 一句话再长也整句一页(不会停在逗号)；很短的连续句会合并到 max 内。max 越小每页越短。
    // ★句末标点后紧跟的右引号/右括号(」』）)〕】》"')属于本句收尾，不能被甩到下一页开头独自成句：
    //   先按 。！？ 切，再把切到下一段【开头】的连续收尾符号黏回上一段【末尾】。
    //   修 P3：布庄反馈「…乱动的。"」的右引号孤儿，以及系统提示「…思路。〕」末尾单独成页的〕。
    _paginate(text, max = 20) {
      if (!text) return [''];
      const CLOSERS = '」』）)】〕》' + '\u201D\u2019\u0022\u0027';   // 句末后要黏住的收尾符号
      const OPENC = '「『（(【〔《“‘';   // 左括/左引（判断括注是否闭合）
      const CLOSEC = '」』）)】〕》”’';   // 对应右括/右引
      const raw = String(text).split(/(?<=[。！？])/).filter((u) => u.length);
      const units = [];
      for (const u of raw) {
        let k = 0; while (k < u.length && CLOSERS.includes(u[k])) k++;   // 段首连续收尾符号的长度
        if (k && units.length) { units[units.length - 1] += u.slice(0, k); if (u.length > k) units.push(u.slice(k)); }
        else units.push(u);
      }
      // 括注内部句末标点被切开时（某段留下未闭合左括/左引）→ 把后续段并回来保持括注完整（修 P3 腰斩；布庄整句带引号仍正常分页）
      const bal = (str) => { let b = 0; for (const ch of str) { if (OPENC.includes(ch)) b++; else if (CLOSEC.includes(ch)) b--; } return b; };
      const merged = [];
      for (const u of units) {
        if (merged.length && bal(merged[merged.length - 1]) > 0) merged[merged.length - 1] += u;
        else merged.push(u);
      }
      const pages = []; let cur = '';
      for (const u of merged) {
        if (cur && (cur.length + u.length) > max) { pages.push(cur); cur = u; }
        else cur += u;
      }
      if (cur) pages.push(cur);
      return pages.length ? pages : [text];
    },

    choice(options) {
      return new Promise((resolve) => {
        // 把"当前待选项"并入场景原文(node_text)，让随行知道宿主此刻在哪几个选择间犹豫、能就此给建议
        const push = (t) => { (this._sceneBuf = this._sceneBuf || []).push(t); if (this._sceneBuf.length > 8) this._sceneBuf.shift(); };
        push('〔你正面对一个选择，可选：〕' + options.map((o) => `「${o.label}」`).join(' / '));
        this.choices.innerHTML = options.map((o) => `<button class="choice-btn" data-key="${o.key}">${o.label}</button>`).join('');
        this.choices.classList.add('show');
        const onClick = (e) => {
          const b = e.target.closest('.choice-btn'); if (!b) return; e.stopPropagation();
          audio.play('ui_cursor', { volume: 0.5 }); this.choices.removeEventListener('click', onClick); this.choices.classList.remove('show');
          const chosen = options.find((o) => o.key === b.dataset.key);
          if (chosen) push('你：（你选择了）' + chosen.label);   // 选定也记进 node_text，随行知道宿主选了哪个
          resolve(b.dataset.key);
        };
        this.choices.addEventListener('click', onClick);
      });
    },

    act(seg) {
      // 挂红布：拖红布到场景任意位置 → 挂8秒 → 8秒内拖铁钉钉住，否则掉落
      if (seg.kind === 'hangcloth') return this._hangCloth(seg);
      // T19 报米数滚轮：选对 answer 才继续；每选错一次 -5 清醒值（S08，可叠加）
      if (seg.kind === 'ricepick') return this._ricePick(seg);
      if (seg.kind === 'scrape') return this._scrapeMoss(seg);   // 刮青苔(无执行卡片)：玩家自己从背包拖匕首到青苔上
      // 真实小玩法（倒茶/追击/窃听）：seg.game 指定，未实现的回退到占位
      if (seg.kind === 'minigame' && seg.game) return this._runMinigame(seg);
      // 合成类：不再弹"操作台·合成"大卡片(遮挡场景)。改为让【背包】HUD 键脉冲提示，玩家自己开操作台拖拽合成。
      // 仍是阻塞门：合成出目标产物(expect)才继续；背包键不受 engine.busy 影响、随时可点。剧情台词(如"还得有座炉子")负责引导。
      if (seg.kind === 'craft') {
        // 防死锁：玩家可能在本门激活前就自己合成了(产物已在背包 / 该配方已合成过)→ 直接放行，不空等永不到来的 craft 事件。
        const already = seg.expect && ((seg.expect.product && state.hasItem(seg.expect.product)) || (seg.expect.sig && state.flags.crafted && state.flags.crafted[seg.expect.sig]));
        if (already) return Promise.resolve();
        return new Promise((resolve) => {
          (seg.ensure || []).forEach((id) => { if (!state.hasItem(id)) state.addItem(id); });
          const bagBtn = root.querySelector('.hud-btn[data-panel="inventory"]');
          bagBtn?.classList.add('pulse');                       // 轻提示：去开背包操作台合成
          const off = bus.on('craft', (info) => {
            const ok = !seg.expect || (seg.expect.product ? info.product === seg.expect.product : (seg.expect.sig ? info.sig === seg.expect.sig : true));
            if (!ok) return;
            off();
            // 合成成功后不立刻退背包：让玩家读完台面下方的结果文案，自己关背包再继续剧情
            this._craftThen = () => { bagBtn?.classList.remove('pulse'); resolve(); };
          });
        });
      }
      const kindLabel = { click: '操作', drag: '拖拽', minigame: '小玩法' }[seg.kind] || '操作';
      const isMini = seg.kind === 'minigame';
      return new Promise((resolve) => {
        this.choices.innerHTML = `<div class="act-card"><div class="act-tag">【${kindLabel}】${isMini ? '（占位：点击通关，后续接入真玩法）' : ''}</div><div class="act-prompt">${seg.prompt}</div><button class="choice-btn act-go" data-go="1">${isMini ? '进入并通关 ▶' : '执行 ▶'}</button></div>`;
        this.choices.classList.add('show');
        const onClick = (e) => { if (!e.target.closest('.act-go')) return; e.stopPropagation(); audio.play('ui_cursor', { volume: 0.5 }); this.choices.removeEventListener('click', onClick); this.choices.classList.remove('show'); this.choices.innerHTML = ''; resolve(); };
        this.choices.addEventListener('click', onClick);
      });
    },

    // 刮青苔（无执行卡片）：提示玩家自己从背包把匕首拖到青苔上；匕首是工具不消耗(返回 'keep')，刮完放行
    _scrapeMoss(seg) {
      return new Promise((resolve) => {
        this._pendingHint = seg.idleHint || '想办法清理一下这层青苔吧～';
        const bagBtn = root.querySelector('.hud-btn[data-panel="inventory"]');
        bagBtn?.classList.add('pulse');
        this._sceneDrop = (id) => {
          if (id !== (seg.item || 'ITEM_DAGGER')) return false;
          audio.play('door_scratch', { volume: 0.5 });
          this._pendingHint = null; this._sceneDrop = null; bagBtn?.classList.remove('pulse');
          resolve();
          return 'keep';
        };
      });
    },

    agentThinking(on) { this.orbTyping.classList.toggle('show', !!on); root.querySelector('#agentOrb').classList.toggle('thinking', !!on); this._pet?.setBusy(!!on); },
    async agentSpeak(text, stateName) {
      const st = STATE_MAP[stateName] || 'normal';   // 静态头像表情（兴奋/紧张/肯定→normal/否定）
      // 动画灵球情绪：直接按模型原始 <state> 映射，区分「肯定→confirm 点头」与「无态→speak 普通说话」（不能用塌缩后的 st，否则中性回复也会误播 confirm）
      const mood = { 兴奋: 'excited', 紧张: 'nervous', 肯定: 'confirm', 否定: 'deny' }[stateName] || 'speak';
      this._pet?.setBusy(true); this._pet?.setMood(mood, true);   // 说话期间灵球播对应情绪/说话动画(hold)
      // 程序触发的系统发言(开场/引导/扫描等，走主对话框)也记进对话记录，右键聊天框可回看
      if (text) { (agent.uiLog = agent.uiLog || []).push({ text, kind: false }); agent.uiEmote = st; }
      await this.say({ who: 'agent', text, state: st });
      this._pet?.idle(); this._pet?.setBusy(false);
    },

    // agentGate 打开：提示玩家进聊天框推理，并自动弹开聊天框（想通了才放行；离线已在引擎侧自动放行、不会走到这）
    gateOpen(seg) {
      const an = AGENTS[state.persona]?.name || '随行';
      if (seg && seg.idleHint) {   // 自定义提示的门(如扫描铭文)：只给提示、要玩家自己打开对话框去问，不自动弹
        this.toast(seg.idleHint.replace('{随行}', an), 'clue');
      } else {
        this.toast('〔和系统聊聊你的推理——想通了才能继续〕', 'clue');
        setTimeout(() => this._openPanel('agentchat'), 320);
      }
    },

    // 逗灵球：左键点一下→循环切表情 + 弹跳 + 冒个小泡，2.6s 后回常态
    _pokeOrb() {
      const states = AGENT_STATES[state.persona] || ['normal'];
      this._pokeI = ((this._pokeI ?? -1) + 1) % states.length;
      if (this.orbImg) this.orbImg.src = spriteUrl(state.persona, states[this._pokeI]);
      const orb = root.querySelector('#agentOrb');
      if (orb) { orb.classList.remove('poke'); void orb.offsetWidth; orb.classList.add('poke'); }
      const quips = ['？', '！', '…', '嗯？', '戳我干嘛~', '在呢', '哎', '嗷'];
      this._orbBubble(quips[(this._pokeI + (this._quipN = (this._quipN || 0) + 1)) % quips.length]);
      audio.play('ui_cursor', { volume: 0.3 });
      clearTimeout(this._pokeRevert);
      this._pokeRevert = setTimeout(() => { if (this.orbImg) this.orbImg.src = spriteUrl(state.persona, 'normal'); }, 2600);
    },
    _orbBubble(text) {
      const orb = root.querySelector('#agentOrb'); if (!orb) return;
      const b = document.createElement('div'); b.className = 'orb-bubble'; b.textContent = text; orb.appendChild(b);
      setTimeout(() => b.classList.add('show'), 10);
      setTimeout(() => { b.classList.remove('show'); setTimeout(() => b.remove(), 300); }, 1100);
    },
    // 灵球操作引导气泡（停留较久、可点关；用于"右键对话"这类不常见操作）
    _orbHint(html, ms = 5500) {
      const orb = root.querySelector('#agentOrb'); if (!orb) return;
      orb.querySelector('.orb-hint')?.remove();
      const h = document.createElement('div'); h.className = 'orb-hint'; h.innerHTML = html; orb.appendChild(h);
      const close = () => { h.classList.add('out'); setTimeout(() => h.remove(), 500); };
      const t = setTimeout(close, ms);
      h.addEventListener('click', (e) => { e.stopPropagation(); clearTimeout(t); close(); }); // 点提示本身可提前关掉
    },
    // 线索/规则收录：弹出卡片，内容按打字机逐字输出，稍后自动淡出
    _collectNotice(kind, id, text) {
      let wrap = root.querySelector('#collectNotice');
      if (!wrap) { wrap = document.createElement('div'); wrap.id = 'collectNotice'; wrap.className = 'collect-notice'; (this.gameMain || root).appendChild(wrap); }
      const label = kind === 'clue' ? '线索收录' : '规则收录';
      const card = document.createElement('div'); card.className = 'cn-card ' + kind;
      card.innerHTML = `<div class="cn-head">✦ ${label} · ${id}</div><div class="cn-body"></div>`;
      wrap.appendChild(card);
      setTimeout(() => card.classList.add('show'), 20);
      const body = card.querySelector('.cn-body'); const full = text || ''; let i = 0;
      const tick = () => { if (i <= full.length) { body.textContent = full.slice(0, i++); setTimeout(tick, 180); } };   // 收录打字机放慢到 ≈5.5 字/秒，看得清
      tick();
      audio.play(kind === 'clue' ? 'key_event' : 'droplet', { volume: 0.3 });
      setTimeout(() => { card.classList.add('out'); setTimeout(() => card.remove(), 500); }, full.length * 180 + 2200);   // 打完再留 ~2.2s 供阅读
    },

    // presenter：特写「放大镜」浮层；可带 pickup（拾取按钮）。mandatory=必须拾取才能继续。
    closeup(seg) {
      return new Promise(async (resolve) => {
        // seg.icon → 引用道具图标(icon/)，否则 seg.id → 特写(char/)
        const url = await assets.resolve(seg.icon ? 'icon' : 'char', seg.icon || seg.id);
        if (!url && !seg.pickup) { resolve(); return; }   // 无美术且非拾取 → 跳过，不打断
        const it = seg.pickup ? ITEMS[seg.pickup] : null;
        const layer = document.createElement('div'); layer.className = 'closeup-layer' + (seg.overlay ? ' overlay' : '');   // overlay=透明立绘直接叠在场景上(无相框)，用于怪物现身
        const foot = seg.pickup
          ? `<button class="closeup-pick">⟡ 拾取 ${it?.name || ''}</button>${seg.mandatory ? '' : '<div class="closeup-hint">点击别处放回</div>'}`
          : '<div class="closeup-hint">🔍 点击关闭</div>';
        layer.innerHTML = `<div class="closeup-frame${seg.overlay ? ' overlay' : ''}">${url ? `<img src="${url}" alt="">` : '<div class="closeup-noart">' + (it?.name || '') + '</div>'}${foot}</div>`;
        root.appendChild(layer);
        void layer.offsetWidth; layer.classList.add('show');
        audio.play('ui_cursor', { volume: 0.35 });
        const done = () => { layer.classList.remove('show'); setTimeout(() => layer.remove(), 300); resolve(); };
        if (seg.pickup) {
          layer.querySelector('.closeup-pick').addEventListener('click', (e) => { e.stopPropagation();
            // 幂等：已持有就别再发（回溯/重跑该节点时不重复发道具，避免红布等唯一物刷成 ×2）。红布挂着也算持有。
            const owned = state.hasItem(seg.pickup) || (seg.pickup === 'ITEM_RED_CLOTH' && state.clothPlacement);
            if (!owned) state.addItem(seg.pickup);
            audio.play('key_event', { volume: 0.4 }); done(); });
          if (!seg.mandatory) layer.addEventListener('click', (e) => { if (e.target === layer) done(); });
        } else { layer.addEventListener('click', done); }
      });
    },

    // presenter：常驻立绘——透明立绘叠在场景上(对话框下层·z15<game-main 40)，点击穿透以推进对话。
    // 与 closeup(模态·暗屏·必须点击关闭) 区分：actor 是「角色站在场景里」，剧情照常一句句往下播；
    // 直到切 bg(setBg 自动清) 或 {t:'actor',clear:true} 才淡出。
    async actor(seg) {
      if (seg.clear) { this._clearActor(); return; }
      const url = await assets.resolve('char', seg.id);
      if (!url) return;   // 无美术 → 不打断，直接跳过
      this._clearActor();
      const layer = document.createElement('div'); layer.className = 'actor-layer' + (seg.pos ? ' ' + seg.pos : '');   // pos:'right'→靠右底边贴底(如杜司衡叩秤)
      layer.innerHTML = `<img src="${url}" alt="">`;
      root.appendChild(layer); this._actorLayer = layer;
      void layer.offsetWidth; layer.classList.add('show');
    },
    _clearActor() {
      const l = this._actorLayer; this._actorLayer = null;
      if (l) { l.classList.remove('show'); setTimeout(() => l.remove(), 420); }
    },

    // presenter：场景底图上可点击拾取的道具（铁钉/精铁等），点击才收入背包后继续
    pickup(seg) {
      return new Promise((resolve) => {
        const it = ITEMS[seg.item];
        const spot = document.createElement('button');
        spot.className = 'pickup-spot floaty';
        spot.innerHTML = `<span class="pk-glow"></span><span class="pk-ic">${iconHtml(it?.icon, '✦')}</span><span class="pk-label">${seg.label || ('拾取 ' + (it?.name || ''))}</span>`;
        this.pickupLayer.appendChild(spot);
        // 整页飘浮：道具在场景内缓慢游走、碰边反弹（不再固定一处）。rAF 在预览里冻结、真机才动。
        let x = seg.x ?? (16 + Math.random() * 68), y = seg.y ?? (22 + Math.random() * 52);
        const a0 = Math.random() * Math.PI * 2; let vx = Math.cos(a0), vy = Math.sin(a0);
        const SPD = 6, MX = 9, MY = 13;   // 速度(%/秒) + 上下左右边距(%)
        spot.style.left = x + '%'; spot.style.top = y + '%';
        let raf = 0, last = performance.now();
        const drift = (t) => {
          if (!spot.isConnected) return;   // 元素被移除(拾取/切场景)→自停，防 rAF 泄漏
          const dt = Math.min((t - last) / 1000, 0.1); last = t;
          x += vx * SPD * dt; y += vy * SPD * dt;
          if (x < MX) { x = MX; vx = Math.abs(vx); } if (x > 100 - MX) { x = 100 - MX; vx = -Math.abs(vx); }
          if (y < MY) { y = MY; vy = Math.abs(vy); } if (y > 100 - MY) { y = 100 - MY; vy = -Math.abs(vy); }
          spot.style.left = x + '%'; spot.style.top = y + '%';
          raf = requestAnimationFrame(drift);
        };
        raf = requestAnimationFrame(drift);
        let taken = false;
        spot.addEventListener('click', (e) => {
          e.stopPropagation();
          if (taken) return; taken = true;   // 防连点：300ms 移除延迟内再点会重复 addItem（连点两下拿两块精铁的 bug）
          cancelAnimationFrame(raf);
          state.addItem(seg.item); audio.play('key_event', { volume: 0.4 });
          spot.classList.add('got'); setTimeout(() => spot.remove(), 300);
          resolve();
        });
      });
    },

    // 挂红布：拖红布到场景任意位置 → 挂住8秒 → 8秒内拖铁钉到红布上钉死，否则红布掉落重来
    // 挂红布（解谜，无引导文案、不自造道具）：玩家从背包把「红布」拖到场景里挂住，
    // 红布只撑 8 秒——这期间再从背包把「铁钉」拖到红布上钉死；超时红布被风吹落(弹 fallText 反馈)、丢回场景可拾回重来。
    // 道具来源＝背包拖出场景（见 Backpack onUp 的 onSceneDrop 钩子 + _renderInventory）。
    _hangCloth() {
      return new Promise((resolve) => {
        const layer = document.createElement('div'); layer.className = 'hang-layer'; (this.gameMain || root).appendChild(layer);
        let clothEl = null, timer = null, done = false;
        const gm = () => (this.gameMain || root).getBoundingClientRect();
        const dropCloth = () => { if (!state.dropped) state.dropped = []; if (!state.dropped.includes('ITEM_RED_CLOTH')) state.dropped.push('ITEM_RED_CLOTH'); bus.emit('droppedChanged', {}); };
        const hang = (x, y) => {
          const g = gm();
          clothEl = document.createElement('div'); clothEl.className = 'hung-cloth show';
          clothEl.style.left = (x - g.left) + 'px'; clothEl.style.top = (y - g.top) + 'px';
          clothEl.innerHTML = iconHtml('ICN_RED_CLOTH', '🟥');
          layer.appendChild(clothEl); audio.play('ui_cursor', { volume: 0.3 });
          timer = setTimeout(() => { if (done) return; clothEl.classList.add('fall'); dropCloth(); this.toast(ITEMS.ITEM_RED_CLOTH.fallText, 'bad'); setTimeout(() => { clothEl?.remove(); clothEl = null; }, 500); }, 8000);
        };
        const fix = (x, y) => {
          if (!clothEl || done) return false;
          const cr = clothEl.getBoundingClientRect();
          if (!(x >= cr.left - 64 && x <= cr.right + 64 && y >= cr.top - 64 && y <= cr.bottom + 64)) return false;
          done = true; clearTimeout(timer); clothEl.classList.add('fixed');
          // 红布固定在此位置 → 记录放置（持久显示·可点击取回）；挂着的夜晚不扣清醒值
          state.clothPlacement = { loc: state.location, x: parseFloat(clothEl.style.left) || 0, y: parseFloat(clothEl.style.top) || 0 };
          bus.emit('clothChanged', { level: state.redClothLevel });
          audio.play('key_event', { volume: 0.4 });
          setTimeout(() => { this._sceneDrop = null; layer.remove(); this._renderPlacedCloth(); resolve(); }, 750);
          return true;
        };
        // 背包拖出的道具落到场景 → 红布:挂住 / 铁钉:钉死（消耗由 Backpack 端 removeItem 处理）
        this._sceneDrop = (id, x, y) => {
          if (id === 'ITEM_RED_CLOTH' && !clothEl) { hang(x, y); return true; }
          if (id === 'ITEM_NAIL' && clothEl && !done) return fix(x, y);
          return false;
        };
      });
    },

    // 红布持久放置物：挂好后固定在所挂位置；回到该地点重新显示，点击取回背包（取回后当晚没挂会扣清醒值）
    _renderPlacedCloth() {
      const host = this.gameMain; if (!host) return;
      let layer = host.querySelector('.placed-layer');
      if (!layer) { layer = document.createElement('div'); layer.className = 'placed-layer'; host.appendChild(layer); }
      layer.innerHTML = '';
      const pc = state.clothPlacement;
      if (!pc || pc.loc !== state.location) return;     // 不在所挂地点 → 不显示
      const el = document.createElement('div'); el.className = 'placed-cloth';
      el.style.left = pc.x + 'px'; el.style.top = pc.y + 'px';
      el.innerHTML = iconHtml('ICN_RED_CLOTH', '🟥') + '<span class="pc-hint">点击取回</span>';
      el.title = '红布（已挂在门头 · 点击取回）';
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        state.addItem('ITEM_RED_CLOTH'); state.clothPlacement = null; save?.autosave?.();
        el.remove(); audio.play('ui_cursor', { volume: 0.3 });
        this.toast('你取下了红布。今夜若不再挂上，门头就空着了。', 'clue');
      });
      layer.appendChild(el);
    },

    // 红布唯一性归一：背包数 +（是否挂着）总和应 ≤1。修历史存档被回溯重发/重跑节点刷出的多块红布。
    _normalizeRedCloth() {
      const inv = state.inventory, q = (inv['ITEM_RED_CLOTH'] && inv['ITEM_RED_CLOTH'].qty) || 0;
      if (state.clothPlacement) { if (q > 0) { delete inv['ITEM_RED_CLOTH']; bus.emit('itemChanged', { id: 'ITEM_RED_CLOTH', op: 'remove' }); } }   // 已挂→背包不该再有
      else if (q > 1) { inv['ITEM_RED_CLOTH'] = { qty: 1, placed: false }; bus.emit('itemChanged', { id: 'ITEM_RED_CLOTH', op: 'remove' }); }                 // 没挂却有多块→只留一块
    },
    // 救援老存档：夜晚剧情节点曾漏推进时间→卡在该夜被 S03 反复扣。检测到就补推进到次日上午。
    _rescueT18Night() {
      if (state.completed.includes('T18') && !state.completed.includes('T19') && state.day === 4 && state.time === '夜晚') {
        state.setTime(5, '上午', '昏黄');   // T18 第四夜 → 第五天
      } else if (state.completed.includes('T22') && !state.completed.includes('T23') && !state.completed.includes('T23_NOFACE') && state.day === 5 && state.time === '夜晚') {
        state.setTime(6, '上午', '昏黄');   // T22 第五夜 → 第六天
      }
    },

    // 平时（非 T05 挂布puzzle）把红布从背包拖到祠堂场景 → 直接重新挂上（初次仪式已在 T05 学会，无需再走8s+钉子）
    _defaultSceneDrop(id, x, y) {
      if (id === 'ITEM_RED_CLOTH' && state.location === '祠堂') {
        const g = (this.gameMain || root).getBoundingClientRect();
        state.clothPlacement = { loc: '祠堂', x: x - g.left, y: y - g.top };
        this._renderPlacedCloth(); save?.autosave?.();
        audio.play('key_event', { volume: 0.35 });
        this.toast('红布重新挂上了门头。', 'good');
        return true;   // 被消化 → Backpack 端会把红布从背包移除（变为放置物）
      }
      return false;    // 其它情况不接住 → 走原丢弃逻辑
    },

    // 运行真实小玩法：挂载全屏覆盖层、等待玩法 resolve、按结果给积分
    async _runMinigame(seg) {
      if (seg.game === 'chase') { state.flags = state.flags || {}; state.flags.chaseUnlocked = true; }   // 主线触发过怪物追击 → 解锁商城「赚取积分·再战怪物追击」
      const games = { tea: playTea, chase: playChase, eavesdrop: playEavesdrop };
      const fn = games[seg.game];
      if (!fn) { await this.say({ who: 'sys', text: '（该玩法尚未接入，自动通过本段）' }); return; }
      const host = document.createElement('div');
      root.appendChild(host);
      audio.stopAllLoops();   // 清掉剧情环境音（木屋/T16）
      audio.pauseBgm();       // 暂停主玩法配乐，让位给小游戏自己的音
      let result = null;
      try { result = await fn(host, ctx); } catch (e) { console.error('[minigame]', e); }
      host.remove();
      audio.resumeBgm();      // 小游戏结束 → 恢复主玩法配乐（修：玩法后配乐中断的 bug）
      // 玩法内清醒值归零（如追击累计失败扣到 0）→ 触发死亡结局，并不再继续本节点后续段。
      // 带上"回到当天清晨"的回溯点（小游戏节点多半无 after，否则回溯后无法重新触发=死锁）。
      if ((result?.result === 'dead' || state.sanity <= 0) && !state.ending) {
        const rt = REWIND_TARGETS[state.day] || REWIND_TARGETS[1];
        await this.ending({
          id: 'END_SANITY_ZERO', title: '死亡结局 · 清醒值归零',
          text: '清醒值耗尽，你的自我意识被裂缝彻底侵蚀，沦为渡厄镇新的空心镇民。\n（此结局可回溯）',
          rewind: { to: rt.cut || rt.run, loc: rt.loc, day: rt.day, time: rt.time, sky: rt.sky, sanity: 90 },
        });
        return;
      }
      // 积分奖励
      if (seg.game === 'tea' && result) { const pc = result.perfectCount || 0; if (pc >= 3) state.changePoints(15); else if (pc >= 2) state.changePoints(10); }
      else if (seg.game === 'eavesdrop' && result?.result === 'success') state.changePoints(15);
    },

    async ending(seg) {
      state.ending = seg.id; save.autosave(); audio.stopAllLoops();
      audio.play(seg.id === 'END_TRUE' ? 'key_event' : 'fail');
      await scenes.goto('ending', { ending: seg });
    },

    // ---------- 光影飞入 ----------
    _flyTo(sel, kind) {
      const btn = root.querySelector(sel); if (!btn || !this.flyLayer) return;
      const tr = btn.getBoundingClientRect();
      const sr = this.dlg.getBoundingClientRect();
      const x0 = sr.left + sr.width / 2, y0 = sr.top + 20;
      const mote = document.createElement('div'); mote.className = 'fly-mote ' + kind;
      mote.style.left = x0 + 'px'; mote.style.top = y0 + 'px';
      this.flyLayer.appendChild(mote);
      void mote.offsetWidth;
      mote.style.transition = 'transform .85s cubic-bezier(.5,-0.3,.25,1), opacity .85s ease-in';
      mote.style.transform = `translate(${tr.left + tr.width / 2 - x0}px, ${tr.top + tr.height / 2 - y0}px) scale(.25)`;
      mote.style.opacity = '0.15';
      setTimeout(() => { mote.remove(); btn.classList.add('got'); setTimeout(() => btn.classList.remove('got'), 800); }, 880);
    },

    // ---------- 面板 ----------
    _openPanel(name) {
      const m = { menu: '_renderMenu', map: '_renderMap', log: '_renderLog', rules: '_renderRules', inventory: '_renderInventory', shop: '_renderShop', agentchat: '_renderAgentChat' }[name];
      if (m) this[m]();
    },
    _closePanel() { root.querySelector('#agentOrb')?.classList.remove('orb-chatting'); this._pet?.park(false); this.panelHost.className = 'panel-host'; this.panelHost.innerHTML = ''; },
    _panel(title, bodyHtml, cls = '') {
      this.panelHost.className = 'panel-host show' + (cls.includes('sidebar') ? ' sidebar' : '');
      this.panelHost.innerHTML = `<div class="panel ${cls}"><div class="panel-head"><h3>${title}</h3><span class="panel-x">✕</span></div><div class="panel-body">${bodyHtml}</div></div>`;
      this.panelHost.querySelector('.panel-x').addEventListener('click', () => { audio.play('ui_cursor', { volume: 0.3 }); this._closePanel(); });
      this.panelHost.addEventListener('mousedown', (e) => { if (e.target === this.panelHost) this._closePanel(); });
      return this.panelHost.querySelector('.panel-body');
    },

    _renderMap() {
      root.querySelector('.hud-btn.map')?.classList.remove('pulse');
      const items = MAP_ORDER.filter((l) => state.unlocked.includes(l)).map((l) => {
        const cur = l === state.location;
        return `<button class="map-loc ${cur ? 'cur' : ''}" data-loc="${l}" ${engine.busy ? 'disabled' : ''}><span class="map-loc-name">${l}</span></button>`;
      }).join('');
      const body = this._panel('地图 · 前往', `<div class="map-grid">${items}</div><p class="panel-note">${engine.busy ? '（有剧情进行中，结束后才能移动）' : '选择一个地点前往，已解锁地点随剧情增加。'}</p>`, 'panel-map');
      body.querySelectorAll('.map-loc').forEach((b) => b.addEventListener('click', async () => { if (engine.busy) return; const loc = b.dataset.loc; this._closePanel(); audio.play('ui_cursor', { volume: 0.4 }); await engine.enter(loc); }));
    },

    // 用真实美术底图的面板（日志卷轴 / 规则簿皮书 / 背包木框）
    _artPanel(art, innerHtml, cls) {
      this.panelHost.className = 'panel-host show art';
      this.panelHost.innerHTML = `<div class="art-panel ${cls}">
        <img class="art-bg" src="assets/images/ui/${art}.webp">
        <img class="art-exit" src="assets/images/ui/exit.webp" onerror="this.outerHTML='<span class=\\'art-exit art-exit-x\\'>✕</span>'">
        <div class="art-inner">${innerHtml}</div></div>`;
      this.panelHost.querySelector('.art-exit')?.addEventListener('click', () => { audio.play('ui_cursor', { volume: 0.3 }); this._closePanel(); });
      this.panelHost.addEventListener('mousedown', (e) => { if (e.target === this.panelHost) this._closePanel(); });
      return this.panelHost.querySelector('.art-inner');
    },

    _renderLog() {
      const clues = state.clueLog.length ? state.clueLog.map((c) => `<li><b>${c.id}</b> ${c.text}</li>`).join('') : '<li class="empty">（暂无线索，多探索吧）</li>';
      this._artPanel('log_panel', `<div class="art-title">日 志 · 线 索</div><ul class="art-list">${clues}</ul>`, 'art-log');
    },
    _renderRules() {
      const MARKS = ['真', '假', '待验证'];
      const rules = state.rules.length
        ? state.rules.map((r) => `<li class="rule-row"><div class="rule-text"><b>${r.id}</b> ${r.text}</div><div class="rule-marks">${MARKS.map((m) => `<button class="rule-mark mk-${m} ${r.mark === m ? 'on' : ''}" data-id="${r.id}" data-mark="${m}">${m}</button>`).join('')}</div></li>`).join('')
        : '<li class="empty">（暂无规则。多在镇上探索、与人交谈来收录规则。）</li>';
      // 规则簿标题已印在美术图上，不再另加标题。玩家可自行标记每条规则真伪。
      const body = this._artPanel('rulebook', `<ul class="art-list rule-list">${rules}</ul>`, 'art-rulebook');
      body.querySelectorAll('.rule-mark').forEach((b) => b.addEventListener('click', () => {
        state.markRule(b.dataset.id, b.dataset.mark); audio.play('ui_cursor', { volume: 0.3 }); this._renderRules();
      }));
    },
    _renderInventory() {
      // 真实背包 + 操作台（拖拽自动合成），见 ui/Backpack.js
      // onSceneDrop：把道具从背包拖到场景松手时调用（挂红布等）；onClose：关背包时回调（合成后继续剧情）
      mountBackpack(this.panelHost, ctx, {
        onSceneDrop: (id, x, y) => (this._sceneDrop ? this._sceneDrop(id, x, y) : this._defaultSceneDrop(id, x, y)),
        onClose: () => { if (this._craftThen) { const f = this._craftThen; this._craftThen = null; f(); } },
      });
    },

    _renderShop() {
      const stockUsed = state.flags.shopBought || {};
      const rows = SHOP.map((s) => {
        const it = ITEMS[s.id]; const left = s.stock === Infinity ? '∞' : (s.stock - (stockUsed[s.id] || 0));
        const sold = left !== '∞' && left <= 0; const poor = state.points < s.price;
        return `<div class="shop-row"><div class="shop-ic">${iconHtml(it.icon, '◈')}</div>
          <div class="shop-info"><div class="shop-name">${it.name} <span class="shop-stock">库存${left}</span></div><div class="shop-eff">${it.effect || ''}</div></div>
          <button class="shop-buy" data-id="${s.id}" ${sold || poor ? 'disabled' : ''}>${sold ? '已售罄' : (poor ? '积分不足' : `${s.price} 分 兑换`)}</button></div>`;
      }).join('');
      // 赚取积分区：初始【整块不出现】(用户："初始不要写东西")；主线触发过怪物追击(chaseUnlocked)后才冒出来、固定一条"再战怪物追击"
      const earnSection = (state.flags && state.flags.chaseUnlocked)
        ? `<div class="menu-sect">赚取积分</div>
          <div class="shop-row"><div class="shop-ic">🏃</div>
          <div class="shop-info"><div class="shop-name">再战「怪物追击」</div><div class="shop-eff">撑过 60 秒 · 拾「渡」字红布换积分 · 每局 -5 清醒值（失败也扣·扣到 0 即死亡，自负风险）</div></div>
          <button class="shop-buy" id="earnChase">去挑战</button></div>
          <div class="menu-sect">兑换道具</div>`
        : '';
      const body = this._panel('系统商城', `<div class="shop-pts">当前积分：<b id="shopPts">${state.points}</b></div>${earnSection}<div class="shop-list">${rows}</div>`, 'panel-shop');
      body.querySelectorAll('.shop-buy[data-id]').forEach((b) => b.addEventListener('click', () => {
        const r = state.purchase(b.dataset.id, 1);   // 与模型购买共用同一入口
        if (r.ok) audio.play('key_event', { volume: 0.4 });
        else { this.toast(r.reason, 'bad'); return; }
        this._renderShop();
      }));
      body.querySelector('#earnChase')?.addEventListener('click', () => { this._closePanel(); this._replayChase(); });
    },

    // 商城「赚取积分」：再战怪物追击。每局先扣 5 清醒值(失败也扣)；撑过 60 秒按拾得红布结算积分。
    // scoreMode=true → MonsterChase 走练习分支(不发剧情结算/P_GAIN_03、失败不再额外扣清醒)。
    // 清醒≤5 也允许打、自负死亡风险(用户定)：先扣 5(失败也扣)；若扣到归零→changeSanity 已 emit sanityZero→死亡结局(可重开/回溯)，return 不再开追击。
    async _replayChase() {
      if (engine.busy) { this.toast('有剧情正在进行，结束后再来', 'bad'); return; }
      const COST = 5, before = state.points;
      state.changeSanity(-COST, '再战怪物追击（练手赚积分）', '嵌入玩法·怪物追击练习');
      if (state.sanity <= 0) return;
      const host = document.createElement('div'); root.appendChild(host);
      audio.stopAllLoops(); audio.pauseBgm();
      try { await playChase(host, { ...ctx, scoreMode: true }); } catch (e) { console.error('[replayChase]', e); }
      host.remove(); audio.resumeBgm();
      const gained = state.points - before;
      this.toast(gained > 0 ? `这一局赚到 ${gained} 积分` : `没拿到积分（清醒值 -${COST}）`, gained > 0 ? 'good' : 'clue');
      this._openPanel('shop');   // 回商城，方便继续练或兑换
    },

    _renderAgentChat() {
      const p = AGENTS[state.persona] || AGENTS.queshe;
      this.panelHost.className = 'panel-host show sidebar';
      root.querySelector('#agentOrb')?.classList.add('orb-chatting'); this._pet?.park(true);   // 灵球钉到左下原地上下跳、不漂移不挡框（关闭时 _closePanel 复位）
      this.panelHost.innerHTML = `<aside class="chatcard" style="--accent:${p.accent};--glow:${p.glow};--accent-rgb:${p.accentRgb || '120,140,160'}">
        <div class="chat-head"><div class="chat-avatar"><img src="${spriteUrl(state.persona, 'normal')}" onerror="this.style.display='none'"></div>
          <div class="head-txt"><h3 style="color:${p.accent}">系统 · ${p.name}</h3></div><span class="x panel-x">✕</span></div>
        <div class="ac-note" style="padding:4px 0 8px;">内容由 AI 生成，仅供参考</div>
        <div class="chat-body" id="acBody"></div>
        <div class="chat-foot"><input id="acInput" placeholder="对${p.name}说点什么……" /><button class="send" id="acSend">➤</button></div>
        <div class="ac-note">系统 · 真模型对话（后端不可用时自动离线兜底）</div></aside>`;
      this.panelHost.querySelector('.panel-x').addEventListener('click', () => this._closePanel());
      this.panelHost.addEventListener('mousedown', (e) => { if (e.target === this.panelHost) this._closePanel(); });
      const card = this.panelHost.querySelector('.chatcard');
      const acBody = this.panelHost.querySelector('#acBody'), input = this.panelHost.querySelector('#acInput');
      const headAvatar = this.panelHost.querySelector('.chat-avatar img');
      agent.uiLog = agent.uiLog || [];        // ★对话记录存在 agent 上：跨场景/回溯/重开聊天框都留存
      // 统一气泡行（与主神空间试聊同结构）：bot 带 mini-orb(定格该条 state)、me/sys 无球
      const rowFor = (text, kind, mood) => {
        const row = document.createElement('div');
        if (kind === 'sys') { row.className = 'row-msg sys'; const m = document.createElement('div'); m.className = 'msg sys'; m.textContent = text; row.appendChild(m); return row; }
        row.className = 'row-msg ' + (kind === true ? 'me' : 'bot');
        if (kind !== true) { const orb = document.createElement('div'); orb.className = 'mini-orb'; orb.innerHTML = `<img src="${spriteUrl(state.persona, mood || 'normal')}" onerror="this.remove()">`; row.appendChild(orb); }
        const m = document.createElement('div'); m.className = 'msg ' + (kind === true ? 'me' : 'bot'); m.textContent = text; row.appendChild(m);
        return row;
      };
      const render = (text, kind, mood) => { acBody.appendChild(rowFor(text, kind, mood)); acBody.scrollTop = acBody.scrollHeight; };
      const add = (text, kind, mood) => { render(text, kind, mood); agent.uiLog.push({ text, kind, mood }); };
      agent.uiLog.forEach((m) => render(m.text, m.kind, m.mood));   // 回放历史
      if (agent.uiEmote && headAvatar) headAvatar.src = spriteUrl(state.persona, agent.uiEmote);
      // 思考气泡(3点跳)：card 加 .thinking → 左侧呼吸边线上下起伏；返回 finish(text,mood) 逐字收尾
      const thinkingBubble = () => {
        card.classList.add('thinking');
        const row = document.createElement('div'); row.className = 'row-msg bot';
        row.innerHTML = `<div class="mini-orb"><img src="${spriteUrl(state.persona, 'normal')}" onerror="this.remove()"></div><div class="msg bot typing"><span></span><span></span><span></span></div>`;
        acBody.appendChild(row); acBody.scrollTop = acBody.scrollHeight;
        return (text, mood) => {
          card.classList.remove('thinking');
          const mi = row.querySelector('.mini-orb img'); if (mi && mood) mi.src = spriteUrl(state.persona, mood);
          const bubble = row.querySelector('.msg'); bubble.classList.remove('typing'); bubble.textContent = '';
          let i = 0; (function ty() { if (i <= text.length) { bubble.textContent = text.slice(0, i++); acBody.scrollTop = acBody.scrollHeight; setTimeout(ty, 18); } else { agent.uiLog.push({ text, kind: false, mood }); } })();
        };
      };
      let sending = false;
      const send = async () => {
        const v = input.value.trim(); if (!v || sending) return; sending = true;
        add(v, true); input.value = '';
        // 让模型先思考(与下面的扫描动画并行·省双倍等待)；agent.ask 内部已兜底、不会抛
        const askP = agent.ask({ playerInput: v, nodeText: (this._sceneBuf || []).join('\n') });   // 带"当前场景原文"→接得上此刻
        // 扫描门：玩家一开口(首次)→ 先播【全屏】扫描动画(随行扫碑)，放完再出回复 = 提问→扫描→回复，沉浸感更强
        const g0 = state.activeGate;
        if (g0 && g0.scan && g0.fx && !g0._scanPlayed) { g0._scanPlayed = true; await this.playFx(g0.fx, { full: true }); }
        const finish = thinkingBubble();
        try {
          const res = await askP;
          const mood = res.state ? (STATE_MAP[res.state] || 'normal') : 'normal';
          if (res.state) { agent.uiEmote = mood; if (headAvatar) headAvatar.src = spriteUrl(state.persona, mood); }   // 顶部头像=最近一条 state
          finish(res.text || '……', mood);
          if (res.action) {                     // 模型要兑换 → 执行购买流水线（§6）
            const r = agent.applyAction(res.action);
            if (r) {
              const it = ITEMS[r.item_id];
              add(r.ok ? `（系统：已兑换 ${it?.name || r.item_id}${r.qty > 1 ? '×' + r.qty : ''}，剩余积分 ${r.points_after}）`
                       : `（系统：兑换未成功——${r.reason}）`, 'sys');
              const pv = document.querySelector('#ptsVal'); if (pv) pv.textContent = state.points;
            }
          }
          // 推理卡点(agentGate)：insight / 离线 / 扫描门给出实质回应 → 放行；关聊天框、解门续播揭示(扫描动画已在玩家提问时全屏播过)
          if (state.activeGate) {
            const g = state.activeGate, gk = g.key, passMsg = g.passMsg;
            g._tries = (g._tries || 0) + 1;
            const insightOk = res.action && res.action.type === 'insight' && res.action.ok && res.action.key === gk;
            // 扫描类卡点(g.scan)：随行给出实质回应(≈把字认出来·译文较长)即放行——【勿等模型附 insight】：scan 门语义是"译完即放行"、
            // 但模型常把 insight 当成"宿主想通了"在等玩家表态、译完却不附 → 先前卡死正源于此。故按"译文长度≥40"判定已认出；
            // 模型偶发只回短句兜底=连问两轮也放行。(t20scan 是全游戏唯一 scan 门，不影响别处推理门。)
            const scanPass = g.scan && ((res.text || '').length >= 40 || g._tries >= 2);
            const passed = res.offline || insightOk || scanPass;
            if (passed && !g._passing) {
              g._passing = true;   // 防玩家在放行延时内又发一句导致重复关框/重复 emit
              add(passMsg || '〔你理清了思路。〕', 'sys');
              // 留够读译文的时间(按打字机时长18ms/字估·封顶9s)再关框续剧情；其余门维持 1.6s。扫描动画不在这里播(已在提问后全屏播过)
              const readMs = (g.scan && !res.offline) ? Math.min(Math.max(2200, (res.text || '').length * 18 + 2400), 9000) : 1600;
              setTimeout(() => { this._closePanel(); bus.emit('insight', { key: gk }); }, readMs);
            }
          }
        } catch (e) { card.classList.remove('thinking'); finish('（……信号断了一下，再说一次？）', 'normal'); }
        finally { sending = false; }
      };
      this.panelHost.querySelector('#acSend').addEventListener('click', send);
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') send(); });
      setTimeout(() => input.focus(), 50);
    },

    _renderMenu() {
      const titles = (state.titles && state.titles.length)
        ? state.titles.map((t) => `<div class="menu-title-row"><div class="mt-name">🏅 ${t.name}</div>${t.desc ? `<div class="mt-desc">${t.desc}</div>` : ''}</div>`).join('')
        : '<div class="menu-title-empty">（暂无称号——某些抉择里，会有意想不到的收获。）</div>';
      const body = this._panel('菜单', `<button class="menu-row" data-m="save">💾 保存进度</button><button class="menu-row" data-m="mute">🔇 静音切换</button><button class="menu-row" data-m="title">🏠 返回标题</button><div class="menu-sect">成就称号</div><div class="menu-titles">${titles}</div>`, 'panel-menu');
      body.addEventListener('click', (e) => {
        const b = e.target.closest('.menu-row'); if (!b) return;
        if (b.dataset.m === 'save') { save.save('1'); this.toast('已保存到存档①', 'good'); this._closePanel(); }
        else if (b.dataset.m === 'mute') { audio.setMuted(!audio.muted); this.toast(audio.muted ? '已静音' : '已恢复声音', 'good'); }
        else if (b.dataset.m === 'title') { this._closePanel(); scenes.goto('title'); }
      });
    },

    // 清醒值记录面板（点 HUD 清醒值打开）：时间+地点+事件+变化，最新在上。事件名不剧透（原因未知者已标注）。
    _renderSanity() {
      const log = state.sanityLog || [];
      const rows = log.length
        ? log.slice().reverse().map((e) => `<div class="san-row">
            <div class="san-meta"><span class="san-when">Day ${e.day} · ${e.time}</span><span class="san-loc">${e.loc || ''}</span></div>
            <div class="san-ev">${e.ev}</div>
            <div class="san-delta ${e.delta > 0 ? 'up' : e.delta < 0 ? 'down' : 'flat'}">${e.delta > 0 ? '+' : e.delta < 0 ? '' : '±'}${e.delta}<span class="san-after">→ ${e.after}</span></div>
          </div>`).join('')
        : '<div class="san-empty">（暂无记录——每次清醒值升降都会自动记在这里。）</div>';
      this._panel('清醒值记录', `<div class="san-cur">当前清醒值 <b>${state.sanity}</b> / 100</div><div class="san-tip">⚠ 宿主清醒值过低时，随行系统可能出现异常。</div><div class="san-list">${rows}</div>`, 'panel-sanity');
    },

    // 丢弃区（场景左下角）：渲染被丢弃道具，点击拾回背包
    _renderDropZone() {
      if (!this.dropZone) return;
      if (!state.dropped) state.dropped = [];
      this.dropZone.innerHTML = state.dropped.map((id) => {
        const it = ITEMS[id];
        return `<button class="drop-item" data-id="${id}" title="拾回 ${it?.name || ''}">${iconHtml(it?.icon, '▩')}</button>`;
      }).join('');
      this.dropZone.querySelectorAll('.drop-item').forEach((b) => b.addEventListener('click', () => {
        const id = b.dataset.id;
        state.addItem(id);
        const i = state.dropped.indexOf(id); if (i >= 0) state.dropped.splice(i, 1);
        audio.play('key_event', { volume: 0.35 });
        this.toast('拾回 · ' + (ITEMS[id]?.name || ''), 'good');
        this._renderDropZone();
      }));
    },

    toast(msg, kind = '') {
      const layer = document.getElementById('toast-layer');
      const t = document.createElement('div'); t.className = 'toast ' + kind; t.textContent = msg;
      layer.appendChild(t); setTimeout(() => t.classList.add('show'), 16);
      setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 400); }, 3500);   // 停留 1.9s→3.5s：扣清醒值等提示来得及看清
    },
  };
  return scene;
}
