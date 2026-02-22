/**
 * Steam 状态缓存服务模块
 * 用于缓存 Steam 用户的上次状态，以便检测状态变化
 */

import { pluginState } from '../core/state';
import type { SteamPlayerSummary } from './steam.service';

// ==================== 缓存数据结构 ====================

/** Steam 状态缓存项接口 */
export interface SteamStatusCacheItem {
    /** Steam ID */
    steamId: string;
    /** 玩家昵称 */
    personaname: string;
    /** 玩家状态码 */
    personastate: number;
    /** 正在玩的游戏信息（如有）*/
    gameextrainfo?: string;
    /** 最后更新时间戳 */
    lastUpdateTime: number;
    /** 游戏开始时间戳（可选，仅在玩游戏时记录）*/
    gameStartTime?: number;
}

/** Steam 状态缓存类型 */
export type SteamStatusCache = Record<string, SteamStatusCacheItem>;

/** 状态变化检测结果接口 */
export interface StatusChange {
    /** Steam ID */
    steamId: string;
    /** 旧状态 */
    oldStatus: SteamStatusCacheItem | null;
    /** 新状态 */
    newStatus: SteamPlayerSummary;
    /** 变化类型 */
    changeType: 'online' | 'offline' | 'ingame' | 'outgame' | 'inAfk' | 'outAfk' | 'quitGame' | 'other';
}

/** 状态变化检测结果数组 */
export type StatusChanges = StatusChange[];

// ==================== Steam 缓存服务类 ====================

class SteamCacheService {
    private readonly cacheFileName = 'steam-status-cache.json';

    /**
     * 加载 Steam 状态缓存
     */
    loadCache(): SteamStatusCache {
        return pluginState.loadDataFile<SteamStatusCache>(this.cacheFileName, {});
    }

    /**
     * 保存 Steam 状态缓存
     */
    saveCache(cache: SteamStatusCache): void {
        pluginState.saveDataFile<SteamStatusCache>(this.cacheFileName, cache);
    }

    /**
     * 更新缓存中的状态
     */
    updateCacheItem(steamId: string, playerSummary: SteamPlayerSummary): void {
        const cache = this.loadCache();
        const now = Date.now();

        cache[steamId] = {
            steamId,
            personaname: playerSummary.personaname,
            personastate: playerSummary.personastate,
            gameextrainfo: playerSummary.gameextrainfo,
            lastUpdateTime: now,
            gameStartTime: playerSummary.gameextrainfo ? now : undefined,
        };
        this.saveCache(cache);
    }

    /**
     * 批量更新缓存
     */
    updateCacheBatch(playerSummaries: SteamPlayerSummary[]): void {
        const cache = this.loadCache();
        const now = Date.now();

        for (const player of playerSummaries) {
            cache[player.steamid] = {
                steamId: player.steamid,
                personaname: player.personaname,
                personastate: player.personastate,
                gameextrainfo: player.gameextrainfo,
                lastUpdateTime: now,
                gameStartTime: player.gameextrainfo ? now : undefined,
            };
        }

        this.saveCache(cache);
    }

    /**
     * 检测状态变化
     * @param currentSummaries 当前查询到的玩家状态
     * @returns 状态变化检测结果数组
     */
    detectStatusChanges(currentSummaries: SteamPlayerSummary[]): StatusChanges {
        const cache = this.loadCache();
        const changes: StatusChanges = [];

        for (const current of currentSummaries) {
            const cached = cache[current.steamid] || null;
            const change = this.analyzeStatusChange(cached, current);

            if (change) {
                changes.push(change);
            }
        }

        return changes;
    }

    /**
     * 分析单个用户的状态变化
     */
    private analyzeStatusChange(
        oldStatus: SteamStatusCacheItem | null,
        newStatus: SteamPlayerSummary
    ): StatusChange | null {
        // 如果没有旧状态，不视为变化（这是首次查询）
        if (!oldStatus) {
            return null;
        }

        // 检查综合状态变化（在线状态和游戏状态的组合）
        const oldWasOnline = oldStatus.personastate > 0;
        const newIsOnline = newStatus.personastate > 0;
        const oldWasInGame = !!oldStatus.gameextrainfo;
        const newIsInGame = !!newStatus.gameextrainfo;
        const oldIsAfk = oldWasInGame && (oldStatus.personastate === 3 || oldStatus.personastate === 4);
        const newIsAfk = newIsInGame && (newStatus.personastate === 3 || newStatus.personastate === 4);

        // 检查从游戏中直接离线的情况（quitGame）
        if (oldWasInGame && !newIsOnline) {
            return {
                steamId: newStatus.steamid,
                oldStatus,
                newStatus,
                changeType: 'quitGame',
            };
        }

        // 检查在线状态变化
        if (oldStatus.personastate !== newStatus.personastate) {
            // 从离线变为在线（但不玩游戏）
            if (!oldWasOnline && newIsOnline && !newIsInGame) {
                return {
                    steamId: newStatus.steamid,
                    oldStatus,
                    newStatus,
                    changeType: 'online',
                };
            }
            // 从离线直接变为游戏中（状态1）
            else if (!oldWasOnline && newIsOnline && newIsInGame && newStatus.personastate === 1) {
                return {
                    steamId: newStatus.steamid,
                    oldStatus,
                    newStatus,
                    changeType: 'ingame',
                };
            }
            // 从离线直接变为挂机中（状态3/4）
            else if (!oldWasOnline && newIsOnline && newIsAfk) {
                return {
                    steamId: newStatus.steamid,
                    oldStatus,
                    newStatus,
                    changeType: 'inAfk',
                };
            }
            // 从在线变为离线（之前可能在线但不玩游戏）
            else if (oldWasOnline && !newIsOnline && !oldWasInGame) {
                return {
                    steamId: newStatus.steamid,
                    oldStatus,
                    newStatus,
                    changeType: 'offline',
                };
            }
            // 从游戏中变为挂机中
            else if (oldWasInGame && !oldIsAfk && newIsAfk) {
                return {
                    steamId: newStatus.steamid,
                    oldStatus,
                    newStatus,
                    changeType: 'inAfk',
                };
            }
            // 从挂机中变为正常游戏中
            else if (oldIsAfk && newIsInGame && !newIsAfk) {
                return {
                    steamId: newStatus.steamid,
                    oldStatus,
                    newStatus,
                    changeType: 'outAfk',
                };
            }
        }

        // 检查游戏状态变化（在线状态下）
        if (oldWasInGame !== newIsInGame) {
            // 开始玩游戏（从在线变为游戏中，状态为1）
            if (newIsInGame && !oldWasInGame && newStatus.personastate === 1) {
                return {
                    steamId: newStatus.steamid,
                    oldStatus,
                    newStatus,
                    changeType: 'ingame',
                };
            }
            // 开始玩游戏（从在线变为挂机中，状态为3/4）
            else if (newIsInGame && !oldWasInGame && newIsAfk) {
                return {
                    steamId: newStatus.steamid,
                    oldStatus,
                    newStatus,
                    changeType: 'inAfk',
                };
            }
            // 结束游戏（变为普通在线状态）
            else if (!newIsInGame && oldWasInGame) {
                // 计算并输出游玩时间
                if (oldStatus.gameStartTime) {
                    const playTimeMs = Date.now() - oldStatus.gameStartTime;
                    const playTimeMinutes = Math.floor(playTimeMs / 60000);
                    const playTimeHours = Math.floor(playTimeMinutes / 60);
                    const playTimeSeconds = Math.floor((playTimeMs % 60000) / 1000);

                    let playTimeStr = '';
                    if (playTimeHours > 0) {
                        playTimeStr += `${playTimeHours}小时`;
                    }
                    if (playTimeMinutes > 0) {
                        playTimeStr += `${playTimeMinutes % 60}分钟`;
                    }
                    if (playTimeSeconds > 0 || playTimeStr === '') {
                        playTimeStr += `${playTimeSeconds}秒`;
                    }

                    pluginState.logger.info(
                        `玩家 ${newStatus.personaname} (${newStatus.steamid}) 结束了游戏 ${oldStatus.gameextrainfo}，游玩时间：${playTimeStr}`
                    );
                }

                return {
                    steamId: newStatus.steamid,
                    oldStatus,
                    newStatus,
                    changeType: 'outgame',
                };
            }
        }
        // 如果都在游戏中，但游戏不同
        else if (oldWasInGame && newIsInGame && oldStatus.gameextrainfo !== newStatus.gameextrainfo) {
            return {
                steamId: newStatus.steamid,
                oldStatus,
                newStatus,
                changeType: 'ingame',
            };
        }

        // 没有重要状态变化
        return null;
    }

    /**
     * 清空缓存
     */
    clearCache(): void {
        this.saveCache({});
    }
}

// ==================== 导出单例服务 ====================

export const steamCacheService = new SteamCacheService();