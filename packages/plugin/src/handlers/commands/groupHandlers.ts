/**
 * 群管理指令 handlers (`#steam group <add|remove|list|help> <群号>`)
 *
 * 仅私聊超级管理员可用 (注册表范围)。白名单即会话配置中的启用状态
 * (见 docs/store-pattern.md 与会话配置服务)。
 */

import { pluginState } from '../../core/state';
import { sessionConfigService } from '../../services/sessionConfigService';
import type { InstructionHandler } from '../instructionRegistry';
import { sendReply } from '../utils';

const GROUP_HELP = [
    '群组管理指令列表：',
    '#steam group add <群号> - 将群聊添加到白名单',
    '#steam group remove <群号> - 从白名单移除群聊',
    '#steam group list - 查看已管理的群组列表',
    '#steam group help - 显示此帮助信息',
].join('\n');

export const groupAddHandler: InstructionHandler = async (
    ctx,
    event,
    commands,
) => {
    if (commands.length < 1) {
        await sendReply(ctx, event, '用法: #steam group add <群号>');
        return;
    }

    const groupId = commands[0];
    if (!groupId || Number.isNaN(Number(groupId))) {
        await sendReply(ctx, event, '请输入有效的群号');
        return;
    }

    sessionConfigService.setSessionEnabled(groupId, 'group', true);
    await sendReply(
        ctx,
        event,
        `已将群 ${groupId} 添加到白名单并启用插件功能`,
    );
    pluginState.logger.info(`将群 ${groupId} 添加到白名单`);
};

export const groupRemoveHandler: InstructionHandler = async (
    ctx,
    event,
    commands,
) => {
    if (commands.length < 1) {
        await sendReply(
            ctx,
            event,
            '用法: #steam group remove <群号>',
        );
        return;
    }

    const groupId = commands[0];
    if (!groupId || Number.isNaN(Number(groupId))) {
        await sendReply(ctx, event, '请输入有效的群号');
        return;
    }

    if (!sessionConfigService.isGroupEnabled(groupId)) {
        await sendReply(
            ctx,
            event,
            `群 ${groupId} 不在白名单中或已被禁用`,
        );
        return;
    }

    sessionConfigService.setSessionEnabled(groupId, 'group', false);
    await sendReply(ctx, event, `已将群 ${groupId} 从白名单移除`);
    pluginState.logger.info(`将群 ${groupId} 从白名单移除`);
};

export const groupListHandler: InstructionHandler = async (
    ctx,
    event,
) => {
    const enabledGroups = sessionConfigService
        .listGroups()
        .filter((session) => session.enabled === true)
        .map((session) => session.id);

    if (enabledGroups.length === 0) {
        await sendReply(ctx, event, '当前没有已启用的群组');
        return;
    }

    const groupList = enabledGroups
        .map((groupId, index) => `${index + 1}. ${groupId}`)
        .join('\n');
    await sendReply(ctx, event, `已启用的群组列表：\n${groupList}`);
};

export const groupHelpHandler: InstructionHandler = async (
    ctx,
    event,
) => {
    await sendReply(ctx, event, GROUP_HELP);
};
