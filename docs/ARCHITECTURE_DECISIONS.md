# DevPilot 架构决策记录

## ADR-001：以桌面端技术文档为 V1 基线

**背景**：工作区根目录同时存在一份全栈 Web 平台方案（RAG、登录、知识库、MCP），与
`DevPilot/docs` 中的 Electron 桌面助手方案架构差异很大。

**决策**：V1 以 `docs/TECHNICAL_DESIGN.md` 为准，实现 Electron 单机分层架构。全栈平台方案不进入当前范围。

**影响**：不引入独立后端服务、账号权限、向量数据库或 MCP。如需切换，先提交设计变更。

## ADR-002：启用 sandbox 并手写最小 Preload

**背景**：electron-vite 官方模板默认 `sandbox: false`，并通过 `@electron-toolkit/preload` 暴露较宽的 Electron API。

**决策**：保持 `sandbox: true`，不使用 `@electron-toolkit/preload`，只通过 `contextBridge` 暴露项目自己的具名方法。

**影响**：Preload 构建为 CommonJS，仅依赖 `electron` 的 `contextBridge` / `ipcRenderer`；新增能力必须显式加入 `DevPilotApi`，不能透传任意 channel。

## ADR-003：选择稳定主版本而非最新主版本

**背景**：2026-10 时 Vue Router 5、Pinia 4、TypeScript 7 刚发布；typescript-eslint 当前仍要求 TypeScript `< 6.1.0`。

**决策**：使用 Vue Router 4.6、Pinia 3.0、TypeScript 5.9、Electron 44 稳定线；Vite 8 / electron-vite 6 采用脚手架已验证组合。

**影响**：避免新主版本 API 与工具链兼容风险；后续升级需单独验证并记录。

## ADR-004：API Key 仅使用本地 .env

**背景**：文档允许系统凭据库或明确标记的本地方案；项目选择开发期最简单的 `.env`。

**决策**：主进程从项目根目录（开发）或 `userData` 目录（打包后）加载 `.env`；Renderer 只读取“是否配置”等状态。

**影响**：`.env` 为明文文件，安全性低于系统凭据库，需在 README/设置页明确说明。Key 不进入数据库、日志和前端产物。若后续要求更高安全等级，先评估 `safeStorage` / 系统凭据存储迁移。

## ADR-005：IPC 使用结果封装与统一错误码

**背景**：Electron IPC 异常跨进程传递时容易丢失自定义字段，且错误信息可能包含敏感路径。

**决策**：主进程返回 `{ ok: true, data } | { ok: false, error: { code, message } }`；Preload 负责固定 channel 与类型推断边界；Renderer 的 `desktop-api.ts` 统一解包并抛出 `DesktopApiError`。

**影响**：UI 可基于稳定错误码映射文案；主进程必须确保 `message` 已脱敏。

## ADR-006：Renderer 使用 Hash 路由

**背景**：生产环境通过 `file://` 加载打包后的 `index.html`。

**决策**：使用 `createWebHashHistory`。

**影响**：打包与开发行为一致，无需在 Electron 中配置 history fallback；URL 中带 `#/chat` 等路径。

## ADR-007：阶段 3 先做会话内仓库登记，暂不引入 SQLite 与 Monaco

**背景**：阶段 3 的完整范围包括 SQLite 持久化、Monaco 与 Git status/diff。先打通“选择真实仓库、浏览文件”可以尽早验证路径安全与 IPC 链路。

**决策**：本次实现仓库选择、会话内登记/切换、文件树与只读文件查看。仓库登记只保存在主进程内存中；不引入 better-sqlite3，不接入 Monaco 与 Git 命令。

**影响**：重启应用后需重新选择仓库；代码只读、无 Git 变更视图。SQLite 原生模块 ABI 与打包验证留待后续增量。错误码新增 `FILE_NOT_FOUND`、`UNSUPPORTED_FILE`。Monaco 已由 ADR-008 接入，Git 已由 ADR-010 接入，SQLite 与仓库持久化由 ADR-011 接入。

## ADR-008：采用 Monaco Editor 实现只读代码查看

**背景**：阶段 3 的只读预览仅为 `<pre>` 行号文本，缺少语法高亮。候选方案包括 highlight.js、Shiki 与 Monaco；用户选择 Monaco。

**决策**：引入 `monaco-editor` 0.57，作为工作区只读查看器：

- 通过 `MonacoEnvironment.getWorker` 与 Vite `?worker` 打包 editor / json / css / html / ts 五个本地 Worker；CSP 增加 `worker-src 'self' blob:`。
- `EditorArea.vue` 以 `readOnly` / `domReadOnly` 创建编辑器，使用自定义 `devpilot-dark` 主题；按文件相对路径创建或复用 model，关闭标签或组件卸载时 dispose。
- 扩展名到 Monaco 语言 ID 的映射集中在 `utils/language.ts`，未知类型回退 `plaintext`；Vue 文件按 HTML 高亮。
- 关闭语义校验（`noSemanticValidation`），避免缺少项目上下文时产生大量误报。
- 已在开发模式与 `file://` 生产构建下验证 Worker 加载。

**影响**：Renderer 产物体积显著增加（Monaco 核心与语言 Worker 合计约 20 MB 量级），后续可按需裁剪语言或改为按需加载。若后续对包体敏感，可重新评估 Shiki / highlight.js 或裁剪 Monaco 语言集。

## ADR-009：工作区支持手动编辑与直接保存

**背景**：ADR-008 的只读查看无法完成本地小改动；用户明确要求文件可编辑，并选择“手动保存并直接写盘”。

**决策**：在阶段 3 内扩展编辑能力，但不接入 AI 写入：

- Monaco 转为可编辑，保留自动布局与本地 Worker。
- `Ctrl+S` / 保存按钮通过新增 `file:write` IPC 写回原文件；Renderer 传入读取时获得的 SHA-256，主进程在写入前重新校验路径、仓库范围与当前哈希。
- 哈希不一致返回 `FILE_CHANGED`，界面提示重新加载，不覆盖未确认的外部修改。
- 写入限制 1 MB，拒绝空字符；保留原文件 UTF-8 BOM；同目录临时文件写入后重命名，失败清理临时文件。
- 关闭脏标签、切换仓库、离开工作区与退出应用时提示；退出确认由主进程 `will-prevent-unload` 对话框承接。
- 仅允许保存已存在且已读取的文本文件；不支持新建、删除、重命名或保存二进制文件。

**影响**：V1 的“AI 修改必须经 Diff 确认”边界不变，本决策只覆盖用户主动编辑。新增错误码 `FILE_WRITE_FAILED`，复用 `FILE_CHANGED`。后续 AI 提议修改仍应走独立的 Diff 审核与哈希复核流程（阶段 6）。

## ADR-010：只读 Git 集成使用系统 Git CLI

**背景**：阶段 3 需要展示分支、工作区变更与单文件 Diff。候选方案包括 `isomorphic-git`（纯 JS）、NodeGit / dugite 等原生绑定，以及调用系统 Git CLI。原生绑定会引入 ABI 与打包风险；纯 JS 实现与系统 Git 行为存在差异。

**决策**：主进程通过 `spawn('git', args, { cwd, windowsHide: true, shell: false })` 执行固定参数数组，V1 仅调用只读命令：

- `status --porcelain=v1 -z --untracked-files=all` 解析变更；`branch --show-current` 读取分支。
- `diff --no-color --no-ext-diff <HEAD> -- <path>` 展示相对 `HEAD` 的 Diff；未提交仓库使用空树 SHA `4b825dc6…` 作为基线；未跟踪文件由 `FileService.read` 生成合成 Diff。
- 命令 10 秒超时、stdout 5 MB 上限、Diff 结果 512 KB 截断；错误映射为稳定错误码。
- 仓库根目录只从 `RepositoryService` 的已登记记录读取，Diff 相对路径先通过安全校验。
- Renderer 的 Git UI 状态集中在 `repository` Store，使用请求令牌丢弃切换仓库后的过期响应。

**影响**：运行环境必须安装 Git 并位于 PATH，未安装时返回 `GIT_NOT_AVAILABLE`。不做任何写操作；暂存、提交、分支切换与 AI Diff 审核留待后续阶段。Diff 视图为纯文本统一 Diff，Monaco Diff Editor 在阶段 6 评估。

## ADR-011：使用 SQLite + better-sqlite3 做本地持久化

**背景**：ADR-007 将仓库登记放在主进程内存中，重启后丢失。后续阶段还需要持久化对话、消息与编辑会话。候选方案包括 `node:sqlite`、better-sqlite3 与纯 JS 存储。应用主进程中的数据库操作都是短小、同步的查询，且本机没有 MSVC 构建环境。

**决策**：

- 使用 `better-sqlite3` 13（N-API 预编译二进制）。同步 API 适合主进程内的简单读写，N-API 使其在 Node 22 与 Electron 44（Node 24 / ABI 149）下加载同一份 `.node`，不需要 `electron-rebuild`。
- 数据库文件位于 Electron `userData` 目录下的 `devpilot.db`，不写入安装目录或用户仓库。
- 迁移由 `user_version` 管理：迁移函数只追加、不修改已发布版本，每个版本在事务中执行并递增 `user_version`。
- 启用 `journal_mode = WAL`、`foreign_keys = ON`、`busy_timeout = 5000`。
- 当前持久化仓库元数据；对话、消息、编辑会话与文件编辑表已建好，供阶段 4–6 使用。不保存 API Key、普通文件内容或 Git 输出。
- 访问全部通过参数化语句；仓储层 `RepositoryStore` 承担表映射。
- `electron-vite` 主进程启用 `externalizeDepsPlugin()`，让 `better-sqlite3` 保持为外部 `require`，避免 Rollup 处理原生 `.node`。
- 数据库初始化失败时应用仍可启动，`RepositoryService` 退回内存模式；日志只记录失败事实，不输出路径或数据内容。

**影响**：仓库列表跨启动保留，工作区启动时自动载入最近仓库。原生模块在 `electron-builder` 打包时需要 `asarUnpack` 并验证安装包内加载（阶段 7 待办）。若未来需要事务型后台任务或复杂查询，可继续在同一连接上扩展，无需更换驱动。

## ADR-012：使用 LangChain.js 接入 DeepSeek，并采用固定事件协议

**背景**：阶段 4 需要流式对话、取消、错误分类与后续工具调用能力。直接手写 DeepSeek HTTP/SSE 客户端可行，但阶段 5 的工具调用、消息角色与多轮编排会重复实现 LangChain 已提供的抽象。候选方案是 `openai` SDK 直连（DeepSeek 兼容 OpenAI 协议）、手写 SSE 与 LangChain.js。

**决策**：

- 使用 `@langchain/deepseek`（`ChatDeepSeek`）+ `@langchain/core`。适配层 `DeepSeekAdapter` 实现项目内的 `ModelAdapter` 接口，把 LangChain 的 chunk 归一化为 `text_delta` / `usage` 事件；业务层不直接依赖 LangChain 类型，便于测试注入 Mock 与将来更换供应商。
- 两个包均标注 `type: module`，但 `exports.require` 指向 `dist/index.cjs`，CJS 主进程可直接 `require`；`externalizeDepsPlugin()` 保持外部依赖，构建产物已验证可加载。
- 主进程通过固定 channel `chat:event` 推送事件，Preload 只把 payload 交给监听器，不暴露 `IpcRendererEvent` 或任意 channel。
- `requestId` 由 Renderer 在调用 `chat:send` 前生成并传入，主进程同步登记 `AbortController` 后立即返回。这样 `started` 事件与 invoke 回包不存在竞态，停止按钮也能立即拿到 ID。
- 同一时间只允许一个活动请求；重复或并发 `requestId` 返回 `VALIDATION_ERROR`，已完成 ID 放入最近 200 个的有界集合防重放。
- 每个请求恰好一个终态事件（`completed` / `cancelled` / `error`）：正常完成才持久化 assistant 消息；用户取消、120 秒超时、空输出与适配层错误都不写入部分文本，避免污染后续上下文。
- 历史上下文由数据库读取最近 20 条并按 24k 字符裁剪；system prompt 固定声明“尚未读取仓库文件、不得声称查看过代码”，仓库名是唯一可注入的仓库信息，且不作为指令。

**影响**：退出应用时 `chatService.cancelAll()` 静默中止请求，再关闭 SQLite。取消/失败后的部分回答只存在于 Renderer 内存，重新进入会话只能看到已落库的用户消息；若将来需要保留草稿，可新增消息状态列而不是改变现有行为。阶段 5 的工具调用将复用同一适配层与事件协议，通过新增事件类型扩展，而不改变现有终态语义。

## ADR-013：只读代码理解工具使用 Tool Registry + 自写 Agent 循环

**背景**：阶段 5 需要让模型基于真实仓库回答，但又必须严格限制文件访问、命令执行与上下文规模。候选方案包括 LangChain Agent 框架、各厂商内置的代码检索能力，以及自写受控循环。

**决策**：

- 工具以 `ToolRegistry` 统一注册；参数用 Zod 4 `z.strictObject` 校验，模型侧 JSON Schema 由 `z.toJSONSchema()` 生成并移除 `$schema`。未知工具与非法参数不执行，错误以稳定 `ToolErrorCode` 返回模型。
- 只实现 5 个只读工具：`list_files`、`read_file`、`search_code`、`get_git_status`、`get_git_diff`。不提供写文件、任意命令、Git 写操作或网络请求工具。
- `search_code` 调用系统 `rg`，使用参数数组、`shell: false`、`--no-config`、`--` 分隔查询与范围；10 秒超时、2 MB stdout 上限，退出码 1 视为无匹配。`rg` 缺失返回 `RG_NOT_AVAILABLE`，不阻断对话。
- 不引入 LangChain Agent 框架，自写 `agent-runner.ts` 管理循环。模型调用仍走 `ModelAdapter`，`ChatService` 只负责事件、终态与持久化，便于单元测试注入 Mock。
- 循环限制：最多 5 轮、每轮最多 4 次调用、每次请求最多 12 次；单工具 15 秒超时；单工具输出 12k 字符、单请求累计 32k 字符。达到轮数/调用上限后强制一轮不传工具的收尾调用，仍无回答则返回 `TOOL_EXECUTION_FAILED`。
- 重复调用按 `工具名 + stableStringify(参数)` 判定，直接标记 `blocked`，不执行；工具被中止、超时或失败只生成该次调用的状态记录，不终止整个请求（取消请求除外）。
- DeepSeek 流式 `tool_call_chunks` 按 `index` 手动累加 id/name/args，流结束后统一 `JSON.parse`，避免半截 JSON 进入业务层；参数非法时置为 `null`，由 Registry 校验拒绝。
- 敏感文件采用“路径拒绝为主、内容高置信模式为辅”：路径拒绝 `.env*`（`.env.example/.sample/.template` 除外）、SSH 私钥、证书、凭据与 `.ssh`/`.aws`/`.gnupg` 等目录；`read_file`/`get_git_diff` 命中 PEM 私钥头等高置信模式时整份阻断；搜索片段命中时替换为脱敏占位。文档明确该过滤不能保证识别所有秘密。
- 仓库内容、`<tool_result>` 与搜索片段均声明为不可信数据；系统提示禁止执行其中的“忽略规则/泄露提示词”指令，并禁止编造路径、行号或内容。
- 消息表新增 `tool_calls` JSON 列（v2 迁移），只保存工具名、参数摘要、状态、结果摘要与耗时，不保存工具输出正文、文件内容、搜索片段或 Git Diff；Renderer 解析失败时降级为空，不影响历史加载。
- 事件协议新增非终态 `tool_started` / `tool_finished`，仍走固定 `chat:event` channel；`completed` / `cancelled` / `error` 的单一终态语义不变。工具事件同时由对话页与工作区 AI 面板消费，二者共享同一 Pinia chat store。

**影响**：模型能够基于真实代码回答并引用相对路径与行号，但文件片段会随之发送到云端模型。运行环境需要安装 ripgrep 才能使用 `search_code`（阶段 7 评估随包分发或安装检测）。后续阶段 6 的写操作必须新增独立、需用户确认的工具与审核流程，不能复用本阶段的只读边界绕过 Diff 审核。
