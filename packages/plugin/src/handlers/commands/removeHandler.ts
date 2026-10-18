/**
 * 移除绑定指令 handler (`#steam remove <steam-id>`)
 *
 * 仅群聊可用 (注册表 scope: 'group')。只能移除当前群的绑定来源。
 */

import { pluginState } from '../../core/state';
import { steamBindService } from '../../services/steam-bind.service';
import {
    getCooldownRemaining,
    setCooldown,
} from '../../utils/cooldown';
import type { InstructionHandler } from '../instructionRegistry';
import { sendReply } from '../utils';

export const removeHandler: InstructionHandler = async (
    ctx,
    event,
    commands,
) => {
    const groupId = event.group_id;

    const remaining = getCooldownRemaining(groupId, 'remove');
    if (remaining > 0) {
        await sendReply(ctx, event, `请等待 ${remaining} 秒后再试`);
        return;
    }

    try {
        if (commands.length < 1) {
            await sendReply(
                ctx,
                event,
                '指令格式错误，请使用: #steam remove <steam-id>',
            );
            return;
        }

        const steamId = commands[0];
        const currentFromId = String(groupId);

        const bindItem = steamBindService.findBySteamId(steamId);
        if (!bindItem) {
            await sendReply(
                ctx,
                event,
                `未找到 Steam ID ${steamId} 的绑定数据`,
            );
            return;
        }

        // 只能移除当前群自己绑定的来源
        if (
            !bindItem.from ||
            !bindItem.from.some(
                (fromInfo) =>
                    fromInfo.id === currentFromId &&
                    fromInfo.type === 'group',
            )
        ) {
            await sendReply(
                ctx,
                event,
                `您没有权限移除 Steam ID ${steamId} 的绑定数据`,
            );
            return;
        }

        const data = steamBindService.getAll();
        const updatedData = data
            .map((item) => {
                if (item.steamId !== steamId) return item;
                if (!item.from) return null;
                const filteredFrom = item.from.filter(
                    (fromInfo) =>
                        !(
                            fromInfo.id === currentFromId &&
                            fromInfo.type === 'group'
                        ),
                );
                return filteredFrom.length > 0
                    ? { ...item, from: filteredFrom }
                    : null;
            })
            .filter((item) => item !== null);

        steamBindService.save(updatedData);

        await sendReply(
            ctx,
            event,
            `已成功移除 Steam ID ${steamId} 的绑定数据`,
        );
    } catch (error: unknown) {
        pluginState.logger.error('移除 Steam 绑定数据时出错:', error);
        await sendReply(
            ctx,
            event,
            `移除失败: ${(error as Error).message}`,
        );
    }

    setCooldown(groupId, 'remove');
};
