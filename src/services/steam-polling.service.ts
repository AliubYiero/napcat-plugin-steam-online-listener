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
import { findSteamBindItemsByFrom } from '../handlers/steam-utils';
import {
	sendGroupMessage,
	sendPrivateMessage,
} from '../handlers/utils';
import type { SteamBindItem } from '../types';
import * as fs from 'fs';
import * as path from 'path';

// ==================== 轮询服务类 ====================

class SteamPollingService {
	private pollingTimer: NodeJS.Timeout | null = null;
	private isPollingActive = false;
	
	/**
	 * 获取当前轮询间隔（毫秒）
	 */
	private getPollingInterval(): number {
		// 确保轮询间隔至少为1秒，避免过于频繁的请求
		const intervalSeconds = Math.max( 1, pluginState.config.pollingIntervalSeconds || 60 );
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
		
		// 检查是否配置了 Steam API Key
		if ( !pluginState.config.steamApiKey ) {
			pluginState.logger.warn( '未配置 Steam API Key，无法启动 Steam 轮询服务' );
			return;
		}
		
		// 验证 API Key 是否有效
		steamService.validateApiKey().then(isValid => {
			if (!isValid) {
				pluginState.logger.warn('Steam API Key 无效，无法启动 Steam 轮询服务');
				return;
			}
			
			// 启动定时轮询
			const interval = this.getPollingInterval();
			this.pollingTimer = setInterval( () => {
				this.pollSteamStatuses();
			}, interval );
			
			// 将定时器注册到 pluginState 以便在插件清理时自动清理
			pluginState.timers.set( 'steam-polling', this.pollingTimer );
			
			this.isPollingActive = true;
			pluginState.logger.info( `Steam 轮询服务已启动，每 ${ interval / 1000 } 秒检查一次状态变化` );
		}).catch(error => {
			pluginState.logger.error('验证 Steam API Key 时出错:', error);
		});
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
				message += ` 结束了游戏 ${ change.oldStatus?.gameextrainfo || '' }`;
				break;
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
			const gameStatus = this.getStatusText( change );
			// 计算文本宽度 - 估算字符宽度
			const displayName = change.newStatus.personaname + (fromInfo.nickname ? ` (${ fromInfo.nickname })` : '');
			const textWidth = Math.max(
				this.estimateTextWidth(displayName, 20), // 第一行文本宽度（昵称+自定义昵称）
				this.estimateTextWidth(gameStatus, 16)   // 第二行文本宽度（游戏状态）
			);
			// 宽度 = 头像位置(12) + 头像宽度(64) + 右边距(12) + 文本宽度
			const calculatedWidth = Math.max(200, 12 + 64 + 12 + textWidth); // 最小宽度为200
			
			const svgContent = `<svg width="${calculatedWidth}" height="88" viewBox="0 0 ${calculatedWidth} 88"
    xmlns="http://www.w3.org/2000/svg"
    xmlns:xlink="http://www.w3.org/1999/xlink">
	<rect width="${calculatedWidth}" height="88" fill="#202227"/>
	<image x="12" y="12" width="64" height="64"
	       href="${ bindItem.face || change.newStatus.avatarmedium || 'https://steamuserimages-a.akamaihd.net/ugc/852378279109811452/8BCE99B088F7C7042EB8E8B292E8E2C971341432/' }"
	       preserveAspectRatio="xMidYMid meet"/>
	<text x="84" y="36" font-family="sans-serif" font-size="20">
		<tspan fill="#cee8b1">${ change.newStatus.personaname }</tspan>
		${ fromInfo.nickname ? `<tspan dx="8" fill="#5e5e5e">(${ fromInfo.nickname })</tspan>` : '' }
	</text>
	<text x="84" y="64" font-family="sans-serif" font-size="16" fill="#91c257">
		${ gameStatus }
	</text>
</svg>`;
			
			// 使用 Puppeteer 将 SVG 渲染为 PNG 并转换为 base64
			const svgBase64 = await this.renderToBase64WithPuppeteer( svgContent, calculatedWidth );
			
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
	 * 估算文本宽度 (像素)
	 * @param text 文本内容
	 * @param fontSize 字体大小
	 * @returns 估算的文本宽度
	 */
	private estimateTextWidth(text: string, fontSize: number): number {
		// 中文字符宽度约为 fontSize * 0.8，英文字符约为 fontSize * 0.6
		let width = fontSize * text.length;
		return Math.ceil(width);
	}
	
	/**
	 * 使用 Puppeteer 渲染 SVG 为 base64 图片
	 */
	private async renderToBase64WithPuppeteer( svg: string, calculatedWidth: number ): Promise<string | null> {
		try {
			const port = 6099;
			const host = `http://127.0.0.1:${ port }`;
			const url = `${ host }/plugin/napcat-plugin-puppeteer/api/render`;
			
			pluginState.logger.debug( `调用 puppeteer 渲染，SVG 长度: ${ svg.length }` );
			
			// 将 SVG 包装在 HTML 中以便渲染
			const html = `<!DOCTYPE html>
<html>
<head>
	<meta charset="utf-8">
	<style>
		body { margin: 0; padding: 0; background: #202227; }
	</style>
</head>
<body>
	${ svg }
</body>
</html>`;
			
			const res = await fetch( url, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify( {
					html,
					file_type: 'htmlString',
					selector: 'body',
					type: 'png',
					encoding: 'base64',
					setViewport: {
						width: calculatedWidth,
						height: 100,
						deviceScaleFactor: 1,
					},
				} ),
				signal: AbortSignal.timeout( 30000 ),
			} );
			
			const data = await res.json() as {
				code: number;
				data?: string;
				message?: string;
			};
			if ( data.code === 0 && data.data ) {
				pluginState.logger.debug( 'puppeteer 渲染成功' );
				return data.data;
			}
			pluginState.logger.warn( `puppeteer 渲染失败: ${ data.message || '未知错误' }` );
			return null;
		}
		catch ( e ) {
			pluginState.logger.error( `puppeteer 渲染请求失败: ${ e }` );
			return null;
		}
	}
	
	
	/**
	 * 获取状态文本
	 */
	private getStatusText( change: StatusChange ): string {
		switch ( change.changeType ) {
			case 'online':
				return '上线了';
			case 'offline':
				return '离线了';
			case 'ingame':
				if ( change.newStatus.gameextrainfo ) {
					return `${ change.newStatus.gameextrainfo }`;
				}
				else {
					return '正在游戏中';
				}
			case 'outgame':
				return `结束游戏 ${ change.oldStatus?.gameextrainfo || '' }`;
			default:
				const baseStatus = steamService.formatPlayerState( change.newStatus.personastate );
				if ( change.newStatus.gameextrainfo ) {
					return `${ baseStatus } - ${ change.newStatus.gameextrainfo }`;
				}
				return baseStatus;
		}
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
