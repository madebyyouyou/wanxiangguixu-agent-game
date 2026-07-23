// 多步操作的临场步骤提示 op_hint（取自《渡厄镇_op_hint对照.json》）。
// 《对接说明》§9：程序只在"该操作当前可做"的节点把对应 op_hint 注入给模型，
// 不可做时不给，避免模型超前教还没解锁的操作。
// 可做判定（数据驱动、稳健）：背包里已集齐全部 need 道具，且 produce 产物尚未到手。
export const OP_HINTS = [
  { id: 'OP_HANG_CLOTH', name: '挂红布过夜', need: ['ITEM_RED_CLOTH', 'ITEM_NAIL'], produce: [],
    hint: '把红布拖到祠堂门口（只能临时挂住几秒）→ 趁这几秒，把生锈铁钉拖到门口红布的位置钉牢，才算长久固定。' },
  { id: 'OP_BURN_HAIR', name: '烧黑色线头', need: ['ITEM_HAIR', 'ITEM_MATCH'], produce: [],
    hint: '背包里打开操作台 → 把黑色线头拖上操作台 → 再把火柴拖上操作台，即可烧掉它。' },
  { id: 'OP_FORGE_DAGGER', name: '锻造匕首', need: ['ITEM_IRON_ORE', 'ITEM_FORGE'], produce: ['ITEM_DAGGER'],
    hint: '把精铁和锻造火炉都拖到操作台（不分先后）即可合成匕首。但锻造时火炉轰鸣声很大、容易招来镇上游荡的东西，只有在贴着红布的祠堂（安全屋）里才能安稳打造——在别处动手会被那声响惊动、打断。（提示玩家时要说这层原因，别说"火炉上写着只能在祠堂"这种出戏的话）' },
  { id: 'OP_WASH_CLOTH', name: '用红水洗红布', need: ['ITEM_RED_DROPLET', 'ITEM_RED_CLOTH'], produce: [],
    hint: '把暗红液珠和红布拖到操作台（不分先后）。' },
  { id: 'OP_USE_REWIND', name: '使用回溯钟', need: ['ITEM_REWIND_CLOCK'], produce: [],
    hint: '点击回溯钟使用 → 滚动选择想回到的那一天早晨（一天开始、祠堂），带记忆重来。用后 Day 旁会出现「续接」按钮，随时可点，跳回按下回溯钟的时刻、回到安全屋。' },
];

// 返回当前背包下"可做"的操作提示（喂给模型的 op_hint）
export function applicableHints(inventory = {}) {
  const has = (id) => inventory[id] && inventory[id].qty > 0;
  return OP_HINTS.filter((h) => h.need.every(has) && !h.produce.some(has));
}
