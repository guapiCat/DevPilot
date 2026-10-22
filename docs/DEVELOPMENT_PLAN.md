# DevPilot 开发计划与验收状态

> 开发基线：`docs/TECHNICAL_DESIGN.md`
> 更新时间：2026-10-22

## 当前进度

**阶段 1：工程骨架 — 已完成**
**阶段 2：基础 UI — 已完成**
**下一阶段：阶段 3：本地仓库与代码浏览**

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

## 阶段 3：本地仓库与代码浏览（下一步）

- [ ] RepositoryService：目录选择、路径校验、Git 仓库识别、仓库登记与持久化。
- [ ] SQLite + better-sqlite3：迁移、仓库/对话/编辑会话表、Electron ABI 重建验证。
- [ ] 路径安全：路径规范化、路径穿越、符号链接、盘符与大小写差异测试。
- [ ] 文件树与文件读取：大文件上限、二进制识别、BOM/换行处理。
- [ ] GitService：只读 `status` / `diff` / 分支信息，参数数组执行、超时与输出上限。
- [ ] Monaco Editor：文件查看与最小编辑展示，组件卸载时释放实例。
- [ ] 工作区接入真实仓库、文件树、Git 状态。
- [ ] 阶段 3 单元/集成测试与手工验收。

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
