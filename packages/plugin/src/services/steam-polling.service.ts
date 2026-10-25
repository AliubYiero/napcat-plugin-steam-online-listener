/**
 * Steam 轮询服务模块
 * 实现定时轮询 Steam 用户状态变化的功能
 */

import { pluginState } from '../core/state';
import {
    sendGroupMessage,
    sendPrivateMessage,
} from '../handlers/utils';
import type { SteamBindItem } from '../types';
import { formatPlayTime } from '../utils/format';
import {
    createNextDelay,
    isAlignedInterval,
} from '../utils/poll-scheduler';
import { escapeXml } from '../utils/svg-render';
import { falsePositiveService } from './false-positive.service';
import { gameNameService } from './game-name.service.js';
import { steamAvatarService } from './steam-avatar.service';
import { steamBindService } from './steam-bind.service';
import { steamService } from './steam.service';
import {
    type StatusChange,
    type StatusChanges,
    steamCacheService,
} from './steam-cache.service';
import { steamReportService } from './steam-report.service';
import {
    RENDER_FONT_FAMILY,
    svgRenderService,
} from './svg-render.service';
import { timelineService } from './timeline.service';

// ==================== 轮询服务类 ====================

class SteamPollingService {
    private pollingTimer: NodeJS.Timeout | null = null;
    private isPollingActive = false;
    private lastPollDate: string = ''; // 上次轮询日期
    /** 代际令牌: 每次启动/停止自增, 使在途轮询的旧循环失效 */
    private generation = 0;
    /** 当前有效轮询间隔（秒） */
    private intervalSeconds = 60;
    /** 下一次轮询延迟计算函数 (由工厂创建) */
    private nextDelayFn: ((nowMs?: number) => number) | null = null;

    /**
     * 获取当前轮询间隔（秒）
     *
     * 配置层已清洗到 [10, 3600]，此处仅做防御性收敛。
     */
    private getPollingIntervalSeconds(): number {
        return Math.min(
            3600, // 最大1小时
            Math.max(
                10,
                pluginState.config.pollingIntervalSeconds || 60,
            ),
        );
    }

    /**
     * 启动轮询服务
     */
    startPolling(): void {
        if (this.isPollingActive) {
            pluginState.logger.warn('Steam 轮询服务已在运行中');
            return;
        }

        // 前置验证，避免状态混乱
        if (!pluginState.config.steamApiKey) {
            pluginState.logger.warn(
                '未配置 Steam API Key，无法启动 Steam 轮询服务',
            );
            return;
        }

        // 先标记为正在启动状态，防止重复启动
        this.isPollingActive = true;
        this.generation += 1;
        const gen = this.generation;

        // 验证 API Key 是否有效
        steamService
            .validateApiKey()
            .then((isValid) => {
                // 校验期间若已被停止/重载，放弃本次启动
                if (
                    gen !== this.generation ||
                    !this.isPollingActive
                ) {
                    return;
                }

                if (!isValid) {
                    this.isPollingActive = false;
                    pluginState.logger.warn(
                        'Steam API Key 无效，无法启动 Steam 轮询服务',
                    );
                    return;
                }

                // 工厂按当前间隔一次性选定延迟策略
                this.intervalSeconds =
                    this.getPollingIntervalSeconds();
                this.nextDelayFn = createNextDelay(
                    this.intervalSeconds,
                );

                const mode = isAlignedInterval(this.intervalSeconds)
                    ? `已对齐到 ${this.intervalSeconds} 秒边界`
                    : `每 ${this.intervalSeconds} 秒`;
                pluginState.logger.info(
                    `Steam 轮询服务已启动，${mode}检查一次状态变化`,
                );

                this.scheduleNextPoll(gen);
            })
            .catch((error) => {
                if (gen !== this.generation) {
                    return;
                }
                this.isPollingActive = false;
                pluginState.logger.error(
                    '验证 Steam API Key 时出错:',
                    error,
                );
            });
    }

    /**
     * 排定下一次轮询（递归 setTimeout）
     *
     * 令牌失效或服务已停止时不排程，避免旧循环复活。
     */
    private scheduleNextPoll(gen: number): void {
        if (gen !== this.generation || !this.isPollingActive) {
            return;
        }

        const delay = this.nextDelayFn
            ? this.nextDelayFn()
            : this.intervalSeconds * 1000;

        this.pollingTimer = setTimeout(() => {
            void this.runPollCycle(gen);
        }, delay);

        // 每轮重排都用同一 key 覆盖, 便于插件清理时清除最新定时器
        pluginState.timers.set('steam-polling', this.pollingTimer);
    }

    /**
     * 执行一轮轮询, 完成后按策略重排
     */
    private async runPollCycle(gen: number): Promise<void> {
        if (gen !== this.generation || !this.isPollingActive) {
            return;
        }

        try {
            await this.pollSteamStatuses();
        } catch (error) {
            pluginState.logger.error(
                '执行 Steam 状态轮询时出错:',
                error,
            );
        } finally {
            this.scheduleNextPoll(gen);
        }
    }

    /**
     * 停止轮询服务
     */
    stopPolling(): void {
        if (!this.isPollingActive) {
            pluginState.logger.warn('Steam 轮询服务未运行');
            return;
        }

        // 自增代际, 使在途轮询完成后不再重排
        this.generation += 1;

        if (this.pollingTimer) {
            clearTimeout(this.pollingTimer);
            this.pollingTimer = null;
        }
        pluginState.timers.delete('steam-polling');

        this.isPollingActive = false;
        pluginState.logger.info('Steam 轮询服务已停止');
    }

    /**
     * 执行一次 Steam 状态轮询
     */
    async pollSteamStatuses(): Promise<void> {
        try {
            pluginState.logger.debug('开始执行 Steam 状态轮询');

            // 检测日期变化（使用本地时区）
            const today = new Date()
                .toLocaleDateString('zh-CN')
                .replace(/\//g, '-');
            if (this.lastPollDate && this.lastPollDate !== today) {
                pluginState.logger.info(
                    '[SteamPollingService] 检测到日期变化，执行每日报告和午夜快照',
                );

                // 1. 最先执行：生成并推送昨日活动报告
                await steamReportService.generateAndPushDailyReport(
                    this.lastPollDate,
                );

                // 2. 记录昨天的最终状态（午夜快照，使用实际状态）
                const yesterdayCache =
                    steamCacheService.getCurrentCache();
                timelineService.midnightSnapshot(yesterdayCache);

                // 3. 检查并归档旧日志
                timelineService.checkAndArchive();
            }
            this.lastPollDate = today;

            // 获取所有已绑定的 Steam 数据（不区分来源）
            const allBindItems = this.getAllSteamBindItems();

            if (allBindItems.length === 0) {
                pluginState.logger.debug(
                    '没有绑定的 Steam 用户，跳过轮询',
                );
                return;
            }

            // 提取所有唯一的 Steam ID
            const allSteamIds = [
                ...new Set(allBindItems.map((item) => item.steamId)),
            ];
            pluginState.logger.debug(
                `检测到 ${allSteamIds.length} 个唯一的 Steam 用户`,
            );

            // 按 100 个一组分批处理
            const batchSize = 100;
            for (let i = 0; i < allSteamIds.length; i += batchSize) {
                const batch = allSteamIds.slice(i, i + batchSize);

                try {
                    // 查询当前批次的用户状态
                    const playerSummaries =
                        await steamService.getPlayerSummaries(batch);

                    if (playerSummaries.length > 0) {
                        // 检测状态变化
                        const changes =
                            steamCacheService.detectStatusChanges(
                                playerSummaries,
                            );

                        // 误报检测: 分流为「已确认」与「待确认(冻结)」
                        const resolution =
                            falsePositiveService.resolve(
                                playerSummaries,
                                changes,
                            );

                        if (resolution.confirmed.length > 0) {
                            pluginState.logger.info(
                                `检测到 ${resolution.confirmed.length} 个 Steam 状态变化`,
                            );

                            // 记录到时间线 (使用状态事件时刻)
                            timelineService.record(
                                resolution.confirmed,
                            );

                            await this.handleStatusChanges(
                                resolution.confirmed,
                                allBindItems,
                            );
                        }

                        // 更新缓存 (待确认项冻结, 确认项折叠为游玩场次)
                        const updatableSummaries =
                            playerSummaries.filter(
                                (summary) =>
                                    !resolution.frozenSteamIds.has(
                                        summary.steamid,
                                    ),
                            );
                        steamCacheService.updateCacheBatch(
                            updatableSummaries,
                            resolution.confirmed,
                        );

                        // 头像地址变化时写回绑定, 供 WebUI 代理使用
                        steamAvatarService.syncFaces(playerSummaries);
                    }
                } catch (error) {
                    pluginState.logger.error(
                        `查询 Steam 批次 ${i / batchSize + 1} 时出错:`,
                        error,
                    );
                }
            }

            pluginState.logger.debug('Steam 状态轮询完成');
        } catch (error) {
            pluginState.logger.error(
                '执行 Steam 状态轮询时出错:',
                error,
            );
        }
    }

    /**
     * 获取所有 Steam 绑定项
     */
    private getAllSteamBindItems(): SteamBindItem[] {
        return steamBindService.getAll();
    }

    /**
     * 处理检测到的状态变化
     */
    private async handleStatusChanges(
        changes: StatusChanges,
        allBindItems: SteamBindItem[],
    ): Promise<void> {
        // 获取要推送的状态类型配置
        const notifyStatusTypes =
            pluginState.config.notifyStatusTypes || [];

        // 过滤掉不需要推送的状态变化
        const filteredChanges = changes.filter((change) =>
            notifyStatusTypes.includes(change.changeType),
        );

        if (filteredChanges.length === 0) {
            pluginState.logger.debug(
                '所有状态变化都被过滤，跳过推送',
            );
            return;
        }

        if (filteredChanges.length < changes.length) {
            pluginState.logger.debug(
                `过滤后剩余 ${filteredChanges.length}/${changes.length} 个状态变化`,
            );
        }

        for (const change of filteredChanges) {
            try {
                // 获取与该 Steam ID 相关的所有绑定项
                const relatedBindItems = allBindItems.filter(
                    (item) => item.steamId === change.steamId,
                );

                if (relatedBindItems.length === 0) {
                    pluginState.logger.warn(
                        `未找到 Steam ID ${change.steamId} 的绑定项，跳过推送`,
                    );
                    continue;
                }

                // 向所有相关的来源推送消息
                for (const bindItem of relatedBindItems) {
                    if (bindItem.from && bindItem.from.length > 0) {
                        for (const fromInfo of bindItem.from) {
                            try {
                                // 为每个来源生成带有该来源自定义昵称的消息
                                const message =
                                    await this.generateStatusChangeMessageForFrom(
                                        change,
                                        fromInfo,
                                    );
                                await this.sendMessageToSource(
                                    fromInfo,
                                    message,
                                    bindItem,
                                    change,
                                );
                            } catch (error) {
                                pluginState.logger.error(
                                    `向 ${fromInfo.type} ${fromInfo.id} 推送消息时出错:`,
                                    error,
                                );
                            }
                        }
                    }
                }
            } catch (error) {
                pluginState.logger.error(
                    `处理 Steam ID ${change.steamId} 的状态变化时出错:`,
                    error,
                );
            }
        }
    }

    /**
     * 为特定来源生成状态变化推送消息
     */
    private async generateStatusChangeMessageForFrom(
        change: StatusChange,
        fromInfo: {
            id: string;
            type: 'private' | 'group';
            nickname?: string;
        },
    ): Promise<string> {
        // 获取该来源的自定义昵称（如果存在），否则使用原始昵称
        const customNickname =
            fromInfo.nickname || change.newStatus.personaname;
        const timestamp = new Date().toLocaleString('zh-CN');
        const quote = (s?: string | null) => (s ? `「${s}」` : '');

        let message = `[${timestamp}] ${quote(customNickname)}`;

        switch (change.changeType) {
            case 'online':
                message += '上线了';
                break;
            case 'offline':
                message += '离线了';
                break;
            case 'ingame':
                if (
                    change.newStatus.gameextrainfo &&
                    change.newStatus.gameid
                ) {
                    const formattedGameName =
                        await gameNameService.getFormattedGameName(
                            change.newStatus.gameid,
                            change.newStatus.gameextrainfo,
                        );
                    message += `正在游玩${quote(formattedGameName)}`;
                } else if (change.newStatus.gameextrainfo) {
                    message += `正在游玩${quote(change.newStatus.gameextrainfo)}`;
                } else {
                    message += '开始玩游戏了';
                }
                break;
            case 'outgame': {
                let gameName: string =
                    change.oldStatus?.gameextrainfo || '';
                // 尝试获取格式化后的游戏名称
                if (change.oldStatus?.gameid && gameName) {
                    const formatGameName =
                        await gameNameService.getFormattedGameName(
                            change.oldStatus.gameid,
                            gameName,
                        );
                    if (formatGameName) gameName = formatGameName;
                }
                message += `结束游玩${quote(gameName)}`;
                // 如果有游戏开始时间，计算并显示游玩时长
                if (change.oldStatus?.gameStartTime) {
                    const playTimeStr = formatPlayTime(
                        change.oldStatus.gameStartTime,
                        change.detectedAt,
                    );
                    message += `（游玩时长：${playTimeStr}）`;
                }
                break;
            }
            case 'inAfk': {
                message += '开始挂机';
                if (
                    change.newStatus.gameextrainfo &&
                    change.newStatus.gameid
                ) {
                    const formattedGameName =
                        await gameNameService.getFormattedGameName(
                            change.newStatus.gameid,
                            change.newStatus.gameextrainfo,
                        );
                    message += ` - ${quote(formattedGameName)}`;
                } else if (change.newStatus.gameextrainfo) {
                    message += ` - ${quote(change.newStatus.gameextrainfo)}`;
                }
                break;
            }
            case 'outAfk': {
                message += '结束挂机';
                if (
                    change.newStatus.gameextrainfo &&
                    change.newStatus.gameid
                ) {
                    const formattedGameName =
                        await gameNameService.getFormattedGameName(
                            change.newStatus.gameid,
                            change.newStatus.gameextrainfo,
                        );
                    message += ` - ${quote(formattedGameName)}`;
                } else if (change.newStatus.gameextrainfo) {
                    message += ` - ${quote(change.newStatus.gameextrainfo)}`;
                }
                break;
            }
            case 'quitGame': {
                let gameName = change.oldStatus?.gameextrainfo || '';
                // 尝试获取格式化后的游戏名称
                if (change.oldStatus?.gameid && gameName) {
                    const formatGameName =
                        await gameNameService.getFormattedGameName(
                            change.oldStatus.gameid,
                            gameName,
                        );
                    if (formatGameName) gameName = formatGameName;
                }
                message += `结束游玩并下线${quote(gameName)}`;
                // 如果有游戏开始时间，计算并显示游玩时长
                if (change.oldStatus?.gameStartTime) {
                    const playTimeStr = formatPlayTime(
                        change.oldStatus.gameStartTime,
                        change.detectedAt,
                    );
                    message += `（游玩时长：${playTimeStr}）`;
                }
                break;
            }
            case 'switchGame': {
                // 获取旧游戏名称
                let oldGameName =
                    change.oldStatus?.gameextrainfo || '';
                if (change.oldStatus?.gameid && oldGameName) {
                    const formatOldGameName =
                        await gameNameService.getFormattedGameName(
                            change.oldStatus.gameid,
                            oldGameName,
                        );
                    if (formatOldGameName)
                        oldGameName = formatOldGameName;
                }
                // 获取新游戏名称
                let newGameName = '';
                if (
                    change.newStatus.gameid &&
                    change.newStatus.gameextrainfo
                ) {
                    const formatNewGameName =
                        await gameNameService.getFormattedGameName(
                            change.newStatus.gameid,
                            change.newStatus.gameextrainfo,
                        );
                    if (formatNewGameName)
                        newGameName = formatNewGameName;
                }
                message += `结束游玩${quote(oldGameName)}`;
                // 如果有游戏开始时间，计算并显示旧游戏的游玩时长
                if (change.oldStatus?.gameStartTime) {
                    const playTimeStr = formatPlayTime(
                        change.oldStatus.gameStartTime,
                        change.detectedAt,
                    );
                    message += `（游玩时长：${playTimeStr}）`;
                }
                message += `，开始游玩${quote(newGameName)}`;
                break;
            }
            default:
                message += `状态更新: ${steamService.formatPlayerState(change.newStatus.personastate)}`;
                if (change.newStatus.gameextrainfo) {
                    message += ` - ${quote(change.newStatus.gameextrainfo)}`;
                }
                break;
        }

        return message;
    }

    /**
     * 向指定来源发送消息
     */
    private async sendMessageToSource(
        fromInfo: {
            id: string;
            type: 'private' | 'group';
            nickname?: string;
        },
        message: string,
        bindItem: SteamBindItem,
        change: StatusChange,
    ): Promise<void> {
        try {
            // 构建SVG内容
            const statusText = this.getStatusText(change);
            // 对于退出游戏状态，使用旧状态中的游戏名称；其他状态（包括切换游戏）使用新状态
            let gameName: string | null = '';
            if (
                (change.changeType === 'outgame' ||
                    change.changeType === 'quitGame') &&
                change.oldStatus &&
                change.oldStatus.gameextrainfo &&
                change.oldStatus.gameid
            ) {
                gameName = await gameNameService.getFormattedGameName(
                    change.oldStatus.gameid,
                    change.oldStatus.gameextrainfo,
                );
            } else if (
                change.newStatus.gameid &&
                change.newStatus.gameextrainfo
            ) {
                // switchGame 也会使用此分支，显示新游戏名称
                gameName = await gameNameService.getFormattedGameName(
                    change.newStatus.gameid,
                    change.newStatus.gameextrainfo,
                );
            }
            const hasGameName = Boolean(gameName);

            // 动态计算宽度
            const MIN_SVG_WIDTH = 400;
            const MAX_SVG_WIDTH = 2000;
            const leftPadding = 115; // 文本起始 x 坐标
            const rightPadding = 20; // 右侧留白

            const nicknameStyle = {
                fontSize: 18,
                fontWeight: 'bold',
            };
            const gameNameStyle = {
                fontSize: 16,
                fontWeight: 500,
            };

            // 计算第一行宽度：昵称 + 自定义昵称
            let line1Text = change.newStatus.personaname || '';
            if (fromInfo.nickname) {
                line1Text += ` (${fromInfo.nickname})`;
            }
            const line1Width =
                await svgRenderService.calculateTextWidth(
                    line1Text,
                    nicknameStyle,
                );

            // 计算第三行宽度：游戏名称（如果存在）
            const line3Text = gameName || '';
            const line3Width =
                await svgRenderService.calculateTextWidth(
                    line3Text,
                    gameNameStyle,
                );

            // 取最大宽度，并限制在 [最小, 最大] 区间内
            const maxTextWidth = Math.max(line1Width, line3Width);
            const svgWidth = Math.min(
                MAX_SVG_WIDTH,
                Math.max(
                    MIN_SVG_WIDTH,
                    leftPadding + maxTextWidth + rightPadding,
                ),
            );
            const svgHeight = 100;
            const availableWidth =
                svgWidth - leftPadding - rightPadding;

            // 超宽时截断昵称与游戏名
            let personaName = change.newStatus.personaname || '';
            let nickname = fromInfo.nickname;
            if (nickname) {
                const suffixWidth =
                    (await svgRenderService.calculateTextWidth(
                        `(${nickname})`,
                        nicknameStyle,
                    )) + 8;
                const nameWidth = availableWidth - suffixWidth;
                if (nameWidth > 0) {
                    personaName =
                        await svgRenderService.truncateToWidth(
                            personaName,
                            nameWidth,
                            nicknameStyle,
                        );
                } else {
                    personaName = '';
                    nickname = undefined;
                }
            } else {
                personaName = await svgRenderService.truncateToWidth(
                    personaName,
                    availableWidth,
                    nicknameStyle,
                );
            }
            const displayGameName = gameName
                ? await svgRenderService.truncateToWidth(
                      gameName,
                      availableWidth,
                      gameNameStyle,
                  )
                : '';

            const imageFace =
                bindItem.face ||
                change.newStatus.avatarmedium ||
                'https://avatars.steamstatic.com/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb_medium.jpg';

            const notHasGameNameSvgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgWidth} ${svgHeight}">
  <!-- 背景 -->
  <rect width="${svgWidth}" height="${svgHeight}" fill="#202227"/>
  
  <!-- 用户头像 -->
  <image href="${imageFace}"
         x="10" y="10" width="80" height="80"
         preserveAspectRatio="xMidYMid slice" />
  
  <!-- 状态指示条 -->
  <rect x="90" y="10" width="4" height="80" fill="#4cb4ff"/>
  
  <!-- 文本内容 -->
  <g font-family="${RENDER_FONT_FAMILY}">
    <!-- 用户名 + 可选昵称 -->
    <text x="115" y="36" font-size="18" font-weight="bold">
      <tspan fill="#4cb4ff">${escapeXml(personaName)}</tspan>
       ${nickname ? `<tspan dx="8" fill="#898a8b">(${escapeXml(nickname)})</tspan>` : ''}
    </text>
    
    <!-- 状态文本 -->
    <text x="115" y="68" fill="#898a8b" font-size="16">
      <tspan fill="#898a8b">当前</tspan>
      <tspan fill="#4cb4ff">${escapeXml(statusText)}</tspan>
    </text>
  </g>
</svg>`;

            const hasGameNameSvgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgWidth} ${svgHeight}">
  <rect width="${svgWidth}" height="${svgHeight}" fill="#202227"/>
  <image href="${imageFace}"
         x="10" y="10" width="80" height="80"
         preserveAspectRatio="xMidYMid slice" />
  <rect x="90" y="10" width="4" height="80" fill="#4CAF50"/>
  <g font-family="${RENDER_FONT_FAMILY}">
    <text x="115" y="30" font-size="18" font-weight="bold">
      <tspan fill="#cee8b1">${escapeXml(personaName)}</tspan>
      ${nickname ? `<tspan dx="8" fill="#898a8b">(${escapeXml(nickname)})</tspan>` : ''}
    </text>
    <text x="115" y="59" fill="#898a8b" font-size="16">
      ${escapeXml(statusText)}
    </text>
    <text x="115" y="84" fill="#91c257" font-size="16" font-weight="500">${escapeXml(displayGameName)}</text>
  </g>
</svg>`;
            const svgContent = hasGameName
                ? hasGameNameSvgContent
                : notHasGameNameSvgContent;

            // 使用 svg-convert 将 SVG 渲染为 PNG 并转换为 base64
            const svgBase64 =
                await svgRenderService.renderSvg(svgContent);

            // 发送文本消息和PNG图片
            if (svgBase64) {
                if (fromInfo.type === 'group') {
                    await sendGroupMessage(
                        pluginState.ctx,
                        parseInt(fromInfo.id, 10),
                        [
                            {
                                type: 'text',
                                data: { text: `${message}\n` },
                            },
                            {
                                type: 'image',
                                data: {
                                    file: `base64://${svgBase64}`,
                                },
                            },
                        ],
                    );
                } else if (fromInfo.type === 'private') {
                    await sendPrivateMessage(
                        pluginState.ctx,
                        parseInt(fromInfo.id, 10),
                        [
                            {
                                type: 'text',
                                data: { text: `${message}\n` },
                            },
                            {
                                type: 'image',
                                data: {
                                    file: `base64://${svgBase64}`,
                                },
                            },
                        ],
                    );
                }
            } else {
                // 如果图片渲染失败，回退到只发送文本消息
                if (fromInfo.type === 'group') {
                    await sendGroupMessage(
                        pluginState.ctx,
                        parseInt(fromInfo.id, 10),
                        message,
                    );
                } else if (fromInfo.type === 'private') {
                    await sendPrivateMessage(
                        pluginState.ctx,
                        parseInt(fromInfo.id, 10),
                        message,
                    );
                }
            }
        } catch (error) {
            pluginState.logger.error(
                '发送带图片的消息失败，回退到纯文本:',
                error,
            );
            // 如果图片发送失败，回退到只发送文本消息
            if (fromInfo.type === 'group') {
                await sendGroupMessage(
                    pluginState.ctx,
                    parseInt(fromInfo.id, 10),
                    message,
                );
            } else if (fromInfo.type === 'private') {
                await sendPrivateMessage(
                    pluginState.ctx,
                    parseInt(fromInfo.id, 10),
                    message,
                );
            }
        }
    }

    /**
     * 获取状态文本
     */
    private getStatusText(change: StatusChange): string {
        switch (change.changeType) {
            case 'online':
                return '在线';
            case 'offline':
                return '离线';
            case 'ingame':
                return '正在玩';
            case 'outgame':
                return '结束游玩';
            case 'inAfk':
                return '正在挂机';
            case 'outAfk':
                return '结束挂机';
            case 'quitGame':
                return '结束游玩并下线';
            case 'switchGame':
                return '切换游戏';
            default:
                return steamService.formatPlayerState(
                    change.newStatus.personastate,
                );
        }
    }
}

// ==================== 导出单例服务 ====================

export const steamPollingService = new SteamPollingService();
