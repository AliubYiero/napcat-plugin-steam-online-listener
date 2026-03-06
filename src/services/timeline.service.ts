/**
 * Steam 状态时间线记录服务
 * 按天记录所有 Steam 用户状态变更，7天后自动归档为 ZIP
 */

import fs from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';
import { pluginState } from '../core/state';
import type { StatusChange, SteamStatusCacheItem } from './steam-cache.service';
import type { TimelineLog, TimelineLogEntry } from '../types';

// ==================== 服务配置 ====================

const LOG_FILE_PREFIX = 'steam-status-log';
const ARCHIVE_DIR = 'archives';
const ARCHIVE_DAYS = 7; // 7天后归档

// ==================== Timeline 服务类 ====================

class TimelineService {
    private initialized = false;
    private logDir: string = '';
    private archiveDir: string = '';

    /**
     * 确保服务已初始化
     */
    private ensureInitialized(): void {
        if (this.initialized) return;

        this.logDir = pluginState.ctx.dataPath;
        this.archiveDir = path.join(this.logDir, ARCHIVE_DIR);

        // 确保归档目录存在
        if (!fs.existsSync(this.archiveDir)) {
            fs.mkdirSync(this.archiveDir, { recursive: true });
        }

        this.initialized = true;
    }

    /**
     * 获取当天日志文件路径
     */
    private getTodayLogPath(): string {
        const today = new Date().toLocaleDateString('zh-CN').replace(/\//g, '-');
        const filename = `${LOG_FILE_PREFIX}-${today}.json`;
        return path.join(this.logDir, filename);
    }

    /**
     * 获取日期对应的日志文件路径
     */
    private getLogPathForDate(dateStr: string): string {
        const filename = `${LOG_FILE_PREFIX}-${dateStr}.json`;
        return path.join(this.logDir, filename);
    }

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
            pluginState.logger.warn('[TimelineService] 读取日志文件失败:', e);
        }
        return { h: ['steamId', 'changeType', 'gameId', 'updateTime'], d: [] };
    }

    /**
     * 保存日志文件
     */
    private saveLogFile(filePath: string, log: TimelineLog): void {
        try {
            fs.writeFileSync(filePath, JSON.stringify(log, null, 0), 'utf-8');
        } catch (e) {
            pluginState.logger.error('[TimelineService] 保存日志文件失败:', e);
        }
    }

    /**
     * 将状态变更转换为时间线记录
     */
    private convertToLogEntry(change: StatusChange): TimelineLogEntry {
        return [
            change.steamId,
            change.changeType,
            change.newStatus.gameid || null,
            Date.now(),
        ];
    }

    /**
     * 记录状态变更
     * @param changes 状态变更数组
     */
    record(changes: StatusChange[]): void {
        if (changes.length === 0) return;

        this.ensureInitialized();

        const logPath = this.getTodayLogPath();
        const log = this.loadLogFile(logPath);

        // 将变更转换为记录并追加
        for (const change of changes) {
            log.d.push(this.convertToLogEntry(change));
        }

        this.saveLogFile(logPath, log);

        pluginState.logger.debug(
            `[TimelineService] 已记录 ${changes.length} 条状态变更到 ${path.basename(logPath)}`
        );
    }

    /**
     * 午夜快照：记录所有用户当前状态
     * @param cache 当前缓存的所有用户状态
     */
    midnightSnapshot(cache: Record<string, SteamStatusCacheItem>): void {
        this.ensureInitialized();

        const logPath = this.getTodayLogPath();
        const log = this.loadLogFile(logPath);
        const timestamp = Date.now();

        // 为每个用户记录当前状态
        for (const [steamId, status] of Object.entries(cache)) {
            const entry: TimelineLogEntry = [
                steamId,
                'snapshot',
                status.gameid || null,
                timestamp,
            ];
            log.d.push(entry);
        }

        this.saveLogFile(logPath, log);

        pluginState.logger.info(
            `[TimelineService] 午夜快照已记录 ${Object.keys(cache).length} 个用户状态`
        );
    }

    /**
     * 检查并归档旧日志文件
     * 将7天前的日志文件打包为 ZIP
     */
    checkAndArchive(): void {
        this.ensureInitialized();

        try {
            // 获取所有日志文件
            const files = fs.readdirSync(this.logDir);
            const logFiles = files.filter(f =>
                f.startsWith(LOG_FILE_PREFIX) && f.endsWith('.json')
            );

            if (logFiles.length <= ARCHIVE_DAYS) {
                return; // 不需要归档
            }

            // 按日期排序
            logFiles.sort();

            // 获取需要归档的文件（保留最近7天）
            const filesToArchive = logFiles.slice(0, logFiles.length - ARCHIVE_DAYS);

            if (filesToArchive.length === 0) return;

            // 生成归档文件名
            const firstDate = filesToArchive[0].replace(`${LOG_FILE_PREFIX}-`, '').replace('.json', '');
            const lastDate = filesToArchive[filesToArchive.length - 1].replace(`${LOG_FILE_PREFIX}-`, '').replace('.json', '');
            const archiveName = `${LOG_FILE_PREFIX}-${firstDate}-to-${lastDate}.zip`;
            const archivePath = path.join(this.archiveDir, archiveName);

            // 创建 ZIP 归档
            const zip = new AdmZip();

            for (const file of filesToArchive) {
                const filePath = path.join(this.logDir, file);
                zip.addLocalFile(filePath);
            }

            zip.writeZip(archivePath);

            // 删除已归档的源文件
            for (const file of filesToArchive) {
                const filePath = path.join(this.logDir, file);
                fs.unlinkSync(filePath);
            }

            pluginState.logger.info(
                `[TimelineService] 已归档 ${filesToArchive.length} 个日志文件到 ${archiveName}`
            );
        } catch (e) {
            pluginState.logger.error('[TimelineService] 归档失败:', e);
        }
    }
}

// ==================== 导出单例服务 ====================

export const timelineService = new TimelineService();
