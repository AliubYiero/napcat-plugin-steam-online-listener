/**
 * Steam 每日活动报告服务
 * 在日期变化时生成前一天的活动报告并推送
 */

import { pluginState } from '../core/state';
import {
    sendGroupMessage,
    sendPrivateMessage,
} from '../handlers/utils';
import type {
    ReportPlayedGame,
    ReportUser,
    SteamBindItem,
    TimelineLog,
    TimelineLogEntry,
} from '../types';
import { getChinaMidnightTimestamp } from '../utils/format';
import {
    collectPlayDurations,
    type PlayEventInput,
} from '../utils/play-session';
import { escapeXml } from '../utils/svg-render';
import { gameNameService } from './game-name.service.js';
import {
    RENDER_FONT_FAMILY,
    svgRenderService,
} from './svg-render.service';

// ==================== 常量 ====================

const ONLINE_STATES = new Set([
    'online',
    'ingame',
    'inAfk',
    'outAfk',
    'switchGame',
    'other',
]);
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

/** 卡片内外边距 = 页面外边距 */
const CARD_PADDING = 24;
/** 游戏名与时长之间的间距 */
const GAME_NAME_GAP = 24;
/** 卡片默认最小宽度 */
const MIN_CARD_WIDTH = 500;
/** 整图最大宽度 */
const MAX_TOTAL_WIDTH = 2000;
/** 时长背景条的左侧外溢量 */
const TIME_BG_OVERFLOW = 8;
/** 文本测量并发上限 */
const MEASURE_CONCURRENCY = 8;

/** 日报文本样式 (测量用) */
const TEXT_STYLE = {
    title: { fontSize: 20, fontWeight: 700 },
    nickname: { fontSize: 18, fontWeight: 600 },
    statLabel: { fontSize: 12, fontWeight: 500 },
    statValue: { fontSize: 24, fontWeight: 700 },
    gameName: { fontSize: 14, fontWeight: 500 },
    gameTime: { fontSize: 14, fontWeight: 400 },
} as const;

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
async function generateUserCard(
    user: ReportUser,
    yOffset: number,
    cardWidth: number,
): Promise<{ svg: string; height: number }> {
    const padding = CARD_PADDING;
    const innerWidth = cardWidth - padding * 2;

    let contentHeight = 40 + 16 + 70 + 20;
    let gamesSvg = '';

    const playedGame = user.playedGame ?? [];
    const hasGames = playedGame.length > 0;

    if (hasGames) {
        const gameItemHeight = 24;
        const listHeaderHeight = 24;
        const totalGamesHeight =
            listHeaderHeight + playedGame.length * gameItemHeight;

        const dividerY = 40 + 16 + 70;

        const gamesList = (
            await mapWithConcurrency(
                playedGame,
                MEASURE_CONCURRENCY,
                async (game, idx) => {
                    const itemY =
                        dividerY +
                        24 +
                        listHeaderHeight +
                        idx * gameItemHeight;

                    const timeText = formatDuration(game.duration);
                    const timeWidth =
                        await svgRenderService.calculateTextWidth(
                            timeText,
                            TEXT_STYLE.gameTime,
                        );
                    const nameText =
                        await svgRenderService.truncateToWidth(
                            game.name,
                            innerWidth - timeWidth - GAME_NAME_GAP,
                            TEXT_STYLE.gameName,
                        );

                    return `
      <g transform="translate(${padding}, ${itemY})">
        <text x="0" y="0" fill="${COLORS.textPrimary}" font-size="14" font-weight="500" dominant-baseline="hanging">
          ${escapeXml(nameText)}
        </text>
        <rect x="${innerWidth - timeWidth - TIME_BG_OVERFLOW}" y="-2" width="${timeWidth + TIME_BG_OVERFLOW}" height="20" fill="${COLORS.card}" />
        <text x="${innerWidth}" y="0" fill="${COLORS.textSecondary}" font-size="14" text-anchor="end" dominant-baseline="hanging">
          ${escapeXml(timeText)}
        </text>
      </g>`;
                },
            )
        ).join('');

        gamesSvg = `
      <line x1="${padding}" y1="${dividerY}" x2="${cardWidth - padding}" y2="${dividerY}" stroke="${COLORS.divider}" stroke-width="1" />
      <text x="${padding}" y="${dividerY + 24}" fill="${COLORS.textSecondary}" font-size="12" font-weight="600" letter-spacing="0.05em" dominant-baseline="hanging">
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
            ${escapeXml(user.personName)}${user.fromNickname ? ` (${escapeXml(user.fromNickname)})` : ''}
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
 * 以受控并发执行异步映射, 保持结果顺序
 */
async function mapWithConcurrency<T, R>(
    items: T[],
    limit: number,
    fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
    const results = new Array<R>(items.length);
    let cursor = 0;

    async function worker(): Promise<void> {
        while (cursor < items.length) {
            const index = cursor;
            cursor += 1;
            results[index] = await fn(items[index], index);
        }
    }

    const workerCount = Math.min(limit, items.length);
    await Promise.all(
        Array.from({ length: workerCount }, () => worker()),
    );

    return results;
}

/**
 * 依据所有用户的游戏行与文本内容计算卡片宽度
 * 取全局最大值, 并限制在最大整图宽度内
 */
async function computeCardWidth(
    users: ReportUser[],
    date: string,
): Promise<number> {
    const titleWidth = await svgRenderService.calculateTextWidth(
        `Steam 活动报告 (${date})`,
        TEXT_STYLE.title,
    );

    let innerReq = 0;

    for (const user of users) {
        const nicknameLine = user.fromNickname
            ? `${user.personName} (${user.fromNickname})`
            : user.personName;
        innerReq = Math.max(
            innerReq,
            await svgRenderService.calculateTextWidth(
                nicknameLine,
                TEXT_STYLE.nickname,
            ),
        );

        const leftWidth = Math.max(
            await svgRenderService.calculateTextWidth(
                '在线时长',
                TEXT_STYLE.statLabel,
            ),
            await svgRenderService.calculateTextWidth(
                formatDuration(user.onlineDuration),
                TEXT_STYLE.statValue,
            ),
        );
        const rightWidth = Math.max(
            await svgRenderService.calculateTextWidth(
                '游戏时长',
                TEXT_STYLE.statLabel,
            ),
            await svgRenderService.calculateTextWidth(
                formatDuration(user.playedDuration),
                TEXT_STYLE.statValue,
            ),
        );
        innerReq = Math.max(
            innerReq,
            leftWidth,
            2 * (rightWidth + 20),
        );

        for (const game of user.playedGame ?? []) {
            const rowWidth =
                (await svgRenderService.calculateTextWidth(
                    game.name,
                    TEXT_STYLE.gameName,
                )) +
                GAME_NAME_GAP +
                (await svgRenderService.calculateTextWidth(
                    formatDuration(game.duration),
                    TEXT_STYLE.gameTime,
                ));
            innerReq = Math.max(innerReq, rowWidth);
        }
    }

    return Math.min(
        Math.max(
            MIN_CARD_WIDTH,
            titleWidth,
            innerReq + CARD_PADDING * 2,
        ),
        MAX_TOTAL_WIDTH - CARD_PADDING * 2,
    );
}

/**
 * 生成完整的 Steam 活动报告 SVG
 */
export async function generateSteamReport(
    users: ReportUser[],
    options: { date?: string } = {},
): Promise<string> {
    const { date = '' } = options;
    const padding = CARD_PADDING;
    const headerHeight = 60;

    const cardWidth = await computeCardWidth(users, date);

    let currentY = headerHeight + padding;
    const cardsSvg: string[] = [];
    for (const user of users) {
        const { svg, height } = await generateUserCard(
            user,
            currentY,
            cardWidth,
        );
        currentY += height;
        cardsSvg.push(svg);
    }

    const totalHeight = currentY + padding;
    const viewBoxWidth = cardWidth + padding * 2;

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${viewBoxWidth}" height="${totalHeight}"
     viewBox="0 0 ${viewBoxWidth} ${totalHeight}"
     fill="none" xmlns="http://www.w3.org/2000/svg"
     style="font-family: ${RENDER_FONT_FAMILY};">
  <!-- 背景 -->
  <rect width="${viewBoxWidth}" height="${totalHeight}" fill="${COLORS.bg}"></rect>
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
     * @param yesterdayDate 昨日日期键，格式如 "2026-03-06"
     */
    async generateAndPushDailyReport(
        yesterdayDate: string,
    ): Promise<void> {
        try {
            pluginState.logger.info(
                `[SteamReportService] 开始生成 ${yesterdayDate} 的活动报告`,
            );

            // 步骤1: 加载昨日日志
            const log = this.loadYesterdayLog(yesterdayDate);
            if (log.d.length === 0) {
                pluginState.logger.info(
                    '[SteamReportService] 昨日无状态记录，跳过报告生成',
                );
                return;
            }

            // 步骤2: 按 steamId 归类
            const grouped = this.groupBySteamId(log);

            // 步骤3+4: 计算时长并映射为目标数据
            const midnightTs =
                this.getMidnightTimestamp(yesterdayDate);
            const bindData = pluginState.loadDataFile<
                SteamBindItem[]
            >('steam-bind-data.json', []);
            const reportUsers = await this.buildReportUsers(
                grouped,
                midnightTs,
                bindData,
            );

            if (reportUsers.length === 0) {
                pluginState.logger.info(
                    '[SteamReportService] 昨日无游玩记录，跳过报告生成',
                );
                return;
            }

            // 步骤5: 按来源分组
            const sourceGroups = this.groupBySource(
                reportUsers,
                bindData,
            );

            // 步骤6: 生成并推送
            await this.generateAndPush(sourceGroups, yesterdayDate);

            pluginState.logger.info(
                '[SteamReportService] 活动报告推送完成',
            );
        } catch (error) {
            pluginState.logger.error(
                '[SteamReportService] 生成活动报告失败:',
                error,
            );
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
    private groupBySteamId(
        log: TimelineLog,
    ): Map<string, TimelineLogEntry[]> {
        const map = new Map<string, TimelineLogEntry[]>();

        for (const entry of log.d) {
            const steamId = entry[0];
            let bucket = map.get(steamId);
            if (!bucket) {
                bucket = [];
                map.set(steamId, bucket);
            }
            bucket.push(entry);
        }

        for (const entries of map.values()) {
            entries.sort((a, b) => a[3] - b[3]);
        }

        return map;
    }

    /**
     * 获取指定日期次日 00:00 的时间戳（即该天的 24:00, 中国时区）
     */
    private getMidnightTimestamp(dateStr: string): number {
        return (
            getChinaMidnightTimestamp(dateStr) + 24 * 60 * 60 * 1000
        );
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
            const durations = this.calculateDurations(
                entries,
                midnightTs,
                customEndTime,
            );

            if (durations.playedDuration === 0) continue;

            const bindItem = bindData.find(
                (item) => item.steamId === steamId,
            );
            const personName = bindItem?.personName || steamId;

            const playedGame: ReportPlayedGame[] = [];
            for (const [gameId, duration] of durations.games) {
                if (duration === 0) continue;
                const name =
                    (await gameNameService.getFormattedGameName(
                        gameId,
                    )) ?? gameId;
                playedGame.push({ name, duration });
            }

            playedGame.sort((a, b) => b.duration - a.duration);

            users.push({
                steamId,
                personName,
                onlineDuration: durations.onlineDuration,
                playedDuration: durations.playedDuration,
                playedGame,
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
        let onlineStartTime: number | null = null;
        const playEvents: PlayEventInput[] = [];

        // 使用自定义结束时间或默认的午夜时间
        const endTime = customEndTime ?? midnightTs;

        for (const entry of entries) {
            const [, changeType, gameId, updateTime] = entry;

            // 跳过超过结束时间的事件
            if (updateTime > endTime) continue;

            playEvents.push({ changeType, gameId, at: updateTime });

            // 处理在线状态开始
            if (
                ONLINE_STATES.has(changeType) &&
                onlineStartTime === null
            ) {
                onlineStartTime = updateTime;
            }

            // 处理离线
            if (
                OFFLINE_STATES.has(changeType) &&
                onlineStartTime !== null
            ) {
                onlineDuration += Math.floor(
                    (updateTime - onlineStartTime) / 1000,
                );
                onlineStartTime = null;
            }
        }

        // 未关闭的在线时段截止到结束时间
        if (onlineStartTime !== null) {
            onlineDuration += Math.floor(
                (endTime - onlineStartTime) / 1000,
            );
        }

        const { total: playedDuration, games } = collectPlayDurations(
            playEvents,
            endTime,
        );

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
                    let bucket = sourceMap.get(sourceKey);
                    if (!bucket) {
                        bucket = [];
                        sourceMap.set(sourceKey, bucket);
                    }
                    const userForSource = fromInfo.nickname
                        ? {
                              ...reportUser,
                              fromNickname: fromInfo.nickname,
                          }
                        : reportUser;
                    bucket.push(userForSource);
                }
            }
        }

        // 对每个来源的用户按游戏时长降序排序
        for (const users of sourceMap.values()) {
            users.sort(
                (a, b) =>
                    b.playedDuration - a.playedDuration ||
                    b.onlineDuration - a.onlineDuration,
            );
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

            const svg = await generateSteamReport(users, {
                date: dateLabel,
            });

            const base64 = await svgRenderService.renderSvg(svg);

            if (!base64) {
                pluginState.logger.warn(
                    `[SteamReportService] 渲染 ${sourceKey} 的报告图片失败`,
                );
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
                await sendGroupMessage(
                    pluginState.ctx,
                    parseInt(id, 10),
                    message,
                );
            } else if (type === 'private') {
                await sendPrivateMessage(
                    pluginState.ctx,
                    parseInt(id, 10),
                    message,
                );
            }

            pluginState.logger.info(
                `[SteamReportService] 已推送报告到 ${sourceKey}，包含 ${users.length} 个用户`,
            );
        } catch (error) {
            pluginState.logger.error(
                `[SteamReportService] 推送报告到 ${sourceKey} 失败:`,
                error,
            );
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
            await this.pushToSingleSource(
                sourceKey,
                users,
                dateLabel,
            );
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
            pluginState.logger.info(
                `[SteamReportService] 开始生成 ${dateStr} 的按需报告，来源: ${sourceKey}`,
            );

            // 步骤1: 加载指定日期日志
            const log = this.loadYesterdayLog(dateStr);
            if (log.d.length === 0) {
                pluginState.logger.info(
                    '[SteamReportService] 指定日期无状态记录',
                );
                return false;
            }

            // 步骤2: 按 steamId 归类
            const grouped = this.groupBySteamId(log);

            // 步骤3: 过滤 sourceKey 对应的绑定用户
            const bindData = pluginState.loadDataFile<
                SteamBindItem[]
            >('steam-bind-data.json', []);
            const sourceBindData = bindData.filter((item) =>
                item.from?.some(
                    (fromInfo) =>
                        `${fromInfo.type}:${fromInfo.id}` ===
                        sourceKey,
                ),
            );

            if (sourceBindData.length === 0) {
                pluginState.logger.info(
                    `[SteamReportService] 来源 ${sourceKey} 无绑定用户`,
                );
                return false;
            }

            // 只保留该来源绑定的 steamId
            const allowedSteamIds = new Set(
                sourceBindData.map((item) => item.steamId),
            );
            const filteredGrouped = new Map<
                string,
                TimelineLogEntry[]
            >();
            for (const [steamId, entries] of grouped) {
                if (allowedSteamIds.has(steamId)) {
                    filteredGrouped.set(steamId, entries);
                }
            }

            if (filteredGrouped.size === 0) {
                pluginState.logger.info(
                    '[SteamReportService] 该来源无有效日志记录',
                );
                return false;
            }

            // 步骤4: 计算时长（使用自定义 endTime）
            const midnightTs = this.getMidnightTimestamp(dateStr);
            const reportUsers = await this.buildReportUsers(
                filteredGrouped,
                midnightTs,
                sourceBindData,
                endTime,
            );

            if (reportUsers.length === 0) {
                pluginState.logger.info(
                    '[SteamReportService] 该日期无游玩记录',
                );
                return false;
            }

            // 步骤5: 应用来源自定义昵称
            const usersWithNickname = reportUsers.map((user) => {
                const bindItem = sourceBindData.find(
                    (item) => item.steamId === user.steamId,
                );
                const fromInfo = bindItem?.from?.find(
                    (f) => `${f.type}:${f.id}` === sourceKey,
                );
                if (fromInfo?.nickname) {
                    return {
                        ...user,
                        fromNickname: fromInfo.nickname,
                    };
                }
                return user;
            });

            // 对每个来源的用户按游戏时长降序排序
            usersWithNickname.sort(
                (a, b) =>
                    b.playedDuration - a.playedDuration ||
                    b.onlineDuration - a.onlineDuration,
            );

            // 步骤6: 生成并推送报告
            const parts = dateStr.split('-').map(Number);
            const dateLabel = `${parts[0]}年${parts[1]}月${parts[2]}日`;
            await this.pushToSingleSource(
                sourceKey,
                usersWithNickname,
                dateLabel,
            );

            pluginState.logger.info(
                '[SteamReportService] 按需报告推送完成',
            );
            return true;
        } catch (error) {
            pluginState.logger.error(
                '[SteamReportService] 生成按需报告失败:',
                error,
            );
            return false;
        }
    }
}

// ==================== 导出单例服务 ====================

export const steamReportService = new SteamReportService();
