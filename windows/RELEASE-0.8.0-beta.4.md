# Windows 0.8.0-beta.4 预发布说明

## 本次更新

- 校园账号密码只在官方页面手动输入；不保存密码、不启用密码自动登录。启动和退出登录时尝试清除旧版校园凭据，失败明确提示。
- 会话恢复和登录探测与退出登录统一协调，避免旧异步操作在退出后重新完成登录。
- 修复 `.zju.edu.cn` 父域 Cookie 未保存、恢复或清理的问题；单个文件或 Cookie 清理失败仍继续其他清理，并报告失败。
- 同步交接中的安全源码与合成回归；未接入未验收的隔离密码验证适配器。

## 安装

Intel/AMD 64 位电脑选择 x64；Windows on ARM 选择 ARM64。目标为 Windows 10/11，不支持 32 位系统或 Windows 7/8/8.1。ZIP 必须完整解压，保留运行时和资源文件；也提供当前用户安装的 NSIS Setup。

安装包没有 Authenticode 签名，系统可能提示未知发布者。核对发布来源及 SHA256，不要关闭系统防护。数据保存在系统用户应用数据目录，不是 ZIP 所在目录。

## 本机构建产物

全部由当前 0.8.0-beta.4 源码重新构建，位于 `windows/release/`；不是旧包改名。本地文件存在不表示已经发布 GitHub。

- `ZhiyunAssistant-0.8.0-beta.4-Windows-x64.zip`：155632876 字节
  SHA256：`4dc1c6790e56ea7e5d684f4655c03427e6be5c3b51318413992d233f9350532f`
- `ZhiyunAssistant-0.8.0-beta.4-Windows-arm64.zip`：153998600 字节
  SHA256：`c77434ec8c12fee70dd2e07086397a943783e0d01d162a9395598604e4470800`
- `ZhiyunAssistant-0.8.0-beta.4-Windows-x64-Setup.exe`：122787828 字节
  SHA256：`05d6009c91d7e47e852075dd7d5ba4a4f16295f5dd53940939fe3726a6dda043`
- `ZhiyunAssistant-0.8.0-beta.4-Windows-arm64-Setup.exe`：117540704 字节
  SHA256：`b1ade3df76f5e9c18eb7250c1d8bfc35d49f6076232f48628cf8de70787e7930`

校验清单：`release/SHA256SUMS-Windows-0.8.0-beta.4.txt`。两个 ZIP 均完成 CRC 检查，内置 ASAR 与通过审计的对应解包目录一致；ASAR 版本为 0.8.0-beta.4。

发布前重新计算了实际 ZIP 的 SHA256，并修正早期清单的旧值；两包字节数及包内 ASAR 未变，两架构重新执行包审计均通过。下载校验请使用本页当前值及本次四端发布清单，不使用旧记录。

## 验证和限制

- macOS Apple Silicon 上 TypeScript 检查通过，308 项单元测试通过，最终完整 41 项合成 Electron 场景通过、零跳过。鼠标拖选曾出现一次不稳定失败，单项和最终整套复测通过。
- x64/ARM64 的 PE 架构、ASAR、后台 Worker 和敏感文件扫描均通过，零发现。两个 ZIP 和两个 NSIS 均构建成功，不需要为此安装 Wine。
- 全依赖审计仍有构建工具链 6 项中危，无高危或严重项；排除开发依赖的审计为 0。应用依赖已打包，不能据后者宣称整个应用零漏洞。
- 此电脑没有 Windows：本版本尚未在这里验证 Windows 安装/启动/卸载、系统凭据加密、SmartScreen、DPI、多屏、IME、硬件视频解码或外设。
- 未调用真实校园认证、真实课堂媒体或付费 AI；隔离密码验证只有协议及合成测试，生产功能保持 disabled。
- Windows CI 配置未改动、未运行。此前版本的 CI 成功不代表本版本已通过；发布时必须如实标注交叉构建与上述未验证范围。

更完整证据与历史说明见 [VERIFICATION.md](VERIFICATION.md)。
