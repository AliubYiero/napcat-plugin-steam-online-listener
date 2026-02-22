/**
 * Steam 轮询服务模块
 * 实现定时轮询 Steam 用户状态变化的功能
 */

import { pluginState } from '../core/state';
import { steamService } from './steam.service';
import {
	steamCacheService,
	type StatusChanges,
	StatusChange,
} from './steam-cache.service';
import {
	sendGroupMessage,
	sendPrivateMessage,
} from '../handlers/utils';
import type { SteamBindItem } from '../types';

// ==================== 轮询服务类 ====================

class SteamPollingService {
	private pollingTimer: NodeJS.Timeout | null = null;
	private isPollingActive = false;
	
	/**
	 * 获取当前轮询间隔（毫秒）
	 */
	private getPollingInterval(): number {
		// 限制轮询间隔范围：最小1秒，最大1小时（3600秒）
		const intervalSeconds = Math.min(
			3600, // 最大1小时
			Math.max( 1, pluginState.config.pollingIntervalSeconds || 60 )
		);
		return intervalSeconds * 1000;
	}
	
	/**
	 * 启动轮询服务
	 */
	startPolling(): void {
		if ( this.isPollingActive ) {
			pluginState.logger.warn( 'Steam 轮询服务已在运行中' );
			return;
		}
		
		// 前置验证，避免状态混乱
		if ( !pluginState.config.steamApiKey ) {
			pluginState.logger.warn( '未配置 Steam API Key，无法启动 Steam 轮询服务' );
			return;
		}
		
		// 先标记为正在启动状态，防止重复启动
		this.isPollingActive = true;
		
		// 验证 API Key 是否有效
		steamService.validateApiKey().then( isValid => {
			if ( !isValid ) {
				this.isPollingActive = false;
				pluginState.logger.warn( 'Steam API Key 无效，无法启动 Steam 轮询服务' );
				return;
			}
			
			// 启动定时轮询
			const interval = this.getPollingInterval();
			this.pollingTimer = setInterval( () => {
				this.pollSteamStatuses();
			}, interval );
			
			// 将定时器注册到 pluginState 以便在插件清理时自动清理
			pluginState.timers.set( 'steam-polling', this.pollingTimer );
			
			pluginState.logger.info( `Steam 轮询服务已启动，每 ${ interval / 1000 } 秒检查一次状态变化` );
		} ).catch( error => {
			this.isPollingActive = false;
			pluginState.logger.error( '验证 Steam API Key 时出错:', error );
		} );
	}
	
	/**
	 * 停止轮询服务
	 */
	stopPolling(): void {
		if ( !this.isPollingActive ) {
			pluginState.logger.warn( 'Steam 轮询服务未运行' );
			return;
		}
		
		if ( this.pollingTimer ) {
			clearInterval( this.pollingTimer );
			pluginState.timers.delete( 'steam-polling' );
			this.pollingTimer = null;
		}
		
		this.isPollingActive = false;
		pluginState.logger.info( 'Steam 轮询服务已停止' );
	}
	
	/**
	 * 执行一次 Steam 状态轮询
	 */
	async pollSteamStatuses(): Promise<void> {
		try {
			pluginState.logger.debug( '开始执行 Steam 状态轮询' );
			
			// 获取所有已绑定的 Steam 数据（不区分来源）
			const allBindItems = this.getAllSteamBindItems();
			
			if ( allBindItems.length === 0 ) {
				pluginState.logger.debug( '没有绑定的 Steam 用户，跳过轮询' );
				return;
			}
			
			// 提取所有唯一的 Steam ID
			const allSteamIds = [ ...new Set( allBindItems.map( item => item.steamId ) ) ];
			pluginState.logger.debug( `检测到 ${ allSteamIds.length } 个唯一的 Steam 用户` );
			
			// 按 100 个一组分批处理
			const batchSize = 100;
			for ( let i = 0; i < allSteamIds.length; i += batchSize ) {
				const batch = allSteamIds.slice( i, i + batchSize );
				
				try {
					// 查询当前批次的用户状态
					const playerSummaries = await steamService.getPlayerSummaries( batch );
					
					if ( playerSummaries.length > 0 ) {
						// 检测状态变化
						const changes = steamCacheService.detectStatusChanges( playerSummaries );
						
						if ( changes.length > 0 ) {
							pluginState.logger.info( `检测到 ${ changes.length } 个 Steam 状态变化` );
							await this.handleStatusChanges( changes, allBindItems );
						}
						
						// 更新缓存
						steamCacheService.updateCacheBatch( playerSummaries );
					}
				}
				catch ( error ) {
					pluginState.logger.error( `查询 Steam 批次 ${ i / batchSize + 1 } 时出错:`, error );
				}
			}
			
			pluginState.logger.debug( 'Steam 状态轮询完成' );
		}
		catch ( error ) {
			pluginState.logger.error( '执行 Steam 状态轮询时出错:', error );
		}
	}
	
	/**
	 * 获取所有 Steam 绑定项
	 */
	private getAllSteamBindItems(): SteamBindItem[] {
		// 通过读取数据文件获取所有绑定项
		return pluginState.loadDataFile<SteamBindItem[]>( 'steam-bind-data.json', [] );
	}
	
	/**
	 * 处理检测到的状态变化
	 */
	private async handleStatusChanges( changes: StatusChanges, allBindItems: SteamBindItem[] ): Promise<void> {
		for ( const change of changes ) {
			try {
				// 获取与该 Steam ID 相关的所有绑定项
				const relatedBindItems = allBindItems.filter( item => item.steamId === change.steamId );
				
				if ( relatedBindItems.length === 0 ) {
					pluginState.logger.warn( `未找到 Steam ID ${ change.steamId } 的绑定项，跳过推送` );
					continue;
				}
				
				// 向所有相关的来源推送消息
				for ( const bindItem of relatedBindItems ) {
					if ( bindItem.from && bindItem.from.length > 0 ) {
						for ( const fromInfo of bindItem.from ) {
							try {
								// 为每个来源生成带有该来源自定义昵称的消息
								const message = this.generateStatusChangeMessageForFrom( change, fromInfo, bindItem );
								await this.sendMessageToSource( fromInfo, message, bindItem, change );
							}
							catch ( error ) {
								pluginState.logger.error( `向 ${ fromInfo.type } ${ fromInfo.id } 推送消息时出错:`, error );
							}
						}
					}
				}
			}
			catch ( error ) {
				pluginState.logger.error( `处理 Steam ID ${ change.steamId } 的状态变化时出错:`, error );
			}
		}
	}
	
	/**
	 * 为特定来源生成状态变化推送消息
	 */
	private generateStatusChangeMessageForFrom(
		change: StatusChange,
		fromInfo: { id: string; type: 'private' | 'group'; nickname?: string },
		bindItem: SteamBindItem,
	): string {
		// 获取该来源的自定义昵称（如果存在），否则使用原始昵称
		const customNickname = fromInfo.nickname || change.newStatus.personaname;
		const timestamp = new Date().toLocaleString( 'zh-CN' );
		
		let message = `[${ timestamp }] ${ customNickname }`;
		
		switch ( change.changeType ) {
			case 'online':
				message += ' 上线了';
				break;
			case 'offline':
				message += ' 离线了';
				break;
			case 'ingame':
				if ( change.newStatus.gameextrainfo ) {
					message += ` 正在游玩 ${ change.newStatus.gameextrainfo }`;
				}
				else {
					message += ' 开始玩游戏了';
				}
				break;
					case 'outgame':
						message += ` 结束游玩 ${ change.oldStatus?.gameextrainfo || '' }`;
						// 如果有游戏开始时间，计算并显示游玩时长
						if (change.oldStatus?.gameStartTime) {
							const playTimeMs = Date.now() - change.oldStatus.gameStartTime;
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
			
							message += `（游玩时长：${playTimeStr}）`;
						}
						break;			case 'inAfk':
				message += ' 开始挂机';
				if ( change.newStatus.gameextrainfo ) {
					message += ` - ${ change.newStatus.gameextrainfo }`;
				}
				break;
			case 'outAfk':
				message += ' 结束挂机';
				if ( change.newStatus.gameextrainfo ) {
					message += ` - ${ change.newStatus.gameextrainfo }`;
				}
				break;
					case 'quitGame':
						message += ` 结束游玩并下线 ${ change.oldStatus?.gameextrainfo || '' }`;
						// 如果有游戏开始时间，计算并显示游玩时长
						if (change.oldStatus?.gameStartTime) {
							const playTimeMs = Date.now() - change.oldStatus.gameStartTime;
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
			
							message += `（游玩时长：${playTimeStr}）`;
						}
						break;			default:
				message += ` 状态更新: ${ steamService.formatPlayerState( change.newStatus.personastate ) }`;
				if ( change.newStatus.gameextrainfo ) {
					message += ` - ${ change.newStatus.gameextrainfo }`;
				}
				break;
		}
		
		return message;
	}
	
	/**
	 * 向指定来源发送消息
	 */
	private async sendMessageToSource(
		fromInfo: { id: string; type: 'private' | 'group'; nickname?: string },
		message: string,
		bindItem: SteamBindItem,
		change: StatusChange,
	): Promise<void> {
		try {
			// 构建SVG内容
			const statusText = this.getStatusText( change );
			const gameName = change.newStatus.gameextrainfo || '';
			const hasGameName = !!gameName;
			
			// 固定宽度, 高度
			const svgWidth = 400;
			const svgHeight = 100;
			
			// 构建游戏名称行（仅当存在时显示）
			const gameNameLine = hasGameName
				? `<text x="115" y="84" fill="#91c257" font-size="16" font-weight="500">${ this.escapeXml( gameName ) }</text>`
				: '';
			
			const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${ svgWidth } ${ svgHeight }">
  <rect width="${ svgWidth }" height="${ svgHeight }" fill="#202227"/>
  <image href="${ bindItem.face || change.newStatus.avatarmedium }"
         x="10" y="10" width="80" height="80"
         preserveAspectRatio="xMidYMid slice" />
  <rect x="90" y="10" width="4" height="80" fill="#4CAF50"/>
  <g font-family="'Microsoft YaHei', 'SimHei', sans-serif">
    <text x="115" y="30" font-size="18" font-weight="bold">
      <tspan fill="#cee8b1">${ this.escapeXml( change.newStatus.personaname ) }</tspan>
      ${ fromInfo.nickname ? `<tspan dx="8" fill="#898a8b">(${ this.escapeXml( fromInfo.nickname ) })</tspan>` : '' }
    </text>
    <text x="115" y="58" fill="#898a8b" font-size="16">
      ${ this.escapeXml( statusText ) }
    </text>
    ${ gameNameLine }
  </g>
</svg>`;
			
			// 使用 svg-convert 将 SVG 渲染为 PNG 并转换为 base64
			const svgBase64 = await this.renderSvgToBase64( svgContent );
			
			// 发送文本消息和PNG图片
			if ( svgBase64 ) {
				if ( fromInfo.type === 'group' ) {
					await sendGroupMessage( pluginState.ctx, parseInt( fromInfo.id ), [
						{ type: 'text', data: { text: message + '\n' } },
						{
							type: 'image',
							data: { file: `base64://${ svgBase64 }` },
						},
					] );
				}
				else if ( fromInfo.type === 'private' ) {
					await sendPrivateMessage( pluginState.ctx, parseInt( fromInfo.id ), [
						{ type: 'text', data: { text: message + '\n' } },
						{
							type: 'image',
							data: { file: `base64://${ svgBase64 }` },
						},
					] );
				}
			}
			else {
				// 如果图片渲染失败，回退到只发送文本消息
				if ( fromInfo.type === 'group' ) {
					await sendGroupMessage( pluginState.ctx, parseInt( fromInfo.id ), message );
				}
				else if ( fromInfo.type === 'private' ) {
					await sendPrivateMessage( pluginState.ctx, parseInt( fromInfo.id ), message );
				}
			}
			
		}
		catch ( error ) {
			pluginState.logger.error( '发送带图片的消息失败，回退到纯文本:', error );
			// 如果图片发送失败，回退到只发送文本消息
			if ( fromInfo.type === 'group' ) {
				await sendGroupMessage( pluginState.ctx, parseInt( fromInfo.id ), message );
			}
			else if ( fromInfo.type === 'private' ) {
				await sendPrivateMessage( pluginState.ctx, parseInt( fromInfo.id ), message );
			}
		}
	}
	
	/**
	 * 使用 svg-convert 渲染 SVG 为 base64 图片
	 */
	private async renderSvgToBase64( svg: string ): Promise<string | null> {
		try {
			const port = 6099;
			const host = `http://127.0.0.1:${ port }`;
			const url = `${ host }/plugin/napcat-plugin-svg-render/api/svg/render`;
			
			pluginState.logger.debug( `调用 svg-convert 渲染，SVG 长度: ${ svg.length }` );
			
			const res = await fetch( url, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify( {
					svg,
					saveWebImage: true, // 保存网络图片到缓存，提高下次渲染速度
				} ),
				signal: AbortSignal.timeout( 30000 ),
			} );
			
			const data = await res.json() as {
				code: number;
				data?: { imageBase64: string; format: string };
				message?: string;
			};
			
			if ( data.code === 0 && data.data?.imageBase64 ) {
				pluginState.logger.debug( 'svg-convert 渲染成功' );
				// 去除 data:image/png;base64, 前缀，只返回 base64 数据
				const base64Data = data.data.imageBase64.replace( /^data:image\/png;base64,/, '' );
				return base64Data;
			}
			pluginState.logger.warn( `svg-convert 渲染失败: ${ data.message || '未知错误' }` );
			return null;
		}
		catch ( e ) {
			pluginState.logger.error( `svg-convert 渲染请求失败: ${ e }` );
			return null;
		}
	}
	
	
	/**
	 * 获取状态文本
	 */
	private getStatusText( change: StatusChange ): string {
		switch ( change.changeType ) {
			case 'online':
				return '上线';
			case 'offline':
				return '下线';
			case 'ingame':
				return '正在玩';
			case 'outgame':
				return '结束游玩';
			case 'inAfk':
				return '正在挂机';
			case 'outAfk':
				return '结束挂机';
			case 'quitGame':
				return '结束游玩并下线';
			default:
				return steamService.formatPlayerState( change.newStatus.personastate );
		}
	}
	
	/**
	 * 转义 XML 特殊字符
	 */
	private escapeXml( text: string ): string {
		if ( !text ) return '';
		return text
			.replace( /&/g, '&amp;' )
			.replace( /</g, '&lt;' )
			.replace( />/g, '&gt;' )
			.replace( /"/g, '&quot;' )
			.replace( /'/g, '&apos;' );
	}
	
	/**
	 * 获取轮询服务状态
	 */
	getStatus(): { isActive: boolean; interval: number; nextPoll: number } {
		const interval = this.getPollingInterval();
		return {
			isActive: this.isPollingActive,
			interval: interval,
			nextPoll: this.pollingTimer ? Date.now() + interval : 0,
		};
	}
}

// ==================== 导出单例服务 ====================

export const steamPollingService = new SteamPollingService();
