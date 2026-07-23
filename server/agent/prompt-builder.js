'use strict';

const fs = require('node:fs');
const path = require('node:path');

const FILES = Object.freeze({
  base: 'Agent_System_Base.md',
  queshe: 'Agent_System_1_QueShe.md',
  wuyou: 'Agent_System_2_WuYou.md',
  shuheng: 'Agent_System_3_ShuHeng.md',
  review: '复盘真相包.md',
});

function loadPrompts(dir = path.join(__dirname, '..', 'prompts')) {
  return Object.fromEntries(
    Object.entries(FILES).map(([key, file]) => [
      key,
      fs.readFileSync(path.join(dir, file), 'utf8'),
    ]),
  );
}

function buildSystemMessages(persona, reviewPack, prompts) {
  const selected = prompts[persona] || prompts.queshe;
  const messages = [{
    role: 'system',
    content: `${prompts.base}\n\n========\n\n${selected}`,
  }];

  if (reviewPack) {
    messages.push({
      role: 'system',
      content: `【复盘真相包】\n${prompts.review}`,
    });
  }
  return messages;
}

module.exports = { FILES, loadPrompts, buildSystemMessages };
