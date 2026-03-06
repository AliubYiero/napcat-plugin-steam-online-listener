/**
 * 公共 SVG 渲染工具
 */

import { pluginState } from '../core/state';

/**
 * 使用 svg-convert 渲染 SVG 为 base64 图片
 */
export async function renderSvgToBase64(svg: string): Promise<string | null> {
    try {
        const port = 6099;
        const host = `http://127.0.0.1:${port}`;
        const url = `${host}/plugin/napcat-plugin-svg-render/api/svg/render`;

        pluginState.logger.debug(`调用 svg-convert 渲染，SVG 长度: ${svg.length}`);

        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                svg,
                saveWebImage: true,
            }),
            signal: AbortSignal.timeout(30000),
        });

        const data = await res.json() as {
            code: number;
            data?: { imageBase64: string; format: string };
            message?: string;
        };

        if (data.code === 0 && data.data?.imageBase64) {
            pluginState.logger.debug('svg-convert 渲染成功');
            const base64Data = data.data.imageBase64.replace(/^data:image\/png;base64,/, '');
            return base64Data;
        }
        pluginState.logger.warn(`svg-convert 渲染失败: ${data.message || '未知错误'}`);
        return null;
    } catch (e) {
        pluginState.logger.error(`svg-convert 渲染请求失败: ${e}`);
        return null;
    }
}

/**
 * 转义 XML 特殊字符
 */
export function escapeXml(text: string): string {
    if (!text) return '';
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}
