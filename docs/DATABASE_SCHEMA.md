# DevPilot 数据库表结构

> 适用范围：V1（阶段 1–5 已实现部分与后续阶段预留表）
> 事实来源：`src/main/database/database.ts` 的迁移定义
> 相关文档：[TECHNICAL_DESIGN.md](TECHNICAL_DESIGN.md)、[ARCHITECTURE_DECISIONS.md](ARCHITECTURE_DECISIONS.md)（ADR-011、ADR-012、ADR-013）、[SECURITY.md](SECURITY.md)

## 1. 数据库位置与连接

- 文件：Electron `userData` 目录下的 `devpilot.db`（Windows 通常为 `%APPDATA%\DevPilot\devpilot.db`），另有 WAL 日志 `devpilot.db-wal` 与共享内存文件 `devpilot.db-shm`。
- 驱动：`better-sqlite3` 13（N-API 预编译），仅在主进程使用；Renderer 无数据库访问能力。
- 打开时设置：
  - `journal_mode = WAL`：读写并发更好，异常退出时可恢复。
  - `foreign_keys = ON`：SQLite 默认关闭外键，必须显式启用。
  - `busy_timeout = 5000`：遇到锁时最多等待 5 秒。
- 应用启动时打开并迁移；退出时（`will-quit`）关闭连接。
- 初始化失败不会阻断启动，只是本次运行不持久化仓库与对话信息（内存模式）。
- 阶段 4 起写入仓库、会话与消息；阶段 5 起为 assistant 消息写入工具调用摘要；`edit_sessions`、`file_edits` 仍为阶段 6 预留。

## 2. 迁移机制

迁移定义在 `src/main/database/database.ts` 的 `MIGRATIONS` 数组中，当前为 v2。

```text
user_version = 0 ──MIGRATIONS[0]──▶ 1 ──MIGRATIONS[1]──▶ 2
```

v2 内容：`ALTER TABLE messages ADD COLUMN tool_calls TEXT;`，用于保存工具调用摘要，不改动既有数据。

规则：

- 每个迁移是一个接收 `Database` 的函数，在一个事务中执行，执行成功后才写入 `user_version`。
- 已发布的迁移**只追加、不修改**；改表结构必须新增迁移函数。
- `SCHEMA_VERSION = MIGRATIONS.length`，测试据此断言当前版本。
- 迁移中途失败会回滚该版本并抛出异常，`openDatabase` 关闭连接后由主进程降级为内存模式。

新增迁移的写法：

```ts
const MIGRATIONS: readonly Migration[] = [
  (db) => {
    /* v1，已发布，保持不变 */
  },
  (db) => {
    // v2：为 assistant 消息增加工具调用摘要列
    db.exec('ALTER TABLE messages ADD COLUMN tool_calls TEXT;')
  }
]
```

## 3. 实体关系

```text
repositories
  │ 1
  ├──────────< conversations        repository_id → SET NULL
  │                  │ 1
  │                  ├──< messages    conversation_id → CASCADE
  │                  │
  │                  └──< edit_sessions (conversation_id → SET NULL)
  │
  └──────────< edit_sessions         repository_id → CASCADE
                     │ 1
                     └──< file_edits  edit_session_id → CASCADE
```

删除仓库时的实际效果：

- `conversations` 保留，`repository_id` 置为 `NULL`（历史对话不因仓库移出列表而丢失）。
- `edit_sessions` 与 `file_edits` 级联删除（编辑提案绑定具体仓库，仓库不存在后无法再应用）。
- `messages` 随所属对话一直保留。

这种不对称是刻意的：对话是长期知识，编辑会话是绑定仓库的临时提案。

## 4. 表定义

### 4.1 repositories — 已登记仓库

用于跨启动恢复仓库列表；阶段 3 起写入，阶段 4 起与对话表共同使用。

| 列           | 类型 | 约束        | 说明                                     |
| ------------ | ---- | ----------- | ---------------------------------------- |
| `id`         | TEXT | PRIMARY KEY | 应用生成的 UUID，IPC 与文件操作使用该 ID |
| `name`       | TEXT | NOT NULL    | 目录名，用于界面展示                     |
| `path`       | TEXT | NOT NULL    | `realpath` 规范化后的绝对路径            |
| `created_at` | TEXT | NOT NULL    | 首次登记时间（ISO 8601 UTC）             |
| `updated_at` | TEXT | NOT NULL    | 最近使用时间，用于倒序排列               |

索引：`idx_repositories_updated_at (updated_at DESC)`。

注意：`path` 没有唯一约束；登记时的去重由应用层完成（内存 registry 做不区分大小写的路径比较）。数据层提供 `findByPath()`（`WHERE path = ? COLLATE NOCASE`）供需要时使用，当前仅由单元测试覆盖。

写入路径：`RepositoryService.register()` 新目录调用 `insert`，重复登记调用 `touch` 刷新 `updated_at`。

### 4.2 conversations — 对话（阶段 4 已使用）

| 列              | 类型 | 约束                                              | 说明                   |
| --------------- | ---- | ------------------------------------------------- | ---------------------- |
| `id`            | TEXT | PRIMARY KEY                                       | UUID                   |
| `repository_id` | TEXT | FK → `repositories(id)`，可空，ON DELETE SET NULL | 对话关联的仓库         |
| `title`         | TEXT | NOT NULL                                          | 会话标题               |
| `created_at`    | TEXT | NOT NULL                                          | 创建时间               |
| `updated_at`    | TEXT | NOT NULL                                          | 最近更新时间，用于排序 |

索引：`idx_conversations_repository (repository_id, updated_at DESC)`。

写入路径：`ChatService.createConversation()` 插入标题为“新会话”的空会话（可关联已登记仓库）；首条用户消息写入时，`ChatStore.appendUserMessage()` 在同一事务内把标题更新为消息前 30 个字符（空白折叠）；每次写入消息都会刷新 `updated_at`，列表按 `updated_at DESC, rowid DESC` 排序。

### 4.3 messages — 消息（阶段 4 已使用，阶段 5 起含工具摘要）

| 列                | 类型 | 约束                                                  | 说明                   |
| ----------------- | ---- | ----------------------------------------------------- | ---------------------- |
| `id`              | TEXT | PRIMARY KEY                                           | UUID                   |
| `conversation_id` | TEXT | NOT NULL，FK → `conversations(id)`，ON DELETE CASCADE | 所属对话               |
| `role`            | TEXT | NOT NULL                                              | 消息角色（应用层约定） |
| `content`         | TEXT | NOT NULL                                              | 消息正文               |
| `created_at`      | TEXT | NOT NULL                                              | 创建时间               |
| `tool_calls`      | TEXT | 可空（v2 新增）                                       | 工具调用摘要 JSON 数组 |

索引：`idx_messages_conversation (conversation_id, created_at)`，按对话读取时保持时间顺序。

`tool_calls` 的 JSON 结构（每个元素）：

```json
{
  "id": "call_1",
  "name": "read_file",
  "argumentsSummary": "src/main/index.ts 1-40",
  "status": "success",
  "summary": "读取 40 行",
  "durationMs": 12
}
```

- `argumentsSummary` 与 `summary` 是服务端生成的短摘要，长度分别为 ≤120 / ≤160 字符。
- 读取时用 `toolCallsSchema.safeParse` 校验；JSON 损坏或字段超限时降级为 `undefined`，不抛异常、不打印内容。
- 不保存工具输出正文、文件内容、搜索片段或 Git Diff。

写入规则：

- 用户消息在发起模型请求前同步写入；模型请求失败或未配置 Key 时不写入用户消息（配置错误在写入前抛出）。
- assistant 消息只在流正常完成且文本非空时写入；有工具调用时把摘要一并写入。
- 用户取消、超时或模型错误时不写入部分回答，也不写入工具摘要；界面上的部分文本与工具状态仅存在于 Renderer 内存。
- 模型上下文通过 `listRecentMessages(limit)` 读取最近 20 条，再按 24k 字符上限裁剪；历史消息中的 `toolCalls` 不进入模型上下文。
- `role` 应用层只写入 `user` / `assistant`；历史裁剪会排除其他角色。

### 4.4 edit_sessions — AI 编辑会话（阶段 6 使用）

| 列                | 类型 | 约束                                                 | 说明                   |
| ----------------- | ---- | ---------------------------------------------------- | ---------------------- |
| `id`              | TEXT | PRIMARY KEY                                          | UUID                   |
| `conversation_id` | TEXT | FK → `conversations(id)`，可空，ON DELETE SET NULL   | 产生该提案的对话       |
| `repository_id`   | TEXT | NOT NULL，FK → `repositories(id)`，ON DELETE CASCADE | 提案目标仓库           |
| `status`          | TEXT | NOT NULL                                             | 会话状态（应用层约定） |
| `created_at`      | TEXT | NOT NULL                                             | 创建时间               |
| `updated_at`      | TEXT | NOT NULL                                             | 最近更新时间           |

索引：

- `idx_edit_sessions_conversation (conversation_id, updated_at DESC)`
- `idx_edit_sessions_repository (repository_id, updated_at DESC)`

### 4.5 file_edits — 逐文件编辑提案（阶段 6 使用）

| 列                 | 类型 | 约束                                                  | 说明                                      |
| ------------------ | ---- | ----------------------------------------------------- | ----------------------------------------- |
| `id`               | TEXT | PRIMARY KEY                                           | UUID                                      |
| `edit_session_id`  | TEXT | NOT NULL，FK → `edit_sessions(id)`，ON DELETE CASCADE | 所属编辑会话                              |
| `relative_path`    | TEXT | NOT NULL                                              | 仓库内相对路径（POSIX 分隔符）            |
| `operation`        | TEXT | NOT NULL                                              | 操作类型（应用层约定，如 modify/create）  |
| `original_content` | TEXT | 可空                                                  | 原文件内容；新建文件时为空                |
| `proposed_content` | TEXT | NOT NULL                                              | 提议写入的内容                            |
| `original_hash`    | TEXT | NOT NULL                                              | 读取时的 SHA-256，用于写入前复核目标状态  |
| `status`           | TEXT | NOT NULL                                              | 提案状态（如 proposed / applied / stale） |
| `created_at`       | TEXT | NOT NULL                                              | 创建时间                                  |
| `updated_at`       | TEXT | NOT NULL                                              | 最近更新时间                              |

索引：`idx_file_edits_session (edit_session_id)`。

`original_hash` 是阶段 6 的核心防护字段：应用提案前重新计算磁盘文件哈希，与记录不一致时标记 `stale`，禁止覆盖外部修改。

## 5. 索引汇总

| 索引名                           | 表            | 列                                 | 用途               |
| -------------------------------- | ------------- | ---------------------------------- | ------------------ |
| `idx_repositories_updated_at`    | repositories  | `updated_at DESC`                  | 最近使用仓库排序   |
| `idx_conversations_repository`   | conversations | `repository_id, updated_at DESC`   | 按仓库列会话       |
| `idx_messages_conversation`      | messages      | `conversation_id, created_at`      | 按会话顺序读消息   |
| `idx_edit_sessions_conversation` | edit_sessions | `conversation_id, updated_at DESC` | 按对话查编辑会话   |
| `idx_edit_sessions_repository`   | edit_sessions | `repository_id, updated_at DESC`   | 按仓库查编辑会话   |
| `idx_file_edits_session`         | file_edits    | `edit_session_id`                  | 按会话读逐文件提案 |

## 6. 代码接入与数据访问

| 模块                                       | 职责                                                                             |
| ------------------------------------------ | -------------------------------------------------------------------------------- |
| `src/main/database/database.ts`            | 打开数据库、设置 PRAGMA、执行 `user_version` 迁移                                |
| `src/main/database/repository.store.ts`    | 仓库表 SQL：`list` / `findByPath` / `insert` / `touch`                           |
| `src/main/database/chat.store.ts`          | 会话/消息表 SQL：列表、插入、标题生成、工具摘要 JSON、最近消息读取（全部参数化） |
| `src/main/services/repository.service.ts`  | 业务层：启动时 `initialize(store)` 读入内存，登记时写库，异常转 `DATABASE_ERROR` |
| `src/main/services/chat.service.ts`        | 业务层：会话创建、发送/重试/取消、Agent 循环、流式与工具事件、错误映射、连接测试 |
| `src/main/index.ts`                        | 生命周期：启动打开并迁移，初始化两个 Store，`will-quit` 取消请求后关闭连接       |
| `src/main/ipc/*`                           | 通过 service 间接访问，不直接接触连接                                            |
| `src/renderer/src/services/desktop-api.ts` | 经 IPC 调用 `repository.list()` / `chat.send()` 等，无数据库能力                 |

设计约定：

- SQL 只出现在 `*.store.ts`，其他层不拼 SQL。
- 全部使用 `better-sqlite3` 参数化语句，不拼接用户输入。
- 数据库列名用 `snake_case`，TypeScript 记录对象用 `camelCase`，由 Store 的 `toRecord` 映射。
- 时间统一存 ISO 8601 UTC 字符串，排序直接使用字符串比较。
- ID 统一为 UUID 字符串，由主进程生成。
- 不保存 API Key、普通文件内容、工具输出正文或 Git 命令输出；当前保存仓库元数据、会话、消息与工具调用摘要。

## 7. 常用查询

```sql
-- 最近使用的仓库
SELECT id, name, path, created_at, updated_at
FROM repositories
ORDER BY updated_at DESC;

-- 按路径查找（不区分大小写）
SELECT id, name, path, created_at, updated_at
FROM repositories
WHERE path = ? COLLATE NOCASE;

-- 某仓库下的对话
SELECT id, title, updated_at
FROM conversations
WHERE repository_id = ?
ORDER BY updated_at DESC;

-- 按时间顺序读取某会话消息（含工具调用摘要）
SELECT id, role, content, created_at, tool_calls
FROM messages
WHERE conversation_id = ?
ORDER BY created_at, rowid;

-- 读取最近 N 条消息作为模型上下文（应用层再按字符数裁剪）
SELECT id, role, content, created_at
FROM messages
WHERE conversation_id = ?
ORDER BY created_at DESC, rowid DESC
LIMIT ?;
```

## 8. 与阶段计划的对应关系

| 表              | 当前状态 | 使用阶段 |
| --------------- | -------- | -------- |
| `repositories`  | 已使用   | 阶段 3   |
| `conversations` | 已使用   | 阶段 4   |
| `messages`      | 已使用   | 阶段 4–5 |
| `edit_sessions` | 未写入   | 阶段 6   |
| `file_edits`    | 未写入   | 阶段 6   |

验收覆盖：迁移幂等、5 张表与 6 个索引、v1→v2 升级保留旧数据、外键非法引用、删除仓库的 `SET NULL` / `CASCADE`、参数化 SQL 与跨重启恢复，见 `tests/unit/main/database.test.ts`；会话排序、消息顺序、首条标题、`updated_at` 刷新、`tool_calls` JSON 往返与损坏容错、跨重启恢复见 `tests/unit/main/chat.store.test.ts`。
