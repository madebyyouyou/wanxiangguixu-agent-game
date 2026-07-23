// 背包 / 操作台：移植自《渡厄镇_背包操作台_交互原型》，已剔除不该给玩家看的内容
// （配方小抄、祠堂/主街手动切换、重置、测试道具、开发标注），并接到真实 GameState。
// 玩法：轻点看详情；按住拖到操作台台面；凑齐一条隐藏配方自动合成；单击台上道具收回。
import { ITEMS } from '../data/items.js';

// 道具占位 emoji（真图缺失时回退）
const EMOJI = {
  ITEM_RED_CLOTH: '🟥', ITEM_HAIR: '🧵', ITEM_NAIL: '🔩', ITEM_MATCH: '🔥', ITEM_DAGGER: '🗡️',
  ITEM_REWIND_CLOCK: '🕰️', ITEM_IRON_ORE: '⛏️', ITEM_FORGE: '⚒️', ITEM_NOTE: '📜', ITEM_RED_DROPLET: '🔴', ITEM_SMUDGE_POUCH: '🜂',
};
// 类型 → 角标颜色（可放置/消耗品/永久品）
const TYPE_DOT = { 可放置: 'place', 消耗品: 'consume', 永久品: 'perm' };
// 点击即用道具
const USE = {
  ITEM_SMUDGE_POUCH: { type: 'sanity', amount: 10, label: '使用', text: '秘鲁圣木的木质清苦味瞬间冲进鼻腔——你感觉意识清明了一些。〔清醒值 +10〕' },
  ITEM_REWIND_CLOCK: { type: 'rewind', label: '使用' },
};
// 隐藏配方（精确匹配整桌；玩家不可见）
const RECIPES = [
  { set: ['ITEM_IRON_ORE', 'ITEM_FORGE'], requireLoc: '祠堂', consume: ['ITEM_IRON_ORE'], product: 'ITEM_DAGGER',
    ok: '叮——精铁在火炉里淬成了一把匕首。〔精铁消耗 · 火炉保留 · 匕首入背包〕',
    fail: '锻造火炉嗡嗡作响，你忽然觉得后背发凉，停下了动作——回头瞥见巷口一闪而过的庞大影子。〔此处无法锻造 · 清醒值 -5〕', failSanity: -5 },
  { set: ['ITEM_HAIR', 'ITEM_MATCH'], consume: ['ITEM_HAIR', 'ITEM_MATCH'], clue: { id: 'M7', text: '这个黑色线头就是头发' },
    ok: '火焰卷住线头，立刻缩成焦黑小球——你确认，这个黑色线头就是一根头发。〔线头 / 火柴消耗〕' },
  { set: ['ITEM_RED_CLOTH', 'ITEM_MATCH'], consume: [], verify: true, ok: '「此布面料奇异，竟火烧不坏。」〔验证 · 不消耗〕' },
  { set: ['ITEM_RED_CLOTH', 'ITEM_FORGE'], consume: [], verify: true, ok: '「此布面料奇异，竟火烧不坏。」〔验证 · 不消耗〕' },
  { set: ['ITEM_RED_CLOTH', 'ITEM_DAGGER'], consume: [], verify: true, ok: '「此布面料奇异，竟无法撕毁。」〔验证 · 不消耗〕' },
  { set: ['ITEM_RED_DROPLET', 'ITEM_RED_CLOTH'], consume: ['ITEM_RED_DROPLET'], brighten: true, sanity: 20,
    ok: '液珠没把布浸湿，却像被吸进去了——红布上的「渡」字重新亮了一分。〔液珠消耗 · 红布亮度+1 · 清醒值+20〕' },
];

const iconHtml = (id) => `<img class="bp-ic" src="assets/images/icon/${ITEMS[id]?.icon}.png" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"><span class="bp-emoji" style="display:none">${EMOJI[id] || '▩'}</span>`;
const sig = (arr) => [...arr].sort().join('+');

// host：挂载容器（panelHost）；ctx：{state,bus,audio}；opts.onClose
export function mountBackpack(host, ctx, opts = {}) {
  const { state, bus, audio } = ctx;
  let placed = [], uidSeq = 0, selectedId = null, drag = null, lastFailSig = '';

  host.className = 'panel-host show backpack-host';
  host.innerHTML = `
    <div class="backpack">
      <div class="bp-head">
        <div class="bp-title"><img class="bp-title-ic" src="assets/images/ui/inv_icon.webp" onerror="this.outerHTML='🎒'">背包 · 操作台</div>
        <div class="bp-hud">
          <span class="bp-stat">清醒值 <b id="bpSan">${state.sanity}</b></span>
          <span class="bp-stat">红布亮度 <b id="bpBri">${({ 1: '将熄', 2: '半亮', 3: '全亮' })[state.redClothLevel] || '—'}</b></span>
        </div>
        <span class="bp-x">✕</span>
      </div>
      <div class="bp-body">
        <div class="bp-left">
          <div class="bp-grid" id="bpGrid"></div>
          <button class="bp-bench-toggle" id="bpBenchToggle"><span class="arr">▾</span> 调出操作台 <span class="arr">▾</span></button>
          <div class="bp-bench" id="bpBench">
            <div class="bp-surface" id="bpSurface"><div class="bp-empty" id="bpEmpty">把背包里的道具拖到这块台面上<br>凑齐一条配方就会自动合成 · 单击台上道具收回背包</div></div>
            <div class="bp-feedback none" id="bpFeedback">展开后，把道具拖上来试试。</div>
          </div>
        </div>
        <div class="bp-right">
          <div class="bp-detail" id="bpDetail"><div class="bp-detail-empty">轻点背包里的道具<br>查看大图与信息</div></div>
        </div>
      </div>
    </div>`;

  const $ = (s) => host.querySelector(s);
  const $grid = $('#bpGrid'), $surface = $('#bpSurface'), $empty = $('#bpEmpty'), $feedback = $('#bpFeedback'),
    $bench = $('#bpBench'), $benchToggle = $('#bpBenchToggle'), $detail = $('#bpDetail');

  const close = () => {
    placed.forEach((p) => state.addItem(p.itemId, 1, true)); placed = [];   // 退出时把台面上未合成的道具收回背包(静默·不弹获得)
    host.className = 'panel-host'; host.innerHTML = ''; opts.onClose?.();
  };
  $('.bp-x').addEventListener('click', () => { audio?.play('ui_cursor', { volume: 0.3 }); close(); });
  host.addEventListener('mousedown', (e) => { if (e.target === host) close(); });

  const refreshHud = () => { $('#bpSan').textContent = state.sanity; $('#bpBri').textContent = ({ 1: '将熄', 2: '半亮', 3: '全亮' })[state.redClothLevel] || '—'; };

  function renderGrid() {
    $grid.innerHTML = '';
    Object.keys(state.inventory).forEach((id) => {
      const it = ITEMS[id]; const n = state.inventory[id]?.qty || 0; if (n <= 0) return;
      const cell = document.createElement('div');
      cell.className = 'bp-cell' + (selectedId === id ? ' sel' : '');
      cell.innerHTML = `<span class="bp-ty ty-${TYPE_DOT[it?.type] || 'consume'}"></span>${iconHtml(id)}<span class="bp-nm">${it?.name || id}</span><span class="bp-qty">×${n}</span>`;
      cell.addEventListener('pointerdown', (e) => onGridDown(e, id));
      $grid.appendChild(cell);
    });
    if (selectedId && (state.inventory[selectedId]?.qty || 0) <= 0) selectedId = null;
    if (selectedId) renderDetail(selectedId); else $detail.innerHTML = '<div class="bp-detail-empty">轻点背包里的道具<br>查看大图与信息</div>';
  }

  function renderDetail(id) {
    const it = ITEMS[id]; const n = state.inventory[id]?.qty || 0;
    const u = USE[id];
    const useBtn = (u && n > 0) ? `<button class="bp-use" id="bpUse">⟡ ${u.label}</button>` : '';
    // 不展示「用法」（给程序/AI的提示）；不放「丢弃」按钮——丢弃＝把道具拖出背包外
    $detail.innerHTML = `
      <div class="bp-dimg">${iconHtml(id)}</div>
      <div class="bp-drow"><span class="k">数量</span><span class="v">×${n}</span></div>
      <div class="bp-drow"><span class="k">类型</span><span class="v2">${it?.type || '—'}</span></div>
      <div class="bp-dtext">${it?.desc || ''}</div>
      <div class="bp-dacts">${useBtn}</div>`;
    if (u) $('#bpUse')?.addEventListener('click', () => useItem(id));
  }
  function discardItem(id) {
    if ((state.inventory[id]?.qty || 0) <= 0) return;
    if (!state.dropped) state.dropped = [];
    state.removeItem(id);
    if (!state.dropped.includes(id)) state.dropped.push(id);
    bus.emit('droppedChanged', {});
    bus.emit('toast', '已丢弃 · ' + (ITEMS[id]?.name || '') + '（落在场景左下角，可拾回）');
    renderGrid();
  }
  function selectItem(id) { selectedId = id; renderGrid(); }

  function useItem(id) {
    const u = USE[id]; if (!u || (state.inventory[id]?.qty || 0) <= 0) return;
    if (u.type === 'sanity') { state.removeItem(id); state.changeSanity(u.amount, u.text, '使用' + (ITEMS[id]?.name || '道具')); refreshHud(); renderGrid(); }
    // 回溯钟：关掉背包，交给 GameScene 弹「滚轮选日」→ 真回溯（不在此消耗道具，回溯确认后才扣）
    else if (u.type === 'rewind') { close(); bus.emit('rewindUse'); }
  }

  // ---------- 操作台开关 ----------
  function openBench(force, animate = true) {
    const was = $bench.classList.contains('open');
    const open = force === undefined ? !was : force;
    $bench.classList.toggle('open', open);
    $benchToggle.classList.toggle('open', open);
    $benchToggle.firstChild && ($benchToggle.childNodes[1].textContent = open ? ' 收起操作台 ' : ' 调出操作台 ');
  }
  $benchToggle.addEventListener('click', () => openBench());

  // ---------- 拖拽 ----------
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  function makeGhost(id) { const g = document.createElement('div'); g.className = 'bp-ghost'; g.innerHTML = `${iconHtml(id)}`; document.body.appendChild(g); return g; }
  function onGridDown(e, id) {
    if ((state.inventory[id]?.qty || 0) <= 0) return;
    e.preventDefault();
    drag = { mode: 'new', itemId: id, startX: e.clientX, startY: e.clientY, started: false, el: null };
    bindMove();
  }
  function startMoveDrag(e, p) {
    e.preventDefault(); e.stopPropagation();
    const r = $surface.getBoundingClientRect();
    drag = { mode: 'move', uid: p.uid, itemId: p.itemId, el: p.el, startX: e.clientX, startY: e.clientY, moved: false, ox: e.clientX - (r.left + p.x), oy: e.clientY - (r.top + p.y) };
    p.el.classList.add('dragging'); bindMove();
  }
  function bindMove() { window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp); }
  function onMove(e) {
    if (!drag) return;
    if (drag.mode === 'new') {
      if (!drag.started) {
        if (Math.abs(e.clientX - drag.startX) > 6 || Math.abs(e.clientY - drag.startY) > 6) { drag.started = true; openBench(true, false); drag.el = makeGhost(drag.itemId); } else return;
      }
      drag.el.style.left = e.clientX + 'px'; drag.el.style.top = e.clientY + 'px';
      const r = $surface.getBoundingClientRect();
      $surface.classList.toggle('dragover', e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom);
      // 拖出背包面板外 → 淡隐整个背包、露出场景底图（可拖进场景放置/丢弃）
      const bp = host.querySelector('.backpack')?.getBoundingClientRect();
      host.classList.toggle('peek', !!(bp && (e.clientX < bp.left || e.clientX > bp.right || e.clientY < bp.top || e.clientY > bp.bottom)));
    } else {
      const r = $surface.getBoundingClientRect();
      const nx = clamp(e.clientX - r.left - drag.ox, 2, r.width - 60), ny = clamp(e.clientY - r.top - drag.oy, 2, r.height - 60);
      drag.el.style.left = nx + 'px'; drag.el.style.top = ny + 'px';
      if (Math.abs(e.clientX - drag.startX) > 5 || Math.abs(e.clientY - drag.startY) > 5) drag.moved = true;
      const p = placed.find((x) => x.uid === drag.uid); if (p) { p.x = nx; p.y = ny; }
    }
  }
  function onUp(e) {
    window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp);
    $surface.classList.remove('dragover');
    if (!drag) return;
    if (drag.mode === 'new') {
      if (!drag.started) { selectItem(drag.itemId); }
      else {
        drag.el.remove();
        const r = $surface.getBoundingClientRect();
        const inSurface = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
        const has = (state.inventory[drag.itemId]?.qty || 0) > 0;
        if (inSurface && has) {
          placeInstance(drag.itemId, clamp(e.clientX - r.left - 29, 2, r.width - 60), clamp(e.clientY - r.top - 29, 2, r.height - 60));
        } else if (has) {
          host.classList.remove('peek');
          const bp = host.querySelector('.backpack')?.getBoundingClientRect();
          const outsideBag = bp && (e.clientX < bp.left || e.clientX > bp.right || e.clientY < bp.top || e.clientY > bp.bottom);
          if (outsideBag) {
            // 先交给「场景放置」(如挂红布)；没接住才算丢弃。拖出后背包自动收起。
            const consumed = opts.onSceneDrop && opts.onSceneDrop(drag.itemId, e.clientX, e.clientY);
            if (consumed) { if (consumed !== 'keep') state.removeItem(drag.itemId); close(); }   // 返回 'keep'=已处理但不消耗(工具复用，如匕首刮青苔)
            else if (ITEMS[drag.itemId]?.discardable) { discardItem(drag.itemId); close(); }
          }
        }
      }
    } else {
      const p = placed.find((x) => x.uid === drag.uid); if (p) p.el.classList.remove('dragging');
      if (!drag.moved) returnToBag(drag.uid);
    }
    drag = null;
  }

  function placeInstance(id, x, y) {
    state.removeItem(id);
    const uid = ++uidSeq; const el = document.createElement('div'); el.className = 'bp-token';
    el.style.left = x + 'px'; el.style.top = y + 'px';
    el.innerHTML = `${iconHtml(id)}<span class="hint">点击收回</span>`;
    const p = { uid, itemId: id, x, y, el };
    el.addEventListener('pointerdown', (ev) => startMoveDrag(ev, p));
    $surface.appendChild(el); placed.push(p);
    renderGrid(); updateEmpty(); evaluate();
  }
  function returnToBag(uid) {
    const i = placed.findIndex((x) => x.uid === uid); if (i < 0) return;
    state.addItem(placed[i].itemId, 1, true); placed[i].el.remove(); placed.splice(i, 1);   // 静默退回(自己的道具收回·不弹获得)
    renderGrid(); updateEmpty(); evaluate();
  }
  function updateEmpty() { $empty.style.display = placed.length ? 'none' : 'flex'; }

  function evaluate() {
    const cur = sig(placed.map((p) => p.itemId));
    const r = RECIPES.find((x) => sig(x.set) === cur && placed.length > 0);
    if (!r) { lastFailSig = ''; setFeedback(placed.length ? '这组道具不构成任何配方——无反应、无反馈、不消耗。' : '把背包里的道具拖到台面上 ▾', 'none'); return; }
    if (r.requireLoc && r.requireLoc !== state.location) {
      if (lastFailSig !== cur) { state.changeSanity(r.failSanity || -5, undefined, '在操作台合成时（原因未知）'); refreshHud(); lastFailSig = cur; }
      setFeedback(r.fail, 'warn'); return;
    }
    lastFailSig = ''; fire(r, cur);
  }
  function fire(r, curSig) {
    // 台面道具：被配方消耗的不退回(净消耗·placeInstance 已从背包扣过)；未消耗的静默退回背包(不弹"获得"·修烧线头反而提示获得火柴/线头的 bug)
    const consume = (r.consume || []).slice();
    placed.slice().forEach((p) => { const ci = consume.indexOf(p.itemId); if (ci >= 0) consume.splice(ci, 1); else state.addItem(p.itemId, 1, true); p.el.remove(); }); placed = [];
    if (r.product) state.addItem(r.product);
    if (r.brighten) { state.redClothLevel = Math.min(3, state.redClothLevel + 1); bus.emit('clothChanged', { level: state.redClothLevel }); }
    if (r.sanity) state.changeSanity(r.sanity, undefined, '在操作台合成时（原因未知）');
    if (r.clue) state.addClue(r.clue.id, r.clue.text);
    refreshHud(); renderGrid(); updateEmpty();
    setFeedback(r.ok, 'ok');
    audio?.play('key_event', { volume: 0.4 });
    // 记下"已合成过"(配方签名 + 产物 id)，供剧情 craft 门判定是否已提前合成，避免门空等 craft 事件死锁
    state.flags.crafted = state.flags.crafted || {};
    state.flags.crafted[curSig] = true; if (r.product) state.flags.crafted[r.product] = true;
    bus.emit('craft', { product: r.product || null, sig: curSig, recipe: r });
  }
  function setFeedback(t, cls) { $feedback.className = 'bp-feedback ' + cls; $feedback.innerHTML = t; }

  // 首次打开背包：一次性引导「道具可拖拽至背包外」
  if (!state.flags.bagHintSeen) {
    state.flags.bagHintSeen = true;
    const hint = document.createElement('div');
    hint.className = 'bp-hint';
    hint.innerHTML = '💡 道具可<b>拖拽到背包外</b> —— 放置到场景 / 丢弃';
    host.appendChild(hint);
    setTimeout(() => hint.classList.add('show'), 80);
    setTimeout(() => { hint.classList.remove('show'); setTimeout(() => hint.remove(), 400); }, 5200);
  }

  renderGrid(); updateEmpty();
  return { close, openBench };
}
