import { describe, expect, it } from 'vitest';
import { escapeXml } from '../../src/utils/svg-render';

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
