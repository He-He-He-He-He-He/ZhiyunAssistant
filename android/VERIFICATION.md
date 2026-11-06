# Android 验证记录

## 2026-11-06 17:31 用户观察的首次原生端到端成功；自动 401 真机验收仍未完成

### 已成立的事实与证据边界

- 用户 17:31 明确报告新包显示“账号已核验并加密保存”。记录为 **user-observed 首次 Android 原生登录端到端成功**：原生首次认证、身份核验、加密持久保存及官方会话采纳成功。不是匿名预检成功，也不再记为“尚无首次原生线上成功”。
- 源码依据：`MainActivity.showNativeEnrollment` 只有在 `NativeIO.enrollNativeAccount` 返回 true 时显示该弹窗；`NativeCasLogin.authenticate` 必须先完成协议内固定 infosimple 身份核验，再由真实 `NativeOfficialSession` 独立核验同一 id/account，关闭私有 CAS transport、持久保存凭据并 commit 官方会话，才能返回成功。存储写入使用 AndroidKeyStore/AES-GCM、文件同步、原子替换及目录同步，写入异常不会走成功分支。
- 这是用户观察并结合生产成功分支的判断，不是本轮代理独立复测。未读取手机文件、诊断记录或设备 APK；不据此宣称已实测进程重启后的凭据读取、自然 401 自动重登、正式发行签名包真机安装或其他平台。

### 自动重登生产条件：只读核查结论

- 每个新 `NativeIO`/页面实例的 `nativeValidationEnabled` 默认 false；只有原生明确启用按钮，或用户逐项同意后成功的原生登记，才启用当前实例。打开设置、会话恢复、安装更新及 JS 提供 consent/status/password 参数都不能自行授权。重建实例后要由用户重新明确启用；该按钮本身没有 CAS POST，也不补额度。
- 入口是 `NativeIO.request` 收到官方 `classroom.zju.edu.cn` 的真实 HTTP 401，且为原请求第一次响应、可安全重放的 GET/HEAD 或固定只读课程权限 POST。若不是精确固定 infosimple 请求，必须再以无重定向 GET 探测固定 infosimple，只有它也返回 401 才认定主账号过期。资源自身的 401、infosimple 200、403、网络失败、媒体/下载流错误不能替代此证据。
- 同时要求前台、当前实例/会话代次及取消代次仍有效、未关闭，保存的原生授权及 id/account 相符。`app.silentLogin` 仍需原生真实 401 标记，renderer 传入 401 不能制造该标记。后台/注销/切号会取消并阻止旧工作发布。
- 生产调用的是 `reserveOnceFor`/`finishOnce`，不是仍存在的通用三次额度辅助 API。保存记录必须 authorized、READY、attempts=0；跨实例/进程锁及加密原子事务先持久预留 attempts=1，再允许打开私有认证 transport。预检通过才可能发唯一一次密码 POST；验证码、失败、未知提交结果及成功都不自动退还该额度。
- 自动认证成功后为 READY、attempts=1；同控制器、重建控制器、应用重启或再次点击启用均不能再自动提交。只有新的明确授权、成功核验的原生登记才产生新额度。并发 401 共用一轮；成功后至多重放原 API 一次，而不是再发一次 CAS POST。

### 安全真机验收与发布边界

- 不伪造 401、不撤销/清空有效会话、不改变凭据或服务器状态的前提下，不能强迫当前有效会话立刻返回 401。完成真实过期重登验收，需要正常使用中的真实官方 401 自然出现；没有依据承诺固定到期时刻，也无需为等待而密集探测或重新安装。
- 本轮不触发任何真机请求或密码提交。未来由用户在明确授权下正常使用：若当前实例已重建，必要时只启用“已保存账号的一次自动重登验收”，不要重新“验证并保存”以人为补额度。仅启用并不代表已验收；仍须同时满足上述真实 401 与前台条件，且额度未耗用。
- 待真实触发后，应以脱敏报告中的 AUTOMATIC/SUCCESS、身份复核与会话提交成功，以及原业务请求恢复为证据；ENROLLMENT/SUCCESS 或单独 POST302 均不能替代。失败/验证码/不确定结果后停止，转用户决定的官方手动登录，不安排第二次自动密码 POST。
- 本轮未发现要求再修改 APK 的阻断性问题。“一次额度成功/失败/重启均不恢复”与现有明确同意文案一致，不是本轮发布回归缺陷。但当前实现是默认关闭、需原生明确启用的受限 beta 功能，不等于长期无人值守自动登录。若发布准入要求“真实 401 自动重登已通过”，这一验收项仍未完成，不能以首次登记成功或离线测试充抵；本轮也没有评估全平台发布就绪性。

### 17:34 起本轮离线复核与未变产物

- `./gradlew --offline --rerun-tasks :app:testDebugUnitTest`：183/183 通过，0 失败/错误。不是仅复用 UP-TO-DATE 结果。
- `npm run check` 通过；`npm test`：301/301 通过，0 失败/跳过。桥接授权门槛部分为源码契约断言，不冒充 Android 运行时真实 401 集成测试。
- 已有 `NativeCasLoginTest` 模拟生产编排覆盖：一次自动成功后持久耗用、模拟持久存储上的控制器重建、非 401/外域/错身份拒绝、验证码零额外 POST、未知 POST 不重试、持久写入失败及写后报错、并发单飞/双控制器、后台取消、注销及旧代次不得发布。这里的 Restarts 是测试存储/控制器重建，不是本轮真实 Android 进程重启。加密记录编解码、篡改拒绝、授权代次和撤销另有离线测试。
- AndroidKeyStore/桥接设备集成测试源码已有合成参数不得触发 `app.silentLogin` 等用例；本轮未运行设备仪器测试。真实 Android 401 → 原生认证 → 原业务恢复这一运行时组合仍待上述自然触发验收。Release Lint 沿用上一轮 0 错误/26 警告结果，本轮未重跑或改动应用源码。
- 下节两项 APK SHA-256 已重新计算，完全未变；两包重新执行 `apksigner verify --verbose --print-certs` 均 Verifies、v2/v3 有效。正式发行包证书为 `aa8632ac2a50e36214b77dee1dcd7029b56e8717dda020c40c334b73c1d750a8`；本机验收包使用 Android Debug 证书 `ef7f41fb43f810a9eefa34848f3801c20f97554b1682abd546c99788d9d6b08b`，但包本身仍是非 debuggable Release 构建。验收包不充当正式发行包，两种签名不能相互覆盖升级；本轮不安排换签安装。
- 本轮只更新本验证文档；未更改应用源码或其他平台，未重新打包/签名，未操作设备、伪造 401、发真实校园请求、恢复额度、commit/push 或上传发布。

## 2026-11-06 17:19 #5 后 OAuth 严格契约修复（beta.7 / code 7）

本节记录最近一次代码修复及现有产物；最新真机状态与本轮离线复核见上节，下方更早章节为历史记录。

### 观察、确定的源码问题与尚未确认的假说

- 用户提供 #5：`POST 302 / CALLBACK 302 / OAUTH 302 / PROTOCOL_REJECTED`，未发布会话。只证明该次已经收到这些状态，不能证明上一轮 500 必由缺 UA 引起，也不能证明本次具体拒绝了哪个回跳字段。
- 正式 `NativeCasDiscovery.AUTHORIZE` 与已有匿名 GET 探针 `cas-diagnostic/anonymous_probe.py` 中 AUTHORIZE 一致。按原始 URI query 的 `&` 边界拆分，authorize 顶层是 response_type、client_id、redirect_uri、url；其中 redirect_uri 只有固定 tgmedia `/index.php?r=auth/get-info`，不含 `url`。新增纯离线测试直接验证此结构。
- 原 `requireExchange` 强制回跳必须恰有 r、code、url 三字段，确与上述契约不一致。本次允许“r + code”及“r + code + 固定 url”两种严格形式，不修改 authorize 请求，也不猜测附加其他字段。
- #5 没有保存真实 Location，本轮没有新增匿名 GET 或凭据请求；现有证据不包含成功回跳完整参数或服务器默认落地实现，不能宣称已证实 #5 就是缺 url。本次修复是有源码依据的兼容性修复，不是线上成功声明。

### 严格校验、脱敏原因与后半链集中核查

- OAuth 目标仅允许 HTTPS、固定 `tgmedia.cmc.zju.edu.cn`（默认 443 或明确 `:443`）、固定原始路径 `/index.php`；拒绝 HTTP、外域、userinfo、fragment、错误/模糊端口、路径编码替代或额外路径。
- 参数只能是唯一 r、唯一 code、可选唯一 url；r 解码一次后必须为 `auth/get-info`；url 若出现必须精确为 `https://classroom.zju.edu.cn/`。额外字段、重复字段（包括百分号编码后的键别名）、空值或错误 url 一律拒绝。code 保持既有不透明值策略及 1–1024 字符/4096 原始 query 上限；严格 UTF-8、控制字符拒绝、只解码一次，转发原始 URI/query，不重建 code。
- 新增固定 Category 枚举原因：`AUTHORITY / PATH / QUERY_KEYS / ROUTE / RETURN_URL / CODE_SYNTAX / QUERY_SYNTAX / TICKET_SYNTAX / REDIRECT_LOCATION`。只持久化固定枚举/数字，不含 URL、code、Cookie、原始 query/参数值或底层异常文本；仍使用原 v1 安全报告格式，旧 `PROTOCOL_REJECTED` 报告可原样解码，不追补不存在的原因。
- 回跳解析在任何下一跳 GET 之前按目标阶段完整验证；typed 原因不再被原型包装成泛化 PROTOCOL_REJECTED。先在响应所属阶段检查 302/303，再进入 OAuth/landing 解析目标并保留相关 302；非跳转响应不会误标到下一阶段。解析器本身纯本地，无存储、网络或认证额度副作用。
- landing 仍必须为精确 ROOT（无 query/fragment、额外路径、任意目的地），随后必须 200；身份必须固定 infosimple 200，且 id/account 与预期相符。发布前仍由真实 `NativeOfficialSession` 独立再 GET 固定 infosimple 并复核，再保存及原子发布；未绕过任何身份、gate、一次额度或 Cookie 隔离。
- 已集中复核身份 UTF-8/JSON、Unicode 转义、数值/字符串 id、重复键、尾随数据、Cookie→Bearer 提取及发布前复核：既有离线覆盖保留，另新增完整两字段成功链和每一阶段拒绝链。id/account 精确比对与既有 `CredentialVerifier` 一致；无证据支持放宽为“只匹配其中一个”或自动接受账号别名。未发现另一项有证据需要放宽的后半链格式。

### 本轮离线验证

- 定向 JVM 66/66；随后完整 JVM 183/183，0 失败/错误。新增 13 项 OAuth 契约测试含多组恶意输入：两字段/三字段、原始编码保留、额外/重复字段、错误返回地址、各固定原因、旧报告兼容、非跳转响应阶段归属；真实生产 transport 的 gate/私有 Cookie 路径以离线 Wire 注入响应。
- 完整两字段模拟：POST302 → callback302 → OAuth302 → landing200 → identity200 → 真实 `NativeOfficialSession` 独立 identity200 → 保存/发布成功，只有一次 POST。另验证恶意 OAuth 在其 GET 前停止、错误 landing 在访问前停止、初次身份不符/JSON 异常及发布前身份复核失败均不发布。
- `:app:lintRelease` 强制重新分析通过：0 错误、26 警告；Gradle 使用已有依赖 `--offline`，未跳过 Lint。本轮没有重复 UI/Node 或运行设备仪器测试。
- 正式/验收签名构建、zipalign 与包扫描通过（各 122 条目，`findings: []`）；独立 `apksigner verify --verbose --print-certs` 均 `Verifies`、v2/v3 有效，均 code 7 / beta.7、非 debuggable。

最新正式包：`dist/ZhiyunAssistant-0.1.0-beta.7-Android.apk`

APK SHA-256：`8c27ce4e54fe4c7906c5a5a3110005e3acf5b027d1fa7bf779c53f4ea410523a`

证书 SHA-256：`aa8632ac2a50e36214b77dee1dcd7029b56e8717dda020c40c334b73c1d750a8`

最新本机验收包：`dist/ZhiyunAssistant-0.1.0-beta.7-Android-acceptance.apk`

APK SHA-256：`6a146eb8e50926bd2d3b4206bbda476ca40a6fed020af9ed050b9a8200e9a716`

证书 SHA-256：`ef7f41fb43f810a9eefa34848f3801c20f97554b1682abd546c99788d9d6b08b`，匹配指定实际验收证书。

本轮未发真实认证/校园请求、未安装或操作手机、未清理手机报告、未恢复额度或触发自动再提交，未上传发布。

## 2026-11-06 17:11 失败后的请求契约兼容修复（beta.7 / code 7）

本节为上一轮请求兼容修复的历史结果；最新产物以上方 17:19 后更新为准。用户提供的真机安全报告 #2 为 `ENROLLMENT`、密码 POST `RESPONDED`、HTTP 500；旧代码将其误记为 `CALLBACK`。该轮没有读取或清理手机报告。

### 已确认的代码证据与修改

- `NativeCasHttps` 原始 raw-TLS 请求头确实没有 User-Agent。历史 `cas-diagnostic/DiagnosticTransport.java` 使用 `HttpsURLConnection`，没有显式设置或禁止 UA，依赖平台默认；没有读取设备 `http.agent`，也没有实际请求抓包，因此不声称已验证该次请求的默认 UA 内容。
- 生产请求现在统一显式 `User-Agent: ZhiyunAssistant/0.1 (Android; NativeCAS)`：固定应用标识，不含型号、系统构建、账号或浏览器伪装。匿名预检、同一私有会话的全部 GET/POST 以及原生官方校验都经过同一真实 `writeRequest(OutputStream, ...)` 字节序列化器。没有改为 HttpsURLConnection 或新增回退。
- `NativeCasPrototype.run` 在切换到 CALLBACK 前检查 POST 的 302/303；其他状态（包括 500）保留 `POST / HTTP_STATUS`、对应 HTTP、`RESPONDED`，不进入 CALLBACK、不发 callback GET、不重试或回退。
- HTTPS、固定目标主机/端口、TLS `HTTPS` 主机验证、禁止自动跳转、原生 gate、持久预留、单 POST 限制及私有 Cookie jar 均保留；诊断仍只含枚举/数字，不保存请求头、表单、URL 或异常原文。

### 与历史诊断的请求构造对照

仅对照本机源码及历史诊断工程已有的 `app/build/imported/main` 源码快照，没有运行旧诊断或修改交接工程：

- 表单：`DiagnosticFlow.run` 与 `NativeCasPrototype.run` 字段及顺序相同：username、RSA password、空 authcode、execution、`_eventId=submit`、可选 ys；均用 UTF-8 `URLEncoder`，正文为 UTF-8 字节。
- RSA：历史导入的 `NativeCasRsa.java` 与正式源逐字节相同（文件 SHA-256 均 `881bca55ac916c8f8b4655c3b40169ca7a8c3392fd4331042aa89e13f72850b0`）。未改变算法、密钥或填充方式。
- Query / 表单解析：`NativeCasDiscovery` 入口、authorize、CAS_LOGIN 常量完全相同；`NativeCasPreflight` 的 action/隐藏字段/公钥解析逻辑相同，差异是新增 typed diagnostics。生产写出原始 path/query，没有二次编码 service 或 ticket。
- Cookie：历史导入的 `NativeCasCookies.java` 与正式源逐字节相同（SHA-256 均 `bda9e33504a2ef31145411aae297722d57ca0e17719f607dc53ed6aba1b806b3`）；两 transport 均以私有 `jar.header(uri)` 形成请求 Cookie。历史 adapter 额外检查全局 CookieHandler、用 session 值固定绑定并拒绝绑定后重新 Set-Cookie；生产用 jar 的 mutation generation 固定绑定，在 POST 后允许会话轮换。这些确有差异，但不是新增表单字段或已证实的 500 诱因，未放宽安全策略。
- Headers：双方显式设置 `Cache-Control: no-store`、`Accept-Encoding: identity`、表单 `Content-Type` 与固定字节长度、私有 Cookie。旧 adapter 的 Host/默认 UA/默认 Accept/连接管理由平台负责；生产显式 Host、`Accept: */*`、`Connection: close`。除补固定 UA 外没有猜测性增添 Origin/Referer 或浏览器头。生产身份请求另有从官方 cookie 提取 Bearer，旧诊断刻意不请求身份接口；这发生在 POST 之后，不能解释此次 POST 500。
- 响应处理也不同：旧 adapter 不读取 POST 正文，生产用有大小/时限上限的 HTTP framing 解析器读取；本次没有依据把此差异当成服务器产生 500 的原因或改动它。

上述证据不足以确定 17:11 HTTP 500 的诱因。缺 UA 导致 CAS 成功分支 NPE 仍是假说；早先诊断 POST 302、匿名 raw-TLS 预检成功也不是同条件对照，不能据此宣称已修复服务端 500。

### 离线验证与最新签名产物

- 定向 JVM 50/50 通过（真实请求头序列化、POST500、typed report、生产单 POST capability 等）；随后完整 JVM 170/170，0 失败/错误。
- 新增 4 项回归；其中请求头测试直接调用实际生产 `writeRequest` 并检查 OutputStream 捕获的完整 HTTP 字节，明确不经 `Wire.exchange` 旁路；验证全部 GET/POST 的固定 UA、原始 query、Cookie 范围、Content-Length、正文与不泄密的写入失败报告。另一项 POST500 等非 302/303 回归验证只 POST 一次、零 callback GET、零发布、再次 dispatch 被拒绝。
- `:app:lintRelease` 强制重新分析通过：0 错误、26 条警告；Gradle 依赖使用 `--offline`，未跳过 Lint。本次不重复 UI/Node 测试，不把上一轮结果当成本轮重跑。
- 正式及验收构建、zipalign、包扫描通过（各 122 条目，`findings: []`）；独立 `apksigner verify --verbose --print-certs` 均 `Verifies`，v2/v3 有效。两包均 code 7 / beta.7、非 debuggable。

正式包：`dist/ZhiyunAssistant-0.1.0-beta.7-Android.apk`

APK SHA-256：`fe556e867935e7205b712f761611e3abc456e755dd7c4c2c66ca474d114b12ca`

证书 SHA-256：`aa8632ac2a50e36214b77dee1dcd7029b56e8717dda020c40c334b73c1d750a8`

本机验收包：`dist/ZhiyunAssistant-0.1.0-beta.7-Android-acceptance.apk`

APK SHA-256：`618f3b26248c2b1787d9b6c107ea75dee44a24b83f9406cfdaeac6b5887455a5`

证书 SHA-256：`ef7f41fb43f810a9eefa34848f3801c20f97554b1682abd546c99788d9d6b08b`，匹配用户指定的实际验收证书。

本次无校园真实请求或网络认证，无设备操作/安装/报告清理，无重试认证、额度恢复、上传或发布。

## 2026-11-06 15:59 失败后的安全诊断更新（beta.7 / code 7）

本节为首轮诊断更新的历史结果；当前产物以上方 17:11 后更新为准。正式工程保留 beta.7，没有回退交接工程 beta.6。

- 历史可恢复性：检查既有源码与已有安全记录后，未找到可归属于 15:59 那次失败的持久阶段报告；旧链路吞掉异常并仅返回失败，不能事后恢复阶段、HTTP 或密码 POST 状态。本次没有读取手机、密码、Cookie 或完整 logcat，不能确定当次故障根因。
- `NativeCasDiagnostics` 仅记录固定枚举及数字：完整认证阶段、各阶段最后 HTTP、密码 POST 三态、异常类别、清理类别、结果与落盘状态。不读取或拼接原始异常 message/cause/类名、账号、URL、令牌、密码、Cookie 或响应正文。传输与 gate 保留 typed failure。
- 最新报告原子替换并同步文件/目录；操作编号隔离旧取消/晚到完成，进程重启可恢复报告及中断状态。落盘失败显示 `FAILED / REPORT_WRITE_FAILED`，不改变认证额度，也不覆盖原始认证失败类别。
- 入口：“隐私与数据 → 查看上次原生诊断”，未同意全局隐私/未登录时也可查看；原生失败弹窗显示报告。查看只读，不触发网络或认证。匿名预检入口为“匿名生产链预检（0 密码 POST）”，仍需原生确认；复用生产 raw-TLS、HTTP 解析、正则及全新私有 Cookie jar，只走 GET，无密码 POST/额度预留。本次未执行真实预检。
- 完整离线回归：严格 TypeScript 通过；Node 301/301；Android JVM 166/166，0 失败/错误；完整合成 UI 25/25（包括 3 项诊断入口测试）。仪器测试 APK 编译通过但未安装/运行。`:app:lintRelease` 强制重新分析：0 错误、26 条警告；未跳过 Lint。Gradle 使用已有依赖 `--offline`，测试为 mock/合成数据。
- 两个签名构建、zipalign、包扫描均通过：各 122 条目，`findings: []`；均为 `cn.suike.slides.android`、versionCode 7 / `0.1.0-beta.7`，非 debuggable。独立 `apksigner verify --verbose --print-certs` 均 `Verifies`，v2/v3 签名有效。

最新正式包：`dist/ZhiyunAssistant-0.1.0-beta.7-Android.apk`

APK SHA-256：`4a4ccff46751b618dfc74b32947cacc17602e45bfb0016290918e447298abb33`

证书 SHA-256：`aa8632ac2a50e36214b77dee1dcd7029b56e8717dda020c40c334b73c1d750a8`

最新本机验收包：`dist/ZhiyunAssistant-0.1.0-beta.7-Android-acceptance.apk`

APK SHA-256：`8f40332318da3d6b765014b3054503c46ad09c7cd69138918fb7ec1bf2ffb5d1`

证书 SHA-256：`ef7f41fb43f810a9eefa34848f3801c20f97554b1682abd546c99788d9d6b08b`（匹配用户提供的手机 debug 证书；仍为非 debuggable release 构建，不公开为正式发行包）

本次未安装、未操作手机、未发真实认证或匿名生产请求、未重试认证、未恢复额度；没有线上成功或当次根因已确定的声明。APK 仅在本机生成，未上传或发布。

## 2026-11-06 正式工程同步（0.1.0-beta.7 / code 7）

本节才是本次正式仓库的结果；下方 beta.1、beta.2、beta.4 的界面/真机/覆盖安装记录均为历史，不是 beta.7 新增验收，也不能证明手机当前安装的签名。交接工程与 beta.6 手机验收 APK 未修改；未复制独立 cas-diagnostic 应用、个人状态、密钥、缓存或 dist。仅同步必要 Android 原生/网页源码与离线测试，并重建正式网页资源；移除不再使用的网页密码填充模型。

- `npm ci` 成功：39 个依赖包，审计 0 漏洞。严格 TypeScript、完整 Node 测试（298 项通过，0 失败/跳过）、`build:web` 全部通过。
- `:app:testDebugUnitTest` 强制重新执行：143 项通过，0 失败/错误。覆盖严格 JSON Unicode 值、结构重复/转义字段拒绝、单次 POST 能力、私有 CAS cookie 范围与轮换、原子加密保存、持久预留、取消与晚到隔离。
- `:app:assembleDebugAndroidTest` 编译通过，包含真实 Android 正则和原生桥接合成场景；本次没有安装或运行仪器测试，不把编译成功写成真机测试通过。
- `:app:lintRelease` 完整重新分析通过：0 错误、26 条警告。警告涉及依赖/目标 API、旧隔离 Profile 功能标注、JavaScript、静态引用、同步 SharedPreferences 写入、图标和文本国际化；未隐藏或忽略。正常 TLS/联网依赖解析完成，无 `--offline`、`-x` 或跳过 Lint；签名构建中 `:app:lintVitalReportRelease` / `:app:lintVitalRelease` 也实际成功执行。完整报告为构建目录 `app/build/reports/lint-results-release.{html,xml}`。其他弃用 API/Gradle 9 兼容提示不作为通过即无警告。
- 正式发行构建、zipalign 与包扫描通过：122 个 APK 条目，扫描 `findings: []`；包名 `cn.suike.slides.android`，versionCode 7，versionName `0.1.0-beta.7`，minSdk 26 / targetSdk 36，非 debuggable。

产物：`dist/ZhiyunAssistant-0.1.0-beta.7-Android.apk`。

APK SHA-256：`e48d7f7819600ff3bb9ca3a20eecb04e8002aa04322379dad7c246238a3a618d`。

`apksigner verify --verbose --print-certs`：`Verifies`，1 个 signer，v2/v3 为 true，v1/v3.1/v4 为 false。证书 SHA-256：`aa8632ac2a50e36214b77dee1dcd7029b56e8717dda020c40c334b73c1d750a8`，与既有正式发行证书一致。脚本在发布命名的 APK 输出前强制检查此证书，不允许使用 debug/acceptance key。私钥与密码只从原有工程外配置进入签名进程，未写源码或命令行明文。

正式包不是正在验收的 debug-key APK，不能据此承诺覆盖该手机当前安装。debug key 只用于单独本机验收，不得公开；本次没有另做 beta.7 acceptance 包。

入口及边界：首登仍为官方手动 WebView，不捕获密码；「隐私与数据 → 原生账号验收」打开窗口本身不授权或认证，原生明确勾选并点击验证才允许一次 CAS POST。每个页面实例原生 gate 默认关闭，已保存账号也需原生启用按钮，按钮不恢复已耗用的一次额度；真实 401 才能持久预留自动重登，403/网络错误不触发认证，验证码转手动。已澄清旧弹窗“自动登录暂不可用”和“未来验收”文案，明确这是可主动开启但仍待线上端到端验收的能力，不把离线回归当成线上成功。

本次仅为正式 Android 工程同步、构建和离线/mock 回归；未开闸、未发真实校园认证/付费 AI 请求、未增加诊断额度、未操作设备，未修改其他平台，未 commit/push/创建 GitHub Release。APK 尚未上传，本记录不是已发布声明。

## 0.1.0-beta.2 图标修订

仅修正 Android 自适应图标的前景比例、蓝色背景和单色主题图标边距，原图像素未改变；版本号升至 2，版本名为 `0.1.0-beta.2`。本次通过 TypeScript、正式签名构建及 APK 扫描，实际图标在 vivo X Fold5 上检查。覆盖安装沿用原签名，保留已有账号与本机资料。

下面的全量测试与学习功能真机记录来自 `0.1.0-beta.1`，本次图标修订没有重复整套学习功能验收。

## 0.1.0-beta.1 学习功能记录

检查日期：2026-10-13。包名 `cn.suike.slides.android`，最低 Android 8.0 / API26，目标 API36。需要 Android System WebView 100 或更新版本；旧组件会显示原生更新提示，不运行不兼容的界面。

## 自动检查

| 检查 | 实际结果 |
| --- | --- |
| 严格 TypeScript | 通过 |
| Node 共享模型、服务与 Android 适配器 | 240 项通过，0 失败；其中 20 项 Android 服务回归 |
| 合成界面 | 7 项通过；手机、展开屏、平板、双铰链尺寸、系统返回、概览与布局互斥、折叠后阅读位置、多功能区输入与异步视频源保留 |
| Android JVM | 10 项通过，0 失败；HTTPS/域名/跨域凭据/沙箱/字节范围策略 |
| Android Lint Release | 0 错误；依赖更新、必要 JavaScript、图标兼容及文本国际化提示 |
| 正式 APK | 签名、资源和隐私扫描通过；非 debuggable；不包含发行私钥或本机资料 |

界面测试用独立的合成资料和浏览器实例，没有操作用户日常浏览器。原生仪器测试源码另外覆盖 Keystore、真实位图、HLS 清单、非零字节 Range 和大文件；本轮没有把仪器测试 APK 安装到用户手机，不将它列为仪器测试通过。下面的实际桥接验证通过已安装应用进行。

## vivo X Fold5 实测

Android 16 真机，用户本人阅读隐私说明并完成官方登录。覆盖安装和重启后保留身份与学习位置。

- 当前账号有权限的历史课程：真实课件和转写加载；转写按时间排列并与显示课件对应。
- 真实视频：1920×1080 解码并持续推进；播放/暂停、拖动进度、2×倍速、视频当前进度跟随、全屏及退出全屏恢复学习页通过。
- 折叠/展开：外屏约 360×789 CSS 像素、展开屏约 677×707；保持同一学习页、课件和视频实例，视频继续推进，未出现横向溢出。
- 原生桥接：独立临时资料验证 Keystore 读写删除、位图编码和裁切、沙箱拒绝、真实 WebView 非零 Range 和末尾范围，结束删除自己的临时资料。
- 修复实际视频故障：WebView 会再次执行 Range 偏移，原来已截取的流被重复跳过。现使用零分配的逻辑前缀处理，32 字节非零区间与对应原始数据完全一致；视频播放未再出现此次解码错误。
- 大文件：实际 WebView 使用自建稀疏文件验证 3 GiB 起点、4 GiB 起点和末尾范围；返回字节逐个一致，网络错误为 0，结束删除自己的测试文件。分步跳过避免 Chromium JNI 的整数截断，依据 [Chromium InputStream 源码](https://raw.githubusercontent.com/chromium/chromium/main/components/embedder_support/android/util/input_stream.cc)。

所有真实资料均留在本机私有目录，只公开结果，不公开课程原文、账号、URL 令牌或未经模糊的截图。

## 需要对应环境继续验收

单台 X Fold5 不能代替三折叠真机、所有 Android 平板、全部外接键鼠/触控板或每个教室的直播格式。双铰链有合成布局和区域算法检查，物理双铰链仍未验证。平台未提供的直播历史或明确拒绝的资源不会由客户端补出或绕过。

本轮没有使用用户付费 DeepSeek 密钥；上下文、流式拆包、缓存、跨课引用和笔记保存由隔离回归检查。全部 AI 模型的实际输出质量需用户配置自己的密钥后验收。

下载队列、失败部分继续、离线重启、导出文件保护均有服务回归；本轮没有在真机把用户全部课程完整下载一遍。系统强制停止、进程回收和厂商后台限制可能中断实际传输，保存的队列与部分文件可在重开后继续。

## 2026-11-03 课表对齐（0.1.0-beta.4）

“近两周”按上海日期显示今天之前的 14 天；今日正序、历史倒序，并显示日期分组。快速切换页签时丢弃旧请求的界面结果，加载中不重复显示空列表。兼容与 Mac 相同的课表响应封装。266 项逻辑测试和 19 项合成界面测试通过，覆盖手机、平板和折叠屏尺寸；真实课表内容仍受官方账号和服务状态影响。
