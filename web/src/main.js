// 启动装配：创建各服务，注册场景，载入剧情，进入标题。
import { EventBus } from './core/EventBus.js';
import { GameState } from './core/GameState.js';
import { SaveManager } from './core/SaveManager.js';
import { AudioManager } from './core/AudioManager.js';
import { AssetManager } from './core/AssetManager.js';
import { AgentClient } from './core/AgentClient.js';
import { SceneManager } from './core/SceneManager.js';
import { StoryEngine } from './story/StoryEngine.js';
import { STORY } from './data/story.js';

import './ui/liquidGlass.js';   // 液态玻璃折射贴图：boot 时生成边缘斜面位移贴图、升级 #lqGlass/#lqGlassLg（失败静默兜底）

import { BootTitleScene } from './scenes/BootTitleScene.js';
import { PrologueScene } from './scenes/PrologueScene.js';
import { AgentSelectScene } from './scenes/AgentSelectScene.js';
import { DungeonSelectScene } from './scenes/DungeonSelectScene.js';
import { GameScene } from './scenes/GameScene.js';
import { EndingScene } from './scenes/EndingScene.js';

const bus = new EventBus();
const state = new GameState(bus);
const save = new SaveManager(state);
const audio = new AudioManager();
const assets = new AssetManager();
const agent = new AgentClient(state);

// 共享上下文（循环引用：engine/scenes 创建后回填）
const ctx = { bus, state, save, audio, assets, agent };
const engine = new StoryEngine(ctx);
engine.load(STORY);
ctx.engine = engine;

const root = document.getElementById('app');
const overlay = document.getElementById('fx-overlay');
const scenes = new SceneManager(root, overlay, ctx);
ctx.scenes = scenes;

scenes.register('title', BootTitleScene);
scenes.register('prologue', PrologueScene);
scenes.register('agentselect', AgentSelectScene);
scenes.register('dungeonselect', DungeonSelectScene);
scenes.register('game', GameScene);
scenes.register('ending', EndingScene);

// 结局事件兜底（GameScene 已主动跳转，此处防御）
bus.on('ending', (seg) => { if (scenes.currentName !== 'ending') scenes.goto('ending', { ending: seg }); });

// 新游戏/重开本副本/返回标题(state.reset)→ 清掉随行上一局的对话残留(uiLog/history)，避免新局串出上局台词（如没试聊直接绑定、或结局重开）
bus.on('gameReset', () => agent.resetSession());

// 全局轻提示（任意场景可 bus.emit('toast', '...')）
bus.on('toast', (msg) => {
  const layer = document.getElementById('toast-layer'); if (!layer) return;
  const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg;
  layer.appendChild(t); setTimeout(() => t.classList.add('show'), 16);
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 400); }, 1900);
});

// 暴露到 window 便于调试
window.__game = { bus, state, save, audio, assets, agent, engine, scenes };

scenes.goto('title', {}, { fade: false });
