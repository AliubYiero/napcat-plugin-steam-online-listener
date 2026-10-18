import { describe, expect, it, vi } from 'vitest';
import { SvgRenderService } from '../../src/services/svg-render.service';

function stubJsonResponse(payload: unknown): void {
    vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
            json: async () => payload,
        }),
    );
}

describe('SvgRenderService.renderSvg', () => {
    it('渲染成功时返回去除 data URI 前缀的 base64', async () => {
        stubJsonResponse({
            code: 0,
            data: {
                imageBase64: 'data:image/png;base64,QUJD',
                format: 'png',
            },
        });

        const service = new SvgRenderService();
        await expect(service.renderSvg('<svg/>')).resolves.toBe(
            'QUJD',
        );
    });

    it('返回码非 0 时返回 null', async () => {
        stubJsonResponse({ code: -1, message: '渲染失败' });

        const service = new SvgRenderService();
        await expect(service.renderSvg('<svg/>')).resolves.toBeNull();
    });

    it('请求抛错时返回 null（不向外抛异常）', async () => {
        vi.stubGlobal(
            'fetch',
            vi
                .fn()
                .mockRejectedValue(new Error('connection refused')),
        );

        const service = new SvgRenderService();
        await expect(service.renderSvg('<svg/>')).resolves.toBeNull();
    });
});

describe('SvgRenderService.calculateTextWidth', () => {
    it('空文本返回 0 且不发请求', async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);

        const service = new SvgRenderService();
        await expect(
            service.calculateTextWidth('', { fontSize: 16 }),
        ).resolves.toBe(0);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('测量成功时返回接口 totalWidth', async () => {
        stubJsonResponse({ code: 0, data: { totalWidth: 42.5 } });

        const service = new SvgRenderService();
        await expect(
            service.calculateTextWidth('hello', { fontSize: 16 }),
        ).resolves.toBe(42.5);
    });

    it('接口失败时回退启发式（全角 1 倍, 其余 0.6 倍）', async () => {
        stubJsonResponse({ code: -1, message: '字体未注册' });

        const service = new SvgRenderService();
        // 你好 = 2 全角 = 2×16, ab = 2×0.6×16
        await expect(
            service.calculateTextWidth('你好ab', { fontSize: 16 }),
        ).resolves.toBeCloseTo(32 + 19.2, 5);
    });

    it('请求抛错时回退启发式', async () => {
        vi.stubGlobal(
            'fetch',
            vi
                .fn()
                .mockRejectedValue(new Error('connection refused')),
        );

        const service = new SvgRenderService();
        await expect(
            service.calculateTextWidth('abcd', { fontSize: 10 }),
        ).resolves.toBeCloseTo(24, 5);
    });

    it('相同文本命中缓存, 仅请求一次', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            json: async () => ({ code: 0, data: { totalWidth: 7 } }),
        });
        vi.stubGlobal('fetch', fetchMock);

        const service = new SvgRenderService();
        await service.calculateTextWidth('cache', { fontSize: 16 });
        await service.calculateTextWidth('cache', { fontSize: 16 });
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });
});

describe('SvgRenderService.truncateToWidth', () => {
    it('文本未超出时原样返回', async () => {
        stubJsonResponse({ code: 0, data: { totalWidth: 100 } });

        const service = new SvgRenderService();
        await expect(
            service.truncateToWidth('abc', 200, { fontSize: 16 }),
        ).resolves.toBe('abc');
    });

    it('超出时截断并追加省略号, 宽度不超过上限', async () => {
        // 每字符宽 10
        vi.stubGlobal(
            'fetch',
            vi.fn(async (_url: string, init: { body: string }) => {
                const body = JSON.parse(init.body) as {
                    text: string;
                };
                return {
                    json: async () => ({
                        code: 0,
                        data: { totalWidth: body.text.length * 10 },
                    }),
                };
            }),
        );

        const service = new SvgRenderService();
        // 10 字符共 100 宽, 限 55 → 最多 5 字符（含省略号）
        await expect(
            service.truncateToWidth('abcdefghij', 55, {
                fontSize: 16,
            }),
        ).resolves.toBe('abcd…');
    });

    it('maxWidth 非正数返回空字符串', async () => {
        const service = new SvgRenderService();
        await expect(
            service.truncateToWidth('abc', 0, { fontSize: 16 }),
        ).resolves.toBe('');
    });
});
