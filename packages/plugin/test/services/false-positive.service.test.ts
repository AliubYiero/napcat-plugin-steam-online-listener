import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock 外部依赖 — 与 steam-cache.service.test.ts 保持一致
vi.mock('../../services/game-name.service.js', () => ({
    gameNameService: {
        getFormattedGameName: vi
            .fn()
            .mockResolvedValue('MockGameName'),
    },
}));

vi.mock('../../utils/format', () => ({
    formatPlayTime: vi.fn().mockReturnValue('1小时30分钟'),
}));

import { falsePositiveService } from '../../src/services/false-positive.service';
import type { SteamPlayerSummary } from '../../src/services/steam.service';
import { steamCacheService } from '../../src/services/steam-cache.service';
import { pluginStateStub } from '../helpers/plugin-state-mock';
import {
    inGamePlayer,
    offlinePlayer,
    onlinePlayer,
} from '../helpers/steam-players';

// ==================== 测试辅助 ====================

/** 模拟生产环境的一轮轮询: 检测 → 误报分流 → 按冻结集更新缓存 */
function poll(summaries: SteamPlayerSummary[]) {
    const changes = steamCacheService.detectStatusChanges(summaries);
    const resolution = falsePositiveService.resolve(
        summaries,
        changes,
    );
    const updatable = summaries.filter(
        (s) => !resolution.frozenSteamIds.has(s.steamid),
    );
    steamCacheService.updateCacheBatch(
        updatable,
        resolution.confirmed,
    );
    return resolution;
}

function setThreshold(value: number): void {
    pluginStateStub.config.falsePositiveDetection = value;
}

// ==================== 测试 ====================

describe('FalsePositiveService', () => {
    beforeEach(() => {
        steamCacheService.clearCache();
        falsePositiveService.clearPending();
        setThreshold(0);
    });

    describe('阈值 0 — 关闭误报检测', () => {
        it('直接确认全部变化, 无冻结', () => {
            steamCacheService.updateCacheBatch([
                inGamePlayer('123', 'Dota 2', '570'),
            ]);

            const res = poll([offlinePlayer('123')]);

            expect(res.confirmed).toHaveLength(1);
            expect(res.confirmed[0].changeType).toBe('quitGame');
            expect(res.frozenSteamIds.size).toBe(0);
            expect(falsePositiveService.getPendingCount()).toBe(0);
        });
    });

    describe('N=1 — 基础确认', () => {
        it('首次检测进入待确认, 不确认且冻结缓存', () => {
            setThreshold(1);
            steamCacheService.updateCacheBatch([
                inGamePlayer('123', 'Dota 2', '570'),
            ]);

            const res = poll([offlinePlayer('123')]);

            expect(res.confirmed).toHaveLength(0);
            expect(res.frozenSteamIds.has('123')).toBe(true);
            expect(falsePositiveService.hasPending('123')).toBe(true);
            // 缓存基准冻结在旧状态
            expect(
                steamCacheService.getCurrentCache()['123']
                    .gameextrainfo,
            ).toBe('Dota 2');
        });

        it('连续两轮同一新状态 → 第二轮确认', () => {
            setThreshold(1);
            steamCacheService.updateCacheBatch([
                inGamePlayer('123', 'Dota 2', '570'),
            ]);

            poll([offlinePlayer('123')]);
            const res = poll([offlinePlayer('123')]);

            expect(res.confirmed).toHaveLength(1);
            expect(res.confirmed[0].changeType).toBe('quitGame');
            expect(res.frozenSteamIds.has('123')).toBe(false);
            expect(
                steamCacheService.getCurrentCache()['123']
                    .personastate,
            ).toBe(0);
        });

        it('第二轮回到原状态 → 判误报静默作废', () => {
            setThreshold(1);
            steamCacheService.updateCacheBatch([
                inGamePlayer('123', 'Dota 2', '570'),
            ]);

            poll([offlinePlayer('123')]);
            const res = poll([inGamePlayer('123', 'Dota 2', '570')]);

            expect(res.confirmed).toHaveLength(0);
            expect(res.frozenSteamIds.size).toBe(0);
            expect(falsePositiveService.hasPending('123')).toBe(
                false,
            );
            // 缓存仍为最初状态, 抖动链被整段抹除
            expect(
                steamCacheService.getCurrentCache()['123']
                    .gameextrainfo,
            ).toBe('Dota 2');
        });

        it('第三状态替换待确认, 基线仍为最初旧状态', () => {
            setThreshold(1);
            steamCacheService.updateCacheBatch([
                inGamePlayer('123', 'Dota 2', '570'),
            ]);

            poll([inGamePlayer('123', 'CS2', '730')]);
            const res2 = poll([inGamePlayer('123', 'TF2', '440')]);
            expect(res2.confirmed).toHaveLength(0);
            expect(falsePositiveService.hasPending('123')).toBe(true);

            const res3 = poll([inGamePlayer('123', 'TF2', '440')]);
            expect(res3.confirmed).toHaveLength(1);
            expect(res3.confirmed[0].changeType).toBe('switchGame');
            // 确认文案的旧状态为最初基准, 而非中间状态
            expect(res3.confirmed[0].oldStatus?.gameextrainfo).toBe(
                'Dota 2',
            );
        });
    });

    describe('N=2 — 多次确认', () => {
        it('需连续 3 次观测才确认', () => {
            setThreshold(2);
            steamCacheService.updateCacheBatch([
                offlinePlayer('123'),
            ]);

            poll([onlinePlayer('123')]);
            const res2 = poll([onlinePlayer('123')]);
            expect(res2.confirmed).toHaveLength(0);

            const res3 = poll([onlinePlayer('123')]);
            expect(res3.confirmed).toHaveLength(1);
            expect(res3.confirmed[0].changeType).toBe('online');
        });
    });

    describe('边界', () => {
        it('本轮无该用户数据时冻结计数不变', () => {
            setThreshold(1);
            steamCacheService.updateCacheBatch([
                inGamePlayer('123', 'Dota 2', '570'),
            ]);

            poll([offlinePlayer('123')]);

            const res2 = poll([]);
            expect(res2.confirmed).toHaveLength(0);
            expect(res2.frozenSteamIds.has('123')).toBe(true);

            const res3 = poll([offlinePlayer('123')]);
            expect(res3.confirmed).toHaveLength(1);
        });

        it('确认时回填状态事件时刻', () => {
            setThreshold(1);
            steamCacheService.updateCacheBatch([
                inGamePlayer('123', 'Dota 2', '570'),
            ]);

            const nowSpy = vi.spyOn(Date, 'now');
            nowSpy.mockReturnValue(1000);
            poll([offlinePlayer('123')]);

            nowSpy.mockReturnValue(2000);
            const res = poll([offlinePlayer('123')]);
            expect(res.confirmed[0].detectedAt).toBe(1000);

            nowSpy.mockRestore();
        });

        it('确认的游戏变化回填 gameStartTime', () => {
            setThreshold(1);
            steamCacheService.updateCacheBatch([onlinePlayer('123')]);

            const nowSpy = vi.spyOn(Date, 'now');
            nowSpy.mockReturnValue(1000);
            poll([inGamePlayer('123', 'CS2', '730')]);

            nowSpy.mockReturnValue(2000);
            const res = poll([inGamePlayer('123', 'CS2', '730')]);
            expect(res.confirmed).toHaveLength(1);
            expect(
                steamCacheService.getCurrentCache()['123']
                    .gameStartTime,
            ).toBe(1000);

            nowSpy.mockRestore();
        });

        it('多用户独立处理', () => {
            setThreshold(1);
            steamCacheService.updateCacheBatch([
                inGamePlayer('111', 'Dota 2', '570'),
                inGamePlayer('222', 'Dota 2', '570'),
            ]);

            poll([offlinePlayer('111'), offlinePlayer('222')]);
            const res = poll([
                offlinePlayer('111'),
                inGamePlayer('222', 'Dota 2', '570'),
            ]);

            expect(res.confirmed).toHaveLength(1);
            expect(res.confirmed[0].steamId).toBe('111');
            expect(falsePositiveService.hasPending('222')).toBe(
                false,
            );
        });
    });
});
