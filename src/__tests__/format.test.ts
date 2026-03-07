import { describe, it, expect, vi, afterEach } from 'vitest';
import { formatPlayTime } from '../utils/format';

describe('formatPlayTime', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('应返回 "0秒" 当游玩时间为 0', () => {
		const now = Date.now();
		vi.spyOn(Date, 'now').mockReturnValue(now);
		expect(formatPlayTime(now)).toBe('0秒');
	});

	it('应正确格式化纯秒数', () => {
		const now = 1000000;
		vi.spyOn(Date, 'now').mockReturnValue(now);
		expect(formatPlayTime(now - 45000)).toBe('45秒');
	});

	it('应正确格式化分钟+秒', () => {
		const now = 1000000;
		vi.spyOn(Date, 'now').mockReturnValue(now);
		expect(formatPlayTime(now - 330000)).toBe('5分钟30秒');
	});

	it('应正确格式化整分钟（无秒数）', () => {
		const now = 1000000;
		vi.spyOn(Date, 'now').mockReturnValue(now);
		expect(formatPlayTime(now - 300000)).toBe('5分钟');
	});

	it('应正确格式化小时+分钟+秒', () => {
		const now = 10000000;
		vi.spyOn(Date, 'now').mockReturnValue(now);
		expect(formatPlayTime(now - 5420000)).toBe('1小时30分钟20秒');
	});

	it('应正确格式化整小时（无分钟和秒）', () => {
		const now = 10000000;
		vi.spyOn(Date, 'now').mockReturnValue(now);
		// playTimeMinutes=120 > 0, 所以会输出 "0分钟"
		expect(formatPlayTime(now - 7200000)).toBe('2小时0分钟');
	});

	it('应正确格式化小时+秒（无分钟）', () => {
		const now = 10000000;
		vi.spyOn(Date, 'now').mockReturnValue(now);
		// playTimeMinutes=60 > 0, 所以会输出 "0分钟"
		expect(formatPlayTime(now - 3610000)).toBe('1小时0分钟10秒');
	});
});
