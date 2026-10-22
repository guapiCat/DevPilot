# DevPilot 开发计划与验收状态

> 开发基线：`docs/TECHNICAL_DESIGN.md`
> 更新时间：2026-10-22

## 当前进度

**阶段 1：工程骨架 — 已完成**
**阶段 2：基础 UI — 已完成**
**阶段 3：本地仓库与代码浏览 — 部分完成（仓库选择、文件树、Monaco 编辑与手动保存、只读 Git status/diff）**
**下一步：SQLite 持久化**

> 说明：为尽快打通“选择真实仓库并浏览/修改代码”，阶段 3 先实现了目录选择、路径安全、文件树、
> Monaco 编辑、手动保存与只读 Git status/diff；SQLite 持久化留待后续增量。

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

## 阶段 3：本地仓库与代码浏览（部分完成）

- [x] RepositoryService：系统目录选择、路径校验、Git 仓库识别、会话内仓库登记与切换。
- [ ] SQLite + better-sqlite3：迁移、仓库/对话/编辑会话表、Electron ABI 重建验证。
- [x] 路径安全：`realpath` 规范化、路径关系判断；路径穿越、绝对/盘符路径、符号链接逃逸测试。
- [x] 文件树与文件读取：5000 项上限、1 MB 读取上限、二进制识别、UTF-8/BOM 处理。
- [x] GitService：只读 `status` / `diff` / 分支信息；`spawn` 参数数组、`shell: false`、10 秒超时、5 MB 输出上限、512 KB Diff 截断；porcelain v1 `-z` 解析暂存/未跟踪/换名/冲突；未跟踪文件生成新增 Diff，未提交仓库以空树为基线。
- [x] Monaco Editor：代码查看与编辑、按扩展名语言识别与语法高亮；模型按文件复用，关闭标签或卸载组件时释放实例。
- [x] 手动保存：`Ctrl+S` / 保存按钮写回原文件；保存前复核路径、仓库范围与 SHA-256 哈希；外部修改返回 `FILE_CHANGED` 并提示重新加载；保留 BOM、1 MB 上限、拒绝空字符、临时文件原子替换。
- [x] 未保存修改提示：关闭标签、切换仓库、离开工作区、退出应用。
- [x] 工作区接入真实仓库与文件树，支持 Monaco 编辑与手动保存，并在状态栏展示分支/变更数。
- [x] 变更与 Diff 面板：变更列表（状态标记、暂存标记）、选择文件展示相对 `HEAD` 的统一 Diff、加载/空/错误状态、刷新、在编辑器中打开；保存文件后自动刷新 Git 状态。
- [x] 阶段 3 单元测试：路径安全、文件树、文件读写、Git status/diff（真实临时仓库）、Schema 校验与语言映射（86 个用例）。

验证结果（本次已实现部分）：

- `npm run lint`、`npm run format:check`、`npm run typecheck`、`npm run build` 通过。
- `npm test`：10 个测试文件、86 个用例全部通过。
- `npm run dev` 手工验证：通过系统目录对话框选择真实仓库；包含中文路径的仓库可正常登记、浏览与读取；文件树忽略 `.git` / `node_modules`；README 与 TypeScript 文件在 Monaco 中显示行号、语法高亮与 UTF-8 元信息；二进制文件显示“二进制文件不支持文本预览”。
- 手动保存验证：开发模式渲染层（Playwright + 预加载 API mock）验证编辑后的未保存标记、`Ctrl+S` 传递的仓库/路径/内容/哈希、保存后状态复位、`FILE_CHANGED` 冲突对话框与重新加载、关闭脏标签与离开工作区的未保存提示；`FileService` 对真实临时目录的写入、BOM、哈希冲突、大小、空字符与路径安全由 Vitest 覆盖。
- Git 验证：`GitService` 在真实临时仓库上覆盖分支读取、修改/新增/未跟踪/换名/删除状态、相对 `HEAD` 与空树基线的 Diff、未跟踪文件新增 Diff、512 KB 截断、非 Git 仓库、未登记仓库与路径穿越；渲染层（Playwright + 预加载 Git API mock）验证变更列表、Diff 颜色分类、截断提示、错误重试与“在编辑器中打开”。
- 未验证（未实现）：SQLite 持久化。
- 待补充：真实 Electron 窗口中选择仓库后手动保存与 Git 面板的人工验收，随阶段 7 最终验收清单执行。
- Monaco 集成验证：开发模式下 TS/CSS/HTML/JSON Worker 均正常加载；生产构建通过 `file://` 加载时 Monaco 正常渲染、Worker 成功启动且无控制台错误；多标签切换、关闭全部标签后回到空状态、重新打开文件均正常。

## 阶段 4：AI 对话

- [ ] DeepSeek 配置与 `ModelAdapter` 适配层。
- [ ] LangChain.js 接入边界与流式事件转换。
- [ ] 流式聊天、停止生成、请求超时与取消。
- [ ] 会话/消息持久化。
- [ ] 错误码映射、重试入口与安全日志。
- [ ] 设置页“连接测试”启用。

## 阶段 5：代码理解工具

- [ ] Tool Registry 与 Zod 参数校验。
- [ ] `list_files`、`read_file`、`search_code`、`get_git_status`、`get_git_diff`。
- [ ] Agent 执行循环：轮数限制、工具超时、输出上限、循环保护。
- [ ] 上下文裁剪、敏感文件过滤、仓库内容提示注入防护。
- [ ] 工具执行事件展示。

## 阶段 6：Diff 修改闭环

- [ ] `propose_file_edit` 工具与编辑会话持久化。
- [ ] Monaco Diff Editor 与逐文件审核状态。
- [ ] 拒绝 / 确认应用流程。
- [ ] 写入前路径、目标状态与原始哈希复核；外部修改标记 `stale`。
- [ ] 多文件部分失败时准确展示成功/失败结果。
- [ ] 应用后刷新文件预览与 Git 状态。

## 阶段 7：稳定性与交付

- [ ] 补齐单元与集成测试。
- [ ] electron-builder Windows 安装包。
- [ ] better-sqlite3 原生模块打包验证。
- [ ] ripgrep 随包分发或安装检测方案验证。
- [ ] README、安装、配置与安全说明完善。
- [ ] V1 最终验收清单逐项验证。

## 范围约束

V1 暂不实现：任意终端命令执行、未经确认的文件修改、多 Agent、向量数据库/RAG 平台、远程仓库管理、企业账号与权限、自动提交/推送/PR、自动执行测试或安装依赖。如需扩展，先提出设计变更。
