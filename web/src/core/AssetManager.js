// 图片资源：优先加载用户提供的真图，缺失则生成氛围占位图。
// 约定：把图片按 <id>.png / .jpg / .webp 放进 assets/images/<分类>/ 即自动替换占位。
//   分类：bg(场景底图) char(立绘/特写) icon(道具图标) fx(特效)
import { IMAGE_LABELS, ICON_PLACEHOLDER } from '../../assets/manifest.js';

const BASE = 'assets/images/';
const EXTS = ['webp', 'png', 'jpg', 'jpeg'];   // webp 优先（压缩后资产为 webp；缺失才回退旧格式）

export class AssetManager {
  constructor() { this._cache = new Map(); }

  _tryLoad(url) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(true);
      img.onerror = () => resolve(false);
      img.src = url;
    });
  }

  // 返回真图 url 或 null（按扩展名依次尝试，结果缓存）
  async resolve(cat, id) {
    const cacheKey = cat + '/' + id;
    if (this._cache.has(cacheKey)) return this._cache.get(cacheKey);
    let found = null;
    for (const ext of EXTS) {
      const url = `${BASE}${cat}/${id}.${ext}`;
      // eslint-disable-next-line no-await-in-loop
      if (await this._tryLoad(url)) { found = url; break; }
    }
    this._cache.set(cacheKey, found);
    return found;
  }

  label(id) { return IMAGE_LABELS[id] || id; }
  icon(iconId) { return ICON_PLACEHOLDER[iconId] || '▩'; }

  // 由 id 派生一个稳定的占位渐变（冷色"浅水阈限"基调）
  placeholderGradient(id) {
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360;
    const a = 180 + (h % 60);      // 冷色相 180~240
    const b = (a + 40) % 360;
    return `linear-gradient(160deg,
      hsl(${a} 18% 26%) 0%,
      hsl(${b} 22% 16%) 60%,
      hsl(${(b + 20) % 360} 25% 10%) 100%)`;
  }
}
