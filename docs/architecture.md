# Architecture

## Goal and boundary

《万象归墟》把随行 Agent 嵌入既有 H5 叙事循环，而不是让模型接管游戏。浏览器中的 `GameState`、剧情引擎和小游戏仍是确定性系统；Agent 负责把当前环境解释成具有角色人格的建议，并在协议允许时返回有限动作。

公开配置默认离线，因此静态站点不依赖模型额度、访客 Key 或服务端状态。可选的真实模型路径保留在同一仓库，供开发者用自己的环境变量自行部署。

## Components

| Layer | Responsibility |
|---|---|
| `web/src/core/GameState.js` | 数值、背包、商城、库存和存档等权威游戏状态 |
| `web/src/story/StoryEngine.js` | 剧情推进与推理关卡等待/放行 |
| `web/src/core/AgentClient.js` | 上下文渲染、会话窗口、故障冷却、离线回退 |
| `web/src/agent/responseParser.js` | 宽松提取状态、正文和受支持动作 |
| `server/agent/request-validator.js` | 限制消息角色、条数、单条长度、总量与人格标识 |
| `server/agent/prompt-builder.js` | 在可信服务端组合底座、人格和可选复盘 Prompt |
| `server/agent/relay-service.js` | 校验、调用供应商、统一并脱敏错误 |
| `server/agent/provider.js` | DeepSeek 兼容 OpenAI SDK 的惰性客户端与超时配置 |
| `netlify/functions/chat.js` | HTTP / Serverless 薄适配，不承载业务决策 |

## Data flow

1. `AgentClient.renderStateText()` 从当前确定性状态生成带小标题的上下文。
2. 公开配置直接选择离线人格台词，不产生网络请求。
3. 自行部署启用后，浏览器只提交 `messages`、`persona` 和 `reviewPack`。
4. 服务端拒绝 `system`、`tool`、`developer` 等客户端特权角色，并限制负载大小。
5. 服务端在验证后的普通对话之前加入自己的系统 Prompt，再调用模型。
6. 浏览器解析模型正文和动作；购买必须经过 `GameState.purchase()`，推理信号必须匹配当前活动关卡。
7. 上游连接或超时失败时，前端开启短暂冷却并回退离线人格，游戏主流程继续可用。

## Why a thin server

API Key 只能存在于服务端环境变量，Prompt 信任边界和请求约束也需要在服务端成立。Netlify Function 只做 HTTP 适配，核心逻辑保持为普通 JavaScript 模块，因此可以用 Node 原生测试离线验证，也便于迁移到其他 Serverless 或常驻服务。

## Public deployment choice

仓库保留真实模型集成，是为了展示接口、Prompt 分层、容错和测试能力；公开试玩仍选择离线，因为它不需要公开额度，不诱导访客处理 Key，也不会把个人 Key 暴露到浏览器存储。自行部署步骤见根目录 README。

## Deliberate non-goals

当前实现不是 RAG 系统、跨会话长期记忆、多 Agent 编排平台或高并发模型网关。生产部署还需要身份鉴别、平台级限流、可观测性、预算控制和容量测试。
