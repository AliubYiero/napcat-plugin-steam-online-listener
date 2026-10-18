/**
 * 指令触发判定 (纯函数模块)
 *
 * 范式: docs/instruction-pattern.md 的 "1.1 指令触发方式"
 *
 * 本项目为纯前缀触发 (不支持 @机器人), 触发判定 = 消息 trim() 后以
 * 固定前缀 COMMAND_PREFIX 开头。前缀不再暴露为配置项, 见 shared/config。
 * 本模块只负责剥离与判定, 不负责整体切词——切词由接收层承担。
 */

import { COMMAND_PREFIX } from 'shared';

/**
 * 触发判定: 命中返回前缀之后的参数文本 (可能为空串; 未 trim, 由接收层切词)
 * @param rawMessage 原始消息文本
 * @returns 前缀后的参数文本; 未命中返回 null
 */
export function resolveCommandArgs(
    rawMessage: string,
): string | null {
    const trimmed = rawMessage.trim();
    if (!trimmed.startsWith(COMMAND_PREFIX)) return null;
    return trimmed.slice(COMMAND_PREFIX.length);
}
