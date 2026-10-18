/**
 * Steam 玩家摘要测试数据工厂
 * 从 `steam-cache.service.test.ts` 抽取，供多处复用。
 */

import type { SteamPlayerSummary } from '../../services/steam.service';

/** 构造最小 SteamPlayerSummary 测试数据 */
export function makePlayer(
	overrides: Partial<SteamPlayerSummary> & { steamid: string; personaname: string; personastate: number },
): SteamPlayerSummary {
	return {
		profileurl: '',
		avatar: '',
		avatarmedium: '',
		avatarfull: '',
		communityvisibilitystate: 3,
		...overrides,
	} as SteamPlayerSummary;
}

/** 离线玩家 */
export function offlinePlayer(steamid = '123'): SteamPlayerSummary {
	return makePlayer({ steamid, personaname: 'TestUser', personastate: 0 });
}

/** 在线玩家（无游戏） */
export function onlinePlayer(steamid = '123'): SteamPlayerSummary {
	return makePlayer({ steamid, personaname: 'TestUser', personastate: 1 });
}

/** 游戏中玩家（state=1） */
export function inGamePlayer(steamid = '123', game = 'Dota 2', gameid = '570'): SteamPlayerSummary {
	return makePlayer({ steamid, personaname: 'TestUser', personastate: 1, gameextrainfo: game, gameid });
}

/** 挂机中玩家（state=3，有游戏） */
export function afkPlayer(steamid = '123', game = 'Dota 2', gameid = '570'): SteamPlayerSummary {
	return makePlayer({ steamid, personaname: 'TestUser', personastate: 3, gameextrainfo: game, gameid });
}
