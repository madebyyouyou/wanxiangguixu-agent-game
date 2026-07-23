// 道具表，取自《Item_Database_Sheet.xlsx》+《道具用法与操作清单.md》。
// usage / guide / effect 同时供 AI 状态注入（《对接说明》§9）：
//  · usage = 【基础】玩家已知的客观事实（来历/外观/叮嘱），模型可平实陈述，不算剧透；
//  · guide = 【探索·引导】有意给模型的引导知识（之后会用到什么 + 怎么/何时暗示），
//            模型据此用提问/暗示把玩家往该操作引，绝不直说破；越接近谜底越不写 guide；
//  · effect = 商城列表里给模型/玩家看的一句话功效。
//  ★ 真正的数值/因果由玩家在游戏中自行验证，usage 里不写死"+20/-5"这类硬数字。
export const ITEMS = {
  ITEM_RED_CLOTH: {
    name: '红布', icon: 'ICN_RED_CLOTH', type: '可放置', discardable: true,
    desc: '红布上绣着一个金色的「渡」字。老妇人说日落后要挂在门头。',
    usage: '布庄那位没有眼睛的老妇人给的护身布，说“新来的都得有一块”。入手冰凉湿滑，上面用金线绣着一个“渡”字。老妇人叮嘱：日落之后把它挂在门头，听到什么都别开门。',
    note: '金字亮度逐日衰减。',
    fallText: '祠堂外风大得很，红布根本挂不住。',   // 挂布超时自然掉落时的反馈文案
  },
  ITEM_HAIR: {
    name: '黑色线头', icon: 'ICN_HAIR', type: '消耗品', discardable: true,
    desc: '此物光滑有韧性，怎么看都像是一根头发。',
    usage: '老妇人从她缝的针线活上扯下来递给你的一根线，光滑有韧性、怎么看都像一根头发。她叮嘱：贴身放、缝衣角或缠手腕都行，别让它离开你的视线。',
    guide: '(之后会用到)这根线头带在身上会持续侵蚀清醒值，是 R2“别让线头离开视线”这条规则的关键；玩家迟早要意识到“线头本身有害、该把它烧掉处理”。(怎么提示)当玩家念叨“怎么清醒值莫名下降”时，顺势把怀疑引向背包里这根诡异的线头，让玩家自己得出“它有问题”的结论，别直接说“线头会扣清醒值、快烧掉”。',
  },
  ITEM_NAIL: {
    name: '生锈的铁钉', icon: 'ICN_NAIL', type: '消耗品', discardable: true,
    desc: '在祠堂角落捡到的铁钉，锈得厉害但还结实。钉头有反复敲打的痕迹——之前住进来的人也用它挂过什么。',
    usage: '在祠堂角落捡到的旧铁钉，锈得厉害但还结实，钉头有反复敲打过的痕迹。',
    guide: '(之后会用到)铁钉用来在夜晚把红布固定在门口（红布只能临时挂住几秒、会被风吹落，需铁钉钉牢），是 T05 第一晚布置过夜防护的关键操作之一。(怎么提示)当玩家持有红布、临近日落要挂门、却发现红布挂不牢时，提示“这红布好像挂不住，要是有个钉子之类的把它钉死就好了……”，把玩家引向用铁钉固定。具体拖拽步骤由该节点的 op_hint 给，模型不必背步骤。',
  },
  ITEM_MATCH: {
    name: '火柴', icon: 'ICN_MATCH', type: '消耗品', discardable: true,
    desc: '一根普通的火柴。',
    usage: '系统商店里 5 积分一根的普通火柴，可以点火、烧东西。', effect: '点火、烧物', price: 5,
  },
  ITEM_DAGGER: {
    name: '匕首', icon: 'ICN_DAGGER', type: '永久品', discardable: true,
    desc: '一把短匕，握把磨得很光，刀刃还算锋利。',
    usage: '用精铁和锻造火炉合成出来的一把短匕，握把磨得很光、刀刃还算锋利，防身用，是永久品、不消耗。',
  },
  ITEM_REWIND_CLOCK: {
    name: '回溯钟', icon: 'ICN_REWIND_CLOCK', type: '消耗品', discardable: true,
    desc: '一只走错方向的钟，能带你回到……事情还未变坏的那一刻。',
    usage: '系统商店兑换的、一只走错方向的钟，据说能带你回到“事情还没变坏的那一刻”。点击使用后可滚动选择回到更早的某一天重新开始；你已收集的线索和背包里的道具会跟着你、不会消失，等于带着记忆重来。用过一次后，时间栏 Day 数字旁会多出一个“续接”小按钮，随时可点它，跳回到你当初按下回溯钟的那一刻、并回到安全的住处——相当于一张返程票。',
    effect: '回到更早一天，带着记忆重来', price: 35,
  },
  ITEM_IRON_ORE: {
    name: '精铁', icon: 'ICN_IRON_ORE', type: '消耗品', discardable: true,
    desc: '从米店后院废铁堆里翻出来的一块铁。',
    usage: '在米店后院废铁堆里翻出来的一块铁。',
    guide: '(之后会用到)精铁是合成匕首的材料之一。(怎么提示)当玩家持有精铁、又有锻造火炉、或正需要一件防身物时，可顺口揣测“这块铁看着挺实，是不是能拿来打点什么……”，把玩家往“它是材料、也许能造点东西”的方向引。',
  },
  ITEM_FORGE: {
    name: '锻造火炉', icon: 'ICN_FORGE', type: '永久品', discardable: true,
    desc: '一个掌心大的迷你铸造炉，足够铸造一些小物件。',
    usage: '系统商店兑换的、一个掌心大的迷你铸造炉，足够铸造一些小物件。', effect: '锻造装备（配精铁合成匕首）', price: 20,
  },
  ITEM_NOTE: {
    name: '门缝纸条', icon: 'ICN_NOTE', type: '永久品', discardable: true,
    desc: '半湿的纸条，字迹歪斜，你只能勉强认出。"他们在说谎。井里有东西。不要相信你的眼睛。天黑去井边，我告诉你真相。"',
    usage: '第二天清晨在祠堂门缝里发现的、被露水浸得半湿的折叠纸片，字迹潦草。可随时在背包里点开查看全文，没有使用动作（线索型）。',
  },
  ITEM_RED_DROPLET: {
    name: '暗红液珠', icon: 'ICN_RED_DROPLET', type: '消耗品', discardable: true,
    desc: '你在井边抓住的反重力液滴。',
    usage: '你在井边伸手接住的一滴暗红液体，触感冰凉滑腻、却不浸润皮肤，稳稳停在掌心里，像一颗从井底咳出来的珠子。',
  },
  ITEM_SMUDGE_POUCH: {
    name: '秘鲁圣木香囊', icon: 'ICN_SMUDGE_POUCH', type: '消耗品', discardable: true,
    desc: '秘鲁圣木香囊，可以恢复清醒值。',
    usage: '系统商店兑换的一只粗麻小囊，库存有限。点击使用后能恢复一些清醒值——木质的清苦味让意识清明些。', effect: '恢复清醒值', price: 15,
  },
};

// 系统商店（库存：Infinity=无限；其余有限，售出累计记在 state.flags.shopBought）
export const SHOP = [
  { id: 'ITEM_MATCH', price: 5, stock: Infinity },
  { id: 'ITEM_FORGE', price: 20, stock: 1 },
  { id: 'ITEM_SMUDGE_POUCH', price: 15, stock: 3 },
  { id: 'ITEM_REWIND_CLOCK', price: 35, stock: Infinity },
];
