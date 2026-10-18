/**
 * 重置指令 handler (`#steam reset`)
 *
 * 仅群聊、群管理员及以上可用 (注册表 requiredRole: 'admin', scope: 'group')。
 * 清空当前群的全部 Steam 绑定来源。
 */

import { pluginState } from '../../core/state';
import { steamBindService } from '../../services/steam-bind.service';
import {
    getCooldownRemaining,
    setCooldown,
} from '../../utils/cooldown';
import type { InstructionHandler } from '../instructionRegistry';
import { sendReply } from '../utils';

export const resetHandler: InstructionHandler = async (
    ctx,
    event,
) => {
    const groupId = event.group_id;

    const remaining = getCooldownRemaining(groupId, 'reset');
    if (remaining > 0) {
        await sendReply(ctx, event, `请等待 ${remaining} 秒后再试`);
        return;
    }

    try {
        steamBindService.removeFrom(String(groupId), 'group');
        await sendReply(ctx, event, '已清空当前群组的steam绑定数据');
    } catch (error: unknown) {
        pluginState.logger.error('清空Steam绑定数据时出错:', error);
        await sendReply(
            ctx,
            event,
            `清空失败: ${(error as Error).message}`,
        );
    }

    setCooldown(groupId, 'reset');
};
