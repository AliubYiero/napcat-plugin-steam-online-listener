/**
 * 帮助指令处理器
 * 处理 #help 指令
 */

import type { OB11Message } from 'napcat-types/napcat-onebot';
import type { NapCatPluginContext } from 'napcat-types/napcat-onebot/network/plugin/types';
import { sendReply, createImageMessage } from './utils';
import { pluginState } from '../core/state';
import { resolve, join } from 'path';
import fs from 'fs';

/**
 * 处理 help 指令
 * 管理员私聊发送 admin-help.png，群聊发送 user-help.png
 * 图片不存在时回退到文本帮助
 */
export async function handleHelp(ctx: NapCatPluginContext, event: OB11Message, args: string[]): Promise<void> {
    const userId = String(event.user_id);
    const isPrivateMessage = event.message_type === 'private';
    const isAdmin = isPrivateMessage && pluginState.isUserAdmin(userId);

    // 构建 assets 目录路径: ctx.dataPath 的父目录下的 assets 文件夹
    const assetsDir = join(ctx.dataPath, '..', 'assets');
    const imageFileName = isAdmin ? 'admin-help.png' : 'user-help.png';
    const imagePath = resolve(assetsDir, imageFileName);

    // 检查图片是否存在
    if (fs.existsSync(imagePath)) {
        // 发送图片
        const imageMessage = createImageMessage(imagePath);
        await sendReply(ctx, event, imageMessage);
    } else {
        // 回退到文本帮助
        await sendTextHelp(ctx, event, isAdmin);
    }
}

/**
 * 发送文本帮助信息
 */
async function sendTextHelp(ctx: NapCatPluginContext, event: OB11Message, isAdmin: boolean): Promise<void> {
    const prefix = pluginState.config.commandPrefix;
    const helpLines = [
        `[= 插件帮助 =]`,
        `${prefix} bind <steam-id> [自定义用户昵称] - 绑定Steam用户`,
        `${prefix} bind-batch <steam-id-1> <nickname-1> <steam-id-2> <nickname-2> ... - 批量绑定Steam用户`,
        `${prefix} list - 获取当前群组/用户已绑定的Steam数据`,
        `${prefix} remove <steam-id> - 移除指定的Steam绑定数据`,
        `${prefix} reset - 清空当前群组/用户的steam绑定数据`,
        '',
        '[= 辅助指令 =]',
        `${prefix} help - 显示帮助信息`,
        `${prefix} search <Steam昵称或链接> - 查询Steam ID64`,
        `${prefix} report today - 查询今日 Steam 活动报告`,
        `${prefix} report yesterday - 查询昨日 Steam 活动报告`,
        '',
        '[= 如何获取 Steam ID =]',
        '方法一：通过好友列表',
        '1. 打开 Steam 客户端，进入好友列表',
        '2. 右键点击要查询的好友 → 查看个人资料',
        '3. 在打开的页面中，查看浏览器地址栏：',
        '   • /id/ 后面的英文是自定义ID（如：/id/xxx）',
        '   • /profiles/ 后面的17位数字是 Steam ID64',
        '',
        '方法二：通过个人资料链接',
        `• 直接使用 ${prefix} search <自定义ID> 查询`,
        `• 或使用 ${prefix} search <完整Steam个人资料链接>`,
    ];

    if (isAdmin) {
        helpLines.push('');
        helpLines.push('[= 管理员指令 =]');
        helpLines.push(`${prefix} polling - 手动触发一次Steam状态轮询（仅私聊可用）`);
        helpLines.push(`${prefix} group add <群号> - 将群聊添加到白名单（仅私聊可用）`);
        helpLines.push(`${prefix} group remove <群号> - 从白名单移除群聊（仅私聊可用）`);
        helpLines.push(`${prefix} group list - 查看已管理的群组列表（仅私聊可用）`);
        helpLines.push(`${prefix} admin list - 查看管理员列表（仅私聊可用）`);
        helpLines.push(`${prefix} admin add <QQ号> - 添加管理员（仅私聊可用）`);
        helpLines.push(`${prefix} admin remove <QQ号> - 移除管理员（仅私聊可用）`);
    }

    await sendReply(ctx, event, helpLines.join('\n'));
}