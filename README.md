# NapCat Steam 在线监听插件

监听指定 Steam ID 的用户的登录/游戏状态，并通过 QQ 群消息进行通知。该插件基于 NapCat 插件开发模板构建，提供完整的 Steam 用户状态监控和通知功能。

## 🌟 功能特性

- **Steam 状态监控**：实时监控指定 Steam 用户的在线状态和游戏状态
- **自动状态通知**：当用户上线、下线或开始/结束游戏时自动发送通知
- **自定义昵称**：支持为 Steam 用户设置自定义昵称
- **多群组支持**：支持在多个 QQ 群中同时监控 Steam 用户
- **私聊支持**：支持私聊中绑定和监控 Steam 用户
- **数据备份**：自动备份绑定数据，确保数据安全
- **图片消息**：支持发送带用户头像的状态通知图片
- **WebUI 管理**：提供可视化界面管理配置和群组设置
- **管理员权限**：支持设置插件管理员，管理群组和配置
- **灵活的权限控制**：管理员可以管理群组和插件设置
- **群聊白名单**：群聊的 Steam 监听功能默认关闭，需要管理员通过 `#group add` 指令添加指定群聊后才会在指定群聊生效
- **动态配置**：支持动态更改 Steam API Key，更改后会自动重启轮询服务

## 📋 依赖要求

- NapCat v4.14.0 或更高版本
- Steam Web API Key
- NapCat Puppeteer 插件（用于图片渲染功能）

## 🚀 快速开始

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
5. 启用插件功能

### 4. 获取 Steam API Key

1. 访问 [Steam Web API](https://steamcommunity.com/dev/apikey) 页面
2. 注册应用并获取 API Key
3. 将 API Key 填入插件配置中

### 5. 启用群聊功能

群聊的 Steam 监听功能默认关闭，需要管理员用户通过私聊发送 `#group add <群号>` 指令将指定群聊添加到白名单后，才会在该群聊生效。

## 💬 指令列表

### 通用指令
- `#help` - 显示帮助信息

### 管理员指令（仅管理员可用，私聊使用）
- `#admin list` - 查看管理员列表
- `#admin add <QQ号>` - 添加管理员
- `#admin remove <QQ号>` - 移除管理员
- `#group add <群号>` - 将群聊添加到白名单
- `#group remove <群号>` - 从白名单移除群聊
- `#group list` - 查看已管理的群组列表
- `#steam-polling` - 手动触发 Steam 状态轮询

### Steam 专用指令
- `#steam-help` - 显示 Steam 相关帮助信息
- `#steam-search <Steam昵称或链接>` - 通过Steam昵称或链接查询Steam ID64
- `#steam-bind <Steam ID> [自定义昵称] [绑定QQ号]` - 绑定 Steam 用户信息
- `#steam-list` - 显示当前绑定的 Steam 用户列表
- `#steam-remove <Steam ID>` - 移除指定的 Steam 绑定数据
- `#steam-reset` - 清空当前群组/用户的 steam 绑定数据

## 🛠 配置说明

### 全局配置
- `cooldownSeconds`: 命令冷却时间（秒）
- `pollingIntervalSeconds`: Steam状态轮询间隔（秒）
- `steamApiKey`: Steam Web API 密钥
- `adminUsers`: 插件管理员用户列表

### 群组配置
- `enabled`: 是否在该群启用插件功能

## 🔧 开发

### 项目结构

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
│   │   └── steam-utils.ts    # Steam 工具函数
│   ├── services/
│   │   ├── steam.service.ts  # Steam API 服务
│   │   ├── steam-cache.service.ts # Steam 缓存服务
│   │   ├── steam-polling.service.ts # Steam 轮询服务
│   │   └── api-service.ts    # WebUI API 路由
│   └── webui/                # React SPA 前端（独立构建）
├── package.json
├── tsconfig.json
└── vite.config.ts
```

### 调试与热重载

```bash
# 一键部署（需安装 napcat-plugin-debug）
pnpm run deploy

# 开发模式（监听文件变化并自动部署）
pnpm run dev
```

## 📊 数据备份

插件会自动备份 Steam 绑定数据：
- 备份文件位于 `../backup/` 目录
- 文件名格式：`steam-bind-data.backup.<时间戳>.json`
- 最多保留 5 个备份文件
- 每次绑定操作后自动执行备份
- 插件启动时如主数据文件损坏，会自动从最新备份恢复

## 📄 许可证

GPL-3

## 🤝 贡献

欢迎提交 Issue 和 Pull Request 来改进本插件。

## 🐛 报告问题

如遇到问题，请在 GitHub 仓库中提交 Issue。

## 📞 支持

如需帮助或有建议，请联系插件作者或在仓库中提交 Issue。
