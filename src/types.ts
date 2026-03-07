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
    	/** 要推送的状态类型列表 */
    	notifyStatusTypes: string[];
    }
    
    /**
     * 群配置
     */export interface GroupConfig {
    /** 是否启用此群的功能 */
    enabled?: boolean;
    // TODO: 在这里添加群级别的配置项
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
    from?: FromInfo[];         // 来源信息数组，记录多个来源及每个来源的自定义昵称
}

/** Steam 绑定数据集合 */
export type SteamBindData = SteamBindItem[];

// ==================== Steam 游戏名称 ====================

/**
 * Steam 游戏名称信息
 */
export interface GameName {
    en: string;      // 英文名（来自Steam API的gameextrainfo）
    zh?: string;     // 中文名（可选，从Steam商店API获取）
}

/**
 * 游戏名称映射表，key为appid
 */
export type GameNameMap = Record<string, GameName>;

// ==================== Timeline 时间线记录 ====================

/**
 * 时间线日志表头字段
 */
export type TimelineLogHeader = ['steamId', 'changeType', 'gameId', 'updateTime'];

/**
 * 时间线单条数据记录 [steamId, 'changeType', 'gameId', 'updateTime']
 */
export type TimelineLogEntry = [string, string, string | null, number];

/**
 * 时间线日志文件结构（数组格式减少体积）
 */
export interface TimelineLog {
    /** 表头 */
    h: TimelineLogHeader;
    /** 数据行 */
    d: TimelineLogEntry[];
}

// ==================== Steam 每日报告 ====================

/** 报告中单个游戏的游玩数据 */
export interface ReportPlayedGame {
    name: string;       // 游戏名称（通过 gameNameService 格式化）
    duration: number;   // 游玩时长（秒）
}

/** 报告中单个用户的数据 */
export interface ReportUser {
    steamId: string;        // STEAM ID64
    personName: string;     // Steam 用户的昵称
    fromNickname?: string;  // 来源自定义昵称（可选）
    onlineDuration: number; // 在线时长（秒）
    playedDuration: number; // 游戏时长（秒）
    playedGame?: ReportPlayedGame[];
}
