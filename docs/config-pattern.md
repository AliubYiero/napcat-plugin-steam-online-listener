# NapCat 插件配置范式

本文是 NapCat 插件配置层的通用范式, 覆盖配置从声明到生效的**数据语义**: 字段形态、清洗纪律、运行时读写与写入铁律。遵循此范式时, 配置项以一份**字段描述符**声明, 类型、默认值、清洗与两套 WebUI 由它派生——这部分结构见 [webui-config-pattern.md](./webui-config-pattern.md)。强度档位 (必须/应该/可以) 见 [development-pattern.md](./development-pattern.md) 的"规范强度分级"。

## 全链路总览

一个配置项从声明到生效的链路已收敛为"一处声明, 多处派生":

```
FIELDS 字段描述符 (共享包, ctx-free 纯数据)   ← 唯一声明源
  ├─ 类型       PluginConfig
  ├─ 默认值     getDefaultConfig()
  ├─ 清洗       sanitizeConfig()          ← 按 kind 派生
  └─ 呈现       buildConfigSchema(ctx) / <ConfigForm>
                (原生自动面板 / 自定义前端表单)
```

不再需要在"类型文件 / 配置文件 / 全局状态文件"三处手工同步字段: 四环节中除运行时读写外全部从描述符派生, 详见 [webui-config-pattern.md](./webui-config-pattern.md)。

## 核心约束: 单一声明源 + 写入铁律

1. 【必须】**新增或修改配置项只改一处**——共享包里的字段描述符 (加 `kind` / `label` / `description` / `default`), 类型与清洗随之派生。禁止在多个文件重复罗列字段。
2. 【必须】**一切外部输入的配置写回必须经过 `sanitizeConfig`**。外部输入包括磁盘配置文件、WebUI 提交 (含原生面板与自定义页)、指令修改。直接把外部对象合并进内存配置等于放弃类型安全。范式:
   - `loadConfig`: 读盘后经 `sanitizeConfig`; 文件不存在则写入默认配置落盘; 解析失败回退默认配置并记日志, 不抛错。
   - `replaceConfig(config)`: 入口统一 `sanitizeConfig(config)` 后再保存。
   - `updateConfig(partial)`: 仅限内部可信调用方使用 (字段已被上游清洗或来自默认值); 若来源不可信, 先清洗。

## 范式正文

### 字段形态分类表

【必须】`sanitizeConfig` 是纯函数: 输入 `unknown`, 输出保证符合 `PluginConfig`。按字段形态分五类, 每类对应描述符的一个 `kind`, 由 `kind` 派生清洗规则:

| 形态         | kind          | 规则                                              |
| ------------ | ------------- | ------------------------------------------------- |
| 标量         | `boolean` / `text` / `password` | `typeof` 守卫; 不合法则保留默认值, 不报错 |
| 数值         | `number`      | `typeof` + 区间钳制; 不合法回退默认值             |
| 字符串列表   | `stringList`  | 容错输入格式, 统一转为去空项数组                  |
| 枚举数组     | `multiSelect` | 过滤非法值; **空数组是合法语义**, 不回退默认值    |
| 嵌套对象     | (无内置 kind) | 逐字段递归使用上述规则; 整体不合法则丢弃该条目    |

前四类由 kind 自动派生, 无需手写; 只有**嵌套对象**这类复杂形态 (如按 id 索引的子表) 仍需手写清洗——它通常意味着该数据属于会话级配置, 应由 store 承载 (见下)。

正例 (派生前的形态语义, 供仍手写嵌套清洗时参照):

```ts
// 标量: typeof 守卫, 不合法保留默认
if (typeof raw.someToggle === 'boolean') out.someToggle = raw.someToggle;
if (typeof raw.someText === 'string') out.someText = raw.someText;

// 数值: typeof + 区间校验
if (
    typeof raw.pollIntervalSeconds === 'number' &&
    raw.pollIntervalSeconds > 0
) {
    out.pollIntervalSeconds = raw.pollIntervalSeconds;
}

// 枚举数组: 过滤非法值; 空数组表示"不推送任何类型",
// 是用户的合法选择, 不回退默认
if (Array.isArray(raw.pushTypes)) {
    const validPushTypes = new Set<string>(VALID_PUSH_TYPES);
    const filtered = raw.pushTypes.filter(
        (t) => typeof t === 'string' && validPushTypes.has(t),
    );
    out.pushTypes = filtered as PluginConfig['pushTypes'];
}
```

嵌套对象 (逐字段递归; 整体不合法则丢弃该条目):

```ts
if (isObject(raw.someNested)) {
    for (const [key, entry] of Object.entries(raw.someNested)) {
        if (!isObject(entry)) continue; // 整体不合法则丢弃该条目
        const cleaned: SomeNestedConfig = {};
        if (typeof entry.enabled === 'boolean') cleaned.enabled = entry.enabled;
        out.someNested[key] = cleaned;
    }
}
```

> 注: 会话级配置 (群/好友) **不在**本文件, 由 store 承载, 见 [store-pattern](./store-pattern.md)。

两条通用原则:

- 【必须】**清洗不抛错**。任何非法输入都回退默认值或丢弃条目, 保证插件在损坏的配置文件下仍能启动。
- 【必须】**尊重用户显式选择**。空数组、显式 `false` 等是语义, 不是缺失; 只有"字段不存在或类型不对" 才回退默认。

### WebUI Schema

WebUI 的两套呈现 (宿主自动面板 / 自定义前端表单) 均由描述符派生, 不再手写:

- 【必须】每个字段声明一个**可渲染的 base kind**, 两套 UI 对同一字段语义等价 (后端 `kind` ↔ `ctx.NapCatConfig` 控件, 前端 `kind` ↔ React 控件)。
- 【应该】枚举候选值有单一来源, 默认值与选项从它派生。
- 【必须】每个字段写 `description` 说明业务含义与生效时机 (如 "修改后下一轮生效")。
- 【必须】运行时数据只允许进入 `display` 展示块, 不得进入可保存配置项; 构建 Schema 需要运行时时**必须参数注入** (`buildConfigSchema(ctx)`), 禁止静态 import 业务模块 (TDZ/循环引用)。

字段声明、kind 分类表、逃生舱 (覆盖注册表) 与前端渲染见 [webui-config-pattern](./webui-config-pattern.md)。

### 会话级配置不在本文件

会话级配置 (群/好友) **不属于**插件配置文件: 它随会话数无界增长, 又是运行期可变的会话数据, 放进来会让每次 `saveConfig` 整体重写全部配置、并跟着 `/config` 整体下发。它由 store 承载 (独立的 `id + type` 数据文件), 权威范式见 [store-pattern](./store-pattern.md)。

配置范式仍约束与它相关的两点:

1. 【必须】**单一查询入口**。提供 `isSessionEnabled(id, type)` 之类的唯一判定函数 (由 service 暴露), 业务代码不得散落判定。
2. 【必须】**入口短路**。消息处理在最前端做会话开关检查, 禁用的会话直接忽略消息, 不进入指令解析 (见 [instruction-pattern](./instruction-pattern.md))。

启用开关的默认值语义 (**默认开启** / **默认关闭**) 是领域决策, 记入 `CONTEXT.md`, 必要时补 ADR。开关的修改入口 (指令 / WebUI) 由插件自选, 范式不强制。

### 插件级启停不在本文件

插件**全局**的启用/停用由 NapCat 宿主负责 (`pluginManager.setPluginStatus`): 停用后宿主不再调用 `plugin_onmessage`。因此配置文件里**不**自建 `enabled` 之类的全局开关 (它既与宿主状态重复, 又会造成两个真相源)。同理, 指令前缀这类"插件作者定死、用户无需修改"的值应是**插件内部常量**, 而非配置项——配置项只承载需要用户调节的值。

## 标准范式清单

新增一个配置项时:

- [ ] 【必须】共享包: 在字段描述符数组加一项 (`kind` / `label` / `description` / `default`), 类型随之派生
- [ ] 【应该】若是枚举: 候选值抽常量, 描述符与清洗共用
- [ ] 【必须】确认描述符键集与配置接口一致 (`satisfies` + 键集单测)
- [ ] 【必须】若是会话级字段: 它不属于本文件, 见 [store-pattern](./store-pattern.md), 并确认"单一查询入口"仍覆盖
- [ ] 【应该】若语义有默认值选择 (尤其是启用开关): 在 `CONTEXT.md` 中声明, 必要时补 ADR

## 与其他范式的关系

- 与 [webui-config-pattern.md](./webui-config-pattern.md): 本文只讲配置**数据的语义与清洗纪律**; 声明如何驱动类型/默认值/两套 WebUI 由该文承接。
- 与**生命周期铁律**的关系: 配置读盘发生在 `plugin_init` 之后, 清洗是纯函数可在任何时机调用; Schema 构建需要 ctx, 只能在运行期进行。见 [development-pattern](./development-pattern.md)。
- 与**指令分发范式**的关系: 接收层读取前缀来自插件内部常量 (固定值), 会话启用状态来自 store; 会话开关在消息入口最前端短路。见 [instruction-pattern](./instruction-pattern.md)。
- 与**领域建模纪律**的关系: 启用开关等默认值语义是领域决策, 定型时记入 `CONTEXT.md` 并按需补 ADR。见 [development-pattern](./development-pattern.md) 的"领域建模纪律"与"ADR 纪律"。

## 参考实现

本项目: 字段描述符 (`FIELDS`)、`PluginConfig`、默认值 (`getDefaultConfig`) 与清洗派生 (`sanitizeConfig` / `parseStringList`) 见 `packages/shared/src/config.ts`; 后端原生面板 Schema 映射见 `packages/plugin/src/config.ts` 的 `buildConfigSchema`; 运行时读写 (读盘清洗、`replaceConfig` / `updateConfig`) 见 `packages/plugin/src/core/state.ts`。
