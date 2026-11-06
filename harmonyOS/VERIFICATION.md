# 0.7.10 / code37 · 2026-11-06

本轮只准备鸿蒙公开候选包及源码，没有 git 提交、push 或 GitHub Release 写入，也没有连接、安装、启动或覆盖设备。未读取或改写已有本地验收签名包；本轮只生成 unsigned 包，不宣称真实学校认证或端到端已通过。

## 本轮结果

- 最终交接源码已同步到正式 HarmonyOS 工程；AppScope、工程与 entry 包描述、测试 package/lock 统一为 0.7.10，AppScope versionCode 为 37。未带入私人签名文件、设备 Profile、缓存、依赖目录或旧 build。
- 正式工程目录完整 `npm test` 为 **582/582**：core 433、native-cas 98、native-login 51；无失败、取消或跳过。复用本机已有测试依赖，测试资料均为合成输入，不发送真实认证。
- 修复 NativeCas 交换回跳契约：仅接受恰好 `r+code` 或 `r+code+url`；`r=auth/get-info`、非空有界 code，若有 url 必须严格等于 `https://classroom.zju.edu.cn/`。未知字段、原始或解码后重复字段、错误返回地址、非固定 HTTPS 主机/路径、userinfo（包括被 URL 标准化抹去的空 userinfo）、fragment 均拒绝；后续 `home===ROOT` 和身份三字段核验保持不变。
- 原生 RCP 所有 GET/POST 显式发送固定 `User-Agent: ZhiyunAssistant/0.7 (HarmonyOS; NativeCAS)`，不含设备或用户标识。保留 HTTPS 白名单、私有 Cookie jar、会话与逐请求禁止自动跳转、单次 POST、不自动重试。真实 RCP Request 构造桩完整跑通无 url 的 11 请求流程，逐条断言 UA、请求配置和唯一 POST；协调器回归确认恶意未知/重复/错误 url 和身份不符均不保存凭据、不发布身份或会话。
- 从正式源码复制完整英文路径工程，执行下述 `clean assembleHap`。release ArkTS、打包检查均成功，SDK 仍有既有能力声明/异常处理等警告；未为绕过验收而关闭编译检查或混淆。
- 实际 HAP 的 module.json 为 `cn.suike.slides`、0.7.10/code37、**debug=false**，设备类型 phone/tablet，仅声明 INTERNET 权限。release 混淆会更改私有类名；通过模块记录、事务方法和固定解析标记核对新代码，不依赖 debug 包的私有类名。
- 正式与示例配置均为 `signingConfigs: []`，产品没有 signingConfig。构建提示未配置签名，官方 `verify-app` 明确报告缺少签名结构，未提取出证书或 Profile；不能只凭 unsigned 文件名判断。
- 审计公开源码输入及 HAP 全部 32 个 ZIP 项，未检出私钥/证书/设备 Profile 文件、私人路径、设备标识或签名口令字段等模式。缓存、本地日志及工具不属于公开输入；所有实际编译代码与正式仓库一致。此静态审计不代替硬件或认证验收。
- 真实 POST 与保存凭据默认常量仍为 false；真实原生验收须用户在原生页面明确勾选、输入密码并同意，内存许可不会跨账号或重启继承。

```sh
hvigorw --mode module -p module=entry@default -p product=default \
  -p buildMode=release clean assembleHap --no-daemon
```

本轮编译环境拒绝除 localhost 编译器 IPC 以外的出站网络；不联网安装依赖，不访问学校或设备。默认配置不带作者签名，自行签名与安装要求见 [INSTALLATION.md](INSTALLATION.md)。

公开候选包：`ZhiyunAssistant-HarmonyOS-0.7.10-unsigned.hap`，4,157,861 字节。

SHA-256：`5382a9a14b5461ec1ae1778191c9f077c7c42d13d4812cd121162ec987f7277e`

发布准备目录另附 `harmonyos-release-build.json`、`harmonyos-public-audit.json` 和 `SHA256SUMS.txt`。仅 unsigned HAP 和经过审计的公开文件可作为 GitHub 资产；不要上传本地 debug signed HAP、签名报告中的私人材料或构建日志。是否已发布，以 GitHub 实际资产为准。

以下是历史版本记录，不是本次真机验收：

---

# 0.7.6 · 2026-10-24

- 376 项回归通过，含双指位置锚定、连续倍率、中心移动、横纵拖动、真实图片边界及尺寸变化重置。
- SDK API 26 release ArkTS 编译、PackingCheck 和本地调试签名完成，MatePad 覆盖安装及启动成功（保留应用资料）。手机未在本次连接，实际捏合手感仍需设备触控验收。
- 公开 HAP 使用无设备签名的包；本机调试 Profile 和证书仅用于本地安装，不进入源码与公开分发。

以下为早期版本记录，凭据打包策略仅对应当时版本。

---

# 鸿蒙公开分发检查

2026-10-13，0.7.4 / versionCode 31。

- 从公开目录的源码重新执行 DevEco SDK API 26 的 release HAP 构建，34 项构建任务全部执行，ArkTS 编译与 PackingCheck 通过。
- 公开配置没有 signingConfigs；构建明确报告未配置签名，产物为 unsigned HAP。未把作者的调试 Profile、两台测试设备标识或私人证书打包。
- 独立安装锁定的 TypeScript 测试依赖后，374 项模型、服务及源码回归全部通过，失败、取消、跳过均为 0。此结果不代替全套真机 UI 和硬件验收。
- HAP 的 module.json 为 cn.suike.slides，0.7.4，设备类型 phone/tablet，最低 API 24、目标 API 26，release / debug=false。仅声明 INTERNET 权限，系统选择器交互由对应系统组件处理。
- 发布前检查源码、HAP 的全部资源与程序字节，排除校园凭据、API 密钥、登录会话、个人资料、私钥、设备绑定 Profile、私人路径和构建日志。保留本项目图标、合成演示资源及第三方许可证。
- 通过 Git 受控文件生成独立源码 ZIP，排除 node_modules、oh_modules、build、.hvigor、本机 SDK 路径及实际签名配置。使用示例配置自行构建。

本次发布未为其他人的设备签名，也未在其他人的设备上安装。现有手机和平板的签名不能通用于所有下载者；需要按[安装说明](INSTALLATION.md)在自己的电脑和设备上配置调试签名。此前的真机测试范围与剩余未验收场景在 README 中说明。

发布页提供 SHA256SUMS，方便核对 HAP、源码 ZIP 和独立安装说明。未上传正式商城 APP 包、证书链、私钥或签名工具本体。
