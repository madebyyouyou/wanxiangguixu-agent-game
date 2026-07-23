// 资源清单：音频映射 + 图片资源标签（占位图用）
// 用户后续把真图按 <id>.png/.jpg 放进 assets/images/<分类>/ 即可自动替换占位。

// ---- 音频：逻辑键 -> 实际文件名 ----
// 运行时只保留这里列出的 CC0 音频；逻辑键与文件名集中维护，避免散落引用。
// 自行替换音频时，把文件放入 assets/audio/，并同步修改右侧文件名。
export const AUDIO = {
  ui_cursor:     'sfx_cursor.wav',   // UI 点击
  key_event:     'sfx_key.wav',      // SFX004 关键事件（推门/液珠/秤崩/封印）
  hit:           'sfx_hit.wav',      // T16 追击受击
  heal:          'sfx_heal.wav',     // T16 拾血包
  fail:          'sfx_fail.wav',     // 死亡/失败演出
  hallucination: '幻觉.wav',          // SFX002 幻觉（音效合集2.8·用户指定原声）
  shadow:        'sfx_shadow.wav',   // 影子怪物
  door_scratch:  'sfx_scratch.wav',  // SFX001 指甲刮门
  door_push:     'sfx_door.wav',     // 推门
  amb_woodhouse: 'amb_woodhouse.wav',// T12 木屋环境（循环）
  chair:         'sfx_chair.wav',    // 窃听·椅子拖动危险信号
  droplet:       'sfx_droplet.wav',  // T20 液珠
  amb_t16:       'amb_t16.wav',      // SFX003 T16 环境氛围（循环）
  amb_horror:    'amb_horror.wav',   // 全局恐怖氛围 drone（循环·24s 无缝，CC0 自合成）
  tea_fail:      'sfx_tea_fail.wav',
  tea_done:      'sfx_tea_done.wav',
};

// 循环播放（环境音/BGM）的键
export const LOOPING = new Set(['amb_woodhouse', 'amb_t16']);

// ---- 图片资源标签：id -> 占位图上显示的中文说明 ----
// 取自《渡厄镇》剧情/美术资产标记。用户提供真图后占位自动消失。
export const IMAGE_LABELS = {
  // 场景底图 BG
  BG001a: '主街·默认', BG001b: '主街·遇小女孩',
  BG002a: '布庄·默认', BG002b: '布庄·老妇人抬头无眼',
  BG003a: '米店·称空气', BG003b: '米店·秤崩', BG003c: '米店·杜司衡叩秤',
  BG004a: '茶馆·默认', BG004b: '茶馆·对座中年男人',
  BG005a: '裁缝铺·女人年老', BG005b: '裁缝铺·女人年轻',
  BG006a: '井口·远观', BG006b: '井口·近景青苔', BG006c: '井口·刮开青苔露铭文', BG006d: '井口·杜司衡现身', BG006e: '井口·青苔近景(刮前·实拍)',
  BG007a: '祠堂白天内景', BG007b: '祠堂外景·门板爪痕', BG007c: '祠堂外景·爪痕消失',
  BG008a: '祠堂夜晚内景',
  BG009: '窄巷·绿苔藓', BG010: '木屋屋顶·偷听POV', BG011: '怪物追逐巷·暗红苔藓',
  BG012a: '井口·净化', BG012b: '镇中·魂灵消散', BG012c: '井口·澄明落幕',
  BG013: '窄道·双人贴墙', BG014: '祠堂门口·主角与杜司衡',
  BG_META: '元空间·复盘界面', BG_TITLE: '标题·渡厄镇',
  // 立绘 / 特写 CH·PR·FP
  CH006: '脸未成形怪物 立绘', CH007: '老陈头变树幻觉 插画', CH008: '杜司衡 立绘',
  PR001: '红布金线「渡」字特写', PR002: '黑色线头/头发特写', PR003: '门缝纸条特写',
  PR004: '井口石刻铭文特写', PR005: '暗红液珠特写', PR006: '虫茶杯特写',
  PR007: '门板爪痕特写', PR008: '人皮脸特写', PR009: '铜秤近景特写',
  // 特效 FX
  FX001: '孩童与异常影子特效', FX003: '秤乱跳特效', FX004: 'Agent球扫描特效',
};

// 图标资产（背包道具，64×64）id -> emoji 占位
export const ICON_PLACEHOLDER = {
  ICN_RED_CLOTH: '🟥', ICN_HAIR: '🧵', ICN_NAIL: '🔩', ICN_MATCH: '🔥',
  ICN_DAGGER: '🗡️', ICN_REWIND_CLOCK: '🕰️', ICN_IRON_ORE: '⛏️', ICN_FORGE: '🔥',
  ICN_NOTE: '📜', ICN_RED_DROPLET: '🔴', ICN_SMUDGE_POUCH: '🜂',
};
