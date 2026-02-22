import { useState, useEffect, useCallback, useMemo } from 'react'
import { getSteamBinds, addSteamBind, deleteSteamBind } from '../utils/api'
import { showToast } from '../hooks/useToast'
import type { SteamBindItem } from '../types'
import { IconSteam, IconPlus, IconTrash, IconUsers } from '../components/icons'

export default function SteamManagementPage() {
    const [binds, setBinds] = useState<SteamBindItem[]>([])
    const [loading, setLoading] = useState(true)
    const [filterFromId, setFilterFromId] = useState('')
    const [filterType, setFilterType] = useState<'all' | 'group' | 'private'>('all')
    const [showAddModal, setShowAddModal] = useState(false)

    const fetchBinds = useCallback(async () => {
        setLoading(true)
        try {
            const params: { fromId?: string; type?: 'group' | 'private' } = {}
            if (filterFromId && filterType !== 'all') {
                params.fromId = filterFromId
                params.type = filterType
            }
            const res = await getSteamBinds(params.fromId, params.type)
            if (res.code === 0 && res.data) {
                setBinds(res.data)
            }
        } catch {
            showToast('获取绑定列表失败', 'error')
        } finally {
            setLoading(false)
        }
    }, [filterFromId, filterType])

    useEffect(() => { fetchBinds() }, [fetchBinds])

    const handleDelete = async (steamId: string, fromId: string, type: 'private' | 'group') => {
        if (!confirm('确定要删除这个绑定吗？')) return
        try {
            const res = await deleteSteamBind(steamId, fromId, type)
            if (res.code === 0) {
                showToast('删除成功', 'success')
                fetchBinds()
            } else {
                showToast(res.message || '删除失败', 'error')
            }
        } catch {
            showToast('删除失败', 'error')
        }
    }

    // 按来源分组
    const groupedBinds = useMemo(() => {
        const groups: Record<string, { type: 'private' | 'group'; users: SteamBindItem[] }> = {}

        binds.forEach(bind => {
            bind.from?.forEach(fromInfo => {
                const key = `${fromInfo.type}:${fromInfo.id}`
                if (!groups[key]) {
                    groups[key] = { type: fromInfo.type, users: [] }
                }
                groups[key].users.push(bind)
            })
        })

        return groups
    }, [binds])

    return (
        <div className="space-y-6">
            {/* 工具栏 */}
            <div className="flex flex-wrap gap-4 items-center">
                <div className="flex items-center gap-2">
                    <input
                        type="text"
                        placeholder="来源 ID"
                        className="input-field w-40"
                        value={filterFromId}
                        onChange={(e) => setFilterFromId(e.target.value)}
                    />
                    <select
                        className="input-field w-32"
                        value={filterType}
                        onChange={(e) => setFilterType(e.target.value as any)}
                    >
                        <option value="all">全部</option>
                        <option value="group">群聊</option>
                        <option value="private">私聊</option>
                    </select>
                </div>
                <div className="flex-1" />
                <button
                    className="btn btn-primary flex items-center gap-2"
                    onClick={() => setShowAddModal(true)}
                >
                    <IconPlus size={16} />
                    添加绑定
                </button>
            </div>

            {/* 绑定列表 */}
            {loading ? (
                <div className="flex justify-center py-12">
                    <div className="loading-spinner text-primary" />
                </div>
            ) : Object.keys(groupedBinds).length === 0 ? (
                <div className="empty-state py-12 text-center">
                    <IconSteam size={48} className="mx-auto text-gray-300 mb-4" />
                    <p className="text-gray-400">暂无 Steam 绑定</p>
                </div>
            ) : (
                <div className="space-y-4">
                    {Object.entries(groupedBinds).map(([key, group]) => (
                        <SourceGroupCard
                            key={key}
                            groupKey={key}
                            group={group}
                            onDelete={handleDelete}
                        />
                    ))}
                </div>
            )}

            {/* 添加绑定弹窗 */}
            {showAddModal && (
                <AddBindModal
                    onClose={() => setShowAddModal(false)}
                    onSuccess={() => {
                        setShowAddModal(false)
                        fetchBinds()
                    }}
                />
            )}
        </div>
    )
}

function SourceGroupCard({
    groupKey,
    group,
    onDelete,
}: {
    groupKey: string
    group: { type: 'private' | 'group'; users: SteamBindItem[] }
    onDelete: (steamId: string, fromId: string, type: 'private' | 'group') => void
}) {
    const [type, id] = groupKey.split(':')
    const typeLabel = type === 'group' ? '群聊' : '私聊'
    const typeIcon = type === 'group' ? <IconUsers size={18} /> : <span className="text-lg">👤</span>

    return (
        <div className="card overflow-hidden">
            <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-700 flex items-center gap-3">
                <span className="text-gray-500">{typeIcon}</span>
                <div>
                    <div className="text-sm font-medium text-gray-900 dark:text-white">
                        {typeLabel} {id}
                    </div>
                    <div className="text-xs text-gray-400">
                        {group.users.length} 个绑定
                    </div>
                </div>
            </div>
            <div className="divide-y divide-gray-100 dark:divide-gray-700">
                {group.users.map((user) => {
                    const fromInfo = user.from?.find((f) => f.id === id && f.type === type)
                    return (
                        <div
                            key={user.steamId}
                            className="px-4 py-3 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors"
                        >
                            <img
                                src={user.face || 'https://steamcdn-a.akamaihd.net/steamcommunity/public/images/avatars/fe/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb_full.jpg'}
                                alt={user.personName}
                                className="w-10 h-10 rounded-full bg-gray-200"
                            />
                            <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium text-gray-900 dark:text-white truncate">
                                    {user.personName || 'Unknown'}
                                </div>
                                <div className="text-xs text-gray-400 truncate">
                                    {user.steamId}
                                </div>
                                {fromInfo?.nickname && (
                                    <div className="text-xs text-blue-500">
                                        备注: {fromInfo.nickname}
                                    </div>
                                )}
                            </div>
                            <button
                                className="btn-ghost text-red-500 p-2"
                                onClick={() => onDelete(user.steamId, id, type as 'private' | 'group')}
                                title="删除绑定"
                            >
                                <IconTrash size={16} />
                            </button>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}

function AddBindModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
    const [steamId, setSteamId] = useState('')
    const [fromId, setFromId] = useState('')
    const [type, setType] = useState<'group' | 'private'>('group')
    const [nickname, setNickname] = useState('')
    const [submitting, setSubmitting] = useState(false)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!steamId || !fromId) {
            showToast('请填写完整信息', 'error')
            return
        }

        setSubmitting(true)
        try {
            const res = await addSteamBind({ steamId, fromId, type, nickname })
            if (res.code === 0) {
                showToast('添加成功', 'success')
                onSuccess()
            } else {
                showToast(res.message || '添加失败', 'error')
            }
        } catch {
            showToast('添加失败', 'error')
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-md p-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                    添加 Steam 绑定
                </h3>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Steam ID
                        </label>
                        <input
                            type="text"
                            className="input-field w-full"
                            placeholder="76561198..."
                            value={steamId}
                            onChange={(e) => setSteamId(e.target.value)}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            来源类型
                        </label>
                        <div className="flex gap-4">
                            <label className="flex items-center gap-2">
                                <input
                                    type="radio"
                                    value="group"
                                    checked={type === 'group'}
                                    onChange={() => setType('group')}
                                />
                                <span className="text-sm">群聊</span>
                            </label>
                            <label className="flex items-center gap-2">
                                <input
                                    type="radio"
                                    value="private"
                                    checked={type === 'private'}
                                    onChange={() => setType('private')}
                                />
                                <span className="text-sm">私聊</span>
                            </label>
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            来源 ID
                        </label>
                        <input
                            type="text"
                            className="input-field w-full"
                            placeholder={type === 'group' ? '群号' : 'QQ号'}
                            value={fromId}
                            onChange={(e) => setFromId(e.target.value)}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            自定义昵称（可选）
                        </label>
                        <input
                            type="text"
                            className="input-field w-full"
                            placeholder="在该来源显示的昵称"
                            value={nickname}
                            onChange={(e) => setNickname(e.target.value)}
                        />
                    </div>
                    <div className="flex gap-3 pt-2">
                        <button
                            type="button"
                            className="btn-ghost flex-1"
                            onClick={onClose}
                            disabled={submitting}
                        >
                            取消
                        </button>
                        <button
                            type="submit"
                            className="btn-primary flex-1"
                            disabled={submitting}
                        >
                            {submitting ? '添加中...' : '添加'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}
