/**
 * steam-polling指令处理器
 * 处理 #steam-polling 指令，手动触发一次Steam状态轮询
 * 仅限私聊且在用户白名单内的用户使用
 */

import type { OB11Message } from 'napcat-types/napcat-onebot';
import type { NapCatPluginContext } from 'napcat-types/napcat-onebot/network/plugin/types';
import { sendReply } from './utils';
import { pluginState } from '../core/state';
import { steamPollingService } from '../services/steam-polling.service';

/**
 * 处理 steam-polling 指令
 */
export async function handleSteamPolling(ctx: NapCatPluginContext, event: OB11Message, args: string[]): Promise<void> {
    try {
        // 检查是否为私聊消息
        if (event.message_type !== 'private') {
            await sendReply(ctx, event, '该指令仅支持私聊使用');
            return;
        }

        // 检查用户是否为管理员
        const userId = String(event.user_id);
        if (!pluginState.isUserAdmin(userId)) {
            await sendReply(ctx, event, '您没有权限执行此操作');
            return;
        }

        // 检查插件是否启用
        if (!pluginState.config.enabled) {
            await sendReply(ctx, event, '插件功能未启用');
            return;
        }

        // 检查是否配置了 Steam API Key
        if (!pluginState.config.steamApiKey) {
            await sendReply(ctx, event, '未配置 Steam API Key，无法执行轮询');
            return;
        }

        pluginState.logger.info(`用户 ${userId} 手动触发 Steam 状态轮询`);
        
        // 手动执行一次轮询
        await steamPollingService.pollSteamStatuses();
        
        await sendReply(ctx, event, '已手动执行 Steam 状态轮询');
        pluginState.incrementProcessed();
    } catch (error: any) {
        pluginState.logger.error('执行手动轮询时出错:', error);
        await sendReply(ctx, event, `手动轮询失败: ${error.message}`);
    }
}