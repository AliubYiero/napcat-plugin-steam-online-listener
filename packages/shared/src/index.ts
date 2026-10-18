/**
 * 共享类型定义
 * 插件后端（plugin）与 WebUI 前端（webui）共用的接口和类型。
 * 修改此文件后两端类型同步生效，无需手动维护两份定义。
 */

// 配置单一声明源 (字段描述符 + PluginConfig + 默认值/清洗派生)
export * from './config';
// 展示块占位符 (token 常量 + 解析纯函数)
export * from './displayTokens';
// 帮助面板类型 (与上游 napcat-help-generate 手工同步)
export * from './help';
// WebUI 骨架元信息 (页面清单 + PageId)
export * from './ui';

// ==================== 会话级配置 ====================

/**
 * 会话类型：群聊或私聊，与消息事件的 message_type 同域
 */
export type SessionType = 'private' | 'group';

/**
 * 会话配置项必须携带的定位字段，业务字段由具体 store 的泛型补充。
 * 会话级配置不放在插件配置文件里，而是由 store 承载（见 docs/store-pattern.md）。
 */
export interface SessionConfigBase {
    /** 群号或用户 QQ 号 */
    id: string;
    /** 会话类型 */
    type: SessionType;
}

/**
 * 会话级配置
 *
 * 启用开关为宽松判定取反：默认关闭（严格 `enabled === true` 才启用），
 * 未记录或未写 `enabled` 一律视为禁用。
 */
export interface SessionConfig extends SessionConfigBase {
    /** 是否启用此会话的功能，默认关闭 */
    enabled?: boolean;
    // TODO: 在这里添加会话级别的配置项
}

// ==================== API 响应 ====================

/**
 * 统一 API 响应格式
 */
export interface ApiResponse<T = unknown> {
    /** 状态码，0 表示成功，-1 表示失败 */
    code: number;
    /** 错误信息（仅错误时返回） */
    message?: string;
    /** 响应数据（仅成功时返回） */
    data?: T;
}

// ==================== Steam 绑定数据 ====================

/** 绑定来源信息 */
export interface FromInfo {
    /** 用户 ID 或群 ID */
    id: string;
    /** 来源类型 */
    type: 'private' | 'group';
    /** 该来源对该 Steam 用户的自定义昵称 */
    nickname?: string;
}

/** Steam 绑定数据项 */
export interface SteamBindItem {
    /** STEAM ID64 */
    steamId: string;
    /** Steam 用户的昵称 */
    personName?: string;
    /** 用户头像链接 */
    face?: string;
    /** 来源信息数组，记录多个来源及每个来源的自定义昵称 */
    from?: FromInfo[];
}

/** Steam 绑定数据集合 */
export type SteamBindData = SteamBindItem[];

// ==================== Steam 游戏名称 ====================

/** Steam 游戏名称信息 (key 为 appid) */
export interface GameName {
    /** 英文名 (来自 Steam API 的 gameextrainfo) */
    en: string;
    /** 中文名 (可选，从 Steam 商店 API 获取) */
    zh?: string;
}

/** 游戏名称映射表 */
export type GameNameMap = Record<string, GameName>;

/** 游戏名称列表项 (GET /game-names 归一化返回) */
export interface GameNameItem extends GameName {
    /** Steam appid */
    appid: string;
}
