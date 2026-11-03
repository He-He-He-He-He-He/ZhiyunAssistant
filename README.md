<div align="center">
  <img src="macOS/web/icon.png" width="104" alt="智云助手图标">
  <h1>智云助手</h1>
  <p>把课件、转写、视频与笔记，放在同一条学习时间线上。</p>
  <p>面向智云课堂的多端学习工具 · 支持手机、平板与电脑</p>
</div>

## 下载

选择你的设备，下载后请先查看下方的安装说明。各平台均为**预览版**，功能和验证范围不完全相同；源码更新不代表所有安装包都已同步。

| 设备 | 下载 | 安装前须知 |
| :--- | :--- | :--- |
| **macOS** | [下载 Mac 版 DMG](https://github.com/He-He-He-He-He-He/ZhiyunAssistant/releases/download/cross-platform-2026.11-preview/ZhiyunAssistant-Mac-1.8.7.dmg) | macOS 13 及以上，支持 Apple 芯片和 Intel；目前未经 Apple 开发者签名及公证。首次打开若被系统阻止，请前往 **系统设置 → 隐私与安全性 → 仍要打开**，再按提示确认。[详细步骤](macOS/README.md#首次安装) |
| **Android** | [下载 Android APK](https://github.com/He-He-He-He-He-He/ZhiyunAssistant/releases/download/cross-platform-2026.11-preview/ZhiyunAssistant-Android-0.1.0-beta.3.apk) | Android 8.0 及以上，支持手机、平板；需较新的 Android System WebView。 |
| **HarmonyOS** | [下载未签名 HAP](https://github.com/He-He-He-He-He-He/ZhiyunAssistant/releases/download/cross-platform-2026.11-preview/ZhiyunAssistant-HarmonyOS-0.7.6-unsigned.hap) | **不能直接安装**：需要 DevEco Studio 和适用于自己设备的调试签名。[详细步骤](harmonyOS/INSTALLATION.md) |
| **Windows** | [下载 x64 ZIP](https://github.com/He-He-He-He-He-He/ZhiyunAssistant/releases/download/cross-platform-2026.11-preview/ZhiyunAssistant-Windows-0.8.0-beta.2-x64.zip) · [下载 ARM64 ZIP](https://github.com/He-He-He-He-He-He/ZhiyunAssistant/releases/download/cross-platform-2026.11-preview/ZhiyunAssistant-Windows-0.8.0-beta.2-arm64.zip) | Windows 10/11 64 位；ZIP 解压后运行，当前包未签署 Windows 发布者证书。 |

[查看完整发布说明与 SHA-256 校验值](https://github.com/He-He-He-He-He-He/ZhiyunAssistant/releases/tag/cross-platform-2026.11-preview) · [查看所有历史版本](https://github.com/He-He-He-He-He-He/ZhiyunAssistant/releases)

## 开始使用

1. 下载对应平台的版本并安装。鸿蒙设备请按照[签名与安装说明](harmonyOS/INSTALLATION.md)操作；开发者模式本身不能代替签名。
2. 打开应用，通过浙江大学官方认证登录智云课堂。应用只访问账号有权限查看的课程。
3. 在「我的课堂」选择课程，进入学习后按需打开课件、转写、视频或笔记。
4. 如需课程问答、本页速览等 AI 功能，在应用内配置自己的 DeepSeek API；调用服务可能产生费用。

课程、笔记、学习进度和离线资料保存在各设备本机，目前不提供跨设备自动同步。AI 功能启用时，相关问题和课程资料会发送至所选服务；回答请结合原文核对。

## 能做什么

- **看课与复习**：课件与课堂转写按时间关联，定位页面和讲解，按需播放视频。
- **记录与回溯**：记录课堂笔记，插入课件或转写引用，返回对应位置。
- **整理与离线**：收藏、稍后再看、保存学习进度，按需下载可访问的课程资料。
- **AI 辅助学习**：课程问答、本页速览与应用内助手；具体能力与设备支持以各端说明为准。

## 开发与安全

- [macOS](macOS/README.md) · [Android](android/README.md) · [HarmonyOS](harmonyOS/README.md) · [Windows](windows/README.md)
- [跨端进度与验证范围](CROSS_PLATFORM_STATUS.md) · [安全说明与私密报告](SECURITY.md)
- Mac 与 Windows 有可选的本机 Agent 接口；Android 和 HarmonyOS 保留应用内助手，不提供外部 Agent 接口。

项目为独立学习工具，不代表浙江大学或智云课堂运营方。请勿在公开 Issue 中提交账号、密钥、课程资料或个人信息。

## 许可

项目自行编写的代码采用 [GPL-3.0-only](LICENSE)；第三方组件和素材遵循各自许可，详见各平台的 `THIRD_PARTY_NOTICES.md`。
