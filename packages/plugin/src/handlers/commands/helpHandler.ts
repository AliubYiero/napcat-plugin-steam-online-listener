/**
 * 帮助指令 handler (`#steam help`)
 *
 * 帮助内容按角色与会话类型输出三个版本 (User / Admin / SuperAdmin),
 * 优先发送图片, 图片缺失或发送失败时回退文本。
 *
 * 完整流水线见 docs/help-output-pattern.md:
 * 权威源 (scripts/generateHelp/cmds/steam.ts) → 生成脚本 → 产物落盘 → 运行时变体选择与回退。
 * 本文件与 helpText.generated.ts 均为产物消费方, 请勿手改帮助内容本身。
 */

import { sendHelpMessage } from '../../utils/helpMessage';
import type { InstructionHandler } from '../instructionRegistry';
import { HELP_TEXT_MAP } from './helpText.generated';

/** 帮助图片文件名 (纯命名映射, 内容见 src/assets/) */
const HELP_IMAGE = {
    user: 'steam-help-User.png',
    admin: 'steam-help-Admin.png',
    superAdmin: 'steam-help-SuperAdmin.png',
} as const;

export const helpHandler: InstructionHandler = async (
    ctx,
    event,
    _commands,
    userRole,
) => {
    await sendHelpMessage(ctx, event, userRole, {
        imageMap: HELP_IMAGE,
        textMap: HELP_TEXT_MAP,
    });
};
