/**
 * Steam 状态时间线记录服务
 * 按天记录所有 Steam 用户状态变更, 数据目录只保留今天与昨天的日志,
 * 更早的按天 gzip 归档到 archives/
 */

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { pluginState } from '../core/state';
import type { TimelineLog, TimelineLogEntry } from '../types';
import {
    getChinaDateKey,
    getChinaMidnightTimestamp,
} from '../utils/format';
import {
    type StatusChange,
    type SteamStatusCache,
    type SteamStatusCacheItem,
    steamCacheService,
} from './steam-cache.service';

// ==================== 服务配置 ====================

const LOG_FILE_PREFIX = 'steam-status-log';
const ARCHIVE_DIR = 'archives';
const DATED_LOG_FILE_PATTERN =
    /^steam-status-log-(\d{4})-(\d{1,2})-(\d{1,2})\.json$/;
const DAY_MS = 24 * 60 * 60 * 1000;
const TICK_INTERVAL_MS = 10 * 60 * 1000;
const TICK_TIMER_ID = 'timeline-daily';

function emptyLog(): TimelineLog {
    return {
        h: ['steamId', 'changeType', 'gameId', 'updateTime'],
        d: [],
    };
}

// ==================== Timeline 服务类 ====================

class TimelineService {
    private initialized = false;
    private running = false;
    private logDir = '';
    private archiveDir = '';
    /** 上次执行跨天任务的日期键 */
    private lastDayKey = '';
    private tickTimer: ReturnType<typeof setTimeout> | null = null;

    /**
     * 确保服务已初始化
     */
    private ensureInitialized(): void {
        if (this.initialized) return;

        this.logDir = pluginState.ctx.dataPath;
        this.archiveDir = path.join(this.logDir, ARCHIVE_DIR);

        if (!fs.existsSync(this.archiveDir)) {
            fs.mkdirSync(this.archiveDir, { recursive: true });
        }

        this.initialized = true;
    }

    /**
     * 启动时间线维护: 对齐同日命名 → 补启动快照 → 归档 → 启动跨天定时器
     */
    start(): void {
        if (this.running) return;

        this.ensureInitialized();
        this.running = true;
        this.lastDayKey = getChinaDateKey();

        this.normalizeDateVariants();
        this.startupSnapshot(steamCacheService.getCurrentCache());
        this.checkAndArchive();

        this.scheduleTick();
    }

    /**
     * 停止跨天定时器
     */
    stop(): void {
        this.running = false;
        if (this.tickTimer) {
            clearTimeout(this.tickTimer);
            this.tickTimer = null;
        }
        pluginState.timers.delete(TICK_TIMER_ID);
    }

    /**
     * 排定下一次跨天检查 (对齐墙钟 0/10/20/30/40/50 分)
     */
    private scheduleTick(): void {
        if (!this.running) return;

        const remainder = Date.now() % TICK_INTERVAL_MS;
        const delay =
            remainder === 0
                ? TICK_INTERVAL_MS
                : TICK_INTERVAL_MS - remainder;

        this.tickTimer = setTimeout(() => this.onTick(), delay);
        pluginState.timers.set(TICK_TIMER_ID, this.tickTimer);
    }

    /**
     * 跨天检查: 日期键变化时写新一天快照并归档旧日志
     */
    private onTick(): void {
        try {
            const todayKey = getChinaDateKey();
            if (todayKey !== this.lastDayKey) {
                this.midnightSnapshot(
                    steamCacheService.getCurrentCache(),
                    todayKey,
                    getChinaMidnightTimestamp(todayKey),
                );
                this.lastDayKey = todayKey;
                this.checkAndArchive();
            }
        } catch (e) {
            pluginState.logger.error(
                '[TimelineService] 跨天任务执行失败:',
                e,
            );
        } finally {
            this.scheduleTick();
        }
    }

    // ==================== 文件路径 ====================

    private getLogPath(dateKey: string): string {
        return path.join(
            this.logDir,
            `${LOG_FILE_PREFIX}-${dateKey}.json`,
        );
    }

    /**
     * 从文件名解析日期键 (YYYY-MM-DD), 非日期命名返回 null
     */
    private parseDateKey(fileName: string): string | null {
        const match = DATED_LOG_FILE_PATTERN.exec(fileName);
        if (!match) return null;

        const [, yearStr, monthStr, dayStr] = match;
        const year = Number(yearStr);
        const month = Number(monthStr);
        const day = Number(dayStr);

        const utc = new Date(Date.UTC(year, month - 1, day));
        if (
            utc.getUTCMonth() !== month - 1 ||
            utc.getUTCDate() !== day
        ) {
            return null;
        }

        return `${yearStr}-${String(month).padStart(2, '0')}-${String(
            day,
        ).padStart(2, '0')}`;
    }

    /**
     * 列出数据目录下的日志文件 (不含子目录)
     */
    private listLogFiles(): string[] {
        return fs.readdirSync(this.logDir).filter((name) => {
            if (
                !name.startsWith(LOG_FILE_PREFIX) ||
                !name.endsWith('.json')
            ) {
                return false;
            }
            return (
                fs
                    .statSync(path.join(this.logDir, name), {
                        throwIfNoEntry: false,
                    })
                    ?.isFile() ?? false
            );
        });
    }

    // ==================== 读写 ====================

    /**
     * 加载指定日期的日志文件，不存在则返回空结构
     */
    private loadLogFile(filePath: string): TimelineLog {
        try {
            if (fs.existsSync(filePath)) {
                const content = fs.readFileSync(filePath, 'utf-8');
                return JSON.parse(content) as TimelineLog;
            }
        } catch (e) {
            pluginState.logger.warn(
                '[TimelineService] 读取日志文件失败:',
                e,
            );
        }
        return emptyLog();
    }

    /**
     * 原子保存日志文件 (临时文件 + rename)
     */
    private saveLogFile(filePath: string, log: TimelineLog): void {
        const tmpPath = `${filePath}.tmp`;
        try {
            fs.writeFileSync(
                tmpPath,
                JSON.stringify(log, null, 0),
                'utf-8',
            );
            fs.renameSync(tmpPath, filePath);
        } catch (e) {
            fs.rmSync(tmpPath, { force: true });
            pluginState.logger.error(
                '[TimelineService] 保存日志文件失败:',
                e,
            );
        }
    }

    // ==================== 写入记录 ====================

    /**
     * 将状态变更转换为时间线记录
     */
    private convertToLogEntry(
        change: StatusChange,
        timestamp: number,
    ): TimelineLogEntry {
        return [
            change.steamId,
            change.changeType,
            change.newStatus.gameid || null,
            timestamp,
        ];
    }

    /**
     * 记录状态变更
     *
     * 按状态事件时刻 (detectedAt) 的中国日期分文件保存: 误报检测的确认
     * 延迟不会把前一天的变更写进新一天的文件。
     */
    record(changes: StatusChange[]): void {
        if (changes.length === 0) return;

        this.ensureInitialized();

        const entriesByDay = new Map<string, TimelineLogEntry[]>();
        for (const change of changes) {
            const dayKey = getChinaDateKey(
                new Date(change.detectedAt),
            );
            const entries = entriesByDay.get(dayKey) ?? [];
            entries.push(
                this.convertToLogEntry(change, change.detectedAt),
            );
            entriesByDay.set(dayKey, entries);
        }

        for (const [dayKey, entries] of entriesByDay) {
            this.mergeDayVariants(dayKey);
            const logPath = this.getLogPath(dayKey);
            const log = this.loadLogFile(logPath);
            log.d.push(...entries);
            this.saveLogFile(logPath, log);

            pluginState.logger.debug(
                `[TimelineService] 已记录 ${entries.length} 条状态变更到 ${path.basename(logPath)}`,
            );
        }
    }

    /**
     * 午夜快照: 记录所有用户当天 00:00 的状态
     * 根据 personastate 推导实际状态类型
     * @param cache 当前缓存的所有用户状态
     * @param dayKey 快照所属日期键, 默认今天
     * @param timestamp 快照时间戳, 默认该日中国时间 00:00
     */
    midnightSnapshot(
        cache: Record<string, SteamStatusCacheItem>,
        dayKey: string = getChinaDateKey(),
        timestamp: number = getChinaMidnightTimestamp(dayKey),
    ): void {
        this.ensureInitialized();

        const entries = Object.entries(cache);
        if (entries.length === 0) return;

        this.mergeDayVariants(dayKey);
        const logPath = this.getLogPath(dayKey);
        const log = this.loadLogFile(logPath);

        for (const [steamId, status] of entries) {
            log.d.push([
                steamId,
                this.deriveChangeType(status),
                status.gameid || null,
                timestamp,
            ]);
        }

        this.saveLogFile(logPath, log);

        pluginState.logger.info(
            `[TimelineService] 午夜快照已记录 ${entries.length} 个用户状态`,
        );
    }

    /**
     * 启动补点: 为今日日志中尚无记录的缓存用户补一条起点记录
     *
     * 重启前已在进行中的状态无法还原, 时间戳为启动时刻 (近似值)。
     */
    startupSnapshot(cache: SteamStatusCache): void {
        this.ensureInitialized();

        const entries = Object.entries(cache);
        if (entries.length === 0) return;

        const dayKey = getChinaDateKey();
        this.mergeDayVariants(dayKey);
        const logPath = this.getLogPath(dayKey);
        const log = this.loadLogFile(logPath);
        const recorded = new Set(log.d.map((entry) => entry[0]));

        const timestamp = Date.now();
        let added = 0;
        for (const [steamId, status] of entries) {
            if (recorded.has(steamId)) continue;
            log.d.push([
                steamId,
                this.deriveChangeType(status),
                status.gameid || null,
                timestamp,
            ]);
            added += 1;
        }

        if (added === 0) return;

        this.saveLogFile(logPath, log);

        pluginState.logger.info(
            `[TimelineService] 启动补点已为 ${added} 个用户写入今日起点`,
        );
    }

    private deriveChangeType(status: SteamStatusCacheItem): string {
        if (status.personastate === 0) return 'offline';
        if (status.personastate === 1 && status.gameid) {
            return 'ingame';
        }
        if (status.personastate === 1) return 'online';
        if (status.personastate === 3 || status.personastate === 4) {
            return 'inAfk';
        }
        return 'other';
    }

    // ==================== 同日命名合并 ====================

    /**
     * 合并同一天的补零 / 非补零文件
     *
     * 仅处理同一日期键的多份文件; 单独存在的旧命名文件不动,
     * 留给归档时统一改名。
     */
    normalizeDateVariants(): void {
        this.ensureInitialized();

        try {
            const groups = new Map<string, string[]>();
            for (const name of this.listLogFiles()) {
                const dateKey = this.parseDateKey(name);
                if (!dateKey) continue;
                const names = groups.get(dateKey) ?? [];
                names.push(name);
                groups.set(dateKey, names);
            }

            for (const [dateKey, names] of groups) {
                if (names.length <= 1) continue;
                this.mergeFilesIntoCanonical(dateKey, names);
                pluginState.logger.info(
                    `[TimelineService] 已合并 ${names.length} 个同日日志文件为 ${dateKey}`,
                );
            }
        } catch (e) {
            pluginState.logger.error(
                '[TimelineService] 合并同日日志失败:',
                e,
            );
        }
    }

    /**
     * 写入某天日志前, 把该日期的旧命名文件并入补零文件
     */
    private mergeDayVariants(dateKey: string): void {
        const canonicalName = `${LOG_FILE_PREFIX}-${dateKey}.json`;
        const [year, month, day] = dateKey.split('-');
        const legacyName = `${LOG_FILE_PREFIX}-${Number(
            year,
        )}-${Number(month)}-${Number(day)}.json`;

        if (legacyName === canonicalName) return;
        if (!fs.existsSync(path.join(this.logDir, legacyName)))
            return;

        this.mergeFilesIntoCanonical(
            dateKey,
            [canonicalName, legacyName].filter((name) =>
                fs.existsSync(path.join(this.logDir, name)),
            ),
        );

        pluginState.logger.info(
            `[TimelineService] 已把 ${legacyName} 并入 ${canonicalName}`,
        );
    }

    /**
     * 把一组同日文件按时间排序、去重后写入补零文件, 并删除其余文件
     */
    private mergeFilesIntoCanonical(
        dateKey: string,
        fileNames: string[],
    ): void {
        const canonicalName = `${LOG_FILE_PREFIX}-${dateKey}.json`;
        const canonicalPath = path.join(this.logDir, canonicalName);

        const merged: TimelineLogEntry[] = [];
        const seen = new Set<string>();

        for (const name of fileNames) {
            const log = this.loadLogFile(
                path.join(this.logDir, name),
            );
            for (const entry of log.d) {
                const key = JSON.stringify(entry);
                if (seen.has(key)) continue;
                seen.add(key);
                merged.push(entry);
            }
        }

        merged.sort((a, b) => a[3] - b[3]);
        this.saveLogFile(canonicalPath, {
            ...emptyLog(),
            d: merged,
        });

        for (const name of fileNames) {
            if (name === canonicalName) continue;
            fs.rmSync(path.join(this.logDir, name), {
                force: true,
            });
        }
    }

    // ==================== 归档 ====================

    /**
     * 检查并归档旧日志
     *
     * 只保留今天与昨天; 更早的逐日 gzip 到 archives/,
     * 无法解析日期但带日志前缀的文件原样 gzip 并保留原名。
     */
    checkAndArchive(): void {
        this.ensureInitialized();

        try {
            const todayKey = getChinaDateKey();
            const yesterdayKey = getChinaDateKey(
                new Date(Date.now() - DAY_MS),
            );
            let archived = 0;

            for (const name of fs.readdirSync(this.logDir)) {
                if (!name.startsWith(LOG_FILE_PREFIX)) continue;

                const sourcePath = path.join(this.logDir, name);
                const isFile =
                    fs
                        .statSync(sourcePath, {
                            throwIfNoEntry: false,
                        })
                        ?.isFile() ?? false;
                if (!isFile) continue;

                // 原子写的临时残留: 不归档, 交由下次写入覆盖
                if (name.endsWith('.tmp')) continue;

                const dateKey = this.parseDateKey(name);
                if (dateKey === todayKey) continue;
                if (dateKey === yesterdayKey) continue;

                if (dateKey && dateKey > todayKey) {
                    pluginState.logger.warn(
                        `[TimelineService] 日志日期晚于今天，暂不归档: ${name}`,
                    );
                    continue;
                }

                const archiveName = dateKey
                    ? `${LOG_FILE_PREFIX}-${dateKey}.json.gz`
                    : `${name}.gz`;

                try {
                    if (this.archiveFile(sourcePath, archiveName)) {
                        archived += 1;
                    }
                } catch (e) {
                    // 单个文件失败不阻塞其余文件, 源文件保持原样
                    pluginState.logger.warn(
                        `[TimelineService] 归档 ${name} 失败:`,
                        e,
                    );
                }
            }

            if (archived > 0) {
                pluginState.logger.info(
                    `[TimelineService] 已归档 ${archived} 个日志文件`,
                );
            }
        } catch (e) {
            pluginState.logger.error(
                '[TimelineService] 归档失败:',
                e,
            );
        }
    }

    /**
     * gzip 单个文件并删除源文件
     *
     * 先写临时文件、解压回读校验、rename 落位, 最后才删源。
     * 同名归档已存在时: 内容一致则只删源, 不一致则换 -2/-3 后缀, 永不覆盖。
     *
     * @returns 是否处理了源文件
     */
    private archiveFile(
        sourcePath: string,
        archiveName: string,
    ): boolean {
        const content = fs.readFileSync(sourcePath);
        const basePath = path.join(this.archiveDir, archiveName);

        let targetPath = basePath;
        let suffix = 1;
        while (fs.existsSync(targetPath)) {
            if (this.archiveContentEquals(targetPath, content)) {
                fs.rmSync(sourcePath, { force: true });
                pluginState.logger.debug(
                    `[TimelineService] 归档已存在且内容一致，删除源文件: ${path.basename(sourcePath)}`,
                );
                return true;
            }

            suffix += 1;
            targetPath = this.withSuffix(basePath, suffix);
        }

        const tmpPath = `${targetPath}.tmp-${process.pid}-${Date.now()}`;
        try {
            fs.writeFileSync(tmpPath, zlib.gzipSync(content));
            // 回读校验: 解压失败或内容不一致都不落位
            const verified = zlib.gunzipSync(
                fs.readFileSync(tmpPath),
            );
            if (!verified.equals(content)) {
                throw new Error('归档回读校验失败');
            }
            fs.renameSync(tmpPath, targetPath);
            fs.rmSync(sourcePath, { force: true });
        } catch (e) {
            fs.rmSync(tmpPath, { force: true });
            throw e;
        }

        if (suffix > 1) {
            pluginState.logger.warn(
                `[TimelineService] 归档同名冲突，改存为 ${path.basename(targetPath)}`,
            );
        }

        return true;
    }

    private archiveContentEquals(
        archivePath: string,
        content: Buffer,
    ): boolean {
        try {
            return zlib
                .gunzipSync(fs.readFileSync(archivePath))
                .equals(content);
        } catch {
            return false;
        }
    }

    private withSuffix(targetPath: string, suffix: number): string {
        if (targetPath.endsWith('.json.gz')) {
            return `${targetPath.slice(
                0,
                -'.json.gz'.length,
            )}-${suffix}.json.gz`;
        }
        return `${targetPath}-${suffix}`;
    }
}

// ==================== 导出单例服务 ====================

export const timelineService = new TimelineService();
