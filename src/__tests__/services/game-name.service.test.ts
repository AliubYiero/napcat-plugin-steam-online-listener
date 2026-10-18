import { describe, it, expect, vi } from 'vitest';
import { gameNameService } from '../../services/game-name.service';

/** 预置一条 en/zh 记录（zh 省略表示仅英文名） */
function seed(appid: string, en: string, zh?: string): void {
	gameNameService.setGameName(appid, en);
	if (zh !== undefined) gameNameService.updateChineseName(appid, zh);
}

describe('GameNameService — 格式化规则', () => {
	it('未知名且未提供 enName 返回 null', async () => {
		await expect(gameNameService.getFormattedGameName('unknown-appid')).resolves.toBeNull();
	});

	it('无中文名时返回英文名', async () => {
		seed('n1', 'Terraria');
		await expect(gameNameService.getFormattedGameName('n1')).resolves.toBe('Terraria');
	});

	it('中文名等于英文名时返回英文名', async () => {
		seed('e1', 'Portal', 'Portal');
		await expect(gameNameService.getFormattedGameName('e1')).resolves.toBe('Portal');
	});

	it('中文名包含英文名时返回中文名', async () => {
		seed('i1', 'Team Fortress', 'Team Fortress 2 中文');
		await expect(gameNameService.getFormattedGameName('i1')).resolves.toBe('Team Fortress 2 中文');
	});

	it('英文名包含中文名时返回英文名', async () => {
		seed('c1', 'Counter-Strike 2', 'Counter');
		await expect(gameNameService.getFormattedGameName('c1')).resolves.toBe('Counter-Strike 2');
	});

	it('其它情况返回 "英文名 / 中文名"', async () => {
		seed('r1', 'Stardew Valley', '星露谷物语');
		await expect(gameNameService.getFormattedGameName('r1')).resolves.toBe('Stardew Valley / 星露谷物语');
	});

	it('传入 enName 时会创建新记录', async () => {
		await expect(gameNameService.getFormattedGameName('g1', 'Hades')).resolves.toBe('Hades');
		expect(gameNameService.getAllGames().find(g => g.appid === 'g1')).toMatchObject({ en: 'Hades' });
	});
});

describe('GameNameService — 记录管理', () => {
	it('setGameName 空参数不创建记录', () => {
		gameNameService.setGameName('', 'X');
		gameNameService.setGameName('s1', '');
		expect(gameNameService.getAllGames().some(g => g.en === 'X')).toBe(false);
		expect(gameNameService.getAllGames().some(g => g.appid === 's1')).toBe(false);
	});

	it('setGameName 更新已有英文名', () => {
		seed('u1', 'Old Name');
		gameNameService.setGameName('u1', 'New Name');
		expect(gameNameService.getAllGames().find(g => g.appid === 'u1')?.en).toBe('New Name');
	});

	it('updateChineseName 不存在的游戏返回 false', () => {
		expect(gameNameService.updateChineseName('nope', '中文')).toBe(false);
	});

	it('updateChineseName 成功返回 true', () => {
		seed('z1', 'Zelda');
		expect(gameNameService.updateChineseName('z1', '塞尔达')).toBe(true);
		expect(gameNameService.getAllGames().find(g => g.appid === 'z1')?.zh).toBe('塞尔达');
	});

	it('deleteGame 存在返回 true 且移除，不存在返回 false', () => {
		seed('d1', 'Doom');
		expect(gameNameService.deleteGame('d1')).toBe(true);
		expect(gameNameService.getAllGames().some(g => g.appid === 'd1')).toBe(false);
		expect(gameNameService.deleteGame('d1')).toBe(false);
	});
});

describe('GameNameService — 中文名拉取', () => {
	it('fetch 成功后写入中文名', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({ '777': { success: true, data: { name: '半条命' } } }),
			}),
		);

		gameNameService.setGameName('777', 'Half-Life');

		await vi.waitFor(() => {
			expect(gameNameService.getAllGames().find(g => g.appid === '777')?.zh).toBe('半条命');
		});
	});

	it('fetch 失败时静默降级，不写入中文名', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500, statusText: 'err' }));

		gameNameService.setGameName('778', 'Half-Life 2');
		// 等待潜在的异步任务结束
		await new Promise(r => setTimeout(r, 0));

		expect(gameNameService.getAllGames().find(g => g.appid === '778')?.zh).toBeUndefined();
	});
});
