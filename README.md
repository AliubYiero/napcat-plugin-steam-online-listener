# NapCat Steam 在线监听插件

监听指定 Steam ID 的用户的登录/游戏状态，并通过 QQ 群消息或私聊进行通知。该插件基于 NapCat 插件开发模板构建，提供完整的 Steam 用户状态监控和通知功能。

## 功能特性

- **Steam 状态监控**：实时监控指定 Steam 用户的在线状态和游戏状态
- **自动状态通知**：当用户上线、下线或开始/结束游戏时自动发送通知
- **自定义昵称**：支持为 Steam 用户设置自定义昵称
- **多群组支持**：支持在多个 QQ 群中同时监控 Steam 用户
- **私聊支持**：支持私聊中绑定和监控 Steam 用户
- **数据备份**：自动备份绑定数据，确保数据安全
- **图片消息**：支持发送带用户头像的状态通知图片
- **WebUI 管理**：提供可视化界面管理配置、群组、Steam 绑定和游戏名称
- **管理员权限**：支持设置插件管理员，管理群组和配置
- **群聊白名单**：群聊的 Steam 监听功能默认关闭，需要管理员通过指令添加指定群聊后才会生效
- **动态配置**：支持动态更改 Steam API Key，更改后会自动重启轮询服务
- **状态推送选择**：支持在 WebUI 中选择要推送的 Steam 状态类型（上线、离线、开始游戏、结束游戏、开始挂机、结束挂机、游戏下线、切换游戏）
- **游戏时长追踪**：自动记录游戏开始时间，结束游戏时显示总游玩时长
- **切换游戏检测**：检测用户从游戏A切换到游戏B，并显示旧游戏的游玩时长
- **批量绑定**：支持通过 `#steam bind-batch` 指令一次性批量绑定多个 Steam 用户
- **时间线记录**：按天记录所有 Steam 用户状态变更，支持自动归档
- **每日活动报告**：自动生成并推送 Steam 用户每日活动报告（在线时长、游戏时长统计）
- **游戏名称管理**：支持获取游戏中英文名称，可在 WebUI 中管理中文名称

## 依赖要求

- NapCat v4.14.0 或更高版本
- Steam Web API Key
- napcat-plugin-svg-render 插件（用于图片渲染功能，默认端口 6099）

## 快速开始

### 1. 安装依赖

```bash
pnpm install
```

### 2. 构建插件

```bash
# 完整构建（后端 + 前端）
pnpm run build

# 仅构建前端
pnpm run build:webui

# 开发模式（监听文件变化并自动构建）
pnpm run dev
```

### 3. 配置插件

1. 在 NapCat WebUI 中找到本插件
2. 在配置页面填入 Steam Web API Key
3. 设置轮询间隔时间（默认 60 秒）
4. 设置插件管理员用户（多个用户用逗号分隔）
5. 选择要推送的状态类型
6. 启用插件功能

### 4. 获取 Steam API Key

1. 访问 [Steam Web API](https://steamcommunity.com/dev/apikey) 页面
2. 注册应用并获取 API Key
3. 将 API Key 填入插件配置中

### 5. 启用群聊功能

群聊的 Steam 监听功能默认关闭，需要管理员用户通过私聊发送 `#steam group add <群号>` 指令将指定群聊添加到白名单后，才会在该群聊生效。

## 指令列表

### 公共指令（所有用户）

| 指令 | 功能 | 示例 |
|------|------|------|
| `#steam help` | 显示帮助信息 | - |
| `#steam search <Steam昵称>` | 查询 Steam ID | `#steam search Yiero` |
| `#steam bind <Steam ID> [昵称]` | 绑定 Steam 用户 | `#steam bind 76561198... 小明` |
| `#steam bind-batch <id1> <昵称1> <id2> <昵称2> ...` | 批量绑定 | `#steam bind-batch 7656... 小明 7656... 小红` |
| `#steam list` | 显示当前来源的绑定列表 | - |
| `#steam remove <Steam ID>` | 解绑指定用户 | `#steam remove 76561198...` |
| `#steam reset` | 清空当前来源的所有绑定 | - |
| `#steam report today` | 查询今日活动报告 | - |
| `#steam report yesterday` | 查询昨日活动报告 | - |

### 管理员指令（仅限管理员私聊）

| 指令 | 功能 | 示例 |
|------|------|------|
| `#steam polling` | 手动触发状态轮询 | - |
| `#steam admin list` | 查看管理员列表 | - |
| `#steam admin add <QQ号>` | 添加管理员 | `#steam admin add 123456789` |
| `#steam admin remove <QQ号>` | 移除管理员 | `#steam admin remove 123456789` |
| `#steam group list` | 查看已管理的群组列表 | - |
| `#steam group add <群号>` | 将群添加到白名单 | `#steam group add 123456789` |
| `#steam group remove <群号>` | 从白名单移除群聊 | `#steam group remove 123456789` |

## 配置说明

### 全局配置

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `enabled` | boolean | true | 是否启用插件功能 |
| `debug` | boolean | false | 是否启用调试模式 |
| `commandPrefix` | string | '#steam' | 指令前缀 |
| `cooldownSeconds` | number | 1 | 命令冷却时间（秒） |
| `pollingIntervalSeconds` | number | 60 | Steam状态轮询间隔（秒） |
| `steamApiKey` | string | '' | Steam Web API 密钥 |
| `adminUsers` | string[] | [] | 管理员用户QQ号列表 |
| `notifyStatusTypes` | string[] | 全部8种 | 要推送的状态类型列表 |

### 状态推送类型

支持以下8种状态变化类型：

- `online` - 上线（玩家从离线变为在线）
- `offline` - 离线（玩家从在线变为离线）
- `ingame` - 开始游戏（玩家开始玩新游戏）
- `outgame` - 结束游戏（玩家退出游戏，显示游玩时长）
- `inAfk` - 开始挂机（玩家进入离开/挂机状态）
- `outAfk` - 结束挂机（玩家从挂机状态恢复）
- `quitGame` - 游戏下线（玩家从游戏中直接离线，显示游玩时长）
- `switchgame` - 切换游戏（玩家从游戏A切换到游戏B，显示旧游戏时长）

### 群组配置

- `enabled`: 是否在该群启用插件功能

## 推送消息格式

状态变化时的推送消息格式如下：

```
[2026-02-22 14:30:00] PlayerName 正在游玩 Counter-Strike 2
[2026-02-22 15:45:00] PlayerName 结束游玩 Counter-Strike 2（游玩时长：1小时15分钟）
```

支持的状态类型：
- **上线**：玩家从离线变为在线
- **离线**：玩家从在线变为离线
- **开始游戏**：玩家开始玩新游戏
- **结束游戏**：玩家退出游戏回到在线状态（显示游玩时长）
- **开始挂机**：玩家进入离开/挂机状态
- **结束挂机**：玩家从挂机状态恢复游戏
- **游戏下线**：玩家从游戏中直接离线（显示游玩时长）
- **切换游戏**：玩家从游戏A切换到游戏B（显示旧游戏游玩时长）

## WebUI 管理页面

插件提供完整的 WebUI 管理界面：

- **状态页面**：查看插件运行状态、统计信息和绑定的 Steam 用户
- **配置页面**：管理插件全局配置，包括 API Key、轮询间隔、管理员列表等
- **群组管理**：查看和管理已启用的群组列表
- **Steam 绑定管理**：可视化添加、查看和删除 Steam 用户绑定
- **游戏名称管理**：查看所有游戏列表，编辑中文名称，删除不需要的游戏条目

## 项目结构

```
napcat-plugin-steam-online-listener/
├── src/
│   ├── index.ts              # 插件入口，导出生命周期函数
│   ├── config.ts             # 配置定义和 WebUI Schema
│   ├── types.ts              # TypeScript 类型定义
│   ├── core/
│   │   └── state.ts          # 全局状态管理单例
│   ├── handlers/
│   │   ├── message-handler.ts # 消息处理器
│   │   ├── admin.handler.ts  # 管理员指令处理器
│   │   ├── group.handler.ts  # 群组管理指令处理器
│   │   ├── steam-*.ts        # Steam 相关指令处理器
│   │   └── utils.ts          # Steam 工具函数
│   ├── services/
│   │   ├── steam.service.ts  # Steam API 服务
│   │   ├── steam-cache.service.ts # Steam 缓存服务
│   │   ├── steam-polling.service.ts # Steam 轮询服务
│   │   ├── steam-report.service.ts # 每日报告服务
│   │   ├── timeline.service.ts # 时间线记录服务
│   │   ├── game-name.service.ts # 游戏名称服务
│   │   └── api-service.ts    # WebUI API 路由
│   ├── utils/
│   │   ├── format.ts         # 格式化工具（时长、日期）
│   │   └── svg-render.ts     # SVG 渲染工具
│   └── webui/                # React SPA 前端（独立构建）
├── package.json
├── tsconfig.json
└── vite.config.ts
```

## 数据存储

插件使用 JSON 文件存储数据，位于 NapCat 数据目录：

- `steam-bind-data.json` - Steam 绑定数据
- `steam-status-cache.json` - 状态缓存数据
- `steam-game-names.json` - 游戏名称数据
- `steam-status-log-YYYY-M-D.json` - 时间线日志（按天分割）
- `archives/` - 归档的旧日志文件（ZIP 格式）

## 数据备份

插件会自动备份 Steam 绑定数据：
- 备份文件位于 `../backup/` 目录
- 文件名格式：`steam-bind-data.backup.<时间戳>.json`
- 最多保留 5 个备份文件
- 每次绑定操作后自动执行备份
- 插件启动时如主数据文件损坏，会自动从最新备份恢复

## 数据导入导出

插件支持完整的数据导入导出功能：

**导出内容（ZIP 文件）：**
- `steam-bind-data.json` - Steam 绑定数据
- `steam-status-cache.json` - 状态缓存数据
- `steam-game-names.json` - 游戏名称数据
- `manifest.json` - 导出信息（时间、版本等）

**导入特性：**
- 自动验证数据格式
- 导入前自动创建当前数据备份
- 支持选择性导入

使用方式：通过 WebUI 配置页面进行可视化导入导出操作。

## 开发

### 调试与热重载

```bash
# 一键部署（需安装 napcat-plugin-debug-cli）
pnpm run deploy

# 开发模式（监听文件变化并自动部署）
pnpm run dev
```

### 测试

```bash
# 运行测试
pnpm run test

# 测试监听模式
pnpm run test:watch

# 类型检查
pnpm run typecheck
```

## 注意事项

1. **Steam API Key 获取**: 访问 https://steamcommunity.com/dev/apikey 获取免费的 API Key
2. **svg-render 插件依赖**: 图片渲染功能需要安装并启用 `napcat-plugin-svg-render` 插件（端口 6099）
3. **轮询间隔**: 建议设置为60秒或更长，避免频繁请求 Steam API
4. **多来源绑定**: 同一 Steam 用户可以在多个群组或私聊中绑定，每个来源有独立的自定义昵称
5. **解绑权限**: 用户只能解绑自己来源的绑定数据，不能解绑其他来源的数据
6. **管理员权限**: 只有配置的管理员用户可以使用特殊命令（如手动触发轮询、管理管理员）
7. **时间线日志**: 日志文件按天分割，7天后自动归档为 ZIP，归档文件存放在 `archives/` 目录
8. **每日报告**: 日期变化时自动生成并推送前一天的活动报告
9. **中国时区**: 时间线日志和每日报告使用中国标准时间（Asia/Shanghai，UTC+8）进行日期计算

## 许可证

MIT

## 贡献

欢迎提交 Issue 和 Pull Request 来改进本插件。

## 报告问题

如遇到问题，请在 GitHub 仓库中提交 Issue。

## 支持

如需帮助或有建议，请联系插件作者或在仓库中提交 Issue。