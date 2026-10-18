# NapCat 插件数据读取与存储范式

本文是适用于任意 NapCat 插件项目的数据持久化通用范式, 覆盖 store 层的结构约定、实例化时机与正反例。各项目遵循此范式时, 应将持久化类集中在一个 store 目录, 并提供一个全局状态单例 (本文以 `pluginState` 称之)。强度档位 (必须/应该/可以) 见 [development-pattern.md](./development-pattern.md) 的"规范强度分级"。

## 核心约束: 为什么不能在模块加载期读数据

NapCat 插件的加载流程是: 模块 import (加载所有文件) → 调用 `plugin_init(ctx)` → 插件正常运行。

- 只有在 `plugin_init` 之后, `ctx` (以及 `ctx.dataPath`、`ctx.logger` 等) 才可用。
- 全局状态单例的 `ctx` 在未初始化时访问会直接抛错。
- 因此, **任何 store 在"模块加载阶段" (import 时) 都不能触碰 `ctx` / 文件 IO**。

由此得出两条铁律:

1. 【必须】**全局单例**: 同一份数据文件在进程内只应有唯一读写入口, 避免内存数据与磁盘数据互相覆盖。
2. 【必须】**延迟实例化 / 延迟读取**: 不能在 store 文件被 import 时就创建实例并读文件, 必须推迟到真正被业务调用时。

## 范式正文

### 1. store 文件只定义类并导出类本身

```ts
// src/store/XxxStore.ts
export class XxxStore extends BaseStore<StoreItem> {
    private static instance: XxxStore | null = null;

    // 私有构造函数, 禁止外部 new
    private constructor() {
        super(DATA_FILENAME);
    }

    // 单例入口, 但注意: 类定义本身不调用它
    static getInstance(): XxxStore {
        if (!XxxStore.instance) {
            XxxStore.instance = new XxxStore();
        }
        return XxxStore.instance;
    }

    // 业务方法...
}
// 注意: 文件末尾没有 `export const xxxStore = XxxStore.getInstance()`
```

要点:

- 【必须】构造函数 `private`, 防止绕过单例。
- 【必须】只导出**类**, 不导出实例。import 该文件不会执行任何 IO。
- `BaseStore` 的构造函数会调用 `loadFromFile()`, 但由于实例化被推迟到业务调用时, 此时 `plugin_init` 已完成, `ctx.dataPath` 可用, 读取是安全的。

### 2. 使用方在调用时惰性获取实例

```ts
// src/services/xxxService.ts
class XxxStoreService {
    private _xxxStore: XxxStore | null = null;

    /** 惰性获取存储实例 (避免模块加载期触达未初始化的全局状态) */
    private get xxxStore(): XxxStore {
        if (!this._xxxStore) {
            this._xxxStore = XxxStore.getInstance();
        }
        return this._xxxStore;
    }

    async add(id: string, target: TargetInfo) {
        // 通过 getter 访问, 首次访问时才实例化并读文件
        const has = this.xxxStore.has(id, target);
        // ...
    }
}

export const xxxStoreService = new XxxStoreService();
```

要点:

- 【必须】service 自身可以安全地导出单例 (`new XxxStoreService()` 不触发 IO)。
- 【应该】store 实例通过 **private getter 缓存** (`_xxxStore` + getter) 获取: 第一次方法调用时才 `getInstance()`, 之后复用。也可以不加缓存、每次直接 `XxxStore.getInstance()` (getInstance 内部本身有单例缓存), 效果等价, getter 缓存只是省一次静态查表。

### 反例: 模块加载期导出单例

一种典型的错误写法:

```ts
class XxxStore {
    private data: XxxData | null = null;
    // ...
    /** 获取内存数据 (惰性加载), 首次访问时才从文件读取 */
    private ensureLoaded(): XxxData {
        if (!this.data) {
            this.data = this.load(); // 每个 get 方法都要先过一遍
        }
        return this.data;
    }
}

// 错误: 文件加载时就创建实例
export const xxxStore = XxxStore.getInstance();
```

它的问题:

1. **导出即实例化**。`xxxStore` 在 import 时就被创建。为了让延迟读取生效, 所有读取方法内部都被迫先调用 `this.ensureLoaded()` 做惰性加载兜底——每个 getter 都多一层样板代码, 且容易遗漏 (新增方法忘记调用 `ensureLoaded()` 就会读到 `null`)。
2. 这实际上是把"延迟实例化"的责任从**调用方**转移到了 **store 内部每一个方法**, 模式被拆散在所有方法里, 不如正确范式集中、清晰。

该写法之所以容易长期没被发现, 是因为它把"构造时不读文件 + `ensureLoaded()` 兜底"绑定在一起; 一旦有人把读文件挪进构造函数 (直觉上很自然), 插件就会在 import 阶段崩溃。正确范式从结构上杜绝了这个隐患。

## 标准范式清单

新建一个 store 时按以下步骤:

- [ ] 【必须】继承列表型基类 (如 `BaseStore<T>`), 或自建类并依赖全局状态的键值读写方法 (如 `loadDataFile / saveDataFile`)。
- [ ] 【必须】`private constructor()`, 构造函数内**不做任何文件读取** (列表型由基类构造统一加载, 因其发生在延迟实例化之后所以安全)。
- [ ] 【必须】提供 `static getInstance()`, 内部持有 `private static instance`。
- [ ] 【必须】文件只 `export class`, **不**导出实例常量。
- [ ] 【必须】使用方 (service / handler) 通过 getter 缓存或直接调用 `getInstance()` 在方法内部获取实例。
- [ ] 【必须】数据写入后统一走立即持久化方法 (如 `saveToFile()`), 不做批量延迟落盘。

## 通用基类: BaseStore 与 SessionConfigStore

本项目提供两个可直接继承的基类, 免去每个 store 重写"读文件 → 查找 → 改内存 → 落盘"这套样板逻辑:

| 基类 | 文件 | 职责 |
| --- | --- | --- |
| `BaseStore<T>` | `packages/plugin/src/store/BaseStore.ts` | 数组型数据的文件持久化与基础增删查改, 不含业务语义 |
| `SessionConfigStore<T>` | `packages/plugin/src/store/SessionConfigStore.ts` | 在 `BaseStore` 之上, 按 `id + type` 定位一条会话配置 |

两者都是 `abstract class`, 构造函数为 `protected`, 只能被继承、不能被直接 `new`; 基类**不提供** `getInstance`, 单例仍由子类按上文标准范式自行实现。

### `BaseStore<T>` API

| 方法 | 说明 |
| --- | --- |
| `getAll(): T[]` | 全部数据, **返回内存引用** |
| `reload(): void` | 从文件重新加载, 丢弃内存数据 |
| `findItem(predicate): T \| undefined` | 首个匹配项 (**内部引用**) |
| `hasItem(predicate): boolean` | 是否存在匹配项 |
| `addItem(item: T): void` | 追加一项并保存 |
| `removeItem(predicate): boolean` | 删除首个匹配项并保存; 无匹配返回 `false` |
| `updateItem(predicate, updater): boolean` | 用 `updater(旧项)` 的返回值替换首个匹配项并保存; 无匹配返回 `false` |
| `reset(): void` | 清空并保存 |

`protected loadFromFile()` / `protected saveToFile()` 由上述方法内部触发, 子类一般不直接调用 (【必须】不把 `saveToFile` 改成 `public`)。文件读取已做容错: 文件缺失或内容不是数组时回退为 `[]` 并告警, 不让损坏的数据文件拖垮插件启动。

### `SessionConfigStore<T extends SessionConfigBase>` API

数据项必须携带定位字段, 业务字段由泛型补充:

```ts
interface SessionConfigBase {
    id: string;                     // 群号或用户 QQ 号
    type: 'private' | 'group';      // 会话类型
}
```

| 方法 | 说明 |
| --- | --- |
| `find(id, type): T \| undefined` | 查找某会话的配置 (**返回内部引用**) |
| `set(id, type, config): void` | **完全替换**扩展字段; 记录不存在则新增。`config` 类型为 `Omit<T, 'id' \| 'type'>` |
| `setMany(entries): void` | **批量 upsert**, **合并**扩展字段 (保留未提及的); 全程只落盘一次, 供批量开关等场景使用 |
| `update(id, type, partial): void` | **部分更新**, 保留未提及的字段; 记录不存在则**抛 `Error`** |
| `list(): T[]` | 全部配置 (浅拷贝数组) |
| `remove(id, type): boolean` | 删除; 记录不存在返回 `false`, 不抛错 |
| `has(id, type): boolean` | 是否已有配置 |

`set` / `update` 会校验 `id` 非空与 `type` 合法, 失败抛 `Error`——尽早暴露开发者错误, 而不是写出一条永远查不回来的脏数据。本层**不做权限校验**: 是否允许改某会话的配置由 handler / service 按 [permission-pattern](./permission-pattern.md) 判断。

### 完整示例: 会话级配置 store

> 基类代码以 `packages/plugin/src/store/` 下的实际文件为准, 本节示例仅演示写法; 示例中的子类 `GroupLimitStore` 不落地为项目文件。本项目自带的会话配置子类见 `store/PluginSessionConfigStore.ts` 的 `PluginSessionConfigStore` (见文末"参考实现")。

第 1 步, 定义配置项与具体 store 子类:

```ts
// src/store/GroupLimitStore.ts
import { SessionConfigStore, type SessionConfigBase } from './SessionConfigStore';

/** 每个群的监听上限 */
export interface GroupLimit extends SessionConfigBase {
    max: number;
}

export class GroupLimitStore extends SessionConfigStore<GroupLimit> {
    private static readonly DATA_FILENAME = 'group-limit.json';
    private static instance: GroupLimitStore | null = null;

    private constructor() {
        super(GroupLimitStore.DATA_FILENAME);
    }

    static getInstance(): GroupLimitStore {
        if (!GroupLimitStore.instance) {
            GroupLimitStore.instance = new GroupLimitStore();
        }
        return GroupLimitStore.instance;
    }
}
// 注意: 文件末尾没有 `export const groupLimitStore = GroupLimitStore.getInstance()`
```

第 2 步, 在 service / handler 内部惰性获取实例并调用 (不要在模块加载期求值):

```ts
const store = GroupLimitStore.getInstance();

store.set(groupId, 'group', { max: 5 });        // 新增或整体覆盖
const limit = store.find(groupId, 'group');      // { id, type, max } | undefined
store.update(groupId, 'group', { max: 10 });     // 只改 max, 其余字段保留
store.has(groupId, 'group');                     // true
store.list();                                    // 全部会话配置
store.remove(groupId, 'group');                  // true / false
```

落盘的数据文件是 `T[]` 数组:

```json
[
    { "id": "123456", "type": "group", "max": 5 },
    { "id": "78910", "type": "private", "max": 0 }
]
```

### 使用注意

- `find` / `getAll` 返回**内部引用**: 直接改动会绕过 `saveToFile`, 造成内存与磁盘不一致。修改一律走 `set` / `update` / `addItem` / `removeItem` / `updateItem`。
- `set` 是整体覆盖而非合并: 需要保留未提及字段时用 `update`。
- `update` 在记录不存在时抛 `Error`, 调用方要么先 `has` / `find` 兜底, 要么显式处理异常。
- 数据文件名由子类通过 `super(DATA_FILENAME)` 传入, 建议 kebab-case (如 `group-limit.json`)。

## 与其他范式的关系

- 与**生命周期铁律**的关系: 全局状态单例 (如 `pluginState`) 本身也是模块加载期导出的单例, 但它安全, 前提是"构造期零 IO"——`ctx` 以 nullable 字段持有, getter 中检查未初始化即抛错, 真正的 IO 全部在 `init(ctx)` 之后才发生。store 遵循"调用时 `getInstance()`"的范式, 是为了让这一约束不依赖每个开发者的自觉, 而是由结构保证。见 [development-pattern](./development-pattern.md)。
- 与**配置范式**的关系: **全局**配置遵循 [config-pattern](./config-pattern.md) 的四环节链路 (类型/默认值/Schema/清洗), **不**放进 store; 而**会话级配置 (群/好友)** 正属于本文——它随会话数无界增长、又是运行期可变数据, 由 store 承载, 不写进配置文件。会话配置的读写入口由 service 收敛 (见 [config-pattern](./config-pattern.md) 的"单一查询入口")。
- 与**消息发送范式**的关系: store 推送通知时最终调用发送工具, 同样只在运行期调用, 见 [message-send-pattern](./message-send-pattern.md)。

## 参考实现

本项目: 通用基类见 `packages/plugin/src/store/BaseStore.ts` 与 `store/SessionConfigStore.ts`; 会话配置的具体子类 `PluginSessionConfigStore` 见 `store/PluginSessionConfigStore.ts` (数据文件 `session-config.json`), 其单一读写入口 service 见 `services/sessionConfigService.ts`; 全局状态单例见 `packages/plugin/src/core/state.ts` (其 `loadDataFile` / `saveDataFile` 是基类的持久化底座, 另承载 `stats.json` 运行统计)。绑定数据与游戏名数据的持久化未抽象为 store 子类, 而是由 `services/steam-bind.service.ts` (`steam-bind-data.json`) 与 `services/game-name.service.ts` (`steam-game-names.json`) 直接经全局状态的键值读写方法完成。
