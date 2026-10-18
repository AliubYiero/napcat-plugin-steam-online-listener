/**
 * 会话配置服务
 *
 * 会话级配置的唯一读写入口 (业务代码不得直接触碰 store 或散落判定 enabled)。
 * 默认关闭: 未记录或未写 `enabled` 一律视为禁用 (严格 `enabled === true`)。
 *
 * 范式: docs/store-pattern.md (延迟实例化)、docs/config-pattern.md 的"单一查询入口"
 * 【必须】store 实例在方法内惰性获取, 不在模块加载期触碰 (此时 ctx / dataPath 尚不可用)。
 */

import { PluginSessionConfigStore } from '../store/PluginSessionConfigStore';
import type { SessionConfig, SessionType } from '../types';

class SessionConfigService {
    private _store: PluginSessionConfigStore | null = null;

    /** 惰性获取存储实例 (避免模块加载期触达未初始化的全局状态) */
    private get store(): PluginSessionConfigStore {
        if (!this._store) {
            this._store = PluginSessionConfigStore.getInstance();
        }
        return this._store;
    }

    /** 某会话是否启用 (单一查询入口; 默认关闭, 仅显式 enabled === true 才启用) */
    isSessionEnabled(id: string, type: SessionType): boolean {
        return this.store.find(id, type)?.enabled === true;
    }

    /** 群是否启用 (便捷入口, 等价于 isSessionEnabled(id, 'group')) */
    isGroupEnabled(id: string): boolean {
        return this.isSessionEnabled(id, 'group');
    }

    /** 列出某类型的全部会话配置 (浅拷贝数组, 元素仍为内部引用) */
    listSessions(type: SessionType): SessionConfig[] {
        return this.store.list().filter((item) => item.type === type);
    }

    /** 列出全部群会话配置 (便捷入口) */
    listGroups(): SessionConfig[] {
        return this.listSessions('group');
    }

    /** 设置某会话的启用状态 (upsert, 显式写入 enabled, 保留其它业务字段) */
    setSessionEnabled(
        id: string,
        type: SessionType,
        enabled: boolean,
    ): void {
        this.store.setMany([{ id, type, config: { enabled } }]);
    }

    /** 批量设置同一类型下多个会话的启用状态, 一次落盘 */
    setSessionsEnabled(
        ids: string[],
        type: SessionType,
        enabled: boolean,
    ): void {
        this.store.setMany(
            ids.map((id) => ({ id, type, config: { enabled } })),
        );
    }
}

export const sessionConfigService = new SessionConfigService();
