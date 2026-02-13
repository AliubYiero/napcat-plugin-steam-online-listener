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
        `${prefix}steam-bind <steam-id> [自定义用户昵称] [绑定qq号] - 绑定Steam监听数据`,
        `${prefix}steam-bind-nickname <steam-id> <自定义用户昵称> - 更新Steam用户昵称`,
        `${prefix}steam-bind-qq <steam-id> <绑定qq号> - 绑定Steam到QQ号`,
        `${prefix}steam-list - 获取当前群组/用户已绑定的Steam数据`,
        `${prefix}steam-remove <steam-id> - 移除指定的Steam绑定数据`,
        `${prefix}steam-reset - 清空当前群组的steam绑定数据`,
        '',
        '[= 辅助指令 =]',
        `${prefix}steam-help - 显示帮助信息`,
        // `${prefix}ping - 测试连通性`,
        // `${prefix}status - 查看运行状态`,
        `${prefix}steam-search <STEAM昵称> - 查询Steam ID64`,
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
