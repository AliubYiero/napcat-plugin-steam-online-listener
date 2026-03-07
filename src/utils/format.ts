/**
 * 格式化工具函数模块
 */

/**
 * 将游戏开始时间戳转换为可读的游玩时长字符串
 * @param gameStartTime 游戏开始时间戳（毫秒）
 * @returns 格式化的时长字符串，如 "1小时30分钟20秒"
 */
export function formatPlayTime(gameStartTime: number): string {
	const playTimeMs = Date.now() - gameStartTime;
	const playTimeMinutes = Math.floor(playTimeMs / 60000);
	const playTimeHours = Math.floor(playTimeMinutes / 60);
	const playTimeSeconds = Math.floor((playTimeMs % 60000) / 1000);

	let playTimeStr = '';
	if (playTimeHours > 0) {
		playTimeStr += `${playTimeHours}小时`;
	}
	if (playTimeMinutes % 60 > 0) {
		playTimeStr += `${playTimeMinutes % 60}分钟`;
	}
	if (playTimeSeconds > 0 || playTimeStr === '') {
		playTimeStr += `${playTimeSeconds}秒`;
	}

	return playTimeStr;
}

/**
 * 中国标准时间（Asia/Shanghai）日期各部分的字符串表示
 */
export interface ChinaDateParts {
	year: string;
	month: string;
	day: string;
	hour: string;
	minute: string;
	second: string;
}

const chinaFormatter = new Intl.DateTimeFormat('zh-CN', {
	timeZone: 'Asia/Shanghai',
	year: 'numeric',
	month: '2-digit',
	day: '2-digit',
	hour: '2-digit',
	minute: '2-digit',
	second: '2-digit',
	hour12: false,
});

/**
 * 将日期转换为中国标准时间（Asia/Shanghai）的各部分字符串
 * @param date 要转换的日期，默认为当前时间
 * @returns 包含年、月、日、时、分、秒的字符串对象
 */
export function getChinaDateParts(date?: Date): ChinaDateParts {
	const map = new Map(
		chinaFormatter.formatToParts(date ?? new Date())
			.filter(p => p.type !== 'literal')
			.map(p => [p.type, p.value] as const),
	);
	return {
		year: map.get('year')!,
		month: map.get('month')!,
		day: map.get('day')!,
		hour: map.get('hour')!,
		minute: map.get('minute')!,
		second: map.get('second')!,
	};
}
