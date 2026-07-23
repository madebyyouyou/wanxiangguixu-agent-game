// 分镜1 · 死亡开场：工位猝死 → 黑屏系统提示 → 进入主神空间（选灵球）。
// 文本取自《前置框架.docx》。
const NARR = [
  '凌晨 2:17。办公室只剩下你的工位还亮着。',
  '光标停在一行未写完的字后。你盯着它看了很久，忽然想不起自己刚才要写什么。',
  '杯底还剩一点冷掉的咖啡。你已经不记得这是今天第几杯。',
  '胸口忽然一阵发紧。你想站起来。身体没有听你的。',
  '屏幕还亮着。你的视线先黑了下去。',
];
const SYS = ['【现实连接中断】', '【生命体征：不可恢复】', '【意识残留：稳定】', '【任务者编号生成中……】'];

export function PrologueScene(ctx) {
  let idx = 0, phase = 'narr';
  return {
    async mount(root) {
      const { scenes, audio } = ctx;
      root.innerHTML = `
        <div class="prologue">
          <div class="office" style="background-image:url('assets/images/bg/BG_OFFICE.webp')"></div>
          <div class="pro-black"></div>
          <div class="pro-text" id="proText"></div>
          <div class="pro-sys" id="proSys"></div>
          <div class="pro-hint" id="proHint">▼ 点击继续</div>
        </div>`;
      const black = root.querySelector('.pro-black');
      const proText = root.querySelector('#proText');
      const proSys = root.querySelector('#proSys');
      const hint = root.querySelector('#proHint');

      const showNarr = () => { proText.textContent = NARR[idx]; proText.classList.add('show'); };
      showNarr();

      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      let busy = false;
      const advance = async () => {
        if (busy) return;                       // 防止转场异步期间重复点击造成重入
        audio.unlock();
        if (phase === 'narr') {
          busy = true;
          proText.classList.remove('show');
          await sleep(400);
          idx++;
          if (idx < NARR.length) { showNarr(); busy = false; return; }
          // 最后一句 → 转黑屏 + 系统提示（整段只跑一次）
          phase = 'sys'; hint.style.display = 'none';
          black.classList.add('show');
          audio.play('fail', { volume: 0.4 });
          await sleep(1400);
          for (let i = 0; i < SYS.length; i++) {
            const line = document.createElement('div'); line.className = 'sys-line'; line.textContent = SYS[i];
            proSys.appendChild(line);
            await sleep(90);
            line.classList.add('show');
            audio.play('ui_cursor', { volume: 0.3 });
            await sleep(700);
          }
          await sleep(600);
          hint.style.display = 'block'; hint.textContent = '▼ 进入主神空间';
          phase = 'done'; busy = false;
        } else if (phase === 'done') {
          busy = true; await scenes.goto('agentselect');
        }
      };
      root.addEventListener('click', advance);
    },
    unmount() {},
  };
}
