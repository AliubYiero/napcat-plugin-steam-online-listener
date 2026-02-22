/**
 * 插件配置模块
 * 定义默认配置值和 WebUI 配置 Schema
 */

import type {
	NapCatPluginContext,
	PluginConfigSchema,
} from 'napcat-types/napcat-onebot/network/plugin/types';
import type { PluginConfig } from './types';

/** 默认配置 */
export const DEFAULT_CONFIG: PluginConfig = {
	enabled: true,
	debug: false,
	commandPrefix: '#steam',
	cooldownSeconds: 1,
	groupConfigs: {},
	// TODO: 在这里添加你的默认配置值
	pollingIntervalSeconds: 60,
	steamApiKey: '',
	adminUsers: [], // 默认管理员用户
	notifyStatusTypes: ['online', 'offline', 'ingame', 'outgame', 'inAfk', 'outAfk', 'quitGame'],
};

/**
 * 构建 WebUI 配置 Schema
 *
 * 使用 ctx.NapCatConfig 提供的构建器方法生成配置界面：
 *   - boolean(key, label, defaultValue?, description?, reactive?)  → 开关
 *   - text(key, label, defaultValue?, description?, reactive?)     → 文本输入
 *   - number(key, label, defaultValue?, description?, reactive?)   → 数字输入
 *   - select(key, label, options, defaultValue?, description?)     → 下拉单选
 *   - multiSelect(key, label, options, defaultValue?, description?) → 下拉多选
 *   - html(content)     → 自定义 HTML 展示（不保存值）
 *   - plainText(content) → 纯文本说明
 *   - combine(...items)  → 组合多个配置项为 Schema
 */
export function buildConfigSchema( ctx: NapCatPluginContext ): PluginConfigSchema {
	const pluginName = ctx.pluginName;
	const webuiUrl = `/plugin/${pluginName}/page/dashboard`;
	
	return ctx.NapCatConfig.combine(
		// 跳转到管理页面按钮
		ctx.NapCatConfig.html( `
            <div style="margin-bottom: 16px;">
                <a href="${webuiUrl}" 
                   target="_blank"
                   style="display: inline-flex; align-items: center; gap: 8px; padding: 10px 20px; background: #FB7299; color: white; border-radius: 8px; text-decoration: none; font-weight: 500; transition: opacity 0.2s;"
                   onmouseover="this.style.opacity='0.9'"
                   onmouseout="this.style.opacity='1'">
                    <span>📊</span>
                    <span>打开 WebUI 管理页面</span>
                </a>
                <p style="margin: 8px 0 0 0; font-size: 12px; color: #666;">在独立页面中管理 Steam 绑定和查看状态</p>
            </div>
        ` ),
		// 插件信息头部
		ctx.NapCatConfig.html( `
            <div style="padding: 16px; background: #FB7299; border-radius: 12px; margin-bottom: 20px; color: white;">
                <h3 style="margin: 0 0 6px 0; font-size: 18px; font-weight: 600;">Steam 状态监听</h3>
                <p style="margin: 0; font-size: 13px; opacity: 0.85;">Steam 在线状态监听插件，支持监控 Steam 用户状态并发送通知</p>
            </div>
        ` ),
		// 全局开关
		// ctx.NapCatConfig.boolean( 'enabled', '启用插件', true, '是否启用此插件的功能' ),
		// 调试模式
		// ctx.NapCatConfig.boolean( 'debug', '调试模式', false, '启用后将输出详细的调试日志' ),
		// 冷却时间
		ctx.NapCatConfig.number( 'cooldownSeconds', '冷却时间（秒）', 1, '同一命令请求冷却时间，0 表示不限制' ),
		// 轮询间隔
		ctx.NapCatConfig.number( 'pollingIntervalSeconds', 'Steam轮询间隔（秒）', 60, 'Steam状态检查的间隔时间（秒），默认为60秒' ),
		// Steam API Key
		ctx.NapCatConfig.text(
			'steamApiKey',
			'Steam API KEY',
			'',
			'用于请求 STEAM 访问的 API 秘钥',
			true // reactive: true，当在WebUI中修改时触发配置变更回调
		),
		// 管理员用户列表
		ctx.NapCatConfig.text(
			'adminUsers',
			'插件管理员用户',
			'',
			'插件管理员QQ号列表，多个QQ号用英文逗号分隔',
		),
		// 状态推送设置
		ctx.NapCatConfig.multiSelect(
			'notifyStatusTypes',
			'状态推送设置',
			[
				{ label: '上线', value: 'online' },
				{ label: '离线', value: 'offline' },
				{ label: '开始游戏', value: 'ingame' },
				{ label: '结束游戏', value: 'outgame' },
				{ label: '开始挂机', value: 'inAfk' },
				{ label: '结束挂机', value: 'outAfk' },
				{ label: '游戏下线', value: 'quitGame' },
			],
			['online', 'offline', 'ingame', 'outgame', 'inAfk', 'outAfk', 'quitGame'],
			'选择要推送的 Steam 状态变化类型，默认全部推送'
		),
	);
}
