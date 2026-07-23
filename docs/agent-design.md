# Agent design

## From game design to an executable contract

这个项目原本就有完整的随行 Agent 协议：人格 Prompt、状态文本、输出标签、商城兑换和推理关卡都已在游戏中实现。本次公开仓库改造没有重新发明玩法，而是把既有协议拆成可测试模块，明确客户端/服务端边界，并删除浏览器伪签名。

## Context construction

`AgentClient.renderStateText()` 每轮按需组织以下区块：

- 当前进度与现场；
- 已经历事件、线索和规则；
- 清醒值与积分；
- 背包物品、用法和当前可执行操作；
- 商城价格与剩余库存；
- 红布、回溯、死亡和侵染等特殊状态；
- 当前节点指令、风险拦截或玩家输入；
- 推理关卡的当前判定标准。

这是一种显式的 Context Engineering：模型看到的是经过业务代码选择和标注的当前状态，而不是自行猜测整个游戏世界。

## Trusted Prompt and untrusted conversation

自行部署路径中，公共底座、所选人格和复盘真相包由服务端加载并组合。浏览器只能提交 `user` / `assistant` 消息；客户端提交的 `system`、`tool` 或 `developer` 角色会在供应商调用前被拒绝。

这条限制的含义不是“玩家不能在文本里尝试注入”，而是玩家不能在 API 结构层伪装成更高优先级角色。普通文本中的 Prompt 注入仍是风险，因此还需要动作白名单与确定性校验兜底。

## Structured output and state execution

模型可返回：

```text
<state>平静</state>
正文
<action>{"type":"purchase","item_id":"ITEM_MATCH","qty":1}</action>
```

解析器容忍缺失标签、全角标点和异常 JSON；异常动作会从可见正文中清理，但不会执行。

“模型输出不直接改变状态”在本项目里的具体含义是：这套游戏协议本来就把模型结果当作请求。`AgentClient.applyAction()` 只接受已有的 `purchase` 类型，再调用 `GameState.purchase()` 核对商品、数量、积分和库存。`insight` 则由当前游戏场景检查动作类型、成功标记和关卡 key，匹配后才通过事件总线放行剧情。未知的 `set_points` 一类动作不会生效。

## Why a 12-message sliding window

真实模型路径只保留最近 12 条压缩对话消息；每轮完整游戏状态会重新生成，因此历史主要负责保留说话脉络，而不是复制世界状态。

选择简单滑动窗口是有意的取舍：

- 单人叙事会话短，状态权威来源已经是本地 `GameState`；
- 不需要服务端保存玩家长期对话，隐私边界更清晰；
- 请求大小和模型成本可预测；
- 不引入向量库、召回质量和跨会话一致性等额外故障面。

代价是较早的对话细节会遗忘。合理的下一步是把被裁掉的回合压缩为受约束摘要，并用离线用例评估事实保持率；当前仓库没有实现或声称 RAG/长期记忆。

## Offline and failure behavior

公开配置的 `enabled` 为 `false`，`ask()` 直接返回对应人格的离线台词。自行部署启用后，连接失败或超时会触发离线回退，并开启短暂冷却，避免每句对话都重复等待不可用的上游。该行为通过可注入配置的测试覆盖。

## Known limits

- 人格质量主要依赖 Prompt 和当前上下文，没有模型微调。
- 结构化输出采用 tolerant parsing，不等价于供应商原生 JSON Schema 保证。
- 没有跨用户服务端记忆或对话数据库。
- 没有任务拆解、多工具编排或多 Agent 协作。
