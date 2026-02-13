/**
 * ping指令处理器
 * 处理 #ping 指令
 */

import type { OB11Message } from 'napcat-types/napcat-onebot';
import type { NapCatPluginContext } from 'napcat-types/napcat-onebot/network/plugin/types';
import { sendReply, getCooldownRemaining, setCooldown } from './utils';
import { pluginState } from '../core/state';

/**
 * 处理 ping 指令
 */
export async function handlePing(ctx: NapCatPluginContext, event: OB11Message, args: string[]): Promise<void> {
    const messageType = event.message_type;
    const groupId = event.group_id;

    // 群消息检查 CD
    if (messageType === 'group' && groupId) {
        const remaining = getCooldownRemaining(groupId, 'ping');
        if (remaining > 0) {
            await sendReply(ctx, event, `请等待 ${remaining} 秒后再试`);
            return;
        }
    }

    await sendReply(ctx, event, 'pong!');
    if (messageType === 'group' && groupId) setCooldown(groupId, 'ping');
    pluginState.incrementProcessed();
}