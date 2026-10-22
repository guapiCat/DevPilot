# DevPilot 安全说明

> 适用范围：V1（阶段 1–2 已实现部分与后续阶段计划）
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

## 2. 已实现措施（阶段 1–2）

- BrowserWindow 启用 `contextIsolation: true`、`sandbox: true`、`nodeIntegration: false`。
- 仅暴露 `app.getInfo`、`app.ping`、`settings.getAiConfigStatus` 三个具名能力。
- IPC 入参经 Zod 校验（`pingInputSchema`）。
- IPC 统一返回 `{ ok, data } | { ok, error: { code, message } }`，错误码稳定，渲染层统一解包。
- API Key 状态仅返回布尔值与模型/地址，**绝不返回 Key 内容**。
- `.env` 仅由主进程加载；加载器不打印配置值，只记录加载文件数量。
- `.env` 已加入 `.gitignore`；仓库内仅保留 `.env.example`。
- 页面禁止任意导航；新窗口请求一律拒绝，`https://` 链接交由系统浏览器打开。
- 未提供任意命令执行、自动提交/推送或工作区清理能力。
- 加载失败的 `.env` 会记录错误原因，不静默吞掉异常。
- `.env` 不存在属于正常状态，设置页明确展示“未配置”。

## 3. API Key 存储边界

V1 按项目决定使用本地 `.env`：

- 开发环境路径：项目根目录 `.env`。
- 打包后路径：Electron `userData` 目录下的 `.env`（Windows 通常为 `%APPDATA%\DevPilot`）。
- `.env` 是**明文本地文件**，不等同于 Windows 凭据管理器或系统密钥库。
- 已存在的进程环境变量不会被 `.env` 覆盖。
- Key 不写入数据库、日志、Renderer 持久化或前端构建产物。

后续如需更高安全等级，应评估 Electron `safeStorage` 或系统凭据存储，并明确迁移方式；这属于设计变更，需先评审。

## 4. 云端数据发送

阶段 4 接通 DeepSeek 后：

- 为回答代码问题，相关文件内容、搜索片段和对话内容会发送到所配置的云端模型。
- 传输内容可能离开本机，界面与 README 必须持续提示。
- 默认忽略 `.env`、私钥、证书、凭据文件和常见敏感配置，但过滤不可能保证识别所有秘密。
- 仓库中的 README、注释、Issue 文本等均视为**不可信数据**，不得覆盖系统提示与安全策略。
- 模型调用、工具参数与结构化输出必须经过运行时校验。

## 5. 计划中的文件与 Git 防护

阶段 3 / 6 实现时必须满足：

- 仓库必须由用户明确选择或来自已保存的可信配置，模型输出不能注册仓库。
- 使用仓库 ID + 相对路径访问文件；主进程规范化路径后做路径关系判断，禁止简单字符串前缀匹配。
- 防御 `../`、盘符/分隔符差异、大小写差异、符号链接逃逸、绝对路径和同名路径绕过。
- 单文件读取有大小上限；二进制文件不按 UTF-8 文本展示。
- 写入前重新校验路径、目标状态与原始文件哈希；哈希不一致标记 `stale`，禁止覆盖外部修改。
- 未确认的提案不修改磁盘；拒绝后文件保持不变。
- 多文件应用非原子时，逐文件展示成功/失败，不宣称整体成功。
- Git 命令使用参数数组执行，不拼接 shell；设置超时与输出上限；V1 仅只读操作。

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
- [ ] 路径穿越、符号链接逃逸测试（阶段 3）。
- [ ] 大文件与二进制文件处理（阶段 3）。
- [ ] 外部修改后旧提案拦截（阶段 6）。
- [ ] 未确认提案不改磁盘（阶段 6）。
- [ ] Windows 安装包中原生模块加载验证（阶段 7）。
