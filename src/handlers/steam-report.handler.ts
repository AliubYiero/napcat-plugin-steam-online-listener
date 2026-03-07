/**
 * 处理 #steam report 指令
 * 支持查询今日和昨日的 Steam 活动报告
 */

import type { OB11Message } from 'napcat-types/napcat-onebot';
import type { NapCatPluginContext } from 'napcat-types/napcat-onebot/network/plugin/types';
import { steamReportService } from '../services/steam-report.service';
import { pluginState } from '../core/state';
import { sendReply } from './utils';

/**
 * 处理 #steam report 指令
 * @param ctx 插件上下文
 * @param event 消息事件
 * @param args 命令参数 [day]
 */
export async function handleSteamReport(
    ctx: NapCatPluginContext,
    event: OB11Message,
    args: string[],
): Promise<void> {
    try {
        const day = args[1]?.toLowerCase();
        const messageType = event.message_type;
        const groupId = event.group_id;
        const userId = event.user_id;

        // 构建 sourceKey
        let sourceKey: string;
        if (messageType === 'group' && groupId) {
            sourceKey = `group:${groupId}`;
        } else {
            sourceKey = `private:${userId}`;
        }

        // 参数校验
        if (day !== 'today' && day !== 'yesterday') {
            await sendReply(ctx, event, '参数错误，请使用：#steam report today 或 #steam report yesterday');
            return;
        }

        // 计算日期和时间范围
        const { dateStr, endTime, dateLabel } = calculateReportRange(day);

        pluginState.logger.info(`[SteamReport] 用户请求 ${dateLabel} 的报告，来源: ${sourceKey}`);

        // 调用 Service 生成报告
        const success = await steamReportService.generateOnDemandReport(dateStr, endTime, sourceKey);

        if (!success) {
            await sendReply(ctx, event, `${dateLabel} 暂无状态记录或当前来源无绑定的 Steam 用户`);
        }
        // 成功时 Service 已推送图片，无需额外回复

    } catch (error) {
        pluginState.logger.error('[SteamReport] 处理报告指令失败:', error);
        await sendReply(ctx, event, '报告生成失败，请稍后重试');
    }
}

/**
 * 计算报告的时间范围
 * @param day 'today' 或 'yesterday'
 * @returns 日期字符串、结束时间戳、日期标签
 */
function calculateReportRange(day: string): { dateStr: string; endTime: number; dateLabel: string } {
    const now = new Date();

    // 获取中国时区的当前日期 (UTC+8)
    const chinaTime = new Date(now.getTime() + (now.getTimezoneOffset() + 480) * 60000);
    const year = chinaTime.getFullYear();
    const month = chinaTime.getMonth();
    const date = chinaTime.getDate();

    // 今日日期字符串
    const todayStr = `${year}-${month + 1}-${date}`;

    if (day === 'today') {
        // 今日：结束时间为当前
        return {
            dateStr: todayStr,
            endTime: now.getTime(),
            dateLabel: '今日',
        };
    } else {
        // 昨日：计算昨日日期
        const yesterdayDate = new Date(chinaTime);
        yesterdayDate.setDate(yesterdayDate.getDate() - 1);
        const yesterdayStr = `${yesterdayDate.getFullYear()}-${yesterdayDate.getMonth() + 1}-${yesterdayDate.getDate()}`;

        // 今日 0:00 时间戳 = 昨日 24:00
        const startOfToday = new Date(year, month, date).getTime();

        return {
            dateStr: yesterdayStr,
            endTime: startOfToday,
            dateLabel: '昨日',
        };
    }
}
