/**
 * 插件配置模块
 *
 * 配置字段的权威源在 `shared/src/config.ts` 的 `FIELDS`:
 *   - 默认值由 `getDefaultConfig()` 派生
 *   - 清洗由 `sanitizeConfig()` 派生
 *   - 本文件只负责把 `FIELDS` 映射成 NapCat 原生面板 Schema (需要 ctx)
 */

import type {
    NapCatPluginContext,
    PluginConfigSchema,
    PluginEntry,
} from 'napcat-types/napcat-onebot/network/plugin/types';
import type { ConfigField, DisplayTokenValues } from 'shared';
import {
    buildPasswordPanelHint,
    DEFAULT_PAGE,
    escapeHtml,
    FIELDS,
    getDefaultConfig,
    resolveDisplayContent,
} from 'shared';
import type { PluginConfig } from './types';

/**
 * 默认配置 (从 FIELDS 派生)
 *
 * 注意: 会话级配置 (群/私聊) 不属于本配置文件, 由 store 承载 (见 docs/store-pattern.md)。
 * 插件级全局启停由 NapCat 宿主负责, 插件内不设 `enabled` 开关。
 */
export const DEFAULT_CONFIG: PluginConfig = getDefaultConfig();

/**
 * 构建 NapCat 原生配置面板 Schema
 *
 * 遍历 shared 的 FIELDS, 按 kind 映射到 `ctx.NapCatConfig` 的构建器。
 * 【必须】新增配置项只需改 shared/src/config.ts (FIELDS), 此处无需改动。
 *
 *   - boolean(key, label, defaultValue?, description?, reactive?)     → 开关
 *   - text(key, label, defaultValue?, description?, reactive?)        → 文本输入
 *   - number(key, label, defaultValue?, description?, reactive?)      → 数字输入
 *   - select(key, label, options, defaultValue?, description?)        → 下拉单选
 *   - multiSelect(key, label, options, defaultValue?, description?)   → 下拉多选
 *   - html(content) / plainText(content)                              → 纯展示, 不保存值
 *   - combine(...items)                                               → 合并为 Schema
 *
 * 【例外】`password` 原生面板无密码控件: `scope` 为 `webui` 时本就不渲染
 *   (见下方 filter), `scope` 为 `both` 时改为渲染跳转引导块 (见 toNapCatItem)。
 */
export function buildConfigSchema(
    ctx: NapCatPluginContext,
): PluginConfigSchema {
    const values = getDisplayTokenValues(ctx);
    const items = FIELDS_ALL.filter(
        (field) => field.scope !== 'webui',
    ).map((field) => toNapCatItem(ctx, field, values));
    return ctx.NapCatConfig.combine(...items);
}

/**
 * FIELDS 的遍历视图: 收窄为描述符统一类型
 * (as const 字面量元组不含未显式声明的可选属性如 scope)。
 */
const FIELDS_ALL: readonly ConfigField[] = FIELDS;

/**
 * 插件显示名 (package.json 的 `plugin` 字段)
 *
 * 【必须】显示名以 package.json 为唯一权威: 取宿主已解析的信息,
 * 回退链 `plugin` → `name` → 插件 id。拓展页标题与原生面板占位符共用本函数。
 */
export function getPluginDisplayName(
    ctx: NapCatPluginContext,
): string {
    const info = readPluginInfo(ctx);
    return info?.packageJson?.plugin ?? info?.name ?? ctx.pluginName;
}

/**
 * 汇总 display 占位符所需的值
 *
 * 插件名/描述取宿主已解析的 package.json (getPluginInfo), 拓展页地址由插件 id 拼装。
 */
function getDisplayTokenValues(
    ctx: NapCatPluginContext,
): DisplayTokenValues {
    const info = readPluginInfo(ctx);
    const pkg = info?.packageJson;
    return {
        pluginDisplayName: getPluginDisplayName(ctx),
        pluginDescription:
            pkg?.description ?? info?.description ?? '',
        extensionUrl: `/plugin/${ctx.pluginName}/page/dashboard`,
        extensionDashboardUrl: `/plugin/${ctx.pluginName}/page/dashboard#/${DEFAULT_PAGE}`,
    };
}

function readPluginInfo(
    ctx: NapCatPluginContext,
): PluginEntry | undefined {
    try {
        return ctx.pluginManager?.getPluginInfo?.(ctx.pluginName);
    } catch {
        return undefined;
    }
}

type NapCatConfigItem = PluginConfigSchema[number];

function toNapCatItem(
    ctx: NapCatPluginContext,
    field: ConfigField,
    values: DisplayTokenValues,
): NapCatConfigItem {
    const { NapCatConfig } = ctx;
    switch (field.kind) {
        case 'boolean':
            return NapCatConfig.boolean(
                field.key,
                field.label,
                field.default,
                field.description,
                field.reactive,
            );
        case 'text':
            return NapCatConfig.text(
                field.key,
                field.label,
                field.default,
                field.description,
                field.reactive,
            );
        case 'password':
            // 原生面板无密码控件: 渲染跳转引导块 (不落值), 引导用户去自建前端修改。
            // scope 为 webui 时已被 buildConfigSchema 过滤, 不会到达。
            return NapCatConfig.html(
                resolveDisplayContent(
                    buildPasswordPanelHint(
                        field.label,
                        field.description,
                    ),
                    values,
                ),
            );
        case 'number':
            return NapCatConfig.number(
                field.key,
                field.label,
                field.default,
                field.description,
                field.reactive,
            );
        case 'select':
            return NapCatConfig.select(
                field.key,
                field.label,
                [...field.options],
                field.default,
                field.description,
            );
        case 'multiSelect':
            return NapCatConfig.multiSelect(
                field.key,
                field.label,
                [...field.options],
                [...field.default],
                field.description,
            );
        case 'stringList':
            // 原生面板无列表控件: 降级为逗号分隔文本, 由清洗层转回数组
            return NapCatConfig.text(
                field.key,
                field.label,
                field.default.join(','),
                field.description,
            );
        case 'section':
            // 仅布局: 分组标题 (加粗, 与面板其它标题层级一致)
            return NapCatConfig.html(
                `<div class="font-semibold">${escapeHtml(field.label)}</div>`,
            );
        case 'display':
            // 解析 {{...}} 占位符后再交给原生面板渲染
            return NapCatConfig.html(
                resolveDisplayContent(field.content, values),
            );
    }
}
