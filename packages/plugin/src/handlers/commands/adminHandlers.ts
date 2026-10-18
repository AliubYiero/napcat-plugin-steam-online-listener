/**
 * 管理员管理指令 handlers (`#steam admin <list|add|remove|help> <QQ号>`)
 *
 * 仅私聊超级管理员可用 (注册表范围)。管理员名单存于插件配置 adminUsers。
 */

import { pluginState } from '../../core/state';
import type { InstructionHandler } from '../instructionRegistry';
import { sendReply } from '../utils';

const ADMIN_HELP = [
    '管理员指令列表：',
    '#steam admin list - 查看管理员列表',
    '#steam admin add <QQ号> - 添加管理员',
    '#steam admin remove <QQ号> - 移除管理员',
    '#steam admin help - 显示此帮助信息',
].join('\n');

export const adminListHandler: InstructionHandler = async (
    ctx,
    event,
) => {
    const adminUsers = pluginState.config.adminUsers;
    if (adminUsers.length === 0) {
        await sendReply(ctx, event, '当前没有设置管理员');
        return;
    }
    const adminList = adminUsers
        .map((admin, index) => `${index + 1}. ${admin}`)
        .join('\n');
    await sendReply(ctx, event, `当前管理员列表：\n${adminList}`);
};

export const adminAddHandler: InstructionHandler = async (
    ctx,
    event,
    commands,
) => {
    if (commands.length < 1) {
        await sendReply(ctx, event, '用法: #steam admin add <QQ号>');
        return;
    }

    const userIdToAdd = commands[0];
    if (!userIdToAdd || Number.isNaN(Number(userIdToAdd))) {
        await sendReply(ctx, event, '请输入有效的QQ号');
        return;
    }

    const adminUsers = [...pluginState.config.adminUsers];
    if (adminUsers.includes(userIdToAdd)) {
        await sendReply(
            ctx,
            event,
            `用户 ${userIdToAdd} 已经是管理员`,
        );
        return;
    }

    adminUsers.push(userIdToAdd);
    pluginState.replaceConfig({
        ...pluginState.config,
        adminUsers,
    });

    await sendReply(
        ctx,
        event,
        `已将用户 ${userIdToAdd} 添加为管理员`,
    );
    pluginState.logger.info(`将 ${userIdToAdd} 添加为管理员`);
};

export const adminRemoveHandler: InstructionHandler = async (
    ctx,
    event,
    commands,
) => {
    if (commands.length < 1) {
        await sendReply(
            ctx,
            event,
            '用法: #steam admin remove <QQ号>',
        );
        return;
    }

    const userIdToRemove = commands[0];
    if (!userIdToRemove || Number.isNaN(Number(userIdToRemove))) {
        await sendReply(ctx, event, '请输入有效的QQ号');
        return;
    }

    const adminUsers = [...pluginState.config.adminUsers];
    const index = adminUsers.indexOf(userIdToRemove);
    if (index === -1) {
        await sendReply(
            ctx,
            event,
            `用户 ${userIdToRemove} 不是管理员`,
        );
        return;
    }

    // 保留至少一个管理员
    if (adminUsers.length <= 1) {
        await sendReply(
            ctx,
            event,
            '无法移除最后一个管理员，至少需要保留一个管理员',
        );
        return;
    }

    adminUsers.splice(index, 1);
    pluginState.replaceConfig({
        ...pluginState.config,
        adminUsers,
    });

    await sendReply(
        ctx,
        event,
        `已将用户 ${userIdToRemove} 移除管理员权限`,
    );
    pluginState.logger.info(`移除了 ${userIdToRemove} 的管理员权限`);
};

export const adminHelpHandler: InstructionHandler = async (
    ctx,
    event,
) => {
    await sendReply(ctx, event, ADMIN_HELP);
};
