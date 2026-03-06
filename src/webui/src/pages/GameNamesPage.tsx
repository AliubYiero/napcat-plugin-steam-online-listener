import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { getGameNames, updateGameName, deleteGameName } from '../utils/api'
import { showToast } from '../hooks/useToast'
import type { GameNameItem } from '../utils/api'
import { IconGame, IconTrash, IconSearch, IconX } from '../components/icons'

export default function GameNamesPage() {
    const [games, setGames] = useState<GameNameItem[]>([])
    const [loading, setLoading] = useState(true)
    const [searchQuery, setSearchQuery] = useState('')
    const [deleteModal, setDeleteModal] = useState<{ open: boolean; game: GameNameItem | null }>({ open: false, game: null })
    const [editingId, setEditingId] = useState<string | null>(null)
    const [editingValue, setEditingValue] = useState('')

    const fetchGames = useCallback(async () => {
        setLoading(true)
        try {
            const res = await getGameNames()
            if (res.code === 0 && res.data) {
                setGames(res.data)
            }
        } catch {
            showToast('获取游戏列表失败', 'error')
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => { fetchGames() }, [fetchGames])

    // 过滤游戏列表
    const filteredGames = useMemo(() => {
        if (!searchQuery.trim()) return games
        const query = searchQuery.toLowerCase()
        return games.filter(game => 
            game.en.toLowerCase().includes(query) || 
            (game.zh && game.zh.toLowerCase().includes(query))
        )
    }, [games, searchQuery])

    // 开始编辑
    const handleStartEdit = (game: GameNameItem) => {
        setEditingId(game.appid)
        setEditingValue(game.zh || '')
    }

    // 保存编辑
    const handleSaveEdit = async () => {
        if (!editingId) return
        
        const game = games.find(g => g.appid === editingId)
        if (!game) return

        // 如果值没有变化，直接取消编辑
        if (editingValue === (game.zh || '')) {
            setEditingId(null)
            return
        }

        try {
            const res = await updateGameName(editingId, editingValue)
            if (res.code === 0) {
                showToast('更新成功', 'success')
                setGames(prev => prev.map(g => 
                    g.appid === editingId ? { ...g, zh: editingValue } : g
                ))
            } else {
                showToast(res.message || '更新失败', 'error')
            }
        } catch {
            showToast('更新失败', 'error')
        } finally {
            setEditingId(null)
        }
    }

    // 处理按键事件
    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            handleSaveEdit()
        } else if (e.key === 'Escape') {
            setEditingId(null)
        }
    }

    // 打开删除确认框
    const handleOpenDelete = (game: GameNameItem) => {
        setDeleteModal({ open: true, game })
    }

    // 确认删除
    const handleConfirmDelete = async () => {
        if (!deleteModal.game) return
        
        try {
            const res = await deleteGameName(deleteModal.game.appid)
            if (res.code === 0) {
                showToast('删除成功', 'success')
                setGames(prev => prev.filter(g => g.appid !== deleteModal.game!.appid))
            } else {
                showToast(res.message || '删除失败', 'error')
            }
        } catch {
            showToast('删除失败', 'error')
        } finally {
            setDeleteModal({ open: false, game: null })
        }
    }

    return (
        <div className="space-y-6">
            {/* 搜索栏 */}
            <div className="flex items-center gap-4">
                <div className="relative flex-1 max-w-md">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                        <IconSearch size={18} />
                    </span>
                    <input
                        type="text"
                        placeholder="搜索游戏名称（支持中英文）"
                        className="input-field w-full pl-10 pr-10"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                    {searchQuery && (
                        <button
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                            onClick={() => setSearchQuery('')}
                        >
                            <IconX size={16} />
                        </button>
                    )}
                </div>
                <div className="text-sm text-gray-500">
                    共 {filteredGames.length} 个游戏
                </div>
            </div>

            {/* 游戏列表 */}
            {loading ? (
                <div className="flex justify-center py-12">
                    <div className="loading-spinner text-primary" />
                </div>
            ) : filteredGames.length === 0 ? (
                <div className="empty-state py-12 text-center">
                    <IconGame size={48} className="mx-auto text-gray-300 mb-4" />
                    <p className="text-gray-400">
                        {searchQuery ? '未找到匹配的游戏' : '暂无游戏数据'}
                    </p>
                </div>
            ) : (
                <div className="card overflow-hidden">
                    <table className="w-full">
                        <thead>
                            <tr className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700">
                                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700 dark:text-gray-300 w-32">
                                    游戏 ID
                                </th>
                                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700 dark:text-gray-300">
                                    游戏名
                                </th>
                                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700 dark:text-gray-300">
                                    中文名称
                                </th>
                                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700 dark:text-gray-300 w-24">
                                    操作
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                            {filteredGames.map((game) => (
                                <tr 
                                    key={game.appid}
                                    className="hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors"
                                >
                                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400 font-mono">
                                        {game.appid}
                                    </td>
                                    <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                                        {game.en}
                                    </td>
                                    <td className="px-4 py-3 text-sm">
                                        {editingId === game.appid ? (
                                            <input
                                                type="text"
                                                className="input-field w-full py-1 px-2 text-sm"
                                                value={editingValue}
                                                onChange={(e) => setEditingValue(e.target.value)}
                                                onBlur={handleSaveEdit}
                                                onKeyDown={handleKeyDown}
                                                autoFocus
                                            />
                                        ) : (
                                            <span 
                                                className="text-gray-700 dark:text-gray-300 cursor-pointer hover:text-brand-600 dark:hover:text-brand-400 transition-colors"
                                                onClick={() => handleStartEdit(game)}
                                                title="点击编辑"
                                            >
                                                {game.zh || '-'}
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3">
                                        <button
                                            className="btn-ghost text-red-500 p-2"
                                            onClick={() => handleOpenDelete(game)}
                                            title="删除"
                                        >
                                            <IconTrash size={16} />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* 删除确认弹窗 */}
            {deleteModal.open && deleteModal.game && (
                <DeleteConfirmModal
                    game={deleteModal.game}
                    onClose={() => setDeleteModal({ open: false, game: null })}
                    onConfirm={handleConfirmDelete}
                />
            )}
        </div>
    )
}

function DeleteConfirmModal({ 
    game, 
    onClose, 
    onConfirm 
}: { 
    game: GameNameItem
    onClose: () => void
    onConfirm: () => void
}) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-sm p-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                    确认删除
                </h3>
                <p className="text-gray-600 dark:text-gray-300 mb-6">
                    确定要删除游戏 <span className="font-medium text-gray-900 dark:text-white">{game.en}</span> 吗？此操作不可恢复。
                </p>
                <div className="flex gap-3">
                    <button
                        className="btn-ghost flex-1"
                        onClick={onClose}
                    >
                        取消
                    </button>
                    <button
                        className="btn-danger flex-1"
                        onClick={onConfirm}
                    >
                        确认删除
                    </button>
                </div>
            </div>
        </div>
    )
}
