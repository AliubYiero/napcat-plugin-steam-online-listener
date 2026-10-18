/**
 * 帮助消息输出共享工具
 *
 * 范式: docs/help-output-pattern.md
 * 按角色与会话类型选择帮助版本, 优先发送帮助图片, 图片缺失或发送失败时回退文本帮助。
 *
 * 帮助版本由角色与会话类型共同决定:
 * - 群聊输出 User 版; 群聊管理员输出 Admin 版
 * - 仅私聊超管输出 SuperAdmin 版
 *
 * 【必须】复用入口处一次性推导的 `UserRole`, 不在本模块重复推导角色。
 */

import fs from 'node:fs';
import { join, resolve } from 'node:path';
import type { OB11Message } from 'napcat-types/napcat-onebot';
import type { NapCatPluginContext } from 'napcat-types/napcat-onebot/network/plugin/types';
import type { UserRole } from '../core/admin';
import { pluginState } from '../core/state';
import { createImageMessage, sendReply } from '../handlers/utils';

/** 帮助版本 */
export type HelpVariant = 'user' | 'admin' | 'superAdmin';

/** 按帮助版本组织的内容: 帮助图片文件名 + 文本帮助 (图片降级用) */
export interface HelpContent {
    imageMap: Record<HelpVariant, string>;
    textMap: Record<HelpVariant, string>;
}

/** 由角色与会话类型决定帮助版本 */
export function getHelpVariant(
    role: UserRole['role'],
    isGroup: boolean,
): HelpVariant {
    switch (role) {
        case 'superAdmin':
            // 群聊超管输出 Admin 版, 私聊超管输出 SuperAdmin 版
            return isGroup ? 'admin' : 'superAdmin';
        case 'admin':
            return 'admin';
        default:
            return 'user';
    }
}

/**
 * 构建帮助图片绝对路径
 * assets 目录位于 ctx.dataPath 的父目录下 (构建时由 vite 复制到 dist/assets)
 */
export function getHelpImagePath(
    imageMap: Record<HelpVariant, string>,
    variant: HelpVariant,
): string {
    const assetsDir = join(pluginState.ctx.dataPath, '..', 'assets');
    return resolve(assetsDir, imageMap[variant]);
}

/**
 * 输出指令帮助
 *
 * 优先发送帮助图片, 图片缺失或发送失败时回退文本帮助。
 * `userRole` 为入口分发层一次性推导的结果。
 */
export async function sendHelpMessage(
    ctx: NapCatPluginContext,
    event: OB11Message,
    userRole: UserRole,
    content: HelpContent,
): Promise<void> {
    const variant = getHelpVariant(
        userRole.role,
        userRole.from.type === 'group',
    );

    // 优先发送帮助图片, 文件缺失或发送失败时回退文本帮助
    const imagePath = getHelpImagePath(content.imageMap, variant);
    if (fs.existsSync(imagePath)) {
        const sent = await sendReply(
            ctx,
            event,
            createImageMessage(imagePath),
        );
        if (sent) return;
    }

    await sendReply(ctx, event, content.textMap[variant]);
}
