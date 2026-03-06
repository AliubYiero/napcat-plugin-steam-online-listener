/**
 * API 服务模块
 * 注册 WebUI API 路由
 *
 * 路由类型说明：
 * ┌─────────────────┬──────────────────────────────────────────────┬─────────────────┐
 * │ 类型            │ 路径前缀                                      │ 注册方法        │
 * ├─────────────────┼──────────────────────────────────────────────┼─────────────────┤
 * │ 需要鉴权 API    │ /api/Plugin/ext/<plugin-id>/                 │ router.get/post │
 * │ 无需鉴权 API    │ /plugin/<plugin-id>/api/                     │ router.getNoAuth│
 * │ 静态文件        │ /plugin/<plugin-id>/files/<urlPath>/         │ router.static   │
 * │ 内存文件        │ /plugin/<plugin-id>/mem/<urlPath>/           │ router.staticOnMem│
 * │ 页面            │ /plugin/<plugin-id>/page/<path>             │ router.page     │
 * └─────────────────┴──────────────────────────────────────────────┴─────────────────┘
 *
 * 一般插件自带的 WebUI 页面使用 NoAuth 路由，因为页面本身已在 NapCat WebUI 内嵌展示。
 */

import type {
    NapCatPluginContext,
    PluginHttpRequest,
    PluginHttpResponse
} from 'napcat-types/napcat-onebot/network/plugin/types';
import { pluginState } from '../core/state';
import { steamService } from './steam.service';
import {
    loadSteamBindData,
    saveSteamBindData,
    findSteamBindItem,
    updateSteamBindItem
} from '../handlers/steam-utils';
import type { FromInfo } from '../types';
import { gameNameService } from './game-name.service';
import AdmZip from 'adm-zip';
import fs from 'fs';
import path from 'path';

/**
 * 注册 API 路由
 */
export function registerApiRoutes(ctx: NapCatPluginContext): void {
    const router = ctx.router;

    // ==================== 插件信息（无鉴权）====================

    /** 获取插件状态 */
    router.getNoAuth('/status', (_req, res) => {
        res.json({
            code: 0,
            data: {
                pluginName: ctx.pluginName,
                uptime: pluginState.getUptime(),
                uptimeFormatted: pluginState.getUptimeFormatted(),
                config: pluginState.config,
                stats: pluginState.stats,
            },
        });
    });

    // ==================== 配置管理（无鉴权）====================

    /** 获取配置 */
    router.getNoAuth('/config', (_req, res) => {
        res.json({ code: 0, data: pluginState.config });
    });

    /** 保存配置 */
    router.postNoAuth('/config', async (req, res) => {
        try {
            const body = req.body as Record<string, unknown> | undefined;
            if (!body) {
                return res.status(400).json({ code: -1, message: '请求体为空' });
            }
            pluginState.updateConfig(body as Partial<import('../types').PluginConfig>);
            ctx.logger.info('配置已保存');
            res.json({ code: 0, message: 'ok' });
        } catch (err) {
            ctx.logger.error('保存配置失败:', err);
            res.status(500).json({ code: -1, message: String(err) });
        }
    });

    // ==================== 群管理（无鉴权）====================

    /** 获取群列表（附带各群启用状态） */
    router.getNoAuth('/groups', async (_req, res) => {
        try {
            const groups = await ctx.actions.call(
                'get_group_list',
                {},
                ctx.adapterName,
                ctx.pluginManager.config
            ) as Array<{ group_id: number; group_name: string; member_count: number; max_member_count: number }>;

            const groupsWithConfig = (groups || []).map((group) => {
                const groupId = String(group.group_id);
                return {
                    group_id: group.group_id,
                    group_name: group.group_name,
                    member_count: group.member_count,
                    max_member_count: group.max_member_count,
                    enabled: pluginState.isGroupEnabled(groupId),
                };
            });

            res.json({ code: 0, data: groupsWithConfig });
        } catch (e) {
            ctx.logger.error('获取群列表失败:', e);
            res.status(500).json({ code: -1, message: String(e) });
        }
    });

    /** 更新单个群配置 */
    router.postNoAuth('/groups/:id/config', async (req, res) => {
        try {
            const groupId = req.params?.id;
            if (!groupId) {
                return res.status(400).json({ code: -1, message: '缺少群 ID' });
            }

            const body = req.body as Record<string, unknown> | undefined;
            const enabled = body?.enabled;
            pluginState.updateGroupConfig(groupId, { enabled: Boolean(enabled) });
            ctx.logger.info(`群 ${groupId} 配置已更新: enabled=${enabled}`);
            res.json({ code: 0, message: 'ok' });
        } catch (err) {
            ctx.logger.error('更新群配置失败:', err);
            res.status(500).json({ code: -1, message: String(err) });
        }
    });

    /** 批量更新群配置 */
    router.postNoAuth('/groups/bulk-config', async (req, res) => {
        try {
            const body = req.body as Record<string, unknown> | undefined;
            const { enabled, groupIds } = body || {};

            if (typeof enabled !== 'boolean' || !Array.isArray(groupIds)) {
                return res.status(400).json({ code: -1, message: '参数错误' });
            }

            for (const groupId of groupIds) {
                pluginState.updateGroupConfig(String(groupId), { enabled });
            }

            ctx.logger.info(`批量更新群配置完成 | 数量: ${groupIds.length}, enabled=${enabled}`);
            res.json({ code: 0, message: 'ok' });
        } catch (err) {
            ctx.logger.error('批量更新群配置失败:', err);
            res.status(500).json({ code: -1, message: String(err) });
        }
    });

    // 管理员用户管理相关API
    /** 获取管理员用户列表 */
    router.getNoAuth('/admin-users', (_req, res) => {
        try {
            res.json({ code: 0, data: pluginState.config.adminUsers || [] });
        } catch (err) {
            ctx.logger.error('获取管理员用户列表失败:', err);
            res.status(500).json({ code: -1, message: String(err) });
        }
    });

    /** 添加管理员用户 */
    router.postNoAuth('/admin-users', async (req, res) => {
        try {
            const body = req.body as Record<string, unknown> | undefined;
            const { userId } = body || {};
            
            if (!userId || typeof userId !== 'string') {
                return res.status(400).json({ code: -1, message: '用户ID不能为空且必须为字符串' });
            }

            const adminUsers = [...(pluginState.config.adminUsers || [])];
            if (!adminUsers.includes(userId)) {
                adminUsers.push(userId);
                pluginState.updateConfig({ adminUsers });
            }

            ctx.logger.info(`用户 ${userId} 已被添加为管理员`);
            res.json({ code: 0, message: '添加管理员成功', data: adminUsers });
        } catch (err) {
            ctx.logger.error('添加管理员用户失败:', err);
            res.status(500).json({ code: -1, message: String(err) });
        }
    });

    /** 删除管理员用户 */
    router.deleteNoAuth('/admin-users/:userId', async (req, res) => {
        try {
            const userId = req.params?.userId;
            if (!userId) {
                return res.status(400).json({ code: -1, message: '用户ID不能为空' });
            }

            const adminUsers = [...(pluginState.config.adminUsers || [])];
            const index = adminUsers.indexOf(userId);
            if (index !== -1) {
                adminUsers.splice(index, 1);
                pluginState.updateConfig({ adminUsers });
            }

            ctx.logger.info(`用户 ${userId} 已被移除管理员权限`);
            res.json({ code: 0, message: '移除管理员成功', data: adminUsers });
        } catch (err) {
            ctx.logger.error('移除管理员用户失败:', err);
            res.status(500).json({ code: -1, message: String(err) });
        }
    });

    // ==================== Steam 绑定管理（无鉴权）====================

    /** 获取 Steam 绑定列表 */
    router.getNoAuth('/steam-binds', (req, res) => {
        try {
            const { fromId, type } = req.query as { fromId?: string; type?: string };
            let binds = loadSteamBindData();

            // 如果指定了来源，进行筛选
            if (fromId && type) {
                binds = binds.filter(item =>
                    item.from?.some(f => f.id === fromId && f.type === type)
                );
            }

            res.json({ code: 0, data: binds });
        } catch (error) {
            pluginState.logger.error('获取 Steam 绑定列表失败:', error);
            res.json({ code: -1, message: '获取失败' });
        }
    });

    /** 添加 Steam 绑定 */
    router.postNoAuth('/steam-bind', async (req, res) => {
        try {
            const body = req.body as Record<string, unknown> | undefined;
            const { steamId, fromId, type, nickname } = body || {};

            if (!steamId || !fromId || !type) {
                return res.status(400).json({ code: -1, message: '参数不完整' });
            }

            if (typeof steamId !== 'string' || typeof fromId !== 'string' || 
                (type !== 'group' && type !== 'private')) {
                return res.status(400).json({ code: -1, message: '参数类型错误' });
            }

            // 验证 Steam 用户是否存在
            const playerSummary = await steamService.getPlayerSummary(String(steamId));
            if (!playerSummary) {
                return res.json({ code: -1, message: '无法找到 Steam 用户' });
            }

            // 创建或更新绑定
            let bindItem = findSteamBindItem(String(steamId));
            if (!bindItem) {
                bindItem = {
                    steamId: String(steamId),
                    personName: playerSummary.personaname,
                    face: playerSummary.avatarmedium,
                    from: []
                };
            }

            // 添加来源信息
            const newFromInfo: FromInfo = { 
                id: String(fromId), 
                type: type as 'private' | 'group', 
                nickname: nickname ? String(nickname) : undefined 
            };
            const existingIndex = bindItem.from?.findIndex(
                f => f.id === fromId && f.type === type
            );

            if (existingIndex !== undefined && existingIndex !== -1) {
                bindItem.from![existingIndex] = newFromInfo;
            } else {
                bindItem.from!.push(newFromInfo);
            }

            updateSteamBindItem(bindItem);

            ctx.logger.info(`Steam 绑定已添加/更新: ${steamId}`);
            res.json({ code: 0, message: '绑定成功' });
        } catch (error) {
            pluginState.logger.error('添加 Steam 绑定失败:', error);
            res.status(500).json({ code: -1, message: '绑定失败' });
        }
    });

    /** 删除 Steam 绑定（特定来源） */
    router.deleteNoAuth('/steam-bind/:steamId/from/:fromId', (req, res) => {
        try {
            const steamId = req.params?.steamId;
            const fromId = req.params?.fromId;
            const { type } = req.query as { type?: string };

            if (!steamId || !fromId || !type) {
                return res.status(400).json({ code: -1, message: '参数不完整' });
            }

            if (type !== 'group' && type !== 'private') {
                return res.status(400).json({ code: -1, message: 'type 参数错误' });
            }

            const bindItem = findSteamBindItem(steamId);
            if (!bindItem) {
                return res.json({ code: -1, message: '绑定不存在' });
            }

            // 移除特定来源
            bindItem.from = bindItem.from?.filter(
                f => !(f.id === fromId && f.type === type)
            );

            // 如果没有来源了，删除整个绑定
            if (!bindItem.from || bindItem.from.length === 0) {
                const allBinds = loadSteamBindData();
                const index = allBinds.findIndex(b => b.steamId === steamId);
                if (index !== -1) {
                    allBinds.splice(index, 1);
                    saveSteamBindData(allBinds);
                }
            } else {
                updateSteamBindItem(bindItem);
            }

            ctx.logger.info(`Steam 绑定已删除: ${steamId} from ${type}:${fromId}`);
            res.json({ code: 0, message: '删除成功' });
        } catch (error) {
            pluginState.logger.error('删除 Steam 绑定失败:', error);
            res.status(500).json({ code: -1, message: '删除失败' });
        }
    });

    // ==================== 游戏名称管理（无鉴权）====================

    /** 获取游戏名称列表 */
    router.getNoAuth('/game-names', (_req, res) => {
        try {
            const games = gameNameService.getAllGames();
            res.json({ code: 0, data: games });
        } catch (error) {
            pluginState.logger.error('获取游戏名称列表失败:', error);
            res.status(500).json({ code: -1, message: '获取失败' });
        }
    });

    /** 更新游戏中文名称 */
    router.putNoAuth('/game-name/:appid', async (req, res) => {
        try {
            const appid = req.params?.appid;
            const body = req.body as Record<string, unknown> | undefined;
            const { zh } = body || {};

            if (!appid) {
                return res.status(400).json({ code: -1, message: '缺少游戏 ID' });
            }

            if (typeof zh !== 'string') {
                return res.status(400).json({ code: -1, message: '中文名称必须是字符串' });
            }

            const success = gameNameService.updateChineseName(appid, zh);
            if (!success) {
                return res.status(404).json({ code: -1, message: '游戏不存在' });
            }

            ctx.logger.info(`游戏中文名已更新: ${appid} -> ${zh}`);
            res.json({ code: 0, message: '更新成功' });
        } catch (error) {
            pluginState.logger.error('更新游戏中文名失败:', error);
            res.status(500).json({ code: -1, message: '更新失败' });
        }
    });

    /** 删除游戏名称条目 */
    router.deleteNoAuth('/game-name/:appid', async (req, res) => {
        try {
            const appid = req.params?.appid;

            if (!appid) {
                return res.status(400).json({ code: -1, message: '缺少游戏 ID' });
            }

            const success = gameNameService.deleteGame(appid);
            if (!success) {
                return res.status(404).json({ code: -1, message: '游戏不存在' });
            }

            ctx.logger.info(`游戏已删除: ${appid}`);
            res.json({ code: 0, message: '删除成功' });
        } catch (error) {
            pluginState.logger.error('删除游戏失败:', error);
            res.status(500).json({ code: -1, message: '删除失败' });
        }
    });

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

    ctx.logger.debug('API 路由注册完成');
}
