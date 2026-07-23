# Security model

## Deployment modes

### Public portfolio mode

- `web/src/config/agent.js` 默认 `enabled: false`。
- 浏览器不发起模型请求，不显示 BYOK 输入框，也不把 Key 写入 `localStorage`。
- 游戏通过离线人格台词保持可玩。

### Self-deployed model mode

- 部署者使用自己的供应商 Key。
- `DEEPSEEK_API_KEY` 只从服务端环境变量读取。
- `.env.example` 只提供占位符；真实 `.env` 被 `.gitignore` 排除。
- 浏览器只调用同源 `/api/chat`，不会收到供应商 Key。

## Trust boundaries

| Input | Trust | Enforcement |
|---|---|---|
| Server Prompt files | trusted repository/deployment content | only server loads and prepends |
| Browser messages | untrusted | roles, count, per-message size and total size validated |
| Persona/review flags | untrusted | explicit allowlist and boolean validation |
| Model response | untrusted | tolerant parse followed by action-specific checks |
| `GameState` | authoritative local state | validates purchases and emits state changes |

消息约束用于防止浏览器在 API 结构层提交特权角色，同时限制单次费用和资源占用。它不等于解决所有自然语言 Prompt 注入。

## Error handling

供应商错误不会原样返回浏览器：

- 服务端未配置 Key → `model_not_configured`；
- 其他供应商失败 → `model_provider_error`；
- 非法请求 → 稳定的校验错误码。

前端把上游连接/超时失败视为可降级故障，进入短暂冷却并使用离线人格响应。

## Removed browser signature

旧实现让浏览器根据时间戳计算 SHA-256 token。算法、偏移和输入都在客户端，不能证明请求来自可信主体，也不能保护供应商 Key；它只增加时钟同步和失败点。本次改造删除了 `/api/time`、浏览器签名和相应节流逻辑，改用真正的服务端 Key 边界与请求验证。

## Residual risks

- Prompt 注入被分层和动作验证降低，但没有被消除。
- 自行部署者必须在平台侧配置身份鉴别、速率限制、预算告警和日志脱敏。
- 当前 Serverless 适配器没有分布式限流或用户配额。
- 第三方模型和 npm 依赖仍需要持续更新与供应链审查。
- 团队美术/视频的授权是许可边界，不是技术访问控制；详见 `ASSET_LICENSES.md`。

## Repository controls

`npm run verify` 会运行：

- 不回显疑似值的敏感信息扫描；
- 禁止环境文件、私钥后缀、依赖/构建目录和 Unity 内容进入跟踪集；
- 音频清单、缺失资源和重复 Agent 图片编码检查；
- 协议、降级、输入验证和状态动作的离线测试。
