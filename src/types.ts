/**
 * 类型定义文件
 * 定义插件内部使用的接口和类型
 *
 * 注意：OneBot 相关类型（OB11Message, OB11PostSendMsg 等）
 * 以及插件框架类型（NapCatPluginContext, PluginModule 等）
 * 均来自 napcat-types 包，无需在此重复定义。
 */

// ==================== 插件配置 ====================

/**
 * 插件主配置接口
 * 在此定义你的插件所需的所有配置项
 */
export interface PluginConfig {
    /** 全局开关：是否启用插件功能 */
    enabled: boolean;
    /** 调试模式：启用后输出详细日志 */
    debug: boolean;
    /** 触发命令前缀，默认为 #cmd */
    commandPrefix: string;
    /** 同一命令请求冷却时间（秒），0 表示不限制 */
    cooldownSeconds: number;
    /** Steam状态轮询间隔（秒），默认为60秒 */
    pollingIntervalSeconds: number;
    /** 按群的单独配置 */
    groupConfigs: Record<string, GroupConfig>;
    /** 插件管理员用户列表 */
    adminUsers?: string[];
    // TODO: 在这里添加你的插件配置项
	steamApiKey: string;
}

/**
 * 群配置
 */
export interface GroupConfig {
    /** 是否启用此群的功能 */
    enabled?: boolean;
    // TODO: 在这里添加群级别的配置项
}

/**
 * 用户配置
 */
export interface UserConfig {
    /** 是否允许此用户使用插件功能 */
    enabled?: boolean;
    // TODO: 在这里添加用户级别的配置项
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

// ==================== Steam ID 查询相关类型 ====================

/** Steam ID 详细信息 */
export interface SteamIDDetail {
    universe: number;
    type: number;
    instance: number;
    accountid: number;
}

/** Skinflow API 响应格式 */
export interface SkinflowSteamIDResponse {
    steamID: SteamIDDetail;
    name: string;
    onlineState: string;
    stateMessage: string;
    privacyState: string;
    visibilityState: string;
    avatarHash: string;
    vacBanned: boolean;
    gameBan: number;
    tradeBanState: string;
    isLimitedAccount: boolean;
    customURL: string;
    memberSince: string;
    location: string;
    realName: string;
    steamLevel: number;
    friendsCount: number;
    steamID2: string;
    steamID3: string;
    steamID64: string;
    steamHex: string;
    ban: boolean;
}

// ==================== Steam 绑定数据相关类型 ====================

/** 来源信息 */
export interface FromInfo {
    id: string;                // 用户ID或群ID
    type: 'private' | 'group'; // 来源类型
    nickname?: string;         // 该来源对该Steam用户的自定义昵称
}

/** Steam 绑定数据项 */
export interface SteamBindItem {
    steamId: string;           // STEAM ID64
    personName?: string;       // Steam 用户的昵称
    face?: string;             // 用户头像链接
    userQQ?: number;           // 当前 steam 绑定的 QQ 用户
    from?: FromInfo[];         // 来源信息数组，记录多个来源及每个来源的自定义昵称
}

/** Steam 绑定数据集合 */
export type SteamBindData = SteamBindItem[];
