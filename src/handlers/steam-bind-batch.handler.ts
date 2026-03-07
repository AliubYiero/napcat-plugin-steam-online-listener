/**
 * steam-bind-batch指令处理器
 * 处理 #steam-bind-batch 批量绑定指令
 * 支持格式: #steam-bind-batch <steam-id-1> <nickname-1> <steam-id-2> <nickname-2> ...
 * 参数间可识别空白符号（空格、换行、制表符等）
 */

import type { OB11Message } from 'napcat-types/napcat-onebot';
import type { NapCatPluginContext } from 'napcat-types/napcat-onebot/network/plugin/types';
import { sendReply, getCooldownRemaining, setCooldown } from './utils';
import { findSteamBindItem, updateSteamBindItem } from './steam-utils';
import type { SteamBindItem } from '../types';
import { pluginState } from '../core/state';
import { steamService } from '../services/steam.service';
import { steamPollingService } from '../services/steam-polling.service';

/**
 * 验证 Steam ID 是否为纯数字格式
 */
function isValidSteamId64(steamId: string): boolean {
	return /^\d+$/.test(steamId);
}

/**
 * 解析批量绑定参数
 * 从 args 数组中解析出 steamId 和 nickname 的配对
 * @param args - 命令参数数组，args[0] 为 'bind-batch'，从 args[1] 开始是实际参数
 */
function parseBatchArgs(args: string[]): Array<{ steamId: string; nickname: string }> {
	// 跳过 args[0]（子命令 'bind-batch'），获取实际参数
	const tokens = args.slice(1).filter(token => token.length > 0);

	const pairs: Array<{ steamId: string; nickname: string }> = [];

	// 每两个令牌为一组（steamId + nickname）
	for (let i = 0; i < tokens.length; i += 2) {
		if (i + 1 < tokens.length) {
			pairs.push({
				steamId: tokens[i],
				nickname: tokens[i + 1]
			});
		}
	}

	return pairs;
}

/**
 * 处理 steam-bind-batch 指令
 */
export async function handleSteamBindBatch(
	ctx: NapCatPluginContext,
	event: OB11Message,
	args: string[]
): Promise<void> {
	const messageType = event.message_type;
	const groupId = event.group_id;

	// 群消息检查 CD
	if (messageType === 'group' && groupId) {
		const remaining = getCooldownRemaining(groupId, 'steam-bind-batch');
		if (remaining > 0) {
			await sendReply(ctx, event, `请等待 ${remaining} 秒后再试`);
			return;
		}
	}

	// 解析批量绑定参数
	const pairs = parseBatchArgs(args);

	if (pairs.length === 0) {
		await sendReply(
			ctx,
			event,
			'用法: #steam-bind-batch <steam-id-1> <nickname-1> <steam-id-2> <nickname-2> ...\n参数间可使用空格、换行或制表符分隔'
		);
		return;
	}

	const results: Array<{
		steamId: string;
		nickname: string;
		success: boolean;
		message: string;
	}> = [];

	// 处理每一对绑定
	for (const pair of pairs) {
		try {
			let steamId = pair.steamId;
			const nickname = pair.nickname;

			// 验证 Steam ID 格式：如果不是纯数字，尝试解析为自定义 ID
			if (!isValidSteamId64(steamId)) {
				pluginState.logger.debug(`批量绑定: Steam ID 不是纯数字格式，尝试解析为自定义 ID: ${steamId}`);
				const resolvedId = await steamService.getSteamID64(steamId);
				if (!resolvedId) {
					results.push({
						steamId: pair.steamId,
						nickname,
						success: false,
						message: 'Steam ID 格式无效（应为纯数字）'
					});
					continue;
				}
				steamId = resolvedId;
			}

			// 验证用户是否存在
			let playerSummary = await steamService.getPlayerSummary(steamId);

			// 二次验证用户是否存在
			if (!playerSummary) {
				const resolvedSteamId = await steamService.getSteamID64(steamId);
				if (resolvedSteamId) {
					playerSummary = await steamService.getPlayerSummary(resolvedSteamId);
					steamId = resolvedSteamId;
				}
			}

			if (!playerSummary) {
				results.push({
					steamId: pair.steamId,
					nickname,
					success: false,
					message: '无法找到 Steam 用户'
				});
				continue;
			}

			// 查找现有的绑定项
			let bindItem = findSteamBindItem(steamId);
			if (!bindItem) {
				// 如果不存在，创建新的绑定项
				bindItem = {
					steamId: steamId,
					personName: playerSummary.personaname,
					face: playerSummary.avatarmedium,
					from: [
						{
							id: messageType === 'group' ? String(groupId) : String(event.user_id),
							type: messageType,
							nickname: nickname || undefined
						}
					]
				};
			} else {
				// 如果已存在，添加新的来源信息或更新现有来源的昵称
				const newFromInfo = {
					id: messageType === 'group' ? String(groupId) : String(event.user_id),
					type: messageType,
					nickname: nickname || undefined
				};

				// 检查是否已存在相同的来源
				const existingIndex = bindItem.from?.findIndex(
					fromInfo => fromInfo.id === newFromInfo.id && fromInfo.type === newFromInfo.type
				);

				if (existingIndex !== undefined && existingIndex !== -1) {
					// 如果来源已存在，更新该来源的昵称
					bindItem.from![existingIndex] = { ...bindItem.from![existingIndex], ...newFromInfo };
				} else {
					// 如果来源不存在，则添加
					if (!bindItem.from) {
						bindItem.from = [];
					}
					bindItem.from.push(newFromInfo);
				}

				// 更新头像信息和昵称
				if (playerSummary.avatarmedium) {
					bindItem.face = playerSummary.avatarmedium;
				}
				if (playerSummary.personaname) {
					bindItem.personName = playerSummary.personaname;
				}
			}

			// 更新绑定数据
			updateSteamBindItem(bindItem);

			results.push({
				steamId,
				nickname,
				success: true,
				message: playerSummary.personaname
			});

			pluginState.incrementProcessed();
		} catch (error: any) {
			pluginState.logger.error('批量绑定 Steam 数据时出错:', error);
			results.push({
				steamId: pair.steamId,
				nickname: pair.nickname,
				success: false,
				message: error.message || '未知错误'
			});
		}
	}

	// 生成结果报告
	const successCount = results.filter(r => r.success).length;
	const failCount = results.length - successCount;

	let resultMessage = `[= 批量绑定结果 =]\n成功: ${successCount} 个 | 失败: ${failCount} 个\n`;

	if (successCount > 0) {
		resultMessage += '\n[成功列表]\n';
		results
			.filter(r => r.success)
			.forEach(r => {
				resultMessage += `✓ ${r.steamId} (${r.nickname}) - ${r.message}\n`;
			});
	}

	if (failCount > 0) {
		resultMessage += '\n[失败列表]\n';
		results
			.filter(r => !r.success)
			.forEach(r => {
				resultMessage += `✗ ${r.steamId} (${r.nickname}) - ${r.message}\n`;
			});
	}

	await sendReply(ctx, event, resultMessage.trim());

	// 如果有成功绑定的，触发一次状态查询
	if (successCount > 0) {
		try {
			await steamPollingService.pollSteamStatuses();
			pluginState.logger.debug(`批量绑定完成后手动触发状态查询成功，共 ${successCount} 个绑定`);
		} catch (error) {
			pluginState.logger.warn(`批量绑定完成后状态查询失败:`, error);
		}
	}

	if (messageType === 'group' && groupId) {
		setCooldown(groupId, 'steam-bind-batch');
	}
}