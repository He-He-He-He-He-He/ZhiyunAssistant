# 登录与会话修复 · 四端预览版

本次版本：Android **0.1.0-beta.7**、HarmonyOS **0.7.10**、macOS **1.8.9**、Windows **0.8.0-beta.4**。

## 更新内容

- **Android**：在同一个应用内提供原生账号核验与 AndroidKeyStore 加密保存入口，不需要另外安装诊断应用。修复原生 CAS 请求缺少应用 User-Agent、将服务票据误当成固定字符集、OAuth 回调参数校验不一致及 Unicode 身份解析等兼容问题。增加仅记录固定枚举和数字的失败阶段报告，以及不提交密码的匿名预检。退出、切号、取消和晚到请求统一协调；失败不自动重复提交密码。
- **HarmonyOS**：完善原生 CAS、加密凭据及会话提交/回滚链路，修复辅助 Cookie 导致会话被误判替换、学校 RSA 公钥格式兼容和 Unicode 身份解析，并同步修正 OAuth 回跳参数校验、补齐固定应用 User-Agent。保留官方手动登录，原生验收必须由本人明确同意。
- **macOS**：修复应用助手五工具传递和异常工具协议处理，保留显式 AI 密钥恢复。加强本机会话与历史凭据迁移保护，改进跨进程文件锁、退出后的过期写入隔离和删除墓碑；加密文件损坏或暂不可解锁时保留原文件。继续使用官方手动认证，不启用未经验收的密码自动填写或提交。
- **Windows**：修复 `.zju.edu.cn` 父域 Cookie 的保存、恢复与清理，避免旧异步登录在退出后恢复会话。单项清理失败时继续清理其余项目并明确报错。校园密码仅在官方页面输入，不保存或自动提交。

## 下载与安装

- Android：`ZhiyunAssistant-0.1.0-beta.7-Android.apk`。Android 8.0 及以上；正式签名与上一公开 beta.6 一致。本机 acceptance/debug 签名测试包不公开，也不能与正式包混作覆盖升级。
- HarmonyOS：`ZhiyunAssistant-HarmonyOS-0.7.10-unsigned.hap`。**未签名，不能直接安装**；须使用 DevEco Studio 配置适用于自己设备的合法签名，见 [安装说明](https://github.com/He-He-He-He-He-He/ZhiyunAssistant/blob/fixes-2026.11.06-preview/harmonyOS/INSTALLATION.md)。不提供作者设备绑定的证书或 Profile。
- macOS：`ZhiyunAssistant-Mac-1.8.9.dmg` 或 `.zip`。macOS 13 及以上，Apple 芯片与 Intel 通用；使用 ad-hoc 签名，未经 Apple 开发者签名及公证。
- Windows：分别提供 x64、ARM64 的 ZIP 和 Setup.exe。Windows 10/11 64 位；ZIP 须完整解压。安装器未做 Authenticode 签名，系统可能显示未知发布者。

请核对发布页的 `SHA256SUMS.txt`，不要关闭系统安全防护，也不要卸载应用来规避签名不匹配，以免丢失本机资料。

## 验证范围与限制

- Android：183 项原生 JVM 回归、301 项共享逻辑及 Release Lint 通过。用户于 2026-11-06 在手机确认“账号已核验并加密保存”，对应原生认证、身份核验、加密保存及正式会话采纳后的再次身份复核成功。使用的是与正式包同源的非 debuggable 本机验收签名包。
- 上述成功**不等于真实 HTTP 401 后自动重登已通过真机验收**。原生自动重登受本人同意、前台状态、真实 401 和持久单次额度约束；网络错误、403、验证码或失败不会触发无限重试，也不会通过重启恢复额度。
- macOS：283 项 JavaScript、352 项 Swift 契约及隔离 WebKit 冒烟通过；两个下载包均核对通用架构、资源和签名。
- Windows：x64、ARM64 均在[本次原生 CI](https://github.com/He-He-He-He-He-He/ZhiyunAssistant/actions/runs/42197089411)通过单元及界面回归、PE/ASAR 审计、中文空格目录安装、已安装程序启动和卸载检查。公开 ZIP 与 Setup 取自该成功运行的安装包产物，不使用此前仅交叉构建的候选包。原生运行器成功仍不代表所有用户电脑、显卡及真实课堂媒体均已验收。
- HarmonyOS：582 项离线回归及 release ArkTS 编译、打包检查通过；实际包为 0.7.10/code37、debug=false，仅声明 INTERNET 权限，官方工具确认未签名。实际设备记录以 [验证说明](https://github.com/He-He-He-He-He-He/ZhiyunAssistant/blob/fixes-2026.11.06-preview/harmonyOS/VERIFICATION.md) 为准；公开未签名包本身不是可直接安装或已完成全量真机认证验收的承诺。
- 未将合成测试扩写为全部真实课程、媒体、付费 AI 或所有设备的验收结果。详细记录见各端 `VERIFICATION.md`。

## 本次云端检查

应用源码对应提交 `a3d8d877de90e95fe9fe12dd4ad506995964369b`，四端门禁均成功：

- [Android 类型检查、回归、Lint、构建与包扫描](https://github.com/He-He-He-He-He-He/ZhiyunAssistant/actions/runs/42197089430)
- [HarmonyOS 可移植回归](https://github.com/He-He-He-He-He-He/ZhiyunAssistant/actions/runs/42197089456)
- [macOS JavaScript、Swift、WebKit 与构建](https://github.com/He-He-He-He-He-He/ZhiyunAssistant/actions/runs/42197089650)
- [Windows x64 / ARM64 原生验证与安装包](https://github.com/He-He-He-He-He-He/ZhiyunAssistant/actions/runs/42197089411)

标签在该应用源码之上仅补充发布说明、验证状态和最终下载包校验值，不改变通过检查的应用代码。

发布状态以 GitHub Release 的实际公开页面和资产为准；本文件本身不是已上传或已发布的证明。
