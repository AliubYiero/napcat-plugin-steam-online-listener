import { pluginState } from '../core/state.js';
import type { GameName, GameNameMap } from '../types.js';

/**
 * Steam 游戏名称服务
 * 管理游戏中英文名称的获取与格式化
 *
 * 注意：使用延迟初始化模式，避免模块加载时访问未初始化的 pluginState
 */
class GameNameService {
    private gameNames: GameNameMap | null = null;  // 延迟初始化，初始为 null
    private readonly dataFileName = 'steam-game-names.json';
    private fetchingSet: Set<string> = new Set();
    private initialized = false;  // 初始化状态标志

    constructor() {
        // 延迟初始化：不在构造函数中调用 loadGameNames()
        // 初始化将在首次访问时自动执行
    }

    /**
     * 确保服务已初始化
     * 延迟加载游戏名称数据，避免模块加载时访问未初始化的 pluginState
     */
    private ensureInitialized(): void {
        if (!this.initialized) {
            this.loadGameNames();
            this.initialized = true;
        }
    }

    /**
     * 获取格式化后的游戏名称
     * @param appid Steam游戏ID
     * @param enName 英文名
     * @returns 格式化后的游戏名称
     */
    async getFormattedGameName(appid: string, enName: string): Promise<string> {
        this.ensureInitialized();  // 确保初始化
        const gameName = await this.getGameName(appid, enName);
        return this.formatGameName(gameName);
    }

    /**
     * 获取游戏名称对象（懒加载）
     * 如果游戏不存在于表中，会创建新记录
     * 如果中文名不存在，会异步获取
     */
    private async getGameName(appid: string, enName: string): Promise<GameName> {
        // 确保已初始化（双重检查，防止直接调用）
        this.ensureInitialized();

        // 参数校验
        if (!appid || !enName) {
            pluginState.logger.warn('[GameNameService] appid或enName为空');
            return { en: enName || '未知游戏' };
        }

        // 检查是否已存在
        if (this.gameNames![appid]) {
            const gameName = this.gameNames![appid];

            // 如果英文名有更新，同步更新
            if (gameName.en !== enName) {
                gameName.en = enName;
                this.saveGameNames();
            }

            // 异步获取中文名（如果不存在）
            if (!gameName.zh && !this.fetchingSet.has(appid)) {
                this.fetchChineseName(appid, enName);
            }

            return gameName;
        }

        // 创建新记录
        pluginState.logger.info(`[GameNameService] 发现新游戏: ${enName} (appid=${appid})`);

        const newGameName: GameName = { en: enName };
        this.gameNames![appid] = newGameName;
        this.saveGameNames();

        // 异步获取中文名
        this.fetchChineseName(appid, enName);

        return newGameName;
    }

    /**
     * 格式化游戏名称
     * 规则:
     * 1. 中文名不存在或等于英文名: 返回英文名
     * 2. 中文名包含英文名: 返回中文名
     * 3. 其他情况: 返回 "英文名 / 中文名"
     */
    private formatGameName(gameName: GameName): string {
        const { en, zh } = gameName;

        // 规则1: 中文名不存在或等于英文名
        if (!zh || zh === en) {
            return en;
        }

        // 规则2: 中文名包含英文名（如 "Palworld / 幻兽帕鲁"）
        if (zh.includes(en)) {
            return zh;
        }

        // 规则3: 返回 "英文名 / 中文名"
        return `${en} / ${zh}`;
    }

    /**
     * 从Steam商店API获取中文名
     * @param appid Steam游戏ID
     * @param enName 英文名（用于日志）
     * @returns 是否成功获取
     */
    private async fetchChineseName(appid: string, enName: string): Promise<boolean> {
        // 防重复请求
        if (this.fetchingSet.has(appid)) {
            return false;
        }

        this.fetchingSet.add(appid);

        try {
            pluginState.logger.info(`[GameNameService] 获取游戏中文名: ${enName} (appid=${appid})`);

            const url = `https://store.steampowered.com/api/appdetails/?appids=${appid}&cc=CN&l=schinese`;
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                },
            });

            if (!response.ok) {
                pluginState.logger.warn(`[GameNameService] Steam商店API返回错误: ${response.status} ${response.statusText}`);
                return false;
            }

            const data = await response.json() as Record<string, {
                success: boolean;
                data?: { name: string };
            }>;

            const appData = data[appid];

            if (!appData?.success || !appData.data?.name) {
                pluginState.logger.warn(`[GameNameService] Steam商店API返回失败: appid=${appid}`);
                return false;
            }

            const zhName = appData.data.name;

            // 更新数据
            if (this.gameNames![appid]) {
                this.gameNames![appid].zh = zhName;
                this.saveGameNames();
                pluginState.logger.info(`[GameNameService] 获取中文名成功: ${enName} -> ${zhName}`);
            }

            return true;
        } catch (error) {
            pluginState.logger.warn(`[GameNameService] 获取中文名失败: ${enName} (appid=${appid})`, error);
            return false;
        } finally {
            this.fetchingSet.delete(appid);
        }
    }

    /**
     * 加载游戏名称数据
     */
    private loadGameNames(): void {
        try {
            this.gameNames = pluginState.loadDataFile<GameNameMap>(this.dataFileName, {});
            const count = Object.keys(this.gameNames).length;
            pluginState.logger.info(`[GameNameService] 加载了 ${count} 个游戏名称`);
        } catch (error) {
            pluginState.logger.error('[GameNameService] 加载游戏名称数据失败', error);
            this.gameNames = {};
        }
    }

    /**
     * 保存游戏名称数据
     */
    private saveGameNames(): void {
        try {
            pluginState.saveDataFile<GameNameMap>(this.dataFileName, this.gameNames!);
        } catch (error) {
            pluginState.logger.error('[GameNameService] 保存游戏名称数据失败', error);
        }
    }
}

// 导出单例（模块加载时仅创建实例，不执行初始化）
export const gameNameService = new GameNameService();