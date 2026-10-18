import { describe, expect, it, vi } from 'vitest';
import { generateSteamReport } from '../../src/services/steam-report.service';
import type { ReportUser } from '../../src/types';

/** 以「文本长度 × 10」模拟测量接口返回的宽度 */
function stubMeasureByLength(): void {
    vi.stubGlobal(
        'fetch',
        vi.fn(async (_url: string, init: { body: string }) => {
            const body = JSON.parse(init.body) as { text: string };
            return {
                json: async () => ({
                    code: 0,
                    data: { totalWidth: body.text.length * 10 },
                }),
            };
        }),
    );
}

function makeUser(overrides: Partial<ReportUser> = {}): ReportUser {
    return {
        steamId: '76561198000000000',
        personName: 'Tester',
        onlineDuration: 3600,
        playedDuration: 3600,
        ...overrides,
    };
}

describe('generateSteamReport 宽度', () => {
    it('短内容时宽度介于最小与上限之间且无省略号', async () => {
        stubMeasureByLength();

        const svg = await generateSteamReport(
            [
                makeUser({
                    playedGame: [{ name: 'Game', duration: 60 }],
                }),
            ],
            { date: '2026年3月6日' },
        );

        const width = Number(svg.match(/<svg width="(\d+)"/)?.[1]);
        expect(width).toBeGreaterThanOrEqual(548);
        expect(width).toBeLessThan(2000);
        expect(svg).not.toContain('…');
        // 时长背景条存在
        expect(svg).toContain('y="-2"');
    });

    it('超长游戏名时整图宽度封顶 2000 并截断加省略号', async () => {
        stubMeasureByLength();

        const svg = await generateSteamReport(
            [
                makeUser({
                    playedGame: [
                        { name: 'x'.repeat(500), duration: 3600 },
                    ],
                }),
            ],
            { date: '2026年3月6日' },
        );

        expect(svg).toContain('width="2000"');
        expect(svg).toContain('…');
    });

    it('根元素使用思源黑体渲染字体栈', async () => {
        stubMeasureByLength();

        const svg = await generateSteamReport([makeUser()], {
            date: '2026年3月6日',
        });

        expect(svg).toContain('Noto Sans CJK SC');
    });

    it('无游戏行时仍然渲染且宽度不小于最小值', async () => {
        stubMeasureByLength();

        const svg = await generateSteamReport([makeUser()], {
            date: '2026年3月6日',
        });

        const width = Number(svg.match(/<svg width="(\d+)"/)?.[1]);
        expect(width).toBeGreaterThanOrEqual(548);
        expect(svg).not.toContain('最近游玩');
    });
});
