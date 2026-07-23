// 液态玻璃·折射贴图（自写实现，未照搬任何仓库代码）
// 原理（公开通用做法，各液态玻璃项目同此）：用 canvas 生成一张"圆角矩形边缘斜面"位移贴图——
// 中心平整(无位移)、四边附近法线向内陡升(像凸透镜的厚边)，再喂给 SVG <feDisplacementMap>，
// 让 backdrop-filter 把"身后的场景"在玻璃边缘处折射弯曲（中间清透、边缘聚光），这才是苹果液态玻璃的关键。
// 仅 Chromium 的 backdrop-filter:url(#滤镜) 会真正出折射；其余浏览器 CSS @supports 已自动退回毛玻璃。
// 失败一律静默兜底（保留 index.html 里的湍流滤镜 / 纯 CSS 玻璃），绝不影响游戏运行。

const SVGNS = 'http://www.w3.org/2000/svg';
const XLINK = 'http://www.w3.org/1999/xlink';

// 生成边缘斜面位移贴图：R 通道=水平位移、G 通道=垂直位移（128=不位移）。
// edge=斜面带宽(贴图像素)，curve 用平方让中心更平、越靠边越陡（透镜感）。
function bevelMapURL(w, h, edge, amp) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d'); const im = ctx.createImageData(w, h); const d = im.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dl = x, dr = w - 1 - x, dt = y, db = h - 1 - y;
      const dxe = dl < dr ? dl : dr, dye = dt < db ? dt : db;
      let nx = 0, ny = 0;
      if (dxe < edge) { const t = 1 - dxe / edge; nx = (dl < dr ? 1 : -1) * t * t; }   // 边缘向内的法线
      if (dye < edge) { const t = 1 - dye / edge; ny = (dt < db ? 1 : -1) * t * t; }
      const i = (y * w + x) * 4;
      d[i]     = 128 + nx * amp;   // R → x 位移
      d[i + 1] = 128 + ny * amp;   // G → y 位移
      d[i + 2] = 128;              // B 不用
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(im, 0, 0);
  return cv.toDataURL();
}

function buildFilter(id, mapW, mapH, edge, scale) {
  const url = bevelMapURL(mapW, mapH, edge, 120);
  const f = document.createElementNS(SVGNS, 'filter');
  f.setAttribute('id', id);
  f.setAttribute('x', '-20%'); f.setAttribute('y', '-20%');
  f.setAttribute('width', '140%'); f.setAttribute('height', '140%');
  f.setAttribute('color-interpolation-filters', 'sRGB');
  const fe = document.createElementNS(SVGNS, 'feImage');
  fe.setAttribute('href', url); fe.setAttributeNS(XLINK, 'xlink:href', url);
  fe.setAttribute('x', '0'); fe.setAttribute('y', '0');
  fe.setAttribute('width', '100%'); fe.setAttribute('height', '100%');
  fe.setAttribute('preserveAspectRatio', 'none'); fe.setAttribute('result', 'lqmap');
  const dm = document.createElementNS(SVGNS, 'feDisplacementMap');
  dm.setAttribute('in', 'SourceGraphic'); dm.setAttribute('in2', 'lqmap');
  dm.setAttribute('scale', String(scale));
  dm.setAttribute('xChannelSelector', 'R'); dm.setAttribute('yChannelSelector', 'G');
  f.appendChild(fe); f.appendChild(dm);
  return f;
}

function install() {
  try {
    const defs = document.getElementById('lq-glass-defs');
    if (!defs || !document.createElement('canvas').getContext) return;
    const put = (filter) => {
      const old = document.getElementById(filter.id);
      if (old) old.replaceWith(filter); else defs.appendChild(filter);
    };
    put(buildFilter('lqGlass', 300, 120, 20, 30));     // 气泡：窄边带+较强折射，边缘弯得更明显
    put(buildFilter('lqGlassLg', 480, 360, 64, 44));   // 场景随行框：厚边、强折射
  } catch (e) { /* 静默：退回 index.html 湍流滤镜 / 纯 CSS 玻璃 */ }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
else install();
