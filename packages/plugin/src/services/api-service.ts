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
 * │ 页面            │ /plugin/<plugin-id>/page/<path>              │ router.page     │
 * └─────────────────┴──────────────────────────────────────────────┴─────────────────┘
 *
 * 一般插件自带的 WebUI 页面使用 NoAuth 路由，因为页面本身已在 NapCat WebUI 内嵌展示。
 */

import fs from 'node:fs';
import path from 'node:path';
import AdmZip from 'adm-zip';
import type {
    NapCatPluginContext,
    PluginHttpRequest,
    PluginHttpResponse,
} from 'napcat-types/napcat-onebot/network/plugin/types';
import { pluginState } from '../core/state';
import { HELP_PANELS } from '../handlers/help/helpData.generated';
import type { FromInfo, PluginConfig } from '../types';
import { getChinaDateParts } from '../utils/format';
import { gameNameService } from './game-name.service';
import { sessionConfigService } from './sessionConfigService';
import { steamService } from './steam.service';
import { steamBindService } from './steam-bind.service';

/**
 * 获取中国时区（UTC+8）的时间戳字符串
 * 格式: YYYY-MM-DD-HH-mm-ss
 */
function getChinaTimestamp(): string {
    const { year, month, day, hour, minute, second } =
        getChinaDateParts();
    return `${year}-${month}-${day}-${hour}-${minute}-${second}`;
}

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

    /** 获取帮助数据（构建期生成的产物） */
    router.getNoAuth('/help', (_req, res) => {
        res.json({ code: 0, data: HELP_PANELS });
    });

    // ==================== 配置管理（无鉴权）====================

    /** 获取配置 */
    router.getNoAuth('/config', (_req, res) => {
        res.json({ code: 0, data: pluginState.config });
    });

    /** 保存配置（完整替换，入口统一清洗） */
    router.postNoAuth('/config', async (req, res) => {
        try {
            const body = req.body as PluginConfig | undefined;
            if (!body) {
                return res
                    .status(400)
                    .json({ code: -1, message: '请求体为空' });
            }
            pluginState.replaceConfig(body);
            ctx.logger.info('配置已保存');
            res.json({ code: 0, message: 'ok' });
        } catch (err) {
            ctx.logger.error('保存配置失败:', err);
            res.status(500).json({ code: -1, message: String(err) });
        }
    });

    // ==================== 会话（群聊）管理（无鉴权）====================

    /** 获取群列表（附带各群启用状态） */
    router.getNoAuth('/sessions', async (_req, res) => {
        try {
            const groups = (await ctx.actions.call(
                'get_group_list',
                {},
                ctx.adapterName,
                ctx.pluginManager.config,
            )) as Array<{
                group_id: number;
                group_name: string;
                member_count: number;
                max_member_count: number;
            }>;

            const groupsWithConfig = (groups || []).map((group) => {
                const groupId = String(group.group_id);
                return {
                    id: groupId,
                    type: 'group' as const,
                    name: group.group_name,
                    enabled:
                        sessionConfigService.isGroupEnabled(groupId),
                    memberCount: group.member_count,
                    maxMemberCount: group.max_member_count,
                };
            });

            res.json({ code: 0, data: groupsWithConfig });
        } catch (e) {
            ctx.logger.error('获取群列表失败:', e);
            res.status(500).json({ code: -1, message: String(e) });
        }
    });

    /** 更新单个会话配置 */
    router.postNoAuth('/sessions/:id/config', async (req, res) => {
        try {
            const sessionId = req.params?.id;
            if (!sessionId) {
                return res
                    .status(400)
                    .json({ code: -1, message: '缺少会话 ID' });
            }
            const body = req.body as
                | { enabled?: unknown }
                | undefined;
            sessionConfigService.setSessionEnabled(
                sessionId,
                'group',
                Boolean(body?.enabled),
            );
            ctx.logger.info(
                `群 ${sessionId} 配置已更新: enabled=${body?.enabled}`,
            );
            res.json({ code: 0, message: 'ok' });
        } catch (err) {
            ctx.logger.error('更新群配置失败:', err);
            res.status(500).json({ code: -1, message: String(err) });
        }
    });

    /** 批量更新会话配置 */
    router.postNoAuth('/sessions/bulk-config', async (req, res) => {
        try {
            const body = req.body as
                | { enabled?: unknown; groupIds?: unknown }
                | undefined;
            const { enabled, groupIds } = body || {};
            if (
                typeof enabled !== 'boolean' ||
                !Array.isArray(groupIds)
            ) {
                return res
                    .status(400)
                    .json({ code: -1, message: '参数错误' });
            }

            sessionConfigService.setSessionsEnabled(
                groupIds.map((id) => String(id)),
                'group',
                enabled,
            );
            ctx.logger.info(
                `批量更新群配置完成 | 数量: ${groupIds.length}, enabled=${enabled}`,
            );
            res.json({ code: 0, message: 'ok' });
        } catch (err) {
            ctx.logger.error('批量更新群配置失败:', err);
            res.status(500).json({ code: -1, message: String(err) });
        }
    });

    // ==================== Steam 绑定管理（无鉴权）====================

    /** 获取 Steam 绑定列表 */
    router.getNoAuth('/steam-binds', (req, res) => {
        try {
            const { fromId, type } = req.query as {
                fromId?: string;
                type?: string;
            };
            let binds = steamBindService.getAll();
            if (fromId && type) {
                binds = binds.filter((item) =>
                    item.from?.some(
                        (f) => f.id === fromId && f.type === type,
                    ),
                );
            }
            res.json({ code: 0, data: binds });
        } catch (error) {
            pluginState.logger.error(
                '获取 Steam 绑定列表失败:',
                error,
            );
            res.json({ code: -1, message: '获取失败' });
        }
    });

    /** 添加 Steam 绑定 */
    router.postNoAuth('/steam-bind', async (req, res) => {
        try {
            const body = req.body as
                | {
                      steamId?: unknown;
                      fromId?: unknown;
                      type?: unknown;
                      nickname?: unknown;
                  }
                | undefined;
            const { steamId, fromId, type, nickname } = body || {};

            if (!steamId || !fromId || !type) {
                return res
                    .status(400)
                    .json({ code: -1, message: '参数不完整' });
            }
            if (
                typeof steamId !== 'string' ||
                typeof fromId !== 'string' ||
                (type !== 'group' && type !== 'private')
            ) {
                return res
                    .status(400)
                    .json({ code: -1, message: '参数类型错误' });
            }

            const playerSummary =
                await steamService.getPlayerSummary(steamId);
            if (!playerSummary) {
                return res.json({
                    code: -1,
                    message: '无法找到 Steam 用户',
                });
            }

            let bindItem = steamBindService.findBySteamId(steamId);
            if (!bindItem) {
                bindItem = {
                    steamId,
                    personName: playerSummary.personaname,
                    face: playerSummary.avatarmedium,
                    from: [],
                };
            }

            const newFromInfo: FromInfo = {
                id: fromId,
                type,
                nickname: nickname ? String(nickname) : undefined,
            };
            const fromList = bindItem.from ?? [];
            const existingIndex = fromList.findIndex(
                (f) => f.id === fromId && f.type === type,
            );
            if (existingIndex !== -1) {
                fromList[existingIndex] = newFromInfo;
            } else {
                fromList.push(newFromInfo);
            }
            bindItem.from = fromList;

            steamBindService.update(bindItem);

            ctx.logger.info(`Steam 绑定已添加/更新: ${steamId}`);
            res.json({ code: 0, message: '绑定成功' });
        } catch (error) {
            pluginState.logger.error('添加 Steam 绑定失败:', error);
            res.status(500).json({ code: -1, message: '绑定失败' });
        }
    });

    /** 删除 Steam 绑定（特定来源） */
    router.deleteNoAuth(
        '/steam-bind/:steamId/from/:fromId',
        (req, res) => {
            try {
                const steamId = req.params?.steamId;
                const fromId = req.params?.fromId;
                const { type } = req.query as { type?: string };

                if (!steamId || !fromId || !type) {
                    return res.status(400).json({
                        code: -1,
                        message: '参数不完整',
                    });
                }
                if (type !== 'group' && type !== 'private') {
                    return res.status(400).json({
                        code: -1,
                        message: 'type 参数错误',
                    });
                }

                const allBinds = steamBindService.getAll();
                const bindIndex = allBinds.findIndex(
                    (b) => b.steamId === steamId,
                );
                if (bindIndex === -1) {
                    return res.json({
                        code: -1,
                        message: '绑定不存在',
                    });
                }

                const bindItem = allBinds[bindIndex];
                const filteredFrom = bindItem.from?.filter(
                    (f) => !(f.id === fromId && f.type === type),
                );

                if (!filteredFrom || filteredFrom.length === 0) {
                    allBinds.splice(bindIndex, 1);
                } else {
                    bindItem.from = filteredFrom;
                }

                steamBindService.save(allBinds);

                ctx.logger.info(
                    `Steam 绑定已删除: ${steamId} from ${type}:${fromId}`,
                );
                res.json({ code: 0, message: '删除成功' });
            } catch (error) {
                pluginState.logger.error(
                    '删除 Steam 绑定失败:',
                    error,
                );
                res.status(500).json({
                    code: -1,
                    message: '删除失败',
                });
            }
        },
    );

    // ==================== 游戏名称管理（无鉴权）====================

    /** 获取游戏名称列表 */
    router.getNoAuth('/game-names', (_req, res) => {
        try {
            res.json({
                code: 0,
                data: gameNameService.getAllGames(),
            });
        } catch (error) {
            pluginState.logger.error('获取游戏名称列表失败:', error);
            res.status(500).json({ code: -1, message: '获取失败' });
        }
    });

    /** 更新游戏中文名称 */
    router.putNoAuth('/game-name/:appid', async (req, res) => {
        try {
            const appid = req.params?.appid;
            const body = req.body as { zh?: unknown } | undefined;
            const { zh } = body || {};

            if (!appid) {
                return res
                    .status(400)
                    .json({ code: -1, message: '缺少游戏 ID' });
            }
            if (typeof zh !== 'string') {
                return res.status(400).json({
                    code: -1,
                    message: '中文名称必须是字符串',
                });
            }

            const success = gameNameService.updateChineseName(
                appid,
                zh,
            );
            if (!success) {
                return res
                    .status(404)
                    .json({ code: -1, message: '游戏不存在' });
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
                return res
                    .status(400)
                    .json({ code: -1, message: '缺少游戏 ID' });
            }

            const success = gameNameService.deleteGame(appid);
            if (!success) {
                return res
                    .status(404)
                    .json({ code: -1, message: '游戏不存在' });
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
            if (!fs.existsSync(dataPath)) {
                return res.status(500).json({
                    code: -1,
                    message: '数据目录不存在',
                });
            }

            const jsonFiles = fs
                .readdirSync(dataPath)
                .filter((file) => file.endsWith('.json'));
            if (jsonFiles.length === 0) {
                return res.status(500).json({
                    code: -1,
                    message: '没有可导出的数据文件',
                });
            }

            const zip = new AdmZip();
            for (const file of jsonFiles) {
                zip.addFile(
                    file,
                    fs.readFileSync(path.join(dataPath, file)),
                );
            }

            const timestamp = getChinaTimestamp();
            const zipFileName = `steam-plugin-data-export-${timestamp}.zip`;
            res.setHeader('Content-Type', 'application/zip');
            res.setHeader(
                'Content-Disposition',
                `attachment; filename="${zipFileName}"`,
            );
            res.send(zip.toBuffer());

            ctx.logger.info(
                `数据导出完成: ${zipFileName}, 包含 ${jsonFiles.length} 个文件`,
            );
        } catch (error) {
            ctx.logger.error('数据导出失败:', error);
            res.status(500).json({
                code: -1,
                message: `导出失败: ${error}`,
            });
        }
    });

    /** 导入数据 - 从 zip 文件恢复数据（Base64 编码） */
    router.postNoAuth('/data-import', async (req, res) => {
        try {
            const body = req.body as { data?: unknown } | undefined;
            if (!body?.data || typeof body.data !== 'string') {
                return res
                    .status(400)
                    .json({ code: -1, message: '请上传文件' });
            }

            const dataPath = pluginState.ctx.dataPath;
            if (!fs.existsSync(dataPath)) {
                fs.mkdirSync(dataPath, { recursive: true });
            }

            let zip: AdmZip;
            try {
                zip = new AdmZip(Buffer.from(body.data, 'base64'));
            } catch {
                return res.status(400).json({
                    code: -1,
                    message: '无效的压缩包文件',
                });
            }

            const jsonEntries = zip
                .getEntries()
                .filter(
                    (entry) =>
                        entry.entryName.endsWith('.json') &&
                        !entry.isDirectory,
                );
            if (jsonEntries.length === 0) {
                return res.status(400).json({
                    code: -1,
                    message: '压缩包内没有找到数据文件',
                });
            }

            const importedFiles: string[] = [];
            for (const entry of jsonEntries) {
                const content = entry.getData().toString('utf-8');
                try {
                    JSON.parse(content);
                } catch {
                    return res.status(400).json({
                        code: -1,
                        message: `数据文件格式无效: ${entry.entryName}`,
                    });
                }
                importedFiles.push(entry.entryName);
            }

            // 备份现有数据
            const backupDir = path.join(dataPath, '..', 'backup');
            if (!fs.existsSync(backupDir)) {
                fs.mkdirSync(backupDir, { recursive: true });
            }
            const timestamp = getChinaTimestamp();
            const existingFiles = fs
                .readdirSync(dataPath)
                .filter((f) => f.endsWith('.json'));
            for (const file of existingFiles) {
                fs.copyFileSync(
                    path.join(dataPath, file),
                    path.join(
                        backupDir,
                        `${file}.pre-import-${timestamp}`,
                    ),
                );
            }

            // 写入新数据（覆盖）
            for (const entry of jsonEntries) {
                const fileName = path.basename(entry.entryName);
                if (fileName !== entry.entryName) {
                    ctx.logger.warn(
                        `跳过包含路径遍历的文件: ${entry.entryName}`,
                    );
                    continue;
                }
                fs.writeFileSync(
                    path.join(dataPath, fileName),
                    entry.getData(),
                );
            }

            pluginState.loadConfig();

            ctx.logger.info(
                `数据导入完成: ${importedFiles.length} 个文件`,
            );
            res.json({
                code: 0,
                message: '导入成功',
                data: { importedFiles },
            });
        } catch (error) {
            ctx.logger.error('数据导入失败:', error);
            res.status(500).json({
                code: -1,
                message: `导入失败: ${error}`,
            });
        }
    });

    ctx.logger.debug('API 路由注册完成');
}

export type { PluginHttpRequest, PluginHttpResponse };
