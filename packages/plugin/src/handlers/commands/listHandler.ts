/**
 * 列出绑定指令 handler (`#steam list`)
 *
 * 仅群聊可用 (注册表 scope: 'group')。只展示当前群的绑定。
 */

import { pluginState } from '../../core/state';
import { steamService } from '../../services/steam.service';
import { steamBindService } from '../../services/steam-bind.service';
import { steamCacheService } from '../../services/steam-cache.service';
import {
    getCooldownRemaining,
    setCooldown,
} from '../../utils/cooldown';
import type { InstructionHandler } from '../instructionRegistry';
import { sendReply } from '../utils';

export const listHandler: InstructionHandler = async (ctx, event) => {
    const groupId = event.group_id;

    const remaining = getCooldownRemaining(groupId, 'list');
    if (remaining > 0) {
        await sendReply(ctx, event, `请等待 ${remaining} 秒后再试`);
        return;
    }

    try {
        const currentFromId = String(groupId);
        const bindData = steamBindService.findByFrom(
            currentFromId,
            'group',
        );

        if (bindData.length === 0) {
            await sendReply(
                ctx,
                event,
                '当前没有绑定的 Steam 用户数据',
            );
            return;
        }

        const cache = steamCacheService.getCurrentCache();
        const listItems = bindData.map((item, index) => {
            const steamId = item.steamId;
            const cachedStatus = cache[steamId];
            let statusText = '离线';

            if (cachedStatus) {
                const stateText = steamService.formatPlayerState(
                    cachedStatus.personastate,
                );
                statusText = cachedStatus.gameextrainfo
                    ? `${stateText} - 游戏: ${cachedStatus.gameextrainfo}`
                    : stateText;
            }

            const fromInfo = item.from?.find(
                (from) =>
                    from.id === currentFromId &&
                    from.type === 'group',
            );
            const displayNickname = fromInfo?.nickname
                ? ` (${fromInfo.nickname})`
                : '';
            const personName = item.personName || '未知昵称';

            return `${index + 1}. ${personName}${displayNickname} (Steam ID: ${steamId})\n   状态: ${statusText}`;
        });

        await sendReply(
            ctx,
            event,
            ['当前绑定的 Steam 用户列表:', ...listItems].join('\n'),
        );
    } catch (error: unknown) {
        pluginState.logger.error('获取 Steam 绑定列表时出错:', error);
        await sendReply(
            ctx,
            event,
            `获取列表失败: ${(error as Error).message}`,
        );
    }

    setCooldown(groupId, 'list');
};
