# NapCat 插件指令分发范式

本文是适用于任意 NapCat 插件项目的指令分发通用范式, 覆盖从消息接收到指令执行的完整链路: 会话门禁、前缀检查、参数切词、注册表分发、作用域校验。各项目遵循此范式时, 应将消息接收入口与指令注册表分别放在独立的 handler 模块中。强度档位 (必须/应该/可以) 见 [development-pattern.md](./development-pattern.md) 的"规范强度分级"。

角色的推导与比较不在本文范围, 已抽离为 [permission-pattern](./permission-pattern.md); 发送消息的工具函数规范见 [message-send-pattern](./message-send-pattern.md)。分发层只负责**何时校验、如何反馈**, 不重复实现角色判定。

## 核心约束

1. 【必须】**四层链路, 各层只做自己的事**: 接收层不认识指令语义, 分发层不做业务, 执行层不再做权限校验。业务 handler 收到的参数已保证满足角色与作用域要求, 可直接执行。
2. 【必须】**校验在分发层统一完成**: 角色的推导与比较能力由权限模块提供 (见 [permission-pattern](./permission-pattern.md)), 但**校验时机与失败反馈收敛在分发层**。权限检查散落在接收层或 handler 内会随指令增多而失控。
3. 【必须】**校验失败反馈不对称是设计而非偶然**: 权限不足与未知指令静默 (防权限探测), 作用域不符回复提示 (可用性)。
4. 【必须】**触发方式固定为前缀**: 指令前缀是插件内部常量 (`COMMAND_PREFIX`, 固定值), 不暴露为配置项; 接收层据此判定消息是否触发并取出前缀之后的参数。判定逻辑抽为独立纯函数, 接收层不内联匹配。

## 范式正文

### 一、接收层: handleMessage

接收层职责固定为四步, 顺序不可调换:

1. 【必须】**会话门禁**: 在触发判定之前先按会话类型短路。本项目为**纯群聊功能**, 门禁规则为——群聊需该群已在会话配置中显式启用 (默认关闭), 仅超级管理员可用作管理通道的私聊放行, 其余一律静默返回 (先于触发判定, 避免在不可用会话里做无谓的字符串处理)。
2. 【必须】**触发判定**: 判定消息是否以固定前缀 (`COMMAND_PREFIX`) 开头、并取出前缀之后的参数文本; 未命中一律静默返回。前缀不匹配是绝大多数消息的正常路径, **不回复、不记日志** (见 1.1)。
3. 【必须】**切词**: 参数文本 `trim().split(/\s+/)` 得到参数数组。空串会切出 `['']`, 由分发层的参数检查兜底。
4. 【必须】**分发**: 在入口处一次性推导角色 (`getUserRole(event)`), 将参数数组与角色一起交给分发层, 保证分发层与 handler 复用同一个 `UserRole`。

要点:

- 【必须】整个 `handleMessage` 包在 try/catch 中, 任何异常记日志不外抛——它是所有消息事件的入口, 异常外抛会影响插件宿主。
- 【必须】前缀来自插件内部常量 (固定值); 会话启用状态来自 store。二者均不暴露为配置项。
- 【必须】接收层**不做权限校验**。权限属于指令语义, 由分发层统一处理。
- 【必须】会话门禁是**会话级策略**, 与权限推导分开: 接收层先按会话类型短路 (群聊查启用, 私聊查 `isSuperAdmin`), 再把放行的消息交给统一分发。
- 【应该】触发判定抽为独立纯函数, 接收层负责调用; 保持静默, 不记日志。

#### 1.1 指令触发: 固定前缀 (prefix)

本项目只支持**单一触发形态**: 消息以固定前缀 `COMMAND_PREFIX` (取值 `#steam`) 开头 —— `#steam 指令 参数`。

- 【必须】前缀是**插件内部常量**, 不提供 `triggerModes` 之类的配置项。理由: 纯群聊机器人的触发面越窄越好, 且前缀内部化后可随插件演进统一调整 (见 [development-pattern](./development-pattern.md) 的 ADR 纪律与 [adr/0001](./adr/0001-plugin-switch-and-command-prefix.md))。
- 【必须】不支持 `@机器人` 触发 (无 `atBot` 形态)。若未来需要, 再按需引入, 不在当前范围内。
- 【必须】命中条件: 消息 `trim()` 后以 `COMMAND_PREFIX` 开头。
- 【必须】命中返回**前缀之后的参数文本** (交接收层切词); 未命中返回 `null`。
- 【必须】参数文本不在此处 `trim()`——整体 `trim()` 与切词由接收层承担, 触发判定只负责"是否命中 + 取余下文本"。

**实现**

【应该】将判定抽为独立纯函数模块, 导出单一函数:

```ts
// utils/commandTrigger.ts
export function resolveCommandArgs(rawMessage: string): string | null {
    const trimmed = rawMessage.trim();
    if (!trimmed.startsWith(COMMAND_PREFIX)) return null;
    return trimmed.slice(COMMAND_PREFIX.length);
}
```

**边界说明**

- 【必须】前缀之后为空 (`#steam`) 也视为命中, 返回空串, 由分发层参数检查兜底为静默。
- 【必须】未以 `COMMAND_PREFIX` 开头的消息一律静默, 不回复"请输入指令"。

### 二、分发层: 注册表工厂

#### 指令命名空间

指令支持一级与二级两种命名空间形态:

- **二级命名空间**: `模块 → 子指令` (如 `#steam group add`), 注册在两级字典 `instructionSetMapper` 中。
- **一级命名空间**: 无模块前缀的直达指令 (如 `#steam help`), 注册在单级字典 `rootInstructionSetMapper` 中。

【必须】分发时先查二级 (`arg1` 为模块名、`arg2` 为子指令名), 未命中再查一级 (`arg1` 为指令名, `arg2` 起为参数)。两种形态最终汇入同一个 `dispatch` 校验终点。

```ts
// 二级: 模块 -> 子指令 -> 定义 (管理模块仅私聊, 门槛 superAdmin)
const instructionSetMapper: Record<
    string,
    Record<string, InstructionDefinition>
> = {
    group: {
        add: { handler: groupAddHandler, requiredRole: 'superAdmin', scope: 'private' },
        list: { handler: groupListHandler, requiredRole: 'superAdmin', scope: 'private' },
        // ...
    },
    admin: {
        list: { handler: adminListHandler, requiredRole: 'superAdmin', scope: 'private' },
        // ...
    },
};

// 一级: 指令名 -> 定义 (无模块前缀的直达指令)
const rootInstructionSetMapper: Record<string, InstructionDefinition> = {
    help: { handler: helpHandler },
    search: { handler: searchHandler, scope: 'group' },
    reset: { handler: resetHandler, requiredRole: 'admin', scope: 'group' },
    polling: { handler: pollingHandler, requiredRole: 'superAdmin', scope: 'private' },
    // ...
};
```

要点:

- 【必须】**新增指令 = 注册表加一行**。handler 写成独立文件按模块分目录 (如 `handlers/commands/`), 注册表只做装配, 不含业务逻辑。
- 【必须】指令名在分发前统一 `toLowerCase()`, 指令不区分大小写; **注册表的键必须全小写**——分发层用小写后的名字查表, 驼峰或大写键永远命中不了 (不报错, 只静默失效)。
- 【必须】未命中模块/子指令/一级指令时**静默返回**。未知指令不回复提示, 防止机器人被任意文本触发刷屏。

#### 指令定义 (InstructionDefinition)

```ts
interface InstructionDefinition {
    handler: InstructionHandler;
    /** 执行所需最低角色, 缺省 user (所有人可用) */
    requiredRole?: UserRoleName;
    /** 允许的会话类型, 缺省不限 */
    scope?: 'group' | 'private';
    /** 形态化作用域规则 (进阶, 见下文) */
    scopeRules?: ScopeRule[];
}
```

【必须】一个定义 = 一个执行函数 + 可选的门槛声明。分发层在调用 `handler` 前完成全部校验, handler 内部**不再重复校验**。

要点:

- 【必须】`requiredRole` 的取值即权限模块的 `UserRoleName`; 判定用 `hasRole(userRole, requiredRole)` 的线性比较, 不写档位矩阵。角色的推导与比较见 [permission-pattern](./permission-pattern.md)。
- 【必须】分发层从消息事件推导角色的动作**只发生一次** (接收层入口处), 之后 `UserRole` 对象在分发层与 handler 间传递; 不要在每个校验点重复调用 `getUserRole`。
- 【应该】handler 签名统一为 `(ctx, event, commands, userRole)`, 不需要 `userRole` 的 handler 省略该形参即可。

### 三、作用域校验: scope 与 scopeRules

#### 指令级 scope

【应该】`scope: 'group' | 'private'` 声明指令允许的会话类型, 缺省不限。作用域不满足时回复固定提示 ("该指令仅限群聊使用"/"该指令仅限私聊使用") 后返回。

本项目大量使用该声明表达"仅群聊"与"仅私聊": 用户侧查询/绑定/报告类指令标 `scope: 'group'`; 管理类指令 (`group` / `admin` 模块、`polling`) 标 `scope: 'private'`——管理命令只在私聊生效。

#### scopeRules: 按参数个数分形态 (进阶)

同一指令不同参数个数可以绑定不同权限/作用域 (如 `max`: 无参查看是 admin 级、带参设置是超管级):

```ts
max: {
    handler: setLimitHandler,
    scopeRules: [
        { args: 0, scope: 'group', requiredRole: 'admin' },
        { args: 1, scope: 'group', requiredRole: 'superAdmin' },
        { args: 3, scope: 'private', requiredRole: 'superAdmin' },
    ],
},
```

⚠️ 【必须】**未命中即静默**: `scopeRules` 命中逻辑是"按 `args` 数匹配第一条规则", **未命中任何形态时静默返回**, 不进入 handler。这确保权限防线闭合——不存在"分发层未校验、handler 又未设防"的穿透路径; 代价是形态枚举必须完备, 漏写形态会导致该参数个数的合法调用被静默吞掉。新增参数形态时必须同步补充 `scopeRules` 条目。

> 本项目暂未使用 `scopeRules` (各指令的形态由 handler 内部按参数分支处理), 保留为通用能力。

### 四、校验失败的反馈策略

【必须】分发层对两类校验失败采取**不对称**策略, 这是有意设计而非偶然:

| 失败类型 | 行为 | 理由 |
| --- | --- | --- |
| 权限不足 | **静默忽略** | 防权限探测。若回复"权限不足", 攻击者可通过枚举指令名区分"指令存在但无权"与"指令不存在", 映射出插件的完整指令面 |
| 作用域不符 | **回复提示** | 可用性。作用域不是敏感信息 (指令是否支持群聊对用户无攻击价值), 静默反而让用户误以为指令无效 |
| 未知指令 | **静默返回** | 同权限不足, 不暴露指令面 |

【必须】校验顺序固定为 **权限不足 → 作用域不符**: 先判权限, 通过后再判作用域。这样无权者拿不到"该指令仅限某会话"这类作用域信息。

## 标准范式清单

新增一个指令时:

- [ ] 【必须】在 `handlers/commands/xxxHandler.ts` 写业务 handler, 函数签名 `(ctx, event, commands, userRole) => void`, 内部不做权限/作用域校验。
- [ ] 【必须】在 `instructionSetMapper` 对应模块下 (或 `rootInstructionSetMapper` 中) 注册: `{ handler }`, 按需声明 `requiredRole` / `scope`; 注册表的键全小写。
- [ ] 【应该】参数形态绑定不同权限时才用 `scopeRules`, 并确认所有形态已枚举完备 (未命中形态会被静默吞掉)。
- [ ] 【应该】需要调整角色档位或推导规则时改权限模块, 不改分发层 (见 [permission-pattern](./permission-pattern.md))。
- [ ] 【必须】回复一律走发送工具模块, 不直接调 `ctx.actions.call`。

配置触发方式时:

- [ ] 【必须】前缀固定为内部常量 `COMMAND_PREFIX`, 不提供触发方式配置项; 接收层用 `resolveCommandArgs` 判定是否触发。
- [ ] 【必须】不引入 `atBot` / `triggerModes` 之外的新触发形态除非有明确需求; 引入时须同步更新本文与接收层。

## 与其他范式的关系

- 与**生命周期铁律**的关系: 注册表与 handler 均为纯装配 (构造期零 IO), 可模块加载期导出; 消息事件只在运行期到达。见 [development-pattern](./development-pattern.md)。
- 与**权限范式**的关系: 分发层消费 `hasRole(UserRole, requiredRole)` 的判定结果, 但不实现角色推导——推导与比较属于权限模块。见 [permission-pattern](./permission-pattern.md)。
- 与**配置范式**的关系: 前缀为插件内部常量 (固定值); 会话启用状态来自 store。二者均不经 `sanitizeConfig`, 也不是配置项。会话门禁在接收层最前端短路, 触发判定在会话门禁之后、切词之前执行。见 [config-pattern](./config-pattern.md)。
- 与**消息发送范式**的关系: 所有回复走发送工具模块。见 [message-send-pattern](./message-send-pattern.md)。
- 与**帮助输出范式**的关系: 帮助指令按"角色 + 会话类型"选输出版本 (而非仅按角色), 版本档位与权限档位不是一一对应。见 [help-output-pattern](./help-output-pattern.md)。

## 参考实现

消息接收入口见 `packages/plugin/src/handlers/messageHandler.ts`; 指令注册表见 `packages/plugin/src/handlers/instructionRegistry.ts` (`instructionSetMapper` / `rootInstructionSetMapper`), 分发与校验见 `packages/plugin/src/handlers/instructionDispatch.ts` (`resolveDispatch` / `dispatch`); 触发判定见 `packages/plugin/src/utils/commandTrigger.ts` (`resolveCommandArgs`); 业务 handler 见 `packages/plugin/src/handlers/commands/`。权限模块的实例索引见 [permission-pattern](./permission-pattern.md)。
