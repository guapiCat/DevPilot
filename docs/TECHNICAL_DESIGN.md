# DevPilot 技术方案与 AI 编码指导文档

> 文档类型：项目技术总纲 / AI 编码约束\
> 项目名称：DevPilot\
> 目标平台：Windows 桌面端优先\
> 文档版本：v1.0\
> 状态：V1 开发基线\
> 适用对象：项目开发者、Claude Code、Cursor 及其他 AI 编码助手

------------------------------------------------------------------------

## 1. 项目目标

DevPilot
是一个面向研发工作的桌面智能助手，核心能力是让开发者在本地代码仓库中使用
AI 理解代码、定位问题、提出代码修改，并通过 Diff
审核后将修改应用到本地工作区。

V1 必须形成可演示、可打包、可实际使用的完整闭环，而不是只有聊天界面。

### 1.1 核心验收流程

1.  用户启动 DevPilot。
2.  用户选择一个本地 Git 仓库。
3.  用户在研发对话页面询问项目相关问题。
4.  AI 使用受控工具列出文件、搜索代码、读取文件和查看 Git 状态。
5.  AI 根据实际代码上下文回答问题，必要时提出一个或多个文件修改。
6.  应用展示修改前后的 Diff。
7.  用户明确确认后，应用才把修改写入本地仓库。
8.  应用重新读取 Git 状态，用户可在外部 IDE 或终端看到真实变更。

### 1.2 V1 范围

**必须实现：** - 独立研发聊天页面。 - IDE 风格研发工作区。 -
选择、切换本地 Git 仓库。 - 文件树、文件预览/编辑展示。 - Git 状态与
Diff 查看。 - 用户发起的暂存、提交、本地分支与远程同步（固定白名单，无
force/reset/amend/rebase）。 - DeepSeek 对话与流式输出。 - AI
通过受控工具搜索和读取代码。 - AI 提议文件修改、Diff
审核、用户确认后应用。 - 本地保存仓库配置、对话、消息和修改会话。 -
Windows 开发运行与安装包构建。 - 基本单元测试、错误提示和安全校验。

**V1 暂不实现：** - 自动执行任意终端命令。 - 未经确认自动修改文件。 - 多
Agent 协作。 - 大规模向量数据库和完整 RAG 平台。 - GitHub/GitLab
远程仓库管理。 - 企业账号、团队权限和云端同步。 - AI 自动提交、推送或创建
Pull Request（用户仍可在源代码管理页手动执行 Git 写操作）。 - 自动执行测试、安装依赖或运行项目脚本。

如果后续需要扩展，应先提出设计变更，不要在实现某个功能时悄悄扩大 V1
范围。

------------------------------------------------------------------------

## 2. 技术栈

  层次         技术                        职责
  ------------ --------------------------- ------------------------------------
  桌面容器     Electron                    窗口、生命周期、桌面能力
  工程脚手架   electron-vite               Main、Preload、Renderer 构建与开发
  UI 框架      Vue 3 + TypeScript          页面与交互
  构建工具     Vite                        Renderer 开发构建
  路由         Vue Router                  Chat、Workspace、Settings 页面
  状态管理     Pinia                       当前 UI 状态与跨组件状态
  UI 组件      Element Plus + 自定义 CSS   常规控件与产品化布局
  代码编辑器   Monaco Editor               代码查看、编辑和 Diff 展示
  AI 编排      LangChain.js                模型调用与工具调用集成
  模型服务     DeepSeek / OpenAI 兼容 API  按用户配置的模型档案
  数据验证     Zod                         IPC 输入、工具参数和模型结构校验
  本地数据库   SQLite + better-sqlite3     对话、仓库配置、编辑会话
  代码搜索     ripgrep                     本地快速搜索
  Git 操作     Git CLI                     status/diff 与用户发起的远端/提交操作
  单元测试     Vitest                      工具、服务、数据逻辑测试
  打包         electron-builder            Windows 安装包
  代码规范     ESLint + Prettier           静态检查和格式化

### 2.1 依赖选择原则

-   优先采用稳定、成熟、维护活跃的依赖。
-   不为了展示技术而增加依赖。
-   所有依赖必须有明确用途。
-   锁定依赖版本并提交 lockfile。
-   `better-sqlite3` 是原生模块，必须验证 Electron ABI
    重建、开发运行和安装包运行；不能只以普通 Node.js
    环境可运行作为验收。
-   LangChain.js 的实际模型适配和工具调用行为必须以当前安装版本及
    DeepSeek API 能力为准。若某个抽象不能稳定支持需要的行为，应在
    `ModelAdapter` 边界内处理，不允许让业务层到处依赖供应商细节。
-   不默认引入 NestJS、LangGraph、向量数据库或额外后端服务。

------------------------------------------------------------------------

## 3. 总体架构

采用 Electron 单机分层架构。V1 不需要独立部署后端服务器。

``` text
┌──────────────────────────────────────────────────────┐
│ Renderer：Vue 3 + TypeScript                         │
│ Chat / Workspace / Source Control / Settings / Monaco │
│ Pinia / Vue Router / Element Plus                     │
└────────────────────────┬─────────────────────────────┘
                         │ window.devPilot（受限 API）
┌────────────────────────▼─────────────────────────────┐
│ Preload：安全桥接层                                    │
│ contextBridge / 类型化 API                            │
└────────────────────────┬─────────────────────────────┘
                         │ IPC
┌────────────────────────▼─────────────────────────────┐
│ Main：应用业务层                                       │
│ IPC Handlers → Services → Repositories / Adapters    │
│                                                      │
│ Repository / File / Git / Search / AI / Diff / DB    │
│ Git：只读查询 + 用户白名单写操作、错误分类            │
│                                                      │
│ AI Orchestrator → Tool Registry → 受控本地工具        │
└──────────────┬────────────────────┬──────────────────┘
               │                    │
       本地文件系统、Git          模型 API（DeepSeek / OpenAI 兼容）
               │
          SQLite 数据库
```

### 3.1 分层职责

**Renderer** - 只负责 UI、用户交互和展示状态。 - 通过 `window.devPilot`
调用主进程能力。 - 不直接导入 `fs`、`child_process`、`better-sqlite3` 等
Node.js 能力。 - 不直接保存模型 API Key。 - 不负责决定 AI
工具是否有权限执行。

**Preload** - 通过 `contextBridge.exposeInMainWorld` 暴露最小化 API。 -
不暴露原始 `ipcRenderer`，不提供任意 IPC channel 调用入口。 - 为
`window.devPilot` 提供 TypeScript 类型声明。

**Main** - 负责文件系统、Git、数据库、模型调用和业务规则。 - 对每次 IPC
请求重新验证参数。 -
对仓库路径、文件路径、工具调用和文件修改执行安全检查。 -
业务逻辑放入独立 Service，不将所有实现堆在 `main.ts` 或 IPC 文件中。

**Shared** - 存放 Main、Preload、Renderer 共享的纯 TypeScript 类型、Zod
Schema 和常量。 - 不放依赖 Electron、Vue 或 Node.js 的业务实现。

### 3.2 依赖方向

允许的依赖方向：

``` text
Renderer → window.devPilot API 类型
Preload → Shared 类型
Main → Services → Adapters / Database / AI tools
Main、Preload、Renderer → Shared 类型
```

禁止： - Renderer 直接调用 Main 内部 Service。 - Renderer
直接读写本地文件。 - Shared 依赖 Renderer 或 Main 的具体实现。 - AI
工具直接修改 UI 状态。 - IPC Handler 中实现大段业务逻辑。 -
任何模块为了方便而循环依赖。

------------------------------------------------------------------------

## 4. 推荐项目目录

``` text
devpilot/
├── package.json
├── electron.vite.config.ts
├── tsconfig.json
├── .env.example
├── README.md
├── docs/
│   ├── TECHNICAL_DESIGN.md
│   ├── DEVELOPMENT_PLAN.md
│   └── SECURITY.md
├── src/
│   ├── main/
│   │   ├── index.ts
│   │   ├── ipc/
│   │   │   ├── index.ts
│   │   │   ├── repository.ipc.ts
│   │   │   ├── file.ipc.ts
│   │   │   ├── git.ipc.ts
│   │   │   ├── ai.ipc.ts
│   │   │   └── settings.ipc.ts
│   │   ├── services/
│   │   │   ├── repository.service.ts
│   │   │   ├── file.service.ts
│   │   │   ├── git.service.ts
│   │   │   ├── git-errors.ts
│   │   │   ├── code-search.service.ts
│   │   │   ├── ai.service.ts
│   │   │   ├── diff.service.ts
│   │   │   └── database.service.ts
│   │   ├── ai/
│   │   │   ├── model-manager.ts
│   │   │   ├── model-adapter.ts
│   │   │   ├── prompt-builder.ts
│   │   │   ├── context-manager.ts
│   │   │   ├── tool-registry.ts
│   │   │   ├── agent-runner.ts
│   │   │   └── tools/
│   │   │       ├── list-files.tool.ts
│   │   │       ├── read-file.tool.ts
│   │   │       ├── search-code.tool.ts
│   │   │       ├── get-git-status.tool.ts
│   │   │       ├── get-git-diff.tool.ts
│   │   │       └── propose-file-edit.tool.ts
│   │   ├── database/
│   │   │   ├── schema.sql
│   │   │   ├── migrations/
│   │   │   └── repositories/
│   │   └── utils/
│   │       ├── path-security.ts
│   │       ├── process-runner.ts
│   │       └── error-handler.ts
│   ├── preload/
│   │   ├── index.ts
│   │   └── index.d.ts
│   ├── renderer/
│   │   ├── index.html
│   │   └── src/
│   │       ├── main.ts
│   │       ├── App.vue
│   │       ├── router/
│   │       ├── layouts/
│   │       │   └── WorkspaceLayout.vue
│   │       ├── views/
│   │       │   ├── ChatView.vue
│   │       │   ├── WorkspaceView.vue
│   │       │   ├── SourceControlView.vue
│   │       │   └── SettingsView.vue
│   │       ├── components/
│   │       │   ├── chat/
│   │       │   ├── repository/
│   │       │   ├── editor/
│   │       │   ├── diff/
│   │       │   └── source-control/
│   │       ├── stores/
│   │       │   ├── chat.ts
│   │       │   ├── git.ts
│   │       │   ├── repository.ts
│   │       │   └── workspace.ts
│   │       ├── services/
│   │       │   └── desktop-api.ts
│   │       └── types/
│   └── shared/
│       ├── schemas/
│       ├── types/
│       │   ├── repository.ts
│       │   ├── chat.ts
│       │   ├── ai.ts
│       │   ├── diff.ts
│       │   └── git.ts
│       ├── utils/
│       │   ├── git.ts
│       │   └── path.ts
│       └── constants/
└── tests/
    ├── unit/
    └── fixtures/
```

目录可随实际开发做小幅调整，但必须保留 Main、Preload、Renderer、Shared
的边界。新增目录前先确认现有目录无法合理承载该职责。

------------------------------------------------------------------------

## 5. 页面与交互

### 5.1 全局导航

左侧全局导航至少包含： - 研发对话 - 研发工作区 - 源代码管理 - 设置

### 5.2 研发对话页

目标：用户可以在没有打开具体工作区时进行研发问题讨论。

包含： - 会话列表和新建会话。 - 消息列表。 - Markdown 回答展示。 -
代码块展示。 - 流式输出状态。 - 停止生成按钮。 - 错误重试或错误提示。 -
可选关联当前仓库。

### 5.3 研发工作区

建议采用 IDE 风格三栏布局：

-   左侧：当前仓库、文件树、搜索入口。
-   中间：代码查看器/编辑器和打开文件标签。
-   右侧：AI 助手对话与工具执行过程。
-   底部或可折叠区域：Diff 审核面板、Git 变更状态。

窗口尺寸较小时，允许右侧 AI 面板和 Diff
面板折叠。布局应优先保证代码区域可用，不要将所有功能做成拥挤的固定宽度列。

### 5.4 设置页

至少支持： - 模型档案管理：新增、编辑、删除、切换全局当前模型。 -
内置服务商预设（DeepSeek、OpenAI、通义千问、Moonshot、智谱、SiliconFlow、Ollama、自定义），选择后自动填入 Base URL 与默认模型。 -
每个档案独立的 API Key、模型名称、Base URL 与“启用代码理解工具”开关。 -
保存前与列表中的连接测试。 - 基本应用信息与数据目录说明。 -
无档案时的 `.env` 兜底提示。

API Key 不得写入 Renderer
的持久化存储或前端打包资源。应用内档案使用 Electron `safeStorage`（Windows
DPAPI）加密后写入 SQLite；明文只在主进程内存中存在。若系统加密不可用，拒绝保存带 Key
的档案。`.env` 仅作为兜底，必须明确其明文安全边界，不得声称它与系统密钥库等价。

### 5.5 模型档案数据流

``` text
SettingsView（档案表单）
   │ saveModelProfile / testModelProfile（Zod 校验）
Preload → IPC → ModelProfileService
   │                     ├─ SecretCipher（safeStorage）加密 / 解密
   │                     └─ ModelProfileStore → SQLite model_profiles
   │
ChatService.configProvider = () => modelProfileService.resolveActive()
   │
   ├─ provider = deepseek           → ChatDeepSeek
   └─ provider = openai-compatible  → ChatOpenAI（Base URL 可配）
```

- `resolveActive()` 顺序：active 档案（解密 Key）→ `.env` → `MODEL_CONFIG_ERROR`。
- 档案摘要只包含 `hasApiKey`，不包含 Key、密文或片段。
- `toolsEnabled=false` 时既不绑定 ToolRegistry，也在 system prompt 中声明当前无工具。
- 对话输入框工具栏的 `ModelSwitcher` 复用同一 `activateModelProfile` IPC 切换全局当前模型；chat store 保存完整 `AiConfigStatus`，切换后下一条消息生效。无档案但 `.env` 生效时仅显示只读的“环境变量 · 模型”标签。

### 5.6 源代码管理页

目标：让用户在不离开应用的情况下完成日常 Git 工作流，同时保持 AI 只读。页面为全高工具栏 + 三栏布局：

- 顶部工具栏：仓库选择与打开、当前分支（点击打开分支对话框）、upstream 与 `↑ahead ↓behind`、fetch/pull/push（禁用条件与 tooltip）、刷新。
- 左栏：`ChangesPanel`（已暂存/未暂存分组，单个与全部暂存/取消、冲突文件确认、选中查看 Diff）+ `CommitBox`（textarea、字数、已暂存数量、Ctrl+Enter 提交；分离 HEAD 时提示）。
- 中栏：`HistoryPanel` 提交列表（shortSha、subject、作者、相对时间、加载更多）。
- 右栏：选中提交时显示 `CommitDetail`（元信息、body、文件列表、`UnifiedDiffView`）；否则显示选中变更的工作区 Diff 与“在编辑器中打开”；都无时显示空状态。
- 分支对话框 `BranchDialog`：筛选、本地分支列表（当前标记、upstream、commit、subject）、切换、新建分支（可选立即切换）。

交互与联动：

- 切换仓库时重置 git store，并刷新 status/branches/log/remote；页面挂载时若无当前仓库则自动选择最近一个。
- 每次写成功后统一刷新上述四类数据。切分支或 pull 成功后重新加载文件树并清空工作区打开标签；存在未保存编辑或工作区有未提交修改时先确认。
- 确认矩阵：暂存/取消暂存、提交（非分离 HEAD）、新建分支无需确认；分离 HEAD 提交、脏工作区切分支、pull（提示仅快进）、push（显示 remote/branch/ahead，首次推送提示设置 upstream）需要确认。确认只是 UX，主进程的固定参数与命令白名单才是硬约束。
- `UnifiedDiffView` 从工作区 Diff 面板抽出，供变更、提交详情与工作区共用；仅使用已注册的 Element Plus 组件。

------------------------------------------------------------------------

## 6. 核心模块设计

### 6.1 RepositoryService

职责： - 打开系统目录选择器，让用户选择本地仓库。 -
检查路径存在、可读，确认是有效目录。 - 识别仓库根目录及 Git 仓库状态。 -
管理已登记仓库。 - 提供仓库基础信息。

约束： - 仓库路径必须由用户明确选择或来自已保存的可信配置。 -
所有文件操作必须限定在当前授权仓库中。 -
不能因为模型输出一个路径就自动把它注册为可信仓库。

### 6.2 FileService

职责： - 读取仓库中的文本文件。 - 获取文件元信息。 -
为编辑提案读取原始内容。 - 在确认后写入文件。 - 处理新建文件等受控操作。

约束： - 限制单文件最大读取字节数，超限时提示或分段读取。 -
二进制文件不能按普通 UTF-8 文本直接展示。 - 检测并妥善处理 UTF-8、BOM
和常见换行符。 - 拒绝仓库外路径、路径穿越、危险符号链接目标。 -
写入前校验原始文件哈希，避免覆盖用户在 VS Code
等外部编辑器中刚刚做出的修改。

### 6.3 CodeSearchService

使用 ripgrep 进行本地文本搜索。

约束： - 通过 `spawn`/安全进程封装传入参数数组，不拼接 shell
命令字符串。 - 默认尊重 `.gitignore`。 - 排除
`.git`、`node_modules`、构建产物、缓存和明显的二进制文件。 -
对返回文件数、匹配数、单个片段长度和总输出长度设置上限。 -
返回结构化数据：文件相对路径、行号、匹配内容片段。 -
搜索无结果是正常结果，不应当作为异常抛出。 - ripgrep
未安装或不可用时给出可理解的错误信息；是否随安装包分发
ripgrep，应在打包阶段验证。

### 6.4 GitService

读能力：

- `status --porcelain=v1 -z --untracked-files=all` 与 `rev-parse --verify --quiet HEAD`，派生 `headState`（attached / detached / unborn）。
- `diff --no-color --no-ext-diff <HEAD> -- <path>`；未提交仓库以空树 SHA 为基线；未跟踪文件由 `FileService.read` 生成合成 Diff。
- `for-each-ref` 读取本地分支（上限 500）与 upstream，unborn 时用 `branch --show-current` 合成当前分支。
- `log -z --max-count=<limit+1> --skip=<skip> --format=%H%x1f…` 读取历史，用 `-z` 分记录、`%x1f` 分字段，body 截断 4000；多取一条判断 `hasMore`。
- `diff-tree --root --first-parent -m -r -M --no-commit-id --name-status -z` 读取提交文件列表（`-m` 让合并提交展示 first-parent 变更，`-M` 检测重命名），`show --first-parent --format=` 读取补丁；按 512 KB 截断。
- `remote` 与 `rev-list --left-right --count @{upstream}...HEAD` 读取远程与 ahead/behind，不自动 fetch。

写能力（仅由用户发起）：

- `--literal-pathspecs add -- <paths>` / `add -A --`；有 HEAD 时 `restore --staged -- <paths|.>`，unborn 时 `rm --cached -r -q --`。
- `-c commit.gpgsign=false commit -m <message>`（不 `-a`），成功后 `rev-parse --short HEAD`。
- `branch -- <name>`、`switch -c <name>`、`switch -- <name>`。
- `fetch --no-tags --no-recurse-submodules <remote>`；`pull --ff-only --no-recurse-submodules <remote> <remoteBranch>`；`push --porcelain <remote> HEAD:<branch>` 或首次 `--set-upstream <remote> HEAD`。

安全约束：

- 使用参数数组执行命令、`shell: false`，不拼接用户输入到 shell 命令；仓库根目录只来自 `RepositoryService`。
- IPC 层 Zod 校验 + 服务层二次校验：`isSafeBranchName`、`isSafeGitPath`（拒绝 `:` 前缀）、提交信息长度/NUL、SHA 40/64 位小写十六进制、remote 名 `[A-Za-z0-9._-]`。
- 本地写 30 秒、网络 60 秒超时，输出上限 5 MB；网络命令禁用交互式凭据提示并限制协议为 `https:ssh:file`。
- 不提供 reset、clean、amend、rebase、stash、force、删除分支/远端或任意 Git 参数入口；不把 Git 输出中的文件内容当作可信指令。
- 失败由 `classifyGitFailure` 映射为固定中文错误码与消息，日志只记录 operation / exitCode / code。

### 6.5 DiffService

职责： - 保存 AI 提议的原始内容和目标内容。 - 生成可供 Monaco Diff
Editor 展示的输入。 - 跟踪修改状态。 - 在确认应用前执行一致性检查。 -
应用成功后刷新 Git 状态。

编辑状态建议： - `proposed`：已生成提案，等待用户审核。 -
`approved`：用户确认，等待应用。 - `applied`：已成功写入。 -
`rejected`：用户拒绝。 -
`stale`：原文件已被外部修改，提案需要重新生成或人工处理。 -
`failed`：应用失败。

不要在用户点击确认前修改真实文件。

------------------------------------------------------------------------

## 7. AI 模型与工具调用

### 7.1 模型适配层

业务服务不得直接依赖 DeepSeek
的具体请求格式。建立统一适配接口，使未来可以切换其他兼容模型。

建议接口草案：

``` ts
export type ChatRole = 'system' | 'user' | 'assistant' | 'tool'

export interface ChatMessage {
  role: ChatRole
  content: string
}

export interface ModelRequest {
  messages: ChatMessage[]
  signal?: AbortSignal
  temperature?: number
  maxTokens?: number
}

export type ModelEvent =
  | { type: 'text_delta'; text: string }
  | { type: 'tool_call'; id: string; name: string; arguments: unknown }
  | { type: 'usage'; inputTokens?: number; outputTokens?: number }
  | { type: 'completed' }
  | { type: 'error'; message: string }

export interface ModelAdapter {
  stream(request: ModelRequest): AsyncIterable<ModelEvent>
}
```

这是项目内部接口的初始设计，不要求 LangChain.js
原样实现此接口。LangChain.js
的具体返回结构应由适配层转换成项目自己的事件类型。

当前实现：

- `OpenAiCompatibleAdapter`：共用适配器，负责流式循环、文本归一化、工具分片聚合、usage、
  abort 与 HTTP 错误映射；构造时注入 `createModel(options)`。
- `DeepSeekAdapter`：注入 `new ChatDeepSeek(options)`（`@langchain/deepseek`）。
- `OpenAiChatAdapter`：注入 `new ChatOpenAI(options)`（`@langchain/openai`），Base URL 可配，
  空 Key 使用占位值 `not-needed` 以支持本地 Ollama 等。
- `createModelAdapter(config)` 按 `config.provider` 分派；`ResolvedAiConfig` 包含
  `provider`、`apiKey`、`model`、`baseUrl`、`toolsEnabled` 与可选的 `profileId`。

模型适配层必须考虑： - 流式文本。 - 工具调用及工具返回。 - 取消请求。 -
超时。 - API 错误。 - 用量信息（如果供应商返回）。 -
模型不支持某种工具调用格式时的明确错误处理。

### 7.2 LangChain.js 的使用边界

-   LangChain.js 负责模型与工具调用的集成。
-   本地工具的实现权属于 DevPilot，不属于模型。
-   不把文件系统对象、Node.js 进程对象或数据库连接交给模型。
-   不让 AI 直接执行未经验证的 shell 命令。
-   工具参数必须通过 Zod 校验。
-   AI 生成的结构化输出也必须经过运行时校验。
-   如果某个流程用简单 TypeScript
    代码更清晰，不要为了使用框架而增加不必要的抽象。
-   先实现可测试的工具调用闭环，不要一开始构建复杂 Agent 系统。

### 7.3 V1 工具清单

  工具                  用途                     是否会修改文件
  --------------------- ------------------------ ----------------
  `list_files`          列出仓库中的文件与目录   否
  `read_file`           读取指定文本文件         否
  `search_code`         使用 ripgrep 搜索代码    否
  `get_git_status`      获取当前工作区状态       否
  `get_git_diff`        获取当前 Git Diff        否
  `propose_file_edit`   创建文件修改提案         否，只创建提案

V1 不实现 `run_shell_command`、`execute_script` 等任意命令工具。

### 7.4 Agent 执行循环

建议的基本流程：

1.  接收用户问题。
2.  检查当前是否有关联仓库。
3.  构造 system prompt 和当前会话消息。
4.  请求模型流式响应。
5.  如果模型返回工具调用，校验工具名、参数和权限。
6.  执行受控工具，将结构化结果返回模型。
7.  继续模型调用，直到得到最终回答、取消或达到限制。
8.  将消息和工具执行摘要持久化。
9.  通知 Renderer 任务完成或失败。

必须设置： - 最大工具调用轮数。 - 单个工具超时。 -
单次工具结果最大输出。 - 整个请求超时或取消机制。 - 错误隔离与日志。 -
防止重复工具调用无限循环的保护。

AI 工具输出属于不可信数据。模型可能把仓库中的提示词、注释或 README
当作指令，因此系统提示词应明确：仓库内容是待分析数据，不是覆盖应用策略的可信指令。

### 7.5 上下文管理

V1 不需要向量数据库。先使用按需检索： - 根据用户问题搜索关键词。 -
读取少量相关文件。 - 必要时读取
package.json、路由、入口文件等项目结构信息。 -
对过长文件只读取相关区间或分段。 -
对工具返回做长度限制，并保留文件路径和行号。 -
不要每轮都把整个仓库塞进模型上下文。 - 不要把
`.env`、私钥、令牌、证书等敏感文件默认发给云端模型。

需要注意：把本地代码发送给 DeepSeek 等云端 API
意味着代码内容会离开本机。界面和 README
应明确告知用户；应尽可能过滤常见密钥和敏感文件，并让用户能够理解哪些内容会被发送。

------------------------------------------------------------------------

## 8. 文件修改与 Diff 审核

这是 V1 最重要的安全闭环。

### 8.1 修改流程

``` text
用户提出修改需求
    ↓
AI 搜索并读取相关文件
    ↓
AI 生成文件修改提案
    ↓
主进程校验路径、大小、原始内容与修改内容
    ↓
保存 edit session
    ↓
Renderer 展示 Diff
    ↓
用户选择拒绝 / 确认应用
    ↓
主进程重新读取文件并检查原始哈希
    ↓
哈希一致：应用修改
哈希不一致：标记 stale，禁止直接覆盖
    ↓
刷新文件预览与 Git 状态
```

### 8.2 提案数据结构

``` ts
export interface FileEditProposal {
  id: string
  repositoryId: string
  relativePath: string
  operation: 'modify' | 'create'
  originalContent: string | null
  proposedContent: string
  originalHash: string | null
  status:
    | 'proposed'
    | 'approved'
    | 'applied'
    | 'rejected'
    | 'stale'
    | 'failed'
  createdAt: string
}
```

说明： - 修改现有文件时，`originalContent` 和 `originalHash`
必须存在。 - 新建文件时，确认目标文件当前不存在。 - V1 不支持 AI
直接删除文件；若将来支持，必须单独设计确认流程。 -
对同一个文件存在多个未处理提案时，应提示冲突，避免提案互相覆盖。 -
不把模型生成的 Diff
字符串直接当作可信补丁执行；应以经过校验的原始内容和目标内容为准。 -
用户确认后，仍须重新校验路径、文件状态和哈希。

### 8.3 多文件修改

V1
可以允许一次任务产生多个文件提案，但界面必须逐文件展示状态。建议先实现单文件完整闭环，再扩展多文件。

如果多文件应用不是原子操作，某个文件写入失败时必须向用户展示哪些文件已成功、哪些失败，不能宣称整个操作全部成功。后续可增加备份和回滚能力。

### 8.4 审核入口与变更导航

- 对话页待审核提示条展示待审核文件数与填充主按钮“去审核”。点击后通过 `workspace.showDiffPanel('proposals')` 强制切换到“AI 建议”标签：面板标签模式保存在 workspace store 中，`null` 表示按当前仓库的待审核数量自动选择。
- AI 建议按 `visibleSessions`（当前仓库过滤）展平为有序文件序列。详情头显示 `x / N` 与上一个/下一个文件按钮（首尾禁用，不环绕），`Alt+Shift+↑/↓` 提供同样能力；应用或拒绝成功后自动选中相邻文件（优先下一个，否则上一个）。
- 当前文件内使用 Monaco Diff Editor 的 `getLineChanges()` 统计差异处数，`goToDiff('previous' | 'next')` 在差异间跳转（Monaco 语义为首尾环绕），打开建议时调用 `revealFirstDiff()` 定位首处差异；`Alt+↑/↓` 提供同样能力。
- 快捷键在输入框、可编辑区域与 Monaco 编辑器内部不生效，避免与编辑器自身的快捷键冲突。

------------------------------------------------------------------------

## 9. IPC 与安全边界

### 9.1 Electron 安全配置

BrowserWindow 至少应启用：

``` ts
webPreferences: {
  preload: preloadPath,
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true
}
```

实际配置需结合 electron-vite 的 Preload 构建方式验证。不得为了绕过 IPC
问题而开启 `nodeIntegration` 或向 Renderer 暴露完整 Node.js 能力。

### 9.2 API 设计原则

Preload 仅暴露具名、受限的方法，例如：

``` ts
interface DevPilotApi {
  repository: {
    select(): Promise<RepositorySummary | null>
    list(): Promise<RepositorySummary[]>
  }
  file: {
    read(repositoryId: string, relativePath: string): Promise<FileContent>
  }
  git: {
    status(repositoryId: string): Promise<GitStatus>
    diff(repositoryId: string, relativePath: string): Promise<GitDiff>
    listBranches(repositoryId: string): Promise<GitBranchList>
    stage(repositoryId: string, input: GitPathsInput): Promise<void>
    unstage(repositoryId: string, input: GitPathsInput): Promise<void>
    commit(repositoryId: string, message: string): Promise<GitCommitResult>
    createBranch(repositoryId: string, branchName: string, checkout: boolean): Promise<void>
    switchBranch(repositoryId: string, branchName: string): Promise<void>
    log(repositoryId: string, options?: { limit?: number; skip?: number }): Promise<GitLogResult>
    commitDetail(repositoryId: string, sha: string): Promise<GitCommitDetail>
    remoteStatus(repositoryId: string): Promise<GitRemoteStatus>
    fetch(repositoryId: string): Promise<void>
    pull(repositoryId: string): Promise<void>
    push(repositoryId: string): Promise<void>
  }
  ai: {
    sendMessage(input: SendMessageInput): Promise<void>
    cancel(requestId: string): Promise<void>
    onEvent(callback: (event: ChatEvent) => void): () => void
  }
}
```

以上是接口方向示例，具体方法需结合事件流和错误处理实现。

模型档案相关方法（`window.devPilot.settings`）：

``` ts
getAiConfigStatus(): Promise<IpcResult<AiConfigStatus>>
testConnection(): Promise<IpcResult<AiConnectionTestResult>>
saveModelProfile(input: ModelProfileInput): Promise<IpcResult<AiConfigStatus>>
deleteModelProfile(profileId: string): Promise<IpcResult<AiConfigStatus>>
activateModelProfile(profileId: string): Promise<IpcResult<AiConfigStatus>>
testModelProfile(input: TestModelProfileInput): Promise<IpcResult<AiConnectionTestResult>>
```

对应 IPC channel：`settings:save-model-profile`、`settings:delete-model-profile`、
`settings:set-active-model-profile`、`settings:test-model-profile`，均沿用
`{ ok, data } | { ok, error }` 封装。所有结果只包含 `hasApiKey`，不返回 Key 或密文。

安全要求： - 不暴露 `invoke(channel, ...args)` 这种任意 channel API。 -
Main 对每个 IPC 入参执行 Zod 校验。 - 对仓库 ID 进行查表，不能信任
Renderer 传来的绝对路径。 - 文件操作使用仓库 ID + 相对路径，再由 Main
解析并校验。 - 对发送给 Renderer 的错误进行脱敏，不返回 API
Key、绝对敏感路径或完整环境变量。 -
监听器必须提供取消订阅函数，避免页面反复挂载导致重复监听。 -
长任务必须支持取消或在明确限制下运行。

### 9.3 路径安全

必须防御： - `../` 路径穿越。 - Windows 盘符和路径分隔符差异。 -
大小写路径比较差异。 - 符号链接指向仓库外部。 -
不存在的父目录与新建文件路径。 - 模型输出绝对路径。 -
同名文件或路径规范化造成的绕过。

不要只通过字符串前缀判断路径是否在仓库中。例如 `C:\\repo2`
可能会错误匹配 `C:\\repo`
的前缀。应先规范化路径，再使用路径关系判断，并在写入前进一步检查目标。

------------------------------------------------------------------------

## 10. SQLite 数据设计

### 10.1 基础表

建议至少包含：

**repositories** - `id` - `name` - `path` - `created_at` - `updated_at`

**conversations** - `id` - `repository_id`，可为空 - `title` -
`created_at` - `updated_at`

**messages** - `id` - `conversation_id` - `role` - `content` -
`created_at`

**edit_sessions** - `id` - `conversation_id` - `repository_id` -
`status` - `created_at` - `updated_at`

**file_edits** - `id` - `edit_session_id` - `relative_path` -
`operation` - `original_content` - `proposed_content` -
`original_hash` - `status` - `created_at` - `updated_at`

### 10.2 数据层要求

-   使用参数化 SQL，禁止拼接用户输入构造 SQL。
-   使用数据库迁移维护 schema 变化。
-   为常用外键和查询字段建立必要索引。
-   对多步数据库写操作使用事务。
-   统一时间格式，建议 ISO 8601 字符串或整数时间戳，项目内保持一致。
-   不把当前 UI 展开状态等临时状态全部写进数据库。
-   Pinia 保存当前界面状态；SQLite 保存需要跨启动保留的数据。
-   应用关闭时正确释放数据库连接。
-   在 Windows
    打包产物中验证数据库目录权限、初始化、升级和原生模块加载。

### 10.3 数据目录

数据库和用户设置应写入 Electron
提供的应用用户数据目录，不要写到安装目录或仓库目录。提供清晰的数据目录说明，并避免将
API Key 和敏感代码内容写入普通日志。

------------------------------------------------------------------------

## 11. 前端状态管理与组件设计

### 11.1 Pinia 职责

`repository` store： - 当前仓库摘要。 - 已登记仓库列表。 -
文件树和加载状态。 - Git 状态摘要。

`chat` store： - 当前会话。 - 消息列表。 - 生成状态。 - 当前 request
ID。 - 工具事件和错误状态。

`workspace` store： - 当前打开的文件。 - 标签页。 - 右侧面板和 Diff
面板展开状态。 - 当前选中的编辑提案。

`git` store： - 分支列表与当前分支。 - 提交历史与分页状态。 - 选中的
commit detail。 - 远程状态（upstream、ahead/behind）与写操作 busy 状态。 -
以当前仓库 ID 作为请求令牌丢弃过期响应；每次写成功后刷新 status、分支、历史与远程状态。

不要把完整数据库访问逻辑放进 Store。Store 通过 `desktop-api.ts` 调用
Preload API，再更新 UI 状态。

### 11.2 组件原则

-   页面组件负责组合，不承载全部业务细节。
-   复杂的文件树、消息列表、Diff 面板应拆成可测试组件。
-   对外组件 Props、Emits 应有明确 TypeScript 类型。
-   避免用全局事件总线传递核心业务数据。
-   异步加载要有 loading、empty、error 状态。
-   对长文件树和大量搜索结果进行分页、限制或虚拟化，不一次性渲染无限节点。
-   Monaco Editor 需要在组件卸载时释放编辑器实例和监听器。
-   不要为了模仿 IDE 而一次性实现复杂的多窗口、插件系统或完整终端。

------------------------------------------------------------------------

## 12. 流式事件协议

Renderer 与 Main 之间使用统一事件结构，不把 LangChain 或 DeepSeek
的原始事件直接暴露给 UI。

``` ts
export type ChatEvent =
  | { type: 'started'; requestId: string }
  | { type: 'text_delta'; requestId: string; text: string }
  | { type: 'tool_started'; requestId: string; toolCallId: string; name: string }
  | { type: 'tool_finished'; requestId: string; toolCallId: string; summary: string }
  | { type: 'edit_proposed'; requestId: string; editSessionId: string }
  | { type: 'completed'; requestId: string }
  | { type: 'cancelled'; requestId: string }
  | { type: 'error'; requestId: string; code: string; message: string }
```

要求： - 每个请求有唯一 `requestId`。 - Renderer
只能将事件应用到对应请求。 -
取消后忽略迟到的文本事件或按统一规则收尾。 -
工具执行事件应展示工具名称和简短结果，不应直接暴露内部堆栈。 -
错误事件要有稳定错误码，方便 UI 映射用户可理解的提示。 -
完成、取消和失败都必须结束 loading 状态。

------------------------------------------------------------------------

## 13. 配置、密钥与隐私

-   提供 `.env.example`，但不得提交真实 API Key。
-   不把 API Key 编译进 Renderer。
-   不将密钥打印到日志。
-   应用内模型档案的 Key 使用 Electron `safeStorage`（Windows DPAPI）加密后写入 SQLite；明文只在主进程内存中使用，解密失败返回配置错误。
-   `safeStorage` 不可用时拒绝保存带 Key 的档案；无 Key 的 OpenAI 兼容档案（如 Ollama）仍可保存。
-   IPC / Renderer 只看到 `hasApiKey`；更新档案时 Key 留空表示保留旧密文。
-   草稿连接测试的 Key 只随单次 IPC 传输，不落库。
-   `.env` 仅在没有档案或数据库不可用时兜底，属于明文本地文件，界面与 README 明确说明其安全边界。
-   用户输入和模型输出都不能直接作为命令执行。
-   在界面说明：为了回答代码问题，相关文件内容或搜索片段可能会发送到所配置的云端模型。
-   默认忽略 `.env`、私钥、证书、凭据文件及常见敏感配置。
-   对敏感内容做尽可能可靠的过滤，但不能承诺所有秘密都能被自动识别。
-   日志只记录必要的状态、耗时、错误码和脱敏摘要。
-   README 应包含 API Key 配置、安全边界和数据存储位置说明。

------------------------------------------------------------------------

## 14. 错误处理与可观测性

统一处理以下类别： - `VALIDATION_ERROR`：入参不合法。 -
`REPOSITORY_NOT_FOUND`：仓库不存在或未登记。 -
`PATH_NOT_ALLOWED`：路径不在授权范围。 -
`FILE_TOO_LARGE`：文件超过读取上限。 -
`FILE_CHANGED`：文件在提案后被外部修改。 -
`MODEL_CONFIG_ERROR`：模型配置缺失或 Key 无法解密。 -
`MODEL_PROFILE_NOT_FOUND`：模型档案不存在。 -
`SECRET_STORAGE_UNAVAILABLE`：系统凭据加密不可用，无法安全保存 Key。 -
`MODEL_REQUEST_FAILED`：模型调用失败。 -
`TOOL_EXECUTION_FAILED`：工具执行失败。 -
`REQUEST_CANCELLED`：用户取消。 - `DATABASE_ERROR`：数据库操作失败。 -
`INTERNAL_ERROR`：未预期异常。

Git 错误码（固定中文消息，不返回 stderr 原文）：`NOT_A_GIT_REPOSITORY`、
`GIT_NOT_AVAILABLE`、`GIT_TIMEOUT`、`GIT_OUTPUT_TOO_LARGE`、`GIT_INDEX_LOCKED`、
`GIT_NOTHING_TO_COMMIT`、`GIT_IDENTITY_MISSING`、`GIT_BRANCH_EXISTS`、
`GIT_BRANCH_NOT_FOUND`、`GIT_BRANCH_IN_USE`、`GIT_WORKTREE_DIRTY`、`GIT_CONFLICT`、
`GIT_NON_FAST_FORWARD`、`GIT_AUTH_REQUIRED`、`GIT_NETWORK_ERROR`、`GIT_NO_REMOTE`、
`GIT_NO_UPSTREAM`、`GIT_REMOTE_REJECTED`、`GIT_HOOK_FAILED`、
`GIT_COMMIT_NOT_FOUND`、`GIT_COMMAND_FAILED`。

要求： - 用户界面展示可操作的错误说明。 -
开发日志保留必要上下文，但不得泄露 API Key。 -
对网络错误、限流、超时提供适当提示。 - 不允许 catch 后静默吞掉异常。 -
对可恢复错误提供重试入口。 -
日志不能无限增长；后续实现日志轮转或合理的容量限制。

------------------------------------------------------------------------

## 15. 测试策略

### 15.1 单元测试

优先覆盖： - 路径规范化和路径穿越防护。 - 文件读取限制。 -
代码搜索参数构造。 - Git 输出解析（status、branch、log、commit detail、remote）。 -
Git 写命令参数与输入校验（分支名、pathspec、提交信息、SHA）。 -
Git 错误分类与固定消息。 - Diff 提案状态流转。 -
原始哈希一致性检查。 - Zod 输入校验。 - Agent 最大轮数和工具错误处理。 -
SQLite Repository 层的 CRUD 与事务。 - 模型档案 CRUD、单 active、密钥加解密与 `.env` 兜底。 -
Base URL 协议规则、OpenAI 兼容适配器与工具开关。

### 15.2 集成测试

至少验证： - Main IPC Handler 到 Service 的主要调用链。 - 临时 Git
仓库的 status/diff、暂存/取消暂存、提交、历史与单次提交详情、分支新建/切换，以及本地 bare remote 的 fetch/快进 pull/push。 - 文件修改提案从生成、审核到应用的闭环。 -
数据库初始化与迁移。 - 模型调用可通过 Mock Adapter
测试，不要求每次自动化测试都访问真实 DeepSeek API。

### 15.3 手工验收

-   无模型档案且无 API Key 时能启动并提示配置问题。
-   新增模型档案后聊天可用；重启应用后档案与 active 保留。
-   切换 active 模型后对话与工具调用正常；关闭工具开关后助手声明未读取文件。
-   删除全部档案后 `.env` 配置仍可对话。
-   SQLite 中 `api_key_cipher` 为密文，Renderer 与 IPC 返回中不含 Key。
-   错误 API Key 能显示可理解错误。
-   用户取消请求后 loading 正常结束。
-   选择非 Git 文件夹时有合理提示或降级行为。
-   选择包含中文路径的仓库能正常读取。
-   外部修改文件后应用旧提案会被拦截。
-   AI 提案未确认前，磁盘文件不发生变化。
-   确认后只修改授权仓库内的目标文件。
-   Windows 安装包在没有开发环境的情况下能启动。
-   打包环境中 better-sqlite3 能正常加载。

------------------------------------------------------------------------

## 16. 开发阶段与完成标准

### 阶段 1：工程骨架

实现： - electron-vite 项目。 - Vue 3 + TypeScript。 - Main / Preload /
Renderer 分层。 - 安全 BrowserWindow 配置。 -
ESLint、Prettier、Vitest。 - Windows 本地开发启动。

完成标准： - 应用可启动。 - Renderer 无 Node.js 直接访问能力。 - Preload
只暴露最小化 API。 - 至少有一个 IPC 调用和对应测试。

### 阶段 2：基础 UI

实现： - 全局导航。 - Chat、Workspace、Settings 页面。 - Element Plus
基础控件和自定义主题。 - Pinia Store。 - 空状态、加载状态和错误状态。

完成标准： - 页面结构稳定，路由可切换。 - 不把业务逻辑堆在 `App.vue`。 -
UI 与主进程能力通过类型化 API 交互。

### 阶段 3：本地仓库与代码浏览

实现： - 选择仓库。 - 仓库列表持久化。 - 文件树。 - 文件读取与 Monaco
展示。 - Git status/diff。

完成标准： - 能选择真实本地仓库并浏览代码。 - 越权路径测试通过。 -
大文件和二进制文件有明确处理。

### 阶段 4：AI 对话

实现： - DeepSeek 配置。 - 模型适配层。 - 流式聊天。 - 停止生成。 -
会话与消息持久化。 - 错误处理。

完成标准： - 可完成真实 API 对话。 - 流式事件正常结束。 -
取消、超时和异常路径可用。 - API Key 不进入 Renderer。

### 阶段 5：代码理解工具

实现： - Tool Registry。 - `list_files`、`read_file`、`search_code`。 -
Git 只读工具。 - Agent 执行循环。 - 上下文和工具输出限制。

完成标准： - AI 能基于真实文件内容回答代码问题。 - 工具参数经校验。 -
工具循环存在轮数限制。 - 不支持任意命令执行。

### 阶段 6：Diff 修改闭环

实现： - `propose_file_edit`。 - 编辑会话持久化。 - Monaco Diff
Editor。 - 拒绝和确认操作。 - 写入前路径与哈希检查。 -
应用后刷新编辑器和 Git 状态。

完成标准： - 未确认不修改磁盘。 - 确认后只修改指定文件。 -
外部文件变化会阻止旧提案覆盖。 - 成功和失败状态可被清楚识别。

### 阶段 7：稳定性与交付

实现： - 补充单元与集成测试。 - Windows 打包。 - 原生模块重建验证。 -
README、安装和配置说明。 - 安全与隐私说明。

完成标准： - 可在目标 Windows 环境安装启动。 -
核心验收流程可完整演示。 - 已知限制、配置方法和数据目录文档齐全。

### 阶段 8：源代码管理（用户发起的 Git 写操作）

实现： - 独立源代码管理页与导航。 - 暂存/取消暂存（单个与全部）。 - 提交与提交历史、单次提交 Diff。 - 本地分支列表、新建与切换。 - 远程 fetch、快进 pull、push。 - 写操作确认、固定命令白名单、错误分类与状态刷新联动。

完成标准： - 用户可在应用内完成暂存、提交、查看历史、新建/切换分支与远程同步。 - 破坏性命令（force/reset/clean/amend/rebase/stash/删除分支）不可达。 - 路径、分支名、提交信息与 SHA 经双重校验；错误不泄漏 stderr。 - AI 工具保持只读，不能触发任何 Git 写操作。 - 需要 Git ≥ 2.23（`git switch`）。

------------------------------------------------------------------------

## 17. AI 编码助手执行规范

本节是对 Claude Code、Cursor 等 AI 编码工具的强制指导。

### 17.1 开始任务前

1.  先阅读本文件和 `README.md`。
2.  检查当前项目已有代码、依赖和目录，不要假设仓库为空。
3.  确认当前处于哪个开发阶段。
4.  明确本次任务的目标、涉及文件、验收标准和风险。
5.  如需求与本文件冲突，先指出冲突并提出方案，不要自行改变核心架构。

### 17.2 实施任务时

-   一次完成一个可验证的小目标。
-   先设计接口与数据结构，再实现调用链。
-   复用已有实现，不重复创建同类工具或 Service。
-   新增依赖前解释必要性。
-   遵循 TypeScript 严格类型检查，避免随意使用 `any`。
-   不用大量类型断言掩盖类型问题。
-   不把 API Key、令牌、真实用户数据写入代码或测试快照。
-   不用 `eval`、任意 shell 执行或暴露 Node.js 给 Renderer 来绕过设计。
-   不允许 AI 直接写入文件；只能生成提案，再由用户确认。
-   不用假数据冒充真实 AI、Git 或文件操作结果。
-   不吞掉异常，不随意添加空 catch。
-   不为了通过测试而删除或弱化测试。
-   修改完成后检查相关调用方、类型和边界条件。
-   未经明确要求，不做大范围重命名、格式化或无关重构。

### 17.3 每次任务完成后

AI 必须汇报： 1. 完成了什么。 2. 修改了哪些文件。 3.
关键设计决策及原因。 4. 运行了哪些测试和检查。 5.
测试结果；没有运行时说明原因。 6. 已知问题、限制或下一步。 7.
是否改变了依赖、数据库结构或公共接口。

不能声称执行了实际上没有执行的命令、测试或构建。

### 17.4 代码质量要求

-   TypeScript 开启严格模式。
-   公共接口具有明确类型。
-   业务逻辑尽量纯函数化，便于测试。
-   路径、文件、模型返回和 IPC 输入都视为不可信数据。
-   复杂逻辑写必要注释，避免给显而易见的代码写冗余注释。
-   命名优先表达业务意图。
-   统一使用项目已有的命名风格。
-   对异步任务处理取消、异常和资源释放。
-   UI 必须覆盖 loading、empty、error、success 状态。
-   代码改动应与当前阶段的验收标准一致。

### 17.5 禁止事项

AI 编码助手不得擅自： - 更改 Electron 安全配置以放开 Node.js 权限。 -
添加自动执行任意 shell 命令的 Agent 工具。 - 绕过 Diff
确认直接写入文件。 - 在 Renderer 中访问数据库或文件系统。 - 将真实 API
Key 提交到仓库。 - 引入向量数据库、多 Agent 或独立后端服务扩大 V1
范围。 - 删除用户已有文件、修改用户仓库业务代码或运行破坏性 Git 命令。 -
在没有解释的情况下修改数据表、IPC 契约或模型适配接口。

------------------------------------------------------------------------

## 18. 建议补充的项目文档

主技术文档之外，建议在开发过程中维护：

-   `README.md`：项目用途、环境要求、安装启动、API Key 配置、打包方法。
-   `docs/DEVELOPMENT_PLAN.md`：阶段拆解、任务清单和验收状态。
-   `docs/SECURITY.md`：文件路径安全、API Key、云端数据发送、AI
    修改确认策略。
-   `docs/ARCHITECTURE_DECISIONS.md`：记录重大技术决策及理由。
-   `CHANGELOG.md`：记录用户可感知的功能变化。

不要一开始写大量空泛文档。每份文档都应服务于开发、验收或后续维护。

------------------------------------------------------------------------

## 19. V1 最终验收清单

-   [ ] Windows 上可以启动 DevPilot。
-   [ ] 用户可以配置 DeepSeek API Key。
-   [ ] 用户可以选择和切换本地 Git 仓库。
-   [ ] 用户可以浏览文件树并查看代码。
-   [ ] 用户可以发起流式 AI 对话。
-   [ ] AI 可以调用受控工具搜索和读取代码。
-   [ ] AI 的回答能引用实际文件路径或代码片段作为依据。
-   [ ] AI 可以提出文件修改提案。
-   [ ] 修改前后 Diff 清楚可见。
-   [ ] 用户拒绝后磁盘文件保持不变。
-   [ ] 用户确认后目标文件被正确修改。
-   [ ] 文件被外部修改时旧提案不能覆盖它。
-   [ ] 修改后 Git 状态正确刷新。
-   [ ] 用户可以在源代码管理页暂存/取消暂存并提交。
-   [ ] 用户可以查看提交历史与单次提交 Diff，并新建/切换本地分支。
-   [ ] 用户可以对已配置的远端执行 fetch、快进 pull 与 push；非快进推送被拒绝。
-   [ ] AI 工具无法执行任何 Git 写操作。
-   [ ] 对话、仓库和编辑会话能够持久化。
-   [ ] 路径穿越、超大文件、API 错误和取消请求有明确处理。
-   [ ] 原生 SQLite 模块在 Windows 安装包中正常工作。
-   [ ] README 和安全说明完整。

------------------------------------------------------------------------

## 20. 给 AI 编码助手的首条任务指令

将本文件放在项目根目录的 `docs/TECHNICAL_DESIGN.md`，然后在 AI
编码工具中使用以下指令：

> 请先完整阅读 `docs/TECHNICAL_DESIGN.md`，将其视为本项目 V1
> 的架构与编码约束。先检查当前仓库状态、现有文件、依赖和运行脚本，再给出当前开发阶段的实施计划。不要一次性生成整个项目，也不要在未确认前执行破坏性操作。
>
> 从"阶段
> 1：工程骨架"开始。先列出准备新增或修改的文件及用途，再按小步骤实施。每个步骤完成后运行适当的类型检查、测试或构建，并如实汇报结果。严格遵守
> Electron Main / Preload / Renderer 的安全边界；不把 Node.js 能力暴露给
> Renderer；不添加任意命令执行工具；AI 修改文件必须经过 Diff
> 展示和用户明确确认。若技术文档与实际依赖版本存在冲突，先解释并提出最小改动方案，不要自行扩大
> V1 范围。
