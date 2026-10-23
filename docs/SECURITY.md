# DevPilot 安全说明

> 适用范围：V1（阶段 1–6 已实现部分与后续阶段计划）
> 技术基线：`docs/TECHNICAL_DESIGN.md` 第 9、13、14 节

## 1. 安全边界

```text
Renderer（Vue）
   │ 只能访问 window.devPilot 具名方法
Preload（contextBridge）
   │ 固定 IPC channel，不暴露 ipcRenderer
Main（Electron）
   │ 重新校验入参、执行文件/模型/数据库操作
本地文件系统 / Git / SQLite / 模型服务 API（DeepSeek 或 OpenAI 兼容）
```

- Renderer 不导入 `fs`、`child_process`、`better-sqlite3` 等 Node.js 能力。
- Preload 不提供 `invoke(channel, ...args)` 之类任意 channel 入口。
- 主进程不信任 Renderer 传入的路径、ID 和参数。
- Shared 仅包含类型、Zod Schema 与常量。

## 2. 已实现措施（阶段 1–6）

- BrowserWindow 启用 `contextIsolation: true`、`sandbox: true`、`nodeIntegration: false`。
- 仅暴露应用信息、Ping、AI 配置状态与连接测试、仓库选择/列表/文件树、文件读写、Git status/diff 与对话等具名能力。
- 仓库只能由用户通过系统目录对话框明确选择；文件操作使用仓库 ID + 相对路径。
- 移出仓库只删除应用内登记与数据库记录，**不删除磁盘文件**；操作前需在界面确认。关联会话保留并解除关联（`repository_id` 置空），编辑会话按外键级联删除。
- 删除会话会**永久删除该会话及其全部消息**，仅删除应用数据库记录，不影响磁盘文件；操作前需在界面确认，生成中的会话禁止删除。
- 路径先用 `realpath` 解析，再用 `path.relative` 做关系判断；拒绝 `../`、绝对/盘符路径、符号链接逃逸与仓库外目标（单元测试覆盖）。
- 文件树跳过符号链接，忽略 `.git` / `node_modules`，条目上限 5000。
- 单文件读取上限 1 MB；二进制与非法 UTF-8 文件拒绝按文本展示；识别并移除 UTF-8 BOM。
- Monaco Editor 支持手动编辑；语言 Worker 为随应用打包的本地脚本，CSP 通过 `worker-src 'self' blob:` 限制来源，不加载远程脚本或远程资源。
- 手动保存由主进程重新解析并校验仓库相对路径；保存前复核目标 SHA-256，磁盘内容与读取时不一致返回 `FILE_CHANGED`，不覆盖外部修改。
- 写入限制 1 MB，拒绝空字符；保留原文件 UTF-8 BOM；先写同目录临时文件再重命名，失败时清理临时文件并返回稳定错误码。
- IPC 入参经 Zod 校验（Ping、仓库 ID 与文件相对路径等）。
- IPC 统一返回 `{ ok, data } | { ok, error: { code, message } }`，错误码稳定，渲染层统一解包。
- API Key 状态仅返回 `hasApiKey` 布尔值与模型/地址，**绝不返回 Key 内容或密文**。
- 模型档案的 API Key 使用 Electron `safeStorage`（Windows DPAPI）加密后写入 SQLite；`safeStorage` 不可用时拒绝保存带 Key 的档案并返回 `SECRET_STORAGE_UNAVAILABLE`。更新档案时 Key 留空表示保留旧密文。
- 自定义模型 Base URL 由 Zod 校验：必须 `https`，仅 `localhost` / `127.0.0.1` / `[::1]` 允许 `http`，拒绝 URL 内嵌用户名或密码，防止 Key 走明文网络或被发送到带凭据的地址。
- “测试连接”草稿中的 Key 只随单次 IPC 传输，不落库；编辑已有档案时留空则主进程复用已存的密文。
- `.env` 仅由主进程加载；加载器不打印配置值，只记录加载文件数量。
- `.env` 已加入 `.gitignore`；仓库内仅保留 `.env.example`。
- 页面禁止任意导航；新窗口请求一律拒绝，`https://` 链接交由系统浏览器打开。
- 未提供任意命令执行、自动提交/推送或工作区清理能力。
- 未保存修改在关闭标签、切换仓库、离开工作区与退出应用时提示，避免静默丢失。
- 手动保存只覆盖已存在且已读取的文件，不提供新建、删除或重命名能力。
- Git 仅开放只读命令：`status --porcelain=v1 -z`、`diff`、`rev-parse`、`branch --show-current`；不提供暂存、提交、推送、分支切换或任意 Git 参数入口。
- Git 命令使用 `spawn('git', args, { shell: false })` 参数数组执行，`--` 分隔路径，Diff 路径先通过安全相对路径校验；限时 10 秒、stdout 上限 5 MB、Diff 展示上限 512 KB，超限返回稳定错误码。
- Git 错误按 stderr 分类为 `NOT_A_GIT_REPOSITORY`、`GIT_NOT_AVAILABLE`、`GIT_TIMEOUT`、`GIT_OUTPUT_TOO_LARGE`、`GIT_COMMAND_FAILED`，日志不记录文件内容或完整命令输出。
- 加载失败的 `.env` 会记录错误原因，不静默吞掉异常。
- SQLite 数据库位于 Electron `userData` 目录（`devpilot.db`），不写入安装目录或用户仓库；迁移由 `user_version` 管理。
- 数据库访问全部使用 `better-sqlite3` 参数化语句，不拼接用户输入；启用 `foreign_keys`、WAL 与 `busy_timeout`。
- 数据库保存仓库元数据（名称、绝对路径、时间）、会话、消息、AI 编辑提案与模型档案；不保存 API Key 明文或 Git 输出。编辑提案会保存被提议文件的原始与建议内容（用于 Diff 审核与重启恢复），仅限用户仓库中被提议的单个文件，不保存整仓内容。模型档案的 Key 只保存 `safeStorage` 密文的 base64。
- 数据库初始化失败时应用仍可启动，但本次运行不持久化；日志不输出数据库内容或完整路径。
- `.env` 不存在属于正常状态，设置页明确展示“未配置”。
- 模型请求只在主进程发起；`AbortController`、超时计时器与 API Key 都不进入 Renderer。
- Renderer 预生成 `requestId` 并随发送请求传入；主进程拒绝并发请求与重复 `requestId`，已完成 ID 放入有界集合防重放。
- 流式事件只通过固定 `chat:event` channel 推送；Preload 只向监听器传递 payload，不暴露 `IpcRendererEvent`。
- 用户取消、超时或失败时，部分 assistant 文本保留在界面但不写入数据库，避免污染后续上下文；日志只记录 requestId、耗时、错误码与 token 用量。
- system prompt 根据是否启用工具切换：无仓库/无工具时声明“尚未读取任何仓库文件、不得声称查看过代码”；启用工具时要求“先定位再读取”、引用相对路径与行号，并声明禁止编造内容。
- 只读工具全部在主进程执行，Renderer 不新增文件访问能力；工具参数用 Zod `z.strictObject` 校验，未知工具、缺失字段与多余字段一律拒绝。
- 工具集合固定为 `list_files`、`read_file`、`search_code`、`get_git_status`、`get_git_diff`；没有写文件、任意命令、Git 写操作或网络工具。
- `list_files` 跳过符号链接、`.git`/`node_modules`/构建缓存与敏感条目，限制深度 3、最多 500 项。
- `read_file` 复用安全文件读取（1 MB、二进制/编码校验、路径范围），额外按行区间读取（最多 300 行）并阻止敏感路径与高置信密钥内容。
- `search_code` 使用 `spawn(resolveRgCommand(), args, { shell: false })` 参数数组执行，优先内置 ripgrep（`@vscode/ripgrep`，`DEV_PILOT_RG_PATH` 可覆盖），禁止用户配置、限制 10 秒与 2 MB 输出，最多 40 个文件 / 200 条匹配；查询以 `-e` 传入并用 `--` 分隔，避免被解析为选项。
- 敏感路径按已知清单阻断（`.env*` 示例文件除外、SSH 私钥、证书、凭据、`.ssh`/`.aws`/`.gnupg` 等目录等）；搜索与 Diff 片段命中高置信密钥模式时脱敏或整份阻断。该过滤基于已知模式，不能保证识别所有秘密。
- 工具输出统一包裹为 `<tool_result>`，系统提示将其与 README、注释、Issue、搜索片段一起声明为不可信数据；其中要求忽略规则或泄露提示词的指令不执行。
- Agent 循环限制轮数与调用次数，重复调用（工具名 + 规范化参数）直接阻止；单工具 15 秒超时、12k 字符上限，单请求累计 32k 字符；达到上限后强制收尾，避免上下文膨胀与无限循环。
- 工具调用摘要随 assistant 消息写入 `messages.tool_calls`，只含工具名、参数摘要、状态、结果摘要与耗时；不保存工具输出正文、文件内容、搜索片段或 Git Diff。
- 工具执行日志只记录工具名、状态、耗时与结果状态，不记录参数原文、文件内容或堆栈。
- AI 修改只能通过 `propose_file_edit` 生成待审核建议，工具本身不写盘、不删除文件、不执行命令；写入只发生在用户在工作区 Diff 面板逐文件点击“应用”时。
- `modify` 要求 `oldText` 与当前文件完全一致且唯一出现，避免模型基于未读取内容覆盖文件；`create` 拒绝已存在的目标。提案内容限制 1 MB、拒绝空字符，敏感路径在工具层与服务层双重阻断。
- 应用前重新校验仓库相对路径与目标状态：`modify` 复核原始 SHA-256，`create` 复核目标不存在；外部修改或目标已存在时标记 `stale` 并返回 `FILE_CHANGED`，不覆盖磁盘。拒绝提案只更新状态，不触碰文件。
- 提案按请求分组，单会话最多 20 个文件；同一文件只允许一条待审核建议，避免对同一基准内容叠加互相冲突的修改。
- 应用目标存在未保存编辑时，界面明确提示会覆盖并丢弃这些修改；应用后重新读取文件并刷新 Git 状态。

## 3. API Key 存储边界

多模型功能引入两种存储方式，模型档案优先，`.env` 仅在没有档案或数据库不可用时兜底：

### 3.1 模型档案（设置页配置）

- 保存在 `userData/devpilot.db` 的 `model_profiles.api_key_cipher` 列。
- 写入前用 Electron `safeStorage.encryptString()` 加密，数据库只保存密文的 base64。Windows 下底层为 DPAPI，密文与当前 Windows 用户绑定。
- 解密只发生在主进程 `ModelProfileService.resolveActive()`，结果仅用于构造模型适配器，不返回 Renderer、不写日志、不写数据库。
- IPC 与 Renderer 只能拿到 `hasApiKey: boolean`；编辑表单不回显 Key。
- 更新档案时 Key 留空 = 保留旧密文，避免误清空；需更换时输入新 Key。
- `safeStorage.isEncryptionAvailable()` 为 false 时，带 Key 的保存返回 `SECRET_STORAGE_UNAVAILABLE`，状态中 `secretStorageAvailable: false`，界面提示改用 `.env`；空 Key 的 OpenAI 兼容档案仍可保存。
- 解密失败（例如数据库被其他 Windows 账户复制）返回 `MODEL_CONFIG_ERROR`，提示重新填写 Key，不静默使用空 Key。
- Key 不会出现在 IPC 返回、Renderer 持久化、日志或前端构建产物中。
- 已知边界：`safeStorage` 依赖操作系统登录会话，无法防御已取得当前 Windows 用户权限的恶意程序；它提高的是静态数据库文件泄漏时的成本，而不是完整的主机安全。

### 3.2 `.env` 兜底

- 开发环境路径：项目根目录 `.env`；打包后：Electron `userData` 目录下的 `.env`（通常为 `%APPDATA%\DevPilot`）。
- `.env` 是**明文本地文件**，不等同于 Windows 凭据管理器或系统密钥库；已被 `.gitignore` 忽略。
- 已存在的进程环境变量不会被 `.env` 覆盖。
- 只要存在 active 档案，`.env` 即不再参与模型请求。

### 3.3 草稿连接测试

- 设置页未保存的档案可直接“测试连接”，此时 Key 通过单次 IPC 请求传入主进程，不落库、不缓存。
- 编辑已有档案且留空 Key 时，主进程复用数据库中的密文解密后测试，避免把 Key 回传到 Renderer。
- 测试请求与普通对话一样受超时限制，只发送一条最小提示。

## 4. 云端数据发送

阶段 4 起云端模型已接通（现支持 DeepSeek 与任意 OpenAI 兼容服务），阶段 5 起工具读取的仓库内容也会参与请求，阶段 6 起模型生成的提案内容同样会发送。请求目标取决于设置页当前激活的模型档案，或没有档案时的 `.env`：

- 发送内容：用户输入、对话历史（最近 20 条 / 24k 字符）、工具调用参数（含 `propose_file_edit` 的 `oldText`/`newText`/`content`），以及被读取的仓库文件片段与搜索片段。
- 仓库内容只在模型主动调用工具时读取，且受敏感路径阻断、行区间、条目数与字符上限约束；不会整仓上传。
- AI 生成的修改建议会以 `oldText/newText/content` 形式发送到云端模型，并保存在本地 SQLite 供 Diff 审核；除模型请求外不会上传到其他位置。
- 传输内容可能离开本机，对话页、工作区面板与 README 持续提示。
- 默认忽略 `.env`、私钥、证书、凭据文件和常见敏感配置，但过滤不可能保证识别所有秘密。
- 仓库中的 README、注释、Issue、`<tool_result>` 与搜索片段均视为**不可信数据**，不得覆盖系统提示与安全策略。
- 模型调用、工具参数与结构化输出必须经过运行时校验。
- 设置页“连接测试”仅在用户点击时发送一条最小请求（约 8 tokens），并受 20 秒超时限制。

## 5. 文件、Git、数据库与对话防护

阶段 3–6 已实现（读取、手动写入、只读 Git、本地 SQLite、云端对话、只读代码工具与 AI 修改审核）：

- [x] 仓库必须由用户通过系统目录对话框明确选择；模型输出不能注册仓库。
- [x] 使用仓库 ID + 相对路径访问文件；主进程 `realpath` 规范化后做路径关系判断，不使用字符串前缀匹配。
- [x] 防御 `../`、盘符/分隔符差异、符号链接逃逸、绝对路径与同名路径绕过；单元测试覆盖。
- [x] 单文件读取 1 MB 上限；二进制文件与非法 UTF-8 文本拒绝展示。
- [x] 文件树忽略 `.git` / `node_modules` 并跳过符号链接。
- [x] 手动保存重新校验路径、仓库范围与 SHA-256 哈希；外部修改返回 `FILE_CHANGED`。
- [x] 写入限制 1 MB、拒绝空字符、保留 BOM，并使用临时文件原子替换。
- [x] 关闭脏标签、切换仓库、离开工作区与退出应用时提示未保存修改。
- [x] Git 命令使用参数数组执行、`shell: false`，设置 10 秒超时与输出上限；V1 仅只读操作，无写入、提交或推送能力。
- [x] Git Diff 路径通过安全相对路径校验，未登记的仓库 ID 与仓库外路径直接拒绝。
- [x] SQLite 使用参数化 SQL 与 `user_version` 迁移；启用外键约束；数据库位于 `userData`，不保存 API Key 明文或普通文件内容。
- [x] 模型档案 Key 使用 `safeStorage` 加密后入库，IPC/Renderer 只返回 `hasApiKey`；加密不可用或解密失败返回稳定错误码（单元测试覆盖，实机 DPAPI 验收待补充）。
- [x] 自定义 Base URL 经 Zod 校验：仅 https，http 仅限本地回环，拒绝 URL 内嵌凭据（单元测试覆盖）。
- [x] 数据库初始化失败时降级为内存模式，不阻断应用启动，也不泄露数据库内容到日志；模型配置回退 `.env`。
- [x] 对话与消息通过参数化 SQL 持久化；会话标题由首条用户消息生成并截断，不来自模型输出。
- [x] 取消/超时/失败时不写入部分回答；历史裁剪只保留 user/assistant 消息并限制字符数。
- [x] 删除会话前需界面确认，永久删除会话及其消息；生成中的会话被主进程拒绝删除。
- [x] 主进程只允许一个活动模型请求，重复 `requestId` 与并发请求返回 `VALIDATION_ERROR`。
- [x] 只读工具参数经 Zod 严格校验；未知工具、缺失/多余字段与非法路径直接拒绝（单元测试覆盖）。
- [x] 工具执行受轮数、调用次数、超时与输出字符上限约束；重复调用被阻止；取消请求后不再执行后续工具。
- [x] 敏感路径、敏感目录与高置信密钥内容被阻止；搜索片段命中密钥时脱敏（单元测试覆盖）。
- [x] `search_code` 以参数数组调用 `rg`、`shell: false`、`--no-config`，限制超时与输出，且不暴露任意命令参数。
- [x] 工具输出以 `<tool_result>` 包裹并声明为不可信数据；系统提示禁止编造文件内容、路径与行号。
- [x] 工具摘要持久化到 `messages.tool_calls`，不含工具正文；损坏 JSON 降级为空而不抛异常。
- [x] AI 修改工具 `propose_file_edit` 只创建待审核提案，不写盘；写入仅在用户逐文件应用时发生。
- [x] `modify` 校验 `oldText` 与当前文件完全一致且唯一出现；`create` 拒绝已存在目标；提案内容限制 1 MB 并拒绝空字符。
- [x] 应用前重新校验仓库相对路径、目标状态与原始 SHA-256；不一致标记 `stale`，禁止覆盖外部修改；拒绝提案不触碰文件。
- [x] 提案按请求分组并限制单会话文件数；同一文件只允许一条待审核建议；已处理提案不能重复应用或拒绝。
- [x] 多文件应用非原子，逐文件展示成功/失败；`stale`/`failed` 项保留在面板中，不宣称整体成功。
- [x] 应用成功后重新读取文件、刷新 Git 状态与文件树；存在未保存编辑时先提示覆盖风险。

## 6. 错误与日志

- 用户界面展示可操作的安全错误说明，不返回 API Key、完整环境变量或敏感绝对路径。
- 日志只记录状态、耗时、错误码与脱敏摘要。
- 后续增加日志容量限制或轮转，避免无限增长。
- 不允许 `catch` 后静默忽略异常；可恢复错误提供重试入口。

## 7. 手工安全验收清单（当前阶段）

- [x] 应用可启动，Renderer 无 Node.js 直接访问能力。
- [x] Preload 仅暴露最小 API。
- [x] 设置页可显示 Key 是否配置，但不显示 Key。
- [x] IPC Ping 可正常完成。
- [x] `npm run lint` / `npm run typecheck` / `npm test` / `npm run build` 通过。
- [x] 路径穿越、绝对路径、盘符路径与符号链接逃逸测试（单元测试覆盖）。
- [x] 大文件与二进制文件处理（单元测试覆盖）。
- [x] 手动保存的哈希冲突、大小、空字符、BOM、路径穿越与未知仓库（单元测试覆盖）。
- [x] Monaco 编辑与本地 Worker 加载验证（开发模式与 `file://` 生产构建）。
- [x] Git status/diff 的真实临时仓库测试：分支、修改/新增/未跟踪/换名/删除、空树基线、Diff 截断、非 Git 仓库、未登记仓库与路径穿越（单元测试覆盖）。
- [x] Git 命令未安装、超时与输出超限返回稳定错误码（代码路径覆盖；未在 CI 中模拟）。
- [x] SQLite 迁移、表与索引、外键级联、参数化 SQL、跨重启恢复（单元测试覆盖）。
- [x] SQLite v1→v2 迁移保留旧数据并新增 `messages.tool_calls`（单元测试覆盖）；Electron 44 构建产物的实机启动验证留待阶段 7 最终验收。
- [x] SQLite v3 迁移创建 `model_profiles`、单 active 部分唯一索引，v2→v3 保留旧数据（单元测试覆盖）。
- [x] 模型档案 CRUD、空 Key 保留、DeepSeek 缺 Key、`.env` 兜底、加密不可用与解密失败（单元测试覆盖）。
- [x] 工具开关关闭时不绑定工具且系统提示声明未读取仓库（单元测试覆盖）。
- [x] 对话流式、取消、超时、错误映射、重试、重复/并发 requestId、连接测试（单元测试覆盖）。
- [x] 渲染层验证未配置 Key 时禁用输入、事件错误可重试、停止后不残留生成状态（Playwright + API mock）。
- [x] 工具循环覆盖正常调用、无工具单轮、轮数/单轮/总量上限、重复调用、工具错误/超时、取消、输出截断与事件顺序（单元测试覆盖）。
- [x] 敏感文件清单、高置信密钥识别、片段脱敏、`read_file`/`get_git_diff` 阻断与 `search_code` 参数构造/JSON 解析（单元测试覆盖）。
- [x] `search_code` 真实 ripgrep 集成（使用内置 `rg`；无可用 `rg` 时用例自动跳过并覆盖 `RG_NOT_AVAILABLE`）。
- [x] 提案生成、唯一片段校验、重复路径/文件上限、应用成功、外部修改拦截（`stale`）、新建目标冲突、拒绝与逐项结束会话（单元测试覆盖）。
- [x] 未确认提案不改磁盘；拒绝后文件内容保持不变（单元测试覆盖）。
- [x] `propose_file_edit` 参数组合、敏感路径阻断、事件回调与错误映射（单元测试覆盖）。
- [x] `edit_proposed` 事件顺序与单一终态语义（单元测试覆盖）。
- [ ] 真实模型工具调用与修改建议端到端验收（依赖本地 Key 与额度，阶段 7 补充）。
- [ ] 真实模型 API 的端到端验收（DeepSeek 与至少一个 OpenAI 兼容服务，依赖本地 Key 与额度）。
- [ ] 重启应用后模型档案与 active 保留；用 SQLite 查询确认 `api_key_cipher` 为 base64 密文且 Renderer/IPC 返回无 Key。
- [ ] 切换 active 后对话与工具调用正常；关闭工具开关后助手明确声明未读取文件。
- [ ] 工作区 Diff 面板的人工验收（阶段 7 最终验收）。
- [ ] Windows 安装包中原生模块加载验证（阶段 7）。
