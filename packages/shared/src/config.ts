/**
 * 插件配置「单一声明源」
 *
 * 这里是配置的唯一权威定义: 一份字段描述符 (FIELDS) 同时驱动
 *   - 类型     `PluginConfig`
 *   - 默认值   `getDefaultConfig()`
 *   - 清洗     `sanitizeConfig()` (含逗号列表 codec)
 *   - 后端面板 plugin 的 `buildConfigSchema` 把 FIELDS 映射到 `ctx.NapCatConfig`
 *   - 前端表单 webui 的 `ConfigForm` 按 kind 渲染对应控件
 *
 * 【必须】新增/修改配置项时只改本文件: 在 `PluginConfig` 加字段, 在 `FIELDS` 加同 key 描述符。
 * 二者用 `satisfies` 绑定键集, 不一致时编辑器报错 (键集一致性另有单测兜底)。
 *
 * 会话级配置 (群/私聊) 不属于本文件, 由 store 承载 (见 docs/store-pattern.md)。
 */

import {
    EXTENSION_URL_TOKEN,
    PLUGIN_DESCRIPTION_TOKEN,
    PLUGIN_DISPLAY_NAME_TOKEN,
} from './displayTokens';

// ==================== 字段描述符类型 ====================

/** select / multiSelect 的候选项 */
export interface ConfigOption {
    label: string;
    value: string | number;
}

/**
 * 有值字段的 kind: 每类对应一条清洗规则、一个后端控件、一个前端控件。
 *
 * | kind          | 清洗                       | 后端控件        | 前端控件     |
 * | ------------- | -------------------------- | --------------- | ------------ |
 * | boolean       | typeof 守卫, 回退默认      | 开关            | 开关         |
 * | text          | typeof 守卫, 回退默认      | 文本框          | 文本框       |
 * | password      | 同 text (typeof 守卫)      | 跳转引导 (见下) | 密码框       |
 * | number        | typeof + 区间, 回退默认    | 数字框          | 数字框       |
 * | select        | 必须命中 options, 否则默认 | 下拉单选        | 下拉单选     |
 * | multiSelect   | 过滤非法值, 空数组合法     | 下拉多选        | 复选         |
 * | stringList    | 逗号串/数组 → 去空项数组   | 逗号文本框      | 逗号文本框   |
 *
 * 【例外】`password` 原生面板无密码控件, 故其 `scope` 收窄为 `webui` / `both`:
 *   - `webui`: 仅在自建前端渲染密码框, 原生面板隐藏;
 *   - `both` (缺省): 自建前端渲染密码框, 原生面板渲染"前往拓展页面修改"的引导块
 *     (由 buildPasswordPanelHint 生成, 见 displayTokens), 不在面板落值。
 * 【警告】密钥明文落盘 (config.json) 并明文往返自建前端, 仅适用于对安全性要求不高的场景。
 */
export type ValueFieldKind =
    | 'boolean'
    | 'text'
    | 'password'
    | 'number'
    | 'select'
    | 'multiSelect'
    | 'stringList';

/** 全部 kind (含仅布局/展示、不落盘的字段) */
export type ConfigFieldKind = ValueFieldKind | 'section' | 'display';

/**
 * 字段可见范围:
 *   - `webui`  仅自建前端 (webui 的 ConfigForm) 显示
 *   - `panel`  仅 NapCat 原生自动面板 (buildConfigSchema) 显示
 *   - `both`   两处都显示 (默认)
 *
 * 【必须】scope 只影响呈现: 带 key 的字段即便在某侧隐藏, 仍清洗、仍落盘。
 */
export type FieldScope = 'webui' | 'panel' | 'both';

interface FieldBase {
    /** 展示标签 */
    label: string;
    /** 说明文字 */
    description?: string;
    /** 可见范围, 缺省为 both */
    scope?: FieldScope;
    /**
     * 是否为响应式字段: 标记后单键变更会触发 `plugin_on_config_change`。
     * 【必须】仅在需要在变更时执行副作用 (如重启轮询) 的字段上开启。
     */
    reactive?: boolean;
}

export interface BooleanFieldDescriptor extends FieldBase {
    kind: 'boolean';
    default: boolean;
}

export interface TextFieldDescriptor extends FieldBase {
    kind: 'text';
    default: string;
    placeholder?: string;
}

/**
 * 密码字段 (scope 只接受 webui / both)
 *
 * 语义与 `text` 一致 (清洗/落盘/默认值形态相同), 差别在前端渲染为密码框。
 * 【例外】原生面板无密码控件, 故 scope 收窄为 `webui` / `both`:
 *   - `webui`: 仅自建前端显示密码框;
 *   - `both` (缺省): 自建前端显示密码框, 原生面板显示"前往拓展页面修改"的引导块。
 * 【警告】不脱敏: 密钥明文落盘并明文往返自建前端, 仅适用于安全性要求不高的场景。
 */
export interface PasswordFieldDescriptor extends FieldBase {
    kind: 'password';
    /** 【例外】password 不支持 `panel`; 缺省为 both */
    scope?: 'webui' | 'both';
    default: string;
    placeholder?: string;
}

export interface NumberFieldDescriptor extends FieldBase {
    kind: 'number';
    default: number;
    min?: number;
    max?: number;
    step?: number;
    placeholder?: string;
}

export interface SelectFieldDescriptor extends FieldBase {
    kind: 'select';
    default: string | number;
    options: readonly ConfigOption[];
}

export interface MultiSelectFieldDescriptor extends FieldBase {
    kind: 'multiSelect';
    default: readonly (string | number)[];
    options: readonly ConfigOption[];
}

export interface StringListFieldDescriptor extends FieldBase {
    kind: 'stringList';
    default: readonly string[];
    placeholder?: string;
}

export type ValueFieldDescriptor =
    | BooleanFieldDescriptor
    | TextFieldDescriptor
    | PasswordFieldDescriptor
    | NumberFieldDescriptor
    | SelectFieldDescriptor
    | MultiSelectFieldDescriptor
    | StringListFieldDescriptor;

/** 仅布局/展示, 不落盘, 无 key */
export interface SectionFieldDescriptor extends FieldBase {
    kind: 'section';
}

export interface DisplayFieldDescriptor {
    kind: 'display';
    /** 展示用 HTML 片段 (可含 {{...}} 占位符, 见 displayTokens) */
    content: string;
    /** 可见范围, 缺省为 both */
    scope?: FieldScope;
}

/** 带 key 的有值字段 (key 必须是 PluginConfig 的键) */
export type ConfigValueField = ValueFieldDescriptor & {
    key: keyof PluginConfig;
};

/** 布局/展示字段 */
export type ConfigLayoutField =
    | SectionFieldDescriptor
    | DisplayFieldDescriptor;

/** 描述符统一类型 */
export type ConfigField = ConfigValueField | ConfigLayoutField;

// ==================== 配置接口 ====================

/**
 * 触发命令前缀 (插件内部单一来源)
 *
 * 【必须】前缀不再暴露给用户修改, 只作为插件内部常量使用;
 * 后端解析、帮助生成等所有需要前缀处一律引用本常量。
 */
export const COMMAND_PREFIX = '#steam';

/**
 * 插件主配置接口
 *
 * 字段集必须与 `FIELDS` 完全一致 (由 satisfies 与单测双重保证)。
 *
 * 【必须】插件级全局启用/停用由 NapCat 宿主负责 (setPluginStatus),
 * 不在插件内自建 `enabled` 开关。
 */
export interface PluginConfig {
    /**
     * 超级管理员 QQ 号名单 (三档角色中唯一需要人工配置的档位)。
     * WebUI 中以英文逗号分隔输入, 清洗后始终是数组。
     */
    adminUsers: string[];
    /** Steam Web API 访问密钥 (password, 变更时重启轮询) */
    steamApiKey: string;
    /** Steam 状态轮询间隔 (秒), 变更时重设定时器 */
    pollingIntervalSeconds: number;
    /**
     * 误报检测: 连续 N 轮确认同一新状态后才推送。
     * 0 表示关闭 (检测到即推送)。
     */
    falsePositiveDetection: number;
    /** 要推送的状态变化类型 (multiSelect) */
    notifyStatusTypes: string[];
}

// ==================== 字段声明 ====================

/**
 * 可推送的 Steam 状态变化类型 (与状态机 analyzeStatusChange 的输出同域)
 */
export const NOTIFY_STATUS_OPTIONS: readonly ConfigOption[] = [
    { label: '上线', value: 'online' },
    { label: '离线', value: 'offline' },
    { label: '开始游戏', value: 'ingame' },
    { label: '结束游戏', value: 'outgame' },
    { label: '开始挂机', value: 'inAfk' },
    { label: '结束挂机', value: 'outAfk' },
    { label: '游戏下线', value: 'quitGame' },
    { label: '切换游戏', value: 'switchGame' },
];

/**
 * 配置字段声明 (唯一权威)
 *
 * 【必须】每项必须声明一个可渲染的 base kind (后端面板据此渲染);
 * 自定义前端交互用 webui 的覆盖注册表实现, 不改变这里的 kind。
 * `key` 会被校验为 PluginConfig 的键; 布局字段 (section/display) 不带 key。
 * 可选 `scope` 控制可见范围 (webui/panel/both, 默认 both), 仅影响呈现。
 * display 的 `content` 可含 {{...}} 占位符, 见 displayTokens.ts。
 */
export const FIELDS = [
    {
        kind: 'display',
        scope: 'panel',
        content: `<div class="prose dark:prose-invert max-w-none">
  <div style="padding: 16px; background: linear-gradient(135deg, #fff7fa 0%, #ffeaf2 100%); border: 1px solid rgba(251,114,153,0.22); border-radius: 12px; margin-bottom: 20px; color: #5c2a3d;">
    <h3 style="margin: 0 0 6px 0; font-size: 18px; font-weight: 600; color: #b23a63;">${PLUGIN_DISPLAY_NAME_TOKEN}</h3>
    <p style="margin: 0; font-size: 13px; color: #8a5a6c; opacity: 1;">${PLUGIN_DESCRIPTION_TOKEN}</p>
    <div style="display: flex; justify-content: flex-end; margin-top: 12px;">
      <a href="${EXTENSION_URL_TOKEN}" target="_blank" rel="noopener noreferrer" style="display: inline-block; padding: 6px 14px; background: #fb7299; color: #ffffff; border-radius: 8px; font-size: 13px; font-weight: 600; text-decoration: none; line-height: 20px; white-space: nowrap; box-shadow: 0 4px 10px rgba(251,114,153,0.22);" onmouseover="this.style.background='#e85f88'; this.style.transform='translateY(-1px)'; this.style.boxShadow='0 6px 14px rgba(251,114,153,0.28)';" onmouseout="this.style.background='#fb7299'; this.style.transform='none'; this.style.boxShadow='0 4px 10px rgba(251,114,153,0.22)';">跳转至拓展页面</a>
    </div>
  </div>
</div>`,
    },
    {
        key: 'steamApiKey',
        kind: 'password',
        label: 'Steam API KEY',
        description:
            '用于请求 Steam 访问的 API 密钥，变更后自动重启轮询',
        scope: 'both',
        reactive: true,
        default: '',
        placeholder: '请输入 Steam Web API Key',
    },
    {
        key: 'pollingIntervalSeconds',
        kind: 'number',
        label: 'Steam 轮询间隔（秒）',
        description: 'Steam 状态检查的间隔时间，默认 60 秒',
        reactive: true,
        default: 60,
        min: 10,
        max: 3600,
        step: 1,
    },
    {
        key: 'falsePositiveDetection',
        kind: 'number',
        label: '误报检测',
        description:
            '连续检测到同一新状态 N 次后才推送；0 表示关闭，检测到即推送',
        default: 0,
        min: 0,
        max: 10,
        step: 1,
    },
    {
        key: 'notifyStatusTypes',
        kind: 'multiSelect',
        label: '状态推送设置',
        description: '选择要推送的 Steam 状态变化类型，默认全部推送',
        options: NOTIFY_STATUS_OPTIONS,
        default: [
            'online',
            'offline',
            'ingame',
            'outgame',
            'inAfk',
            'outAfk',
            'quitGame',
            'switchGame',
        ],
    },
    {
        key: 'adminUsers',
        kind: 'stringList',
        label: '超级管理员 QQ',
        description:
            '多个 QQ 号用英文逗号分隔；只有超级管理员可执行管理类指令',
        default: [],
    },
] as const satisfies readonly ConfigField[];

// 编译期断言: FIELDS 的有值字段键集与 PluginConfig 键集完全一致 (编辑器可见)
type FieldKeys = Extract<
    (typeof FIELDS)[number],
    { key: string }
>['key'];
type KeysInSync = [keyof PluginConfig] extends [FieldKeys]
    ? [FieldKeys] extends [keyof PluginConfig]
        ? true
        : never
    : never;
const _assertKeysInSync: KeysInSync = true;
void _assertKeysInSync;

// ==================== 派生: 默认值 ====================

/** 从 FIELDS 派生默认配置 (每次返回全新对象, 数组已复制) */
export function getDefaultConfig(): PluginConfig {
    const out: Record<string, unknown> = {};
    for (const field of FIELDS) {
        if (!('key' in field)) continue;
        out[field.key] = cloneValue(
            (field as ConfigValueField).default,
        );
    }
    return out as unknown as PluginConfig;
}

function cloneValue(value: unknown): unknown {
    return Array.isArray(value) ? [...value] : value;
}

// ==================== 派生: 清洗 ====================

/**
 * 配置清洗函数 (纯函数)
 *
 * 【必须】一切外部输入的配置写回都必须经过本函数 (磁盘配置文件、WebUI 提交、
 * 指令修改)。规则从 FIELDS 的 kind 派生, 不再逐字段手写:
 *
 * | kind        | 规则                                                  |
 * | ----------- | ----------------------------------------------------- |
 * | boolean     | typeof 守卫; 不合法保留默认值                          |
 * | text        | typeof 守卫; 不合法保留默认值                          |
 * | password    | 同 text (typeof 守卫; 不合法保留默认值)                |
 * | number      | typeof + 区间钳制; 不合法回退默认值                    |
 * | select      | 必须命中 options 的 value; 否则回退默认值              |
 * | multiSelect | 过滤非法值; **空数组是合法语义**, 不回退默认值          |
 * | stringList  | 容错输入格式 (逗号串 / 数组), 统一转为去空项数组        |
 *
 * 【必须】清洗不抛错: 任何非法输入都回退默认值或丢弃条目, 保证插件在损坏的
 * 配置文件下仍能启动。
 */
export function sanitizeConfig(raw: unknown): PluginConfig {
    const source = isPlainObject(raw) ? raw : {};
    const out: Record<string, unknown> = {};
    for (const field of FIELDS) {
        if (!('key' in field)) continue;
        out[field.key] = sanitizeValue(
            field as ConfigValueField,
            source[field.key],
        );
    }
    return out as unknown as PluginConfig;
}

function sanitizeValue(
    field: ConfigValueField,
    value: unknown,
): unknown {
    switch (field.kind) {
        case 'boolean':
            return typeof value === 'boolean' ? value : field.default;
        case 'text':
        case 'password':
            return typeof value === 'string' ? value : field.default;
        case 'number': {
            if (
                typeof value !== 'number' ||
                !Number.isFinite(value)
            ) {
                return field.default;
            }
            let result = value;
            if (typeof field.min === 'number')
                result = Math.max(result, field.min);
            if (typeof field.max === 'number')
                result = Math.min(result, field.max);
            return result;
        }
        case 'select':
            return field.options.some(
                (option) => option.value === value,
            )
                ? value
                : field.default;
        case 'multiSelect': {
            if (!Array.isArray(value)) return [...field.default];
            return value.filter((item) =>
                field.options.some((option) => option.value === item),
            );
        }
        case 'stringList':
            return decodeStringList(value, field.default);
    }
}

/**
 * stringList codec: 逗号分隔文本 → 去空项数组
 *
 * 与 webui 的标签/文本框输入共用, 是前后端一致的唯一定义。
 * 【限制】不支持含逗号的值 (QQ 号等场景不含逗号)。
 */
export function parseStringList(input: string): string[] {
    return input
        .split(',')
        .map((item) => item.trim())
        .filter((item) => item.length > 0);
}

function decodeStringList(
    value: unknown,
    fallback: readonly string[],
): string[] {
    if (typeof value === 'string') return parseStringList(value);
    if (Array.isArray(value)) {
        return value
            .map((item) => String(item).trim())
            .filter((item) => item.length > 0);
    }
    return [...fallback];
}

function isPlainObject(
    value: unknown,
): value is Record<string, unknown> {
    return (
        value !== null &&
        typeof value === 'object' &&
        !Array.isArray(value)
    );
}
