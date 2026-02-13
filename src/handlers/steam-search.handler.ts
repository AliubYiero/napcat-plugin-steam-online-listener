/**
 * steam-search指令处理器
 * 处理 #steam-search 指令
 */

import type { OB11Message } from 'napcat-types/napcat-onebot';
import type { NapCatPluginContext } from 'napcat-types/napcat-onebot/network/plugin/types';
import { sendReply, getCooldownRemaining, setCooldown } from './utils';
import { steamService } from '../services/steam.service';
import { pluginState } from '../core/state';

/**
 * 处理 steam-search 指令
 */
export async function handleSteamSearch(ctx: NapCatPluginContext, event: OB11Message, args: string[]): Promise<void> {
    const messageType = event.message_type;
    const groupId = event.group_id;

    // 群消息检查 CD
    if (messageType === 'group' && groupId) {
        const remaining = getCooldownRemaining(groupId, 'steam-search');
        if (remaining > 0) {
            await sendReply(ctx, event, `请等待 ${remaining} 秒后再试`);
            return;
        }
    }

    if (args.length < 2) {
        await sendReply(ctx, event, '用法: #steam-search <STEAM昵称>');
        return;
    }

    const steamProfileUrl = args[1];
    try {
        // 从URL中提取Steam ID（如果用户输入的是链接）
        let steamIdInput = steamProfileUrl;
        
        // 如果输入的是URL，则尝试提取自定义ID部分
        if (steamProfileUrl.startsWith('http')) {
            const url = new URL(steamProfileUrl);
            if (url.hostname.includes('steamcommunity.com')) {
                // 提取URL路径的最后一段作为Steam ID
                const pathParts = url.pathname.split('/');
                const idIndex = pathParts.indexOf('profiles') + 1;
                if (idIndex > 0 && idIndex < pathParts.length) {
                    steamIdInput = pathParts[idIndex];
                } else {
                    const idIndex = pathParts.indexOf('id') + 1;
                    if (idIndex > 0 && idIndex < pathParts.length) {
                        steamIdInput = pathParts[idIndex];
                    }
                }
            }
        }

        if (!steamIdInput) {
            await sendReply(ctx, event, '错误 Steam 昵称格式，请检查输入。');
            return;
        }

        // 使用getSteamID64方法获取Steam ID64
        const steamID64 = await steamService.getSteamID64(steamIdInput);
        
        if (steamID64) {
            await sendReply(ctx, event, `用户 ${steamIdInput} 的 Steam ID64: ${steamID64}`);
        } else {
            await sendReply(ctx, event, '无法获取Steam ID64，请检查输入的链接或ID是否正确。');
        }

        pluginState.incrementProcessed();
    } catch (error: any) {
        pluginState.logger.error('查询Steam ID时出错:', error);
        await sendReply(ctx, event, `查询失败: ${error.message}`);
    }

    if (messageType === 'group' && groupId) setCooldown(groupId, 'steam-search');
}