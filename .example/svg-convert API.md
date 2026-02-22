# SVG 渲染插件 API 文档

## 基础信息

- **Base URL**: `/plugin/napcat-plugin-svg-render/api`
- **认证方式**: 无需认证（NoAuth）
- **数据格式**: JSON
- **响应格式**: 统一返回格式

### 统一响应格式

```typescript
interface ApiResponse<T> {
  code: number;      // 0 表示成功，-1 表示失败
  data?: T;          // 成功时返回的数据
  message?: string;  // 失败时的错误信息
}
```

---

## SVG 渲染 API

### 1. 获取服务状态

检查 rsvg-convert 工具是否已安装。

**请求**:

```http
GET /svg/status
```

**响应**:

```json
{
  "code": 0,
  "data": {
    "installed": true,
    "version": "rsvg-convert version 2.50.0"
  }
}
```

**字段说明**:

| 字段 | 类型 | 说明 |
|------|------|------|
| installed | boolean | rsvg-convert 是否已安装 |
| version | string | 版本信息（未安装时为 undefined） |

**错误响应**:

```json
{
  "code": -1,
  "message": "获取状态失败: ..."
}
```

---

### 2. 渲染 SVG

将 SVG 代码渲染为 PNG 图片。

**请求**:

```http
POST /svg/render
Content-Type: application/json

{
  "svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"100\" height=\"100\"><rect width=\"100\" height=\"100\" fill=\"red\"/></svg>",
  "saveWebImage": false
}
```

**请求参数**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| svg | string | 是 | SVG 代码字符串 |
| saveWebImage | boolean | 否 | 是否保存网络图片到缓存（默认 false） |

**响应**:

```json
{
  "code": 0,
  "data": {
    "imageBase64": "data:image/png;base64,iVBORw0KG...",
    "format": "png"
  }
}
```

**字段说明**:

| 字段 | 类型 | 说明 |
|------|------|------|
| imageBase64 | string | Base64 编码的 PNG 图片（包含 data:image/png;base64, 前缀） |
| format | string | 图片格式（固定为 "png"） |

**错误响应**:

```json
{
  "code": -1,
  "message": "rsvg-convert 未安装，请先安装 librsvg 工具"
}
```

```json
{
  "code": -1,
  "message": "SVG 内容过大，最大支持 1MB"
}
```

```json
{
  "code": -1,
  "message": "生成的图片过大，最大支持 10MB"
}
```

**外部图片处理**:

当 SVG 中包含 `<image href="http://...">` 或 `<image xlink:href="http://...">` 时：

- 插件会自动下载网络图片
- 如果 `saveWebImage` 为 `true`，图片会被保存到缓存目录，下次直接使用
- 如果 `saveWebImage` 为 `false` 或未指定，图片下载到临时目录，渲染后删除

**使用示例**:

```bash
# curl 示例
curl -X POST http://localhost:6099/plugin/napcat-plugin-svg-render/api/svg/render \
  -H "Content-Type: application/json" \
  -d '{
    "svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"100\" height=\"100\"><rect width=\"100\" height=\"100\" fill=\"red\"/></svg>"
  }'
```

```javascript
// JavaScript 示例
const response = await fetch('/plugin/napcat-plugin-svg-render/api/svg/render', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    svg: '<svg>...</svg>',
    saveWebImage: true
  })
});

const result = await response.json();
if (result.code === 0) {
  // 使用渲染后的图片
  const img = document.createElement('img');
  img.src = result.data.imageBase64;
  document.body.appendChild(img);
}
```

---

## 缓存管理 API

### 1. 获取缓存列表

获取所有缓存的网络图片列表和统计信息。

**请求**:

```http
GET /cache/list
```

**响应**:

```json
{
  "code": 0,
  "data": {
    "list": [
      {
        "url": "https://example.com/image.png",
        "localPath": "/path/to/data/cache-image/img_xxx.png",
        "size": 10240,
        "mtime": "2024-01-01T00:00:00.000Z"
      }
    ],
    "stats": {
      "count": 1,
      "size": 10240
    },
    "maxSize": 50
  }
}
```

**字段说明**:

| 字段 | 类型 | 说明 |
|------|------|------|
| list | array | 缓存列表 |
| list[].url | string | 原始网络图片 URL |
| list[].localPath | string | 本地缓存路径 |
| list[].size | number | 文件大小（字节） |
| list[].mtime | string | 最后修改时间（ISO 格式） |
| stats.count | number | 缓存文件数量 |
| stats.size | number | 缓存总大小（字节） |
| maxSize | number | 最大缓存大小（MB） |

---

### 2. 设置最大缓存大小

设置缓存目录的最大容量（MB）。

**请求**:

```http
POST /cache/settings
Content-Type: application/json

{
  "maxSize": 100
}
```

**请求参数**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| maxSize | number | 是 | 最大缓存大小（MB），范围 10-500 |

**响应**:

```json
{
  "code": 0,
  "message": "最大缓存大小已设置为 100MB"
}
```

**错误响应**:

```json
{
  "code": -1,
  "message": "缓存大小必须在 10MB 到 500MB 之间"
}
```

---

### 3. 删除单个缓存

删除指定的缓存图片。

**请求**:

```http
POST /cache/delete
Content-Type: application/json

{
  "url": "https://example.com/image.png"
}
```

**请求参数**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| url | string | 是 | 要删除的缓存图片 URL |

**响应**:

```json
{
  "code": 0,
  "message": "缓存已删除"
}
```

**错误响应**:

```json
{
  "code": -1,
  "message": "缓存不存在"
}
```

---

### 4. 清空所有缓存

删除所有缓存的图片。

**请求**:

```http
POST /cache/clear
```

**响应**:

```json
{
  "code": 0,
  "data": {
    "deleted": 10,
    "errors": 0
  },
  "message": "已清空 10 个缓存，失败 0 个"
}
```

**字段说明**:

| 字段 | 类型 | 说明 |
|------|------|------|
| deleted | number | 成功删除的数量 |
| errors | number | 删除失败的数量 |

---

### 5. 查看缓存图片

获取缓存图片的 base64 数据，用于预览。

**请求**:

```http
GET /cache/image?url=https://example.com/image.png
```

**请求参数**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| url | string | 是 | 缓存图片的原始 URL |

**响应**:

```json
{
  "code": 0,
  "data": {
    "imageBase64": "data:image/png;base64,iVBORw0KG..."
  }
}
```

**错误响应**:

```json
{
  "code": -1,
  "message": "缓存图片不存在"
}
```

---

## 错误码

| code | 说明 |
|------|------|
| 0 | 成功 |
| -1 | 失败（具体原因见 message 字段） |

**常见错误信息**:

- `rsvg-convert 未安装，请先安装 librsvg 工具` - 需要安装 rsvg-convert
- `SVG 内容过大，最大支持 1MB` - SVG 文件超过大小限制
- `生成的图片过大，最大支持 10MB` - 渲染后的图片过大
- `图片过大，最大支持 5MB` - 网络图片超过大小限制
- `缺少 svg 参数` - 请求缺少必填参数
- `缺少 url 参数` - 缓存操作缺少 URL 参数
- `缓存大小必须在 10MB 到 500MB 之间` - 缓存大小设置超出范围
- `缓存不存在` - 指定的缓存文件不存在

---

## 使用示例

### 完整渲染流程

```javascript
// 1. 检查服务状态
const statusRes = await fetch('/plugin/napcat-plugin-svg-render/api/svg/status');
const status = await statusRes.json();

if (status.code !== 0 || !status.data.installed) {
  console.error('rsvg-convert 未安装');
  return;
}

// 2. 渲染 SVG（带图片缓存）
const svgCode = `
  <svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">
    <image href="https://example.com/logo.png" width="200" height="200"/>
    <text x="50%" y="50%" text-anchor="middle" fill="white">Hello</text>
  </svg>
`;

const renderRes = await fetch('/plugin/napcat-plugin-svg-render/api/svg/render', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    svg: svgCode,
    saveWebImage: true  // 保存网络图片到缓存
  })
});

const renderResult = await renderRes.json();

if (renderResult.code === 0) {
  // 显示渲染结果
  const img = document.createElement('img');
  img.src = renderResult.data.imageBase64;
  document.body.appendChild(img);
} else {
  console.error('渲染失败:', renderResult.message);
}

// 3. 查看缓存列表
const cacheRes = await fetch('/plugin/napcat-plugin-svg-render/api/cache/list');
const cacheData = await cacheRes.json();

if (cacheData.code === 0) {
  console.log(`缓存数量: ${cacheData.data.stats.count}`);
  console.log(`缓存大小: ${(cacheData.data.stats.size / 1024 / 1024).toFixed(2)} MB`);
}
```

---

## 注意事项

1. **安全性**: 所有 API 都使用 `getNoAuth`/`postNoAuth` 注册，无需额外认证
2. **超时**: 网络图片下载和 SVG 渲染都有 30 秒超时
3. **大小限制**: 
   - SVG 输入最大 1MB
   - 渲染输出最大 10MB
   - 单个网络图片最大 5MB
4. **缓存清理**: 当缓存超过设定大小时，会自动删除最旧的文件
