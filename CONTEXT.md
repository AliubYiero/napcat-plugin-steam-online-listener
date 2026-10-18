# CONTEXT — 领域术语表

本文件是领域术语的唯一权威。新术语在概念定型时即写入此处, 与代码冲突时先校对再改。范式体系的引用见 [docs/development-pattern.md](docs/development-pattern.md) 的"领域建模纪律"。

## 术语

### 全局状态单例 (pluginState)

进程内唯一的全局状态对象, 持有 ctx (nullable)、config、data 目录 JSON 读写、logger 与定时器注册表。构造期零 IO, 真正的初始化发生在 `plugin_init(ctx)` 调用其 `init(ctx)` 时。
_Avoid_: "全局变量""context 单例"——它不是裸全局变量, 也不是 ctx 本身。

### 延迟实例化 (lazy instantiation)

store 单例不在模块加载期创建, 而是推迟到业务代码首次调用 `getInstance()` 时。目的: 保证任何文件 IO 都发生在 `plugin_init` 之后。
_Avoid_: "导出即初始化""饿汉单例"——在本框架下属于反模式。

### 字段描述符 (FIELDS)

配置的唯一声明源: 一个 ctx-free 的字段数组, 每项声明 `kind` / `label` / `description` / `default`。配置接口类型、默认值、清洗与两套 WebUI (宿主自动面板 + 自定义前端表单) 全部由它派生; 新增配置项只改这一处。范式见 [docs/webui-config-pattern.md](docs/webui-config-pattern.md)。
_Avoid_: "配置表""schema 文件"——它不是某个校验库的 schema, 也不是某一种 UI 的专属定义, 而是同时驱动两套 UI 的声明源。

### 字段可见范围 (field scope)

字段描述符上的可选 `scope`: `webui` (仅自建前端) / `panel` (仅 NapCat 原生自动面板) / `both` (默认)。**只影响呈现所在界面, 不影响清洗与落盘**。
_Avoid_: 当成"字段是否生效的开关"——它不控制字段是否被保存或读取, 只控制渲染在哪个界面。

### 展示块占位符 (display token)

`display` 字段 `content` 里以 `{{...}}` 声明的动态值 (插件显示名 / 描述 / 拓展页地址), 由前后端各自解析 (后端用 ctx 插件信息, 前端用构建期注入身份)。**未命中回退空串, 注入值做 HTML 转义**。常量与解析纯函数见 `packages/shared/src/displayTokens.ts`。
_Avoid_: "模板引擎"——它只是固定若干 token 的字符串替换, 不是一个通用模板系统。

### 指令定义 (InstructionDefinition)

注册表中的一条指令声明: handler + 可选的 `requiredRole` / `scope` / `scopeRules`。分发层在调用 handler 前完成全部校验。
_Avoid_: "命令对象"——不是命令模式, 只是声明式配置。

### 角色推导 (role derivation)

在消息入口处由消息事件一次性推导出发送者角色 (superAdmin / admin / user), 而非为每个用户配置权限。本项目为**三档**, 裁剪掉了通用范式里的 `privateUser` (见 [ADR 0002](docs/adr/0002-group-only-and-session-config.md))。`superAdmin` 来自配置名单, `admin` 来自群聊 `sender.role ∈ {owner, admin}`, 其余为 `user`。
_Avoid_: "权限配置""用户等级"——角色不是配置项, 也没有等级成长概念。

### 机器人群身份 (bot group role)

机器人自身在某个群内的角色 (`owner` / `admin` / `member`)。**不在消息事件里**, 只能通过 `get_group_member_info` 查 `pluginState.selfId` 得到; 与 `角色推导` (发起人) 并列, `isBotAdmin` 是它的布尔化判定 (owner/admin), 失败即拒 (fail-closed)。本项目未使用 @全体成员 与触发式 @机器人, 故 `isBotAdmin` 目前无调用点, 保留为通用能力。
_Avoid_: "机器人权限""机器人白名单"——它是运行时查到的平台身份事实, 不是配置项; 且 @全体成员 的机器人资格以 `can_at_all` 为准, 本判定不作替代。

### 指令前缀 (COMMAND_PREFIX)

触发指令的固定前缀 (取值 `#steam`), 是插件内部常量 (`packages/shared/src/config.ts`), **不是配置项**。接收层用 `resolveCommandArgs` 判定消息是否以此前缀开头。本项目**不支持** `@机器人` 触发 (无 `atBot`), 也不提供 `triggerModes` 之类的触发配置 (见 [ADR 0001](docs/adr/0001-plugin-switch-and-command-prefix.md))。
_Avoid_: "触发方式""at 触发"——本项目只有单一前缀形态; 前缀内部化, 用户不可改。

### 分发判定 (DispatchDecision)

分发层对一条指令请求给出的三态结论: 静默 / 作用域提示 / 执行。判定本身是纯函数 (`resolveDispatch`), 三态的分支依据是"权限不足与未知指令静默, 作用域不符回复提示"的不对称反馈策略。
_Avoid_: "权限校验结果"——判定不只含权限, 还含作用域与参数形态匹配。

### 超管名单 (adminUsers)

三档角色中唯一需要人工配置的档位载体。配置时以英文逗号分隔输入, 清洗期一次性解析为 `string[]`, 运行期只做包含检查。名单没有"降权"指令: 移除超管 = 从配置中删去其 QQ 号。
_Avoid_: "管理员列表""白名单"——它只是 `superAdmin` 一档的来源, 群管理员 (`admin`) 由平台身份推导, 不在此名单中。

### 会话级配置 (SessionConfig)

每个群的配置项, 定位字段为 `id` (群号) + `type` (本项目仅 `group`)。由 store 承载 (独立数据文件 `session-config.json`), **不**放进插件配置文件; 读写统一经 `sessionConfigService` 单一入口。
_Avoid_: "群配置""GroupConfig""groupConfigs"——旧称指配置文件中按群号索引的嵌套配置, 已被本术语取代。

### 会话级开关 (session enabled switch)

会话级配置中的启用开关, 判定式 `enabled === true` (严格判定, 缺失即禁用)。默认关闭是领域决策: 插件被拉入任意群后不会自动响应, 须显式开启 (与权限范式的 fail-closed 一致)。
_Avoid_: "默认开启、零配置可用"的表述——与本项目的默认值语义相反。

### 帮助变体 (help variant)

帮助输出的版本档位 (`user` / `admin` / `superAdmin`), 由"角色 + 会话类型"共同决定, 与权限档位不是一一对应 (群聊超管输出 Admin 版, 私聊超管才见 SuperAdmin 版)。
_Avoid_: 把"权限档位"直接当"帮助版本"用——两者计数相同但映射不同。

### Steam 绑定 (steamBind)

一条"Steam ID ↔ QQ 用户"的绑定记录, 以 `fromId` (群号) + `steamId` 定位。用户绑定后, 该 Steam 好友的上线/下线状态变化会被通知到对应会话。数据存于 `steam-bind-data.json`, 由 `steam-bind.service.ts` 读写。
_Avoid_: "订阅""关注"——本项目术语统一用"绑定 (bind)"。

### 游戏名 (gameName)

Steam appid 与游戏显示名的映射 (`appid → { en, zh? }`): 英文名为基础, 中文名为可选覆盖。用于把状态里的原始游戏名展示为更可读的名称。数据存于 `steam-game-names.json`, 由 `game-name.service.ts` 读写。
_Avoid_: "别名""备注"——它是游戏维度的名称映射, 不是用户维度的自定义。

### 状态日志 (status log)

按天记录的状态变更流水 (上线/下线等), 落入 `steam-status-log-YYYY-M-D.json`, 7 天后自动归档为 ZIP 到 `archives/`。日期一律按中国时区 (Asia/Shanghai) 计算。`report` 指令据此生成今日/昨日报告。
_Avoid_: "历史""记录"——它是按天分片、可归档的流水, 不是数据库式的历史表。

### 通知状态类型 (notifyStatusTypes)

配置项, 声明哪些 Steam 状态变化会触发推送 (如上线、下线、开始游戏等)。多选, 清洗后为类型数组。只影响"推送哪些状态", 不影响状态日志的完整记录。
_Avoid_: "监听类型""开关"——它是状态类型的多选集合, 不是单一开关。

## 默认值语义声明

- 插件级全局启停: **交 NapCat 宿主** (`setPluginStatus`)。插件配置文件**不含** `enabled` 之类全局开关, 避免与宿主状态形成两个真相源。
- 会话级启用开关: **默认关闭** (严格 `enabled === true`, 缺失即禁用)。新群须在 WebUI 的会话管理页显式开启。
- 指令前缀: **固定为 `#steam`** (`COMMAND_PREFIX`, 插件内部常量, 不暴露给用户修改)。
- 指令触发方式: 仅**固定前缀**一种形态, 无 `triggerModes` 配置项, 不支持 `@机器人` 触发。
- 超级管理员名单 (`adminUsers`): 默认**空数组** (无人是超管)。该字段无启用/关闭语义, 不适用宽松判定。
- 轮询间隔 (`pollingIntervalSeconds`): 默认值见 `FIELDS`, 范围 10–3600 秒, 运行期可改 (reactive)。10/15/30/60 秒走墙钟对齐 (0/10/…、0/15/…、0/30、整分钟), 其余间隔为"本轮完成后延时一个间隔"。
- 通知状态类型 (`notifyStatusTypes`): 默认值见 `FIELDS`, 运行期可改 (reactive)。

新增有默认值语义的配置项时, 在此处声明选择及理由; 难逆转的补 ADR (判据见 [docs/development-pattern.md](docs/development-pattern.md) 的"ADR 纪律")。
