# DevPilot

面向研发工作的 Windows 桌面智能助手。DevPilot 的目标是让开发者在本地代码仓库中通过 AI 理解代码、定位问题、提出修改，并在 Diff 审核确认后把修改应用到工作区。

> 当前状态：**阶段 1–2 已完成；阶段 3 已实现仓库选择、文件树与只读代码查看**。
> SQLite 持久化、Monaco 编辑器、Git status/diff、AI 对话、Diff 审核闭环与 Windows 打包尚未实现，计划见 [docs/DEVELOPMENT_PLAN.md](docs/DEVELOPMENT_PLAN.md)。
> 架构与编码约束以 [docs/TECHNICAL_DESIGN.md](docs/TECHNICAL_DESIGN.md) 为准。

## 已实现

- Electron + Vue 3 + TypeScript 分层工程（Main / Preload / Renderer / Shared）。
- 安全窗口配置：`contextIsolation: true`、`sandbox: true`、`nodeIntegration: false`。
- 最小化 Preload API：`window.devPilot.app.*`、`window.devPilot.settings.*`，不暴露任意 IPC channel。
- 主进程 IPC：应用信息、Ping 通信测试、AI 配置状态查询、仓库与文件读取，入参使用 Zod 校验。
- 本地仓库选择与切换：系统目录对话框，会话内登记，自动识别 Git 仓库。
- 安全文件访问：仓库 ID + 相对路径，`realpath` 规范化，拦截路径穿越、绝对路径与符号链接逃逸。
- 文件树与只读代码查看：忽略 `.git` / `node_modules`，5000 项上限；文件读取 1 MB 上限，支持 UTF-8/BOM，拒绝二进制与非法编码。
- 全局导航与三个页面：研发对话、研发工作区（IDE 三栏布局）、设置。
- Pinia Store：`repository`、`chat`、`workspace`，承载当前 UI 状态。
- 设置页展示模型配置状态、应用版本、Electron/Chromium/Node 版本与数据目录。
- ESLint、Prettier、TypeScript 严格模式、Vitest 单元测试。
- `.env` 配置加载：仅主进程读取，API Key 不出现在 Renderer、数据库或日志中。

## 技术栈

| 层次       | 技术                                       |
| ---------- | ------------------------------------------ |
| 桌面容器   | Electron 44                                |
| 工程脚手架 | electron-vite 6 + Vite 8                   |
| UI         | Vue 3.5 + TypeScript 5.9                   |
| 路由/状态  | Vue Router 4 + Pinia 3                     |
| UI 组件    | Element Plus 2 + 自定义暗色主题            |
| 数据校验   | Zod 4                                      |
| 测试/规范  | Vitest 5、ESLint 10、Prettier 3            |
| 规划中     | Monaco、LangChain.js、SQLite、ripgrep、Git |

## 环境要求

- Windows 10 / 11
- Node.js >= 22.12（当前验证版本：22.20.0）
- npm（当前验证版本：6.14.5）
- Git 与 ripgrep 将在阶段 3 / 5 使用；ripgrep 的随包分发方案尚待验证。

本项目 `.npmrc` 使用 npmmirror 镜像，适配国内网络。若 Electron 二进制下载失败，可显式指定镜像后重试：

```powershell
$env:ELECTRON_MIRROR = "https://npmmirror.com/mirrors/electron/"
npm run postinstall
```

## 快速开始

```bash
npm install
npm run dev
```

常用脚本：

| 命令                   | 说明                                 |
| ---------------------- | ------------------------------------ |
| `npm run dev`          | 启动 Electron 开发模式（带 HMR）     |
| `npm run build`        | 类型检查并构建 Main/Preload/Renderer |
| `npm test`             | 运行 Vitest 单元测试                 |
| `npm run typecheck`    | Node 与 Web 两套类型检查             |
| `npm run lint`         | ESLint 检查                          |
| `npm run format:check` | Prettier 格式检查                    |
| `npm start`            | 预览已构建产物                       |

## 配置 DeepSeek API Key

V1 按项目决定采用**本地 `.env`**，不提供应用内密钥编辑：

1. 在项目根目录复制 `.env.example` 为 `.env`。
2. 填写 `DEEPSEEK_API_KEY`、`DEEPSEEK_MODEL`、`DEEPSEEK_BASE_URL`。
3. 重启应用，在设置页确认状态为“已配置”。

打包后（阶段 7）从数据目录读取 `.env`，路径会显示在设置页，通常为
`%APPDATA%\DevPilot\.env`。

安全边界：`.env` 是本地明文文件，不等同于系统凭据库；它已被 `.gitignore` 忽略。API Key 只由主进程读取，不会进入 Renderer、数据库或日志。阶段 4 接通云端模型后，相关代码内容会发送到所配置的模型服务，界面与安全文档会明确提示。

## 安全与隐私

已实现的安全措施与后续计划详见 [docs/SECURITY.md](docs/SECURITY.md)，核心要点：

- Renderer 无 Node.js、文件系统、数据库能力，只能调用具名 Preload API。
- 不提供任意 shell / 命令执行入口。
- IPC 入参由主进程重新校验，错误以稳定错误码返回。
- AI 修改文件必须经过 Diff 展示与用户确认（阶段 6 实现）。
- 页面禁止任意导航，外部链接仅允许 `https://` 通过系统浏览器打开。

## 数据目录

Electron `userData` 目录（Windows 通常为 `%APPDATA%\DevPilot`）用于保存 `.env`
等本地配置。SQLite 数据库将在阶段 3 引入，并同样存放在该目录。

## 目录结构

```text
src/
├── main/        # 窗口、IPC、服务、工具
├── preload/     # contextBridge 最小 API 与类型声明
├── renderer/    # Vue 页面、组件、路由、Pinia Store
└── shared/      # 共享类型、Zod Schema、常量
tests/unit/      # Vitest 单元测试
docs/            # 技术设计、开发计划、安全说明、架构决策
```

## 已知限制

- 尚未接入 AI 模型、工具调用与流式输出（阶段 4–5）。
- 仓库登记仅保存在当前进程内，重启应用后需重新选择；SQLite 持久化尚未实现。
- 代码查看为只读，尚未接入 Monaco 与编辑能力（阶段 3 剩余 / 6）。
- 尚未接入 Git status/diff 与 Diff 审核（阶段 3 剩余 / 6）。
- 对话与编辑会话尚未持久化。
- 尚未生成 Windows 安装包，原生模块验证未开始（阶段 7）。
- 应用图标暂用脚手架占位图。
- Element Plus 当前为全量引入，Renderer 产物约 2.4 MB，后续可按需引入优化。
