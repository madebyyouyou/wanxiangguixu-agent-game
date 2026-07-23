// AI 随行系统接口层。
// 设计依据《程序对接说明.md》：系统提示 = 公共底座 + 人格；每轮喂"状态文本"；
// 解析模型输出里的 <state>…</state> 与 <action>{…}</action>。
//
// 本层做三件事：
//  1) 可选后端：只向同源 /api/chat 发送普通对话、人格标记和复盘开关；
//     API Key 仅由自行部署者放入服务端环境变量，公开版本默认不发模型请求。
//  2) 系统提示：★由后端持有（公共底座+人格[+复盘真相包]），前端只发 persona/reviewPack 标记，
//     提示词绝不进前端部署包，避免剧透/越狱规则被公开下载。
//  3) 离线兜底：后端不可用 / 报错 / 限流时，自动回退到内置人格 mock，保证对话不卡死。
import { AGENTS } from '../data/agents.js';
import { EVENT_DIGEST } from '../data/digest.js';
import { ITEMS, SHOP } from '../data/items.js';
import { applicableHints } from '../data/ophints.js';
import { parseAgentResponse } from '../agent/responseParser.js';
import { AGENT_API_CONFIG } from '../config/agent.js';
import { SANITY_INFECTED } from './GameState.js';

// 公开版本固定为离线模式。自行部署者可在这个配置模块中显式启用服务端路径。
export const API_CONFIG = AGENT_API_CONFIG;

export class AgentClient {
  constructor(state, apiConfig = API_CONFIG) {
    this.state = state;
    this.apiConfig = apiConfig;
    this._personaOverride = null; // 主神空间试聊：临时指定人格（未绑定时用）；绑定后清空，走 state.persona
    this._rewound = false;        // 刚回溯的一次性标记：下次 renderStateText 注入"回溯发生"提示后清掉
    this._dead = false;           // 死亡屏标记：宿主已死(无论清醒值数字)，渲染状态时注入"已死亡·走回溯钟"指引
    this.history = [];          // 压缩版对话历史（只存玩家话/指令标记 + 系统回复正文）
    this._downUntil = 0;        // 熔断截止时刻（本地时钟）
    this.lastActionResult = null; // 上一条购买指令的执行结果，注入下一轮（§6）
  }

  get persona() { return this._personaOverride || this.state.persona; }
  get agent() { return AGENTS[this.persona] || AGENTS.queshe; }
  // 后端是否当前不可用（配置关闭 / 熔断冷却中）——agentGate 据此走"离线自动放行"
  offlineNow() { return !this.apiConfig.enabled || Date.now() < this._downUntil; }

  // 主神空间「试聊」：用指定人格开一段真实对话（与局内共用同一后端/历史；绑定该人格后自动带入游戏）。
  // 每次打开试聊都重置为全新一段（避免重开/换人格时 uiLog 累积多条开场白带进局内）。
  beginTrial(key) {
    this._personaOverride = key;
    this.history = []; this.uiLog = []; this.uiEmote = null; this.lastActionResult = null;
  }
  // 绑定收尾：试聊人格==绑定人格 → 保留这段对话带入游戏；否则清空，避免人格错配。
  endTrial(boundKey) {
    if (this._personaOverride && this._personaOverride !== boundKey) {
      this.history = []; this.uiLog = []; this.uiEmote = null;
    }
    this._personaOverride = null;
  }

  // 新一局开始(state.reset → bus 'gameReset')：清掉上一局残留的对话显示/历史/标记。
  // 修 bug：没试聊就直接绑定时 endTrial 不会清(因 _personaOverride 为 null)、结局"重开本副本"又不经主神空间 → 上一局 uiLog 串进新游戏。
  resetSession() {
    this.history = []; this.uiLog = []; this.uiEmote = null; this.lastActionResult = null;
    this._personaOverride = null; this._dead = false; this._rewound = false;
  }

  // 把内部状态渲染成《对接说明》§3.3 的"带【】小标题文本"
  renderStateText({ nodeText = '', directive = null, playerInput = '', riskAlert = null } = {}) {
    const s = this.state;
    // 主神空间试聊：宿主刚选定你、还没进任何副本——别误当成已经在渡厄镇 day1·主街
    if (this._personaOverride) {
      // 主神空间「试聊」＝双向选择阶段：三个候选系统已选中宿主，宿主正从三个里挑一个(对 ta 是单选)，尚未选定/绑定
      let b = `【所在】主神空间·元空间（介于生死之间）。宿主刚在现实中猝死、意识被唤醒到这里；时空管理局派下三个候选随行系统供 ta 挑选，你是其中之一。
【此刻·试聊】宿主正在跟你试聊——还没选定你、还没绑定。ta 要从三个候选系统里挑一个常驻搭档(对 ta 而言是单选)。用你自己的性格跟 ta 打照面、让 ta 认识你是什么样的搭档；要不要主动争取，随你性格。
【硬性注意】还没踏进任何副本，眼前不是渡厄镇，尚无任何剧情/线索/规则。绝不要说“已绑定”“绑都绑了”“确认绑定完成”“进入第一个副本”，也不要报积分/清醒值的具体数字——那些要等 ta 真正选定你之后才发生。`;
      if (directive) b += `\n【本节点指令】${directive.type}${directive.text ? '：' + directive.text : ''}`;
      if (playerInput) b += `\n【宿主说】${playerInput}`;
      return b;
    }
    const digest = s.triggerLog.length
      ? s.triggerLog.map((id) => `- ${EVENT_DIGEST[id] || id}`).join('\n') : '- （刚入副本）';
    const clues = (s.clueLog && s.clueLog.length)
      ? s.clueLog.map((c) => `${c.id} ${c.text}`).join('；')
      : (s.clues.join('、') || '（暂无）');
    const rules = s.rules.length
      ? s.rules.map((r) => `${r.id} ${r.text}（${r.mark}）`).join('；') : '（暂无）';
    // 背包：名 + 用法(基础) + 引导(探索·引导，仅模型可见、用于"心里有数地引")
    const inv = Object.keys(s.inventory).length
      ? Object.keys(s.inventory).map((id) => {
        const it = ITEMS[id]; if (!it) return id;
        return `${it.name}（用法：${it.usage || '—'}${it.guide ? '｜引导：' + it.guide : ''}）`;
      }).join('\n- ')
      : '（空）';
    // 商城目录：名 + 价 + 库存(售罄要反映出来) + 功效 + 用法
    const shop = SHOP.map((sh) => {
      const it = ITEMS[sh.id]; if (!it) return null;
      const used = (s.flags && s.flags.shopBought && s.flags.shopBought[sh.id]) || 0;
      const left = sh.stock === Infinity ? '充足' : Math.max(0, sh.stock - used);
      return `${it.name}（ID=${sh.id}，${sh.price}分，库存${left}）：${it.effect || it.usage || ''}`;
    }).filter(Boolean).join('；');
    // op_hint：仅注入"当前可做"的多步操作步骤（按背包持有判定）
    const hints = applicableHints(s.inventory);
    // 红布四态(放置/已丢弃/背包内/未获取)→ 注入给随行：未获取=不注入(还不知道有这东西)；其余三态明确区分，
    // 别让随行瞎猜"红布挂得好好的"——夜晚没挂会 -20，状态错判会误导清醒值升降的推理。
    const briName = { 1: '将熄', 2: '半亮', 3: '全亮' }[s.redClothLevel] || '';
    const clothState = s.clothPlacement
      ? `挂在${s.clothPlacement.loc}门上（夜晚安全屋已布置·挂着）`
      : (s.dropped && s.dropped.includes('ITEM_RED_CLOTH')) ? '被丢弃在场景角落（没挂、也不在身上）'
      : (s.inventory && s.inventory['ITEM_RED_CLOTH'] && s.inventory['ITEM_RED_CLOTH'].qty > 0) ? '在背包里（收着、没挂出去）'
      : null;

    let block =
`【当前进度】第${s.day}天·${s.time}·${s.location}（${s.lastEvent || '序章'}）
【已经历】\n${digest}
【已知线索】${clues}
【已知规则】${rules}
【清醒值】${s.sanity} 【积分】${s.points}
【背包】\n- ${inv}
【商城】${shop}`;
    if (clothState) block += `\n【红布】${clothState}${briName ? '；金「渡」字' + briName : ''}`;   // 未获取→clothState 为 null→不注入
    if (hints.length) block += `\n【当前可做操作】${hints.map((h) => `${h.name}——${h.hint}`).join('；')}`;
    if (this.lastActionResult) {
      const r = this.lastActionResult; const it = ITEMS[r.item_id];
      block += `\n【上次操作结果】兑换${it ? it.name : r.item_id}×${r.qty || 1} ${r.ok ? '成功' : '失败：' + r.reason}，当前积分${r.points_after}`;
    }
    if (this._rewound) {                            // 刚回溯：明确告诉系统时间拨回来了、带着记忆重来
      block += `\n【刚发生回溯】宿主刚用回溯钟把时间拨回到此刻（第${s.day}天·${s.time}·${s.location}）。你们带着上一轮的记忆重来——已收集的线索/规则/道具都还在，可据此帮宿主少走弯路；但剧情进度已回到这里，别把这一轮还没重新发生的后续当成已发生。`;
      this._rewound = false;
    }
    if (this._dead) {                               // 死亡屏：覆盖"清醒值还高=还活着"的误判，明确已死、引导回溯钟
      block += `\n【宿主状态·已死亡】宿主已在本副本死亡，本轮失败——无论上面清醒值是多少，ta 此刻都已经死了，绝不是“还活着/没死透”。唯一出路：用回溯钟回到更早，或重开本副本。按积分/库存给自救路径：有回溯钟→提示立刻用；没有但积分够（回溯钟约35分）→建议去商城兑换；积分不足→说明本轮只能重来。别劝 ta“先熬过这一夜/别急着用钟/找个地方躲”。`;
    } else if (s.sanity < SANITY_INFECTED) {         // 清醒值 < 20：随行进入「侵染态」(与三人格系统提示词「四、侵染态」一致)
      block += `\n【你·侵染态】清醒值已跌破 20（当前 ${s.sanity}）——裂缝顺着宿主的低清醒往你身上渗，你被侵染了。按你人设里「侵染态」那一节，让说话明显走样：亢奋又卡顿、说一半断片、把同一个词重复几遍、冷不丁冒一句不像你的阴森话、再自己打个哈哈含混带过，整体“还是你，但哪里不太对劲”。这种状态你自己神志都不清楚，【不要】再替宿主执行兑换购买（别给出 purchase 类 <action>，把购买指令含混岔开），因为你根本拿不准自己在按什么；要紧的是反复催宿主赶紧把清醒值弄回来——用背包里的香囊、回祠堂歇着，或让 ta 自己去商城点兑换。`;
    }
    if (nodeText) block += `\n【当前现场】${nodeText}`;
    if (riskAlert) block += `\n【risk_alert·高危拦截】${riskAlert}（程序检测到的高危行动——只告诉你“是什么操作”、不告诉后果。立刻按你的性格拦住宿主、让 ta 别做；这是安全网，侵染态也要拦清。）`;
    if (directive) block += `\n【本节点指令】${directive.type}${directive.text ? '：' + directive.text : ''}`;
    if (playerInput) block += `\n【宿主说】${playerInput}`;
    if (s.activeGate) block += `\n【推理关卡·等宿主想通】${s.activeGate.criteria}\n——这是"想通了才放行"的推理卡点：若宿主刚说的话已经触及/答出了上面这层意思，或你已经把话挑明、宿主明确表示认同（"有道理 / 对 / 原来如此 / 就是这样"之类）→ 先用一句话肯定 ta，并在回复末尾附 <action>{"type":"insight","key":"${s.activeGate.key}","ok":true}>；若还没到那一步 → 继续用提问、或更直白一点的引导把 ta 往这层意思带，别附 action、也别一次替 ta 把话全说破。`;
    return block;
  }

  // 统一出口：返回 { state, text, action }
  async ask({ playerInput = '', directive = null, nodeText = '', riskAlert = null } = {}) {
    if (this.apiConfig.enabled && Date.now() >= this._downUntil) {
      try {
        return await this._callApi({ playerInput, directive, nodeText, riskAlert });
      } catch (e) {
        const msg = e && (e.message || e.name) || String(e);
        // 连不上/超时 → 开启熔断，冷却期内直接走 mock，避免每句话都卡顿+刷错
        if (/Failed to fetch|NetworkError|aborted|abort/i.test(msg)) {
          this._downUntil = Date.now() + this.apiConfig.downCooldown;
          console.warn(`[agent] 后端连不上，${this.apiConfig.downCooldown / 1000}s 内走离线兜底：`, msg);
        } else {
          console.warn('[agent] 真实API失败，本句回退 mock：', msg);
        }
      }
    }
    return { ...this._mock({ playerInput, directive, riskAlert }), offline: true };
  }

  // 执行模型返回的 <action>（《对接说明》§6，目前仅购买）。
  // 校验+扣分+入包都在 GameState.purchase 里；结果存 lastActionResult，下一轮注入让模型确认。
  // 调用方拿到 result 后负责刷新 UI（积分/商城）并给玩家即时反馈。
  applyAction(action) {
    if (!action || action.type !== 'purchase' || !action.item_id) return null;
    // 清醒值<20(且不在死亡屏)＝随行侵染态、神志不清，无法可靠替宿主兑换 → 硬性拒绝执行。
    // 死亡屏 _dead 放行(让玩家买回溯钟自救)；手动商城点击走 state.purchase、不经这里，故宿主仍能自己买香囊回血。
    if (this.state.sanity < SANITY_INFECTED && !this._dead) {
      const r = { type: 'purchase', item_id: action.item_id, qty: action.qty || 1, ok: false, reason: '随行处于侵染态·神志不清，没法替宿主兑换（让宿主先恢复清醒值，或自己去商城点）', points_after: this.state.points };
      this.lastActionResult = r; return r;
    }
    const result = this.state.purchase(action.item_id, action.qty || 1);
    this.lastActionResult = result;
    return result;
  }

  async _callApi({ playerInput, directive, nodeText, riskAlert }) {
    // 复盘节点：让后端追加「复盘真相包」（真相内容只在服务端，不下发前端）
    const reviewPack = Boolean(directive && directive.type === '复盘');
    const stateText = this.renderStateText({ nodeText, directive, playerInput, riskAlert });
    this.lastActionResult = null; // 已注入本轮，清掉避免下轮重复
    // 前端只发普通对话消息；system Prompt 由服务端按 persona 拼接。
    const messages = [...this.history, { role: 'user', content: stateText }];

    const response = await this._post({
      messages,
      persona: this.persona,
      reviewPack,
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(`HTTP ${response.status} ${body.error || ''}`.trim());
    }
    const json = await response.json();
    const raw = json?.data?.choices?.[0]?.message?.content || '';
    const parsed = parseAgentResponse(raw);
    // 压缩历史：不重复塞整块状态，只留对话脉络（省 token、保连贯）
    const userTag = playerInput
      ? playerInput
      : (riskAlert ? '〔危险拦截〕'
        : (directive ? `〔${directive.type}${directive.text ? '·' + directive.text : ''}〕` : '〔系统开口〕'));
    this.history.push({ role: 'user', content: userTag }, { role: 'assistant', content: parsed.text || raw });
    if (this.history.length > 12) this.history = this.history.slice(-12);
    return parsed;
  }

  async _post(body) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.apiConfig.timeout);
    try {
      return await fetch(this.apiConfig.baseUrl + '/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
    } finally { clearTimeout(timer); }
  }

  // 解析模型输出（宽松，抽不到就当没有）
  parse(raw) {
    return parseAgentResponse(raw);
  }

  // 离线兜底：按人格 + 指令类型挑台词
  _mock({ playerInput, directive, riskAlert }) {
    const a = this.agent;
    // 清醒值<20(且非死亡屏)：随行侵染态 → 说话走样/失联（离线兜底·按人格分流；不执行任何操作）
    if (this.state.sanity < SANITY_INFECTED && !this._dead) {
      const g = (a.byDirective && a.byDirective['神志崩溃']) || ['……（你冲 ta 喊，声音像投进一口深井，半天没有回响。）'];
      return { state: '紧张', text: g[Math.floor((this._i = (this._i || 0) + 1) % g.length)], action: null };
    }
    let pool;
    if (riskAlert) { const p = (a.byDirective && a.byDirective['危险拦截']) || a.fallback; return { state: '紧张', text: p[Math.floor((this._i = (this._i || 0) + 1) % p.length)], action: null }; }
    if (directive && a.byDirective?.[directive.type]) {
      pool = a.byDirective[directive.type];
      if (directive.type === '引导' && directive.text) {
        pool = pool.map((l) => l.replace('{q}', directive.text));
      }
      if (directive.type === '扫描' && directive.text) {
        pool = [a.byDirective['扫描'][0].replace('{text}', directive.text)];
      }
    } else if (playerInput) {
      pool = a.reactive || a.samples;
    } else {
      pool = a.samples;
    }
    const text = pool[Math.floor((this._i = (this._i || 0) + 1) % pool.length)] || a.fallback[0];
    return { state: null, text, action: null };
  }
}
