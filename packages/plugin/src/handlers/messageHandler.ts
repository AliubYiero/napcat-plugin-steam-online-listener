/**
 * 消息接收入口 (接收层)
 *
 * 范式: docs/instruction-pattern.md 的 "一、接收层: handleMessage"
 * 职责固定为四步, 顺序不可调换:
 *   1. 会话门禁 → 2. 触发判定 (前缀检查) → 3. 切词 → 4. 分发
 *
 * 【必须】接收层不认识指令语义, 也**不做权限校验**——权限属于指令语义,
 * 由分发层统一处理 (见 instructionDispatch)。
 * 【必须】整个函数包在 try/catch 中, 异常记日志不外抛: 它是所有消息事件的入口,
 * 异常外抛会影响插件宿主。
 *
 * 会话门禁 (本项目为纯群聊功能):
 *   - 群聊: 需该群已在会话配置中显式启用 (默认关闭), 否则静默;
 *   - 私聊: 仅放行超级管理员的管理命令 (私聊是管理通道), 其余私聊一律静默忽略。
 */

import type { OB11Message } from 'napcat-types/napcat-onebot';
import type { NapCatPluginContext } from 'napcat-types/napcat-onebot/network/plugin/types';
import { getUserRole, isSuperAdmin } from '../core/admin';
import { pluginState } from '../core/state';
import { sessionConfigService } from '../services/sessionConfigService';
import { resolveCommandArgs } from '../utils/commandTrigger';
import { dispatch } from './instructionDispatch';

/**
 * 消息处理主函数
 *
 * 各步的静默约定: 群未启用、私聊非超管、未命中前缀、未知指令、权限不足
 * 一律静默且不记日志。
 */
export async function handleMessage(
    ctx: NapCatPluginContext,
    event: OB11Message,
): Promise<void> {
    try {
        const rawMessage = event.raw_message || '';
        const { message_type, group_id } = event;

        // 1. 会话门禁: 先于前缀检查, 避免在不可用会话里做无谓的字符串处理。
        if (message_type === 'group' && group_id) {
            if (
                !sessionConfigService.isGroupEnabled(String(group_id))
            )
                return;
        } else if (message_type === 'private' && event.user_id) {
            // 私聊是管理通道: 仅超级管理员可触发, 其余静默忽略
            if (!isSuperAdmin(String(event.user_id))) return;
        } else {
            return;
        }

        // 2. 触发判定: 前缀命中则取出前缀之后的参数文本, 未命中静默返回
        const args = resolveCommandArgs(rawMessage);
        if (args === null) return;

        // 3. 切词: 前缀后的参数文本按空白切分, 空串会切出 [''], 由分发层兜底
        const commands = args.trim().split(/\s+/);

        // 4. 分发: 角色在入口一次性推导, 分发层与 handler 复用同一个 UserRole
        await dispatch(ctx, event, commands, getUserRole(event));
    } catch (error) {
        pluginState.logger.error('处理消息时出错:', error);
    }
}
