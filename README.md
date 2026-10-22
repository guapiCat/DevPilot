# DevPilot

面向研发工作的 Windows 桌面智能助手。DevPilot 的目标是让开发者在本地代码仓库中通过 AI 理解代码、定位问题、提出修改，并在 Diff 审核确认后把修改应用到工作区。

> 当前状态：**阶段 1–5 已完成：仓库浏览与编辑、Git 只读集成、SQLite 持久化、DeepSeek 流式对话、只读代码理解工具**。
> Diff 审核闭环与 Windows 打包尚未实现，计划见 [docs/DEVELOPMENT_PLAN.md](docs/DEVELOPMENT_PLAN.md)。
> 架构与编码约束以 [docs/TECHNICAL_DESIGN.md](docs/TECHNICAL_DESIGN.md) 为准，数据库表结构见 [docs/DATABASE_SCHEMA.md](docs/DATABASE_SCHEMA.md)。

## 已实现

- Electron + Vue 3 + TypeScript 分层工程（Main / Preload / Renderer / Shared）。
- 安全窗口配置：`contextIsolation: true`、`sandbox: true`、`nodeIntegration: false`。
- 最小化 Preload API：`window.devPilot.app.*`、`window.devPilot.settings.*`、`window.devPilot.chat.*` 等具名能力，不暴露任意 IPC channel。
- 主进程 IPC：应用信息、Ping 通信测试、AI 配置状态查询与连接测试、仓库与文件读写、对话与会话管理，入参使用 Zod 校验。
- 本地仓库选择与切换：系统目录对话框，自动识别 Git 仓库。
- 仓库列表管理：工作区仓库下拉项悬停显示删除按钮，确认后把仓库移出应用列表；只移除登记与数据库记录，不删除磁盘文件，关联历史会话保留并解除关联，当前仓库被移除时自动切换到下一个。
- SQLite 持久化：`better-sqlite3`（N-API 预编译）在 `userData` 下创建 `devpilot.db`；`user_version` 迁移管理 `repositories`、`conversations`、`messages`、`edit_sessions`、`file_edits` 基础表与外键/索引；仓库列表跨启动保留并自动恢复最近仓库。
- 安全文件访问：仓库 ID + 相对路径，`realpath` 规范化，拦截路径穿越、绝对路径与符号链接逃逸。
- 文件树与代码查看：忽略 `.git` / `node_modules`，5000 项上限；文件读写 1 MB 上限，支持 UTF-8/BOM，拒绝二进制与非法编码。
- Monaco Editor 代码查看与手动编辑：按扩展名自动识别语言并提供语法高亮，多标签切换，关闭标签时释放模型与编辑器实例；Worker 随应用本地打包。
- 手动保存：`Ctrl+S` 或“保存”按钮写回原文件；保存前复核路径、仓库范围与 SHA-256 哈希，外部修改会提示重新加载，不覆盖未确认的磁盘变更；保留 UTF-8 BOM，限制 1 MB 与空字符，使用临时文件原子替换。
- 未保存修改保护：关闭标签、切换仓库、离开工作区与退出应用时提示放弃修改。
- 只读 Git 集成：`git status --porcelain=v1 -z` 展示当前分支与工作区变更（含暂存、未跟踪、换名与冲突状态）；选择文件后展示相对 `HEAD` 的统一 Diff，未跟踪文件生成新增 Diff，未提交仓库以空树为基线；输出按 512 KB 截断，命令 10 秒超时、5 MB 上限。
- Git 面板：状态栏展示分支与变更数，变更列表与 Diff 视图支持加载/空/错误状态，可直接在编辑器中打开变更文件；保存文件后自动刷新。
- AI 对话（阶段 4）：DeepSeek 流式回答，支持停止生成、120 秒超时与错误重试；会话与消息写入 SQLite，重启后恢复；首条用户消息自动生成会话标题；历史按最近 20 条 / 24k 字符裁剪。
- 会话删除：对话页会话项悬停显示删除图标，确认后永久删除该会话及其全部消息；删除当前会话后自动切换到最近会话，无剩余会话时显示空状态；生成中的会话不可删除。
- 模型接入边界：LangChain.js `@langchain/deepseek` 适配层统一文本归一化、用量与 HTTP 错误码映射；主进程全局单活动请求，`requestId` 防重放；取消或失败的部分文本不落库，避免污染后续上下文。
- 对话安全提示：未配置 Key 时禁用输入并引导到设置页；界面明确提示对话内容会发送到云端模型；设置页提供最小请求的“连接测试”。
- 只读代码理解工具（阶段 5）：`list_files`、`read_file`、`search_code`、`get_git_status`、`get_git_diff`，由受控 Agent 循环调用；模型会先定位再读取，并在回答中引用相对路径与行号。
- 工具执行可视：对话页与工作区右侧 AI 面板都会显示工具调用卡片（工具名、参数摘要、状态、耗时），工作区面板支持新建/切换会话，切换路由不中断生成。
- 工具调用摘要落库：重启或切换会话后仍可查看调用过程；只保存摘要，不保存文件内容、搜索片段或 Git 输出。
- 工具安全边界：全部只读；参数经 Zod 严格校验；敏感文件/目录与高置信密钥内容被阻断；工具输出声明为不可信数据，提示注入不能覆盖系统规则。
- 资源限制：最多 5 轮、每轮 4 次、单请求 12 次工具调用，单工具 15 秒超时、12k 字符，单请求累计 32k 字符；重复调用直接阻止。
- 全局导航与三个页面：研发对话、研发工作区（IDE 三栏布局）、设置。
- Pinia Store：`repository`、`chat`、`workspace`，承载当前 UI 状态。
- 设置页展示模型配置状态、应用版本、Electron/Chromium/Node 版本与数据目录。
- ESLint、Prettier、TypeScript 严格模式、Vitest 单元测试。
- `.env` 配置加载：仅主进程读取，API Key 不出现在 Renderer、数据库或日志中。

## 技术栈

| 层次       | 技术                                        |
| ---------- | ------------------------------------------- |
| 桌面容器   | Electron 44                                 |
| 工程脚手架 | electron-vite 6 + Vite 8                    |
| UI         | Vue 3.5 + TypeScript 5.9                    |
| 路由/状态  | Vue Router 4 + Pinia 3                      |
| UI 组件    | Element Plus 2 + 自定义暗色主题             |
| 代码编辑   | Monaco Editor 0.57（本地 Worker、手动保存） |
| Git        | 系统 Git CLI（只读 status/diff，参数数组）  |
| 本地数据   | SQLite + better-sqlite3 13（N-API 预编译）  |
| AI 接入    | LangChain.js（@langchain/deepseek）         |
| 数据校验   | Zod 4                                       |
| 测试/规范  | Vitest 5、ESLint 10、Prettier 3             |
| 代码检索   | 系统 ripgrep CLI（`search_code`，只读）     |

## 环境要求

- Windows 10 / 11
- Node.js >= 22.12（当前验证版本：22.20.0）
- npm（当前验证版本：6.14.5）
- Git status/diff 依赖系统 `git` 命令（需在 PATH 中）；未安装时面板会提示 `GIT_NOT_AVAILABLE`。
- SQLite 引擎随 `better-sqlite3` 打包，无需单独安装数据库；本机已验证该模块的 N-API 预编译二进制可在 Electron 44（Node 24 / ABI 149）与 Node 22 下直接加载。
- `search_code` 依赖系统 PATH 中的 `ripgrep`（`rg`）。缺失时该工具返回 `RG_NOT_AVAILABLE`，其他工具与对话不受影响；随包分发方案留待阶段 7 验证。

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

安全边界：`.env` 是本地明文文件，不等同于系统凭据库；它已被 `.gitignore` 忽略。API Key 只由主进程读取，不会进入 Renderer、数据库或日志。阶段 4 起对话内容会发送到所配置的云端模型；阶段 5 起，模型调用只读工具时被读取的文件片段与搜索片段也会发送，界面与安全文档会持续提示。

## 安全与隐私

已实现的安全措施与后续计划详见 [docs/SECURITY.md](docs/SECURITY.md)，核心要点：

- Renderer 无 Node.js、文件系统、数据库能力，只能调用具名 Preload API。
- 不提供任意 shell / 命令执行入口。
- IPC 入参由主进程重新校验，错误以稳定错误码返回。
- 用户手动编辑保存会重新校验路径与文件哈希，外部修改不会被静默覆盖。
- Git 只读：仅执行固定的 `status` / `diff` / `rev-parse` / `branch` 参数数组，`shell: false`，无提交、暂存或推送操作，并限制超时与输出大小。
- AI 对话与工具：仅主进程持有模型请求、工具执行与 AbortController；系统提示禁止编造文件内容、路径与行号，未关联仓库时明确声明未读取文件；取消、超时或失败的部分回答不写入数据库。阶段 5 起，模型调用只读工具时会发送被读取的文件片段与搜索片段到云端模型，界面会持续提示。
- AI 修改文件必须经过 Diff 展示与用户确认（阶段 6 实现）。
- 页面禁止任意导航，外部链接仅允许 `https://` 通过系统浏览器打开。

## 数据目录

Electron `userData` 目录（Windows 通常为 `%APPDATA%\DevPilot`）用于保存 `.env`
与 SQLite 数据库 `devpilot.db`（含 WAL 日志文件）。数据库由主进程启动时创建并执行迁移，
保存仓库元数据、对话、消息与工具调用摘要；应用退出时先中止进行中的模型请求，再关闭连接。若初始化失败，
应用仍可启动，但本次运行不会持久化仓库或对话。

## 目录结构

```text
src/
├── main/        # 窗口、IPC、服务、工具
├── preload/     # contextBridge 最小 API 与类型声明
├── renderer/    # Vue 页面、组件、路由、Pinia Store
└── shared/      # 共享类型、Zod Schema、常量
tests/unit/      # Vitest 单元测试
docs/            # 技术设计、开发计划、安全说明、架构决策、数据库表结构
```

## 已知限制

- `search_code` 需要系统 PATH 中存在 `ripgrep`；未安装时该工具不可用（返回 `RG_NOT_AVAILABLE`），应用尚未随包分发 `rg`（阶段 7）。
- 工具仅只读；AI 提议修改文件、Diff 审核与应用流程尚未接入（阶段 6）。
- SQLite 中的 `edit_sessions`、`file_edits` 表仍为阶段 6 预留。
- 目前已支持手动编辑与保存；AI 提议修改的 Diff 审核尚未接入（阶段 6）。
- Git 集成目前只读；暂存、提交、分支切换与 AI 提议修改的 Diff 审核（阶段 6）尚未接入。
- Diff 视图为纯文本统一 Diff，尚未使用 Monaco Diff Editor（阶段 6）。
- 尚未生成 Windows 安装包，better-sqlite3 在安装包内的加载验证未开始（阶段 7）。
- 应用图标暂用脚手架占位图。
- Element Plus 与 Monaco 当前为全量引入，Renderer 产物与语言 Worker 体积较大，后续可按需引入优化。
