/**
 * 批量绑定指令 handler (`#steam bind-batch <steam-id-1> <nickname-1> ...`)
 *
 * 仅群聊可用 (注册表 scope: 'group')。每两个令牌构成一对 (steamId + nickname)。
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

/** 解析批量绑定参数: 每两个令牌为一组 (steamId + nickname) */
function parseBatchArgs(
    commands: string[],
): Array<{ steamId: string; nickname: string }> {
    const tokens = commands.filter((token) => token.length > 0);
    const pairs: Array<{ steamId: string; nickname: string }> = [];
    for (let i = 0; i < tokens.length; i += 2) {
        if (i + 1 < tokens.length) {
            pairs.push({
                steamId: tokens[i],
                nickname: tokens[i + 1],
            });
        }
    }
    return pairs;
}

export const bindBatchHandler: InstructionHandler = async (
    ctx,
    event,
    commands,
) => {
    const groupId = event.group_id;

    const remaining = getCooldownRemaining(groupId, 'bind-batch');
    if (remaining > 0) {
        await sendReply(ctx, event, `请等待 ${remaining} 秒后再试`);
        return;
    }

    const pairs = parseBatchArgs(commands);
    if (pairs.length === 0) {
        await sendReply(
            ctx,
            event,
            '用法: #steam bind-batch <steam-id-1> <nickname-1> <steam-id-2> <nickname-2> ...\n参数间可使用空格、换行或制表符分隔',
        );
        return;
    }

    const sourceId = String(groupId);
    const results: Array<{
        steamId: string;
        nickname: string;
        success: boolean;
        message: string;
    }> = [];

    for (const pair of pairs) {
        try {
            let steamId = pair.steamId;
            const nickname = pair.nickname;

            if (!isValidSteamId64(steamId)) {
                const resolvedId =
                    await steamService.getSteamID64(steamId);
                if (!resolvedId) {
                    results.push({
                        steamId: pair.steamId,
                        nickname,
                        success: false,
                        message: 'Steam ID 格式无效（应为纯数字）',
                    });
                    continue;
                }
                steamId = resolvedId;
            }

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
                results.push({
                    steamId: pair.steamId,
                    nickname,
                    success: false,
                    message: '无法找到 Steam 用户',
                });
                continue;
            }

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
                let from = bindItem.from;
                if (!from) {
                    from = [];
                    bindItem.from = from;
                }
                if (
                    existingIndex !== undefined &&
                    existingIndex !== -1
                ) {
                    from[existingIndex] = {
                        ...from[existingIndex],
                        ...newFromInfo,
                    };
                } else {
                    from.push(newFromInfo);
                }
                if (playerSummary.avatarmedium) {
                    bindItem.face = playerSummary.avatarmedium;
                }
                if (playerSummary.personaname) {
                    bindItem.personName = playerSummary.personaname;
                }
            }

            steamBindService.update(bindItem);

            results.push({
                steamId,
                nickname,
                success: true,
                message: playerSummary.personaname,
            });
        } catch (error: unknown) {
            pluginState.logger.error(
                '批量绑定 Steam 数据时出错:',
                error,
            );
            results.push({
                steamId: pair.steamId,
                nickname: pair.nickname,
                success: false,
                message: (error as Error).message || '未知错误',
            });
        }
    }

    const successCount = results.filter((r) => r.success).length;
    const failCount = results.length - successCount;

    let resultMessage = `[= 批量绑定结果 =]\n成功: ${successCount} 个 | 失败: ${failCount} 个\n`;

    if (successCount > 0) {
        resultMessage += '\n[成功列表]\n';
        results
            .filter((r) => r.success)
            .forEach((r) => {
                resultMessage += `✓ ${r.steamId} (${r.nickname}) - ${r.message}\n`;
            });
    }
    if (failCount > 0) {
        resultMessage += '\n[失败列表]\n';
        results
            .filter((r) => !r.success)
            .forEach((r) => {
                resultMessage += `✗ ${r.steamId} (${r.nickname}) - ${r.message}\n`;
            });
    }

    await sendReply(ctx, event, resultMessage.trim());

    if (successCount > 0) {
        try {
            await steamPollingService.pollSteamStatuses();
        } catch (error) {
            pluginState.logger.warn(
                '批量绑定完成后状态查询失败:',
                error,
            );
        }
    }

    setCooldown(groupId, 'bind-batch');
};
