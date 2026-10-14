# AI 小说创作平台

一款面向个人长篇写作的 Windows 桌面应用。模型负责生成文字，Skill 提供写作方法，平台负责组织创作过程、维护小说资料和保存成果。默认本机优先，不下载模型、不预填云端密钥，也不会自动把作品发送到云端。

![欢迎页](docs/preview.png)

## 功能

- 管理多个小说项目，以及人物、世界设定、地点、势力、剧情时间线、伏笔和灵感笔记。
- 分开保存工作草稿、正式正文和未提交的正文编辑；AI 输出先进入候选区，作者选择后才会采纳。
- 正文历史版本可恢复；项目和章节支持归档、回收站恢复、完整备份导入/导出。
- 预览完整提示词；按章节、摘要、设定资料和 Skill 选择本次上下文，并设置上下文字符上限。
- 新建、编辑、导入单个 Markdown Skill 或含 `SKILL.md` 的文件夹；按项目关联并逐项选择每次要用的 Skill。
- 支持本机 Ollama 与 OpenAI 兼容接口；请求支持流式输出、超时、取消和错误提示。
- API Key 使用 Electron `safeStorage` 加密保存在本机；远程模型测试或生成前明确提示将发送的资料，并需作者确认。

## 下载与安装

前往 [GitHub Releases](https://github.com/ve766/ai-novel-studio/releases) 下载：

- **F 盘部署包 ZIP**：解压全部文件并运行 `一键安装到F盘.bat`。脚本确认 F 盘存在后才会创建 `F:\ai小说` 并打开安装向导；不会修改其它磁盘。
- **安装版 EXE**：安装向导默认使用 `F:\ai小说`（可自行更改）。
- **便携版 EXE**：无需安装；应用资料仍会优先保存在 F 盘。

Windows 有 F 盘时，小说资料默认保存到 `F:\ai小说\data`；若无法使用 F 盘，则回退到系统用户资料目录，并在模型设置中显示实际位置。默认模型服务地址为本机 Ollama；需自行安装并配置模型。应用不会替你下载模型。此版本未使用代码签名证书，Windows 可能显示“未知发布者”提示。

## 本地开发

需要 Node.js 22 或更新版本：

```bash
npm ci
npm run dev
```

常用命令：

```bash
npm test                 # 离线回归测试
npm run build            # 构建界面
npm run dist:win         # Windows x64 安装版与便携版
npm run verify:package   # 检查安装包、Electron 入口和 SHA-256
```

测试只使用本地临时数据和模拟模型响应，不调用真实模型或云端 API。Windows x64 安装版与便携版已完成构建；NSIS/7z 归档、内嵌 Electron app.asar 入口及 SHA-256 均已验证。当前 Linux/gVisor 环境无法执行 Windows 安装程序，实际 Windows 安装启动仍未做现场验证。

## 许可

本项目源代码使用 MIT License。字体、图标、Electron 与 Chromium 的第三方许可见 `THIRD_PARTY_NOTICES.md` 及 `licenses/`。
