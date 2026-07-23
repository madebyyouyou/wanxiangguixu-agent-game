// 存档系统：localStorage 多槽位（auto + 手动 1/2/3）
const PREFIX = 'duezhen_save_';
const AUTO = 'auto';

export class SaveManager {
  constructor(state) { this.state = state; }

  _key(slot) { return PREFIX + slot; }

  save(slot = AUTO, meta = {}) {
    const payload = {
      version: 1,
      savedAt: new Date().toISOString(),
      label: `第${this.state.day}天·${this.state.time}·${this.state.location}`,
      persona: this.state.persona,
      progress: this.state.lastEvent || '序章',
      data: this.state.toJSON(),
      ...meta,
    };
    try {
      localStorage.setItem(this._key(slot), JSON.stringify(payload));
      return true;
    } catch (e) { console.error('[save]', e); return false; }
  }

  autosave() { return this.save(AUTO); }

  load(slot = AUTO) {
    const raw = localStorage.getItem(this._key(slot));
    if (!raw) return null;
    try {
      const payload = JSON.parse(raw);
      this.state.loadJSON(payload.data);
      return payload;
    } catch (e) { console.error('[load]', e); return null; }
  }

  peek(slot) {
    const raw = localStorage.getItem(this._key(slot));
    if (!raw) return null;
    try { const p = JSON.parse(raw); return { slot, ...p, data: undefined }; }
    catch { return null; }
  }

  list() {
    return [AUTO, '1', '2', '3'].map((s) => this.peek(s)).filter(Boolean);
  }

  hasAny() { return this.list().length > 0; }

  remove(slot) { localStorage.removeItem(this._key(slot)); }
}

export const AUTO_SLOT = AUTO;
