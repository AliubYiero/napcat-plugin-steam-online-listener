/**
 * 时间控制工具
 * 统一封装 vitest 的时间伪造，避免各测试重复书写。
 */

import { vi } from 'vitest';

/** 冻结 `Date.now()` 到指定时间戳（毫秒） */
export function freezeDateNow(value: number): void {
    vi.spyOn(Date, 'now').mockReturnValue(value);
}

/** 冻结系统时间：`new Date()` / `Date.now()` 均返回指定时间 */
export function freezeSystemTime(value: Date | number): void {
    vi.useFakeTimers();
    vi.setSystemTime(value);
}

/** 恢复真实时间 */
export function unfreezeSystemTime(): void {
    vi.useRealTimers();
}
