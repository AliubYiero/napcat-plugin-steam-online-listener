/**
 * 报告指令 handler (`#steam report today|yesterday`)
 *
 * 仅群聊可用 (注册表 scope: 'group')。调用报告服务生成并推送图片报告。
 */

import { pluginState } from '../../core/state';
import { steamReportService } from '../../services/steam-report.service';
import {
    getChinaDateKey,
    getChinaMidnightTimestamp,
} from '../../utils/format';
import type { InstructionHandler } from '../instructionRegistry';
import { sendReply } from '../utils';

const DAY_MS = 24 * 60 * 60 * 1000;

export const reportHandler: InstructionHandler = async (
    ctx,
    event,
    commands,
) => {
    try {
        const day = commands[0]?.toLowerCase();
        const sourceKey = `group:${event.group_id}`;

        if (day !== 'today' && day !== 'yesterday') {
            await sendReply(
                ctx,
                event,
                '参数错误，请使用：#steam report today 或 #steam report yesterday',
            );
            return;
        }

        const { dateStr, endTime, dateLabel } =
            calculateReportRange(day);

        pluginState.logger.info(
            `[SteamReport] 用户请求 ${dateLabel} 的报告，来源: ${sourceKey}`,
        );

        const success =
            await steamReportService.generateOnDemandReport(
                dateStr,
                endTime,
                sourceKey,
            );

        if (!success) {
            await sendReply(
                ctx,
                event,
                `${dateLabel} 暂无可展示的活动记录`,
            );
        }
        // 成功时 Service 已推送图片，无需额外回复
    } catch (error) {
        pluginState.logger.error(
            '[SteamReport] 处理报告指令失败:',
            error,
        );
        await sendReply(ctx, event, '报告生成失败，请稍后重试');
    }
};

/**
 * 计算报告的时间范围
 * @param day 'today' 或 'yesterday'
 * @returns 日期字符串、结束时间戳、日期标签
 */
export function calculateReportRange(day: string): {
    dateStr: string;
    endTime: number;
    dateLabel: string;
} {
    const now = new Date();
    const todayKey = getChinaDateKey(now);

    if (day === 'today') {
        return {
            dateStr: todayKey,
            endTime: now.getTime(),
            dateLabel: '今日',
        };
    }

    return {
        dateStr: getChinaDateKey(new Date(now.getTime() - DAY_MS)),
        endTime: getChinaMidnightTimestamp(todayKey),
        dateLabel: '昨日',
    };
}
