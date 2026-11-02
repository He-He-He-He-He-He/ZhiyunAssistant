# 智云助手 · 外部 Agent 接口

本接口通过本机 MCP stdio 连接正在运行的智云助手。隐私与数据页面中可开启或关闭；首次安装默认关闭。开启后，同一 macOS 用户下可运行本机程序的进程都可能读取/操作课程和笔记，应只在信任该用户环境时开启。系统认证、系统文件选择器及原有确认流程仍由用户处理。

## Codex

```sh
codex mcp add zhiyun -- /usr/bin/python3 /Applications/智云助手.app/Contents/Resources/zhiyun_mcp.py
```

重启客户端；运行 `codex mcp get zhiyun` 检查配置。调用 `zhiyun_actions` 查看动作与参数，再调用 `zhiyun_do`；`zhiyun_state` 和 `zhiyun_interface` 可读状态和当前界面。应用需要保持运行。

## DeepSeek Harness

在当前使用的 profile 的 `cordis.patch.yml` 中追加（不要覆盖已有配置）：

```yaml
- insert:
    - id: mcp-zhiyun
      name: '@deepseek-ai/dsh-mcp-client'
      config:
        serverName: zhiyun
        transport: stdio
        command: /usr/bin/python3
        args:
          - /Applications/智云助手.app/Contents/Resources/zhiyun_mcp.py
        toolCallTimeoutMs: 100000
```

重启 Harness。其他 MCP 客户端同样以 stdio 启动上述 Python 脚本。

## 协议与验证边界

四个工具：`zhiyun_state`、`zhiyun_actions`、`zhiyun_interface`、`zhiyun_do`。动作目录直接取自应用已有的 AppActions；网页控件交互通过已有 `interface_action`。密码、API 密钥和登录输入从界面观察中排除。账号变更或接口关闭时，执行守卫会中止后续操作；已执行的动作可能无法撤销。

`knowledge_batch` 保留旧任务的只读状态查询；已生成的知识缓存仍可使用。

MCP 适配器使用应用数据目录内权限为 0700 的 `ExternalAgent` 目录交换短期请求与响应，文件权限 0600；关闭接口清理待处理文件。服务端不会在 stdout 输出日志。应用关闭时不能提供服务，调用会超时。

2026-11-01 的真实应用测试：MCP 初始化、工具列表、状态、57 项动作目录、界面快照和 `list_lessons` 只读调用成功；关闭状态拒绝调用。未逐个真实执行所有有副作用的动作；Codex CLI 通过临时参数解析配置，未自动修改用户现有配置。涉及文件选择、认证或系统对话框的流程未自动化。

用户偏好：新增应用功能时不要求实时同步接口。仅在用户明确要求更新接口时，集中核对新增功能、补齐映射和测试。
