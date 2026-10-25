import { describe, expect, it } from 'vitest';
import { formatPlayTime } from '../../src/utils/format';
import {
    collectPlayDurations,
    foldPlayEvent,
    type PlayEventInput,
} from '../../src/utils/play-session';

const GAME = '499170';

describe('foldPlayEvent', () => {
    it('首次观测到游戏即开场', () => {
        const result = foldPlayEvent(null, {
            changeType: 'ingame',
            gameId: GAME,
            at: 1000,
        });

        expect(result.active).toEqual({
            gameId: GAME,
            startAt: 1000,
        });
        expect(result.closed).toBeUndefined();
    });

    it('同一游戏内的 AFK 抖动不改变场次', () => {
        let active = foldPlayEvent(null, {
            changeType: 'ingame',
            gameId: GAME,
            at: 1000,
        }).active;

        for (const [changeType, at] of [
            ['inAfk', 2000],
            ['outAfk', 3000],
            ['inAfk', 4000],
        ] as const) {
            const result = foldPlayEvent(active, {
                changeType,
                gameId: GAME,
                at,
            });

            expect(result.active).toEqual({
                gameId: GAME,
                startAt: 1000,
            });
            expect(result.closed).toBeUndefined();
            active = result.active;
        }
    });

    it('AFK 状态下启动游戏同样开场', () => {
        const result = foldPlayEvent(null, {
            changeType: 'inAfk',
            gameId: GAME,
            at: 1000,
        });

        expect(result.active).toEqual({
            gameId: GAME,
            startAt: 1000,
        });
    });

    it.each(['outgame', 'quitGame', 'offline'])(
        '%s 结束时结算当前场次',
        (changeType) => {
            const result = foldPlayEvent(
                { gameId: GAME, startAt: 1000 },
                { changeType, gameId: null, at: 5000 },
            );

            expect(result.active).toBeNull();
            expect(result.closed).toEqual({
                gameId: GAME,
                startAt: 1000,
                endAt: 5000,
            });
        },
    );

    it('切换游戏在同一时刻关旧开新', () => {
        const result = foldPlayEvent(
            { gameId: GAME, startAt: 1000 },
            { changeType: 'switchGame', gameId: '730', at: 5000 },
        );

        expect(result.closed).toEqual({
            gameId: GAME,
            startAt: 1000,
            endAt: 5000,
        });
        expect(result.active).toEqual({
            gameId: '730',
            startAt: 5000,
        });
    });
});

describe('collectPlayDurations', () => {
    it('按首次游戏事件到结束事件统计时长', () => {
        // 线上样本: ingame → 多次 AFK 抖动 → outgame
        const events: PlayEventInput[] = [
            { changeType: 'ingame', gameId: GAME, at: 1792900350698 },
            { changeType: 'inAfk', gameId: GAME, at: 1792900980542 },
            { changeType: 'outAfk', gameId: GAME, at: 1792901190593 },
            { changeType: 'inAfk', gameId: GAME, at: 1792902090716 },
            { changeType: 'outAfk', gameId: GAME, at: 1792902150774 },
            { changeType: 'inAfk', gameId: GAME, at: 1792902450633 },
            { changeType: 'outAfk', gameId: GAME, at: 1792904100626 },
            {
                changeType: 'outgame',
                gameId: null,
                at: 1792904640801,
            },
        ];

        const summary = collectPlayDurations(
            events,
            Number.MAX_SAFE_INTEGER,
        );

        expect(summary.total).toBe(4290);
        expect(summary.games.get(GAME)).toBe(4290);
        expect(formatPlayTime(1792900350698, 1792904640801)).toBe(
            '1小时11分钟30秒',
        );
    });

    it('未结束的场次截止到结束时间', () => {
        const summary = collectPlayDurations(
            [{ changeType: 'ingame', gameId: GAME, at: 1000 }],
            61000,
        );

        expect(summary.total).toBe(60);
    });

    it('忽略结束时间之后的事件', () => {
        const summary = collectPlayDurations(
            [
                { changeType: 'ingame', gameId: GAME, at: 1000 },
                { changeType: 'outgame', gameId: null, at: 120000 },
            ],
            61000,
        );

        expect(summary.total).toBe(60);
    });
});
