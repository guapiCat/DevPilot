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

> 后续变更：ADR-016 引入应用内模型档案，Key 改用 `safeStorage` 加密入库；`.env` 降级为无档案或数据库不可用时的兜底。

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
- `search_code` 通过 `resolveRgCommand()` 解析 ripgrep：优先 `DEV_PILOT_RG_PATH` 覆盖，其次 `@vscode/ripgrep` 随包内置的 `rg`，最后回退系统 PATH；使用参数数组、`shell: false`、`--no-config`、`--` 分隔查询与范围；10 秒超时、2 MB stdout 上限，退出码 1 视为无匹配。全部不可用返回 `RG_NOT_AVAILABLE`，不阻断对话。
- 不引入 LangChain Agent 框架，自写 `agent-runner.ts` 管理循环。模型调用仍走 `ModelAdapter`，`ChatService` 只负责事件、终态与持久化，便于单元测试注入 Mock。
- 循环限制：最多 5 轮、每轮最多 4 次调用、每次请求最多 12 次；单工具 15 秒超时；单工具输出 12k 字符、单请求累计 32k 字符。达到轮数/调用上限后强制一轮不传工具的收尾调用，仍无回答则返回 `TOOL_EXECUTION_FAILED`。
- 重复调用按 `工具名 + stableStringify(参数)` 判定，直接标记 `blocked`，不执行；工具被中止、超时或失败只生成该次调用的状态记录，不终止整个请求（取消请求除外）。
- DeepSeek 流式 `tool_call_chunks` 按 `index` 手动累加 id/name/args，流结束后统一 `JSON.parse`，避免半截 JSON 进入业务层；参数非法时置为 `null`，由 Registry 校验拒绝。
- 敏感文件采用“路径拒绝为主、内容高置信模式为辅”：路径拒绝 `.env*`（`.env.example/.sample/.template` 除外）、SSH 私钥、证书、凭据与 `.ssh`/`.aws`/`.gnupg` 等目录；`read_file`/`get_git_diff` 命中 PEM 私钥头等高置信模式时整份阻断；搜索片段命中时替换为脱敏占位。文档明确该过滤不能保证识别所有秘密。
- 仓库内容、`<tool_result>` 与搜索片段均声明为不可信数据；系统提示禁止执行其中的“忽略规则/泄露提示词”指令，并禁止编造路径、行号或内容。
- 消息表新增 `tool_calls` JSON 列（v2 迁移），只保存工具名、参数摘要、状态、结果摘要与耗时，不保存工具输出正文、文件内容、搜索片段或 Git Diff；Renderer 解析失败时降级为空，不影响历史加载。
- 事件协议新增非终态 `tool_started` / `tool_finished`，仍走固定 `chat:event` channel；`completed` / `cancelled` / `error` 的单一终态语义不变。工具事件同时由对话页与工作区 AI 面板消费，二者共享同一 Pinia chat store。

**影响**：模型能够基于真实代码回答并引用相对路径与行号，但文件片段会随之发送到云端模型。`search_code` 默认使用随包内置 ripgrep，不依赖系统安装；安装包需将 `@vscode/ripgrep` 的二进制目录加入 asarUnpack（阶段 7 验证）。后续阶段 6 的写操作必须新增独立、需用户确认的工具与审核流程，不能复用本阶段的只读边界绕过 Diff 审核。

## ADR-014：AI 修改采用“精确替换提案 + 用户逐文件确认”

**背景**：阶段 6 需要让 AI 提议修改并应用到工作区，同时保证模型不能绕过用户直接写盘。候选方案包括让模型输出完整新文件内容、输出统一 Diff、输出结构化编辑指令（如 JSON Patch），或基于 `oldText/newText` 的精确替换。完整新文件容易让模型编造未读取的部分；统一 Diff 需要额外解析且对上下文行敏感；JSON Patch 对模型不友好。

**决策**：

- 新增第六个工具 `propose_file_edit`，支持 `modify` 与 `create` 两种操作，**不支持删除**。工具只创建待审核提案，不写盘；写入仍只发生在用户逐文件应用时。
- `modify` 使用精确替换：模型提供 `oldText`（必须与当前文件完全一致且在文件中唯一出现）与 `newText`；主进程读取文件、统计出现次数并派生完整建议内容。0 次或多次出现返回 `EDIT_CONFLICT`，要求模型先读取文件或提供更长片段。`create` 提供完整 `content`，目标已存在返回 `FILE_ALREADY_EXISTS`。
- 提案按“请求”分组：同一 `conversationId + runId` 的多个文件写入同一 `edit_sessions` 记录，单会话最多 20 个文件；同一文件在会话内只允许一条待审核建议，避免对同一基准内容叠加冲突修改。
- 提案持久化复用 v1 已创建的 `edit_sessions` / `file_edits` 表，不新增迁移；`original_content` 保存修改前内容，`proposed_content` 保存建议内容，`original_hash` 保存读取时的 SHA-256。`create` 的 `original_hash` 记为 `''`（空字符串）表示“目标必须不存在”，避免为此改表。
- 应用流程：`EditService.applyFile()` 重新按仓库 ID + 相对路径解析目标；`modify` 走 `FileService.write(..., originalHash)` 复核哈希，`create` 走 `FileService.writeNew()`（`wx` 临时文件 + 重命名）。`FILE_CHANGED` / `FILE_ALREADY_EXISTS` 将提案标记 `stale` 并返回可读错误；其他写入错误标记 `failed`。拒绝只把状态改为 `rejected`。
- 会话状态：仍有 `proposed` 或 `stale` 文件时为 `active`，全部处理完后自动 `completed`；只有 `active` 且存在待审核/过期文件的会话会在“AI 建议”面板中列出。
- 事件协议新增非终态 `edit_proposed`，携带 `editSessionId` / `fileEditId` / `relativePath` / `operation`；Renderer 收到后按当前会话重新加载待审核列表。`completed` / `cancelled` / `error` 的单一终态语义不变。
- 审核 UI 复用工作区 Diff 面板：新增“AI 建议 / Git 变更”标签，AI 建议使用 Monaco Diff Editor 只读并排展示，逐文件展示操作类型与状态。面板只显示当前仓库的提案，其他仓库的提案保留在数据库中。
- 敏感文件在工具层与服务层双重阻断；提案内容限制 1 MB、拒绝空字符；应用前若目标文件有未保存编辑，界面会明确提示将覆盖。

**影响**：AI 修改必须经过用户逐文件确认，模型无法通过工具直接写盘、删除文件或执行任意命令。提案内容会保存在本地 SQLite 中（仅被提议的文件，不含整仓），因此数据库不再只保存元数据；这些内容不上传到除模型请求以外的任何位置。多文件应用不是原子操作：每个文件独立应用并展示结果，部分失败时已成功的文件保持已应用状态，失败项标记 `stale`/`failed`，界面不会宣称整体成功。自动格式化、删除文件、批量应用与会话级撤销留待后续阶段评估。

## ADR-015：渲染层按需加载、语言裁剪与手动组件注册

**背景**：阶段 6 完成后，Renderer 产物中入口 `index` 为 1800.76 kB、`WorkspaceView` 为 2303.21 kB。Element Plus 通过 `app.use(ElementPlus)` 全量注册并引入 `dist/index.css`；Monaco 通过 `monaco-editor` 全量入口在进入工作区时同步加载，并一次性注册 84 种语言；highlight.js 使用 `lib/common` 打包约 35 种语言。上述依赖使首屏与工作区首开体积偏大。

**决策**：

- Monaco 使用自定义入口 `src/renderer/src/services/monaco.ts`：以 `monaco-editor/editor/editor.api` 为核心，复制 `esm/vs/editor/editor.main.js` 中除语言定义外的贡献注册（查找、折叠、Diff、悬浮、standalone 快捷命令等），只保留与 `utils/language.ts` 映射一致的 32 种语言定义。`json` 由 `languages/features/json` 提供，不单独注册定义。**升级 monaco-editor 时必须同步比对 `editor.main.js` 的贡献列表。**
- `electron.vite.config.ts` 为 codicon 的两个 CSS 增加精确别名：monaco-editor 的 exports 会把裸子路径补成 `esm/vs/*.js`，CSS 无法直接通过包名解析。
- Monaco 按需加载：`EditorArea` 在首次打开文件时才动态导入 Monaco 入口；AI 建议的 `ProposalDiffView` 通过 `defineAsyncComponent` + `<Suspense>` 在首次选中建议时加载。未打开文件或建议时不加载 Monaco。
- Element Plus 手动按需注册：`main.ts` 只注册实际使用的组件并引入对应 `style/css`，语言包移至 `App.vue` 的 `el-config-provider`；`ElMessage` / `ElMessageBox` 样式单独引入。新增组件时需同时补充组件注册与样式导入。
- highlight.js 从 `lib/common` 改为 `lib/core`，显式注册 28 种常用语言；未注册语言继续回退为转义纯文本。
- `tsconfig.web.json` 增加 Monaco 子路径类型映射，供 `typeof import('monaco-editor/editor/editor.api')` 与 Worker 导入使用。

**影响**：语言语法 chunk 由 84 个降至 32 个，入口 JS 由 1800.76 kB 降至 233.99 kB，`WorkspaceView` 由 2303.21 kB 降至 80.02 kB，入口 CSS 由约 377 kB 降至 98.46 kB。Monaco 核心（`editor.api` 约 5.05 MB 与 Monaco 入口 chunk 约 2.17 MB）仍会在首次打开文件时一次性加载，但不再阻塞工作区首屏；Diff 审核首次打开同样有短暂加载延迟，由 Suspense 骨架覆盖。冷门语言仅以纯文本显示。语言支持变更时需同步维护 `services/monaco.ts`、`utils/language.ts` 与 `utils/markdown.ts` 的注册列表。

## ADR-016：多提供商模型档案 + safeStorage 密钥存储 + 共用 OpenAI 兼容适配层

**背景**：V1 只支持 `.env` 配置的单一 DeepSeek 模型，切换模型需要改文件并重启。用户要求在不改文件、不重启的前提下配置多个大模型并随时切换，同时不能把 API Key 明文写进数据库。候选范围包括：引入各厂商原生 SDK、只做 OpenAI 兼容协议、或同时支持两类协议；密钥存储可选 `.env`、明文数据库、`safeStorage`、系统凭据库。

**决策**：

- **提供商范围**：支持 DeepSeek（继续使用 `@langchain/deepseek` 的 `ChatDeepSeek`）与通用 OpenAI 兼容服务（`@langchain/openai` 的 `ChatOpenAI`），内置 OpenAI、通义千问、Moonshot、智谱、SiliconFlow、Ollama 与自定义预设。不接入 Anthropic / Gemini 原生协议。
- **数据模型**：新增 v3 迁移 `model_profiles`（见 DATABASE_SCHEMA 4.6）。`provider` 为 `deepseek | openai-compatible`；`tools_enabled`、`is_active` 为 0/1；`api_key_cipher` 保存 `safeStorage` 密文的 base64。以部分唯一索引 `WHERE is_active = 1` 在数据库层保证单一 active；切换与删除后在同一事务内维护该不变量，删除 active 时提升 `updated_at` 最新的剩余档案。档案上限 20 个。
- **密钥**：`SecretCipher` 接口抽象加解密，生产实现 `ElectronSecretCipher` 调用 `safeStorage`；单元测试注入 fake。`safeStorage` 不可用时拒绝保存带 Key 的档案；更新时 Key 留空保留旧密文；解密失败返回 `MODEL_CONFIG_ERROR`。IPC/Renderer 只返回 `hasApiKey`。`openai-compatible` 允许空 Key（本地 Ollama 等，适配器用占位值 `not-needed`），DeepSeek 必须填写。
- **生效范围**：全局当前模型，由设置页切换；不支持会话级模型，也不在消息上记录所用模型。无档案或数据库不可用时回退 `.env`，保持旧用户可用。
- **适配层**：把原 `DeepSeekAdapter` 的流式循环、文本归一化、工具分片聚合、usage、abort 与错误映射抽到 `OpenAiCompatibleAdapter`，构造参数接受 `createModel(options)`；`DeepSeekAdapter` 与 `OpenAiChatAdapter` 只负责创建底层 LangChain 模型。`ModelAdapter` 接口与事件语义不变，`ChatService` 通过可注入的 `configProvider` 获取当前配置，避免与数据库初始化顺序强耦合。
- **工具兼容**：每个档案有“启用代码理解工具”开关，默认开。`ChatService.execute()` 用 `config.toolsEnabled` 同时控制 `runAgent` 的 ToolRegistry 与 system prompt；关闭时不绑定工具，提示词声明未读取仓库，避免模型仍尝试调用工具。
- **Base URL 校验**：必须 `https`，仅本地回环允许 `http`；拒绝 URL 内嵌用户名/密码，防止 Key 走明文网络。
- **连接测试**：抽出 `testAdapterConnection()` 供 `ChatService.testConnection()` 与设置页草稿测试共用；草稿 Key 只在单次 IPC 中传输，编辑已有档案留空则主进程复用密文。

**影响**：用户可在设置页新增、切换、删除模型档案，重启后保留；API Key 不再要求写入 `.env`。引入 `@langchain/openai` 作为直接依赖，版本固定为 1.6.3（1.7.0 要求 `@langchain/core ^1.3.0`，而当前 core 为 1.2.20）。所有 OpenAI 兼容服务共用同一流式/工具代码路径，新增服务商通常只需增加预设。`safeStorage` 只在 `app.whenReady()` 后可用，因此服务在主进程装配阶段延迟初始化；数据库不可用时整个档案功能降级到 `.env`。已知限制：无法防御已取得当前 Windows 用户权限的攻击者；模型档案是全局配置，暂不支持按会话选择。
