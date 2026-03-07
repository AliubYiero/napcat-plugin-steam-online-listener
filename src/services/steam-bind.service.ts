/**
 * Steam 绑定数据服务模块
 * 使用内存缓存管理绑定数据，避免每次操作都从磁盘读取
 */

import { pluginState } from '../core/state';
import type { SteamBindData, SteamBindItem } from '../types';
import * as fs from 'fs';
import * as path from 'path';

const BACKUP_DIR = '../backup';
const MAX_BACKUP_FILES = 5;

class SteamBindService {
    private readonly dataFileName = 'steam-bind-data.json';
    private initialized = false;
    private data: SteamBindData = [];

    /**
     * 确保服务已初始化（延迟加载绑定数据）
     */
    private ensureInitialized(): void {
        if (this.initialized) return;
        this.data = this.loadFromDisk();
        this.initialized = true;
    }

    /**
     * 从磁盘加载绑定数据
     * 如果主文件加载失败或为空，则尝试从备份恢复
     */
    private loadFromDisk(): SteamBindData {
        try {
            const data = pluginState.loadDataFile<SteamBindData>(this.dataFileName, []);

            if (data.length === 0) {
                const backupData = this.restoreFromBackup();
                if (backupData !== null) {
                    pluginState.saveDataFile<SteamBindData>(this.dataFileName, backupData);
                    pluginState.logger.info('已从备份恢复 Steam 绑定数据');
                    return backupData;
                }
            }

            return data;
        } catch (error) {
            pluginState.logger.warn('从主文件加载 Steam 绑定数据失败，尝试从备份恢复:', error);

            const backupData = this.restoreFromBackup();
            if (backupData !== null) {
                pluginState.saveDataFile<SteamBindData>(this.dataFileName, backupData);
                pluginState.logger.info('已从备份恢复 Steam 绑定数据');
                return backupData;
            }

            pluginState.logger.error('从备份恢复 Steam 绑定数据也失败，返回空数组');
            return [];
        }
    }

    /**
     * 将当前内存数据持久化到磁盘
     */
    private saveToDisk(): void {
        pluginState.saveDataFile<SteamBindData>(this.dataFileName, this.data);
    }

    // ==================== 公开方法 ====================

    /**
     * 获取所有绑定数据
     */
    getAll(): SteamBindData {
        this.ensureInitialized();
        return this.data;
    }

    /**
     * 替换全部绑定数据并持久化
     */
    save(data: SteamBindData): void {
        if (data === null || data === undefined) {
            pluginState.logger.warn('尝试保存空的 Steam 绑定数据，已阻止');
            return;
        }

        if (!Array.isArray(data)) {
            pluginState.logger.error('Steam 绑定数据格式错误，不是数组格式，已阻止保存');
            return;
        }

        this.ensureInitialized();
        this.data = data;
        this.saveToDisk();
    }

    /**
     * 根据 Steam ID 查找绑定项
     */
    findBySteamId(steamId: string): SteamBindItem | undefined {
        this.ensureInitialized();
        return this.data.find(item => item.steamId === steamId);
    }

    /**
     * 根据昵称查找绑定项（在所有来源中查找）
     */
    findByNickname(nickname: string): SteamBindItem | undefined {
        this.ensureInitialized();
        return this.data.find(item =>
            item.from && item.from.some(fromInfo => fromInfo.nickname === nickname)
        );
    }

    /**
     * 根据来源获取绑定项
     */
    findByFrom(fromId: string, fromType: 'private' | 'group'): SteamBindItem[] {
        this.ensureInitialized();
        return this.data.filter(item => {
            if (!item.from) return false;
            return item.from.some(fromInfo => fromInfo.id === fromId && fromInfo.type === fromType);
        });
    }

    /**
     * 添加或更新绑定项
     */
    update(bindItem: SteamBindItem): void {
        this.ensureInitialized();
        const index = this.data.findIndex(item => item.steamId === bindItem.steamId);

        if (index !== -1) {
            const existingItem = this.data[index];
            const updatedItem = { ...existingItem, ...bindItem };

            if (bindItem.from && existingItem.from) {
                const mergedFrom = [...existingItem.from];
                for (const newFrom of bindItem.from) {
                    const existingIndex = mergedFrom.findIndex(
                        existingFrom => existingFrom.id === newFrom.id && existingFrom.type === newFrom.type
                    );

                    if (existingIndex !== -1) {
                        mergedFrom[existingIndex] = { ...mergedFrom[existingIndex], ...newFrom };
                    } else {
                        mergedFrom.push(newFrom);
                    }
                }
                updatedItem.from = mergedFrom;
            } else if (bindItem.from && !existingItem.from) {
                updatedItem.from = bindItem.from;
            }

            this.data[index] = updatedItem;
        } else {
            this.data.push(bindItem);
        }

        this.saveToDisk();
        this.backup();
    }

    /**
     * 从绑定项中移除指定来源
     * 如果移除后 from 数组为空，则删除整个绑定项
     */
    removeFrom(fromId: string, fromType: 'private' | 'group'): void {
        this.ensureInitialized();
        this.data = this.data.map(item => {
            if (item.from) {
                const filteredFrom = item.from.filter(
                    fromInfo => !(fromInfo.id === fromId && fromInfo.type === fromType)
                );

                if (filteredFrom.length > 0) {
                    return { ...item, from: filteredFrom };
                } else {
                    return null;
                }
            }
            return null;
        }).filter(item => item !== null) as SteamBindData;

        this.saveToDisk();
    }

    // ==================== 备份和恢复 ====================

    /**
     * 创建绑定数据的备份
     */
    backup(): void {
        try {
            this.ensureInitialized();
            const backupDirPath = path.resolve(pluginState.ctx.dataPath, BACKUP_DIR);

            if (!fs.existsSync(backupDirPath)) {
                fs.mkdirSync(backupDirPath, { recursive: true });
            }

            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const backupFileName = `steam-bind-data.backup.${timestamp}.json`;
            const backupFilePath = path.join(backupDirPath, backupFileName);

            fs.writeFileSync(backupFilePath, JSON.stringify(this.data, null, 2), 'utf-8');

            pluginState.logger.info(`Steam 绑定数据已备份到: ${backupFileName}`);

            this.cleanupOldBackups();
        } catch (error) {
            pluginState.logger.error('创建 Steam 绑定数据备份失败:', error);
        }
    }

    /**
     * 清理旧的备份文件，保留最新的 MAX_BACKUP_FILES 个
     */
    private cleanupOldBackups(): void {
        try {
            const backupDirPath = path.resolve(pluginState.ctx.dataPath, BACKUP_DIR);

            if (!fs.existsSync(backupDirPath)) {
                return;
            }

            const files = fs.readdirSync(backupDirPath);
            const backupFiles = files.filter(file =>
                file.startsWith('steam-bind-data.backup.') && file.endsWith('.json')
            );

            backupFiles.sort((a, b) => {
                const timestampA = a.replace('steam-bind-data.backup.', '').replace('.json', '');
                const timestampB = b.replace('steam-bind-data.backup.', '').replace('.json', '');
                return timestampB.localeCompare(timestampA);
            });

            for (let i = MAX_BACKUP_FILES; i < backupFiles.length; i++) {
                const filePath = path.join(backupDirPath, backupFiles[i]);
                fs.unlinkSync(filePath);
                pluginState.logger.info(`已删除旧的备份文件: ${backupFiles[i]}`);
            }
        } catch (error) {
            pluginState.logger.error('清理旧备份文件失败:', error);
        }
    }

    /**
     * 获取最新的备份文件路径
     */
    private getLatestBackupFile(): string | null {
        try {
            const backupDirPath = path.resolve(pluginState.ctx.dataPath, BACKUP_DIR);

            if (!fs.existsSync(backupDirPath)) {
                return null;
            }

            const files = fs.readdirSync(backupDirPath);
            const backupFiles = files.filter(file =>
                file.startsWith('steam-bind-data.backup.') && file.endsWith('.json')
            );

            if (backupFiles.length === 0) {
                return null;
            }

            backupFiles.sort((a, b) => {
                const timestampA = a.replace('steam-bind-data.backup.', '').replace('.json', '');
                const timestampB = b.replace('steam-bind-data.backup.', '').replace('.json', '');
                return timestampB.localeCompare(timestampA);
            });

            return path.join(backupDirPath, backupFiles[0]);
        } catch (error) {
            pluginState.logger.error('获取最新备份文件失败:', error);
            return null;
        }
    }

    /**
     * 从备份文件恢复数据
     */
    private restoreFromBackup(): SteamBindData | null {
        try {
            const latestBackupPath = this.getLatestBackupFile();

            if (!latestBackupPath) {
                pluginState.logger.warn('未找到备份文件');
                return null;
            }

            const backupData = JSON.parse(fs.readFileSync(latestBackupPath, 'utf-8')) as SteamBindData;

            pluginState.logger.info(`已从备份文件恢复数据: ${path.basename(latestBackupPath)}`);

            return backupData;
        } catch (error) {
            pluginState.logger.error('从备份恢复数据失败:', error);
            return null;
        }
    }
}

// ==================== 导出单例服务 ====================

export const steamBindService = new SteamBindService();
