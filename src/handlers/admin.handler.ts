/**
 * admin指令处理器
 * 处理 #admin 指令，用于管理插件管理员
 */

import type { OB11Message } from 'napcat-types/napcat-onebot';
import type { NapCatPluginContext } from 'napcat-types/napcat-onebot/network/plugin/types';
import { sendReply } from './utils';
import { pluginState } from '../core/state';

/**
 * 处理 admin 指令
 */
export async function handleAdmin(ctx: NapCatPluginContext, event: OB11Message, args: string[]): Promise<void> {
    try {
        // 检查是否为私聊消息
        if (event.message_type !== 'private') {
            await sendReply(ctx, event, '该指令仅支持私聊使用');
            return;
        }

        // 检查用户是否为管理员
        const userId = String(event.user_id);
        if (!pluginState.isUserAdmin(userId)) {
            await sendReply(ctx, event, '您没有权限执行此操作');
            return;
        }

        if (args.length < 2) {
            // 显示帮助信息
            const helpText = [
                '管理员指令列表：',
                '#admin list - 查看管理员列表',
                '#admin add <QQ号> - 添加管理员',
                '#admin remove <QQ号> - 移除管理员',
                '#admin help - 显示此帮助信息'
            ].join('\n');
            await sendReply(ctx, event, helpText);
            return;
        }

        const subCommand = args[1].toLowerCase();

        switch (subCommand) {
            case 'list':
                await handleAdminList(ctx, event);
                break;
            case 'add':
                await handleAdminAdd(ctx, event, args);
                break;
            case 'remove':
                await handleAdminRemove(ctx, event, args);
                break;
            case 'help':
                const helpText = [
                    '管理员指令列表：',
                    '#admin list - 查看管理员列表',
                    '#admin add <QQ号> - 添加管理员',
                    '#admin remove <QQ号> - 移除管理员',
                    '#admin help - 显示此帮助信息'
                ].join('\n');
                await sendReply(ctx, event, helpText);
                break;
            default:
                await sendReply(ctx, event, '未知的管理员指令，使用 #admin help 查看帮助');
                break;
        }

        pluginState.incrementProcessed();
    } catch (error: any) {
        pluginState.logger.error('处理管理员指令时出错:', error);
        await sendReply(ctx, event, `处理指令失败: ${error.message}`);
    }
}

/**
 * 处理管理员列表指令
 */
async function handleAdminList(ctx: NapCatPluginContext, event: OB11Message): Promise<void> {
    const adminUsers = pluginState.config.adminUsers || [];
    if (adminUsers.length === 0) {
        await sendReply(ctx, event, '当前没有设置管理员');
        return;
    }

    const adminList = adminUsers.map((admin, index) => `${index + 1}. ${admin}`).join('\n');
    await sendReply(ctx, event, `当前管理员列表：\n${adminList}`);
}

/**
 * 处理添加管理员指令
 */
async function handleAdminAdd(ctx: NapCatPluginContext, event: OB11Message, args: string[]): Promise<void> {
    if (args.length < 3) {
        await sendReply(ctx, event, '用法: #admin add <QQ号>');
        return;
    }

    const userIdToAdd = args[2];
    if (!userIdToAdd || isNaN(Number(userIdToAdd))) {
        await sendReply(ctx, event, '请输入有效的QQ号');
        return;
    }

    const adminUsers = [...(pluginState.config.adminUsers || [])];
    if (adminUsers.includes(userIdToAdd)) {
        await sendReply(ctx, event, `用户 ${userIdToAdd} 已经是管理员`);
        return;
    }

    adminUsers.push(userIdToAdd);
    pluginState.updateConfig({ adminUsers });

    await sendReply(ctx, event, `已将用户 ${userIdToAdd} 添加为管理员`);
    pluginState.logger.info(`用户 ${String(event.user_id)} 将 ${userIdToAdd} 添加为管理员`);
}

/**
 * 处理移除管理员指令
 */
async function handleAdminRemove(ctx: NapCatPluginContext, event: OB11Message, args: string[]): Promise<void> {
    if (args.length < 3) {
        await sendReply(ctx, event, '用法: #admin remove <QQ号>');
        return;
    }

    const userIdToRemove = args[2];
    if (!userIdToRemove || isNaN(Number(userIdToRemove))) {
        await sendReply(ctx, event, '请输入有效的QQ号');
        return;
    }

    const adminUsers = [...(pluginState.config.adminUsers || [])];
    const index = adminUsers.indexOf(userIdToRemove);
    if (index === -1) {
        await sendReply(ctx, event, `用户 ${userIdToRemove} 不是管理员`);
        return;
    }

    // 检查是否是最后一个管理员
    if (adminUsers.length <= 1) {
        await sendReply(ctx, event, '无法移除最后一个管理员，至少需要保留一个管理员');
        return;
    }

    adminUsers.splice(index, 1);
    pluginState.updateConfig({ adminUsers });

    await sendReply(ctx, event, `已将用户 ${userIdToRemove} 移除管理员权限`);
    pluginState.logger.info(`用户 ${String(event.user_id)} 移除了 ${userIdToRemove} 的管理员权限`);
}