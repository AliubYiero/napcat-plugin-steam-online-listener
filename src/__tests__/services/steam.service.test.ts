import { describe, it, expect, vi, beforeEach } from 'vitest';
import { steamService } from '../../services/steam.service';
import { pluginStateStub } from '../helpers/plugin-state-mock';

function mockFetchJson(payload: unknown, init: { ok?: boolean; status?: number; statusText?: string } = {}) {
	const fn = vi.fn().mockResolvedValue({
		ok: init.ok ?? true,
		status: init.status ?? 200,
		statusText: init.statusText ?? 'OK',
		json: async () => payload,
	});
	vi.stubGlobal('fetch', fn);
	return fn;
}

describe('SteamService — 状态格式化（纯方法）', () => {
	it('formatPlayerState 覆盖全部状态码', () => {
		expect(steamService.formatPlayerState(0)).toBe('离线');
		expect(steamService.formatPlayerState(1)).toBe('在线');
		expect(steamService.formatPlayerState(2)).toBe('忙碌');
		expect(steamService.formatPlayerState(3)).toBe('离开');
		expect(steamService.formatPlayerState(4)).toBe('休眠');
		expect(steamService.formatPlayerState(5)).toBe('寻求交易');
		expect(steamService.formatPlayerState(6)).toBe('寻求游戏');
		expect(steamService.formatPlayerState(99)).toBe('未知状态');
	});

	it('formatVisibilityState', () => {
		expect(steamService.formatVisibilityState(1)).toBe('不可见');
		expect(steamService.formatVisibilityState(3)).toBe('公开');
		expect(steamService.formatVisibilityState(2)).toBe('未知状态 (2)');
	});
});

describe('SteamService — API 调用', () => {
	beforeEach(() => {
		pluginStateStub.config.steamApiKey = 'TEST_KEY';
	});

	describe('getPlayerSummaries', () => {
		it('成功解析玩家列表', async () => {
			mockFetchJson({ response: { players: [{ steamid: '1', personaname: 'A', personastate: 1 }] } });
			const players = await steamService.getPlayerSummaries(['1', '2']);
			expect(players).toHaveLength(1);
			expect(players[0].steamid).toBe('1');
		});

		it('未配置 API Key 抛错', async () => {
			pluginStateStub.config.steamApiKey = '';
			await expect(steamService.getPlayerSummaries('1')).rejects.toThrow('请求 Steam API 时发生错误');
		});

		it('HTTP 401 映射为无权限错误', async () => {
			mockFetchJson({}, { ok: false, status: 401, statusText: 'Unauthorized' });
			await expect(steamService.getPlayerSummaries('1')).rejects.toThrow('Steam API Key 无效或无权限访问');
		});

		it('网络异常映射为连接失败', async () => {
			vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));
			await expect(steamService.getPlayerSummaries('1')).rejects.toThrow('无法连接到 Steam API 服务器');
		});
	});

	describe('getPlayerSummary', () => {
		it('返回首个玩家', async () => {
			mockFetchJson({ response: { players: [{ steamid: '1', personaname: 'A', personastate: 1 }] } });
			await expect(steamService.getPlayerSummary('1')).resolves.toMatchObject({ steamid: '1' });
		});

		it('列表为空返回 null', async () => {
			mockFetchJson({ response: { players: [] } });
			await expect(steamService.getPlayerSummary('1')).resolves.toBeNull();
		});

		it('底层抛错时吞掉异常返回 null', async () => {
			pluginStateStub.config.steamApiKey = '';
			await expect(steamService.getPlayerSummary('1')).resolves.toBeNull();
		});
	});

	describe('getSteamID64', () => {
		it('success=1 时返回 steamid', async () => {
			mockFetchJson({ response: { success: 1, steamid: '76561198000000000' } });
			await expect(steamService.getSteamID64('vanity')).resolves.toBe('76561198000000000');
		});

		it('success=0 时返回 null', async () => {
			mockFetchJson({ response: { success: 0, message: 'no match' } });
			await expect(steamService.getSteamID64('vanity')).resolves.toBeNull();
		});

		it('未配置 API Key 抛错', async () => {
			pluginStateStub.config.steamApiKey = '';
			await expect(steamService.getSteamID64('vanity')).rejects.toThrow('请求Steam API时发生错误');
		});

		it('HTTP 403 映射为无权限错误', async () => {
			mockFetchJson({}, { ok: false, status: 403, statusText: 'Forbidden' });
			await expect(steamService.getSteamID64('vanity')).rejects.toThrow('Steam API Key 无效或无权限访问');
		});
	});

	describe('validateApiKey', () => {
		it('未配置 Key 返回 false', async () => {
			pluginStateStub.config.steamApiKey = '';
			await expect(steamService.validateApiKey()).resolves.toBe(false);
		});

		it('能拉到玩家返回 true', async () => {
			mockFetchJson({ response: { players: [{ steamid: '1', personaname: 'A', personastate: 1 }] } });
			await expect(steamService.validateApiKey()).resolves.toBe(true);
		});

		it('请求失败返回 false', async () => {
			vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));
			await expect(steamService.validateApiKey()).resolves.toBe(false);
		});
	});
});
