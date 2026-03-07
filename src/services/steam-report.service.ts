/**
 * Steam 每日活动报告服务
 * 在日期变化时生成前一天的活动报告并推送
 */

import { pluginState } from '../core/state';
import { gameNameService } from './game-name.service.js';
import { renderSvgToBase64, escapeXml } from '../utils/svg-render';
import {
    sendGroupMessage,
    sendPrivateMessage,
} from '../handlers/utils';
import type {
    TimelineLog,
    TimelineLogEntry,
    SteamBindItem,
    ReportUser,
    ReportPlayedGame,
} from '../types';

// ==================== 常量 ====================

const ONLINE_STATES = new Set(['online', 'ingame', 'inAfk', 'outAfk', 'switchGame', 'other']);
const GAME_START_STATES = new Set(['ingame', 'switchGame']);
const OFFLINE_STATES = new Set(['offline', 'quitGame']);

// ==================== SVG 报告生成 ====================

const COLORS = {
    bg: '#f9fafb',
    card: '#ffffff',
    border: '#e5e7eb',
    textPrimary: '#111827',
    textSecondary: '#6b7280',
    textMuted: '#9ca3af',
    divider: '#f3f4f6',
};

/**
 * 格式化秒数为可读时长
 */
function formatDuration(seconds: number): string {
    if (!seconds || seconds === 0) return '0m 0s';

    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;

    if (h > 0) {
        return s > 0 ? `${h}h ${m}m ${s}s` : `${h}h ${m}m`;
    }
    return `${m}m ${s}s`;
}

/**
 * 生成单个用户卡片 SVG
 */
function generateUserCard(
    user: ReportUser,
    yOffset: number,
    cardWidth: number,
): { svg: string; height: number } {
    const padding = 24;
    const innerWidth = cardWidth - padding * 2;

    let contentHeight = 40 + 16 + 70 + 20;
    let gamesSvg = '';

    const hasGames = user.playedGame && user.playedGame.length > 0;

    if (hasGames) {
        const gameItemHeight = 24;
        const listHeaderHeight = 24;
        const totalGamesHeight = listHeaderHeight + (user.playedGame!.length * gameItemHeight);

        const gamesList = user.playedGame!.map((game, idx) => {
            const itemY = 40 + 16 + 70 + 24 + listHeaderHeight + (idx * gameItemHeight);

            return `
      <g transform="translate(${padding}, ${itemY})">
        <text x="0" y="0" fill="${COLORS.textPrimary}" font-size="14" font-weight="500" dominant-baseline="hanging">
          ${escapeXml(game.name)}
        </text>
        <text x="${innerWidth}" y="0" fill="${COLORS.textSecondary}" font-size="14" text-anchor="end" dominant-baseline="hanging">
          ${formatDuration(game.duration)}
        </text>
      </g>`;
        }).join('');

        gamesSvg = `
      <line x1="${padding}" y1="${40 + 16 + 70}" x2="${cardWidth - padding}" y2="${40 + 16 + 70 + 12}" stroke="${COLORS.divider}" stroke-width="1" />
      <text x="${padding}" y="${40 + 16 + 70 + 24}" fill="${COLORS.textSecondary}" font-size="12" font-weight="600" letter-spacing="0.05em" dominant-baseline="hanging">
        最近游玩
      </text>
      ${gamesList}
    `;

        contentHeight += totalGamesHeight + 20;
    }

    const cardHeight = contentHeight;

    return {
        svg: `
    <g transform="translate(0, ${yOffset})">
      <rect x="0.5" y="0.5" width="${cardWidth - 1}" height="${cardHeight - 1}" rx="12" fill="${COLORS.card}" stroke="${COLORS.border}" stroke-width="1" />
      <g transform="translate(${padding}, 20)">
        <text x="0" y="0" fill="${COLORS.textPrimary}" font-size="18" font-weight="600" dominant-baseline="hanging">
          <tspan>
            ${escapeXml(user.personName)}
          </tspan>
          <tspan y="9" fill="${COLORS.textMuted}" font-size="11" font-family="monospace" dominant-baseline="hanging">
            ${escapeXml(user.steamId)}
          </tspan>
        </text>
      </g>
      <g transform="translate(${padding}, 56)">
        <g>
          <text x="0" y="0" fill="${COLORS.textSecondary}" font-size="12" font-weight="500" dominant-baseline="hanging">在线时长</text>
          <text x="0" y="24" fill="${COLORS.textPrimary}" font-size="24" font-weight="700" dominant-baseline="hanging">
            ${formatDuration(user.onlineDuration)}
          </text>
        </g>
        <g transform="translate(${innerWidth / 2 + 20}, 0)">
          <text x="0" y="0" fill="${COLORS.textSecondary}" font-size="12" font-weight="500" dominant-baseline="hanging">游戏时长</text>
          <text x="0" y="24" fill="${COLORS.textPrimary}" font-size="24" font-weight="700" dominant-baseline="hanging">
            ${formatDuration(user.playedDuration)}
          </text>
        </g>
      </g>
      ${gamesSvg}
    </g>`,
        height: cardHeight + 16,
    };
}

/**
 * 生成完整的 Steam 活动报告 SVG
 */
function generateSteamReport(
    users: ReportUser[],
    options: { date?: string; config?: { cardWidth?: number } } = {},
): string {
    const { date = '', config = {} } = options;
    const cardWidth = config.cardWidth || 500;
    const padding = 24;
    const headerHeight = 60;

    let currentY = headerHeight + padding;
    const cardsSvg = users.map(user => {
        const { svg, height } = generateUserCard(user, currentY, cardWidth);
        currentY += height;
        return svg;
    });

    const totalHeight = currentY + padding;
    const viewBoxWidth = cardWidth + padding * 2;

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${viewBoxWidth}" height="${totalHeight}"
     viewBox="0 0 ${viewBoxWidth} ${totalHeight}"
     fill="none" xmlns="http://www.w3.org/2000/svg"
     style="background-color: ${COLORS.bg}; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <text x="${padding}" y="32" fill="${COLORS.textPrimary}" font-size="20" font-weight="700" dominant-baseline="hanging">
    Steam 活动报告 (${escapeXml(date)})
  </text>
  <g transform="translate(${padding}, 0)">
    ${cardsSvg.join('\n')}
  </g>
</svg>`.trim();
}

// ==================== 报告服务类 ====================

class SteamReportService {

    /**
     * 生成并推送每日活动报告
     * @param yesterdayDate 昨日日期字符串，格式如 "2026-3-6"
     */
    async generateAndPushDailyReport(yesterdayDate: string): Promise<void> {
        try {
            pluginState.logger.info(`[SteamReportService] 开始生成 ${yesterdayDate} 的活动报告`);

            // 步骤1: 加载昨日日志
            const log = this.loadYesterdayLog(yesterdayDate);
            if (log.d.length === 0) {
                pluginState.logger.info('[SteamReportService] 昨日无状态记录，跳过报告生成');
                return;
            }

            // 步骤2: 按 steamId 归类
            const grouped = this.groupBySteamId(log);

            // 步骤3+4: 计算时长并映射为目标数据
            const midnightTs = this.getMidnightTimestamp(yesterdayDate);
            const bindData = pluginState.loadDataFile<SteamBindItem[]>('steam-bind-data.json', []);
            const reportUsers = await this.buildReportUsers(grouped, midnightTs, bindData);

            if (reportUsers.length === 0) {
                pluginState.logger.info('[SteamReportService] 无有效用户数据，跳过报告生成');
                return;
            }

            // 步骤5: 按来源分组
            const sourceGroups = this.groupBySource(reportUsers, bindData);

            // 步骤6: 生成并推送
            await this.generateAndPush(sourceGroups, yesterdayDate);

            pluginState.logger.info('[SteamReportService] 活动报告推送完成');
        } catch (error) {
            pluginState.logger.error('[SteamReportService] 生成活动报告失败:', error);
        }
    }

    /**
     * 加载指定日期的日志
     */
    private loadYesterdayLog(dateStr: string): TimelineLog {
        const filename = `steam-status-log-${dateStr}.json`;
        return pluginState.loadDataFile<TimelineLog>(filename, {
            h: ['steamId', 'changeType', 'gameId', 'updateTime'],
            d: [],
        });
    }

    /**
     * 按 steamId 分组，每组按时间排序
     */
    private groupBySteamId(log: TimelineLog): Map<string, TimelineLogEntry[]> {
        const map = new Map<string, TimelineLogEntry[]>();

        for (const entry of log.d) {
            const steamId = entry[0];
            if (!map.has(steamId)) {
                map.set(steamId, []);
            }
            map.get(steamId)!.push(entry);
        }

        for (const entries of map.values()) {
            entries.sort((a, b) => a[3] - b[3]);
        }

        return map;
    }

    /**
     * 获取指定日期次日 00:00 的时间戳（即该天的 24:00）
     */
    private getMidnightTimestamp(dateStr: string): number {
        const parts = dateStr.split('-').map(Number);
        const nextDay = new Date(parts[0], parts[1] - 1, parts[2] + 1, 0, 0, 0, 0);
        return nextDay.getTime();
    }

    /**
     * 计算所有用户的报告数据
     */
    private async buildReportUsers(
        grouped: Map<string, TimelineLogEntry[]>,
        midnightTs: number,
        bindData: SteamBindItem[],
        customEndTime?: number,
    ): Promise<ReportUser[]> {
        const users: ReportUser[] = [];

        for (const [steamId, entries] of grouped) {
            const durations = this.calculateDurations(entries, midnightTs, customEndTime);

            const bindItem = bindData.find(item => item.steamId === steamId);
            const personName = bindItem?.personName || steamId;

            const playedGame: ReportPlayedGame[] = [];
            for (const [gameId, duration] of durations.games) {
                const name = await gameNameService.getFormattedGameName(gameId) ?? gameId;
                playedGame.push({ name, duration });
            }

            playedGame.sort((a, b) => b.duration - a.duration);

            users.push({
                steamId,
                personName,
                onlineDuration: durations.onlineDuration,
                playedDuration: durations.playedDuration,
                playedGame: playedGame.length > 0 ? playedGame : undefined,
            });
        }

        return users;
    }

    /**
     * 状态机：计算单个用户的在线/游玩时长
     */
    private calculateDurations(
        entries: TimelineLogEntry[],
        midnightTs: number,
        customEndTime?: number,
    ): {
        onlineDuration: number;
        playedDuration: number;
        games: Map<string, number>;
    } {
        let onlineDuration = 0;
        let playedDuration = 0;
        const games = new Map<string, number>();

        let onlineStartTime: number | null = null;
        let gameStartTime: number | null = null;
        let currentGameId: string | null = null;

        // 使用自定义结束时间或默认的午夜时间
        const endTime = customEndTime ?? midnightTs;

        for (const entry of entries) {
            const [, changeType, gameId, updateTime] = entry;

            // 跳过超过结束时间的事件
            if (updateTime > endTime) continue;

            // 处理在线状态开始
            if (ONLINE_STATES.has(changeType) && onlineStartTime === null) {
                onlineStartTime = updateTime;
            }

            // 处理游戏开始
            if (GAME_START_STATES.has(changeType) && gameId) {
                // 如果之前在玩其他游戏，先结算
                if (gameStartTime !== null && currentGameId) {
                    const duration = Math.floor((updateTime - gameStartTime) / 1000);
                    games.set(currentGameId, (games.get(currentGameId) || 0) + duration);
                    playedDuration += duration;
                }
                gameStartTime = updateTime;
                currentGameId = gameId;
            }

            // 处理游戏结束（不含 switchGame，switchGame 在上面已处理切换）
            if ((changeType === 'outgame' || changeType === 'quitGame' || changeType === 'offline') && gameStartTime !== null && currentGameId) {
                const duration = Math.floor((updateTime - gameStartTime) / 1000);
                games.set(currentGameId, (games.get(currentGameId) || 0) + duration);
                playedDuration += duration;
                gameStartTime = null;
                currentGameId = null;
            }

            // 处理离线
            if (OFFLINE_STATES.has(changeType) && onlineStartTime !== null) {
                onlineDuration += Math.floor((updateTime - onlineStartTime) / 1000);
                onlineStartTime = null;
            }
        }

        // 未关闭的时间段截止到结束时间
        if (onlineStartTime !== null) {
            onlineDuration += Math.floor((endTime - onlineStartTime) / 1000);
        }
        if (gameStartTime !== null && currentGameId) {
            const duration = Math.floor((endTime - gameStartTime) / 1000);
            games.set(currentGameId, (games.get(currentGameId) || 0) + duration);
            playedDuration += duration;
        }

        return { onlineDuration, playedDuration, games };
    }

    /**
     * 按来源分组
     */
    private groupBySource(
        reportUsers: ReportUser[],
        bindData: SteamBindItem[],
    ): Map<string, ReportUser[]> {
        const sourceMap = new Map<string, ReportUser[]>();

        const userMap = new Map<string, ReportUser>();
        for (const user of reportUsers) {
            userMap.set(user.steamId, user);
        }

        for (const bindItem of bindData) {
            const reportUser = userMap.get(bindItem.steamId);
            if (!reportUser) continue;

            if (bindItem.from && bindItem.from.length > 0) {
                for (const fromInfo of bindItem.from) {
                    const sourceKey = `${fromInfo.type}:${fromInfo.id}`;
                    if (!sourceMap.has(sourceKey)) {
                        sourceMap.set(sourceKey, []);
                    }
                    const userForSource = fromInfo.nickname
                        ? { ...reportUser, personName: fromInfo.nickname }
                        : reportUser;
                    sourceMap.get(sourceKey)!.push(userForSource);
                }
            }
        }

        return sourceMap;
    }

    /**
     * 推送单来源报告
     */
    private async pushToSingleSource(
        sourceKey: string,
        users: ReportUser[],
        dateLabel: string,
    ): Promise<void> {
        try {
            if (users.length === 0) return;

            const svg = generateSteamReport(users, {
                date: dateLabel,
                config: { cardWidth: 500 },
            });

            const base64 = await renderSvgToBase64(svg);

            if (!base64) {
                pluginState.logger.warn(`[SteamReportService] 渲染 ${sourceKey} 的报告图片失败`);
                return;
            }

            const [type, id] = sourceKey.split(':');
            const message = [
                {
                    type: 'image' as const,
                    data: { file: `base64://${base64}` },
                },
            ];

            if (type === 'group') {
                await sendGroupMessage(pluginState.ctx, parseInt(id), message);
            } else if (type === 'private') {
                await sendPrivateMessage(pluginState.ctx, parseInt(id), message);
            }

            pluginState.logger.info(`[SteamReportService] 已推送报告到 ${sourceKey}，包含 ${users.length} 个用户`);
        } catch (error) {
            pluginState.logger.error(`[SteamReportService] 推送报告到 ${sourceKey} 失败:`, error);
        }
    }

    /**
     * 生成 SVG 并推送到各来源
     */
    private async generateAndPush(
        sourceGroups: Map<string, ReportUser[]>,
        dateStr: string,
    ): Promise<void> {
        const parts = dateStr.split('-').map(Number);
        const dateLabel = `${parts[0]}年${parts[1]}月${parts[2]}日`;

        for (const [sourceKey, users] of sourceGroups) {
            await this.pushToSingleSource(sourceKey, users, dateLabel);
        }
    }

    /**
     * 生成并推送指定日期的报告（按需报告）
     * @param dateStr 日期字符串，格式如 "2026-3-6"
     * @param endTime 报告结束时间戳
     * @param sourceKey 来源标识，格式如 "group:123456" 或 "private:123456"
     * @returns 是否成功生成并推送
     */
    async generateOnDemandReport(
        dateStr: string,
        endTime: number,
        sourceKey: string,
    ): Promise<boolean> {
        try {
            pluginState.logger.info(`[SteamReportService] 开始生成 ${dateStr} 的按需报告，来源: ${sourceKey}`);

            // 步骤1: 加载指定日期日志
            const log = this.loadYesterdayLog(dateStr);
            if (log.d.length === 0) {
                pluginState.logger.info('[SteamReportService] 指定日期无状态记录');
                return false;
            }

            // 步骤2: 按 steamId 归类
            const grouped = this.groupBySteamId(log);

            // 步骤3: 过滤 sourceKey 对应的绑定用户
            const bindData = pluginState.loadDataFile<SteamBindItem[]>('steam-bind-data.json', []);
            const sourceBindData = bindData.filter(item =>
                item.from?.some(fromInfo => `${fromInfo.type}:${fromInfo.id}` === sourceKey),
            );

            if (sourceBindData.length === 0) {
                pluginState.logger.info(`[SteamReportService] 来源 ${sourceKey} 无绑定用户`);
                return false;
            }

            // 只保留该来源绑定的 steamId
            const allowedSteamIds = new Set(sourceBindData.map(item => item.steamId));
            const filteredGrouped = new Map<string, TimelineLogEntry[]>();
            for (const [steamId, entries] of grouped) {
                if (allowedSteamIds.has(steamId)) {
                    filteredGrouped.set(steamId, entries);
                }
            }

            if (filteredGrouped.size === 0) {
                pluginState.logger.info('[SteamReportService] 该来源无有效日志记录');
                return false;
            }

            // 步骤4: 计算时长（使用自定义 endTime）
            const midnightTs = this.getMidnightTimestamp(dateStr);
            const reportUsers = await this.buildReportUsers(filteredGrouped, midnightTs, sourceBindData, endTime);

            if (reportUsers.length === 0) {
                pluginState.logger.info('[SteamReportService] 无有效用户数据');
                return false;
            }

            // 步骤5: 应用来源自定义昵称
            const usersWithNickname = reportUsers.map(user => {
                const bindItem = sourceBindData.find(item => item.steamId === user.steamId);
                const fromInfo = bindItem?.from?.find(f => `${f.type}:${f.id}` === sourceKey);
                if (fromInfo?.nickname) {
                    return { ...user, personName: fromInfo.nickname };
                }
                return user;
            });

            // 步骤6: 生成并推送报告
            const parts = dateStr.split('-').map(Number);
            const dateLabel = `${parts[0]}年${parts[1]}月${parts[2]}日`;
            await this.pushToSingleSource(sourceKey, usersWithNickname, dateLabel);

            pluginState.logger.info('[SteamReportService] 按需报告推送完成');
            return true;
        } catch (error) {
            pluginState.logger.error('[SteamReportService] 生成按需报告失败:', error);
            return false;
        }
    }
}

// ==================== 导出单例服务 ====================

export const steamReportService = new SteamReportService();
