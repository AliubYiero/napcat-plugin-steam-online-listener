/**
 * Steam 轮询服务模块
 * 实现定时轮询 Steam 用户状态变化的功能
 */

import { pluginState } from '../core/state';
import { steamService } from './steam.service';
import { gameNameService } from './game-name.service.js';
import {
	steamCacheService,
	type StatusChanges,
	StatusChange,
} from './steam-cache.service';
import { timelineService } from './timeline.service';
import { steamReportService } from './steam-report.service';
import { renderSvgToBase64, escapeXml } from '../utils/svg-render';
import {
	sendGroupMessage,
	sendPrivateMessage,
} from '../handlers/utils';
import type { SteamBindItem } from '../types';

// ==================== 轮询服务类 ====================

class SteamPollingService {
	private pollingTimer: NodeJS.Timeout | null = null;
	private isPollingActive = false;
	private lastPollDate: string = ''; // 上次轮询日期
	
	/**
	 * 获取当前轮询间隔（毫秒）
	 */
	private getPollingInterval(): number {
		// 限制轮询间隔范围：最小1秒，最大1小时（3600秒）
		const intervalSeconds = Math.min(
			3600, // 最大1小时
			Math.max( 1, pluginState.config.pollingIntervalSeconds || 60 ),
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
			
			// 检测日期变化（使用本地时区）
			const today = new Date().toLocaleDateString('zh-CN').replace(/\//g, '-');
			if (this.lastPollDate && this.lastPollDate !== today) {
				pluginState.logger.info('[SteamPollingService] 检测到日期变化，执行每日报告和午夜快照');

				// 1. 最先执行：生成并推送昨日活动报告
				await steamReportService.generateAndPushDailyReport(this.lastPollDate);

				// 2. 记录昨天的最终状态（午夜快照，使用实际状态）
				const yesterdayCache = steamCacheService.getCurrentCache();
				timelineService.midnightSnapshot(yesterdayCache);

				// 3. 检查并归档旧日志
				timelineService.checkAndArchive();
			}
			this.lastPollDate = today;
			
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
							
							// 记录到时间线
							timelineService.record(changes);
							
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
		// 获取要推送的状态类型配置
		const notifyStatusTypes = pluginState.config.notifyStatusTypes || [];
		
		// 过滤掉不需要推送的状态变化
		const filteredChanges = changes.filter( change =>
			notifyStatusTypes.includes( change.changeType ),
		);
		
		if ( filteredChanges.length === 0 ) {
			pluginState.logger.debug( '所有状态变化都被过滤，跳过推送' );
			return;
		}
		
		if ( filteredChanges.length < changes.length ) {
			pluginState.logger.debug( `过滤后剩余 ${ filteredChanges.length }/${ changes.length } 个状态变化` );
		}
		
		for ( const change of filteredChanges ) {
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
								const message = await this.generateStatusChangeMessageForFrom( change, fromInfo, bindItem );
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
	private async generateStatusChangeMessageForFrom(
		change: StatusChange,
		fromInfo: { id: string; type: 'private' | 'group'; nickname?: string },
		bindItem: SteamBindItem,
	): Promise<string> {
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
				if ( change.newStatus.gameextrainfo && change.newStatus.gameid ) {
					const formattedGameName = await gameNameService.getFormattedGameName(
						change.newStatus.gameid,
						change.newStatus.gameextrainfo,
					);
					message += ` 正在游玩 ${ formattedGameName }`;
				}
				else if ( change.newStatus.gameextrainfo ) {
					message += ` 正在游玩 ${ change.newStatus.gameextrainfo }`;
				}
				else {
					message += ' 开始玩游戏了';
				}
				break;
			case 'outgame': {
				let gameName = change.oldStatus?.gameextrainfo || '';
				// 尝试获取格式化后的游戏名称
				if ( change.oldStatus?.gameid && gameName ) {
					gameName = await gameNameService.getFormattedGameName(
						change.oldStatus.gameid,
						gameName,
					);
				}
				message += ` 结束游玩 ${ gameName }`;
				// 如果有游戏开始时间，计算并显示游玩时长
				if ( change.oldStatus?.gameStartTime ) {
					const playTimeMs = Date.now() - change.oldStatus.gameStartTime;
					const playTimeMinutes = Math.floor( playTimeMs / 60000 );
					const playTimeHours = Math.floor( playTimeMinutes / 60 );
					const playTimeSeconds = Math.floor( ( playTimeMs % 60000 ) / 1000 );
					
					let playTimeStr = '';
					if ( playTimeHours > 0 ) {
						playTimeStr += `${ playTimeHours }小时`;
					}
					if ( playTimeMinutes > 0 ) {
						playTimeStr += `${ playTimeMinutes % 60 }分钟`;
					}
					if ( playTimeSeconds > 0 || playTimeStr === '' ) {
						playTimeStr += `${ playTimeSeconds }秒`;
					}
					
					message += `（游玩时长：${ playTimeStr }）`;
				}
				break;
			}
			case 'inAfk': {
				message += ' 开始挂机';
				if ( change.newStatus.gameextrainfo && change.newStatus.gameid ) {
					const formattedGameName = await gameNameService.getFormattedGameName(
						change.newStatus.gameid,
						change.newStatus.gameextrainfo,
					);
					message += ` - ${ formattedGameName }`;
				}
				else if ( change.newStatus.gameextrainfo ) {
					message += ` - ${ change.newStatus.gameextrainfo }`;
				}
				break;
			}
			case 'outAfk': {
				message += ' 结束挂机';
				if ( change.newStatus.gameextrainfo && change.newStatus.gameid ) {
					const formattedGameName = await gameNameService.getFormattedGameName(
						change.newStatus.gameid,
						change.newStatus.gameextrainfo,
					);
					message += ` - ${ formattedGameName }`;
				}
				else if ( change.newStatus.gameextrainfo ) {
					message += ` - ${ change.newStatus.gameextrainfo }`;
				}
				break;
			}
						case 'quitGame': {
							let gameName = change.oldStatus?.gameextrainfo || '';
							// 尝试获取格式化后的游戏名称
							if (change.oldStatus?.gameid && gameName) {
								gameName = await gameNameService.getFormattedGameName(
									change.oldStatus.gameid,
									gameName,
								);
							}
							message += ` 结束游玩并下线 ${gameName}`;
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
							break;
						}
						case 'switchGame': {
							// 获取旧游戏名称
							let oldGameName = change.oldStatus?.gameextrainfo || '';
							if (change.oldStatus?.gameid && oldGameName) {
								oldGameName = await gameNameService.getFormattedGameName(
									change.oldStatus.gameid,
									oldGameName,
								);
							}
							// 获取新游戏名称
							let newGameName = '';
							if (change.newStatus.gameid && change.newStatus.gameextrainfo) {
								newGameName = await gameNameService.getFormattedGameName(
									change.newStatus.gameid,
									change.newStatus.gameextrainfo,
								);
							}
							message += ` 结束游玩 ${oldGameName}`;
							// 如果有游戏开始时间，计算并显示旧游戏的游玩时长
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
							message += `，开始游玩 ${newGameName}`;
							break;
						}
						default:
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
			// 对于退出游戏状态，使用旧状态中的游戏名称；其他状态（包括切换游戏）使用新状态
			let gameName = '';
			if ( ( change.changeType === 'outgame' || change.changeType === 'quitGame' )
				&& ( change.oldStatus && change.oldStatus.gameextrainfo && change.oldStatus.gameid ) ) {
				gameName = await gameNameService.getFormattedGameName(
					change.oldStatus.gameid,
					change.oldStatus.gameextrainfo,
				);
			}
			else if ( change.newStatus.gameid && change.newStatus.gameextrainfo ) {
				// switchGame 也会使用此分支，显示新游戏名称
				gameName = await gameNameService.getFormattedGameName(
					change.newStatus.gameid,
					change.newStatus.gameextrainfo,
				);
			}
			const hasGameName = !!gameName;
			
			// 动态计算宽度
			const MIN_SVG_WIDTH = 400;
			const leftPadding = 115; // 文本起始 x 坐标
			const rightPadding = 20; // 右侧留白
			
			// 计算第一行宽度：昵称 + 自定义昵称
			const nicknameFontSize = 18;
			let line1Text = change.newStatus.personaname || '';
			if ( fromInfo.nickname ) {
				line1Text += ` (${ fromInfo.nickname })`;
			}
			const line1Width = this.calculateTextWidth( line1Text, nicknameFontSize );
			
			// 计算第三行宽度：游戏名称（如果存在）
			const gameNameFontSize = 16;
			const line3Text = gameName || '';
			const line3Width = this.calculateTextWidth( line3Text, gameNameFontSize );
			
			// 取最大宽度，并确保不小于最小宽度
			const maxTextWidth = Math.max( line1Width, line3Width );
			const svgWidth = Math.max( MIN_SVG_WIDTH, leftPadding + maxTextWidth + rightPadding );
			const svgHeight = 100;
			
			const imageFace = bindItem.face
				|| change.newStatus.avatarmedium
				|| 'https://avatars.steamstatic.com/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb_medium.jpg';
			
			const notHasGameNameSvgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${ svgWidth } ${ svgHeight }">
  <!-- 背景 -->
  <rect width="${ svgWidth }" height="${ svgHeight }" fill="#202227"/>
  
  <!-- 用户头像 -->
  <image href="${ imageFace }"
         x="10" y="10" width="80" height="80"
         preserveAspectRatio="xMidYMid slice" />
  
  <!-- 状态指示条 -->
  <rect x="90" y="10" width="4" height="80" fill="#4cb4ff"/>
  
  <!-- 文本内容 -->
  <g font-family="'Microsoft YaHei', 'SimHei', sans-serif">
    <!-- 用户名 + 可选昵称 -->
    <text x="115" y="36" font-size="18" font-weight="bold">
      <tspan fill="#4cb4ff">${ escapeXml( change.newStatus.personaname ) }</tspan>
       ${ fromInfo.nickname ? `<tspan dx="8" fill="#898a8b">(${ escapeXml( fromInfo.nickname ) })</tspan>` : '' }
    </text>
    
    <!-- 状态文本 -->
    <text x="115" y="68" fill="#898a8b" font-size="16">
      <tspan fill="#898a8b">当前</tspan>
      <tspan fill="#4cb4ff">${ escapeXml( statusText ) }</tspan>
    </text>
  </g>
</svg>`;
			
			const hasGameNameSvgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${ svgWidth } ${ svgHeight }">
  <rect width="${ svgWidth }" height="${ svgHeight }" fill="#202227"/>
  <image href="${ imageFace }"
         x="10" y="10" width="80" height="80"
         preserveAspectRatio="xMidYMid slice" />
  <rect x="90" y="10" width="4" height="80" fill="#4CAF50"/>
  <g font-family="'Microsoft YaHei', 'SimHei', sans-serif">
    <text x="115" y="30" font-size="18" font-weight="bold">
      <tspan fill="#cee8b1">${ escapeXml( change.newStatus.personaname ) }</tspan>
      ${ fromInfo.nickname ? `<tspan dx="8" fill="#898a8b">(${ escapeXml( fromInfo.nickname ) })</tspan>` : '' }
    </text>
    <text x="115" y="59" fill="#898a8b" font-size="16">
      ${ escapeXml( statusText ) }
    </text>
    <text x="115" y="84" fill="#91c257" font-size="16" font-weight="500">${ escapeXml( gameName ) }</text>
  </g>
</svg>`;
			const svgContent = hasGameName ? hasGameNameSvgContent : notHasGameNameSvgContent;
			
			// 使用 svg-convert 将 SVG 渲染为 PNG 并转换为 base64
			const svgBase64 = await renderSvgToBase64( svgContent );
			
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
	 * 获取状态文本
	 */
	private getStatusText( change: StatusChange ): string {
		switch ( change.changeType ) {
			case 'online':
				return '在线';
			case 'offline':
				return '离线';
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
			case 'switchGame':
				return '切换游戏';
			default:
				return steamService.formatPlayerState( change.newStatus.personastate );
		}
	}
	
	/**
	 * 判断字符是否为全角字符
	 * @param char 单个字符
	 * @returns 是否为全角字符
	 */
	private isFullWidthChar( char: string ): boolean {
		const code = char.codePointAt( 0 ) || 0;
		
		return (
			// CJK 统一表意文字及扩展区
			( code >= 0x4E00 && code <= 0x9FFF ) ||
			( code >= 0x3400 && code <= 0x4DBF ) ||
			( code >= 0x20000 && code <= 0x2A6DF ) ||
			( code >= 0x2A700 && code <= 0x2B73F ) ||
			( code >= 0x2B740 && code <= 0x2B81F ) ||
			( code >= 0x2B820 && code <= 0x2CEAF ) ||
			// 日文假名
			( code >= 0x3040 && code <= 0x309F ) ||
			( code >= 0x30A0 && code <= 0x30FF ) ||
			// 韩文音节
			( code >= 0xAC00 && code <= 0xD7AF ) ||
			// 全角 ASCII 及标点
			( code >= 0xFF00 && code <= 0xFFEF ) ||
			// 其他常见全角标点
			( code >= 0x3000 && code <= 0x303F )
		);
	}
	
	/**
	 * 计算字符串的预计显示宽度
	 * @param text 输入字符串
	 * @param fontSize 字体字号（单位：px）
	 * @returns 预计总宽度
	 */
	private calculateTextWidth( text: string, fontSize: number ): number {
		if ( !text || fontSize <= 0 ) return 0;
		
		let totalWidth = 0;
		for ( const char of text ) {
			const widthFactor = this.isFullWidthChar( char ) ? 1 : 0.6;
			totalWidth += fontSize * widthFactor;
		}
		
		return totalWidth;
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
