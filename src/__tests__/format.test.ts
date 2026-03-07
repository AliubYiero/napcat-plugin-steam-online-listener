import { describe, it, expect, vi, afterEach } from 'vitest';
import { formatPlayTime, getChinaDateParts } from '../utils/format';

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
		expect(formatPlayTime(now - 7200000)).toBe('2小时');
	});

	it('应正确格式化小时+秒（无分钟）', () => {
		const now = 10000000;
		vi.spyOn(Date, 'now').mockReturnValue(now);
		expect(formatPlayTime(now - 3610000)).toBe('1小时10秒');
	});
});

describe('getChinaDateParts', () => {
	it('应返回正确的结构化日期部分', () => {
		// 2026-03-07 14:30:00 UTC = 2026-03-07 22:30:00 UTC+8
		const date = new Date('2026-03-07T14:30:00Z');
		const parts = getChinaDateParts(date);

		expect(parts.year).toBe('2026');
		expect(parts.month).toBe('03');
		expect(parts.day).toBe('07');
		expect(parts.hour).toBe('22');
		expect(parts.minute).toBe('30');
		expect(parts.second).toBe('00');
	});

	it('应正确处理跨日（UTC 当日但中国时区已是次日）', () => {
		// 2026-03-07 16:30:00 UTC = 2026-03-08 00:30:00 UTC+8
		const date = new Date('2026-03-07T16:30:00Z');
		const parts = getChinaDateParts(date);

		expect(parts.year).toBe('2026');
		expect(parts.month).toBe('03');
		expect(parts.day).toBe('08');
		expect(parts.hour).toBe('00');
		expect(parts.minute).toBe('30');
		expect(parts.second).toBe('00');
	});

	it('应在不传参时使用当前时间', () => {
		const parts = getChinaDateParts();
		expect(parts).toHaveProperty('year');
		expect(parts).toHaveProperty('month');
		expect(parts).toHaveProperty('day');
		expect(parts).toHaveProperty('hour');
		expect(parts).toHaveProperty('minute');
		expect(parts).toHaveProperty('second');
		expect(parts.month).toMatch(/^\d{2}$/);
		expect(parts.day).toMatch(/^\d{2}$/);
		expect(parts.hour).toMatch(/^\d{2}$/);
		expect(parts.minute).toMatch(/^\d{2}$/);
		expect(parts.second).toMatch(/^\d{2}$/);
	});
});
