/** WebUI 前端类型定义 */
import type { PluginConfig } from 'shared';

export type {
    ApiResponse,
    Cmd,
    ContentHelp,
    ContentHelpMethod,
    FromInfo,
    GameName,
    GameNameItem,
    Instruction,
    InstructionSet,
    PluginConfig,
    Role,
    SessionConfig,
    SessionConfigBase,
    SessionType,
    SteamBindData,
    SteamBindItem,
} from 'shared';

export interface PluginStatus {
    pluginName: string;
    uptime: number;
    uptimeFormatted: string;
    config: PluginConfig;
    stats: {
        processed: number;
        todayProcessed: number;
        lastUpdateDay: string;
    };
}

/**
 * 群会话信息，对应后端 GET /sessions 的归一化返回
 * (插件仅面向群聊，故 type 恒为 'group')
 */
export interface SessionInfo {
    /** 群号 */
    id: string;
    type: 'group';
    /** 群名称 */
    name: string;
    enabled: boolean;
    /** 当前成员数 */
    memberCount: number;
    /** 最大成员数 */
    maxMemberCount: number;
}
