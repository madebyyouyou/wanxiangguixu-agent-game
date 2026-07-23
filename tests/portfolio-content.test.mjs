import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const requiredPlanning = [
  'planning/core/Design_Philosophy_Outline.xmind',
  'planning/core/Item_Database_Sheet.xlsx',
  'planning/core/Main_Storyline_Planning_Config.xlsx',
  'planning/core/Player_Sanity_and_Point_System.xlsx',
  'planning/core/System_Agent_Personality_Settings.docx',
  'planning/core/Text_Flow_and_Full_Storyline.docx',
  'planning/core/WanXiangGuiXu_Intro.docx',
  'planning/minigames/T12_Eavesdropping_Mechanic_Design.xlsx',
  'planning/minigames/T16_Monster_Chase_Demo.html',
  'planning/minigames/T16_Monster_Chase_Gameplay_Design.xlsx',
  'planning/minigames/Tea_Pouring_Demo.html',
  'planning/minigames/Tea_Pouring_Demo_Design.xlsx',
  'showcase/trailer/万象归墟_宣传片.mp4',
  'showcase/trailer/万象归墟_宣传片封面.png',
];
const expectedAgentFiles = [
  'Agent_System_1_QueShe.md',
  'Agent_System_2_WuYou.md',
  'Agent_System_3_ShuHeng.md',
  'Agent_System_Base.md',
  'CombinedLLMExample_新版传参示例.json',
  'README_总目录.md',
  '万象归墟_灵球选择界面.html',
  '复盘真相包.md',
  '渡厄镇_op_hint对照.json',
  '渡厄镇_游戏数据.json',
  '程序对接说明.md',
  '道具用法与操作清单.md',
].sort();

test('curated planning set and final trailer exist', () => {
  for (const file of requiredPlanning) {
    assert.equal(existsSync(join(root, file)), true, file);
  }
});

test('showcase contains no draft or edit project', () => {
  const names = readdirSync(join(root, 'showcase/trailer'));

  assert.deepEqual(names.sort(), [
    '万象归墟_宣传片.mp4',
    '万象归墟_宣传片封面.png',
  ]);
});

test('public boundary accepts the final trailer and its cover', () => {
  const result = spawnSync(
    process.execPath,
    ['scripts/check-public-boundary.mjs'],
    { cwd: root, encoding: 'utf8' },
  );

  assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
});

test('Agent planning directory contains only the explicit public allowlist', () => {
  const names = readdirSync(join(root, 'planning/agent')).sort();

  assert.deepEqual(names, expectedAgentFiles);
});
