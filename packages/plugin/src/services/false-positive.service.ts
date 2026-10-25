/**
 * 误报检测服务模块
 *
 * 「连续确认」状态机: 检测到状态变化后不立即推送, 而是冻结该用户的
 * 缓存基准, 连续 N 轮观测到同一新状态后才确认 (推送/记录/推进缓存);
 * 若期间回到基准旧状态则判为误报, 静默作废; 若出现第三个状态则以最初
 * 旧状态为基准重新累计。
 *
 * 配置项 `falsePositiveDetection`: 0 关闭 (直接确认), N>=1 表示首次检测
 * 之后还需连续 N 轮保持同一新状态 (共 N+1 次观测) 才确认。
 *
 * 待确认状态为纯内存态, 插件重载即清空; 缓存基准仍停在旧状态,
 * 下一轮会重新检出, 推送不会丢失。
 */

import { pluginState } from '../core/state';
import type { SteamPlayerSummary } from './steam.service';
import type {
    StatusChange,
    StatusChanges,
} from './steam-cache.service';

// ==================== 数据结构 ====================

/** 快照键: 用于判断「同一新状态」(忽略昵称) */
interface SnapshotSource {
    personastate: number;
    gameid?: string;
    gameextrainfo?: string;
}

/** 单个用户的待确认项 */
interface PendingChange {
    /** 待确认的新状态快照键 */
    expectedKey: string;
    /** 冻结的基准旧状态快照键 (整条抖动链的最初旧状态) */
    baselineKey: string;
    /** 首次检测时构造的变化 (oldStatus 为基准旧状态) */
    change: StatusChange;
    /** 首次检测时间戳 (用于回填日志与时长起点) */
    firstDetectedAt: number;
    /** 已连续观测次数 (首次检测算 1) */
    observations: number;
}

/** 一轮误报检测的分流结果 */
export interface FalsePositiveResolution {
    /** 本轮确认的变化 (需记录/推送/推进缓存) */
    confirmed: StatusChanges;
    /** 本轮需冻结缓存的 steamId (仍在待确认) */
    frozenSteamIds: Set<string>;
}

function snapshotKey(source: SnapshotSource): string {
    return `${source.personastate}|${source.gameid ?? ''}|${
        source.gameextrainfo ?? ''
    }`;
}

// ==================== 误报检测服务类 ====================

class FalsePositiveService {
    private readonly pending = new Map<string, PendingChange>();

    /**
     * 读取当前阈值 (实时生效; 0 或负数视为关闭)
     */
    private getThreshold(): number {
        const value = pluginState.config.falsePositiveDetection || 0;
        if (!Number.isFinite(value)) return 0;
        return Math.max(0, Math.floor(value));
    }

    /**
     * 处理一轮状态检测结果
     * @param summaries 本轮查询到的玩家状态
     * @param changes 本轮检出的状态变化
     */
    resolve(
        summaries: SteamPlayerSummary[],
        changes: StatusChanges,
    ): FalsePositiveResolution {
        const now = Date.now();
        const confirmed: StatusChanges = [];
        const frozenSteamIds = new Set<string>();

        const threshold = this.getThreshold();

        // 关闭误报检测: 全部直接确认
        if (threshold <= 0) {
            this.pending.clear();
            return {
                confirmed: changes,
                frozenSteamIds,
            };
        }

        const summaryBySteamId = new Map(
            summaries.map((s) => [s.steamid, s]),
        );
        const changeBySteamId = new Map(
            changes.map((c) => [c.steamId, c]),
        );

        // 1) 处理已有的待确认项
        const processed = new Set<string>();
        for (const [steamId, pending] of [...this.pending]) {
            processed.add(steamId);

            const summary = summaryBySteamId.get(steamId);
            if (!summary) {
                // 本轮无该用户数据 (缺失/请求失败): 冻结, 计数不变
                frozenSteamIds.add(steamId);
                continue;
            }

            const currentKey = snapshotKey(summary);
            if (currentKey === pending.baselineKey) {
                // 回到基准旧状态: 判为误报, 静默作废
                pluginState.logger.debug(
                    `[FalsePositiveService] ${steamId} 状态回退, 判定误报不推送`,
                );
                this.pending.delete(steamId);
                continue;
            }

            const change = changeBySteamId.get(steamId);
            if (!change) {
                // 状态异于基准但非可识别变化 (如 在线↔忙碌): 维持待确认
                frozenSteamIds.add(steamId);
                continue;
            }

            if (currentKey === pending.expectedKey) {
                // 连续观测到同一新状态
                pending.change = change;
                pending.observations += 1;
                if (pending.observations >= threshold + 1) {
                    // 达到确认次数: 回填首次检出时刻
                    change.detectedAt = pending.firstDetectedAt;
                    confirmed.push(change);
                    this.pending.delete(steamId);
                } else {
                    frozenSteamIds.add(steamId);
                }
            } else {
                // 出现第三个状态: 替换待确认, 基准仍为最初旧状态
                this.pending.set(steamId, {
                    expectedKey: currentKey,
                    baselineKey: pending.baselineKey,
                    change,
                    firstDetectedAt: now,
                    observations: 1,
                });
                frozenSteamIds.add(steamId);
            }
        }

        // 2) 本轮新出现的变化 → 建立待确认
        for (const change of changes) {
            if (processed.has(change.steamId)) continue;

            const baselineKey = change.oldStatus
                ? snapshotKey(change.oldStatus)
                : snapshotKey(change.newStatus);

            this.pending.set(change.steamId, {
                expectedKey: snapshotKey(change.newStatus),
                baselineKey,
                change,
                firstDetectedAt: now,
                observations: 1,
            });
            frozenSteamIds.add(change.steamId);
        }

        if (frozenSteamIds.size > 0) {
            pluginState.logger.debug(
                `[FalsePositiveService] 待确认 ${frozenSteamIds.size} 个, 已确认 ${confirmed.length} 个`,
            );
        }

        return { confirmed, frozenSteamIds };
    }

    /** 是否存在待确认项 */
    hasPending(steamId: string): boolean {
        return this.pending.has(steamId);
    }

    /** 待确认项数量 */
    getPendingCount(): number {
        return this.pending.size;
    }

    /** 清空待确认 (供测试与重置使用) */
    clearPending(): void {
        this.pending.clear();
    }
}

// ==================== 导出单例服务 ====================

export const falsePositiveService = new FalsePositiveService();
