import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    escapeXml,
    renderSvgToBase64,
} from '../../src/utils/svg-render';
import { pluginStateStub } from '../helpers/plugin-state-mock';

describe('escapeXml', () => {
    it('空字符串返回空字符串', () => {
        expect(escapeXml('')).toBe('');
    });

    it('单个特殊字符分别转义', () => {
        expect(escapeXml('&')).toBe('&amp;');
        expect(escapeXml('<')).toBe('&lt;');
        expect(escapeXml('>')).toBe('&gt;');
        expect(escapeXml('"')).toBe('&quot;');
        expect(escapeXml("'")).toBe('&apos;');
    });

    it('组合特殊字符全部转义（含 & 优先处理，避免二次转义）', () => {
        expect(escapeXml('<a href="x">Tom & Jerry\'s</a>')).toBe(
            '&lt;a href=&quot;x&quot;&gt;Tom &amp; Jerry&apos;s&lt;/a&gt;',
        );
    });

    it('普通文本保持不变', () => {
        expect(escapeXml('Hello 世界 123')).toBe('Hello 世界 123');
    });
});

describe('renderSvgToBase64', () => {
    beforeEach(() => {
        pluginStateStub.config.steamApiKey = '';
    });

    it('渲染成功时返回去除 data URI 前缀的 base64', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue({
                json: async () => ({
                    code: 0,
                    data: {
                        imageBase64: 'data:image/png;base64,QUJD',
                        format: 'png',
                    },
                }),
            }),
        );

        await expect(renderSvgToBase64('<svg/>')).resolves.toBe(
            'QUJD',
        );
    });

    it('返回码非 0 时返回 null', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue({
                json: async () => ({
                    code: -1,
                    message: '渲染失败',
                }),
            }),
        );

        await expect(renderSvgToBase64('<svg/>')).resolves.toBeNull();
    });

    it('请求抛错时返回 null（不向外抛异常）', async () => {
        vi.stubGlobal(
            'fetch',
            vi
                .fn()
                .mockRejectedValue(new Error('connection refused')),
        );

        await expect(renderSvgToBase64('<svg/>')).resolves.toBeNull();
    });
});
