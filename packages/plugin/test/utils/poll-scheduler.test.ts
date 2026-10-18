import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    ALIGNED_INTERVALS,
    createNextDelay,
    isAlignedInterval,
} from '../../src/utils/poll-scheduler';

describe('isAlignedInterval', () => {
    it('10/15/30/60 秒应走墙钟对齐', () => {
        for (const seconds of [10, 15, 30, 60]) {
            expect(isAlignedInterval(seconds)).toBe(true);
        }
    });

    it('其余间隔不走对齐', () => {
        for (const seconds of [5, 20, 45, 90, 61]) {
            expect(isAlignedInterval(seconds)).toBe(false);
        }
    });

    it('ALIGNED_INTERVALS 应恰好为 {10,15,30,60}', () => {
        expect([...ALIGNED_INTERVALS].sort((a, b) => a - b)).toEqual([
            10, 15, 30, 60,
        ]);
    });
});

describe('createNextDelay - 对齐间隔', () => {
    it('10s: 边界与整除时应返回完整间隔', () => {
        const nextDelay = createNextDelay(10);
        expect(nextDelay(0)).toBe(10000);
        expect(nextDelay(10000)).toBe(10000);
    });

    it('10s: 应返回至下一个 10 秒边界的时间', () => {
        const nextDelay = createNextDelay(10);
        expect(nextDelay(1000)).toBe(9000);
        expect(nextDelay(12345)).toBe(7655);
    });

    it('10s: 已错过边界时应排到下一个未来边界', () => {
        const nextDelay = createNextDelay(10);
        // 21500 已越过 20000 边界, 下一个为 30000
        expect(nextDelay(21500)).toBe(8500);
    });

    it('15s: 对齐到 0/15/30/45 秒', () => {
        const nextDelay = createNextDelay(15);
        expect(nextDelay(0)).toBe(15000);
        expect(nextDelay(7000)).toBe(8000);
        expect(nextDelay(15000)).toBe(15000);
    });

    it('30s: 对齐到 0/30 秒', () => {
        const nextDelay = createNextDelay(30);
        expect(nextDelay(1000)).toBe(29000);
        expect(nextDelay(40000)).toBe(20000);
    });

    it('60s: 对齐到整分钟', () => {
        const nextDelay = createNextDelay(60);
        expect(nextDelay(1000)).toBe(59000);
        expect(nextDelay(90000)).toBe(30000);
        expect(nextDelay(60000)).toBe(60000);
    });
});

describe('createNextDelay - 非对齐间隔', () => {
    it('应始终返回固定间隔', () => {
        const nextDelay = createNextDelay(20);
        expect(nextDelay(0)).toBe(20000);
        expect(nextDelay(12345)).toBe(20000);
        expect(nextDelay(999999)).toBe(20000);
    });

    it('45 秒应返回固定 45000ms', () => {
        const nextDelay = createNextDelay(45);
        expect(nextDelay(1000)).toBe(45000);
    });
});

describe('createNextDelay - 默认取当前时间', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('未传 nowMs 时应使用 Date.now()', () => {
        vi.spyOn(Date, 'now').mockReturnValue(12000);
        const nextDelay = createNextDelay(10);
        expect(nextDelay()).toBe(8000);
    });
});
