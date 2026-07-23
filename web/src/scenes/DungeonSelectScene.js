// 分镜3 · 副本选择（按效果图）：渡厄镇封面（可进入）+ 两个未解锁副本 + 标签 + 简介。
export function DungeonSelectScene(ctx) {
  return {
    async mount(root) {
      const { scenes, audio, assets } = ctx;
      const coverUrl = (await assets.resolve('bg', 'COVER_DUEZHEN')) || 'assets/images/bg/COVER_DUEZHEN.webp';
      const lockUrl = (await assets.resolve('bg', 'BG001a')) || '';
      const motes = Array.from({ length: 16 }).map(() => '<span></span>').join('');
      root.innerHTML = `
        <div class="dsel">
          <div class="dsel-motes">${motes}</div>
          <div class="dsel-top">
            <button class="dsel-back">◇ 返回</button>
            <div class="dsel-title"><span class="t-deco">────</span> ·· 副 本 选 择 ·· <span class="t-deco">────</span></div>
            <div class="dsel-spacer"></div>
          </div>
          <div class="dsel-stage">
            <div class="dsel-side">
              <div class="dsel-q">？ ？ ？</div>
              <div class="dsel-lockcard" style="background-image:url('${lockUrl}')"><div class="lock">🔒</div></div>
            </div>
            <div class="dsel-center">
              <div class="dsel-name">渡 厄 镇</div>
              <div class="dsel-cover" title="进入渡厄镇">
                <img src="${coverUrl}" onerror="this.style.display='none'">
                <div class="dsel-enterlabel">可 进 入</div>
              </div>
              <div class="dsel-tags"><span>规则怪谈</span><span>中式诡异</span><span>烧脑解谜</span></div>
              <div class="dsel-intro">简介：渡厄镇不收活人，却总有外乡人走进来。你看到的是镇，它们见到的是阵。</div>
            </div>
            <div class="dsel-side">
              <div class="dsel-q">？ ？ ？</div>
              <div class="dsel-lockcard" style="background-image:url('${lockUrl}')"><div class="lock">🔒</div></div>
            </div>
          </div>
        </div>`;
      const enter = () => { audio.play('key_event', { volume: 0.5 }); scenes.goto('game', { newGame: true }); };
      root.querySelector('.dsel-cover').addEventListener('click', enter);
      root.querySelector('.dsel-back').addEventListener('click', () => { audio.play('ui_cursor', { volume: 0.4 }); scenes.goto('agentselect'); });
      root.querySelectorAll('.dsel-lockcard').forEach((c) => c.addEventListener('click', () => ctx.bus.emit('toast', '该副本尚未解锁')));
    },
    unmount() {},
  };
}
