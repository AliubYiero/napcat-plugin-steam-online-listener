# 0002 · 仅群聊功能, 权限裁剪为三档, 会话级启停

## 状态

已采纳 (2026-10-18)

## 背景与问题

本插件的功能是"在某群里通知 Steam 好友的上线/下线", 天然是**群聊场景**的功能。最初的设计沿用了通用权限范式的四档模型 (`user < admin < privateUser < superAdmin`), 并对普通用户私聊也做响应, 带来三个问题:

1. `privateUser` (机器人好友的私聊用户) 对本插件没有业务价值——没有哪条指令是"只有好友私聊能用"的; 保留该档位只是徒增推导分支与帮助变体。
2. 对普通用户私聊做响应意味着要维护一套私聊帮助/应答, 但私聊在本插件里只应承担**管理通道**的职责 (超管下发管理命令)。
3. 插件级启停 (见 [0001](./0001-plugin-switch-and-command-prefix.md)) 交宿主后, 需要另有一个**会话级**开关来决定"哪些群启用本插件", 否则任意群被拉入都会触发轮询与推送。

## 被放弃的方案与理由

- **保留四档 + 私聊响应**: 需要为 `privateUser` 单独定义权限组与帮助变体, 收益为零而维护成本与文档面翻倍。
- **把会话启用状态放进全局配置 (`enabledGroups: string[]`)**: 群数量随使用无界增长, 又是运行期可变数据, 写进配置文件会让"全局配置"承担会话级数据的职责, 与配置范式的边界相悖。
- **对非超管私聊回复"本插件仅群聊可用"**: 与"权限不足静默 (防权限探测)"的反馈策略冲突, 且会为私聊增加应答面。

## 结论

- **仅群聊**: 一切面向用户的功能 (查询/绑定/报告) 仅在群聊生效。非超管私聊消息在接收层即被门禁静默忽略; 超管私聊是其专属的**管理通道** (承载 `group` / `admin` / `polling` 等管理命令)。
- **权限裁剪为三档**: `user(0) < admin(1) < superAdmin(2)`, 移除 `privateUser`。`admin` 来自群聊 `sender.role ∈ {owner, admin}`; `superAdmin` 来自配置名单 `adminUsers`。裁剪只减档位, 推导与线性比较机制不变 (见 [permission-pattern](../permission-pattern.md))。
- **触发方式固定为前缀**: 前缀内部常量 `COMMAND_PREFIX`; 不引入 `@机器人` (`atBot`) 触发形态, 也不提供 `triggerModes` 配置 (见 [instruction-pattern](../instruction-pattern.md))。
- **会话级启停由 store 承载**: 每个群的启用状态存在 `session-config.json` (`session-config.json` 的 `PluginSessionConfigStore`), **默认关闭**, 只有显式 `enabled === true` 的群才处理消息与推送。开关入口收敛在 `sessionConfigService` / WebUI 会话页。
- **帮助变体随之收敛**: `user` (群聊) → User 版, `admin` (群聊) → Admin 版, `superAdmin` (私聊) → SuperAdmin 版; 不再有 `privateUser` 对应的 Admin 版 (见 [help-output-pattern](../help-output-pattern.md))。

## 该决策约束的范式文档

- [permission-pattern.md](../permission-pattern.md) 的"角色标准模型与按形态裁剪"与"私聊作为管理通道"。
- [instruction-pattern.md](../instruction-pattern.md) 接收层的"会话门禁"与"固定前缀"。
- [help-output-pattern.md](../help-output-pattern.md) 的"变体映射"。
- [store-pattern.md](../store-pattern.md) 的会话级配置承载。
- `CONTEXT.md` 的"默认值语义声明" (会话默认关闭)。
