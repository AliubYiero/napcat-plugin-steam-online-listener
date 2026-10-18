/**
 * 全局状态管理模块（单例模式）
 *
 * 封装插件的配置持久化和运行时状态，提供在项目任意位置访问
 * ctx、config、logger 等对象的能力，无需逐层传递参数。
 *
 * 使用方法：
 *   import { pluginState } from '../core/state';
 *   pluginState.config.steamApiKey;    // 读取配置
 *   pluginState.ctx.logger.info(...);  // 使用日志
 */

import fs from 'node:fs';
import path from 'node:path';
import type {
    NapCatPluginContext,
    PluginLogger,
} from 'napcat-types/napcat-onebot/network/plugin/types';
import { sanitizeConfig } from 'shared';
import { DEFAULT_CONFIG } from '../config';
import type { PluginConfig } from '../types';

// ==================== 配置清洗工具 ====================

/**
 * 配置清洗函数 (re-export)
 *
 * 实现已迁至 shared/src/config.ts: 从字段描述符 (FIELDS) 按 kind 派生清洗规则,
 * 新增字段只需改 shared。此处 re-export 保持既有导入路径 (core/state) 不变。
 */
export { sanitizeConfig };

/** 运行时统计 (独立持久化到 stats.json, 不写入插件配置文件) */
export interface PluginStats {
    /** 累计处理的指令数 */
    processed: number;
    /** 当日处理的指令数 */
    todayProcessed: number;
    /** 上次跨天重置的日期标记 */
    lastUpdateDay: string;
}

const STATS_FILENAME = 'stats.json';

// ==================== 插件全局状态类 ====================

class PluginState {
    /** NapCat 插件上下文（init 后可用） */
    private _ctx: NapCatPluginContext | null = null;

    /** 插件配置 */
    config: PluginConfig = { ...getDefaultConfigCopy() };

    /** 插件启动时间戳 */
    startTime: number = 0;

    /** 机器人自身 QQ 号 */
    selfId: string = '';

    /** 活跃的定时器 Map: jobId -> NodeJS.Timeout */
    timers: Map<string, ReturnType<typeof setInterval>> = new Map();

    /** 运行时统计 */
    stats: PluginStats = {
        processed: 0,
        todayProcessed: 0,
        lastUpdateDay: new Date().toDateString(),
    };

    /** 获取上下文（确保已初始化） */
    get ctx(): NapCatPluginContext {
        if (!this._ctx)
            throw new Error(
                'PluginState 尚未初始化，请先调用 init()',
            );
        return this._ctx;
    }

    /** 获取日志器的快捷方式 */
    get logger(): PluginLogger {
        return this.ctx.logger;
    }

    // ==================== 生命周期 ====================

    /**
     * 初始化（在 plugin_init 中调用）
     */
    init(ctx: NapCatPluginContext): void {
        this._ctx = ctx;
        this.startTime = Date.now();
        this.ensureDataDir();
        this.loadConfig();
        this.loadStats();
        this.fetchSelfId();
    }

    /**
     * 获取机器人自身 QQ 号（异步，init 时自动调用）
     */
    private async fetchSelfId(): Promise<void> {
        try {
            const res = (await this.ctx.actions.call(
                'get_login_info',
                {},
                this.ctx.adapterName,
                this.ctx.pluginManager.config,
            )) as { user_id?: number | string };
            if (res?.user_id) {
                this.selfId = String(res.user_id);
                this.logger.debug(
                    `(｡·ω·｡) 机器人 QQ: ${this.selfId}`,
                );
            }
        } catch (e) {
            this.logger.warn('(；′⌒`) 获取机器人 QQ 号失败:', e);
        }
    }

    /**
     * 清理（在 plugin_cleanup 中调用）
     */
    cleanup(): void {
        // 清理所有定时器
        for (const [jobId, timer] of this.timers) {
            clearInterval(timer);
            this.logger.debug(`(｡-ω-) 清理定时器: ${jobId}`);
        }
        this.timers.clear();
        this.saveStats();
        this._ctx = null;
    }

    // ==================== 数据目录 ====================

    /** 确保数据目录存在 */
    private ensureDataDir(): void {
        const dataPath = this.ctx.dataPath;
        if (!fs.existsSync(dataPath)) {
            fs.mkdirSync(dataPath, { recursive: true });
        }
    }

    /** 获取数据文件完整路径 */
    getDataFilePath(filename: string): string {
        return path.join(this.ctx.dataPath, filename);
    }

    // ==================== 通用数据文件读写 ====================

    /**
     * 读取 JSON 数据文件
     * 常用于订阅数据、定时任务配置、推送历史等持久化数据
     * @param filename 数据文件名（如 'subscriptions.json'）
     * @param defaultValue 文件不存在或解析失败时的默认值
     */
    loadDataFile<T>(filename: string, defaultValue: T): T {
        const filePath = this.getDataFilePath(filename);
        try {
            if (fs.existsSync(filePath)) {
                return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
            }
        } catch (e) {
            this.logger.warn(
                `(；′⌒\`) 读取数据文件 ${filename} 失败:`,
                e,
            );
        }
        return defaultValue;
    }

    /**
     * 保存 JSON 数据文件
     * @param filename 数据文件名
     * @param data 要保存的数据
     * @param space 保存文件的空白符
     */
    saveDataFile<T>(
        filename: string,
        data: T,
        space: number = 0,
    ): void {
        const filePath = this.getDataFilePath(filename);
        try {
            fs.writeFileSync(
                filePath,
                JSON.stringify(data, null, space),
                'utf-8',
            );
        } catch (e) {
            this.logger.error(
                `(╥﹏╥) 保存数据文件 ${filename} 失败:`,
                e,
            );
        }
    }

    // ==================== 配置管理 ====================

    /**
     * 从磁盘加载配置
     *
     * 【必须】读取后一律经 sanitizeConfig 清洗并回写: 旧版本遗留的键
     * (enabled / commandPrefix / debug / cooldownSeconds / groupConfigs 等)
     * 会被静默丢弃, 同时把清洗结果落盘 (幂等)。
     */
    loadConfig(): void {
        const configPath = this.ctx.configPath;
        try {
            if (configPath && fs.existsSync(configPath)) {
                const raw = JSON.parse(
                    fs.readFileSync(configPath, 'utf-8'),
                );
                this.config = sanitizeConfig(raw);
                this.ctx.logger.debug('已加载本地配置');
            } else {
                this.config = getDefaultConfigCopy();
                this.ctx.logger.debug(
                    '配置文件不存在，已创建默认配置',
                );
            }
        } catch (error) {
            this.ctx.logger.error(
                '加载配置失败，使用默认配置:',
                error,
            );
            this.config = getDefaultConfigCopy();
        }
        // 清洗后回写 (丢弃旧键; 首启创建默认配置)
        this.saveConfig();
    }

    /**
     * 保存配置到磁盘 (仅插件配置, 不含 stats)
     */
    saveConfig(): void {
        if (!this._ctx) return;
        const configPath = this._ctx.configPath;
        try {
            const configDir = path.dirname(configPath);
            if (!fs.existsSync(configDir)) {
                fs.mkdirSync(configDir, { recursive: true });
            }
            fs.writeFileSync(
                configPath,
                JSON.stringify(this.config, null, 2),
                'utf-8',
            );
        } catch (error) {
            this._ctx.logger.error('保存配置失败:', error);
        }
    }

    /**
     * 合并更新配置
     *
     * 【必须】仅限内部可信调用方使用 (字段已被上游清洗或来自默认配置)。
     * 来源不可信时 (WebUI 提交、指令修改、直接读盘) 一律走 replaceConfig,
     * 由它统一清洗。
     */
    updateConfig(partial: Partial<PluginConfig>): void {
        this.config = { ...this.config, ...partial };
        this.saveConfig();
    }

    /**
     * 完整替换配置 (入口统一清洗后再保存)
     */
    replaceConfig(config: PluginConfig): void {
        this.config = sanitizeConfig(config);
        this.saveConfig();
    }

    // ==================== 统计 ====================

    /** 从 stats.json 加载统计 */
    private loadStats(): void {
        const raw = this.loadDataFile<Partial<PluginStats>>(
            STATS_FILENAME,
            {},
        );
        if (raw && typeof raw === 'object') {
            if (typeof raw.processed === 'number')
                this.stats.processed = raw.processed;
            if (typeof raw.todayProcessed === 'number')
                this.stats.todayProcessed = raw.todayProcessed;
            if (typeof raw.lastUpdateDay === 'string')
                this.stats.lastUpdateDay = raw.lastUpdateDay;
        }
    }

    /** 保存统计到 stats.json */
    saveStats(): void {
        if (!this._ctx) return;
        this.saveDataFile(STATS_FILENAME, this.stats, 2);
    }

    /**
     * 增加处理计数
     */
    incrementProcessed(): void {
        const today = new Date().toDateString();
        if (this.stats.lastUpdateDay !== today) {
            this.stats.todayProcessed = 0;
            this.stats.lastUpdateDay = today;
        }
        this.stats.todayProcessed++;
        this.stats.processed++;
    }

    // ==================== 工具方法 ====================

    /** 获取运行时长（毫秒） */
    getUptime(): number {
        return Date.now() - this.startTime;
    }

    /** 获取格式化的运行时长 */
    getUptimeFormatted(): string {
        const ms = this.getUptime();
        const s = Math.floor(ms / 1000);
        const m = Math.floor(s / 60);
        const h = Math.floor(m / 60);
        const d = Math.floor(h / 24);

        if (d > 0) return `${d}天${h % 24}小时`;
        if (h > 0) return `${h}小时${m % 60}分钟`;
        if (m > 0) return `${m}分钟${s % 60}秒`;
        return `${s}秒`;
    }
}

/** 取一份默认配置的可变副本 (避免共享引用被就地改动) */
function getDefaultConfigCopy(): PluginConfig {
    return {
        ...DEFAULT_CONFIG,
        adminUsers: [...DEFAULT_CONFIG.adminUsers],
        notifyStatusTypes: [...DEFAULT_CONFIG.notifyStatusTypes],
    };
}

/** 导出全局单例 */
export const pluginState = new PluginState();
