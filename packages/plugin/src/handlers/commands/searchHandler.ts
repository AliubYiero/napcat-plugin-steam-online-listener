/**
 * 搜索指令 handler (`#steam search <Steam昵称或链接>`)
 *
 * 仅群聊可用 (由注册表声明 scope: 'group'), 角色与作用域校验在分发层完成。
 */

import { pluginState } from '../../core/state';
import { steamService } from '../../services/steam.service';
import {
    getCooldownRemaining,
    setCooldown,
} from '../../utils/cooldown';
import type { InstructionHandler } from '../instructionRegistry';
import { sendReply } from '../utils';

export const searchHandler: InstructionHandler = async (
    ctx,
    event,
    commands,
) => {
    const groupId = event.group_id;

    const remaining = getCooldownRemaining(groupId, 'search');
    if (remaining > 0) {
        await sendReply(ctx, event, `请等待 ${remaining} 秒后再试`);
        return;
    }

    if (commands.length < 1) {
        await sendReply(
            ctx,
            event,
            '用法: #steam search <STEAM昵称或链接>',
        );
        return;
    }

    const input = commands[0];
    try {
        // 从 URL 中提取 Steam ID（如果用户输入的是链接）
        let steamIdInput = input;
        if (input.startsWith('http')) {
            const url = new URL(input);
            if (url.hostname.includes('steamcommunity.com')) {
                const pathParts = url.pathname.split('/');
                const profileIndex =
                    pathParts.indexOf('profiles') + 1;
                if (
                    profileIndex > 0 &&
                    profileIndex < pathParts.length
                ) {
                    steamIdInput = pathParts[profileIndex];
                } else {
                    const idIndex = pathParts.indexOf('id') + 1;
                    if (idIndex > 0 && idIndex < pathParts.length) {
                        steamIdInput = pathParts[idIndex];
                    }
                }
            }
        }

        if (!steamIdInput) {
            await sendReply(
                ctx,
                event,
                '错误 Steam 昵称格式，请检查输入。',
            );
            return;
        }

        const steamID64 =
            await steamService.getSteamID64(steamIdInput);
        if (steamID64) {
            await sendReply(
                ctx,
                event,
                `用户 ${steamIdInput} 的 Steam ID64: ${steamID64}`,
            );
        } else {
            await sendReply(
                ctx,
                event,
                '无法获取 Steam ID64，请检查输入的链接或 ID 是否正确。',
            );
        }
    } catch (error: unknown) {
        pluginState.logger.error('查询 Steam ID 时出错:', error);
        await sendReply(
            ctx,
            event,
            `查询失败: ${(error as Error).message}`,
        );
    }

    setCooldown(groupId, 'search');
};
