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
     * 设置游戏名称（创建或更新）
     * 用于显式创建/更新游戏记录
     * @param appid Steam游戏ID
     * @param enName 英文名称
     */
    setGameName(appid: string, enName: string): void {
        this.ensureInitialized();

        // 参数校验
        if (!appid || !enName) {
            pluginState.logger.warn('[GameNameService] appid或enName为空，无法设置游戏名称');
            return;
        }

        // 设置英文名称（覆盖或创建）
        if (!this.gameNames![appid]) {
            this.gameNames![appid] = { en: enName };
            pluginState.logger.info(`[GameNameService] 创建新游戏记录: ${enName} (appid=${appid})`);
        } else {
            this.gameNames![appid].en = enName;
            pluginState.logger.info(`[GameNameService] 更新游戏英文名: ${enName} (appid=${appid})`);
        }

        this.saveGameNames();

        // 异步获取中文名（如果不存在且不在获取中）
        if (!this.gameNames![appid].zh && !this.fetchingSet.has(appid)) {
            this.fetchChineseName(appid, enName);
        }
    }

    /**
     * 获取游戏名称对象（懒加载）
     * 如果游戏不存在于表中且提供了enName，会创建新记录
     * 如果中文名不存在，会异步获取
     * @param appid Steam游戏ID
     * @param enName 英文名（可选，不传时只查询不创建）
     * @returns 游戏名称对象，不存在时返回null
     */
    private async getGameName(appid: string, enName?: string): Promise<GameName | null> {
        // 确保已初始化（双重检查，防止直接调用）
        this.ensureInitialized();

        // 参数校验
        if (!appid) {
            pluginState.logger.warn('[GameNameService] appid为空');
            return null;
        }

        // 检查是否已存在
        if (this.gameNames![appid]) {
            const gameName = this.gameNames![appid];

            // 如果英文名有更新，同步更新
            if (enName && gameName.en !== enName) {
                gameName.en = enName;
                this.saveGameNames();
            }

            // 异步获取中文名（如果不存在）
            if (!gameName.zh && !this.fetchingSet.has(appid)) {
                this.fetchChineseName(appid, gameName.en);
            }

            return gameName;
        }

        // 如果不存在且没有提供 enName，返回 null
        if (!enName) {
            return null;
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
     * 1. 中文名不存在: 返回英文名
     * 2. 中文名等于英文名(忽略大小写): 返回英文名
     * 3. 中文名包含英文名(忽略大小写): 返回中文名
     * 4. 英文名包含中文名: 返回英文名
     * 5. 其他情况: 返回 "英文名 / 中文名"
     */
    private formatGameName(gameName: GameName): string {
        const { en, zh } = gameName;

        // 规则1: 中文名不存在
        if (!zh) {
            return en;
        }

        const enLower = en.toLowerCase();
        const zhLower = zh.toLowerCase();

        // 规则2: 中文名等于英文名(忽略大小写)
        if (zhLower === enLower) {
            return en;
        }

        // 规则3: 中文名包含英文名(忽略大小写)
        if (zhLower.includes(enLower)) {
            return zh;
        }

        // 规则4: 英文名包含中文名
        if (en.includes(zh)) {
            return en;
        }

        // 规则5: 返回 "英文名 / 中文名"
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

    // ==================== 游戏名称管理 API ====================

    /**
     * 获取所有游戏名称
     * @returns 游戏名称列表
     */
    getAllGames(): Array<{ appid: string; en: string; zh?: string }> {
        this.ensureInitialized();
        return Object.entries(this.gameNames || {}).map(([appid, game]) => ({
            appid,
            en: game.en,
            zh: game.zh,
        }));
    }

    /**
     * 更新游戏中文名称
     * @param appid Steam游戏ID
     * @param zh 新的中文名称
     * @returns 是否成功
     */
    updateChineseName(appid: string, zh: string): boolean {
        this.ensureInitialized();

        if (!appid || !this.gameNames?.[appid]) {
            pluginState.logger.warn(`[GameNameService] 游戏不存在: ${appid}`);
            return false;
        }

        this.gameNames[appid].zh = zh;
        this.saveGameNames();
        pluginState.logger.info(`[GameNameService] 更新中文名: ${this.gameNames[appid].en} -> ${zh}`);
        return true;
    }

    /**
     * 删除游戏名称条目
     * @param appid Steam游戏ID
     * @returns 是否成功
     */
    deleteGame(appid: string): boolean {
        this.ensureInitialized();

        if (!appid || !this.gameNames?.[appid]) {
            pluginState.logger.warn(`[GameNameService] 游戏不存在: ${appid}`);
            return false;
        }

        const gameName = this.gameNames[appid].en;
        delete this.gameNames[appid];
        this.saveGameNames();
        pluginState.logger.info(`[GameNameService] 删除游戏: ${gameName} (appid=${appid})`);
        return true;
    }
}

// 导出单例（模块加载时仅创建实例，不执行初始化）
export const gameNameService = new GameNameService();