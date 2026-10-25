# 0003 · WebUI 头像走后端同源代理, 不直连 Steam CDN

## 状态

已采纳 (2026-10-25)

## 背景与问题

WebUI 绑定页最初用 `<img src="https://avatars.steamstatic.com/...">` 直接展示 `face` 字段。NapCat WebUI 宿主页面的 CSP 拦截了外部图片来源, 导致头像无法显示; 即使没有 CSP, 观看端网络也必须能直连 Steam CDN。

Steam CDN 本身返回 `access-control-allow-origin: *`, 且 `<img>` 是 no-cors 请求, 因此这不是 CORS 问题; 真正需要解决的是**图片加载来源必须是同源**。

## 被放弃的方案与理由

- **直连 CDN + `onError` 占位**: CSP 在请求发出前就拦截, 前端兜底只能决定失败后的样子, 不能让头像显示出来。
- **通用 URL 图片代理 (`?url=...`)**: 任意地址转发会引入 SSRF 面, 需要额外的内网地址过滤; 本场景只需要取绑定用户的头像。
- **下载头像到 `dataPath` 并用静态路由托管**: 头像仅数 KB 且 URL 内容寻址, 落盘会引入文件生命周期、清理与备份问题, 收益不足。
- **在 `/steam-binds` 响应里内联 base64**: 撑大列表响应, 污染 API 形态; 且宿主 CSP 未必放行 `data:`。

## 结论

- 新增同源、无鉴权端点 `GET /plugin/<plugin-id>/api/steam-avatar/:steamId`: 仅接受绑定表内的 Steam ID, 从绑定记录读取 `face`, 只允许 `https://avatars.steamstatic.com/`, 上游失败时返回旧缓存或 502。
- 头像字节缓存在进程内存中 (按 `face` URL 索引), 响应带 `ETag` 与 `Cache-Control: max-age=300`; 因此换头像最多约 5 分钟可见。
- `face` 仍是唯一的头像来源地址, 继续供服务端 SVG 通知卡片使用; WebUI 不修改绑定数据结构, 只把展示地址换成同源代理端点。
- 轮询已获取全部绑定用户的 `avatarmedium`, 发现地址变化时写回绑定记录, 使头像能自动跟随 Steam 变更。
- 失败时前端复用 `IconSteam` 占位, 不回退 CDN 直连。

## 后果

- WebUI 头像不再依赖观看端能否访问 Steam CDN, 代价是 NapCat 宿主进程必须能访问 `avatars.steamstatic.com`。
- 若宿主 CSP 连同源图片也不放行, 本方案无效, 需宿主侧调整策略。
