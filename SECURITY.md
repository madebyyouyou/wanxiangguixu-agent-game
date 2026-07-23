# Security policy

## Reporting

Please use GitHub Private Vulnerability Reporting through the repository's **Security → Report a vulnerability** entry.

Do not post API Keys, Tokens, passwords, private keys, exploit payloads containing credentials, or other secrets in public issues. The repository owner will never ask a visitor to paste a model Key into the public demo.

## Supported scope

Security reports may cover:

- the optional self-deployed Agent relay;
- request validation and Prompt trust boundaries;
- structured-output handling and deterministic game-state execution;
- accidental credential or private-file exposure in tracked content.

The public game configuration is offline and does not call a model provider. Self-deployers are responsible for platform access control, rate limiting, logs, billing limits, dependency updates, and their own environment variables.

## Asset license boundary

Security disclosure does not change the asset license. Team artwork and video remain subject to [ASSET_LICENSES.md](ASSET_LICENSES.md):

**团队版权所有、仅作品展示，不随代码许可证授权**
