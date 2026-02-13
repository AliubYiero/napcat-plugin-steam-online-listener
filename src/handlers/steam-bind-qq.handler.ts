/**
 * steam-bind-qq指令处理器
 * 处理 #steam-bind-qq 指令
 */

import type { OB11Message } from 'napcat-types/napcat-onebot';
import type { NapCatPluginContext } from 'napcat-types/napcat-onebot/network/plugin/types';
import { sendReply, getCooldownRemaining, setCooldown } from './utils';
import { findSteamBindItem, updateSteamBindItem } from './steam-utils';
import { pluginState } from '../core/state';

/**
 * 处理 steam-bind-qq 指令
 */
export async function handleSteamBindQQ(ctx: NapCatPluginContext, event: OB11Message, args: string[]): Promise<void> {
    const messageType = event.message_type;
    const groupId = event.group_id;

    // 群消息检查 CD
    if (messageType === 'group' && groupId) {
        const remaining = getCooldownRemaining(groupId, 'steam-bind-qq');
        if (remaining > 0) {
            await sendReply(ctx, event, `请等待 ${remaining} 秒后再试`);
            return;
        }
    }

    if (args.length < 3) {
        await sendReply(ctx, event, '用法: #steam-bind-qq <steam-id> <绑定qq号>');
        return;
    }

    try {
        const steamId = parseInt(args[1]);
        const userQQ = parseInt(args[2]);

        if (isNaN(steamId) || isNaN(userQQ)) {
            await sendReply(ctx, event, 'Steam ID 和 QQ 号必须是数字');
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

        bindItem.userQQ = userQQ;

        // 更新绑定数据
        updateSteamBindItem(bindItem);

        await sendReply(ctx, event, `成功绑定 Steam ID: ${steamId} 到 QQ: ${userQQ}`);
        pluginState.incrementProcessed();
    } catch (error: any) {
        pluginState.logger.error('绑定 Steam QQ 时出错:', error);
        await sendReply(ctx, event, `绑定失败: ${error.message}`);
    }

    if (messageType === 'group' && groupId) setCooldown(groupId, 'steam-bind-qq');
}