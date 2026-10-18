/**
 * 插件类型定义
 *
 * 注意：OneBot 相关类型（OB11Message, OB11PostSendMsg 等）
 * 以及插件框架类型（NapCatPluginContext, PluginModule 等）
 * 均来自 napcat-types 包（本项目以垫片形式自持），无需在此重复定义。
 *
 * 与 WebUI 共用的类型（PluginConfig, SessionConfig, ApiResponse）
 * 统一定义在 shared 包，此处仅重导出。
 */
export type {
    ApiResponse,
    FromInfo,
    GameName,
    GameNameItem,
    GameNameMap,
    PluginConfig,
    SessionConfig,
    SessionConfigBase,
    SessionType,
    SteamBindData,
    SteamBindItem,
} from 'shared';

// ==================== Timeline 时间线记录 ====================

/**
 * 时间线日志表头字段
 */
export type TimelineLogHeader = [
    'steamId',
    'changeType',
    'gameId',
    'updateTime',
];

/**
 * 时间线单条数据记录 [steamId, changeType, gameId, updateTime]
 */
export type TimelineLogEntry = [
    string,
    string,
    string | null,
    number,
];

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
    /** 游戏名称（通过 gameNameService 格式化） */
    name: string;
    /** 游玩时长（秒） */
    duration: number;
}

/** 报告中单个用户的数据 */
export interface ReportUser {
    /** STEAM ID64 */
    steamId: string;
    /** Steam 用户的昵称 */
    personName: string;
    /** 来源自定义昵称（可选） */
    fromNickname?: string;
    /** 在线时长（秒） */
    onlineDuration: number;
    /** 游戏时长（秒） */
    playedDuration: number;
    /** 游玩过的游戏列表 */
    playedGame?: ReportPlayedGame[];
}
