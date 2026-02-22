/**
 * Steam 服务模块
 * 提供 Steam API 相关功能，包括获取玩家摘要信息
 */

import { pluginState } from '../core/state';
import type { SkinflowSteamIDResponse } from '../types';

// ==================== Steam API 响应类型定义 ====================

/** Steam 玩家摘要信息接口 */
export interface SteamPlayerSummary {
    /** 64位 Steam ID */
    steamid: string;
    /** 玩家昵称（显示名称） */
    personaname: string;
    /** 玩家资料页面 URL */
    profileurl: string;
    /** 32x32 像素头像 URL */
    avatar: string;
    /** 64x64 像素头像 URL */
    avatarmedium: string;
    /** 184x184 像素头像 URL */
    avatarfull: string;
    /** 玩家当前状态：0-离线, 1-在线, 2-忙碌, 3-外出, 4-小憩, 5-寻求交易, 6-寻求游戏 */
    personastate: number;
    /** 资料可见性状态：1-不可见, 3-公开 */
    communityvisibilitystate: number;
    /** 资料状态（是否配置了社区资料） */
    profilestate?: number;
    /** 最后离线时间（Unix 时间戳） */
    lastlogoff?: number;
    /** 评论权限 */
    commentpermission?: number;
    /** 真实姓名 */
    realname?: string;
    /** 主要群组 ID */
    primaryclanid?: string;
    /** 账号创建时间（Unix 时间戳） */
    timecreated?: number;
    /** 当前游戏 ID */
    gameid?: string;
    /** 游戏服务器 IP 和端口 */
    gameserverip?: string;
    /** 当前游戏信息 */
    gameextrainfo?: string;
    /** 国家代码 */
    loccountrycode?: string;
    /** 州/省代码 */
    locstatecode?: string;
    /** 城市 ID */
    loccityid?: number;
}

/** GetPlayerSummaries API 响应格式 */
export interface GetPlayerSummariesResponse {
    response: {
        players: SteamPlayerSummary[];
    };
}

/** ResolveVanityURL API 响应格式 */
export interface ResolveVanityURLResponse {
    response: {
        steamid?: string;
        success: number;
        message?: string;
    };
}

// ==================== Steam 服务类 ====================

class SteamService {
    private readonly steamApiBaseUrl = 'http://api.steampowered.com';

    /**
     * 获取玩家摘要信息
     * @param steamIds 一个或多个 Steam ID（用逗号分隔）
     * @returns 玩家摘要信息列表
     */
    async getPlayerSummaries(steamIds: string | string[]): Promise<SteamPlayerSummary[]> {
        try {
            // 处理 Steam ID 参数
            const steamIdsString = Array.isArray(steamIds) ? steamIds.join(',') : steamIds;
            
            // 验证是否配置了 Steam API Key
            if (!pluginState.config.steamApiKey) {
                throw new Error('Steam API Key 未配置');
            }

            // 构建 API 请求参数
            const params = new URLSearchParams({
                key: pluginState.config.steamApiKey,
                steamids: steamIdsString,
                format: 'json'
            });

            // 发送 API 请求
            const response = await fetch(`${this.steamApiBaseUrl}/ISteamUser/GetPlayerSummaries/v0002/?${params.toString()}`);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data: GetPlayerSummariesResponse = await response.json();

            pluginState.logger.debug(`Steam API 请求成功，返回 ${data.response.players.length} 个玩家信息`);
            return data.response.players;
        } catch (error: any) {
            // 检查错误类型并提供详细错误信息
            let errorMessage = '获取 Steam 玩家信息失败';
            if (error instanceof TypeError && error.message.includes('fetch')) {
                errorMessage = '无法连接到 Steam API 服务器';
            } else if (error.message && error.message.includes('HTTP')) {
                const match = error.message.match(/HTTP (\d+):/);
                if (match) {
                    const status = parseInt(match[1]);
                    if (status === 403 || status === 401) {
                        errorMessage = 'Steam API Key 无效或无权限访问';
                    } else {
                        errorMessage = `Steam API 错误: ${status} - ${error.message}`;
                    }
                } else {
                    errorMessage = error.message;
                }
            } else {
                // 其他错误
                errorMessage = `请求 Steam API 时发生错误: ${error.message}`;
            }

            pluginState.logger.error(errorMessage, error);
            throw new Error(errorMessage);
        }
    }

    /**
     * 获取单个玩家的摘要信息
     * @param steamId 单个 Steam ID
     * @returns 玩家摘要信息
     */
    async getPlayerSummary(steamId: string): Promise<SteamPlayerSummary | null> {
        try {
            const players = await this.getPlayerSummaries(steamId);
            return players.length > 0 ? players[0] : null;
        } catch (error) {
            pluginState.logger.error(`获取玩家 ${steamId} 信息失败:`, error);
            return null;
        }
    }

    /**
     * 验证 Steam API Key 是否有效
     * @returns 验证结果
     */
    async validateApiKey(): Promise<boolean> {
        try {
            if (!pluginState.config.steamApiKey) {
                return false;
            }

            // 尝试获取一个已知的公共账户信息来验证 API Key
            // 使用 Steam 官方账户的 ID 作为测试
            const players = await this.getPlayerSummaries('76561197960435530'); // Steam 官方测试 ID
            return players.length > 0;
        } catch (error) {
            pluginState.logger.warn('Steam API Key 验证失败:', error);
            return false;
        }
    }

    /**
     * 格式化玩家状态为可读文本
     * @param state 玩家状态码
     * @returns 可读状态文本
     */
    formatPlayerState(state: number): string {
        const states: Record<number, string> = {
            0: '离线',
            1: '在线',
            2: '忙碌',
            3: '离开',
            4: '休眠',
            5: '寻求交易',
            6: '寻求游戏'
        };
        return states[state] || '未知状态';
    }

    /**
     * 格式化可见性状态为可读文本
     * @param state 可见性状态码
     * @returns 可读状态文本
     */
    formatVisibilityState(state: number): string {
        const states: Record<number, string> = {
            1: '不可见',
            3: '公开'
        };
        return states[state] || `未知状态 (${state})`;
    }

    /**
     * 通过Steam API查询自定义ID对应的Steam ID64
     * @param steamId 输入的Steam自定义ID
     * @returns Steam ID64字符串
     */
    async getSteamID64(steamId: string): Promise<string | null> {
        try {
            // 验证是否配置了 Steam API Key
            if (!pluginState.config.steamApiKey) {
                throw new Error('Steam API Key 未配置');
            }

            pluginState.logger.debug(`正在通过Steam API查询自定义ID: ${steamId}`);
            
            // 构建 API 请求参数
            const params = new URLSearchParams({
                key: pluginState.config.steamApiKey,
                vanityurl: steamId,
                format: 'json'
            });

            // 发送 API 请求
            const response = await fetch(`${this.steamApiBaseUrl}/ISteamUser/ResolveVanityURL/v0001/?${params.toString()}`);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data: ResolveVanityURLResponse = await response.json();

            // 检查API响应是否成功
            if (data.response.success === 1 && data.response.steamid) {
                pluginState.logger.debug(`成功获取Steam ID64: ${data.response.steamid} for custom ID: ${steamId}`);
                return data.response.steamid;
            } else {
                // API返回失败码
                const errorCode = data.response.success;
                const errorMessage = data.response.message || '未知错误';
                pluginState.logger.warn(`Steam API查询失败: 错误码 ${errorCode}, 信息: ${errorMessage}`);
                return null;
            }
        } catch (error: any) {
            // 检查错误类型并提供详细错误信息
            let errorMessage = `查询Steam ID64失败: ${steamId}`;
            if (error instanceof TypeError && error.message.includes('fetch')) {
                errorMessage = '无法连接到Steam API服务器';
            } else if (error.message && error.message.includes('HTTP')) {
                const match = error.message.match(/HTTP (\d+):/);
                if (match) {
                    const status = parseInt(match[1]);
                    if (status === 403 || status === 401) {
                        errorMessage = 'Steam API Key 无效或无权限访问';
                    } else {
                        errorMessage = `Steam API错误: ${status} - ${error.message}`;
                    }
                } else {
                    errorMessage = error.message;
                }
            } else {
                // 其他错误
                errorMessage = `请求Steam API时发生错误: ${error.message}`;
            }

            pluginState.logger.error(errorMessage, error);
            throw new Error(errorMessage);
        }
    }
}

// ==================== 导出单例服务 ====================

export const steamService = new SteamService();
