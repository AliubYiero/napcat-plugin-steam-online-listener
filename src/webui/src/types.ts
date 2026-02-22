/** WebUI 前端类型定义 */

export interface PluginStatus {
    pluginName: string
    uptime: number
    uptimeFormatted: string
    config: PluginConfig
    stats: {
        processed: number
        todayProcessed: number
        lastUpdateDay: string
    }
}

export interface PluginConfig {
    enabled: boolean
    debug: boolean
    commandPrefix: string
    cooldownSeconds: number
    pollingIntervalSeconds: number
    steamApiKey: string
    adminUsers: string[]
    notifyStatusTypes: string[]
    groupConfigs?: Record<string, GroupConfig>
}

export interface GroupConfig {
    enabled?: boolean
}

export interface GroupInfo {
    group_id: number
    group_name: string
    member_count: number
    max_member_count: number
    enabled: boolean
    /** 定时推送时间（如 '08:30'），null 表示未设置（模板默认不使用，按需扩展） */
    scheduleTime?: string | null
}

export interface ApiResponse<T = unknown> {
    code: number
    data?: T
    message?: string
}

// Steam 绑定相关类型
export interface FromInfo {
    id: string
    type: 'private' | 'group'
    nickname?: string
}

export interface SteamBindItem {
    steamId: string
    personName?: string
    face?: string
    from?: FromInfo[]
}
