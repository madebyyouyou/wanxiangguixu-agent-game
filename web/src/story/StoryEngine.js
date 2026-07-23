// 剧情引擎：按"事件指针 + 进入地点"触发节点，逐段演出。
// 节点到达规则见各节点的 at/after（after 可为字符串=要求 lastEvent，或函数(state)=>bool）。
// 片段(seg)类型见 README / 下方 switch。交互/小玩法在 MVP 用 act 占位，可点击推进。
import { LOCATIONS } from '../data/locations.js';

const done = (id) => (s) => s.completed.includes(id);

export class StoryEngine {
  constructor(ctx) {
    this.ctx = ctx;            // { bus, state, audio, assets, agent }
    this.nodes = {};           // id -> node
    this.presenter = null;     // GameScene 注入
    this.busy = false;
  }

  load(nodes) { nodes.forEach((n) => { this.nodes[n.id] = n; }); }
  bind(presenter) { this.presenter = presenter; }

  startNode() {
    return Object.values(this.nodes).find((n) => n.start);
  }

  // 玩家切到某地点时调用：触发可触发的节点，否则给默认反馈
  async enter(loc) {
    if (this.busy) return;
    const s = this.ctx.state;
    const from = s.location;
    s.location = loc;
    this.ctx.bus.emit('locationChanged', { loc });
    this._locationItemFx(loc, from);
    const node = this._findTriggerable(loc);
    // 进入地点即刻切到"开场底图"，避免"先出对白、后换背景"的空白闪。
    // 关键：只在 bg 段位于任何对白/特写/操作【之前】(=真·开场底图)时才预切；
    // 若 bg 段在对白【之后】(剧情中途换景，如 T08 小女孩撞上来后才现身)，开场用地点默认态、
    // 到那一段再换——否则一进门就显示后半段的景，"图文对不上"。
    if (this.presenter) {
      let openBg = null;
      for (const x of (node && node.seg) || []) {
        if (x.t === 'bg') { openBg = x.id; break; }
        if (x.t === 'say' || x.t === 'closeup' || x.t === 'act' || x.t === 'actor') break;
      }
      await this.presenter.setBg(openBg || LOCATIONS[loc]?.bg || 'BG001a');
    }
    if (node) { await this.runNode(node.id); return; }
    // 没有新剧情触发：也要给反馈，避免玩家以为卡死。地点自带氛围反馈 + 一句探索引导。
    if (this.presenter) {
      const fb = LOCATIONS[loc]?.feedback || '你在这里转了一圈，暂时没有新的发现。';
      await this.presenter.say({ who: 'narr', text: `${fb}〔此处暂无新进展——去别的地点看看，或右键/双击系统问问思路。〕` });
    }
  }

  // 玩家切换地点时，道具引发的清醒值变化（《道具表》ITEM_RED_DROPLET / ITEM_HAIR）
  _locationItemFx(loc, from) {
    const s = this.ctx.state;
    if (!s.dayFlags) s.dayFlags = {};
    // S03《清醒值表》：夜晚（除 Day2 纸条引导那一夜的特殊分支外）玩家主动走去非祠堂地点 → 每次 -15。
    // 只在 enter()（玩家点地图）时触发；夜晚的剧情节点都走 runNode(goto/next)、不经 enter，故不会误伤脚本流程。
    if (loc !== from && s.time === '夜晚' && s.day !== 2 && loc !== '祠堂') {
      s.changeSanity(-15, '你刚踏出门槛，街上的黑暗便像水一样漫上来。远处没有灯，也没有人声，只有某种湿冷的目光贴着你的后颈。你意识到，现在不该离开祠堂。', '夜晚离开祠堂时（原因未知）');
    }
    // S02《清醒值表》：T16 末「该去茶馆了」之后（s02ChaGuide 置位），玩家切到非茶馆地点 → 每次 -5；切到茶馆即解除。
    if (loc !== from && s.flags && s.flags.s02ChaGuide) {
      if (loc === '茶馆') s.flags.s02ChaGuide = false;
      else s.changeSanity(-5, '都晡时了，本该去喝茶的时辰，你却往别处走。一阵没来由的烦躁和发虚涌上来，脚步越来越沉。', '晡时在外游荡时（原因未知）');
    }
    // 持暗红液珠：每次切换地点 -5（无文案）
    if (loc !== from && s.hasItem('ITEM_RED_DROPLET')) s.changeSanity(-5, null, `进入${loc}时（原因未知）`);
    // 在主街且背包有黑色线头：每天一次 -10 + 文案
    if (loc === '主街' && s.hasItem('ITEM_HAIR') && !s.dayFlags.hairMainStreet) {
      s.dayFlags.hairMainStreet = true;
      s.changeSanity(-10, '你感觉衣角微微发热。空气忽然变得很重，压在你肩上，像有一只手搭了许久没有移开。', '进入主街时（原因未知）');
    }
  }

  _findTriggerable(loc) {
    const s = this.ctx.state;
    return Object.values(this.nodes).find((n) => {
      if (n.start || n.at !== loc) return false;
      if (s.completed.includes(n.id)) return false;
      return this._after(n.after, s);
    });
  }

  _after(after, s) {
    // 无 after = 该节点仅由剧情 next/goto 自动接续触发，不参与"进入地点"的自由探索触发，
    // 避免 T16/T24 这类带 at 但无前置条件的节点一进对应地点就被误触发。
    if (after == null) return false;
    if (typeof after === 'function') return after(s);
    if (Array.isArray(after)) return after.includes(s.lastEvent);
    return s.lastEvent === after;
  }

  // 执行一个节点（含自动推进 next / 片段内 goto）
  async runNode(id) {
    const node = this.nodes[id];
    if (!node) { console.warn('未知节点', id); return; }
    this.busy = true;
    this.ctx.bus.emit('nodeStart', { id });

    // 进入节点时同步时空
    if (node.day || node.time || node.sky) this.ctx.state.setTime(node.day, node.time, node.sky);
    if (node.at) {
      this.ctx.state.location = node.at; this.ctx.bus.emit('locationChanged', { loc: node.at });
      // 安全网：节点自身没有 bg 段时，切到该地点默认底图，避免沿用上一个地点的背景
      const hasBg = (node.seg || []).some((s) => s.t === 'bg');
      const defBg = LOCATIONS[node.at]?.bg;
      if (!hasBg && defBg && this.presenter) await this.presenter.setBg(defBg);
    }

    // 记录"正在进行的节点"并落盘（此刻 seg 尚未执行，存档=本节点起始态）。
    // 若玩家在本节点中途退出（典型：小玩法里关浏览器），resume 据此重跑本节点；
    // 否则会掉进自由行动，而 T12/T16 这类"无 after、仅靠 next 链"的节点永不被触发 = 死锁。
    this.ctx.state.activeNode = id;
    this.ctx.save?.autosave();

    this._pendingGoto = null;
    await this._runSegs(node.seg || []);

    // 段内触发了结局（小游戏清醒值归零 / san 致死 / ending 段）→ 立即停止：
    // 不标完成（节点可在回溯后重来）、不跳转、不空跑剩余剧情（避免死亡屏背后继续推进）。
    if (this.ctx.state.ending) { this.ctx.state.activeNode = null; this.busy = false; return; }

    // 收尾：标记完成、清除进行中标记
    this.ctx.state.completeEvent(node.id);
    this.ctx.state.activeNode = null;
    this.ctx.save?.autosave();
    this.ctx.bus.emit('nodeEnd', { id });

    const jump = this._pendingGoto || node.next;
    this.busy = false;
    if (jump) await this.runNode(jump);
    else this.ctx.bus.emit('freeRoam', {});   // 交回自由行动
  }

  async _runSegs(segs) {
    for (const seg of segs) {
      if (this._pendingGoto || this.ctx.state.ending) break;   // 结局已触发（小游戏致死/ending 段）→ 停止后续段
      await this._runSeg(seg);
    }
  }

  async _runSeg(seg) {
    // seg 级条件 when(state)=>bool：为假则跳过（按之前选择/背包状态分流台词、线索、规则）
    if (seg.when && !seg.when(this.ctx.state)) return;
    const { state, audio, agent, bus } = this.ctx;
    const P = this.presenter;
    switch (seg.t) {
      case 'bg':    await P?.setBg(seg.id); break;
      case 'sfx':   audio.play(seg.key); break;
      case 'amb':   audio.loop(seg.key, { volume: seg.volume }); break;
      case 'ambStop': seg.key ? audio.stopLoop(seg.key) : audio.stopAllLoops(); break;
      case 'say':   await P?.say(seg); break;
      case 'closeup': await P?.closeup(seg); break;
      case 'actor': await P?.actor(seg); break;   // 常驻立绘(非模态)：叠在场景上、对话框下层；切 bg 或 {clear:true} 才消失
      case 'fx':    await P?.playFx?.(seg.id, { ms: seg.ms, full: seg.full }); break;
      case 'pickup': await P?.pickup(seg); break;
      case 'clue':  state.addClue(seg.id, seg.text); break;
      case 'rule':  state.addRule(seg.id, seg.text, seg.mark); break;
      case 'title': state.addTitle(seg.id, seg.name, seg.desc); break;
      case 'item':  seg.op === 'remove' ? state.removeItem(seg.id, seg.qty) : state.addItem(seg.id, seg.qty); break;
      case 'san':   state.changeSanity(seg.delta, seg.text, seg.ev); break;
      case 'pts':   state.changePoints(seg.delta); break;
      case 'unlock': bus.emit('unlock', { locs: seg.locs }); break;
      case 'cloth': state.redClothLevel = seg.level; bus.emit('clothChanged', { level: seg.level }); break;
      case 'flag':  state.flags[seg.key] = seg.value ?? true; break;
      case 'time':  state.setTime(seg.day, seg.time, seg.sky); break;
      case 'act':   audio && seg.sound && audio.play(seg.sound); await P?.act(seg); break;
      case 'agent': await this._agent(seg.directive, seg.risk); break;
      case 'agentGate': await this._agentGate(seg); break;
      case 'choice': await this._choice(seg); break;
      case 'goto':  if (seg.time || seg.day || seg.sky) state.setTime(seg.day, seg.time, seg.sky);
                    this._pendingGoto = seg.node; break;
      case 'ending': state.ending = seg.id; await P?.ending(seg); bus.emit('ending', seg); break;
      default: console.warn('未知片段', seg);
    }
  }

  async _agent(directive, riskAlert) {
    const P = this.presenter;
    if (!P) return;
    P.agentThinking?.(true);
    const res = await this.ctx.agent.ask({ directive, riskAlert });
    P.agentThinking?.(false);
    await P.agentSpeak(res.text, res.state);
  }

  // agentGate：推理卡点。先抛引导，再挂起剧情，直到模型在聊天框判定宿主"想通"(insight) 才放行。
  // 离线(后端不可用)无法判定 → 直接放行。判定信号由 GameScene 聊天 send() 检测 res.action(insight)/res.offline 后 bus.emit('insight')。
  async _agentGate(seg) {
    const { state, bus, agent } = this.ctx; const P = this.presenter;
    if (seg.directive) await this._agent(seg.directive);
    if (!agent || agent.offlineNow?.()) { if (seg.fx) await P?.playFx?.(seg.fx, { full: true }); return; }   // 离线自动放行：补播扫描动画(若有·全屏)→不设门、直接继续播揭示
    state.activeGate = { key: seg.key, criteria: seg.criteria, idleHint: seg.idleHint, fx: seg.fx, scan: seg.scan, passMsg: seg.passMsg };
    P?.gateOpen?.(seg);                                 // 提示 + 打开聊天框，让玩家在里面推理
    await new Promise((resolve) => {
      const off = bus.on('insight', ({ key }) => { if (key !== seg.key) return; off(); state.activeGate = null; resolve(); });
    });
  }

  async _choice(seg) {
    const s = this.ctx.state;
    const opts = (seg.options || []).filter((o) => !o.when || o.when(s));
    let opt;
    // 伪选项：retry=true 的项选了不推进——扣 costPoints 积分 + 游戏提示 toast + 重弹本卡片，直到选中非 retry 项
    while (true) {
      const chosen = await this.presenter.choice(opts.map((o) => ({ key: o.key, label: o.label })));
      opt = opts.find((o) => o.key === chosen) || opts[0];
      if (!opt.retry) break;
      if (opt.costPoints) s.changePoints(-opt.costPoints);
      this.presenter.toast?.(opt.toast || '再想想……', 'clue');
    }
    if (seg.id) s.recordChoice(seg.id, opt.key);
    if (opt.branch) await this._runSegs(opt.branch);
    if (opt.goto) { if (opt.time || opt.day || opt.sky) s.setTime(opt.day, opt.time, opt.sky); this._pendingGoto = opt.goto; }
  }
}

export { done };
