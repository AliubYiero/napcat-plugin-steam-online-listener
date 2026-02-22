/**
 * steam-remove指令处理器
 * 处理 #steam-remove <steam-id> 指令，用于移除绑定数据
 */

import type { OB11Message } from 'napcat-types/napcat-onebot';
import type { NapCatPluginContext } from 'napcat-types/napcat-onebot/network/plugin/types';
import { sendReply, getCooldownRemaining, setCooldown } from './utils';
import { 
    findSteamBindItem, 
    updateSteamBindItem,
    loadSteamBindData, 
    saveSteamBindData 
} from './steam-utils';
import { pluginState } from '../core/state';

/**
 * 处理 steam-remove 指令
 */
export async function handleSteamRemove(ctx: NapCatPluginContext, event: OB11Message, args: string[]): Promise<void> {
    const messageType = event.message_type;
    const groupId = event.group_id;

    // 群消息检查 CD
    if (messageType === 'group' && groupId) {
        const remaining = getCooldownRemaining(groupId, 'steam-remove');
        if (remaining > 0) {
            await sendReply(ctx, event, `请等待 ${remaining} 秒后再试`);
            return;
        }
    }

    try {
        // 检查参数
        if (args.length < 2) {
            await sendReply(ctx, event, '指令格式错误，请使用: #steam-remove <steam-id>');
            return;
        }

        const steamId = args[1];
        if (!steamId) {
            await sendReply(ctx, event, '请输入要移除的 Steam ID');
            return;
        }

        // 获取当前来源ID和类型
        const currentFromId = event.message_type === 'group' ? String(event.group_id) : String(event.user_id);
        const currentFromType: 'private' | 'group' = event.message_type === 'group' ? 'group' : 'private';

        // 查找绑定项
        const bindItem = findSteamBindItem(steamId);
        if (!bindItem) {
            await sendReply(ctx, event, `未找到 Steam ID ${steamId} 的绑定数据`);
            return;
        }

        // 检查当前用户是否可以移除这个绑定项
        // 用户只能移除自己绑定的数据（即在 from 列表中包含当前来源的数据）
        if (!bindItem.from || !bindItem.from.some(fromInfo => 
            fromInfo.id === currentFromId && fromInfo.type === currentFromType
        )) {
            await sendReply(ctx, event, `您没有权限移除 Steam ID ${steamId} 的绑定数据`);
            return;
        }

        // 从绑定项中移除当前来源的记录
        const data = loadSteamBindData();
        const updatedData = data.map(item => {
            if (item.steamId === steamId) {
                if (item.from) {
                    // 过滤掉当前来源的记录
                    const filteredFrom = item.from.filter(
                        fromInfo => !(fromInfo.id === currentFromId && fromInfo.type === currentFromType)
                    );
                    
                    // 如果过滤后还有其他来源，则只更新from数组
                    if (filteredFrom.length > 0) {
                        return { ...item, from: filteredFrom };
                    } else {
                        // 如果没有其他来源了，返回null以便稍后过滤掉该项
                        return null;
                    }
                }
                // 如果没有from数组，则返回null（移除该项）
                return null;
            }
            return item;
        }).filter(item => item !== null);

        saveSteamBindData(updatedData);

        await sendReply(ctx, event, `已成功移除 Steam ID ${steamId} 的绑定数据`);
        pluginState.incrementProcessed();
    } catch (error: any) {
        pluginState.logger.error('移除 Steam 绑定数据时出错:', error);
        await sendReply(ctx, event, `移除失败: ${error.message}`);
    }

    if (messageType === 'group' && groupId) setCooldown(groupId, 'steam-remove');
}