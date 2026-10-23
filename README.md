# DevPilot

面向研发工作的 Windows 桌面智能助手。DevPilot 的目标是让开发者在本地代码仓库中通过 AI 理解代码、定位问题、提出修改，并在 Diff 审核确认后把修改应用到工作区。

> 当前状态：**阶段 1–6 已完成：仓库浏览与编辑、Git 只读集成、SQLite 持久化、多模型接入与切换、只读代码理解工具、AI 修改提案与 Diff 审核**。Windows NSIS 安装包已可构建。
> 交付计划与剩余验收项见 [docs/DEVELOPMENT_PLAN.md](docs/DEVELOPMENT_PLAN.md)。
> 架构与编码约束以 [docs/TECHNICAL_DESIGN.md](docs/TECHNICAL_DESIGN.md) 为准，数据库表结构见 [docs/DATABASE_SCHEMA.md](docs/DATABASE_SCHEMA.md)。

## 已实现

- Electron + Vue 3 + TypeScript 分层工程（Main / Preload / Renderer / Shared）。
- 安全窗口配置：`contextIsolation: true`、`sandbox: true`、`nodeIntegration: false`。
- 最小化 Preload API：`window.devPilot.app.*`、`window.devPilot.settings.*`、`window.devPilot.chat.*` 等具名能力，不暴露任意 IPC channel。
- 主进程 IPC：应用信息、Ping 通信测试、模型档案增删改与切换/连接测试、仓库与文件读写、对话与会话管理、AI 修改提案的查询/应用/拒绝，入参使用 Zod 校验。
- 本地仓库选择与切换：系统目录对话框，自动识别 Git 仓库。
- 仓库列表管理：工作区仓库下拉项悬停显示删除按钮，确认后把仓库移出应用列表；只移除登记与数据库记录，不删除磁盘文件，关联历史会话保留并解除关联，当前仓库被移除时自动切换到下一个。
- SQLite 持久化：`better-sqlite3`（N-API 预编译）在 `userData` 下创建 `devpilot.db`；`user_version` 迁移管理 `repositories`、`conversations`、`messages`、`edit_sessions`、`file_edits`、`model_profiles` 表与外键/索引；仓库列表与模型档案跨启动保留并自动恢复。
- 安全文件访问：仓库 ID + 相对路径，`realpath` 规范化，拦截路径穿越、绝对路径与符号链接逃逸。
- 文件树与代码查看：忽略 `.git` / `node_modules`，5000 项上限；文件读写 1 MB 上限，支持 UTF-8/BOM，拒绝二进制与非法编码。
- Monaco Editor 代码查看与手动编辑：按扩展名自动识别语言并提供语法高亮，多标签切换，关闭标签时释放模型与编辑器实例；Worker 随应用本地打包，编辑器在首次打开文件时按需加载。
- 手动保存：`Ctrl+S` 或“保存”按钮写回原文件；保存前复核路径、仓库范围与 SHA-256 哈希，外部修改会提示重新加载，不覆盖未确认的磁盘变更；保留 UTF-8 BOM，限制 1 MB 与空字符，使用临时文件原子替换。
- 未保存修改保护：关闭标签、切换仓库、离开工作区与退出应用时提示放弃修改。
- 只读 Git 集成：`git status --porcelain=v1 -z` 展示当前分支与工作区变更（含暂存、未跟踪、换名与冲突状态）；选择文件后展示相对 `HEAD` 的统一 Diff，未跟踪文件生成新增 Diff，未提交仓库以空树为基线；输出按 512 KB 截断，命令 10 秒超时、5 MB 上限。
- Git 面板：状态栏展示分支与变更数，变更列表与 Diff 视图支持加载/空/错误状态，可直接在编辑器中打开变更文件；保存文件后自动刷新。
- AI 对话（阶段 4）：流式回答，支持停止生成、120 秒超时与错误重试；会话与消息写入 SQLite，重启后恢复；首条用户消息自动生成会话标题；历史按最近 20 条 / 24k 字符裁剪。
- 多模型配置：设置页可新增、编辑、删除并切换模型档案（唯一全局当前模型），内置 DeepSeek、OpenAI、通义千问、Moonshot、智谱、SiliconFlow、Ollama 与自定义预设；`DeepSeek` 使用 `@langchain/deepseek`，其余走 OpenAI 兼容协议（`@langchain/openai`，可改 Base URL）。每个档案可单独关闭代码理解工具；无档案时继续回退 `.env`。对话输入框工具栏提供快捷切换下拉，与设置页共用同一全局当前模型。
- API Key 安全存储：Key 经 Electron `safeStorage`（Windows DPAPI）加密后写入 SQLite，Renderer 与 IPC 只看到“已配置”；更新时留空表示保留旧 Key；系统加密不可用时禁止保存 Key 并给出提示。
- 会话删除：对话页会话项悬停显示删除图标，确认后永久删除该会话及其全部消息；删除当前会话后自动切换到最近会话，无剩余会话时显示空状态；生成中的会话不可删除。
- 模型接入边界：共用的 OpenAI 兼容适配层统一流式文本归一化、工具调用聚合、用量与 HTTP 错误码映射；DeepSeek 与 OpenAI 适配器只负责创建底层模型实例；主进程全局单活动请求，`requestId` 防重放；取消或失败的部分文本不落库，避免污染后续上下文。
- 对话安全提示：未配置 Key 时禁用输入并引导到设置页；界面明确提示对话内容会发送到云端模型；设置页提供最小请求的“连接测试”。
- 只读代码理解工具（阶段 5）：`list_files`、`read_file`、`search_code`、`get_git_status`、`get_git_diff`，由受控 Agent 循环调用；模型会先定位再读取，并在回答中引用相对路径与行号。
- 工具执行可视：对话页与工作区右侧 AI 面板都会显示工具调用卡片（工具名、参数摘要、状态、耗时），工作区面板支持新建/切换会话，切换路由不中断生成。
- 工具调用摘要落库：重启或切换会话后仍可查看调用过程；只保存摘要，不保存文件内容、搜索片段或 Git 输出。
- 工具安全边界：全部只读；参数经 Zod 严格校验；敏感文件/目录与高置信密钥内容被阻断；工具输出声明为不可信数据，提示注入不能覆盖系统规则。
- 资源限制：最多 5 轮、每轮 4 次、单请求 12 次工具调用，单工具 15 秒超时、12k 字符，单请求累计 32k 字符；重复调用直接阻止。
- AI 修改闭环（阶段 6）：第六个工具 `propose_file_edit` 只生成待审核建议，不直接写盘；支持精确替换（`oldText` 必须唯一出现）与新建文件，不支持删除。
- Diff 审核界面：工作区“变更与 Diff”面板新增“AI 建议”标签，使用 Monaco Diff Editor 只读并排展示原文件与建议内容，逐文件应用或拒绝；多文件提案按请求分组，应用/拒绝后自动更新待审核计数。对话页有待审核建议时显示醒目的“去审核”主按钮，点击直达“AI 建议”标签；审核中可用按钮或快捷键跨文件（`Alt+Shift+↑/↓`）与文件内差异（`Alt+↑/↓`）切换，应用或拒绝后自动选中相邻建议。
- 应用安全复核：写入前重新校验仓库相对路径、目标状态与原始 SHA-256；文件被外部修改时标记“已过期”并拒绝覆盖；新建目标已存在时同样拒绝。已应用/已拒绝的提案不能重复处理。
- 应用结果反馈：成功后重新读取文件、打开标签并刷新 Git 状态（新建还会刷新文件树）；目标存在未保存编辑时会提示覆盖风险；多文件逐项处理，部分失败不影响已成功的文件。
- 提案持久化：`edit_sessions` / `file_edits` 保存原始与建议内容，重启或切换会话后仍可继续审核；提案只保存在本地 SQLite，不会额外上传。
- 浅色 / 深色双主题：侧边栏底部一键切换，设置页“外观”可选择；偏好保存在本地（localStorage），启动时预加载避免闪烁，Monaco、Markdown 代码高亮与 Diff 配色同步切换。
- 全局导航与三个页面：研发对话、研发工作区（IDE 三栏布局）、设置。
- Pinia Store：`repository`、`chat`、`workspace`，承载当前 UI 状态。
- 设置页展示当前模型摘要与档案列表、应用版本、Electron/Chromium/Node 版本与数据目录；`.env` 仅作为现有配置的兜底。
- ESLint、Prettier、TypeScript 严格模式、Vitest 单元测试。
- 配置加载：模型档案的 Key 只解密在主进程内存中使用，`.env` 也一样；API Key 不出现在 Renderer、日志或数据库明文中。

## 技术栈

| 层次       | 技术                                                    |
| ---------- | ------------------------------------------------------- |
| 桌面容器   | Electron 44                                             |
| 工程脚手架 | electron-vite 6 + Vite 8                                |
| UI         | Vue 3.5 + TypeScript 5.9                                |
| 路由/状态  | Vue Router 4 + Pinia 3                                  |
| UI 组件    | Element Plus 2（按需注册）+ 自定义暗色主题              |
| 代码编辑   | Monaco Editor 0.57（自定义入口、按需加载、Diff 审核）   |
| 代码高亮   | highlight.js 11（按需注册常用语言）                     |
| Git        | 系统 Git CLI（只读 status/diff，参数数组）              |
| 本地数据   | SQLite + better-sqlite3 13（N-API 预编译）              |
| AI 接入    | LangChain.js（@langchain/deepseek / @langchain/openai） |
| 数据校验   | Zod 4                                                   |
| 测试/规范  | Vitest 5、ESLint 10、Prettier 3                         |
| 代码检索   | 内置 ripgrep（`search_code`，只读）                     |

## 环境要求

- Windows 10 / 11
- Node.js >= 22.12（当前验证版本：22.20.0）
- npm（当前验证版本：6.14.5）
- Git status/diff 依赖系统 `git` 命令（需在 PATH 中）；未安装时面板会提示 `GIT_NOT_AVAILABLE`。
- SQLite 引擎随 `better-sqlite3` 打包，无需单独安装数据库；本机已验证该模块的 N-API 预编译二进制可在 Electron 44（Node 24 / ABI 149）与 Node 22 下直接加载。
- `search_code` 使用随 `@vscode/ripgrep` 安装的内置 `rg`，无需系统安装 ripgrep；如需指定其他版本，可设置环境变量 `DEV_PILOT_RG_PATH` 指向 `rg` 可执行文件。内置版本缺失时才回退到系统 PATH 中的 `rg`；全部不可用时该工具返回 `RG_NOT_AVAILABLE`，其他工具与对话不受影响。

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
| `npm run build:win`    | 构建 Windows NSIS 安装包             |
| `npm run pack:win`     | 构建免安装目录（便于本地验证）       |
| `npm test`             | 运行 Vitest 单元测试                 |
| `npm run typecheck`    | Node 与 Web 两套类型检查             |
| `npm run lint`         | ESLint 检查                          |
| `npm run format:check` | Prettier 格式检查                    |
| `npm start`            | 预览已构建产物                       |

## 打包

Windows 安装包使用 electron-builder（NSIS 辅助安装：用户可选择安装目录，并创建桌面与开始菜单快捷方式）。

```bash
npm run build:win # 产物：dist/DevPilot-<version>-setup.exe
npm run pack:win  # 产物：dist/win-unpacked/DevPilot.exe（免安装，便于验证）
```

- Main / Preload / Renderer 先由 electron-vite 输出到 `out/`，再与生产依赖一起打入 `app.asar`。
- 打包前执行 `clean:package-db`，从 `out/` 与 `resources/`（即进入安装包的内容）中删除 `*.db`、`*.db-wal`、`*.db-shm`、`*.sqlite`、`*.sqlite3` 等文件；只影响打包内容，不会触碰 `%APPDATA%\DevPilot` 下的运行时数据库。
- `better-sqlite3` 的 N-API 预编译二进制与 `@vscode/ripgrep` 的 `rg.exe` 通过 `asarUnpack` 解包；打包后 `rg` 从 `app.asar.unpacked` 启动。`npmRebuild: false`，无需本机 MSVC 工具链。
- 安装包未配置代码签名，首次运行可能触发 SmartScreen 提示。
- 首次构建会下载 Electron 与 electron-builder 辅助工具，项目 `.npmrc` 已配置 npmmirror 镜像。

若 Windows 未开启开发者模式，解压 `winCodeSign` 时可能报 `Cannot create symbolic link`（压缩包内含 macOS 符号链接）。可二选一：

1. 在“设置 → 开发者选项”中开启“开发人员模式”后重试；
2. 用 7-Zip 将 `winCodeSign-2.6.0.7z` 解压到 `%LOCALAPPDATA%\electron-builder\Cache\winCodeSign\winCodeSign-2.6.0`（可排除 `darwin/` 与 `linux/`），electron-builder 会直接使用该缓存。

## 配置模型

### 应用内配置（推荐）

1. 打开“设置 → 模型服务”，点击“新增模型”。
2. 选择服务商预设（DeepSeek、OpenAI、通义千问、Moonshot、智谱、SiliconFlow、Ollama 或自定义），预设会自动填入 Base URL 与默认模型；你也可以手动修改。
3. 填写 API Key。编辑已有档案时留空表示保留原 Key；Ollama 等本地 OpenAI 兼容服务可留空。
4. 需要时可关闭“启用代码理解工具”，再点击“测试连接”确认可用后保存。
5. 保存的首个档案会自动成为全局当前模型；之后可在列表里随时切换，也可以直接在对话页或工作区 AI 面板的输入框底部下拉中切换（对之后发送的消息生效）。

API Key 由主进程使用 Electron `safeStorage`（Windows DPAPI）加密后写入本地 SQLite，Renderer 与 IPC 只能看到“已配置”。自定义 Base URL 必须使用 `https`，仅本地回环地址（`localhost` / `127.0.0.1` / `[::1]`）允许 `http`。

### `.env` 兜底

没有配置任何模型档案时，应用仍会读取 `.env`：

1. 在项目根目录复制 `.env.example` 为 `.env`（打包后从数据目录读取）。
2. 填写 `DEEPSEEK_API_KEY`、`DEEPSEEK_MODEL`、`DEEPSEEK_BASE_URL`。
3. 重启应用，设置页会显示“当前使用 .env 配置”。新增档案后以档案配置为准。

安全边界：`.env` 是本地明文文件，不等同于系统凭据库；它已被 `.gitignore` 忽略。模型档案的 Key 以密文存储，二者都只由主进程读取，不会进入 Renderer、日志或数据库明文。对话内容会发送到所配置的云端模型；模型调用只读工具时，被读取的文件片段与搜索片段也会发送，界面与安全文档会持续提示。

## 安全与隐私

已实现的安全措施与后续计划详见 [docs/SECURITY.md](docs/SECURITY.md)，核心要点：

- Renderer 无 Node.js、文件系统、数据库能力，只能调用具名 Preload API。
- 不提供任意 shell / 命令执行入口。
- IPC 入参由主进程重新校验，错误以稳定错误码返回。
- 用户手动编辑保存会重新校验路径与文件哈希，外部修改不会被静默覆盖。
- Git 只读：仅执行固定的 `status` / `diff` / `rev-parse` / `branch` 参数数组，`shell: false`，无提交、暂存或推送操作，并限制超时与输出大小。
- AI 对话与工具：仅主进程持有模型请求、工具执行与 AbortController；系统提示禁止编造文件内容、路径与行号，未关联仓库时明确声明未读取文件；取消、超时或失败的部分回答不写入数据库。阶段 5 起，模型调用只读工具时会发送被读取的文件片段与搜索片段到云端模型，界面会持续提示。阶段 6 起，AI 生成的修改建议同样会作为工具参数发送到云端模型。
- AI 修改文件必须经过工作区 Diff 展示与用户逐文件确认；未确认的提案不写盘，外部修改会阻止应用。
- 模型 API Key：应用内档案使用 `safeStorage`（DPAPI）加密存储，只返回 `hasApiKey`；系统加密不可用时拒绝保存并提示改用 `.env`；草稿连接测试的 Key 仅随单次 IPC 传输，不落库。
- 页面禁止任意导航，外部链接仅允许 `https://` 通过系统浏览器打开。

## 数据目录

Electron `userData` 目录（Windows 通常为 `%APPDATA%\DevPilot`）用于保存 `.env`
与 SQLite 数据库 `devpilot.db`（含 WAL 日志文件）。数据库由主进程启动时创建并执行迁移，
保存仓库元数据、对话、消息、工具调用摘要、AI 修改提案（仅被提议文件的原始/建议内容）与模型档案（Key 为 `safeStorage` 密文）；应用退出时先中止进行中的模型请求，再关闭连接。若初始化失败，
应用仍可启动，本次运行不会持久化仓库或对话；模型配置回退到 `.env`。

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

- AI 只能提议修改或新建文件，不能删除文件；不支持批量应用、会话级撤销或自动格式化。
- 多文件提案逐项应用，不是原子事务：部分失败时已成功的文件保持已应用状态，失败项标记为 `stale` 或 `failed`。
- Git 变更视图仍为纯文本统一 Diff；Monaco Diff Editor 目前用于 AI 修改建议审核。
- Git 集成目前只读；暂存、提交与分支切换尚未接入。
- 安装包未配置代码签名，分发前如需避免 SmartScreen 提示，应补充签名证书配置。
- 应用图标暂用脚手架占位图。
- 模型提供商仅覆盖 DeepSeek 与 OpenAI 兼容协议（Anthropic / Gemini 原生协议未接入）；模型是全局当前配置，暂不支持会话级模型或在消息上记录所用模型。
- 模型预设中的默认模型名仅作参考，可能随服务商调整而过时，可在档案中手动修改。
- Monaco 仅注册与文件语言映射一致的常用语言，冷门语言以纯文本显示；代码编辑器与 AI Diff 在首次打开时异步加载，首次会有短暂加载提示。
- Element Plus 组件手动按需注册；新增组件时需在 `main.ts` 同步注册并引入对应样式。
