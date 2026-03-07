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
	if (playTimeMinutes > 0) {
		playTimeStr += `${playTimeMinutes % 60}分钟`;
	}
	if (playTimeSeconds > 0 || playTimeStr === '') {
		playTimeStr += `${playTimeSeconds}秒`;
	}

	return playTimeStr;
}
