import { describe, it, expect, afterEach } from 'vitest';
import { calculateReportRange } from '../../handlers/steam-report.handler';
import { freezeSystemTime, unfreezeSystemTime } from '../helpers/time';

describe('calculateReportRange', () => {
	afterEach(() => {
		unfreezeSystemTime();
	});

	it('today：返回中国时区今日日期与当前时间戳', () => {
		freezeSystemTime(new Date('2026-03-07T14:30:00Z')); // 中国 2026-03-07 22:30

		const range = calculateReportRange('today');

		expect(range.dateStr).toBe('2026-3-7');
		expect(range.endTime).toBe(Date.parse('2026-03-07T14:30:00Z'));
		expect(range.dateLabel).toBe('今日');
	});

	it('yesterday：返回昨日日期与今日 0 点（中国时区）时间戳', () => {
		const nowMs = Date.parse('2026-03-07T14:30:00Z'); // 中国 2026-03-07 22:30
		freezeSystemTime(nowMs);

		const range = calculateReportRange('yesterday');

		expect(range.dateStr).toBe('2026-3-6');
		expect(range.endTime).toBe(Date.UTC(2026, 2, 7) - 8 * 3600 * 1000);
		expect(range.dateLabel).toBe('昨日');
	});

	it('穿梭中国时区跨月边界', () => {
		freezeSystemTime(new Date('2026-04-01T02:00:00Z')); // 中国 2026-04-01 10:00

		expect(calculateReportRange('today').dateStr).toBe('2026-4-1');
		expect(calculateReportRange('yesterday').dateStr).toBe('2026-3-31');
	});

	it('UTC 当日但中国时区已跨日的 yesterday 计算', () => {
		// 2026-03-08 00:30 中国 = 2026-03-07 16:30 UTC
		freezeSystemTime(new Date('2026-03-07T16:30:00Z'));

		expect(calculateReportRange('today').dateStr).toBe('2026-3-8');
		expect(calculateReportRange('yesterday').dateStr).toBe('2026-3-7');
	});
});
