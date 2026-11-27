# Security Policy

RemoteAssist handles remote screen content and input. Report security issues carefully and do not include credentials, access or refresh tokens, TURN secrets, screen captures, typed content, or private device identifiers.

## Supported versions

The project is in alpha and does not yet publish a formal support window or security-update SLA. The current development version is `0.15.1-alpha`. Users deploying the signaling service should keep the server and both clients on compatible versions.

## Reporting a vulnerability

A private vulnerability-reporting channel has not yet been configured for this repository. Do not disclose vulnerability details in a public Issue or Pull Request.

Before public release, the repository owner must enable GitHub private vulnerability reporting or publish another monitored private contact method, then update this policy with the actual reporting instructions. Until that is configured, the project cannot promise secure private intake, response times, or coordinated disclosure.

If you can already reach a repository maintainer through an established private channel, ask them to confirm a secure reporting method before sending technical details.

## Scope and response

Security reports may include issues affecting authentication, device ownership, session capabilities, WebSocket handling, ICE/TURN credentials, native capture/input authorization, token storage, or deployment secrets. Do not test against infrastructure or devices you do not own or have explicit authorization to assess.

No response-time commitment or security advisory process has been established yet. Once a private reporting channel is configured, maintainers should acknowledge reports, assess impact, coordinate a fix, and publish an advisory after users have a reasonable opportunity to update.
