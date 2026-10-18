/**
 * NapCat 插件 - 主入口 (Steam 在线状态监听)
 *
 * 导出 PluginModule 接口定义的生命周期函数，NapCat 加载插件时会调用这些函数。
 *
 * 生命周期：
 *   plugin_init        → 插件加载时调用（必选）
 *   plugin_onmessage   → 收到消息事件时调用
 *   plugin_onevent     → 收到所有 OneBot 事件时调用
 *   plugin_cleanup     → 插件卸载/重载时调用
 *
 * 配置相关：
 *   plugin_config_ui          → 导出配置 Schema，用于 WebUI 自动生成配置面板
 *   plugin_get_config         → 自定义配置读取
 *   plugin_set_config         → 自定义配置保存
 *   plugin_on_config_change   → 配置变更回调（需配置项标记 reactive: true）
 */

import type {
    NapCatPluginContext,
    PluginConfigSchema,
    PluginModule,
} from 'napcat-types/napcat-onebot/network/plugin/types';

import { buildConfigSchema } from './config';
import { pluginState } from './core/state';
import { handleMessage } from './handlers/messageHandler';
import { EventType } from './onebotEvent';
import { registerApiRoutes } from './services/api-service';
import { steamPollingService } from './services/steam-polling.service';
import type { PluginConfig } from './types';

// ==================== 配置 UI Schema ====================

/** NapCat WebUI 读取此导出来展示配置面板 */
export let plugin_config_ui: PluginConfigSchema = [];

// ==================== 生命周期函数 ====================

/**
 * 插件初始化（必选）
 * 加载配置、注册 WebUI 路由和页面、注册 API 路由、启动轮询服务
 */
export const plugin_init: PluginModule['plugin_init'] = async (
    ctx,
) => {
    try {
        // 1. 初始化全局状态（加载并清洗配置）
        pluginState.init(ctx);

        ctx.logger.info('插件初始化中...');

        // 2. 生成配置 Schema（用于 NapCat WebUI 配置面板）
        plugin_config_ui = buildConfigSchema(ctx);

        // 3. 注册 WebUI 页面和静态资源
        registerWebUI(ctx);

        // 4. 注册 API 路由
        registerApiRoutes(ctx);

        // 5. 启动 Steam 状态轮询服务
        steamPollingService.startPolling();

        ctx.logger.info('插件初始化完成');
    } catch (error) {
        ctx.logger.error('插件初始化失败:', error);
    }
};

/**
 * 消息事件处理（可选）
 * 仅处理消息事件，其余交给 plugin_onevent
 */
export const plugin_onmessage: PluginModule['plugin_onmessage'] =
    async (ctx, event) => {
        if (event.post_type !== EventType.MESSAGE) return;
        await handleMessage(ctx, event);
    };

/**
 * 事件处理（可选）
 * 处理所有 OneBot 事件（通知、请求等）
 */
export const plugin_onevent: PluginModule['plugin_onevent'] = async (
    _ctx,
    _event,
) => {
    // 当前无需处理通知 / 请求等非消息事件
};

/**
 * 插件卸载/重载（可选）
 * 必须清理定时器、关闭连接等资源
 */
export const plugin_cleanup: PluginModule['plugin_cleanup'] = async (
    ctx,
) => {
    try {
        // 1. 停止 Steam 状态轮询服务
        steamPollingService.stopPolling();

        // 2. 清理全局状态（包括其它定时器与统计落盘）
        pluginState.cleanup();
        ctx.logger.info('插件已卸载');
    } catch (e) {
        ctx.logger.warn('插件卸载时出错:', e);
    }
};

// ==================== 配置管理钩子 ====================

/** 获取当前配置 */
export const plugin_get_config: PluginModule['plugin_get_config'] =
    async () => {
        return pluginState.config;
    };

/** 设置配置（完整替换，由 NapCat WebUI 调用；入口统一清洗） */
export const plugin_set_config: PluginModule['plugin_set_config'] =
    async (ctx, config) => {
        pluginState.replaceConfig(config as PluginConfig);
        ctx.logger.info('配置已通过 WebUI 更新');
    };

/**
 * 配置变更回调
 *
 * 仅在标记 `reactive: true` 的字段上触发。
 * 轮询相关字段 (steamApiKey / pollingIntervalSeconds) 变更后需重启轮询:
 * 轮询间隔在启动时读取一次, 仅改定时器时长不会立即生效。
 */
export const plugin_on_config_change: PluginModule['plugin_on_config_change'] =
    async (ctx, _ui, key, value, _currentConfig) => {
        try {
            pluginState.updateConfig({ [key]: value });
            ctx.logger.debug(`配置项 ${key} 已更新`);

            if (
                key === 'steamApiKey' ||
                key === 'pollingIntervalSeconds'
            ) {
                ctx.logger.info(
                    `配置项 ${key} 变更，正在重启轮询服务...`,
                );
                steamPollingService.stopPolling();
                steamPollingService.startPolling();
                ctx.logger.info('轮询服务已重启');
            }
        } catch (err) {
            ctx.logger.error(`更新配置项 ${key} 失败:`, err);
        }
    };

// ==================== 内部函数 ====================

/**
 * 注册 WebUI 页面和静态资源
 */
function registerWebUI(ctx: NapCatPluginContext): void {
    const router = ctx.router;

    // 托管前端静态资源（构建产物在 webui/ 目录下）
    // 访问路径: /plugin/<plugin-id>/files/static/
    router.static('/static', 'webui');

    // 注册拓展页面（显示在 NapCat WebUI 侧边栏），内部为 5 个 hash 路由子页
    // 访问路径: /plugin/<plugin-id>/page/dashboard
    router.page({
        path: 'dashboard',
        title: 'Steam 状态监听',
        htmlFile: 'webui/index.html',
        description: 'Steam 在线状态监听插件控制台',
    });

    ctx.logger.debug('WebUI 路由注册完成');
}
