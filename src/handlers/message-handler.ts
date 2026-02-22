/**
 * 消息处理器
 *
 * 处理接收到的 QQ 消息事件，包含：
 * - 命令解析与分发
 * - CD 冷却管理
 * - 消息发送工具函数
 *
 * 最佳实践：将不同类型的业务逻辑拆分到不同的 handler 文件中，
 * 保持每个文件职责单一。
 */

import type { OB11Message } from 'napcat-types/napcat-onebot';
import type { NapCatPluginContext } from 'napcat-types/napcat-onebot/network/plugin/types';
import { pluginState } from '../core/state';

// 导入各个指令处理器
import { handleHelp } from './help.handler';
import { handleSteamSearch } from './steam-search.handler';
import { handleSteamBind } from './steam-bind.handler';
import { handleSteamBindBatch } from './steam-bind-batch.handler';
import { handleSteamList } from './steam-list.handler';
import { handleSteamRemove } from './steam-remove.handler';
import { handleSteamReset } from './steam-reset.handler';
import { handleSteamPolling } from './steam-polling.handler';
import { handleAdmin } from './admin.handler';
import { handleGroup } from './group.handler';

/**
 * 消息处理主函数
 * 在这里实现你的命令处理逻辑
 */
export async function handleMessage(ctx: NapCatPluginContext, event: OB11Message): Promise<void> {
    try {
        const rawMessage = event.raw_message || '';
        const messageType = event.message_type;
        const groupId = event.group_id;
        const userId = event.user_id;
        
        pluginState.ctx.logger.debug(`收到消息: ${rawMessage} | 类型: ${messageType}`);
        
        // 群消息：检查该群是否启用
        if (messageType === 'group' && groupId) {
            if (!pluginState.isGroupEnabled(String(groupId))) return;
        }


        
        // 检查命令前缀
        const prefix = '#';
        if (!rawMessage.startsWith(prefix)) return;
        
        // 解析命令参数
        const args = rawMessage.slice(prefix.length).trim().split(/\s+/);
        const subCommand = args[0]?.toLowerCase() || '';
        switch (subCommand) {
            case 'steam-help':
                await handleHelp(ctx, event, args);
                break;
            case 'steam-search':
                await handleSteamSearch(ctx, event, args);
                break;
            case 'steam-bind':
                await handleSteamBind(ctx, event, args);
                break;
            case 'steam-bind-batch':
                await handleSteamBindBatch(ctx, event, args);
                break;
            case 'steam-list':
                await handleSteamList(ctx, event, args);
                break;
            case 'steam-reset':
                await handleSteamReset(ctx, event, args);
                break;
            case 'steam-remove':
                await handleSteamRemove(ctx, event, args);
                break;
            case 'steam-polling':
                await handleSteamPolling(ctx, event, args);
                break;
            case 'admin':
                await handleAdmin(ctx, event, args);
                break;
            case 'group':
                await handleGroup(ctx, event, args);
                break;
            default:
                // 未知命令，不做处理
                break;
        }
    } catch (error) {
        pluginState.logger.error('处理消息时出错:', error);
    }
}
