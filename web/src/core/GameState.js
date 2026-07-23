// 游戏全局状态。所有数值改动从这里走，并通过 bus 广播给 HUD/手账等。
// 取值规则见《Player_Sanity_and_Point_System.xlsx》：初始清醒值90、积分20。
import { SHOP, ITEMS } from '../data/items.js';

export const SANITY_INIT = 90;
export const SANITY_MAX = 100;
export const POINTS_INIT = 20;
// 清醒值 < 此阈值 → 随行进入「侵染态」：说话走样 + 拒绝替宿主兑换。
// 与三人格系统提示词「四、侵染态（清醒值 < 20 时）」、OrbPet 受惊阈值一致。
export const SANITY_INFECTED = 20;

export class GameState {
  constructor(bus) {
    this.bus = bus;
    this.reset();
  }

  reset() {
    this.persona = null;            // 'queshe' | 'wuyou' | 'shuheng'
    this.day = 1;
    this.time = '上午';             // 时辰：上午/下午/夜晚
    this.sky = '昏黄';              // 天色调
    this.location = '主街';
    this.unlocked = ['主街'];        // 已解锁地点
    this.sanity = SANITY_INIT;      // 清醒值 COUNTER_SANITY
    this.points = POINTS_INIT;      // 积分 COUNTER_POINTS
    this.redClothLevel = 3;         // 红布亮度 3=亮 2=半 1=将熄
    this.clothPlacement = null;     // 红布当前放置 {loc,x,y}；null=未挂（过夜结算据此判定是否-20）
    this.lastEvent = null;          // LAST_COMPLETED_EVENT 事件指针
    this.activeNode = null;         // 正在进行(未完成)的节点 id；用于中途退出后 resume 重跑，避免无 after 链式节点死锁
    this.completed = [];            // 已完成事件 id（有序，含隐藏/分支）
    this.choices = {};              // 分叉记录 {T02:'A'}
    this.seen = {};                 // 杂项"已见"标记（T03各地点首访等）
    this.clues = [];                // 已收线索 id ['M1',...]（供AI注入）
    this.clueLog = [];              // 已收线索 [{id,text}]（供手账）
    this.rules = [];                // 已收规则 [{id:'R1',text,mark}]
    this.inventory = {};            // {ITEM_X:{qty, placed}}
    this.dropped = [];              // 已丢弃道具 id（落在场景左下角，可拾回）
    this.flags = {};                // 任意标记，含每日重置项
    this.dayFlags = {};             // 每天重置的 flag
    this.triggerLog = [];           // story_digest 用（含 ⟳ 回溯标记）
    this.ending = null;
    this.rewindGrant = false;       // 是否拥有一次"续接"机会
    this.rewindAnchor = null;       // 按下回溯钟那一刻的进度快照 {completed,triggerLog,lastEvent,day,time,sky}，供"续接"跳回
    this.titles = [];               // 成就称号 [{id,name,desc}]（菜单·成就称号展示）
    this.sanityLog = [];            // 清醒值变化手账 [{day,time,loc,ev,delta,after}]（HUD 点清醒值查看；ev=不剧透事件名）
    this.activeGate = null;         // 当前 agentGate 推理卡点 {key,criteria}（聊天框判定 yes 才放行；瞬时态·不入存档，节点重跑会重建）
    this.bus.emit('gameReset');     // 通知随行等清掉上一局会话残留(uiLog/history)。构造期无监听=no-op；新游戏/重开本副本/返回标题时生效（回溯/resume 不走 reset，故不误清）
  }

  // ---------- 数值 ----------
  changeSanity(delta, text, ev) {
    const before = this.sanity;
    this.sanity = Math.max(0, Math.min(SANITY_MAX, this.sanity + delta));
    if (this.sanity !== before) {
      this._logSanity(this.sanity - before, ev);   // 记实际变化量（已受 0~100 钳制）
      this.bus.emit('sanityChanged', { value: this.sanity, delta, text });
      if (this.sanity <= 0) this.bus.emit('sanityZero', {});
    }
    return this.sanity;
  }
  // 清醒值变化记入手账：时间+地点+事件+变化。ev=不剧透的事件名（原因未知者由调用方标注「…时（原因未知）」）；
  // 缺省回退到「在<当前地点>」。回溯钟回血、怪物追击失败等绕过 changeSanity 的来源，调用方直接调本方法补记。
  _logSanity(delta, ev) {
    if (!this.sanityLog) this.sanityLog = [];
    this.sanityLog.push({ day: this.day, time: this.time, loc: this.location, ev: ev || `在${this.location}`, delta, after: this.sanity });
  }
  changePoints(delta) {
    const before = this.points;
    this.points = Math.max(0, this.points + delta);
    if (this.points !== before) this.bus.emit('pointsChanged', { value: this.points, delta });
    return this.points;
  }

  // ---------- 进度 ----------
  setTime(day, time, sky) {
    const oldDay = this.day;
    if (day != null) this.day = day;
    if (time != null) this.time = time;
    if (sky != null) this.sky = sky;
    this.bus.emit('timeChanged', { day: this.day, time: this.time, sky: this.sky });
    if (day != null && day > oldDay) this._settleNight();   // 天数推进=过了一夜 → 过夜结算
  }
  // 过夜结算（《道具表》ITEM_DAGGER +10 / ITEM_RED_CLOTH 没挂 -20）。本副本所有夜晚都在祠堂度过，
  // 故不校验当前地点；红布"当晚是否挂着"用 clothPlacement 判定（挂着=有放置；取回=null → 当晚没挂 -20）。
  _settleNight() {
    if (this.hasItem('ITEM_DAGGER')) this.changeSanity(10, '安全度过了今晚——你摸了摸背包里的匕首，得到一丝安慰。', '在祠堂过夜时（原因未知）');
    if (!this.clothPlacement) {
      this.bus.emit('nightUnprotected', {});                // 供乌有"危险拦截"接入（若启用）
      this.changeSanity(-20, '门头空荡荡的，没有红布。整夜都有什么在外面徘徊，你几乎没有合眼。', '在祠堂过夜时（原因未知）');
    }
    this.resetDayFlags();
  }
  completeEvent(id) {
    if (id && !this.completed.includes(id)) this.completed.push(id);
    if (id) { this.lastEvent = id; this.triggerLog.push(id); }
    this.bus.emit('eventCompleted', { id });
  }
  recordChoice(eventId, key) { this.choices[eventId] = key; }
  hasChoice(eventId, key) { return this.choices[eventId] === key; }

  unlock(locs = []) {
    let changed = false;
    locs.forEach((l) => { if (!this.unlocked.includes(l)) { this.unlocked.push(l); changed = true; } });
    if (changed) this.bus.emit('unlockChanged', { unlocked: this.unlocked });
  }

  // ---------- 线索 / 规则 ----------
  addClue(id, text) {
    if (this.clues.includes(id)) return;
    this.clues.push(id);
    this.clueLog.push({ id, text });
    this.bus.emit('clueAdded', { id, text });
  }
  addRule(id, text, mark = '存疑') {
    if (this.rules.some((r) => r.id === id)) return;
    this.rules.push({ id, text, mark });
    this.bus.emit('ruleAdded', { id, text, mark });
  }
  markRule(id, mark) {
    const r = this.rules.find((x) => x.id === id);
    if (r) { r.mark = mark; this.bus.emit('ruleChanged', { id, mark }); }
  }

  // ---------- 成就称号 ----------
  addTitle(id, name, desc = '') {
    if (!id || this.titles.some((t) => t.id === id)) return false;
    this.titles.push({ id, name, desc });
    this.bus.emit('titleAdded', { id, name, desc });
    return true;
  }

  // ---------- 背包 ----------
  hasItem(id) { return !!this.inventory[id] && this.inventory[id].qty > 0; }
  addItem(id, qty = 1, silent = false) {
    const cur = this.inventory[id] || { qty: 0, placed: false };
    cur.qty += qty;
    this.inventory[id] = cur;
    this.bus.emit('itemChanged', { id, item: cur, op: 'add', silent });   // silent=true：仅刷新背包，不弹"获得道具"toast(如操作台退回台面道具)
  }
  removeItem(id, qty = 1) {
    const cur = this.inventory[id];
    if (!cur) return;
    cur.qty = Math.max(0, cur.qty - qty);
    if (cur.qty === 0) delete this.inventory[id];
    this.bus.emit('itemChanged', { id, op: 'remove' });
  }

  // ---------- 商城购买（手动点击 + 模型 <action>{purchase} 共用此唯一入口）----------
  // 返回《对接说明》§6 的 last_action_result：{type,item_id,qty,ok,reason,points_after}
  purchase(itemId, qty = 1) {
    qty = Math.max(1, qty | 0);
    // 容错归一：模型可能传中文名/别名而非ID → 先按 id 找、找不到再按中文名找到 SHOP 条目
    const entry = SHOP.find((x) => x.id === itemId)
      || SHOP.find((x) => ITEMS[x.id] && ITEMS[x.id].name === itemId);
    const id = entry ? entry.id : itemId;
    const fail = (reason) => ({ type: 'purchase', item_id: id, qty, ok: false, reason, points_after: this.points });
    if (!entry) return fail('该商品不在系统商城目录');
    this.flags.shopBought = this.flags.shopBought || {};
    const used = this.flags.shopBought[id] || 0;
    const left = entry.stock - used;
    if (left < qty) return fail(left <= 0 ? '已售罄' : `库存不足（仅剩 ${left}）`);
    const cost = entry.price * qty;
    if (this.points < cost) return fail(`积分不足（需 ${cost}，现有 ${this.points}）`);
    this.changePoints(-cost);
    this.addItem(id, qty);
    this.flags.shopBought[id] = used + qty;
    this.bus.emit('purchased', { id, qty, points: this.points });
    return { type: 'purchase', item_id: id, qty, ok: true, reason: '', points_after: this.points };
  }

  // ---------- 每日重置 ----------
  resetDayFlags() { this.dayFlags = {}; }

  // ---------- 序列化 ----------
  toJSON() {
    return {
      persona: this.persona, day: this.day, time: this.time, sky: this.sky,
      location: this.location, unlocked: this.unlocked, sanity: this.sanity, points: this.points,
      redClothLevel: this.redClothLevel, clothPlacement: this.clothPlacement, lastEvent: this.lastEvent,
      activeNode: this.activeNode,
      completed: this.completed, choices: this.choices, seen: this.seen,
      clues: this.clues, clueLog: this.clueLog, rules: this.rules, inventory: this.inventory, dropped: this.dropped,
      flags: this.flags, dayFlags: this.dayFlags, triggerLog: this.triggerLog,
      ending: this.ending, rewindGrant: this.rewindGrant, rewindAnchor: this.rewindAnchor, titles: this.titles,
      sanityLog: this.sanityLog,
    };
  }
  loadJSON(data) {
    Object.assign(this, data);
    return this;
  }
}
