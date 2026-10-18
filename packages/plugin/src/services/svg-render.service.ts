/**
 * SVG 渲染与文本测量服务
 * 封装 napcat-plugin-svg-render 的渲染与字符宽度测量接口
 */

import { pluginState } from '../core/state';

/** 渲染服务基础地址 */
const RENDER_BASE_URL = 'http://127.0.0.1:6099';

/**
 * 度量字体族 (字体宽度计算的权威字体,
 * 须为渲染插件已注册的族名或别名)
 */
export const MEASURE_FONT_FAMILY = 'Noto Sans CJK SC';

/**
 * 渲染字体族 CSS 栈 (SVG 根元素的 font-family)
 * 首选与度量字体保持一致, 其余为宿主字体回退
 */
export const RENDER_FONT_FAMILY = `'${MEASURE_FONT_FAMILY}','Noto Sans SC','Microsoft YaHei',sans-serif`;

/** 文本样式 (用于宽度测量) */
export interface TextStyle {
    fontSize: number;
    fontWeight?: number | string;
    fontStyle?: string;
    fontFamily?: string;
}

/** 默认文本样式 */
const DEFAULT_TEXT_STYLE: TextStyle = { fontSize: 16 };

/** 测量缓存上限 (条) */
const MEASURE_CACHE_LIMIT = 500;

/** 测量接口失败后的熔断时长 (毫秒) */
const MEASURE_COOLDOWN_MS = 10_000;

/** 单次请求超时 (毫秒) */
const REQUEST_TIMEOUT_MS = 30_000;

export class SvgRenderService {
    private readonly baseUrl: string;
    private readonly measureCache = new Map<string, number>();
    private apiDownUntil = 0;

    constructor(baseUrl: string = RENDER_BASE_URL) {
        this.baseUrl = baseUrl;
    }

    /**
     * 调用 SVG 渲染插件接口
     * @returns 去除 data URI 前缀的 base64, 失败返回 null
     */
    async renderSvg(
        svgCode: string,
        saveWebImage = true,
    ): Promise<string | null> {
        const url = `${this.baseUrl}/plugin/napcat-plugin-svg-render/api/svg/render`;

        try {
            pluginState.logger.debug(
                `调用 svg-convert 渲染，SVG 长度: ${svgCode.length}`,
            );

            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    svg: svgCode,
                    saveWebImage,
                }),
                signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
            });

            const data = (await res.json()) as {
                code: number;
                data?: { imageBase64: string; format: string };
                message?: string;
            };

            if (data.code === 0 && data.data?.imageBase64) {
                pluginState.logger.debug('svg-convert 渲染成功');
                return data.data.imageBase64.replace(
                    /^data:image\/png;base64,/,
                    '',
                );
            }

            pluginState.logger.warn(
                `svg-convert 渲染失败: ${data.message || '未知错误'}`,
            );
            return null;
        } catch (e) {
            pluginState.logger.error(
                `svg-convert 渲染请求失败: ${e}`,
            );
            return null;
        }
    }

    /**
     * 测量单行文本宽度
     * 优先走渲染插件度量接口, 失败回退启发式估算
     * @returns 文本宽度 (px), 空文本返回 0
     */
    async calculateTextWidth(
        text: string,
        style: TextStyle = DEFAULT_TEXT_STYLE,
    ): Promise<number> {
        if (!text) return 0;

        const fontFamily = style.fontFamily ?? MEASURE_FONT_FAMILY;
        const cacheKey = buildCacheKey(text, style, fontFamily);

        const cached = this.measureCache.get(cacheKey);
        if (cached !== undefined) return cached;

        // 接口熔断期内直接走启发式, 避免连续失败请求
        if (Date.now() < this.apiDownUntil) {
            return estimateTextWidth(text, style.fontSize);
        }

        const url = `${this.baseUrl}/plugin/napcat-plugin-svg-render/api/char/width`;

        try {
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    text,
                    fontSize: style.fontSize,
                    fontFamily,
                    fontWeight: style.fontWeight,
                    fontStyle: style.fontStyle,
                }),
                signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
            });

            const result = (await res.json()) as {
                code: number;
                data?: { totalWidth: number };
                message?: string;
            };

            if (result.code === 0 && result.data) {
                this.apiDownUntil = 0;
                this.cacheMeasure(cacheKey, result.data.totalWidth);
                return result.data.totalWidth;
            }

            this.apiDownUntil = Date.now() + MEASURE_COOLDOWN_MS;
            pluginState.logger.warn(
                `文本测量失败，回退估算: ${result.message || '未知错误'}`,
            );
        } catch (e) {
            this.apiDownUntil = Date.now() + MEASURE_COOLDOWN_MS;
            pluginState.logger.warn(
                `文本测量请求失败，回退估算: ${e}`,
            );
        }

        return estimateTextWidth(text, style.fontSize);
    }

    /**
     * 将文本截断到指定宽度, 超出部分以省略号结尾
     */
    async truncateToWidth(
        text: string,
        maxWidth: number,
        style: TextStyle = DEFAULT_TEXT_STYLE,
    ): Promise<string> {
        if (!text || maxWidth <= 0) return '';
        if (
            (await this.calculateTextWidth(text, style)) <= maxWidth
        ) {
            return text;
        }

        const ellipsis = '…';
        let lo = 0;
        let hi = text.length;

        while (lo < hi) {
            const mid = Math.ceil((lo + hi) / 2);
            const candidate = text.slice(0, mid) + ellipsis;
            const width = await this.calculateTextWidth(
                candidate,
                style,
            );
            if (width <= maxWidth) {
                lo = mid;
            } else {
                hi = mid - 1;
            }
        }

        return lo <= 0 ? ellipsis : text.slice(0, lo) + ellipsis;
    }

    private cacheMeasure(key: string, width: number): void {
        if (this.measureCache.size >= MEASURE_CACHE_LIMIT) {
            const oldest = this.measureCache.keys().next().value;
            if (oldest !== undefined) {
                this.measureCache.delete(oldest);
            }
        }
        this.measureCache.set(key, width);
    }
}

function buildCacheKey(
    text: string,
    style: TextStyle,
    fontFamily: string,
): string {
    return [
        fontFamily,
        String(style.fontWeight ?? 400),
        style.fontStyle ?? 'normal',
        String(style.fontSize),
        text,
    ].join('|');
}

/**
 * 启发式宽度估算 (测量接口不可用时的回退)
 * 全角字符按 1 倍字号, 其余按 0.6 倍字号
 */
function estimateTextWidth(text: string, fontSize: number): number {
    if (!text || fontSize <= 0) return 0;

    let totalWidth = 0;
    for (const char of text) {
        totalWidth += fontSize * (isFullWidthChar(char) ? 1 : 0.6);
    }
    return totalWidth;
}

/**
 * 判断字符是否为全角字符
 */
function isFullWidthChar(char: string): boolean {
    const code = char.codePointAt(0) || 0;

    return (
        // CJK 统一表意文字及扩展区
        (code >= 0x4e00 && code <= 0x9fff) ||
        (code >= 0x3400 && code <= 0x4dbf) ||
        (code >= 0x20000 && code <= 0x2a6df) ||
        (code >= 0x2a700 && code <= 0x2b73f) ||
        (code >= 0x2b740 && code <= 0x2b81f) ||
        (code >= 0x2b820 && code <= 0x2ceaf) ||
        // 日文假名
        (code >= 0x3040 && code <= 0x309f) ||
        (code >= 0x30a0 && code <= 0x30ff) ||
        // 韩文音节
        (code >= 0xac00 && code <= 0xd7af) ||
        // 全角 ASCII 及标点
        (code >= 0xff00 && code <= 0xffef) ||
        // 其他常见全角标点
        (code >= 0x3000 && code <= 0x303f)
    );
}

export const svgRenderService = new SvgRenderService();
