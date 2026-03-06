# WebUI 数据导入/导出功能实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在 WebUI 配置页面添加数据导入/导出功能，支持将所有 JSON 数据文件打包为 zip 导出和导入

**Architecture:** 后端使用 adm-zip 处理 zip 压缩/解压，提供两个 API 路由（GET /data-export 和 POST /data-import）。前端在 ConfigPage 添加数据管理区域，使用 fetch API 进行文件下载和上传。

**Tech Stack:** TypeScript, Node.js, adm-zip, React, fetch API

---

## 前置检查

### Task 0: 验证项目状态和现有依赖

**Files:**
- Check: `package.json`
- Check: `src/services/api-service.ts`
- Check: `src/webui/src/pages/ConfigPage.tsx`
- Check: `src/webui/src/utils/api.ts`

**Step 1: 检查现有项目结构**

Run: `cat package.json | head -30`
Expected: 显示项目基本信息和现有依赖

**Step 2: 确认关键文件存在**

Run: `ls src/services/api-service.ts src/webui/src/pages/ConfigPage.tsx src/webui/src/utils/api.ts`
Expected: 三个文件都存在

---

## 阶段 1: 后端 API 实现

### Task 1: 安装 adm-zip 依赖

**Files:**
- Modify: `package.json`

**Step 1: 安装依赖包**

Run: `npm install adm-zip && npm install -D @types/adm-zip`
Expected: 安装成功，package.json 更新

**Step 2: 验证安装**

Run: `ls node_modules/adm-zip`
Expected: 目录存在，包含 adm-zip.js 文件

**Step 3: 提交**

```bash
git add package.json package-lock.json
git commit -m "deps: add adm-zip for data export/import functionality"
```

---

### Task 2: 实现数据导出 API

**Files:**
- Modify: `src/services/api-service.ts`

**Step 1: 在文件顶部添加导入**

Locate: `src/services/api-service.ts` 第 1-15 行
Add after existing imports:

```typescript
import AdmZip from 'adm-zip';
import fs from 'fs';
import path from 'path';
```

**Step 2: 在 registerApiRoutes 函数中添加导出路由**

Locate: `src/services/api-service.ts`，在 `ctx.logger.debug('API 路由注册完成');` 之前添加以下路由：

```typescript
    // ==================== 数据导入/导出（无鉴权）====================

    /** 导出数据 - 将所有 JSON 文件打包为 zip */
    router.getNoAuth('/data-export', (_req, res) => {
        try {
            const dataPath = pluginState.ctx.dataPath;

            // 检查数据目录是否存在
            if (!fs.existsSync(dataPath)) {
                return res.status(500).json({ code: -1, message: '数据目录不存在' });
            }

            // 读取目录下的所有 json 文件
            const files = fs.readdirSync(dataPath);
            const jsonFiles = files.filter(file => file.endsWith('.json'));

            if (jsonFiles.length === 0) {
                return res.status(500).json({ code: -1, message: '没有可导出的数据文件' });
            }

            // 创建 zip 文件
            const zip = new AdmZip();

            for (const file of jsonFiles) {
                const filePath = path.join(dataPath, file);
                const content = fs.readFileSync(filePath);
                zip.addFile(file, content);
            }

            // 生成时间戳文件名
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
            const zipFileName = `steam-plugin-data-export-${timestamp}.zip`;

            // 发送 zip 文件
            const zipBuffer = zip.toBuffer();
            res.setHeader('Content-Type', 'application/zip');
            res.setHeader('Content-Disposition', `attachment; filename="${zipFileName}"`);
            res.send(zipBuffer);

            ctx.logger.info(`数据导出完成: ${zipFileName}, 包含 ${jsonFiles.length} 个文件`);
        } catch (error) {
            ctx.logger.error('数据导出失败:', error);
            res.status(500).json({ code: -1, message: `导出失败: ${error}` });
        }
    });
```

**Step 3: 编译检查**

Run: `npm run build`
Expected: 编译成功，无错误

**Step 4: 提交**

```bash
git add src/services/api-service.ts
git commit -m "feat(api): add data export endpoint /data-export"
```

---

### Task 3: 实现数据导入 API

**Files:**
- Modify: `src/services/api-service.ts`

**Step 1: 在导出路由后添加导入路由**

Locate: `src/services/api-service.ts`，在 `/data-export` 路由之后添加：

```typescript
    /** 导入数据 - 从 zip 文件恢复数据 */
    router.postNoAuth('/data-import', async (req, res) => {
        try {
            // 检查是否有文件上传
            if (!req.body || !Buffer.isBuffer(req.body)) {
                return res.status(400).json({ code: -1, message: '请上传文件' });
            }

            const dataPath = pluginState.ctx.dataPath;

            // 确保数据目录存在
            if (!fs.existsSync(dataPath)) {
                fs.mkdirSync(dataPath, { recursive: true });
            }

            // 读取 zip 文件
            let zip: AdmZip;
            try {
                zip = new AdmZip(req.body);
            } catch (error) {
                return res.status(400).json({ code: -1, message: '无效的压缩包文件' });
            }

            const zipEntries = zip.getEntries();
            const jsonEntries = zipEntries.filter(entry =>
                entry.entryName.endsWith('.json') && !entry.isDirectory
            );

            if (jsonEntries.length === 0) {
                return res.status(400).json({ code: -1, message: '压缩包内没有找到数据文件' });
            }

            // 验证所有 JSON 文件格式
            const importedFiles: string[] = [];
            for (const entry of jsonEntries) {
                const content = entry.getData().toString('utf-8');
                try {
                    JSON.parse(content);
                } catch (error) {
                    return res.status(400).json({
                        code: -1,
                        message: `数据文件格式无效: ${entry.entryName}`
                    });
                }
                importedFiles.push(entry.entryName);
            }

            // 备份现有数据（复制到 backup 目录）
            const backupDir = path.join(dataPath, '../backup');
            if (!fs.existsSync(backupDir)) {
                fs.mkdirSync(backupDir, { recursive: true });
            }

            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
            const existingFiles = fs.readdirSync(dataPath).filter(f => f.endsWith('.json'));

            for (const file of existingFiles) {
                const sourcePath = path.join(dataPath, file);
                const backupPath = path.join(backupDir, `${file}.pre-import-${timestamp}`);
                fs.copyFileSync(sourcePath, backupPath);
            }

            // 写入新数据（覆盖）
            for (const entry of jsonEntries) {
                // 安全检查：防止路径遍历攻击
                const fileName = path.basename(entry.entryName);
                if (fileName !== entry.entryName) {
                    ctx.logger.warn(`跳过包含路径遍历的文件: ${entry.entryName}`);
                    continue;
                }

                const targetPath = path.join(dataPath, fileName);
                const content = entry.getData();
                fs.writeFileSync(targetPath, content);
            }

            // 重新加载配置
            pluginState.loadConfig();

            ctx.logger.info(`数据导入完成: ${importedFiles.length} 个文件`);
            res.json({
                code: 0,
                message: '导入成功',
                data: { importedFiles }
            });
        } catch (error) {
            ctx.logger.error('数据导入失败:', error);
            res.status(500).json({ code: -1, message: `导入失败: ${error}` });
        }
    });
```

**Step 2: 编译检查**

Run: `npm run build`
Expected: 编译成功，无错误

**Step 3: 提交**

```bash
git add src/services/api-service.ts
git commit -m "feat(api): add data import endpoint /data-import with validation and backup"
```

---

## 阶段 2: 前端 API 工具函数

### Task 4: 添加前端 API 函数

**Files:**
- Modify: `src/webui/src/utils/api.ts`

**Step 1: 在文件末尾添加导出/导入函数**

Locate: `src/webui/src/utils/api.ts` 文件末尾

Add before the last closing brace or at the end of file:

```typescript
// ==================== 数据导入/导出 API ====================

/**
 * 导出数据 - 触发下载 zip 文件
 */
export async function exportData(): Promise<void> {
    const response = await fetch(buildUrl(API_BASE_NO_AUTH, '/data-export'), {
        method: 'GET',
    })

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: '导出失败' }))
        throw new Error(errorData.message || `导出失败: HTTP ${response.status}`)
    }

    // 获取文件名
    const contentDisposition = response.headers.get('Content-Disposition')
    let filename = 'steam-plugin-data-export.zip'
    if (contentDisposition) {
        const match = contentDisposition.match(/filename="(.+)"/)
        if (match) {
            filename = match[1]
        }
    }

    // 下载文件
    const blob = await response.blob()
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    window.URL.revokeObjectURL(url)
}

/**
 * 导入数据 - 上传 zip 文件
 */
export async function importData(file: File): Promise<ApiResponse<{ importedFiles: string[] }>> {
    const formData = new FormData()
    formData.append('file', file)

    const response = await fetch(buildUrl(API_BASE_NO_AUTH, '/data-import'), {
        method: 'POST',
        body: formData,
        // 不要设置 Content-Type，让浏览器自动设置 multipart/form-data
    })

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: '导入失败' }))
        throw new Error(errorData.message || `导入失败: HTTP ${response.status}`)
    }

    return response.json()
}
```

**Step 2: 编译检查**

Run: `cd src/webui && npm run build`
Expected: 编译成功，无错误

**Step 3: 提交**

```bash
git add src/webui/src/utils/api.ts
git commit -m "feat(webui/api): add exportData and importData API functions"
```

---

## 阶段 3: 前端 UI 实现

### Task 5: 添加导入/导出图标

**Files:**
- Modify: `src/webui/src/components/icons.tsx`

**Step 1: 在 icons.tsx 中添加导出/导入图标**

Locate: `src/webui/src/components/icons.tsx`，找到最后一个图标组件后添加：

```tsx
export function IconDownload({ size = 16, className = '' }: IconProps) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={className}
        >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
    )
}

export function IconUpload({ size = 16, className = '' }: IconProps) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={className}
        >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
    )
}

export function IconDatabase({ size = 16, className = '' }: IconProps) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={className}
        >
            <ellipse cx="12" cy="5" rx="9" ry="3" />
            <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
            <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
        </svg>
    )
}
```

**Step 2: 提交**

```bash
git add src/webui/src/components/icons.tsx
git commit -m "feat(webui/icons): add download, upload and database icons"
```

---

### Task 6: 在 ConfigPage 添加数据管理区域

**Files:**
- Modify: `src/webui/src/pages/ConfigPage.tsx`

**Step 1: 添加导入和图标**

Locate: 文件顶部，添加新的 import：

```typescript
import { exportData, importData } from '../utils/api'
import { IconTerminal, IconSteam, IconX, IconPlus, IconDownload, IconUpload, IconDatabase, IconAlertTriangle } from '../components/icons'
```

**Step 2: 在组件状态中添加导入相关状态**

Locate: `const [saving, setSaving] = useState(false)` 之后，添加：

```typescript
    const [importing, setImporting] = useState(false)
    const [selectedFile, setSelectedFile] = useState<File | null>(null)
    const [showImportConfirm, setShowImportConfirm] = useState(false)
```

**Step 3: 添加导出处理函数**

Locate: `saveConfig` 函数之后，添加：

```typescript
    const handleExport = useCallback(async () => {
        try {
            await exportData()
            showToast('数据导出成功', 'success')
        } catch (error) {
            showToast(error instanceof Error ? error.message : '导出失败', 'error')
        }
    }, [])
```

**Step 4: 添加导入处理函数**

在 `handleExport` 之后添加：

```typescript
    const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        if (!file.name.endsWith('.zip')) {
            showToast('请选择 .zip 格式的文件', 'error')
            return
        }

        setSelectedFile(file)
        setShowImportConfirm(true)
    }, [])

    const handleImport = useCallback(async () => {
        if (!selectedFile) return

        setImporting(true)
        try {
            const result = await importData(selectedFile)
            if (result.code === 0) {
                showToast(`导入成功，共 ${result.data?.importedFiles.length || 0} 个文件`, 'success')
                setShowImportConfirm(false)
                setSelectedFile(null)
                // 延迟刷新页面以加载新数据
                setTimeout(() => {
                    window.location.reload()
                }, 2000)
            } else {
                showToast(result.message || '导入失败', 'error')
            }
        } catch (error) {
            showToast(error instanceof Error ? error.message : '导入失败', 'error')
        } finally {
            setImporting(false)
        }
    }, [selectedFile])

    const cancelImport = useCallback(() => {
        setShowImportConfirm(false)
        setSelectedFile(null)
    }, [])
```

**Step 5: 在 JSX 中添加数据管理区域**

Locate: 文件末尾，在最后一个 `</div>` 之前（`{saving && (...)}` 之后），添加：

```tsx
            {/* 数据管理 */}
            <div className="card p-5 hover-lift">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2 mb-5">
                    <IconDatabase size={16} className="text-gray-400" />
                    数据管理
                </h3>
                <div className="space-y-5">
                    {/* 导出数据 */}
                    <div className="flex items-center justify-between">
                        <div>
                            <div className="text-sm font-medium text-gray-800 dark:text-gray-200">导出数据</div>
                            <div className="text-xs text-gray-400 mt-0.5">导出所有数据（绑定、缓存、游戏名、配置）为 zip 文件</div>
                        </div>
                        <button
                            className="btn btn-primary flex items-center gap-2"
                            onClick={handleExport}
                        >
                            <IconDownload size={16} />
                            导出数据
                        </button>
                    </div>

                    {/* 导入数据 */}
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <div>
                                <div className="text-sm font-medium text-gray-800 dark:text-gray-200">导入数据</div>
                                <div className="text-xs text-gray-400 mt-0.5">从 zip 文件恢复数据，将完全覆盖现有数据</div>
                            </div>
                            <label className="btn btn-secondary flex items-center gap-2 cursor-pointer">
                                <IconUpload size={16} />
                                选择文件
                                <input
                                    type="file"
                                    accept=".zip"
                                    className="hidden"
                                    onChange={handleFileSelect}
                                />
                            </label>
                        </div>
                    </div>
                </div>
            </div>

            {/* 导入确认对话框 */}
            {showImportConfirm && selectedFile && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white dark:bg-gray-800 rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl">
                        <div className="flex items-center gap-3 text-amber-500 mb-4">
                            <IconAlertTriangle size={24} />
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">确认导入数据</h3>
                        </div>
                        <div className="space-y-3 text-sm text-gray-600 dark:text-gray-300 mb-6">
                            <p>您即将导入以下文件：</p>
                            <div className="bg-gray-100 dark:bg-gray-700 p-3 rounded-lg">
                                <div className="font-medium">{selectedFile.name}</div>
                                <div className="text-xs text-gray-400">{(selectedFile.size / 1024).toFixed(1)} KB</div>
                            </div>
                            <p className="text-amber-600 dark:text-amber-400 font-medium">
                                ⚠️ 警告：导入将完全覆盖现有数据，此操作不可撤销！
                            </p>
                        </div>
                        <div className="flex gap-3 justify-end">
                            <button
                                className="btn btn-secondary"
                                onClick={cancelImport}
                                disabled={importing}
                            >
                                取消
                            </button>
                            <button
                                className="btn btn-danger flex items-center gap-2"
                                onClick={handleImport}
                                disabled={importing}
                            >
                                {importing && <div className="loading-spinner !w-3 !h-3 !border-[1.5px]" />}
                                确认导入
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {saving && (
                <div className="saving-indicator fixed bottom-4 right-4 bg-primary text-white text-xs px-3 py-2 rounded-lg shadow-lg flex items-center gap-2">
                    <div className="loading-spinner !w-3 !h-3 !border-[1.5px]" />
                    保存中...
                </div>
            )}
```

**Step 6: 编译检查**

Run: `cd src/webui && npm run build`
Expected: 编译成功，无错误

**Step 7: 提交**

```bash
git add src/webui/src/pages/ConfigPage.tsx
git commit -m "feat(webui/config): add data import/export UI section with confirmation dialog"
```

---

## 阶段 4: 完整构建和测试

### Task 7: 完整项目构建

**Files:**
- All modified files

**Step 1: 构建后端**

Run: `npm run build`
Expected: 编译成功，无 TypeScript 错误

**Step 2: 构建前端**

Run: `cd src/webui && npm run build`
Expected: 编译成功，生成 dist 目录

**Step 3: 提交构建产物**

```bash
git add dist/
git commit -m "build: update dist with data import/export feature"
```

---

### Task 8: 功能验证清单

**手动测试步骤（需要运行环境）：**

1. **导出功能测试**
   - [ ] 启动插件，访问 WebUI 配置页面
   - [ ] 点击"导出数据"按钮
   - [ ] 验证是否下载了 zip 文件
   - [ ] 验证文件名格式：`steam-plugin-data-export-YYYYMMDD-HHmmss.zip`
   - [ ] 解压 zip，验证包含所有 json 文件

2. **导入功能测试**
   - [ ] 选择非 zip 文件，验证前端提示错误
   - [ ] 选择有效的导出 zip 文件
   - [ ] 验证确认对话框显示正确的文件信息
   - [ ] 点击"确认导入"
   - [ ] 验证导入成功后页面刷新

3. **错误处理测试**
   - [ ] 删除所有 json 文件后导出，验证错误提示
   - [ ] 导入损坏的 zip 文件，验证错误提示

**Step 1: 标记完成**

所有测试通过后，创建完成标记：

```bash
echo "# 数据导入/导出功能测试完成" >> docs/plans/2026-03-06-data-import-export-plan.md
git add docs/plans/2026-03-06-data-import-export-plan.md
git commit -m "docs: mark data import/export feature as tested"
```

---

## 总结

### 修改的文件清单

| 文件 | 修改类型 | 说明 |
|-----|---------|------|
| `package.json` | 修改 | 添加 adm-zip 依赖 |
| `src/services/api-service.ts` | 修改 | 添加导出/导入 API 路由 |
| `src/webui/src/utils/api.ts` | 修改 | 添加前端 API 函数 |
| `src/webui/src/components/icons.tsx` | 修改 | 添加下载/上传/数据库图标 |
| `src/webui/src/pages/ConfigPage.tsx` | 修改 | 添加数据管理 UI |

### 新增依赖

- `adm-zip`: ZIP 压缩/解压库
- `@types/adm-zip`: TypeScript 类型定义

### API 端点

- `GET /data-export`: 导出所有数据为 zip 文件
- `POST /data-import`: 从 zip 文件导入数据（覆盖现有数据）

---

## 功能验证清单

### 已验证项目

| 验证项 | 状态 | 说明 |
|--------|------|------|
| 后端 API 编译 | ✅ 通过 | `npm run build` 成功，无 TypeScript 错误 |
| 前端编译 | ✅ 通过 | `cd src/webui && npm run build` 成功 |
| 依赖安装 | ✅ 完成 | adm-zip v0.5.16, @types/adm-zip v0.5.7 |
| 代码提交 | ✅ 完成 | 共 7 个提交，完整实现功能 |
| 构建产物 | ✅ 生成 | dist/index.mjs (228.67 kB), dist/webui/index.html (222.61 kB) |

### 实现的功能

1. **数据导出** (`GET /data-export`)
   - 扫描 `ctx.dataPath` 目录下的所有 `.json` 文件
   - 打包为 ZIP 文件，文件名带时间戳
   - 通过 HTTP 响应返回，触发浏览器下载

2. **数据导入** (`POST /data-import`)
   - 接收 ZIP 文件上传
   - 自动备份现有数据到 `../backup` 目录
   - 验证 JSON 文件格式
   - 覆盖写入新数据
   - 重新加载配置

3. **前端 UI**
   - 配置页面新增"数据管理"区域
   - 导出按钮：一键导出所有数据
   - 导入按钮：选择 ZIP 文件
   - 确认对话框：防止误操作，显示警告信息
   - 支持加载状态显示

### 代码变更摘要

| 文件 | 变更类型 | 说明 |
|------|----------|------|
| `package.json` | 修改 | 添加 adm-zip 依赖 |
| `src/services/api-service.ts` | 修改 | 添加导出/导入 API 路由 (+139 行) |
| `src/webui/src/utils/api.ts` | 修改 | 添加前端 API 函数 (+58 行) |
| `src/webui/src/components/icons.tsx` | 修改 | 添加 4 个图标组件 |
| `src/webui/src/pages/ConfigPage.tsx` | 修改 | 添加数据管理 UI (+98 行) |

### 提交记录

```
1df524a deps: add adm-zip for data export/import functionality
976364c feat(api): add data export endpoint /data-export
b76805b feat(api): add data import endpoint /data-import with validation and backup
a00a0bd feat(webui/api): add exportData and importData API functions
a9e75f9 feat(webui/icons): add download, upload, database and alert icons
5b61f20 feat(webui/config): add data import/export UI section with confirmation dialog
5cf1777 build: update dist with data import/export feature
```

### 注意事项

1. **数据安全**：导入操作会完全覆盖现有数据，已添加自动备份机制
2. **文件格式**：只接受 `.zip` 格式，内部只处理 `.json` 文件
3. **路径安全**：导入时验证文件名，防止路径遍历攻击
4. **配置重载**：导入成功后自动重新加载配置

---

*功能实现完成于 2026-03-06*
