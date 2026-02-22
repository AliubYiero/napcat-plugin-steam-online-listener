/**
 * group指令处理器
 * 处理 #group 指令，用于管理群组
 */

import type { OB11Message } from 'napcat-types/napcat-onebot';
import type { NapCatPluginContext } from 'napcat-types/napcat-onebot/network/plugin/types';
import { sendReply } from './utils';
import { pluginState } from '../core/state';

/**
 * 处理 group 指令
 */
export async function handleGroup(ctx: NapCatPluginContext, event: OB11Message, args: string[]): Promise<void> {
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
                '群组管理指令列表：',
                '#steam group add <群号> - 将群聊添加到白名单',
                '#steam group remove <群号> - 从白名单移除群聊',
                '#steam group list - 查看已管理的群组列表',
                '#steam group help - 显示此帮助信息'
            ].join('\n');
            await sendReply(ctx, event, helpText);
            return;
        }

        const subCommand = args[1].toLowerCase();

        switch (subCommand) {
            case 'add':
                await handleGroupAdd(ctx, event, args);
                break;
            case 'remove':
            case 'del':
                await handleGroupRemove(ctx, event, args);
                break;
            case 'list':
                await handleGroupList(ctx, event);
                break;
            case 'help':
                const helpText = [
                    '群组管理指令列表：',
                    '#steam group add <群号> - 将群聊添加到白名单',
                    '#steam group remove <群号> - 从白名单移除群聊',
                    '#steam group list - 查看已管理的群组列表',
                    '#steam group help - 显示此帮助信息'
                ].join('\n');
                await sendReply(ctx, event, helpText);
                break;
            default:
                await sendReply(ctx, event, '未知的群组指令，使用 #group help 查看帮助');
                break;
        }

        pluginState.incrementProcessed();
    } catch (error: any) {
        pluginState.logger.error('处理群组指令时出错:', error);
        await sendReply(ctx, event, `处理指令失败: ${error.message}`);
    }
}

/**
 * 处理添加群组指令
 */
async function handleGroupAdd(ctx: NapCatPluginContext, event: OB11Message, args: string[]): Promise<void> {
    if (args.length < 3) {
        await sendReply(ctx, event, '用法: #group add <群号>');
        return;
    }

    const groupId = args[2];
    if (!groupId || isNaN(Number(groupId))) {
        await sendReply(ctx, event, '请输入有效的群号');
        return;
    }

    // 更新群配置，启用该群的功能
    pluginState.updateGroupConfig(groupId, { enabled: true });
    
    await sendReply(ctx, event, `已将群 ${groupId} 添加到白名单并启用插件功能`);
    pluginState.logger.info(`用户 ${String(event.user_id)} 将群 ${groupId} 添加到白名单`);
}

/**
 * 处理移除群组指令
 */
async function handleGroupRemove(ctx: NapCatPluginContext, event: OB11Message, args: string[]): Promise<void> {
    if (args.length < 3) {
        await sendReply(ctx, event, '用法: #group remove <群号>');
        return;
    }

    const groupId = args[2];
    if (!groupId || isNaN(Number(groupId))) {
        await sendReply(ctx, event, '请输入有效的群号');
        return;
    }

    // 检查群组是否已启用
    if (!pluginState.isGroupEnabled(groupId)) {
        await sendReply(ctx, event, `群 ${groupId} 不在白名单中或已被禁用`);
        return;
    }

    // 更新群配置，禁用该群的功能
    pluginState.updateGroupConfig(groupId, { enabled: false });
    
    await sendReply(ctx, event, `已将群 ${groupId} 从白名单移除`);
    pluginState.logger.info(`用户 ${String(event.user_id)} 将群 ${groupId} 从白名单移除`);
}

/**
 * 处理查看群组列表指令
 */
async function handleGroupList(ctx: NapCatPluginContext, event: OB11Message): Promise<void> {
    const groupConfigs = pluginState.config.groupConfigs;
    const enabledGroups = Object.entries(groupConfigs)
        .filter(([_, config]) => config.enabled)
        .map(([groupId, _]) => groupId);

    if (enabledGroups.length === 0) {
        await sendReply(ctx, event, '当前没有已启用的群组');
        return;
    }

    const groupList = enabledGroups
        .map((groupId, index) => `${index + 1}. ${groupId}`)
        .join('\n');
    
    await sendReply(ctx, event, `已启用的群组列表：\n${groupList}`);
}