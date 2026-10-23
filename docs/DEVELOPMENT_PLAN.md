# DevPilot 开发计划与验收状态

> 开发基线：`docs/TECHNICAL_DESIGN.md`
> 更新时间：2026-10-23

## 当前进度

**阶段 1：工程骨架 — 已完成**
**阶段 2：基础 UI — 已完成**
**阶段 3：本地仓库与代码浏览 — 已完成**
**阶段 4：AI 对话 — 已完成**
**阶段 5：代码理解工具 — 已完成**
**阶段 6：Diff 修改闭环 — 已完成**
**下一步：阶段 7 稳定性与交付**

> 阶段 6 已接入 `propose_file_edit` 工具：AI 只能生成“精确替换”或“新建文件”的待审核建议，用户在工作区 Diff 面板逐文件应用或拒绝。
> 应用前重新校验路径、目标状态与原始 SHA-256；外部修改会把建议标记为 `stale`，不会覆盖磁盘。本阶段不支持 AI 删除文件。
> 仓库文件内容、搜索片段与提案内容会发送到云端模型；提案内容还会保存在本地 SQLite 中，供重启后继续审核。

## 阶段 1：工程骨架

- [x] electron-vite 项目，Electron 44 + Vue 3 + TypeScript 5.9。
- [x] Main / Preload / Renderer / Shared 分层与路径别名。
- [x] 安全 BrowserWindow：`contextIsolation: true`、`sandbox: true`、`nodeIntegration: false`。
- [x] Preload 只暴露具名 API，不暴露 `ipcRenderer` 或任意 channel。
- [x] ESLint、Prettier、Vitest、TypeScript 严格模式。
- [x] 至少一个 IPC 调用与对应测试（`app:get-info`、`app:ping`、`app:get-ai-config-status`）。
- [x] Windows 本地开发启动验证。

验证结果：

- `npm run typecheck` 通过。
- `npm run lint` 通过（0 error / 0 warning）。
- `npm test` 通过（4 个测试文件，11 个用例）。
- `npm run build` 通过。
- `npm run dev` 启动成功，窗口渲染、导航、IPC Ping 均经手工验证。

## 阶段 2：基础 UI

- [x] 左侧全局导航：研发对话、研发工作区、设置。
- [x] Vue Router：Chat / Workspace / Settings，Hash 模式。
- [x] Element Plus 基础控件与暗色主题定制。
- [x] Pinia：`repository`、`chat`、`workspace` Store。
- [x] 对话页：会话列表、新建会话、空状态、输入区与禁用提示。
- [x] 工作区：三栏 IDE 布局、文件树空状态、编辑器占位、可折叠 AI 面板与 Diff 面板。
- [x] 设置页：模型配置状态、`.env` 说明、应用信息、主进程 Ping 测试、隐私边界。
- [x] loading / empty / error 状态覆盖主要异步区域。
- [x] 业务逻辑不堆在 `App.vue`，页面通过类型化 `desktop-api.ts` 访问主进程。
- [x] 深色 IDE 风格视觉与响应式收缩（窄窗口下面板可折叠）。

## 阶段 3：本地仓库与代码浏览（已完成）

- [x] RepositoryService：系统目录选择、路径校验、Git 仓库识别、仓库登记与切换；登记结果持久化，重启后恢复并可自动载入最近仓库。
- [x] SQLite + better-sqlite3：`user_version` 迁移；`repositories`、`conversations`、`messages`、`edit_sessions`、`file_edits` 表、外键与索引；参数化 SQL；WAL 与 `busy_timeout`；Electron 44 实机加载验证（N-API 预编译，无需重建 ABI）。
- [x] 路径安全：`realpath` 规范化、路径关系判断；路径穿越、绝对/盘符路径、符号链接逃逸测试。
- [x] 文件树与文件读取：5000 项上限、1 MB 读取上限、二进制识别、UTF-8/BOM 处理。
- [x] GitService：只读 `status` / `diff` / 分支信息；`spawn` 参数数组、`shell: false`、10 秒超时、5 MB 输出上限、512 KB Diff 截断；porcelain v1 `-z` 解析暂存/未跟踪/换名/冲突；未跟踪文件生成新增 Diff，未提交仓库以空树为基线。
- [x] Monaco Editor：代码查看与编辑、按扩展名语言识别与语法高亮；模型按文件复用，关闭标签或卸载组件时释放实例。
- [x] 手动保存：`Ctrl+S` / 保存按钮写回原文件；保存前复核路径、仓库范围与 SHA-256 哈希；外部修改返回 `FILE_CHANGED` 并提示重新加载；保留 BOM、1 MB 上限、拒绝空字符、临时文件原子替换。
- [x] 未保存修改提示：关闭标签、切换仓库、离开工作区、退出应用。
- [x] 工作区接入真实仓库与文件树，支持 Monaco 编辑与手动保存，并在状态栏展示分支/变更数。
- [x] 变更与 Diff 面板：变更列表（状态标记、暂存标记）、选择文件展示相对 `HEAD` 的统一 Diff、加载/空/错误状态、刷新、在编辑器中打开；保存文件后自动刷新 Git 状态。
- [x] 阶段 3 单元测试：路径安全、文件树、文件读写、Git status/diff（真实临时仓库）、SQLite 迁移/仓储/外键/跨重启持久化、Schema 校验与语言映射（96 个用例）。

验证结果（本次已实现部分）：

- `npm run lint`、`npm run format:check`、`npm run typecheck`、`npm run build` 通过。
- `npm test`：11 个测试文件、96 个用例全部通过。
- `npm run dev` 手工验证：通过系统目录对话框选择真实仓库；包含中文路径的仓库可正常登记、浏览与读取；文件树忽略 `.git` / `node_modules`；README 与 TypeScript 文件在 Monaco 中显示行号、语法高亮与 UTF-8 元信息；二进制文件显示“二进制文件不支持文本预览”。
- 手动保存验证：开发模式渲染层（Playwright + 预加载 API mock）验证编辑后的未保存标记、`Ctrl+S` 传递的仓库/路径/内容/哈希、保存后状态复位、`FILE_CHANGED` 冲突对话框与重新加载、关闭脏标签与离开工作区的未保存提示；`FileService` 对真实临时目录的写入、BOM、哈希冲突、大小、空字符与路径安全由 Vitest 覆盖。
- Git 验证：`GitService` 在真实临时仓库上覆盖分支读取、修改/新增/未跟踪/换名/删除状态、相对 `HEAD` 与空树基线的 Diff、未跟踪文件新增 Diff、512 KB 截断、非 Git 仓库、未登记仓库与路径穿越；渲染层（Playwright + 预加载 Git API mock）验证变更列表、Diff 颜色分类、截断提示、错误重试与“在编辑器中打开”。
- SQLite 验证：`openDatabase` 在临时目录创建数据库并校验 `user_version`、5 张基础表、6 个索引、WAL 与 `foreign_keys`；仓储层覆盖排序、路径查找、更新时间刷新与参数化 SQL；外键覆盖非法引用和删除仓库时的 `SET NULL` / `CASCADE`；`RepositoryService` 覆盖登记写库、重启恢复与重复登记刷新时间。真实 Electron 44 构建产物启动后确认 `%APPDATA%\DevPilot\devpilot.db` 创建、`user_version = 1` 且 5 张表存在。
- 仓库自动恢复验证：渲染层（Playwright + 预加载 API mock）在存在持久化仓库列表且未选择仓库时，挂载后自动载入最近仓库、文件树与分支，无需点击“选择仓库”。
- 待补充：真实 Electron 窗口中选择仓库后手动保存与 Git 面板的人工验收，随阶段 7 最终验收清单执行。
- 待补充：安装包内 better-sqlite3 的加载验证（阶段 7）。
- Monaco 集成验证：开发模式下 TS/CSS/HTML/JSON Worker 均正常加载；生产构建通过 `file://` 加载时 Monaco 正常渲染、Worker 成功启动且无控制台错误；多标签切换、关闭全部标签后回到空状态、重新打开文件均正常。

## 阶段 4：AI 对话（已完成）

- [x] DeepSeek 配置与 `ModelAdapter` 适配层。
- [x] LangChain.js 接入边界与流式事件转换。
- [x] 流式聊天、停止生成、请求超时与取消。
- [x] 会话/消息持久化。
- [x] 错误码映射、重试入口与安全日志。
- [x] 设置页“连接测试”启用。

验证结果：

- `npm run lint`、`npm run format:check`、`npm run typecheck`、`npm run build` 通过。
- `npm test`：16 个测试文件、146 个用例全部通过（阶段 4 新增 ChatStore、模型适配层、提示构建、对话服务、Schema 等用例）。
- 构建产物 `out/main/index.js` 中 `@langchain/deepseek` 与 `@langchain/core/messages` 保持外部 `require`；Node 直接 `require('@langchain/deepseek')` 可加载。
- 渲染层（Playwright + 预加载 API mock）验证：新建会话与自动标题、流式增量渲染、停止后显示“已停止”、事件类错误显示可读信息并可重试且回答成功、未配置 Key 时显示警告并禁用输入、设置页连接测试成功与失败提示。
- 未覆盖：真实 DeepSeek API 端到端验收依赖本地 `.env` 中的真实 Key 与额度，未在本轮自动执行；阶段 7 最终验收时补充。

## 阶段 5：代码理解工具

- [x] Tool Registry 与 Zod 参数校验。
- [x] `list_files`、`read_file`、`search_code`、`get_git_status`、`get_git_diff`。
- [x] Agent 执行循环：轮数限制、工具超时、输出上限、循环保护。
- [x] 上下文裁剪、敏感文件过滤、仓库内容提示注入防护。
- [x] 工具执行事件展示（对话页 + 工作区右侧 AI 面板），摘要随消息持久化。

实现要点：

- 工具全部在主进程执行且只读；参数使用 `z.strictObject` 校验，JSON Schema 由 `z.toJSONSchema()` 生成后绑定给模型。
- `agent-runner` 限制 5 轮 / 每轮 4 次 / 每次请求 12 次调用、单工具 15 秒、单工具 12k 字符、单请求 32k 字符；重复调用（工具名 + 参数）直接阻止；达到上限后强制一轮不带工具的收尾调用。
- 敏感文件按路径拒绝（`.env*`（示例文件除外）、私钥、证书、凭据、`.ssh`/`.aws` 等目录），并对高置信密钥模式做内容阻断与搜索片段脱敏。
- `search_code` 通过 `spawn(resolveRgCommand(), args, { shell: false })` 调用 ripgrep：优先使用 `@vscode/ripgrep` 随包内置的 `rg`，支持 `DEV_PILOT_RG_PATH` 覆盖，内置缺失时回退系统 PATH；10 秒超时、2 MB 输出上限；支持 `case` 智能大小写；结果按文件分组、按文件数/条数与片段长度裁剪。
- 工具输出以 `<tool_result>` 包裹并声明为不可信数据；系统提示要求“先定位再读取”，禁止编造路径/行号/内容。
- 新增事件 `tool_started` / `tool_finished`，不改变 `completed` / `cancelled` / `error` 的单一终态语义；只持久化调用摘要，不保存工具输出正文。
- 工作区右侧 AI 面板改为真实对话，与对话页共享同一 chat store，切换路由不会中断生成。

验证结果：

- `npm run format:check`、`npm run lint`、`npm run typecheck`、`npm run build` 通过。
- `npm test`：27 个测试文件、257 个用例通过（2 个“缺少 ripgrep”用例因内置 `rg` 可用而跳过）；覆盖 Tool Registry、敏感文件、5 个工具、真实 ripgrep 集成、Agent 循环、适配器工具分片、ChatService 终态与落库、v1→v2 迁移、Markdown 渲染与主题偏好解析。
- 未覆盖：真实 DeepSeek 工具调用端到端验收依赖本地 `.env` 中的真实 Key 与额度；真实 ripgrep 集成用例使用内置 `rg`，全部不可用时工具返回 `RG_NOT_AVAILABLE` 且不中断对话。

## 阶段 6：Diff 修改闭环（已完成）

- [x] `propose_file_edit` 工具与编辑会话持久化。
- [x] Monaco Diff Editor 与逐文件审核状态。
- [x] 拒绝 / 确认应用流程。
- [x] 写入前路径、目标状态与原始哈希复核；外部修改标记 `stale`。
- [x] 多文件部分失败时准确展示成功/失败结果。
- [x] 应用后刷新文件预览与 Git 状态。

实现要点：

- 提案格式为“精确替换片段”：`modify` 必须提供 `oldText` 与 `newText`，主进程读取当前文件并校验 `oldText` 恰好出现一次，再派生完整 `proposedContent`；`create` 提供完整 `content`，目标已存在时拒绝。本阶段**不提供删除文件**。
- `propose_file_edit` 本身不写盘，只写入 `edit_sessions` / `file_edits` 并发送 `edit_proposed` 事件；同一请求（`conversationId + runId`）的多个文件归入同一编辑会话，单会话最多 20 个文件，同一文件只允许一条待审核建议。
- 审核界面位于工作区“变更与 Diff”面板，新增“AI 建议 / Git 变更”两个标签；AI 建议使用 Monaco Diff Editor（只读并排视图）展示 `originalContent` 与 `proposedContent`，逐文件应用或拒绝，并显示修改/新建、待审核/已过期状态。
- 应用前由 `EditService` 按仓库 ID + 相对路径重新校验；`modify` 复核 `original_hash`，`create` 复核目标不存在。哈希不一致或目标已存在时标记 `stale` 并返回 `FILE_CHANGED`，不覆盖磁盘；其他写入错误标记 `failed`。应用/拒绝后若会话内不再有 `proposed`/`stale` 文件，会话自动标记 `completed`。
- 应用成功后重新读取文件内容、打开对应标签并刷新 Git 状态；新建文件还会刷新文件树。目标文件存在未保存编辑时，应用前提示“将覆盖并丢弃这些修改”。
- 拒绝仅更新提案状态，不触碰磁盘。提案与内容只保存在本地 SQLite，可在重启后继续审核；不会因为保存提案而额外上传数据。

验证结果：

- `npm run format:check`、`npm run lint`、`npm run typecheck`、`npm run build` 通过。
- `npm test`：29 个测试文件、296 个用例通过（2 个“缺少 ripgrep”用例跳过）；阶段 6 新增 `EditService`（唯一匹配、创建冲突、文件上限、重复路径、应用成功、哈希过期、逐项结束会话、拒绝）、`propose_file_edit` 参数组合与事件、`ChatService` 的 `edit_proposed` 事件顺序，并更新系统提示词断言。
- 未覆盖：真实 DeepSeek 端到端修改建议依赖本地 Key 与额度；工作区 Diff 面板的人工验收随阶段 7 最终验收清单执行。

## 渲染层体验与体积优化（阶段 7 前，已完成）

- [x] Monaco 自定义入口与语言裁剪（84 → 32 个语法 chunk），首次打开文件时按需加载。
- [x] Element Plus 手动按需注册，移除全量 JS 与全量 CSS。
- [x] highlight.js 改为 `lib/core` + 显式注册 28 种常用语言。
- [x] AI 建议计数按当前仓库过滤；展开面板自动刷新；刷新/错误时保留既有列表。
- [x] 对话自动滚动（仅用户接近底部时）、错误提示可关闭、生成中提示、工具卡展开/收起文案。
- [x] Ctrl+S 仅在编辑器与页面级触发，不拦截对话输入框。
- [x] 主题对比度提升与 1080px 窄窗口布局调整。

实现要点：

- `services/monaco.ts` 以 `editor.api` 为核心自建入口，复制 `editor.main.js` 中除语言定义外的贡献注册，仅保留 32 种常用语言；codicon CSS 通过 `electron.vite.config.ts` 中的精确别名解析。`EditorArea` 首次打开文件时才动态导入 Monaco，AI 建议的 Diff 视图通过 `defineAsyncComponent` + `<Suspense>` 懒加载。
- `main.ts` 只注册实际使用的 Element Plus 组件与对应样式，语言包由 `App.vue` 的 `el-config-provider` 提供。
- `utils/markdown.ts` 使用 `highlight.js/lib/core` 注册 28 种语言，未注册语言回退为转义纯文本。
- AI 建议面板新增按当前仓库过滤的计数、展开时刷新、刷新中的轻量提示；计数归零时自动回到 Git 标签。“去审核”会先刷新待审核列表再选中首项。
- 对话列表仅在用户接近底部时自动滚动，发送新消息时强制滚到底部；消息容器增加 `role="log"` 与 `aria-live`。

构建对比（electron-vite 产物，未压缩大小）：

| 项目            | 优化前           | 优化后                                                              |
| --------------- | ---------------- | ------------------------------------------------------------------- |
| 入口 `index` JS | 1800.76 kB       | 233.99 kB                                                           |
| `WorkspaceView` | 2303.21 kB       | 80.02 kB                                                            |
| 入口 CSS        | 约 377 kB        | 98.46 kB                                                            |
| 语言语法 chunk  | 84 个            | 32 个                                                               |
| Monaco 核心     | 随工作区同步加载 | `editor.api` 5050.34 kB + 入口 chunk 2169.86 kB，首次打开文件时加载 |

验证结果：

- `npm run format:check`、`npm run lint`、`npm run typecheck`、`npm test`（29 个测试文件、296 个用例通过、2 个跳过）、`npm run build` 通过。
- 未覆盖：真实 Electron 窗口内的完整人工验收随阶段 7 最终验收清单执行。

## 多模型配置（阶段 7 前，已完成）

- [x] 应用内模型档案：新增、编辑、删除、切换全局当前模型，内置 DeepSeek / OpenAI / 通义千问 / Moonshot / 智谱 / SiliconFlow / Ollama / 自定义预设。
- [x] SQLite v3 迁移 `model_profiles`，部分唯一索引保证单一 active；删除 active 自动提升最近更新的剩余档案。
- [x] API Key 使用 Electron `safeStorage` 加密入库，Renderer/IPC 只返回 `hasApiKey`；留空更新保留旧 Key。
- [x] `.env` 降级为无档案或数据库不可用时的兜底。
- [x] 适配层重构：共用 `OpenAiCompatibleAdapter`，DeepSeek 与 OpenAI 兼容适配器仅负责创建底层模型。
- [x] 每个档案可关闭代码理解工具，同时作用于工具绑定与系统提示。
- [x] 设置页档案管理界面、预设联动、草稿连接测试、删除确认与状态摘要。
- [x] Base URL 安全校验（https / 本地回环 http / 拒绝内嵌凭据）。
- [x] 对话输入框工具栏快捷切换当前模型：与设置页同一全局语义，生成中禁用，失败回退；无档案时显示 `.env` 只读标签。

实现要点：

- 主进程使用可注入的 `SecretCipher`：生产实现调用 `safeStorage`（Windows DPAPI），测试注入 fake；只有 `ModelProfileService` 解密 Key，且结果只用于创建模型适配器。
- `ChatService` 新增 `configProvider`，由 `src/main/index.ts` 在数据库初始化后注入 `modelProfileService.resolveActive()`；无档案、DB 不可用时回退 `readAiConfigValues(process.env)`。
- `toolsEnabled=false` 时 `execute()` 同时使用空 ToolRegistry 与“未关联仓库/工具不可用”的系统提示，避免模型仍尝试工具。
- 设置页草稿测试通过 `resolveDraft()` 组合“显式 Key > 档案密文 > 空”，不落库；连接测试逻辑抽到 `connection-test.ts` 与对话连接测试共用。
- Element Plus 新增 `ElDialog` / `ElSwitch` 的组件注册与样式导入。

验证结果：

- `npm run format:check`、`npm run lint`、`npm run typecheck`、`npm test`（34 个测试文件、344 个用例通过、2 个跳过）、`npm run build` 通过。
- 新增测试：v3 迁移与索引、`ModelProfileStore` CRUD/单 active/删除提升/事务回滚、`ModelProfileService`（自动激活、空 Key 保留、密文不泄漏、`.env` 兜底、加密不可用、解密失败、草稿 Key 优先级）、OpenAI 适配器与工厂分派、Base URL/长度/uuid 的 Zod 规则、`ChatService` 的 `configProvider` 与 `toolsEnabled=false`、chat store 的配置加载/快捷切换/慢响应竞态。
- 未覆盖：真实 DPAPI 跨重启解密、真实模型档案切换与工具开关的 Electron 人工验收，需本机 Key；Playwright 设置页与对话模型切换冒烟已完成（静态产物 + mock），删光档案回退 `.env`、激活失败回退与深浅色样式均已验证。

## 阶段 7：稳定性与交付

- [ ] 补齐单元与集成测试。
- [ ] electron-builder Windows 安装包。
- [ ] better-sqlite3 原生模块打包验证。
- [x] ripgrep 随包分发：`@vscode/ripgrep` 内置 `rg`，支持 `DEV_PILOT_RG_PATH` 覆盖。
- [ ] 安装包内 `@vscode/ripgrep` 的 asarUnpack 配置与运行验证。
- [ ] README、安装、配置与安全说明完善。
- [ ] V1 最终验收清单逐项验证。

## 范围约束

V1 暂不实现：任意终端命令执行、未经确认的文件修改、多 Agent、向量数据库/RAG 平台、远程仓库管理、企业账号与权限、自动提交/推送/PR、自动执行测试或安装依赖。如需扩展，先提出设计变更。
