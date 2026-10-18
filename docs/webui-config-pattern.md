# NapCat 插件配置与 WebUI 单一声明源范式

本文是配置「声明层」的通用范式, 覆盖一份字段描述符如何同时驱动后端类型、默认值、清洗与两套 WebUI (NapCat 原生自动面板 + 自定义前端表单), 以及 WebUI 骨架元信息的单源化。强度档位见 [development-pattern.md](./development-pattern.md) 的"规范强度分级"。配置数据的**语义与清洗纪律**仍以 [config-pattern.md](./config-pattern.md) 为准, 本文只解决"一份声明驱动多个消费方"的结构问题。

## 概述

NapCat 提供两条配置呈现路线 (见 `.example/plugin/start-webui.md`): 后端声明 `PluginConfigSchema` 让宿主**自动生成配置面板** (官方称最推荐), 以及自建 React/Vue SPA 承载更复杂的交互。同一个插件的同一批配置项, 若两条路线各写一份 UI 定义, 就会产生用户看到的界面不一致、字段增删时漏改一处的**漂移**。

本范式用**一份字段描述符 (FIELDS)** 作为唯一权威, 由它派生:

```
FIELDS (字段描述符, ctx-free 纯数据, 放共享包)
  ├─ 类型       PluginConfig         (接口与描述符键集 satisfies 绑定)
  ├─ 默认值     getDefaultConfig()
  ├─ 清洗       sanitizeConfig()     (按 kind 派生, 含列表 codec)
  ├─ 后端面板   buildConfigSchema(ctx)  → ctx.NapCatConfig → 宿主自动面板
  └─ 前端表单   <ConfigForm>          → 按 kind 渲染控件 (webui)
```

范围: **全局配置** (插件配置文件里的字段) 与 **WebUI 骨架元信息** (页面 / 侧栏 / 标题 / 插件身份)。**不含**会话级配置——它随会话数无界增长, 由 store 承载, 见 [store-pattern.md](./store-pattern.md)。

## 核心约束

1. 【必须】**单一声明源**。字段只在描述符数组声明一次; 类型、默认值、清洗、两套 UI 全部从它派生。禁止在多个文件里重复罗列字段。
2. 【必须】**每个字段声明一个可渲染的 base kind**。原生自动面板不像自定义前端那样能挂任意组件, 所以字段必须能被"按 kind 渲染"; 两套 UI 对同一字段的语义因此等价。**唯一例外**: `password` kind 无原生面板控件——其 `scope` 只接受 `webui` / `both` (`webui` 时面板不渲染, `both` 时面板渲染"跳转引导块", 见下文)。
3. 【必须】**键集一致**: 描述符的 `key` 必须是配置接口的键, 且一一覆盖 (用 `satisfies` 做编译期绑定, 再用单测做运行期兜底)。
4. 【必须】**清洗从 kind 派生**, 不逐字段手写分支; 且**清洗不抛错** (任何非法输入回退默认或丢弃条目)。
5. 【必须】**描述符是 ctx-free 纯数据**, 放在前后端都能 import 的共享包; 需要 `ctx` 的映射 (→ `ctx.NapCatConfig`) 留在后端运行期完成。
6. 【应该】**前端构建期** import 描述符, 而非运行时拉取 schema 端点——前后端同仓同步构建时二者天然一致。
7. 【必须】**WebUI 骨架 (页面/菜单/标题) 同样单源**: 页面元信息放共享包, 前端只保留"页 id → 组件"的映射。
8. 【应该】**插件身份以 `package.json` 为唯一权威** (宿主只认它), 构建期注入前端, 不硬编码插件名。

## 范式正文

### 字段 kind 分类表

每个 kind 同时决定四件事: 清洗规则、后端控件、前端控件、默认值形态。

| kind          | 清洗规则                        | 后端控件     | 前端控件     |
| ------------- | ------------------------------- | ------------ | ------------ |
| `boolean`     | `typeof` 守卫, 回退默认         | 开关         | 开关         |
| `text`        | `typeof` 守卫, 回退默认         | 文本框       | 文本框       |
| `password`    | 同 `text`                       | 跳转引导      | 密码框       |
| `number`      | `typeof` + 区间钳制, 回退默认   | 数字框       | 数字框       |
| `select`      | 必须命中 options, 否则回退默认  | 下拉单选     | 下拉单选     |
| `multiSelect` | 过滤非法值; **空数组合法**      | 下拉多选     | 复选         |
| `stringList`  | 逗号串/数组 → 去空项数组        | 逗号文本框   | 逗号文本框   |

`stringList` 是吸收"文本控件收集字符串、逻辑字段却是数组"这一常见落差的关键 kind: 它的 codec (逗号分隔 → `trim` → 去空项) 是前后端**唯一定义** (前端导入共享包的 `parseStringList`, 后端清洗复用同一函数)。**限制**: 不支持含逗号的值; 仅适用于 QQ 号、简单枚举等场景。

`password` 与 `text` 语义相同 (清洗、落盘、默认值形态一致), 差别在前端渲染为密码框 (带显示/隐藏切换)。原生面板无密码控件, 故它的 `scope` 收窄为 `webui` / `both`: `webui` 仅自建前端显示; `both` (缺省) 在自建前端显示密码框、在原生面板显示"前往拓展页面修改"的引导块 (`buildPasswordPanelHint`, 仅展示不落值)。**警告**: 它**不脱敏**——密钥明文落盘并明文往返浏览器, 仅适用于对安全性要求不高的场景; 需要掩码/留空即保留的契约请自行在覆盖注册表与后端 API 层实现。

### 布局与展示字段

除有值字段外, 声明源允许两类**不带 key、不落盘**的字段, 用于组织界面:

- `section`: 分组标题 (仅分隔视觉区块; 保留 `label`)。
- `display`: 纯展示块, 仅含 `content` (HTML 片段), 不需要 `label` / `description`。

【必须】运行时数据只允许进入 `display` 展示块, 不得进入可保存字段 (与 [config-pattern.md](./config-pattern.md) 的"Schema 静态/动态边界"一致)。

#### 展示块占位符 (display tokens)

`display.content` 是 ctx-free 静态 HTML, 其中的动态值以 `{{...}}` 占位符声明, 由前后端在各自可得处解析:

- 后端 (原生面板): 用 `ctx` 的插件信息 (插件显示名 / 描述 / 拓展页地址);
- 前端 (自建前端): 用构建期注入的插件身份。

token 常量与解析纯函数 (`resolveDisplayContent`) 统一在共享包; 【必须】未命中的 token 回退空串, 注入值做 HTML 转义。作者若不需要动态值, 直接把 token 写成字面文案即可。

### 字段可见范围 (scope)

【应该】字段可声明可选 `scope` 控制**在哪些界面呈现**:

| scope   | 呈现于                                       |
| ------- | -------------------------------------------- |
| `webui` | 仅自建前端 (ConfigForm)                      |
| `panel` | 仅 NapCat 原生自动面板 (buildConfigSchema)   |
| `both`  | 两处都显示 (**默认**, 不填即此)              |

【必须】`scope` 只影响**呈现**: 带 key 的字段即便在某侧被隐藏, 仍清洗、仍落盘。后端 `buildConfigSchema` 过滤掉 `webui`, 前端 `ConfigForm` 过滤掉 `panel`。

【例外】`password` 无原生面板控件, 不支持 `panel`: `webui` 仅自建前端显示密码框; `both` (缺省) 在原生面板渲染"跳转引导块" (引导用户去自建前端修改), 该引导块不可落值。

### 逃生舱: 覆盖注册表

内置 kind 覆盖绝大多数需求; 需要定制交互 (如"一键测试联通"按钮、带校验的标签编辑器) 时, 前端提供**按字段 key 覆盖的组件注册表**:

- 覆盖组件只改**前端呈现**, **不得改变清洗语义** (清洗仍由 kind 派生, 后端不变)。
- 字段仍必须声明一个 base kind, 供宿主原生面板降级渲染。
- 【应该】优先用内置 kind; 只有在交互确实无法表达时才覆盖。

### WebUI 骨架元信息

页面清单同样是单一声明源, 至少声明: `id`(页面标识) · `title`(页头标题兼菜单文案) · `description`(页头描述) · `icon`(图标名) · `order`(排序) · `hidden`(是否隐藏)。前端据此渲染侧栏与页头, 只保留 `页 id → 组件` 的静态映射:

- 新增页面 = 在共享清单加一项 + 在组件映射注册一个组件。
- 【必须】不做动态 `import` 组件 (图省事会牺牲类型与构建确定性)。

### URL 路由 (hash)

页面切换后地址栏应体现当前页 (支持刷新复原、URL 直达、浏览器后退/前进)。约束: 自建前端是内嵌于宿主的**单文件 HTML**, 服务端页面路径固定 (`router.page` 注册一次), 真实路径子路由会在刷新/直达时 404——故【必须】用 **hash** (`#/<pageId>`, 如 `#/sessions`), 它是唯一客户端可控且不发往服务端的 URL 段。

- 【必须】**URL 是当前页的唯一真相源**: 前端由一个 hook 独占页面状态 (读取 `location.hash` + 监听 `hashchange`), 不用 `useState` 另存一份, 以免状态与 URL 漂移 (后退后 state 未跟)。
- 【必须】页面 id 直接复用 `PageMeta.id`; 解析【应该】宽容取 hash 首段 (忽略多余路径段/尾斜杠), 空或非法值回退 `DEFAULT_PAGE`。
- 【必须】归一化与默认页补齐用 `history.replaceState` (不新增历史); 切页写 `location.hash` (自动压入历史, 后退键随之生效); 点击当前页 no-op, 避免污染历史栈。
- 【必须】解析/序列化抽成**纯函数**并单测 (hash 解析与格式化是易错边角, 且 IO 部分不可纯测)。

### 插件身份注入

插件 id 与显示名以 `package.json` 为唯一权威。自定义前端在**构建期**读取它并注入 (Vite `define` / HTML 变量替换), 用于替换原先硬编码的插件名与页面标题。运行时宿主注入的插件名 (如 `window.__PLUGIN_NAME__`) 仍应优先, 构建期注入只作兜底。

### 与官方两条路线的关系

官方**推荐**用 `PluginConfigSchema` 自动生成配置面板, 并只在"需要更复杂交互界面"时才自建 SPA。本范式不否定任一路线: 它让两条路线**同源**——自动面板由描述符映射得到, 自定义表单由同一描述符渲染。若某插件的配置确实无需自定义外观, 完全可以只保留自动面板 (去掉自定义配置页), 描述符不改。

## 标准范式清单

### 新增 / 修改一个全局配置项

- [ ] 【必须】共享包: `PluginConfig` 加字段 (带注释)
- [ ] 【必须】共享包: 在描述符数组加同 key 的一项, 声明 `kind` / `label` / `description` / `default`
- [ ] 【应该】枚举类字段: 候选值抽常量, 描述符与清洗共用同一来源
- [ ] 【应该】若字段只需在某一个界面出现: 声明 `scope` (`webui` / `panel`)
- [ ] 【必须】确认 `satisfies` 与键集单测通过 (无需改后端映射与前端表单)
- [ ] 【应该】若语义有默认值选择 (尤其启用开关): 在 `CONTEXT.md` 声明, 必要时补 ADR

### 新增一个 WebUI 页面

- [ ] 【必须】共享清单: 加一项 `id` / `title` / `description` / `icon` / `order`
- [ ] 【必须】前端: 在 `页 id → 组件` 映射注册对应组件
- [ ] 【必须】确认 `id` 可作 hash 片段直达 (`#/<id>`), 无需改路由层

## 与其他范式的关系

- 与 [config-pattern.md](./config-pattern.md): 本文承接其"配置数据语义与清洗纪律", 把四环节**从手工同步升级为单源派生**; 清洗的分类表在本文以 kind 形式固化。写入铁律 (外部输入必经清洗) 不变。
- 与 [store-pattern.md](./store-pattern.md): 会话级配置**不进入**本文的声明源, 仍由 store 承载。
- 与 [development-pattern.md](./development-pattern.md): 描述符为 ctx-free 纯数据, 满足"模块加载期禁 IO"; 需要 ctx 的 Schema 映射只在 `plugin_init` 后运行。

## 参考实现

本项目: 声明源与派生见 `packages/shared/src/config.ts` (`FIELDS` / `PluginConfig` / `COMMAND_PREFIX` / `getDefaultConfig` / `sanitizeConfig` / `parseStringList`) 与 `packages/shared/src/ui.ts` (`PAGES` / `DEFAULT_PAGE`); 展示块占位符见 `packages/shared/src/displayTokens.ts` (`resolveDisplayContent`); 后端映射 (含 scope 过滤与占位符解析) 见 `packages/plugin/src/config.ts` 的 `buildConfigSchema`; 前端渲染见 `packages/webui/src/components/ConfigForm.tsx` 与 `packages/webui/src/pages/StatusPage.tsx` (仪表盘页内嵌配置表单); 骨架消费见 `packages/webui/src/App.tsx` 与 `packages/webui/src/components/Sidebar.tsx`; URL 路由见 `packages/webui/src/hooks/usePageRoute.ts` (hook) 与 `packages/webui/src/utils/pageRoute.ts` (`parsePage` / `buildHash`)。
