/**
 * 帮助指令处理器
 * 处理 #help 指令
 */

import type { OB11Message } from 'napcat-types/napcat-onebot';
import type { NapCatPluginContext } from 'napcat-types/napcat-onebot/network/plugin/types';
import { sendReply } from './utils';
import { pluginState } from '../core/state';

/**
 * 处理 help 指令
 */
export async function handleHelp(ctx: NapCatPluginContext, event: OB11Message, args: string[]): Promise<void> {
    const prefix = '#';
    const helpLines = [
        `[= 插件帮助 =]`,
        `${prefix}steam-bind <steam-id> [自定义用户昵称] - 绑定Steam用户`,
        `${prefix}steam-bind-batch <steam-id-1> <nickname-1> <steam-id-2> <nickname-2> ... - 批量绑定Steam用户`,
        `${prefix}steam-list - 获取当前群组/用户已绑定的Steam数据`,
        `${prefix}steam-remove <steam-id> - 移除指定的Steam绑定数据`,
        `${prefix}steam-reset - 清空当前群组/用户的steam绑定数据`,
        '',
        '[= 辅助指令 =]',
        `${prefix}steam-help - 显示帮助信息`,
        `${prefix}steam-search <Steam昵称或链接> - 查询Steam ID64`,
    ];

    // 检查用户是否为管理员，如果是则显示管理员指令
    const userId = String(event.user_id);
    const isPrivateMessage = event.message_type === 'private';
    const isUserInWhitelist = isPrivateMessage && pluginState.isUserAdmin(userId);

    if (isUserInWhitelist) {
        helpLines.push('');
        helpLines.push('[= 管理员指令 =]');
        helpLines.push(`${prefix}steam-polling - 手动触发一次Steam状态轮询（仅私聊可用）`);
        helpLines.push(`${prefix}group add <群号> - 将群聊添加到白名单（仅私聊可用）`);
        helpLines.push(`${prefix}group remove <群号> - 从白名单移除群聊（仅私聊可用）`);
        helpLines.push(`${prefix}group list - 查看已管理的群组列表（仅私聊可用）`);
    }

    await sendReply(ctx, event, helpLines.join('\n'));
}
