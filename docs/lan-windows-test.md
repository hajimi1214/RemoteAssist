# Windows 局域网测试

这是一个仅用于同一路由器双 Windows 验收的测试路径。正式包仍要求 HTTPS；单独构建并启用 `lan-test` 特性的 debug 包才允许访问 RFC1918 私有 IPv4 的 HTTP 信令地址，该特性不能用于 release 构建或公网部署。测试账号密码通过 HTTP 传输，只能使用临时密码，不要复用任何真实账号密码。

## .100 上启动信令服务

```powershell
.\scripts\dev-lan.ps1 -Address 192.168.0.100
```

服务地址是 `http://192.168.0.100:8080`，不是下载包的 8090 端口。保持窗口运行；首次出现 Windows 防火墙提示时，只允许专用网络通信。

## 构建并分享测试包

```powershell
.\scripts\package-windows-lan.ps1 -Address 192.168.0.100
python -m http.server 8090 --bind 192.168.0.100 --directory .\.local\lan-test-download
```

在 `.102` 浏览器下载 `http://192.168.0.100:8090/RemoteAssist_0.15.1-alpha_x64-setup.exe`，安装后使用 `http://192.168.0.100:8080`。测试包已内置该服务地址；若本机保存过另一个服务地址，在设置中改成此 LAN 地址。

## 账号

两台电脑注册或登录同一个普通账号。公共注册密码最少 8 位；停止局域网测试时按 Ctrl+C 结束服务，内存账号和设备会随服务退出而清除。
