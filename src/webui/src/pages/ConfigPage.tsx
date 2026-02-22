import { useState, useEffect, useCallback } from 'react'
import { noAuthFetch } from '../utils/api'
import { showToast } from '../hooks/useToast'
import type { PluginConfig } from '../types'
import { IconTerminal, IconSteam, IconX, IconPlus } from '../components/icons'

export default function ConfigPage() {
    const [config, setConfig] = useState<PluginConfig | null>(null)
    const [saving, setSaving] = useState(false)

    const fetchConfig = useCallback(async () => {
        try {
            const res = await noAuthFetch<PluginConfig>('/config')
            if (res.code === 0 && res.data) setConfig(res.data)
        } catch { showToast('获取配置失败', 'error') }
    }, [])

    useEffect(() => { fetchConfig() }, [fetchConfig])

    const saveConfig = useCallback(async (update: Partial<PluginConfig>) => {
        if (!config) return
        setSaving(true)
        try {
            const newConfig = { ...config, ...update }
            await noAuthFetch('/config', {
                method: 'POST',
                body: JSON.stringify(newConfig),
            })
            setConfig(newConfig)
            showToast('配置已保存', 'success')
        } catch {
            showToast('保存失败', 'error')
        } finally {
            setSaving(false)
        }
    }, [config])

    const updateField = <K extends keyof PluginConfig>(key: K, value: PluginConfig[K]) => {
        if (!config) return
        const updated = { ...config, [key]: value }
        setConfig(updated)
        saveConfig({ [key]: value })
    }

    if (!config) {
        return (
            <div className="flex items-center justify-center h-64 empty-state">
                <div className="flex flex-col items-center gap-3">
                    <div className="loading-spinner text-primary" />
                    <div className="text-gray-400 text-sm">加载配置中...</div>
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-6 stagger-children">
            {/* 基础配置 */}
            <div className="card p-5 hover-lift">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2 mb-5">
                    <IconTerminal size={16} className="text-gray-400" />
                    基础配置
                </h3>
                <div className="space-y-5">
                    <ToggleRow
                        label="启用插件"
                        desc="全局开关，关闭后不响应任何命令"
                        checked={config.enabled}
                        onChange={(v) => updateField('enabled', v)}
                    />
                    <ToggleRow
                        label="调试模式"
                        desc="启用后输出详细日志到控制台"
                        checked={config.debug}
                        onChange={(v) => updateField('debug', v)}
                    />
                    <InputRow
                        label="命令前缀"
                        desc="触发命令的前缀"
                        value={config.commandPrefix}
                        onChange={(v) => updateField('commandPrefix', v)}
                    />
                    <InputRow
                        label="冷却时间 (秒)"
                        desc="同一命令请求冷却时间，0 表示不限制"
                        value={String(config.cooldownSeconds)}
                        type="number"
                        onChange={(v) => updateField('cooldownSeconds', Number(v) || 0)}
                    />
                </div>
            </div>

            {/* Steam 配置 */}
            <div className="card p-5 hover-lift">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2 mb-5">
                    <IconSteam size={16} className="text-gray-400" />
                    Steam 配置
                </h3>
                <div className="space-y-5">
                    <InputRow
                        label="Steam API Key"
                        desc="用于访问 Steam Web API，获取方式: steamcommunity.com/dev/apikey"
                        value={config.steamApiKey || ''}
                        type="password"
                        onChange={(v) => updateField('steamApiKey', v)}
                    />
                    <InputRow
                        label="轮询间隔 (秒)"
                        desc="Steam 状态轮询间隔，最小 1 秒"
                        value={String(config.pollingIntervalSeconds || 60)}
                        type="number"
                        onChange={(v) => updateField('pollingIntervalSeconds', Math.max(1, Number(v) || 60))}
                    />
                    <ArrayInputRow
                        label="管理员列表"
                        desc="有权限使用管理命令的 QQ 号列表"
                        value={config.adminUsers || []}
                        onChange={(v) => updateField('adminUsers', v)}
                        placeholder="输入 QQ 号后按回车添加"
                    />
                    <MultiSelectRow
                        label="推送状态类型"
                        desc="选择需要推送通知的状态变化类型"
                        value={config.notifyStatusTypes || []}
                        onChange={(v) => updateField('notifyStatusTypes', v)}
                        options={[
                            { value: 'online', label: '上线' },
                            { value: 'offline', label: '下线' },
                            { value: 'ingame', label: '进入游戏' },
                            { value: 'outgame', label: '退出游戏' },
                            { value: 'quitGame', label: '结束游戏并下线' },
                        ]}
                    />
                </div>
            </div>

            {saving && (
                <div className="saving-indicator fixed bottom-4 right-4 bg-primary text-white text-xs px-3 py-2 rounded-lg shadow-lg flex items-center gap-2">
                    <div className="loading-spinner !w-3 !h-3 !border-[1.5px]" />
                    保存中...
                </div>
            )}
        </div>
    )
}

/* ---- 子组件 ---- */

function ToggleRow({ label, desc, checked, onChange }: {
    label: string; desc: string; checked: boolean; onChange: (v: boolean) => void
}) {
    return (
        <div className="flex items-center justify-between">
            <div>
                <div className="text-sm font-medium text-gray-800 dark:text-gray-200">{label}</div>
                <div className="text-xs text-gray-400 mt-0.5">{desc}</div>
            </div>
            <label className="toggle">
                <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
                <div className="slider" />
            </label>
        </div>
    )
}

function InputRow({ label, desc, value, type = 'text', onChange }: {
    label: string; desc: string; value: string; type?: string; onChange: (v: string) => void
}) {
    const [local, setLocal] = useState(value)
    useEffect(() => { setLocal(value) }, [value])

    const handleBlur = () => {
        if (local !== value) onChange(local)
    }

    return (
        <div>
            <div className="text-sm font-medium text-gray-800 dark:text-gray-200 mb-1">{label}</div>
            <div className="text-xs text-gray-400 mb-2">{desc}</div>
            <input
                className="input-field"
                type={type}
                value={local}
                onChange={(e) => setLocal(e.target.value)}
                onBlur={handleBlur}
                onKeyDown={(e) => e.key === 'Enter' && handleBlur()}
            />
        </div>
    )
}

function ArrayInputRow({ label, desc, value, onChange, placeholder }: {
    label: string; desc: string; value: string[]; onChange: (v: string[]) => void; placeholder?: string
}) {
    const [inputValue, setInputValue] = useState('')

    const handleAdd = () => {
        if (inputValue.trim() && !value.includes(inputValue.trim())) {
            onChange([...value, inputValue.trim()])
            setInputValue('')
        }
    }

    const handleRemove = (item: string) => {
        onChange(value.filter(v => v !== item))
    }

    return (
        <div>
            <div className="text-sm font-medium text-gray-800 dark:text-gray-200 mb-1">{label}</div>
            <div className="text-xs text-gray-400 mb-2">{desc}</div>
            <div className="flex gap-2 mb-2">
                <input
                    className="input-field flex-1"
                    type="text"
                    value={inputValue}
                    placeholder={placeholder}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAdd())}
                />
                <button
                    className="btn btn-primary px-3"
                    onClick={handleAdd}
                    disabled={!inputValue.trim()}
                >
                    <IconPlus size={16} />
                </button>
            </div>
            <div className="flex flex-wrap gap-2">
                {value.map((item) => (
                    <span
                        key={item}
                        className="inline-flex items-center gap-1 px-2 py-1 bg-primary/10 text-primary text-xs rounded-full"
                    >
                        {item}
                        <button
                            className="hover:text-red-500 transition-colors"
                            onClick={() => handleRemove(item)}
                        >
                            <IconX size={12} />
                        </button>
                    </span>
                ))}
            </div>
        </div>
    )
}

function MultiSelectRow({ label, desc, value, onChange, options }: {
    label: string; desc: string; value: string[]; onChange: (v: string[]) => void;
    options: { value: string; label: string }[]
}) {
    const toggleOption = (optionValue: string) => {
        if (value.includes(optionValue)) {
            onChange(value.filter(v => v !== optionValue))
        } else {
            onChange([...value, optionValue])
        }
    }

    return (
        <div>
            <div className="text-sm font-medium text-gray-800 dark:text-gray-200 mb-1">{label}</div>
            <div className="text-xs text-gray-400 mb-2">{desc}</div>
            <div className="flex flex-wrap gap-2">
                {options.map((option) => (
                    <button
                        key={option.value}
                        className={`px-3 py-1.5 text-xs rounded-full transition-colors ${
                            value.includes(option.value)
                                ? 'bg-primary text-white'
                                : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                        }`}
                        onClick={() => toggleOption(option.value)}
                    >
                        {option.label}
                    </button>
                ))}
            </div>
        </div>
    )
}
