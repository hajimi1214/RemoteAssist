# Support

RemoteAssist is alpha software. Features, deployment instructions, and platform behavior may change. There is no paid support or guaranteed response time.

## Before asking for help

- Check the [README](README.md), [Chinese overview](README.zh-CN.md), [known limitations](docs/known-limitations.md), and [self-hosted deployment guide](docs/public-server-deployment.md).
- For two Windows PCs on one LAN, use the [LAN acceptance runbook](docs/lan-two-pc-runbook.md).
- Search existing GitHub Issues for the same symptom.
- Record the RemoteAssist version or commit, Windows version, host and controller roles, service type, connection route, and reproducible steps.
- Mark validation as `PASS`, `FAIL`, or `NOT VERIFIED`. Synthetic loopback evidence does not establish physical two-PC behavior.

## Bug reports and feature requests

Use the repository's Bug report or Feature request Issue form. Remove passwords, tokens, private keys, TURN credentials, full server URLs containing private hostnames, public IP addresses, screen contents, typed text, and device identifiers.

Do not use public Issues for security vulnerabilities. The private vulnerability-reporting channel is not configured yet. See [Security Policy](SECURITY.md).

## Support boundaries

The project does not operate a public signaling server, TURN service, or media relay. Maintainers cannot inspect or recover user-hosted service data. Users are responsible for their own server, backups, credentials, network exposure, and access control.
