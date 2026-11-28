# 在阿里云 ECS 上部署 RemoteAssist

ECS 负责登录、设备在线状态和连接协商。游戏继续在被控 Windows 电脑上运行和编码。UDP 直连成功时，画面和输入直接走两台设备之间的链路；直连不可用时，Coturn 才会转发媒体和输入。

## ECS 和安全组

1. 选择两端实际路由较好的地域。跨运营商或跨境时，先用两端实际网络测试到该地域的往返延迟和丢包。ECS 带宽不会改善已建立的设备直连。
2. 准备装有 Docker Engine 和 Docker Compose v2 的 Linux ECS，绑定公网 IPv4 或 EIP。内地地域先核对域名与备案要求。将信令域名的 A 记录指向 EIP；TURN 也可用独立的 A 记录。TURN 域名应直接解析到 EIP，普通 HTTP CDN 和仅支持 HTTP 的代理无法转发 TURN UDP。
3. 在 ECS 安全组和主机防火墙放行下表端口。SSH 仅对管理来源开放。若自定义出站限制，允许实际中继对端的 UDP 流量，以及 DNS、镜像下载和签发证书所需出网；UDP 对端端口由对端分配。PostgreSQL `5432` 和信令容器 `8080` 留在 Docker 内网。Docker 会为已发布端口设置转发规则，不能只靠 UFW 的 INPUT 策略限制它们。

| 入方向 | 用途 |
| --- | --- |
| TCP 80、443 | Caddy 证书签发、HTTPS 和 WebSocket |
| UDP 3478 | 客户端首选的 TURN 路径 |
| TCP 3478 | 客户端无法用 UDP 连接 TURN 时的备用路径 |
| UDP 49152–49200 | 默认媒体中继端口；调整范围时同步改安全组及防火墙 |

## 配置和启动

按 `deploy/.env.example` 准备服务器专用的 `deploy/.env`。关键字段如下：

- `PUBLIC_DOMAIN` 是信令域名，`PUBLIC_BASE_URL` 是同一域名的 HTTPS 根地址。数据库密码和三种令牌或中继密钥分别使用独立的随机值。不要复用本地测试账号。Linux 上将 `deploy/.env` 文件权限设为 `0600`。
- `TURN_EXTERNAL_IP` 填 ECS 公网 IPv4/EIP，不带斜杠或私有地址。Coturn 在独立的 Docker 网段 `TURN_RELAY_SUBNET` 上绑定 `TURN_RELAY_IP`；默认分别为 `172.30.218.0/28` 和 `172.30.218.2`。若与 ECS VPC、VPN 或现有 Docker 网络重叠，同时修改这两项。Compose 以 `EIP/容器地址` 公布映射，EIP 和 Docker 发布的 UDP 中继端口必须保持原端口号。
- `TURN_URLS` 中填实际域名，例如用实际 TURN 域名替换 `turn:域名:3478?transport=udp` 和 `turn:域名:3478?transport=tcp` 中的「域名」。TCP 是客户端到 TURN 的备用连接，媒体中继端点仍使用 UDP。当前模板支持 `turn:`，WebRTC 媒体仍由 WebRTC 自身加密。短期 TURN 凭据由信令服务发放。
- Coturn 拒绝向常见私有网段、链路本地地址和多播地址转发。公网中继不应能访问 ECS 元数据地址或 VPC 私有服务。设备直接建立的局域网 P2P 不经过 Coturn。

可先用不含生产密钥的配置运行 `pwsh -File scripts/verify-deploy-config.ps1 -EnvFile <路径>`。若 ECS 安装了 PowerShell 7，也可在那里验证正式配置；仅运行第一条 Compose 命令时，只做基本静态检查。

```bash
docker compose --env-file deploy/.env -f deploy/docker-compose.yml config --quiet
docker compose --env-file deploy/.env -f deploy/docker-compose.yml up -d --wait postgres
docker compose --env-file deploy/.env -f deploy/docker-compose.yml build signaling
docker compose --env-file deploy/.env -f deploy/docker-compose.yml run --rm --no-deps --entrypoint /signaling-migrate signaling
docker compose --env-file deploy/.env -f deploy/docker-compose.yml up -d --no-build
```

两端填写同一个 HTTPS 信令地址并登录。检查自己的 HTTPS `/healthz`、容器状态和两端登录。HTTP 健康检查通过不能证明 TURN 可分配端口、可传输。修改已有部署前，先按项目说明备份数据库并安排维护窗口；重建 Coturn 或信令容器会中断活动会话。

## 游戏验收和带宽

1. 连接后在「连接」页记录直连或中继、实际帧率、丢包、接收缓冲和解码耗时。先用 1080p60 目标，观察相同的 10 分钟动态游戏片段，再考虑增加分辨率。
2. 分开测直连和备用中继。可以用一端换到实际无法直连的网络来验证中继，连接后确认应用显示中继。若选中 TCP 到 TURN 的路径，应单独记录，不能用它代表 UDP 的游戏体验。
3. 记录首帧时间和输入到画面变化的中位数、P95。用高帧率外部相机同时拍摄输入和画面变化；连接页的 RTT 不能代替这项测试。会话受 `SESSION_ACTIVE_TTL` 限制，默认 8 小时，最长 8 小时；长会话还要覆盖 TURN 凭据默认有效期及会话到期后的重连。
4. TURN 承载视频入站和出站。ECS 的公网出站带宽按并发流的实际出站码率之和预留余量，覆盖协议开销、重传和码率波动。例如两条分别 12 Mbps 的中继流约有 24 Mbps 视频出站，应选择更高带宽并用实际监控确认。单路持续 12 Mbps 约 5.4 GB/小时视频出站，按实际 EIP 计费策略核对；P2P 时 ECS 不承担这部分码率。

本轮仅验证仓库配置的 Docker 绑定和 UDP 映射。真实 EIP、域名、两端外网、中继分配、持续 4K60 和游戏手感未实测。

参考：[阿里云 ECS 安全组](https://www.alibabacloud.com/help/en/ecs/user-guide/start-using-security-groups)、[阿里云 EIP 关联](https://www.alibabacloud.com/help/en/eip/bind-an-eip-to-a-cloud-resource/)、[Coturn 4.6.3 配置示例](https://github.com/coturn/coturn/blob/4.6.3/examples/etc/turnserver.conf)、[Docker 端口发布](https://docs.docker.com/engine/network/port-publishing/)。
