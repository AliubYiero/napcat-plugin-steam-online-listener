/**
 * steam-bind-nickname指令处理器
 * 处理 #steam-bind-nickname 指令
 */

import type { OB11Message } from 'napcat-types/napcat-onebot';
import type { NapCatPluginContext } from 'napcat-types/napcat-onebot/network/plugin/types';
import { sendReply, getCooldownRemaining, setCooldown } from './utils';
import { findSteamBindItem, updateSteamBindItem } from './steam-utils';
import { pluginState } from '../core/state';

/**
 * 处理 steam-bind-nickname 指令
 */
export async function handleSteamBindNickname(ctx: NapCatPluginContext, event: OB11Message, args: string[]): Promise<void> {
    const messageType = event.message_type;
    const groupId = event.group_id;

    // 群消息检查 CD
    if (messageType === 'group' && groupId) {
        const remaining = getCooldownRemaining(groupId, 'steam-bind-nickname');
        if (remaining > 0) {
            await sendReply(ctx, event, `请等待 ${remaining} 秒后再试`);
            return;
        }
    }

    if (args.length < 3) {
        await sendReply(ctx, event, '用法: #steam-bind-nickname <steam-id> <自定义用户昵称>');
        return;
    }

    try {
        const steamId = parseInt(args[1]);
        const nickname = args[2];

        if (isNaN(steamId)) {
            await sendReply(ctx, event, 'Steam ID 必须是数字');
            return;
        }

        // 查找现有的绑定项
        let bindItem = findSteamBindItem(steamId);
        if (!bindItem) {
            await sendReply(ctx, event, `未找到 Steam ID: ${steamId} 的绑定记录`);
            return;
        }

        // 验证绑定数据的来源是否一致
        const currentFrom = event.message_type === 'group' ? String(event.group_id) : String(event.user_id);
        const currentFromType: 'private' | 'group' = event.message_type === 'group' ? 'group' : 'private';
        
        // 检查当前用户是否在来源列表中
        const isFromCurrent = bindItem.from?.some(
            fromInfo => fromInfo.id === currentFrom && fromInfo.type === currentFromType
        );
        
        if (!isFromCurrent) {
            await sendReply(ctx, event, `无法修改 Steam ID: ${steamId} 的绑定信息，您无权修改此记录。`);
            return;
        }

        bindItem.nickname = nickname;

        // 更新绑定数据
        updateSteamBindItem(bindItem);

        await sendReply(ctx, event, `成功更新 Steam ID: ${steamId} 的昵称为: ${nickname}`);
        pluginState.incrementProcessed();
    } catch (error: any) {
        pluginState.logger.error('更新 Steam 昵称时出错:', error);
        await sendReply(ctx, event, `更新失败: ${error.message}`);
    }

    if (messageType === 'group' && groupId) setCooldown(groupId, 'steam-bind-nickname');
}