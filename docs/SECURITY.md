# DevPilot 安全说明

> 适用范围：V1（阶段 1–4 已实现部分与后续阶段计划）
> 技术基线：`docs/TECHNICAL_DESIGN.md` 第 9、13、14 节

## 1. 安全边界

```text
Renderer（Vue）
   │ 只能访问 window.devPilot 具名方法
Preload（contextBridge）
   │ 固定 IPC channel，不暴露 ipcRenderer
Main（Electron）
   │ 重新校验入参、执行文件/模型/数据库操作
本地文件系统 / Git / SQLite / DeepSeek API
```

- Renderer 不导入 `fs`、`child_process`、`better-sqlite3` 等 Node.js 能力。
- Preload 不提供 `invoke(channel, ...args)` 之类任意 channel 入口。
- 主进程不信任 Renderer 传入的路径、ID 和参数。
- Shared 仅包含类型、Zod Schema 与常量。

## 2. 已实现措施（阶段 1–4）

- BrowserWindow 启用 `contextIsolation: true`、`sandbox: true`、`nodeIntegration: false`。
- 仅暴露应用信息、Ping、AI 配置状态与连接测试、仓库选择/列表/文件树、文件读写、Git status/diff 与对话等具名能力。
- 仓库只能由用户通过系统目录对话框明确选择；文件操作使用仓库 ID + 相对路径。
- 路径先用 `realpath` 解析，再用 `path.relative` 做关系判断；拒绝 `../`、绝对/盘符路径、符号链接逃逸与仓库外目标（单元测试覆盖）。
- 文件树跳过符号链接，忽略 `.git` / `node_modules`，条目上限 5000。
- 单文件读取上限 1 MB；二进制与非法 UTF-8 文件拒绝按文本展示；识别并移除 UTF-8 BOM。
- Monaco Editor 支持手动编辑；语言 Worker 为随应用打包的本地脚本，CSP 通过 `worker-src 'self' blob:` 限制来源，不加载远程脚本或远程资源。
- 手动保存由主进程重新解析并校验仓库相对路径；保存前复核目标 SHA-256，磁盘内容与读取时不一致返回 `FILE_CHANGED`，不覆盖外部修改。
- 写入限制 1 MB，拒绝空字符；保留原文件 UTF-8 BOM；先写同目录临时文件再重命名，失败时清理临时文件并返回稳定错误码。
- IPC 入参经 Zod 校验（Ping、仓库 ID 与文件相对路径等）。
- IPC 统一返回 `{ ok, data } | { ok, error: { code, message } }`，错误码稳定，渲染层统一解包。
- API Key 状态仅返回布尔值与模型/地址，**绝不返回 Key 内容**。
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
- 数据库保存仓库元数据（名称、绝对路径、时间）、会话与消息；不保存 API Key、文件内容或 Git 输出。编辑提案写入前需继续遵守此边界。
- 数据库初始化失败时应用仍可启动，但本次运行不持久化；日志不输出数据库内容或完整路径。
- `.env` 不存在属于正常状态，设置页明确展示“未配置”。
- 模型请求只在主进程发起；`AbortController`、超时计时器与 API Key 都不进入 Renderer。
- Renderer 预生成 `requestId` 并随发送请求传入；主进程拒绝并发请求与重复 `requestId`，已完成 ID 放入有界集合防重放。
- 流式事件只通过固定 `chat:event` channel 推送；Preload 只向监听器传递 payload，不暴露 `IpcRendererEvent`。
- 用户取消、超时或失败时，部分 assistant 文本保留在界面但不写入数据库，避免污染后续上下文；日志只记录 requestId、耗时、错误码与 token 用量。
- system prompt 声明当前尚未读取仓库文件、不得声称查看过代码或执行过命令；阶段 5 起仓库内容将作为不可信数据注入并保持该约束。

## 3. API Key 存储边界

V1 按项目决定使用本地 `.env`：

- 开发环境路径：项目根目录 `.env`。
- 打包后路径：Electron `userData` 目录下的 `.env`（Windows 通常为 `%APPDATA%\DevPilot`）。
- `.env` 是**明文本地文件**，不等同于 Windows 凭据管理器或系统密钥库。
- 已存在的进程环境变量不会被 `.env` 覆盖。
- Key 不写入数据库、日志、Renderer 持久化或前端构建产物。

后续如需更高安全等级，应评估 Electron `safeStorage` 或系统凭据存储，并明确迁移方式；这属于设计变更，需先评审。

## 4. 云端数据发送

阶段 4 起 DeepSeek 已接通：

- 当前发送内容仅限用户输入与对话历史（最近 20 条 / 24k 字符），不会发送仓库文件内容。
- 阶段 5 接入工具后，为回答代码问题，相关文件内容与搜索片段也会发送到所配置的云端模型。
- 传输内容可能离开本机，对话页、设置页与 README 持续提示。
- 默认忽略 `.env`、私钥、证书、凭据文件和常见敏感配置，但过滤不可能保证识别所有秘密。
- 仓库中的 README、注释、Issue 文本等均视为**不可信数据**，不得覆盖系统提示与安全策略。
- 模型调用、工具参数与结构化输出必须经过运行时校验。
- 设置页“连接测试”仅在用户点击时发送一条最小请求（约 8 tokens），并受 20 秒超时限制。

## 5. 文件、Git、数据库与对话防护

阶段 3–4 已实现（读取、手动写入、只读 Git、本地 SQLite 与云端对话）：

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
- [x] SQLite 使用参数化 SQL 与 `user_version` 迁移；启用外键约束；数据库位于 `userData`，不保存 API Key 或普通文件内容。
- [x] 数据库初始化失败时降级为内存模式，不阻断应用启动，也不泄露数据库内容到日志。
- [x] 对话与消息通过参数化 SQL 持久化；会话标题由首条用户消息生成并截断，不来自模型输出。
- [x] 取消/超时/失败时不写入部分回答；历史裁剪只保留 user/assistant 消息并限制字符数。
- [x] 主进程只允许一个活动模型请求，重复 `requestId` 与并发请求返回 `VALIDATION_ERROR`。

阶段 6 必须补充：

- [ ] AI 提议写入前同样重新校验路径、目标状态与原始文件哈希；哈希不一致标记 `stale`，禁止覆盖外部修改（手动保存已具备同等哈希复核）。
- 未确认的提案不修改磁盘；拒绝后文件保持不变。
- 多文件应用非原子时，逐文件展示成功/失败，不宣称整体成功。

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
- [x] Electron 44 构建产物启动后创建 `%APPDATA%\DevPilot\devpilot.db`，`user_version = 1` 且基础表存在。
- [x] 对话流式、取消、超时、错误映射、重试、重复/并发 requestId、连接测试（单元测试覆盖）。
- [x] 渲染层验证未配置 Key 时禁用输入、事件错误可重试、停止后不残留生成状态（Playwright + API mock）。
- [ ] 真实 DeepSeek API 的端到端验收（依赖本地 Key 与额度，阶段 7 补充）。
- [ ] 外部修改后旧提案拦截（阶段 6）。
- [ ] 未确认提案不改磁盘（阶段 6）。
- [ ] Windows 安装包中原生模块加载验证（阶段 7）。
