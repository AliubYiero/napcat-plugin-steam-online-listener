/**
 * 手动轮询指令 handler (`#steam polling`)
 *
 * 仅私聊超级管理员可用 (注册表 requiredRole: 'superAdmin', scope: 'private')。
 */

import { pluginState } from '../../core/state';
import { steamPollingService } from '../../services/steam-polling.service';
import type { InstructionHandler } from '../instructionRegistry';
import { sendReply } from '../utils';

export const pollingHandler: InstructionHandler = async (
    ctx,
    event,
    _commands,
    userRole,
) => {
    try {
        if (!pluginState.config.steamApiKey) {
            await sendReply(
                ctx,
                event,
                '未配置 Steam API Key，无法执行轮询',
            );
            return;
        }

        pluginState.logger.info(
            `用户 ${userRole.userId} 手动触发 Steam 状态轮询`,
        );

        await steamPollingService.pollSteamStatuses();

        await sendReply(ctx, event, '已手动执行 Steam 状态轮询');
    } catch (error: unknown) {
        pluginState.logger.error('执行手动轮询时出错:', error);
        await sendReply(
            ctx,
            event,
            `手动轮询失败: ${(error as Error).message}`,
        );
    }
};
