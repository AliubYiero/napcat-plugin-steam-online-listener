/**
 * 绑定指令 handler (`#steam bind <steam-id> [自定义昵称]`)
 *
 * 仅群聊可用 (注册表 scope: 'group')。绑定来源固定为当前群。
 */

import { pluginState } from '../../core/state';
import { steamService } from '../../services/steam.service';
import { steamBindService } from '../../services/steam-bind.service';
import { steamPollingService } from '../../services/steam-polling.service';
import {
    getCooldownRemaining,
    setCooldown,
} from '../../utils/cooldown';
import type { InstructionHandler } from '../instructionRegistry';
import { sendReply } from '../utils';

/** 验证 Steam ID 是否为纯数字格式 */
function isValidSteamId64(steamId: string): boolean {
    return /^\d+$/.test(steamId);
}

export const bindHandler: InstructionHandler = async (
    ctx,
    event,
    commands,
) => {
    const groupId = event.group_id;

    const remaining = getCooldownRemaining(groupId, 'bind');
    if (remaining > 0) {
        await sendReply(ctx, event, `请等待 ${remaining} 秒后再试`);
        return;
    }

    if (commands.length < 1) {
        await sendReply(
            ctx,
            event,
            '用法: #steam bind <steam-id> [自定义用户昵称]',
        );
        return;
    }

    try {
        let steamId = commands[0];
        const nickname =
            commands.length > 1 ? commands[1] : undefined;

        // 非纯数字则尝试解析为自定义 ID
        if (!isValidSteamId64(steamId)) {
            pluginState.logger.debug(
                `Steam ID 不是纯数字格式，尝试解析为自定义 ID: ${steamId}`,
            );
            const resolvedId =
                await steamService.getSteamID64(steamId);
            if (!resolvedId) {
                await sendReply(
                    ctx,
                    event,
                    'Steam ID 格式无效，请输入有效的 Steam ID64（纯数字）或自定义 ID',
                );
                return;
            }
            steamId = resolvedId;
        }

        // 验证用户是否存在（含二次验证）
        let playerSummary =
            await steamService.getPlayerSummary(steamId);
        if (!playerSummary) {
            const resolvedSteamId =
                await steamService.getSteamID64(steamId);
            if (resolvedSteamId) {
                playerSummary =
                    await steamService.getPlayerSummary(
                        resolvedSteamId,
                    );
                steamId = resolvedSteamId;
            }
        }

        if (!playerSummary) {
            await sendReply(
                ctx,
                event,
                `无法找到 Steam 用户: ${steamId}，请检查 Steam ID 是否正确。`,
            );
            return;
        }

        const sourceId = String(groupId);
        let bindItem = steamBindService.findBySteamId(steamId);
        if (!bindItem) {
            bindItem = {
                steamId,
                personName: playerSummary.personaname,
                face: playerSummary.avatarmedium,
                from: [
                    {
                        id: sourceId,
                        type: 'group',
                        nickname: nickname || undefined,
                    },
                ],
            };
        } else {
            const newFromInfo = {
                id: sourceId,
                type: 'group' as const,
                nickname: nickname || undefined,
            };
            const existingIndex = bindItem.from?.findIndex(
                (fromInfo) =>
                    fromInfo.id === newFromInfo.id &&
                    fromInfo.type === newFromInfo.type,
            );
            if (existingIndex !== undefined && existingIndex !== -1) {
                bindItem.from![existingIndex] = {
                    ...bindItem.from![existingIndex],
                    ...newFromInfo,
                };
            } else {
                if (!bindItem.from) bindItem.from = [];
                bindItem.from.push(newFromInfo);
            }
            if (playerSummary.avatarmedium) {
                bindItem.face = playerSummary.avatarmedium;
            }
            if (playerSummary.personaname) {
                bindItem.personName = playerSummary.personaname;
            }
        }

        steamBindService.update(bindItem);

        // 绑定完成后手动触发一次状态查询（失败不影响绑定结果）
        try {
            await steamPollingService.pollSteamStatuses();
        } catch (error) {
            pluginState.logger.warn('绑定完成后状态查询失败:', error);
        }

        await sendReply(
            ctx,
            event,
            `成功绑定 Steam 用户: ${playerSummary.personaname} (ID: ${steamId})${nickname ? `，昵称: ${nickname}` : ''}`,
        );
    } catch (error: unknown) {
        pluginState.logger.error('绑定 Steam 数据时出错:', error);
        await sendReply(
            ctx,
            event,
            `绑定失败: ${(error as Error).message}`,
        );
    }

    setCooldown(groupId, 'bind');
};
