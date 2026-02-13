/**
 * status指令处理器
 * 处理 #status 指令
 */

import type { OB11Message } from 'napcat-types/napcat-onebot';
import type { NapCatPluginContext } from 'napcat-types/napcat-onebot/network/plugin/types';
import { sendReply } from './utils';
import { pluginState } from '../core/state';

/**
 * 处理 status 指令
 */
export async function handleStatus(ctx: NapCatPluginContext, event: OB11Message, args: string[]): Promise<void> {
    const statusText = [
        `[= 插件状态 =]`,
        `运行时长: ${pluginState.getUptimeFormatted()}`,
        `今日处理: ${pluginState.stats.todayProcessed}`,
        `总计处理: ${pluginState.stats.processed}`,
    ].join('\n');
    await sendReply(ctx, event, statusText);
}