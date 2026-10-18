# generateHelp — 帮助产物生成

通过外部渲染服务 `napcat-help-generate` 生成帮助图片与文本, 落盘到本插件。

## 用法

```bash
pnpm run help:generate
```

## 产物

- `src/handlers/help/helpData.generated.ts` — 结构化数据 (`HELP_PANELS: Cmd[]`,
  汇总所有面板), 供 WebUI 帮助文档页 (`GET /help`) 消费。**不依赖渲染服务**,
  始终最先落盘, 服务不可用时仍会产出。
- `src/assets/{cmdId}-{Role}.png` — 帮助图片 (按权限组三张)。
- `src/handlers/commands/helpText.generated.ts` — 文本帮助映射。

## 权威源

- 每个帮助面板一个文件: `cmds/*.ts` (类型见 `cmd.ts`, 单一权威源在
  `packages/shared/src/help.ts`, 与上游 `napcat-help-generate/src/types/cmd.ts` 手工同步)。
- 修改帮助内容只改权威源, 重新执行生成; 产物 (`src/handlers/help/helpData.generated.ts`、
  `src/assets/*.png`、`src/handlers/*/helpText.generated.ts`) 一律禁止手改。
- 新增面板: 在 `cmds/` 建配置, 并在 `index.ts` 的 `CMD_TARGETS` 注册
  (cmd 配置 + 落盘 handler 目录)。

## 上游渲染服务

默认约定: 渲染服务与本仓库同级目录下的 `napcat-help-generate`。

路径与端口解析顺序:

- 服务目录: 环境变量 `HELP_GENERATOR_ROOT` → 同级 `napcat-help-generate`。
- 端口: 环境变量 `HELP_GENERATOR_PORT` → 上游 `.env` 的 `PORT` → `3366`。

服务未运行时脚本会自动在服务目录执行 `pnpm start` 并在结束后关闭本次自启的实例;
已在运行的实例会被复用且不会被关闭。

## 首次运行前提

1. 上游 `napcat-help-generate` 已完成 `pnpm install`。
2. 上游已安装浏览器内核: 在上游目录执行 `npx playwright install chromium`。
