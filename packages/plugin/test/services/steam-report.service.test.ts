import type { SteamBindItem } from 'shared';
import { describe, expect, it, vi } from 'vitest';
import {
    generateSteamReport,
    steamReportService,
} from '../../src/services/steam-report.service';
import type { ReportUser, TimelineLog } from '../../src/types';
import { pluginStateStub } from '../helpers/plugin-state-mock';

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

// ==================== 日报入选规则 ====================

const REPORT_DATE = '2026-03-06';
const T0 = Date.parse('2026-03-06T02:00:00Z');
const END_TIME = T0 + 6 * 3600 * 1000;

function makeBind(
    steamId: string,
    personName: string,
): SteamBindItem {
    return {
        steamId,
        personName,
        from: [{ type: 'group', id: '123456' }],
    };
}

/** 预置数据文件与渲染接口，返回被渲染的 SVG 列表 */
function stubReportBackend(
    log: TimelineLog,
    bindData: SteamBindItem[],
): { renderedSvgs: string[] } {
    const renderedSvgs: string[] = [];

    pluginStateStub.loadDataFile.mockImplementation(
        (filename: string, defaultValue: unknown) => {
            if (filename === `steam-status-log-${REPORT_DATE}.json`) {
                return log;
            }
            if (filename === 'steam-bind-data.json') {
                return bindData;
            }
            return defaultValue;
        },
    );

    vi.stubGlobal(
        'fetch',
        vi.fn(async (url: string, init: { body: string }) => {
            const body = JSON.parse(init.body) as {
                text?: string;
                svg?: string;
            };

            if (String(url).includes('/char/width')) {
                return {
                    json: async () => ({
                        code: 0,
                        data: {
                            totalWidth: (body.text?.length ?? 0) * 10,
                        },
                    }),
                };
            }

            if (String(url).includes('/svg/render')) {
                renderedSvgs.push(body.svg ?? '');
                return {
                    json: async () => ({
                        code: 0,
                        data: {
                            imageBase64: 'data:image/png;base64,QUJD',
                            format: 'png',
                        },
                    }),
                };
            }

            throw new Error(`未预期的请求: ${url}`);
        }),
    );

    return { renderedSvgs };
}

describe('日报入选规则', () => {
    it('跳过游戏时长为 0 的用户并剔除 0 秒游戏行', async () => {
        const log: TimelineLog = {
            h: ['steamId', 'changeType', 'gameId', 'updateTime'],
            d: [
                ['a', 'ingame', 'alpha-app', T0],
                ['a', 'outgame', 'alpha-app', T0 + 3_600_000],
                ['b', 'online', null, T0],
                ['b', 'offline', null, T0 + 1_800_000],
                ['c', 'ingame', 'gamma-app', T0],
                ['c', 'switchGame', 'zero-app', T0 + 600_000],
                ['c', 'outgame', 'zero-app', T0 + 600_000],
            ],
        };
        const { renderedSvgs } = stubReportBackend(log, [
            makeBind('a', '玩家甲'),
            makeBind('b', '玩家乙'),
            makeBind('c', '玩家丙'),
        ]);

        await expect(
            steamReportService.generateOnDemandReport(
                REPORT_DATE,
                END_TIME,
                'group:123456',
            ),
        ).resolves.toBe(true);

        expect(renderedSvgs).toHaveLength(1);
        const svg = renderedSvgs[0];
        expect(svg).toContain('玩家甲');
        expect(svg).toContain('玩家丙');
        expect(svg).not.toContain('玩家乙');
        expect(svg).toContain('alpha-app');
        expect(svg).toContain('gamma-app');
        expect(svg).not.toContain('zero-app');
        expect(svg).not.toMatch(/>\s*0m 0s\s*</);

        expect(
            pluginStateStub.ctx.actions.call,
        ).toHaveBeenCalledTimes(1);
        expect(pluginStateStub.ctx.actions.call).toHaveBeenCalledWith(
            'send_group_msg',
            expect.objectContaining({ group_id: '123456' }),
            'napcat',
            {},
        );
    });

    it('全员无游玩时返回 false 且不渲染、不发送', async () => {
        const log: TimelineLog = {
            h: ['steamId', 'changeType', 'gameId', 'updateTime'],
            d: [
                ['b', 'online', null, T0],
                ['b', 'offline', null, T0 + 1_800_000],
            ],
        };
        const { renderedSvgs } = stubReportBackend(log, [
            makeBind('b', '玩家乙'),
        ]);

        await expect(
            steamReportService.generateOnDemandReport(
                REPORT_DATE,
                END_TIME,
                'group:123456',
            ),
        ).resolves.toBe(false);

        expect(renderedSvgs).toHaveLength(0);
        expect(
            pluginStateStub.ctx.actions.call,
        ).not.toHaveBeenCalled();
    });
});
