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

**影响**：重启应用后需重新选择仓库；代码只读、无语法高亮与 Git 变更视图。SQLite 原生模块 ABI 与打包验证留待后续增量。错误码新增 `FILE_NOT_FOUND`、`UNSUPPORTED_FILE`。
