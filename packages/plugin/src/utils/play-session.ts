/**
 * 游玩场次折叠
 *
 * 场次从首次观测到某款游戏开始, 到 outgame/quitGame/offline 结束;
 * 切换游戏在同一事件时刻结束旧场次并开始新场次。
 * 同一款游戏内的 inAfk/outAfk 抖动不改变场次。
 */

/** 参与折叠的状态事件 */
export interface PlayEventInput {
    changeType: string;
    gameId?: string | null;
    /** 状态事件时刻 (首次检出时刻), 毫秒 */
    at: number;
}

/** 进行中的场次 */
export interface PlaySession {
    gameId: string;
    startAt: number;
}

/** 已结束的场次 */
export interface ClosedPlaySession extends PlaySession {
    endAt: number;
}

/** 单次折叠结果 */
export interface PlayFoldResult {
    active: PlaySession | null;
    closed?: ClosedPlaySession;
}

/** 一组事件的游玩时长汇总 */
export interface PlayDurationSummary {
    /** 总游玩时长 (秒) */
    total: number;
    /** gameId → 游玩时长 (秒) */
    games: Map<string, number>;
}

const PLAY_END_TYPES = new Set(['outgame', 'quitGame', 'offline']);

/**
 * 折叠单个状态事件, 返回新场次状态与(可能)刚结束的场次
 */
export function foldPlayEvent(
    active: PlaySession | null,
    event: PlayEventInput,
): PlayFoldResult {
    if (PLAY_END_TYPES.has(event.changeType)) {
        if (!active) return { active: null };
        return {
            active: null,
            closed: { ...active, endAt: event.at },
        };
    }

    if (!event.gameId) {
        return { active };
    }

    if (!active) {
        return {
            active: { gameId: event.gameId, startAt: event.at },
        };
    }

    if (active.gameId === event.gameId) {
        return { active };
    }

    return {
        active: { gameId: event.gameId, startAt: event.at },
        closed: { ...active, endAt: event.at },
    };
}

/**
 * 折叠一组按时间升序的状态事件, 统计各游戏游玩时长 (秒)
 */
export function collectPlayDurations(
    events: readonly PlayEventInput[],
    endTime: number,
): PlayDurationSummary {
    let active: PlaySession | null = null;
    let total = 0;
    const games = new Map<string, number>();

    const settle = (closed: ClosedPlaySession): void => {
        const duration = Math.floor(
            (closed.endAt - closed.startAt) / 1000,
        );
        games.set(
            closed.gameId,
            (games.get(closed.gameId) ?? 0) + duration,
        );
        total += duration;
    };

    for (const event of events) {
        if (event.at > endTime) continue;
        const result = foldPlayEvent(active, event);
        active = result.active;
        if (result.closed) settle(result.closed);
    }

    if (active) {
        settle({ ...active, endAt: endTime });
    }

    return { total, games };
}
