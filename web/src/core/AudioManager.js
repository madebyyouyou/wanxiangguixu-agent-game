// 音频管理：一次性音效 + 循环环境音；音量/静音。
import { AUDIO, LOOPING } from '../../assets/manifest.js';

const BASE = 'assets/audio/';

export class AudioManager {
  constructor() {
    this.cache = new Map();
    this.loops = new Map();      // key -> Audio（循环中）
    this.muted = false;
    this.volume = 0.7;
    this.enabled = false;        // 首次用户交互后置 true（绕过自动播放限制）
    this.bgm = null;             // 专用 BGM 通道：独立于 loops，stopAllLoops 不影响它（贯穿主玩法、不被小游戏打断）
    this._bgmKey = null;
  }

  unlock() { this.enabled = true; if (this.bgm && !this.muted) this.bgm.play().catch(() => {}); }

  _get(key) {
    const file = AUDIO[key];
    if (!file) return null;
    if (!this.cache.has(key)) {
      const a = new Audio(BASE + encodeURIComponent(file));
      a.preload = 'auto';
      this.cache.set(key, a);
    }
    return this.cache.get(key);
  }

  play(key, { volume } = {}) {
    if (this.muted || !this.enabled) return;
    const src = this._get(key);
    if (!src) return;
    // 克隆以支持快速重叠播放
    const node = src.cloneNode();
    node.volume = (volume ?? 1) * this.volume;
    node.play().catch(() => {});
  }

  loop(key, { volume } = {}) {
    if (this.loops.has(key)) return;
    const a = this._get(key);
    if (!a) return;
    a.loop = true;
    a.volume = (volume ?? 0.5) * this.volume;
    this.loops.set(key, a);
    if (this.enabled && !this.muted) a.play().catch(() => {});
  }

  stopLoop(key) {
    const a = this.loops.get(key);
    if (a) { a.pause(); a.currentTime = 0; this.loops.delete(key); }
  }

  stopAllLoops() { [...this.loops.keys()].forEach((k) => this.stopLoop(k)); }

  // ---- BGM 专用通道：独立于 loops，stopAllLoops 不会停它（小游戏不会打断主玩法配乐）----
  setBgm(key, { volume = 0.5 } = {}) {
    if (this._bgmKey === key && this.bgm) { this.bgm.volume = volume * this.volume; return; }
    this.stopBgm();
    const a = this._get(key); if (!a) return;
    a.loop = true; a.volume = volume * this.volume;
    this.bgm = a; this._bgmKey = key;
    if (this.enabled && !this.muted) a.play().catch(() => {});
  }
  stopBgm() { if (this.bgm) { this.bgm.pause(); this.bgm.currentTime = 0; } this.bgm = null; this._bgmKey = null; }
  pauseBgm() { if (this.bgm) this.bgm.pause(); }
  resumeBgm() { if (this.bgm && this.enabled && !this.muted) this.bgm.play().catch(() => {}); }

  setMuted(m) {
    this.muted = m;
    this.loops.forEach((a) => { if (m) a.pause(); else if (this.enabled) a.play().catch(() => {}); });
    if (this.bgm) { if (m) this.bgm.pause(); else if (this.enabled) this.bgm.play().catch(() => {}); }
  }

  isLooping(key) { return LOOPING.has(key); }
}
