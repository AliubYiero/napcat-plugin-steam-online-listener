/**
 * 会话级配置 store (本项目实例)
 *
 * 承载每个群/私聊的启用开关及后续会话级业务字段, 落盘到独立数据文件
 * (不放进插件配置文件)。单例与延迟实例化由本子类实现。
 *
 * 范式: docs/store-pattern.md
 */

import type { SessionConfig } from '../types';
import { SessionConfigStore } from './SessionConfigStore';

export class PluginSessionConfigStore extends SessionConfigStore<SessionConfig> {
    private static readonly DATA_FILENAME = 'session-config.json';
    private static instance: PluginSessionConfigStore | null = null;

    private constructor() {
        super(PluginSessionConfigStore.DATA_FILENAME);
    }

    static getInstance(): PluginSessionConfigStore {
        if (!PluginSessionConfigStore.instance) {
            PluginSessionConfigStore.instance =
                new PluginSessionConfigStore();
        }
        return PluginSessionConfigStore.instance;
    }
}
