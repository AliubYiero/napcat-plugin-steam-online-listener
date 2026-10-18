/**
 * 发送工具模块
 *
 * 范式: docs/message-send-pattern.md
 * - 【必须】全插件所有消息发送收敛到本模块的四个发送函数, 业务代码禁止直接调用
 *   `ctx.actions.call('send_msg' | 'send_group_msg' | ...)`
 * - 【必须】复杂消息 (多段 / @ / 图片 / 表情 / 文件) 一律用 createXxxMessage 工厂构造,
 *   禁止在业务代码中手写 `{ type: 'text', data: { ... } }` 字面量
 * - 【必须】四个发送函数统一返回 `Promise<boolean>`: 内部 try/catch, 失败记日志
 *   并返回 false, 不向调用方抛出
 * - @全体成员 走 sendAtAll: 内部按 会话类型 → 发起人权限 → 配额 三重前置检查;
 *   机器人自身资格由 can_at_all 表达, 不调 isBotAdmin (见 docs/message-send-pattern.md §3)
 *
 * 选型: 有 `event` 用 sendReply; 无 event 按目标选 sendGroupMessage / sendPrivateMessage。
 */

import type {
    OB11Message,
    OB11MessageAt,
    OB11MessageFace,
    OB11MessageFile,
    OB11MessageImage,
    OB11MessageMFace,
    OB11MessageMixType,
    OB11MessageReply,
    OB11MessageText,
    OB11PostSendMsg,
} from 'napcat-types/napcat-onebot';
import type { NapCatPluginContext } from 'napcat-types/napcat-onebot/network/plugin/types';
import { getUserRole, hasRole } from '../core/admin';
import { pluginState } from '../core/state';

// ==================== 发送函数 ====================

/**
 * 发送消息 (通用): 根据消息类型自动发送到群或私聊
 *
 * @param ctx 插件上下文
 * @param event 原始消息事件 (用于推断回复目标)
 * @param message 消息内容 (支持字符串或消息段数组)
 */
export async function sendReply(
    ctx: NapCatPluginContext,
    event: OB11Message,
    message: OB11PostSendMsg['message'],
): Promise<boolean> {
    try {
        const params: OB11PostSendMsg = {
            message,
            message_type: event.message_type,
            ...(event.message_type === 'group' && event.group_id
                ? { group_id: String(event.group_id) }
                : {}),
            ...(event.message_type === 'private' && event.user_id
                ? { user_id: String(event.user_id) }
                : {}),
        };
        await ctx.actions.call(
            'send_msg',
            params,
            ctx.adapterName,
            ctx.pluginManager.config,
        );
        return true;
    } catch (error) {
        pluginState.logger.error('发送消息失败:', error);
        return false;
    }
}

/** 发送群消息 (主动推送, 无 event) */
export async function sendGroupMessage(
    ctx: NapCatPluginContext,
    groupId: number | string,
    message: OB11PostSendMsg['message'],
): Promise<boolean> {
    try {
        await ctx.actions.call(
            'send_group_msg',
            { group_id: String(groupId), message },
            ctx.adapterName,
            ctx.pluginManager.config,
        );
        return true;
    } catch (error) {
        pluginState.logger.error('发送群消息失败:', error);
        return false;
    }
}

/** 发送私聊消息 (主动推送, 无 event) */
export async function sendPrivateMessage(
    ctx: NapCatPluginContext,
    userId: number | string,
    message: OB11PostSendMsg['message'],
): Promise<boolean> {
    try {
        await ctx.actions.call(
            'send_private_msg',
            { user_id: String(userId), message },
            ctx.adapterName,
            ctx.pluginManager.config,
        );
        return true;
    } catch (error) {
        pluginState.logger.error('发送私聊消息失败:', error);
        return false;
    }
}

/** 发送合并转发消息 */
export async function sendForwardMsg(
    ctx: NapCatPluginContext,
    target: number | string,
    isGroup: boolean,
    nodes: ForwardNode[],
): Promise<boolean> {
    try {
        const actionName = isGroup
            ? 'send_group_forward_msg'
            : 'send_private_forward_msg';
        const params: Record<string, unknown> = { message: nodes };
        if (isGroup) {
            params.group_id = String(target);
        } else {
            params.user_id = String(target);
        }
        await ctx.actions.call(
            actionName as 'send_group_forward_msg',
            params as never,
            ctx.adapterName,
            ctx.pluginManager.config,
        );
        return true;
    } catch (error) {
        pluginState.logger.error('发送合并转发消息失败:', error);
        return false;
    }
}

// ==================== 消息段工厂 ====================

/** 合并转发消息节点 */
export interface ForwardNode {
    type: 'node';
    data: {
        nickname: string;
        user_id?: string;
        content: OB11MessageMixType;
    };
}

/** 创建纯文本消息段 */
export function createTextMessage(text: string): OB11MessageText {
    return { type: 'text', data: { text } };
}

/** 创建 QQ 表情消息段 */
export function createFaceMessage(id: string): OB11MessageFace {
    return { type: 'face', data: { id } };
}

/**
 * 创建 @ 消息段
 *
 * `qq` 取 `'all'` 即 @全体成员 (不是独立段类型, 只是 at 段的特殊形态);
 * 该参数对 `all` 无意义, 故 `all` 场景不传 `name`。
 */
export function createAtMessage(
    qq: string,
    name?: string,
): OB11MessageAt {
    const data: OB11MessageAt['data'] = { qq };
    if (name) data.name = name;
    return { type: 'at', data };
}

/**
 * 创建 "@ + 分隔文本" 组合消息段
 *
 * @ 段后紧跟一段分隔文本 (默认一个空格, 与 QQ 原生 @ 后自动补空格的观感一致),
 * 用于规避 "@ 段后直接贴图片/文本被客户端挤压" 的排版问题。
 *
 * @param qq 目标 QQ 号, 取固定值 'all' 即 @全体成员
 * @param name 群昵称, @全体成员 时无需传入
 * @param separator @ 段后追加的分隔文本, 默认一个空格
 * @returns 两段消息段数组 [at, text]
 */
export function createAtMessageWithSeparator(
    qq: string,
    name?: string,
    separator: string = ' ',
): Array<OB11MessageAt | OB11MessageText> {
    return [createAtMessage(qq, name), createTextMessage(separator)];
}

/** 创建回复消息段 */
export function createReplyMessage(id: string): OB11MessageReply {
    return { type: 'reply', data: { id } };
}

/** 创建图片消息段 (`file` 支持本地路径、`http(s)://`、`base64://`) */
export function createImageMessage(file: string): OB11MessageImage {
    return { type: 'image', data: { file } };
}

/** 创建商城表情消息段 */
export function createMFaceMessage(
    emojiPackageId: number,
    emojiId: string,
    key: string,
    summary: string,
): OB11MessageMFace {
    return {
        type: 'mface',
        data: {
            emoji_package_id: emojiPackageId,
            emoji_id: emojiId,
            key,
            summary,
        },
    };
}

/** 创建文件消息段 */
export function createFileMessage(
    file: string,
    name?: string,
): OB11MessageFile {
    const data: OB11MessageFile['data'] = { file };
    if (name) data.name = name;
    return { type: 'file', data };
}

/** 创建合并转发节点 */
export function createForwardNode(
    nickname: string,
    content: OB11MessageMixType,
    userId?: string,
): ForwardNode {
    const node: ForwardNode = {
        type: 'node',
        data: { nickname, content },
    };
    if (userId) node.data.user_id = userId;
    return node;
}

// ==================== @全体成员 ====================

/** @全体成员 配额查询结果 (字段名沿用 OneBot 11 的 get_group_at_all_remain) */
export interface AtAllRemain {
    /** 机器人账号在该群是否具备 @全体成员 权限 */
    can_at_all: boolean;
    /** 该群当日剩余 @全体成员 次数 */
    remain_at_all_count_for_group: number;
    /** 机器人账号当日剩余 @全体成员 次数 (跨群共享) */
    remain_at_all_count_for_uin: number;
}

/** 查询群内 @全体成员 剩余配额; 查询失败返回 null (按不可发送处理) */
export async function getAtAllQuota(
    ctx: NapCatPluginContext,
    groupId: string | number,
): Promise<AtAllRemain | null> {
    try {
        return (await ctx.actions.call(
            'get_group_at_all_remain',
            { group_id: String(groupId) },
            ctx.adapterName,
            ctx.pluginManager.config,
        )) as AtAllRemain;
    } catch (error) {
        pluginState.logger.error('查询 @全体成员 配额失败:', error);
        return null;
    }
}

/**
 * 发送 @全体成员; 返回是否发出
 *
 * 前置检查顺序固定为 **会话类型 → 发起人权限 → 配额**: 前两项是纯本地判定,
 * 最先短路; 配额需一次 API 往返, 放在最后。
 *
 * 【必须】机器人自身是否管理员由 `can_at_all` 表达 (平台权威口径), 不额外调 isBotAdmin;
 * 通用机器人身份自检见 permission-pattern 的 `isBotAdmin`。
 * 【必须】失败反馈不对称: 非群聊/发起人权限不足静默返回, 配额不足回复提示。
 */
export async function sendAtAll(
    ctx: NapCatPluginContext,
    event: OB11Message,
    text: string,
): Promise<boolean> {
    // 1. 群聊限定: 非群聊没有"全体成员"这个概念
    if (event.message_type !== 'group') return false;

    // 2. 权限: 发起人须为群管理员及以上 (角色推导见 permission-pattern)
    if (!hasRole(getUserRole(event), 'admin')) return false;

    // 3. 配额: 机器人有权限, 且群内当日还有剩余次数
    const quota = await getAtAllQuota(ctx, event.group_id);
    if (
        !quota?.can_at_all ||
        quota.remain_at_all_count_for_group <= 0
    ) {
        await sendReply(
            ctx,
            event,
            '@全体成员 次数已用完, 请稍后再试',
        );
        return false;
    }

    // 4. 构造并发送
    return sendReply(ctx, event, [
        createAtMessage('all'),
        createTextMessage(` ${text}`),
    ]);
}
