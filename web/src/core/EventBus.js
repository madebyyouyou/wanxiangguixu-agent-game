// 极简事件总线，解耦各模块通信
export class EventBus {
  constructor() { this._map = new Map(); }
  on(evt, fn) {
    if (!this._map.has(evt)) this._map.set(evt, new Set());
    this._map.get(evt).add(fn);
    return () => this.off(evt, fn);
  }
  once(evt, fn) {
    const wrap = (p) => { this.off(evt, wrap); fn(p); };
    return this.on(evt, wrap);
  }
  off(evt, fn) { this._map.get(evt)?.delete(fn); }
  emit(evt, payload) {
    this._map.get(evt)?.forEach((fn) => {
      try { fn(payload); } catch (e) { console.error(`[bus:${evt}]`, e); }
    });
  }
}
