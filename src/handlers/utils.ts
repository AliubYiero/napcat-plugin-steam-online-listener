/**
 * 通用工具函数
 * 包含消息发送、CD管理等通用功能
 */

import type {
    OB11Message,
    OB11PostSendMsg,
    OB11MessageDataType,
} from 'napcat-types/napcat-onebot';
import type { NapCatPluginContext } from 'napcat-types/napcat-onebot/network/plugin/types';
import { pluginState } from '../core/state';

// ==================== OneBot 11 Message Type Definitions ====================

/** OneBot 11 消息混合类型 - 可以是字符串、单个消息段或消息段数组 */
export type OB11MessageMixType = string | OB11MessageData | OB11MessageData[];

/** OneBot 11 消息段基类型 */
export type OB11MessageData =
    | OB11MessageText
    | OB11MessageFace
    | OB11MessageMFace
    | OB11MessageAt
    | OB11MessageReply
    | OB11MessageImage
    | OB11MessageRecord
    | OB11MessageVideo
    | OB11MessageFile
    | OB11MessageIdMusic
    | OB11MessageCustomMusic
    | OB11MessagePoke
    | OB11MessageDice
    | OB11MessageRPS
    | OB11MessageContact
    | OB11MessageLocation
    | OB11MessageJson
    | OB11MessageXml
    | OB11MessageMarkdown
    | OB11MessageMiniApp
    | OB11MessageNode
    | OB11MessageForward
    | OB11MessageOnlineFile
    | OB11MessageFlashTransfer;

/** 纯文本消息段 */
export interface OB11MessageText {
    type: 'text';
    data: {
        text: string;
    };
}

/** QQ表情消息段 */
export interface OB11MessageFace {
    type: 'face';
    data: {
        id: string;
        resultId?: string;
        chainCount?: number;
    };
}

/** 商城表情消息段 */
export interface OB11MessageMFace {
    type: 'mface';
    data: {
        emoji_package_id: number;
        emoji_id: string;
        key: string;
        summary: string;
    };
}

/** @消息段 */
export interface OB11MessageAt {
    type: 'at';
    data: {
        qq: string;
        name?: string;
    };
}

/** 回复消息段 */
export interface OB11MessageReply {
    type: 'reply';
    data: {
        id?: string;
        seq?: number;
    };
}

/** 图片消息段 */
export interface OB11MessageImage {
    type: 'image';
    data: {
        file: string;
        path?: string;
        url?: string;
        name?: string;
        thumb?: string;
        summary?: string;
        sub_type?: number;
    };
}

/** 语音消息段 */
export interface OB11MessageRecord {
    type: 'record';
    data: FileBaseData;
}

/** 视频消息段 */
export interface OB11MessageVideo {
    type: 'video';
    data: FileBaseData;
}

/** 文件消息段 */
export interface OB11MessageFile {
    type: 'file';
    data: FileBaseData;
}

/** 文件消息段基础数据 */
interface FileBaseData {
    file: string;
    path?: string;
    url?: string;
    name?: string;
    thumb?: string;
}

/** ID音乐消息段 */
export interface OB11MessageIdMusic {
    type: 'music';
    data: {
        type: 'qq' | '163' | 'kugou' | 'migu' | 'kuwo';
        id: string | number;
    };
}

/** 自定义音乐消息段 */
export interface OB11MessageCustomMusic {
    type: 'music';
    data: {
        type: 'custom';
        id: null;
        url: string;
        audio: string;
        title: string;
        image?: string;
        content?: string;
    };
}

/** 戳一戳消息段 */
export interface OB11MessagePoke {
    type: 'poke';
    data: {
        type: string;
        id: string;
    };
}

/** 骰子消息段 */
export interface OB11MessageDice {
    type: 'dice';
    data: {
        result: number | string;
    };
}

/** 猜拳消息段 */
export interface OB11MessageRPS {
    type: 'rps';
    data: {
        result: number | string;
    };
}

/** 联系人消息段 */
export interface OB11MessageContact {
    type: 'contact';
    data: {
        type: 'qq' | 'group';
        id: string;
    };
}

/** 位置消息段 */
export interface OB11MessageLocation {
    type: 'location';
    data: {
        lat: string | number;
        lon: string | number;
        title?: string;
        content?: string;
    };
}

/** JSON消息段 */
export interface OB11MessageJson {
    type: 'json';
    data: {
        data: string | object;
        config?: {
            token: string;
        };
    };
}

/** XML消息段 */
export interface OB11MessageXml {
    type: 'xml';
    data: {
        data: string;
    };
}

/** Markdown消息段 */
export interface OB11MessageMarkdown {
    type: 'markdown';
    data: {
        content: string;
    };
}

/** 小程序消息段 */
export interface OB11MessageMiniApp {
    type: 'miniapp';
    data: {
        data: string;
    };
}

/** 合并转发消息节点 */
export interface OB11MessageNode {
    type: 'node';
    data: {
        id?: string;
        user_id?: number | string;
        uin?: number | string;
        nickname: string;
        name?: string;
        content: OB11MessageMixType;
        source?: string;
        news?: {
            text: string;
        }[];
        summary?: string;
        prompt?: string;
        time?: string;
    };
}

/** 合并转发消息段 */
export interface OB11MessageForward {
    type: 'forward';
    data: {
        id: string;
        content?: OB11MessageMixType[];
    };
}

/** 在线文件消息段 */
export interface OB11MessageOnlineFile {
    type: 'onlinefile';
    data: {
        msgId: string;
        elementId: string;
        fileName: string;
        fileSize: string;
        isDir: boolean;
    };
}

/** QQ闪传消息段 */
export interface OB11MessageFlashTransfer {
    type: 'flashtransfer';
    data: {
        fileSetId: string;
    };
}

// ==================== CD 冷却管理 ====================

/** CD 冷却记录 key: `${groupId}:${command}`, value: 过期时间戳 */
export const cooldownMap = new Map<string, number>();

/**
 * 检查是否在 CD 中
 * @returns 剩余秒数，0 表示可用
 */
export function getCooldownRemaining(groupId: number | string, command: string): number {
    const cdSeconds = pluginState.config.cooldownSeconds ?? 60;
    if (cdSeconds <= 0) return 0;

    const key = `${groupId}:${command}`;
    const expireTime = cooldownMap.get(key);
    if (!expireTime) return 0;

    const remaining = Math.ceil((expireTime - Date.now()) / 1000);
    if (remaining <= 0) {
        cooldownMap.delete(key);
        return 0;
    }
    return remaining;
}

/** 设置 CD 冷却 */
export function setCooldown(groupId: number | string, command: string): void {
    const cdSeconds = pluginState.config.cooldownSeconds ?? 60;
    if (cdSeconds <= 0) return;
    cooldownMap.set(`${groupId}:${command}`, Date.now() + cdSeconds * 1000);
}

// ==================== 消息发送工具 ====================

/**
 * 发送消息（通用）
 * 根据消息类型自动发送到群或私聊
 *
 * @param ctx 插件上下文
 * @param event 原始消息事件（用于推断回复目标）
 * @param message 消息内容（支持字符串或消息段数组）
 */
export async function sendReply(
    ctx: NapCatPluginContext,
    event: OB11Message,
    message: OB11MessageMixType,
): Promise<boolean> {
    try {
        const params: OB11PostSendMsg = {
            message: message as unknown as any,
            message_type: event.message_type,
            ...(event.message_type === 'group' && event.group_id
                ? { group_id: String(event.group_id) }
                : {}),
            ...(event.message_type === 'private' && event.user_id
                ? { user_id: String(event.user_id) }
                : {}),
        };
        await ctx.actions.call('send_msg', params, ctx.adapterName, ctx.pluginManager.config);
        return true;
    } catch (error) {
        pluginState.logger.error('发送消息失败:', error);
        return false;
    }
}

/**
 * 发送群消息
 */
export async function sendGroupMessage(
    ctx: NapCatPluginContext,
    groupId: number | string,
    message: OB11MessageMixType,
): Promise<boolean> {
    try {
        const params = {
            message,
            group_id: String(groupId),
        };
        await ctx.actions.call('send_group_msg', params, ctx.adapterName, ctx.pluginManager.config);
        return true;
    } catch (error) {
        pluginState.logger.error('发送群消息失败:', error);
        return false;
    }
}

/**
 * 发送私聊消息
 */
export async function sendPrivateMessage(
    ctx: NapCatPluginContext,
    userId: number | string,
    message: OB11MessageMixType,
): Promise<boolean> {
    try {
        const params = {
            message,
            user_id: String(userId),
        };
        await ctx.actions.call('send_private_msg', params, ctx.adapterName, ctx.pluginManager.config);
        return true;
    } catch (error) {
        pluginState.logger.error('发送私聊消息失败:', error);
        return false;
    }
}

// ==================== 合并转发消息 ====================

/** 合并转发消息节点 */
export interface ForwardNode {
    type: 'node';
    data: {
        nickname: string;
        user_id?: string;
        content: OB11MessageMixType;
    };
}

/**
 * 发送合并转发消息
 * @param ctx 插件上下文
 * @param target 群号或用户 ID
 * @param isGroup 是否为群消息
 * @param nodes 合并转发节点列表
 */
export async function sendForwardMsg(
    ctx: NapCatPluginContext,
    target: number | string,
    isGroup: boolean,
    nodes: ForwardNode[],
): Promise<boolean> {
    try {
        const actionName = isGroup ? 'send_group_forward_msg' : 'send_private_forward_msg';
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

// ==================== 多媒体消息发送工具 ====================

/**
 * 创建文本消息段
 */
export function createTextMessage(text: string): { type: 'text'; data: { text: string } } {
    return {
        type: 'text',
        data: { text }
    };
}

/**
 * 创建 markdown 消息段
 */
export function createMarkdownMessage(content: string): { type: 'markdown'; data: { content: string } } {
    return {
        type: 'markdown',
        data: { content }
    };
}

/**
 * 创建图片消息段
 */
export function createImageMessage(file: string): { type: 'image'; data: { file: string } } {
    return {
        type: 'image',
        data: { file }
    };
}

/**
 * 创建表情消息段
 */
export function createFaceMessage(id: string): { type: 'face'; data: { id: string } } {
    return {
        type: 'face',
        data: { id }
    };
}

/**
 * 创建@消息段
 */
export function createAtMessage(qq: string, name?: string): { type: 'at'; data: { qq: string; name?: string } } {
    const data: { qq: string; name?: string } = { qq };
    if (name) data.name = name;
    return {
        type: 'at',
        data
    };
}

/**
 * 创建回复消息段
 */
export function createReplyMessage(id: string): { type: 'reply'; data: { id: string } } {
    return {
        type: 'reply',
        data: { id }
    };
}

/**
 * 创建语音消息段
 */
export function createRecordMessage(file: string): { type: 'record'; data: { file: string } } {
    return {
        type: 'record',
        data: { file }
    };
}

/**
 * 创建视频消息段
 */
export function createVideoMessage(file: string): { type: 'video'; data: { file: string } } {
    return {
        type: 'video',
        data: { file }
    };
}

/**
 * 创建位置消息段
 */
export function createLocationMessage(lat: number | string, lon: number | string, title: string, content: string): { type: 'location'; data: { lat: number | string; lon: number | string; title: string; content: string } } {
    return {
        type: 'location',
        data: { lat, lon, title, content }
    };
}

// ==================== 权限检查 ====================

/**
 * 检查群聊中是否有管理员权限
 * 私聊消息默认返回 true
 */
export function isAdmin(event: OB11Message): boolean {
    if (event.message_type !== 'group') return true;
    const role = (event.sender as Record<string, unknown>)?.role;
    return role === 'admin' || role === 'owner';
}
