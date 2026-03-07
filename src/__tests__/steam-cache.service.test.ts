import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock 外部依赖 — 必须在 import 被测模块之前
vi.mock('../core/state', () => ({
	pluginState: {
		loadDataFile: vi.fn().mockReturnValue({}),
		saveDataFile: vi.fn(),
		logger: {
			info: vi.fn(),
			warn: vi.fn(),
			error: vi.fn(),
			debug: vi.fn(),
		},
	},
}));

vi.mock('../services/game-name.service.js', () => ({
	gameNameService: {
		getFormattedGameName: vi.fn().mockResolvedValue('MockGameName'),
	},
}));

vi.mock('../utils/format', () => ({
	formatPlayTime: vi.fn().mockReturnValue('1小时30分钟'),
}));

import { steamCacheService } from '../services/steam-cache.service';
import type { SteamPlayerSummary } from '../services/steam.service';

// ==================== 测试数据工厂 ====================

function makePlayer(overrides: Partial<SteamPlayerSummary> & { steamid: string; personaname: string; personastate: number }): SteamPlayerSummary {
	return {
		profileurl: '',
		avatar: '',
		avatarmedium: '',
		avatarfull: '',
		communityvisibilitystate: 3,
		...overrides,
	} as SteamPlayerSummary;
}

function offlinePlayer(steamid = '123'): SteamPlayerSummary {
	return makePlayer({ steamid, personaname: 'TestUser', personastate: 0 });
}

function onlinePlayer(steamid = '123'): SteamPlayerSummary {
	return makePlayer({ steamid, personaname: 'TestUser', personastate: 1 });
}

function inGamePlayer(steamid = '123', game = 'Dota 2', gameid = '570'): SteamPlayerSummary {
	return makePlayer({ steamid, personaname: 'TestUser', personastate: 1, gameextrainfo: game, gameid });
}

function afkPlayer(steamid = '123', game = 'Dota 2', gameid = '570'): SteamPlayerSummary {
	return makePlayer({ steamid, personaname: 'TestUser', personastate: 3, gameextrainfo: game, gameid });
}

// ==================== 测试 ====================

describe('SteamCacheService', () => {
	beforeEach(() => {
		steamCacheService.clearCache();
	});

	describe('detectStatusChanges — 状态机', () => {
		it('首次查询不视为变化', () => {
			const changes = steamCacheService.detectStatusChanges([onlinePlayer()]);
			expect(changes).toHaveLength(0);
		});

		it('离线 → 在线（无游戏）= online', () => {
			steamCacheService.updateCacheBatch([offlinePlayer()]);
			const changes = steamCacheService.detectStatusChanges([onlinePlayer()]);
			expect(changes).toHaveLength(1);
			expect(changes[0].changeType).toBe('online');
		});

		it('在线（无游戏）→ 离线 = offline', () => {
			steamCacheService.updateCacheBatch([onlinePlayer()]);
			const changes = steamCacheService.detectStatusChanges([offlinePlayer()]);
			expect(changes).toHaveLength(1);
			expect(changes[0].changeType).toBe('offline');
		});

		it('在线 → 游戏中（state=1）= ingame', () => {
			steamCacheService.updateCacheBatch([onlinePlayer()]);
			const changes = steamCacheService.detectStatusChanges([inGamePlayer()]);
			expect(changes).toHaveLength(1);
			expect(changes[0].changeType).toBe('ingame');
		});

		it('游戏中 → 普通在线 = outgame', () => {
			steamCacheService.updateCacheBatch([inGamePlayer()]);
			const changes = steamCacheService.detectStatusChanges([onlinePlayer()]);
			expect(changes).toHaveLength(1);
			expect(changes[0].changeType).toBe('outgame');
		});

		it('游戏中 → 离线 = quitGame', () => {
			steamCacheService.updateCacheBatch([inGamePlayer()]);
			const changes = steamCacheService.detectStatusChanges([offlinePlayer()]);
			expect(changes).toHaveLength(1);
			expect(changes[0].changeType).toBe('quitGame');
		});

		it('游戏A → 游戏B = switchGame', () => {
			steamCacheService.updateCacheBatch([inGamePlayer('123', 'Dota 2', '570')]);
			const changes = steamCacheService.detectStatusChanges([inGamePlayer('123', 'CS2', '730')]);
			expect(changes).toHaveLength(1);
			expect(changes[0].changeType).toBe('switchGame');
		});

		it('游戏中（state=1）→ 挂机（state=3）= inAfk', () => {
			steamCacheService.updateCacheBatch([inGamePlayer()]);
			const changes = steamCacheService.detectStatusChanges([afkPlayer()]);
			expect(changes).toHaveLength(1);
			expect(changes[0].changeType).toBe('inAfk');
		});

		it('挂机（state=3）→ 游戏中（state=1）= outAfk', () => {
			steamCacheService.updateCacheBatch([afkPlayer()]);
			const changes = steamCacheService.detectStatusChanges([inGamePlayer()]);
			expect(changes).toHaveLength(1);
			expect(changes[0].changeType).toBe('outAfk');
		});

		it('离线 → 直接游戏中（state=1）= ingame', () => {
			steamCacheService.updateCacheBatch([offlinePlayer()]);
			const changes = steamCacheService.detectStatusChanges([inGamePlayer()]);
			expect(changes).toHaveLength(1);
			expect(changes[0].changeType).toBe('ingame');
		});

		it('离线 → 直接挂机（state=3）= inAfk', () => {
			steamCacheService.updateCacheBatch([offlinePlayer()]);
			const changes = steamCacheService.detectStatusChanges([afkPlayer()]);
			expect(changes).toHaveLength(1);
			expect(changes[0].changeType).toBe('inAfk');
		});

		it('状态相同不视为变化', () => {
			steamCacheService.updateCacheBatch([onlinePlayer()]);
			const changes = steamCacheService.detectStatusChanges([onlinePlayer()]);
			expect(changes).toHaveLength(0);
		});

		it('游戏中状态相同（同一游戏）不视为变化', () => {
			steamCacheService.updateCacheBatch([inGamePlayer()]);
			const changes = steamCacheService.detectStatusChanges([inGamePlayer()]);
			expect(changes).toHaveLength(0);
		});
	});

	describe('updateCacheItem — 缓存更新', () => {
		it('新用户玩游戏时应设置 gameStartTime', () => {
			steamCacheService.updateCacheItem('123', inGamePlayer());
			const cache = steamCacheService.getCurrentCache();
			expect(cache['123']).toBeDefined();
			expect(cache['123'].gameStartTime).toBeTypeOf('number');
			expect(cache['123'].gameextrainfo).toBe('Dota 2');
		});

		it('新用户不玩游戏时 gameStartTime 应为 undefined', () => {
			steamCacheService.updateCacheItem('123', onlinePlayer());
			const cache = steamCacheService.getCurrentCache();
			expect(cache['123'].gameStartTime).toBeUndefined();
		});

		it('同一游戏应保持原 gameStartTime', () => {
			steamCacheService.updateCacheItem('123', inGamePlayer());
			const cache1 = steamCacheService.getCurrentCache();
			const originalStartTime = cache1['123'].gameStartTime;

			steamCacheService.updateCacheItem('123', inGamePlayer());
			const cache2 = steamCacheService.getCurrentCache();
			expect(cache2['123'].gameStartTime).toBe(originalStartTime);
		});

		it('换游戏应更新 gameStartTime', () => {
			const dateNowSpy = vi.spyOn(Date, 'now');
			dateNowSpy.mockReturnValue(1000000);
			steamCacheService.updateCacheItem('123', inGamePlayer('123', 'Dota 2', '570'));
			const cache1 = steamCacheService.getCurrentCache();
			const originalStartTime = cache1['123'].gameStartTime;

			dateNowSpy.mockReturnValue(2000000);
			steamCacheService.updateCacheItem('123', inGamePlayer('123', 'CS2', '730'));
			const cache2 = steamCacheService.getCurrentCache();
			expect(cache2['123'].gameStartTime).not.toBe(originalStartTime);
			expect(cache2['123'].gameextrainfo).toBe('CS2');
			dateNowSpy.mockRestore();
		});

		it('从游戏中变为不玩游戏时 gameStartTime 应为 undefined', () => {
			steamCacheService.updateCacheItem('123', inGamePlayer());
			steamCacheService.updateCacheItem('123', onlinePlayer());
			const cache = steamCacheService.getCurrentCache();
			expect(cache['123'].gameStartTime).toBeUndefined();
		});
	});

	describe('updateCacheBatch — 批量更新', () => {
		it('应正确批量更新多个玩家', () => {
			const players = [
				inGamePlayer('111', 'Dota 2', '570'),
				onlinePlayer('222'),
				afkPlayer('333', 'CS2', '730'),
			];
			steamCacheService.updateCacheBatch(players);
			const cache = steamCacheService.getCurrentCache();

			expect(cache['111'].gameextrainfo).toBe('Dota 2');
			expect(cache['111'].gameStartTime).toBeTypeOf('number');
			expect(cache['222'].gameStartTime).toBeUndefined();
			expect(cache['333'].gameextrainfo).toBe('CS2');
			expect(cache['333'].gameStartTime).toBeTypeOf('number');
		});
	});

	describe('detectStatusChanges — 集成测试', () => {
		it('应同时检测多个玩家的不同状态变化', () => {
			steamCacheService.updateCacheBatch([
				offlinePlayer('111'),
				onlinePlayer('222'),
				inGamePlayer('333', 'Dota 2', '570'),
			]);

			const changes = steamCacheService.detectStatusChanges([
				onlinePlayer('111'),
				offlinePlayer('222'),
				inGamePlayer('333', 'CS2', '730'),
			]);

			expect(changes).toHaveLength(3);
			const changeMap = new Map(changes.map(c => [c.steamId, c.changeType]));
			expect(changeMap.get('111')).toBe('online');
			expect(changeMap.get('222')).toBe('offline');
			expect(changeMap.get('333')).toBe('switchGame');
		});

		it('混合首次查询和状态变化 — 首次查询不计入', () => {
			steamCacheService.updateCacheBatch([offlinePlayer('111')]);

			const changes = steamCacheService.detectStatusChanges([
				onlinePlayer('111'),
				onlinePlayer('222'),
			]);

			expect(changes).toHaveLength(1);
			expect(changes[0].steamId).toBe('111');
			expect(changes[0].changeType).toBe('online');
		});

		it('全部无变化时应返回空数组', () => {
			steamCacheService.updateCacheBatch([
				onlinePlayer('111'),
				offlinePlayer('222'),
			]);

			const changes = steamCacheService.detectStatusChanges([
				onlinePlayer('111'),
				offlinePlayer('222'),
			]);

			expect(changes).toHaveLength(0);
		});
	});
});
