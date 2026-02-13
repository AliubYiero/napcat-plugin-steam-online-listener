/**
 * steam-reset指令处理器
 * 处理 #steam-reset 指令，清空当前群组的steam绑定数据
 */

import type { OB11Message } from 'napcat-types/napcat-onebot';
import type {
	NapCatPluginContext,
} from 'napcat-types/napcat-onebot/network/plugin/types';
import { sendReply, getCooldownRemaining, setCooldown } from './utils';
import { removeSteamBindItemFrom } from './steam-utils';
import { pluginState } from '../core/state';

/**
 * 处理 steam-reset 指令
 */
export async function handleSteamReset( ctx: NapCatPluginContext, event: OB11Message, args: string[] ): Promise<void> {
	const messageType = event.message_type;
	const groupId = event.group_id;
	
	// 群消息检查 CD
	if ( messageType === 'group' && groupId ) {
		const remaining = getCooldownRemaining( groupId, 'steam-reset' );
		if ( remaining > 0 ) {
			await sendReply( ctx, event, `请等待 ${ remaining } 秒后再试` );
			return;
		}
	}
	
	try {
		// 获取当前来源ID和类型
		const currentFromId = event.message_type === 'group' ? String( event.group_id ) : String( event.user_id );
		const currentFromType: 'private' | 'group' = event.message_type;
		
		// 从绑定数据中移除当前来源的数据
		removeSteamBindItemFrom( currentFromId, currentFromType );
		
		await sendReply( ctx, event, `已清空当前${ currentFromType === 'private' ? '用户' : '群组' }的steam绑定数据` );
		pluginState.incrementProcessed();
	}
	catch ( error: any ) {
		pluginState.logger.error( '清空Steam绑定数据时出错:', error );
		await sendReply( ctx, event, `清空失败: ${ error.message }` );
	}
	
	if ( messageType === 'group' && groupId ) setCooldown( groupId, 'steam-reset' );
}
