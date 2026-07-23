// 标题场景：新游戏 / 继续。首次点击解锁音频。
export function BootTitleScene(ctx) {
  return {
    mount(root) {
      const { save, audio, state, scenes } = ctx;
      const hasSave = save.hasAny();
      root.innerHTML = `
        <div class="title-cover"></div>
        <div class="title-wrap title-with-cover">
          <div class="title-menu">
            <button class="tbtn" data-act="new">新 游 戏</button>
            ${hasSave ? '<button class="tbtn" data-act="continue">继 续</button>' : ''}
            <button class="tbtn ghost" data-act="about">关 于</button>
          </div>
          <div class="title-foot">因果轮回 · 穿越万界</div>
        </div>`;

      const onFirst = () => { audio.unlock(); window.removeEventListener('pointerdown', onFirst); };
      window.addEventListener('pointerdown', onFirst);

      root.querySelector('.title-menu').addEventListener('click', async (e) => {
        const btn = e.target.closest('.tbtn'); if (!btn) return;
        audio.unlock(); audio.play('ui_cursor');
        const act = btn.dataset.act;
        if (act === 'new') {
          state.reset();
          await scenes.goto('prologue');
        } else if (act === 'continue') {
          const payload = save.load('auto');
          if (!payload) return;
          if (!state.persona) { await scenes.goto('agentselect'); return; }
          await scenes.goto('game', { resume: true });
        } else if (act === 'about') {
          alert('《渡厄镇 · 万象归墟》\nH5 游戏原型 — 由策划资产搭建。\n\n· 剧情：T01–T25 主线（含分叉/隐藏/回溯/死亡结局）\n· 系统：雀舌 / 乌有 / 枢衡（接 LLM）\n· 嵌入玩法：倒茶 / 窃听 / 怪物追击\n\n提示：当前美术为占位图，把真图按命名放进 assets/images 即自动替换。');
        }
      });
    },
    unmount() {},
  };
}
