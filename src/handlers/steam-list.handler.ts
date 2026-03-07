/**
 * steam-list指令处理器
 * 处理 #steam-list 指令
 */

import type { OB11Message } from 'napcat-types/napcat-onebot';
import type { NapCatPluginContext } from 'napcat-types/napcat-onebot/network/plugin/types';
import { sendReply, getCooldownRemaining, setCooldown } from './utils';
import { findSteamBindItemsByFrom } from './steam-utils';
import { pluginState } from '../core/state';
import { steamCacheService } from '../services/steam-cache.service';
import { steamService } from '../services/steam.service';

/**
 * 处理 steam-list 指令
 */
export async function handleSteamList(ctx: NapCatPluginContext, event: OB11Message, args: string[]): Promise<void> {
    const messageType = event.message_type;
    const groupId = event.group_id;

    // 群消息检查 CD
    if (messageType === 'group' && groupId) {
        const remaining = getCooldownRemaining(groupId, 'steam-list');
        if (remaining > 0) {
            await sendReply(ctx, event, `请等待 ${remaining} 秒后再试`);
            return;
        }
    }

    try {
        // 获取当前来源ID和类型
        const currentFromId = event.message_type === 'group' ? String(event.group_id) : String(event.user_id);
        const currentFromType: 'private' | 'group' = event.message_type === 'group' ? 'group' : 'private';

        // 只获取当前来源的绑定数据
        const bindData = findSteamBindItemsByFrom(currentFromId, currentFromType);

        if (bindData.length === 0) {
            await sendReply(ctx, event, '当前没有绑定的 Steam 用户数据');
            return;
        }

        // 获取缓存状态
        const cache = steamCacheService.getCurrentCache();
        
        // 生成列表信息，显示缓存的 Steam 状态
        const listItems = bindData.map((item, index) => {
            const steamId = item.steamId;
            // 获取缓存中的状态信息
            const cachedStatus = cache[steamId];
            let statusText = '离线'; // 默认状态为离线

            if (cachedStatus) {
                const stateText = steamService.formatPlayerState(cachedStatus.personastate);
                if (cachedStatus.gameextrainfo) {
                    statusText = `${stateText} - 游戏: ${cachedStatus.gameextrainfo}`;
                } else {
                    statusText = stateText;
                }
            }

            // 使用 personName 作为默认昵称（如果 nickname 未设置）
            const fromInfo = item.from?.find(
                from => from.id === currentFromId && from.type === currentFromType
            );
            const displayNickname = fromInfo?.nickname ? ` (${fromInfo.nickname})` : '';
            const personName = item.personName || '未知昵称';

            return `${index + 1}. ${personName}${displayNickname} (Steam ID: ${steamId})\n   状态: ${statusText}`;
        });

        const listText = ['当前绑定的 Steam 用户列表:', ...listItems].join('\n');
        await sendReply(ctx, event, listText);
        pluginState.incrementProcessed();
    } catch (error: any) {
        pluginState.logger.error('获取 Steam 绑定列表时出错:', error);
        await sendReply(ctx, event, `获取列表失败: ${error.message}`);
    }

    if (messageType === 'group' && groupId) setCooldown(groupId, 'steam-list');
}