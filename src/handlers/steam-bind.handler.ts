/**
 * steam-bind指令处理器
 * 处理 #steam-bind 指令
 */

import type { OB11Message } from 'napcat-types/napcat-onebot';
import type {
	NapCatPluginContext,
} from 'napcat-types/napcat-onebot/network/plugin/types';
import { sendReply, getCooldownRemaining, setCooldown } from './utils';
import { steamBindService } from '../services/steam-bind.service';
import type { SteamBindItem } from '../types';
import { pluginState } from '../core/state';
import { steamService } from '../services/steam.service';
import { steamPollingService } from '../services/steam-polling.service';

/**
 * 验证 Steam ID 是否为纯数字格式
 */
function isValidSteamId64( steamId: string ): boolean {
	return /^\d+$/.test( steamId );
}

/**
 * 处理 steam-bind 指令
 */
export async function handleSteamBind( ctx: NapCatPluginContext, event: OB11Message, args: string[] ): Promise<void> {
	const messageType = event.message_type;
	const groupId = event.group_id;
	
	// 群消息检查 CD
	if ( messageType === 'group' && groupId ) {
		const remaining = getCooldownRemaining( groupId, 'steam-bind' );
		if ( remaining > 0 ) {
			await sendReply( ctx, event, `请等待 ${ remaining } 秒后再试` );
			return;
		}
	}
	
	if ( args.length < 2 ) {
		await sendReply( ctx, event, '用法: #steam-bind <steam-id> [自定义用户昵称]' );
		return;
	}
	
	try {
		let steamId = args[ 1 ];
		const nickname = args.length > 2 ? args[ 2 ] : undefined;
		
		// 验证 Steam ID 格式：如果不是纯数字，尝试解析为自定义 ID
		if ( !isValidSteamId64( steamId ) ) {
			pluginState.logger.debug( `Steam ID 不是纯数字格式，尝试解析为自定义 ID: ${ steamId }` );
			const resolvedId = await steamService.getSteamID64( steamId );
			if ( !resolvedId ) {
				await sendReply( ctx, event, `Steam ID 格式无效，请输入有效的 Steam ID64（纯数字）或自定义 ID` );
				return;
			}
			steamId = resolvedId;
		}
		
		// 验证用户是否存在
		let playerSummary = await steamService.getPlayerSummary( steamId );
		// 二次验证用户是否存在
		if ( !playerSummary ) {
			const playSteamId = await steamService.getSteamID64( steamId );
			pluginState.logger.debug( `进行二次验证`, playSteamId );
			if ( playSteamId ) {
				playerSummary = await steamService.getPlayerSummary( playSteamId );
				steamId = playSteamId;
			}
		}
		
		if ( !playerSummary ) {
			await sendReply( ctx, event, `无法找到 Steam 用户: ${ steamId }，请检查 Steam ID 是否正确。` );
			return;
		}
		
		// 查找现有的绑定项
		let bindItem = steamBindService.findBySteamId( steamId );
		if ( !bindItem ) {
			// 如果不存在，创建新的绑定项
			bindItem = {
				steamId: steamId,
				personName: playerSummary?.personaname, // 存储 Steam 用户的昵称
				face: playerSummary?.avatarmedium, // 存储用户头像链接
				from: [ {
					id: messageType === 'group' ? String( groupId ) : String( event.user_id ),
					type: messageType,
					nickname: nickname || undefined,
				} ],
			};
		}
		else {
			// 如果已存在，添加新的来源信息或更新现有来源的昵称
			const newFromInfo = {
				id: messageType === 'group' ? String( groupId ) : String( event.user_id ),
				type: messageType,
				nickname: nickname || undefined,
			};
			
			// 检查是否已存在相同的来源
			const existingIndex = bindItem.from?.findIndex(
				fromInfo => fromInfo.id === newFromInfo.id && fromInfo.type === newFromInfo.type,
			);
			
			if ( existingIndex !== undefined && existingIndex !== -1 ) {
				// 如果来源已存在，更新该来源的昵称
				bindItem.from![existingIndex] = { ...bindItem.from![existingIndex], ...newFromInfo };
			} else {
				// 如果来源不存在，则添加
				if ( !bindItem.from ) {
					bindItem.from = [];
				}
				bindItem.from.push( newFromInfo );
			}
			
			// 更新头像信息和昵称，以防用户更改了头像或昵称
			if (playerSummary?.avatarmedium) {
				bindItem.face = playerSummary.avatarmedium;
			}
			if (playerSummary?.personaname) {
				bindItem.personName = playerSummary.personaname;
			}
		}
		
		// 更新绑定数据
		steamBindService.update( bindItem );
		
		// 绑定完成后手动触发一次状态查询
		try {
			await steamPollingService.pollSteamStatuses();
			pluginState.logger.debug( `绑定完成后手动触发状态查询成功` );
		} catch ( error ) {
			pluginState.logger.warn( `绑定完成后状态查询失败:`, error );
			// 不影响绑定成功的提示，静默处理错误
		}
		
		await sendReply( ctx, event, `成功绑定 Steam 用户: ${ playerSummary.personaname } (ID: ${ steamId })${ nickname ? `，昵称: ${ nickname }` : '' }` );
		pluginState.incrementProcessed();
	}
	catch ( error: any ) {
		pluginState.logger.error( '绑定 Steam 数据时出错:', error );
		await sendReply( ctx, event, `绑定失败: ${ error.message }` );
	}
	
	if ( messageType === 'group' && groupId ) setCooldown( groupId, 'steam-bind' );
}
