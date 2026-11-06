# 验证

按当前源码运行 `npm run verify`、`npm test`、`bash tests/native-contract.sh`。针对界面布局可用 `bash tests/showcase-review.sh <输出目录> light` 在隔离环境以合成数据进行检查。发行前还应在目标设备验证登录、课件、视频及用户自己配置的 AI 服务；本地构建不等于已公证或已发布。

## 1.8.9 / build 24 · 2026-11-06

- 从正式工作区与 2026-11-05 交接增量逐文件三方合并后重新构建，没有复用或重命名旧安装包。
- 保留原有六个未提交文件改动：`Sources/App.swift`、`tests/NativeContractTests.swift`、`tests/agent.test.cjs`、`web/agent-runtime.js`、`web/agent-ui.js`、`web/app.js`。其中 `tests/agent.test.cjs`、`web/agent-runtime.js`、`web/agent-ui.js` 与任务开始时逐字节相同；重叠原生及应用文件保留了五工具支持、协议防护测试和显式密钥恢复。
- 模块检查通过（65 个模块），JavaScript 测试 283/283 通过，Swift native contract 352 项通过，独立 WebKit 合成数据 UI 冒烟通过且无页面错误。未启动用户日常浏览器，也未使用真实账号、校园密码、个人 API 或真实课程资料测试。
- 加密资料损坏/暂不可解锁时保留原文件；删除墓碑阻止旧凭据迁回；文件锁与会话代数覆盖跨进程写入及退出后的过期写入。自动密码填写、提交及新校园密码保存入口保持关闭；隐私文案不再声称有未实现的登录后询问。
- 实际 ZIP 解包、DMG 只读挂载后，分别核对包内完整应用与构建应用相同，所有 `web` 资源与当前源码相同。两包原生程序均包含 `x86_64 arm64`，版本均为 `1.8.9` / `24`，严格签名校验通过，DMG 校验和通过；检查后已卸载 DMG。
- 本机无有效代码签名身份，实际构建明确清除签名/公证环境变量，产物为 ad-hoc（无 TeamIdentifier），未公证。可选 Developer ID / 公证分支未实机验收。
- 未提交、推送或发布；未修改其他平台。Swift 存在旧 Keychain API 弃用告警，不影响本次测试与构建通过。

产物位于本目录 `build/`，`SHA256SUMS.txt` 已重新校验：

- `智云助手-Mac-1.8.9.dmg`：8,406,552 字节；SHA-256 `5b2490316e2bf30f8cb3a701ef769819974d5e3f5a5c3a95de52159fde5a6339`
- `智云助手-Mac-1.8.9.zip`：8,138,368 字节；SHA-256 `d6b8cd9f6eb1c60248acf2328e30496a96e1aabd0ae3ee65564df9d7c671dc7f`
