/**
 * 轮询调度延迟工厂
 *
 * 为特殊间隔 (10/15/30/60 秒) 生成"对齐墙钟边界"的延迟计算函数,
 * 其余间隔返回固定延迟。策略在工厂创建时一次性选定, 避免每轮轮询重复判断。
 */

/** 走墙钟对齐的特殊轮询间隔（秒） */
export const ALIGNED_INTERVALS = new Set([10, 15, 30, 60]);

/**
 * 判断给定间隔（秒）是否走墙钟对齐
 * @param intervalSeconds 轮询间隔（秒）
 */
export function isAlignedInterval(intervalSeconds: number): boolean {
    return ALIGNED_INTERVALS.has(intervalSeconds);
}

/**
 * 创建"下一次轮询延迟(ms)"计算函数
 *
 * - 对齐间隔: 返回至下一个墙钟边界的时间
 *   (如 10s → 0/10/20... 秒; 60s → 整分钟)
 * - 其余间隔: 返回固定间隔
 *
 * @param intervalSeconds 轮询间隔（秒）
 * @returns 每次调用返回下一次轮询的延迟毫秒数;
 *          可传入 `nowMs` 覆盖当前时间以便测试
 */
export function createNextDelay(
    intervalSeconds: number,
): (nowMs?: number) => number {
    if (!isAlignedInterval(intervalSeconds)) {
        const fixedDelay = intervalSeconds * 1000;
        return () => fixedDelay;
    }

    const intervalMs = intervalSeconds * 1000;
    return (nowMs: number = Date.now()) => {
        const remainder = nowMs % intervalMs;
        // 整除时返回完整间隔, 避免 0 延迟导致立即连跑
        return remainder === 0 ? intervalMs : intervalMs - remainder;
    };
}
