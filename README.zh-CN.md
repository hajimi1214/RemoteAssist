# RemoteAssist

RemoteAssist 是一个面向自托管和局域网使用的 Windows 远程桌面项目。项目作者不提供或运营公共信令服务器、TURN 服务器或中继流量服务。用户需要配置自己运营、信任且有权使用的服务端。桌面正式构建不会默认连接作者或未经用户选择的第三方公共服务器。

项目目前仍处于 `0.15.1-alpha`。本仓库尚未选择项目级开源许可证，因此在版权持有人确认前，不应把当前源码描述为已经正式采用某一开源许可证。

## 当前功能

- **我的设备**通过同一账号下的设备列表发起直连。
- **远程协助**由主机生成一次性八位码，另一位已登录用户输入该码连接。
- Windows 客户端保持可见，主机可暂停或结束控制。
- 视频通过 WebRTC 传输。局域网和可直连网络优先 P2P，TURN 用于 NAT 或防火墙阻止直连时的中继候选。
- Go 信令服务支持内存存储与 PostgreSQL 账号、设备数据。
- Docker Compose 部署配置包括 Go 信令服务、PostgreSQL、Coturn 和 Caddy。
- Android ARM64 控制端构建路径已存在，但当前版本的真实设备验收仍待完成。

功能状态和验证边界见[验证矩阵](docs/verification-matrix.md)及[已知限制](docs/known-limitations.md)。构建成功或合成浏览器回环不能替代第二台真实电脑、公网部署或 TURN 中继的验收。

## 服务端选择与连接

RemoteAssist 不要求使用官方云服务。可以在可信局域网启动测试信令服务，也可以按[自建服务端指南](docs/public-server-deployment.md)部署自己的 HTTPS 信令和 TURN 服务。所有客户端必须配置到同一个服务端。

正式客户端应使用 HTTPS/WSS 服务。仅为隔离的局域网测试提供的 HTTP 构建不能用于公网或生产部署。信令服务器转发认证、会话和 WebRTC 协商消息，视频和输入数据通道由 WebRTC 在客户端之间传输，无法直连时媒体可能经用户部署的 TURN 中继。

## Windows 本地开发

需要 Node.js 24、Go 1.26.11 和稳定版 Rust 工具链。首次安装前端依赖并运行测试：

```powershell
npm ci
npm test
npm run build
```

分别在两个 PowerShell 窗口中启动本地信令服务和 Tauri 客户端：

```powershell
.\scripts\dev.ps1 -Mode Server
```

```powershell
.\scripts\dev.ps1
```

本地 `Server` 模式只监听 `127.0.0.1:8080`，账号和设备使用内存存储。两个 Windows 客户端的局域网验收步骤见[双机测试手册](docs/lan-two-pc-runbook.md)。

服务器端和原生客户端的完整回归可以运行：

```powershell
.\scripts\test.ps1
```

## 自建部署

将 `deploy/.env.example` 复制为 `deploy/.env`，为域名、数据库密码、Token 签名密钥和 TURN 共享密钥设置唯一强随机值，然后运行部署配置校验和 Compose：

```powershell
Copy-Item deploy/.env.example deploy/.env
.\scripts\verify-deploy-config.ps1
docker compose --env-file deploy/.env -f deploy/docker-compose.yml up -d --build
docker compose --env-file deploy/.env -f deploy/docker-compose.yml run --rm --entrypoint /signaling-migrate signaling
```

完整端口、TLS、数据库备份/恢复、升级和回滚步骤见[部署指南](docs/public-server-deployment.md)。实时公网 TLS、P2P 和 TURN 运行尚未被本项目验证。

## 安全边界

RemoteAssist 不实现远程 Shell、命令或脚本执行、静默安装、隐藏运行、默认开机自启、UAC 绕过、Defender 规避、凭据抓取、键盘记录或会话结束后的采集。请勿在公开 Issue 中发布密码、Token、服务器密钥、屏幕画面或输入内容。

当前仓库尚未配置完整的私密漏洞报告流程。正式公开前应编写 `SECURITY.md` 并设置 GitHub 私密漏洞接收方式。许可证状态、第三方依赖和未完成的开源准备事项见[G0 审计报告](docs/g0-open-source-audit.md)。

## 参与项目

开发环境、测试要求和补丁提交方式见[贡献指南](CONTRIBUTING.md)。提交 Issue 或 PR 前请阅读模板，并在已有测试上标明 `PASS`、`FAIL` 或 `NOT VERIFIED`。
