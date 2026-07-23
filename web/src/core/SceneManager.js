// 场景管理：注册/切换，带淡入淡出过场。
// 每个场景实现 { mount(root, ctx, params), unmount() }
export class SceneManager {
  constructor(root, overlay, ctx) {
    this.root = root;
    this.overlay = overlay;     // #fx-overlay
    this.ctx = ctx;
    this.scenes = new Map();
    this.current = null;
    this.currentName = null;
  }

  register(name, factory) { this.scenes.set(name, factory); }

  async goto(name, params = {}, { fade = true } = {}) {
    const factory = this.scenes.get(name);
    if (!factory) { console.error(`未知场景: ${name}`); return; }

    if (fade) await this._fade(1);

    if (this.current?.unmount) {
      try { this.current.unmount(); } catch (e) { console.error(e); }
    }
    this.root.innerHTML = '';

    const scene = factory(this.ctx);
    this.current = scene;
    this.currentName = name;
    const el = document.createElement('div');
    el.className = `scene scene-${name}`;
    this.root.appendChild(el);
    await scene.mount(el, this.ctx, params);

    this.ctx.bus.emit('sceneChanged', { name });
    if (fade) await this._fade(0);
  }

  _fade(to) {
    // 不用 requestAnimationFrame：页面不在前台时 rAF 会被暂停，导致过场永不结束。
    return new Promise((resolve) => {
      this.overlay.style.transition = 'opacity .4s ease';
      this.overlay.style.pointerEvents = to ? 'auto' : 'none';
      void this.overlay.offsetWidth;            // 强制重排，确保 CSS 过渡生效
      this.overlay.style.opacity = String(to);
      setTimeout(resolve, 420);
    });
  }
}
