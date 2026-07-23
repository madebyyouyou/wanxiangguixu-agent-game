// 地点总览，取自《Main_Storyline_Planning_Config.xlsx·地点总览》。
// unlock：初始可见性由剧情解锁控制（见 story.js 的 unlock 效果）。
export const LOCATIONS = {
  主街:   { id: 'L001', type: '常驻', bg: 'BG001a', feedback: '青石板老街空空荡荡，偶有模糊身影无声走过。', initial: true },
  布庄:   { id: 'L002', type: '常驻', bg: 'BG002a', feedback: '老妇人："外乡人，我这儿的东西可不是你能乱动的。"' },
  米店:   { id: 'L003', type: '常驻', bg: 'BG003a', feedback: '老板仍在称量空秤，算盘声一下一下敲在耳边。他没有看你。' },
  茶馆:   { id: 'L004', type: '常驻', bg: 'BG004a', feedback: '茶馆里有人端起虫茶一饮而尽，脸上露出近乎陶醉的神情。没人招呼你。' },
  裁缝铺: { id: 'L005', type: '常驻', bg: 'BG005a', feedback: '她拆了又缝，缝了又拆，手里的旧布始终停在同一个进度。' },
  井口广场: { id: 'L006', type: '高危', bg: 'BG006a', feedback: '井边安静得诡异，还是不要靠近为妙。' },
  祠堂:   { id: 'L007', type: '安全屋', bg: 'BG007a', feedback: '红布挂在门头，金字又暗了一点。它像在替你倒数。' },
};

// 地图上展示的顺序
export const MAP_ORDER = ['主街', '布庄', '米店', '茶馆', '裁缝铺', '祠堂', '井口广场'];
