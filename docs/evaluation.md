# Offline evaluation and regression cases

项目使用 Node 原生测试把关键 Agent 行为转成可重复的离线回归，不需要真实模型 Key：

```bash
npm test
```

## Cases

| Case | Input / fault | Expected result | Automated evidence |
|---|---|---|---|
| privileged role | client `system` / `tool` / `developer` message | `400 invalid_role`; provider is not called | `tests/request-validator.test.mjs`, `tests/relay-service.test.mjs` |
| oversized payload | too many messages or excessive content | stable `413` validation error | `tests/request-validator.test.mjs` |
| malformed action | incomplete or invalid JSON | visible reply retained; action is `null` | `tests/response-parser.test.mjs` |
| unknown action | `set_points` | no points or inventory mutation | `tests/game-state-actions.test.mjs` |
| insufficient points | expensive purchase with zero points | rejected by `GameState` | `tests/game-state-actions.test.mjs` |
| missing server Key | self-deployed provider without env | stable missing-key code; relay maps to generic configuration error | `tests/provider.test.mjs`, relay behavior |
| provider failure | injected upstream network failure | provider details redacted; frontend falls back and opens circuit | `tests/relay-service.test.mjs`, `tests/offline-agent.test.mjs` |
| public offline mode | normal player input | no fetch; non-empty offline persona reply | `tests/offline-agent.test.mjs` |
| history bound | completed real-call turn | only latest compact conversation window retained | `tests/offline-agent.test.mjs` |
| asset drift | referenced audio missing or extra | verification fails with path and issue code | `tests/asset-check.test.mjs` |
| secret fixture | constructed provider-style Key | scanner reports rule/path but never suspected value | `tests/security-scan.test.mjs` |

## Full release gate

```bash
npm run verify
```

The full command combines behavioral tests with:

- redacted secret scanning;
- runtime asset consistency;
- tracked-file public boundary checks.

## What this evaluation does not prove

These tests verify deterministic integration boundaries, not subjective dialogue quality. They do not establish production throughput, resistance to every Prompt injection, cross-session memory quality, model factuality, or provider SLA. A future online evaluation should use a dedicated test account, fixed budget, redacted traces, persona rubrics and adversarial prompt cases.
