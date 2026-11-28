# Windows 局域网测试

> 旧测试记录中使用的 `192.168.0.100` 地址已失效。当前双机测试请使用 [动态地址版 runbook](lan-two-pc-runbook.md)，它要求先查出本机实际 IPv4 地址再构建测试包。

这是一个仅用于同一路由器双 Windows 验收的测试路径。优先按 [双机验收 runbook](lan-two-pc-runbook.md) 配置短期 IP SAN TLS 证书，并用正常 HTTPS/WSS Windows 包测试。撤销测试信任时，应从每台测试电脑的 CurrentUser 根证书存储删除临时 CA。`lan-test` debug 包仅用于隔离的一次性 HTTP 调试。HTTP 会明文传输账号密码和 Token，只能使用临时账号，不得复用真实密码，不得部署到公网，也不得称为安全的 LAN 连接方式。

## 设置当前 LAN 主机地址

运行 `ipconfig` 或 `Get-NetIPAddress`，找到连接目标 PC 的专用 IPv4。每次路由器或网络改变后重新查询，不能假定旧地址仍有效。

```powershell
$LanHostAddress = "10.0.0.25" # 换成本机实际私有 IPv4
```

## 启动信令服务

```powershell
.\scripts\dev-lan.ps1 -Address $LanHostAddress -InsecureHttpTest
```

使用 `-InsecureHttpTest` 时，服务地址是 `http://<LAN 主机地址>:8080`，不是下载包的 8090 端口。保持窗口运行；首次出现 Windows 防火墙提示时，只允许专用网络通信。脚本要求该地址当前分配给这台电脑。安全 TLS 测试的服务地址为 `https://<LAN 主机地址>:8443`，按双机验收 runbook 生成并信任证书。

## 构建并分享测试包

```powershell
.\scripts\package-windows-lan.ps1 -Address $LanHostAddress
python -m http.server 8090 --bind $LanHostAddress --directory .\.local\lan-test-download
```

第二台电脑浏览器下载 `http://<LAN 主机地址>:8090/RemoteAssist_0.15.1-alpha_x64-setup.exe`。测试包只允许它连接所选 `LAN 主机地址:8080`，服务地址不能被改成其他 HTTP 主机。

## 账号

两台电脑注册或登录同一个普通账号。公共注册密码最少 8 位；停止局域网测试时按 Ctrl+C 结束服务，内存账号和设备会随服务退出而清除。
