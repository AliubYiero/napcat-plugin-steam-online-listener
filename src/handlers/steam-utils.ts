/**
 * Steam相关工具函数
 * 包含Steam绑定数据管理等功能
 */

import { pluginState } from '../core/state';
import type { SteamBindData, SteamBindItem } from '../types';
import * as fs from 'fs';
import * as path from 'path';

// ==================== Steam 绑定数据管理 ====================

const STEAM_BIND_DATA_FILE = 'steam-bind-data.json';
const BACKUP_DIR = '../backup';
const MAX_BACKUP_FILES = 5;

/**
 * 加载 Steam 绑定数据
 * 如果无法加载主数据文件，则尝试从备份恢复
 */
export function loadSteamBindData(): SteamBindData {
    try {
        // 首先尝试从主数据文件加载
        const data = pluginState.loadDataFile<SteamBindData>(STEAM_BIND_DATA_FILE, []);
        
        // 如果数据为空且存在备份，则尝试从备份恢复
        if (data.length === 0) {
            const backupData = restoreSteamBindDataFromBackup();
            if (backupData !== null) {
                // 将备份数据恢复到主文件
                saveSteamBindData(backupData);
                pluginState.logger.info('已从备份恢复 Steam 绑定数据');
                return backupData;
            }
        }
        
        return data;
    } catch (error) {
        pluginState.logger.warn('从主文件加载 Steam 绑定数据失败，尝试从备份恢复:', error);
        
        // 尝试从备份恢复
        const backupData = restoreSteamBindDataFromBackup();
        if (backupData !== null) {
            // 将备份数据恢复到主文件
            saveSteamBindData(backupData);
            pluginState.logger.info('已从备份恢复 Steam 绑定数据');
            return backupData;
        }
        
        // 如果备份也失败，返回默认空数组
        pluginState.logger.error('从备份恢复 Steam 绑定数据也失败，返回空数组');
        return [];
    }
}

/**
 * 保存 Steam 绑定数据
 */
export function saveSteamBindData(data: SteamBindData): void {
    // 确保数据不是 undefined 或 null
    if (data === null || data === undefined) {
        pluginState.logger.warn('尝试保存空的 Steam 绑定数据，已阻止');
        return;
    }
    
    // 确保数据是数组
    if (!Array.isArray(data)) {
        pluginState.logger.error('Steam 绑定数据格式错误，不是数组格式，已阻止保存');
        return;
    }
    
    pluginState.saveDataFile<SteamBindData>(STEAM_BIND_DATA_FILE, data);
}

/**
 * 根据 Steam ID 查找绑定项
 */
export function findSteamBindItem(steamId: string): SteamBindItem | undefined {
    const data = loadSteamBindData();
    return data.find(item => item.steamId === steamId);
}

/**
 * 添加或更新 Steam 绑定项
 */
export function updateSteamBindItem(bindItem: SteamBindItem): void {
    const data = loadSteamBindData();
    const index = data.findIndex(item => item.steamId === bindItem.steamId);
    
    if (index !== -1) {
        // 如果存在，需要合并from数组
        const existingItem = data[index];
        const updatedItem = { ...existingItem, ...bindItem };
        
        // 如果新项包含from数组，需要合并
        if (bindItem.from && existingItem.from) {
            // 合并from数组，避免重复
            const mergedFrom = [...existingItem.from];
            for (const newFrom of bindItem.from) {
                const existingIndex = mergedFrom.findIndex(
                    existingFrom => existingFrom.id === newFrom.id && existingFrom.type === newFrom.type
                );
                
                if (existingIndex !== -1) {
                    // 如果来源已存在，合并属性（保留新来源的昵称）
                    mergedFrom[existingIndex] = { ...mergedFrom[existingIndex], ...newFrom };
                } else {
                    // 如果来源不存在，则添加
                    mergedFrom.push(newFrom);
                }
            }
            updatedItem.from = mergedFrom;
        } else if (bindItem.from && !existingItem.from) {
            // 如果原项没有from数组但新项有，则使用新项的from
            updatedItem.from = bindItem.from;
        }
        
        data[index] = updatedItem;
    } else {
        data.push(bindItem);
    }
    saveSteamBindData(data);
    // 每次绑定操作执行后进行备份
    backupSteamBindData();
}

/**
 * 根据昵称查找绑定项（在所有来源中查找）
 */
export function findSteamBindItemByNickname(nickname: string): SteamBindItem | undefined {
    const data = loadSteamBindData();
    return data.find(item => 
        item.from && item.from.some(fromInfo => fromInfo.nickname === nickname)
    );
}

/**
 * 根据来源获取绑定项
 */
export function findSteamBindItemsByFrom(fromId: string, fromType: 'private' | 'group'): SteamBindItem[] {
    const data = loadSteamBindData();
    return data.filter(item => {
        if (!item.from) return false;
        return item.from.some(fromInfo => fromInfo.id === fromId && fromInfo.type === fromType);
    });
}

/**
 * 从绑定项中移除指定来源
 * 如果移除后from数组为空，则删除整个绑定项
 */
export function removeSteamBindItemFrom(fromId: string, fromType: 'private' | 'group'): void {
    const data = loadSteamBindData();
    const updatedData = data.map(item => {
        if (item.from) {
            // 过滤掉指定来源的记录
            const filteredFrom = item.from.filter(
                fromInfo => !(fromInfo.id === fromId && fromInfo.type === fromType)
            );
            
            // 如果过滤后还存在其他来源，只更新from数组
            if (filteredFrom.length > 0) {
                return { ...item, from: filteredFrom };
            } else {
                // 如果没有其他来源了，移除整个绑定项
                return null;
            }
        }
        // 如果没有from数组，则直接返回null（移除该项）
        return null;
    }).filter(item => item !== null) as SteamBindData;

    saveSteamBindData(updatedData);
}

// ==================== 备份和恢复功能 ====================

/**
 * 创建steam-bind-data.json的备份
 */
export function backupSteamBindData(): void {
    try {
        const dataPath = pluginState.getDataFilePath(STEAM_BIND_DATA_FILE);
        const backupDirPath = path.resolve(pluginState.ctx.dataPath, BACKUP_DIR);
        
        // 确保备份目录存在
        if (!fs.existsSync(backupDirPath)) {
            fs.mkdirSync(backupDirPath, { recursive: true });
        }
        
        // 读取当前数据
        const currentData = loadSteamBindData();
        
        // 生成带时间戳的备份文件名
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupFileName = `steam-bind-data.backup.${timestamp}.json`;
        const backupFilePath = path.join(backupDirPath, backupFileName);
        
        // 保存备份
        fs.writeFileSync(backupFilePath, JSON.stringify(currentData, null, 2), 'utf-8');
        
        pluginState.logger.info(`Steam 绑定数据已备份到: ${backupFileName}`);
        
        // 清理旧的备份文件，保留最新的 MAX_BACKUP_FILES 个
        cleanupOldBackups();
    } catch (error) {
        pluginState.logger.error('创建 Steam 绑定数据备份失败:', error);
    }
}

/**
 * 清理旧的备份文件，保留最新的 MAX_BACKUP_FILES 个
 */
function cleanupOldBackups(): void {
    try {
        const backupDirPath = path.resolve(pluginState.ctx.dataPath, BACKUP_DIR);
        
        if (!fs.existsSync(backupDirPath)) {
            return;
        }
        
        // 获取所有备份文件
        const files = fs.readdirSync(backupDirPath);
        const backupFiles = files.filter(file => 
            file.startsWith('steam-bind-data.backup.') && file.endsWith('.json')
        );
        
        // 按文件名排序（时间戳格式确保按时间排序）
        backupFiles.sort((a, b) => {
            // 提取时间戳部分进行比较
            const timestampA = a.replace('steam-bind-data.backup.', '').replace('.json', '');
            const timestampB = b.replace('steam-bind-data.backup.', '').replace('.json', '');
            return timestampB.localeCompare(timestampA); // 降序排列，最新的在前
        });
        
        // 删除超出数量限制的旧备份文件
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
export function getLatestBackupFile(): string | null {
    try {
        const backupDirPath = path.resolve(pluginState.ctx.dataPath, BACKUP_DIR);
        
        if (!fs.existsSync(backupDirPath)) {
            return null;
        }
        
        // 获取所有备份文件
        const files = fs.readdirSync(backupDirPath);
        const backupFiles = files.filter(file => 
            file.startsWith('steam-bind-data.backup.') && file.endsWith('.json')
        );
        
        if (backupFiles.length === 0) {
            return null;
        }
        
        // 按时间戳排序，获取最新的
        backupFiles.sort((a, b) => {
            const timestampA = a.replace('steam-bind-data.backup.', '').replace('.json', '');
            const timestampB = b.replace('steam-bind-data.backup.', '').replace('.json', '');
            return timestampB.localeCompare(timestampA); // 降序排列，最新的在前
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
export function restoreSteamBindDataFromBackup(): SteamBindData | null {
    try {
        const latestBackupPath = getLatestBackupFile();
        
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
