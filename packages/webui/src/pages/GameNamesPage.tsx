import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    IconCheck,
    IconGame,
    IconRefresh,
    IconSearch,
    IconTrash,
} from '../components/Icons';
import { showToast } from '../hooks/useToast';
import type { GameNameItem } from '../types';
import { noAuthFetch } from '../utils/api';

/** 中文名状态筛选 */
type FilterKey = 'all' | 'unset' | 'same' | 'set';

const FILTERS: { key: FilterKey; label: string }[] = [
    { key: 'all', label: '全部' },
    { key: 'unset', label: '未设置' },
    { key: 'same', label: '英文同名' },
    { key: 'set', label: '已设置' },
];

/** 中文名为空 (undefined / 空串 / 纯空白) */
const isUnset = (g: GameNameItem): boolean => !g.zh?.trim();

/** 中文名与英文名相同 (忽略大小写与空白) */
const isSameAsEn = (g: GameNameItem): boolean =>
    !!g.zh && g.zh.trim().toLowerCase() === g.en.trim().toLowerCase();

/**
 * 游戏名称管理页
 *
 * 维护 Steam appid 的英文名 (来自 Steam API, 只读) 与中文名 (可编辑)。
 * 中文名留空视为「不使用中文名」，展示时回退英文名。
 */
export default function GameNamesPage() {
    const [games, setGames] = useState<GameNameItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState<FilterKey>('all');
    /** 各 appid 的中文名草稿, 未出现则为未编辑 */
    const [drafts, setDrafts] = useState<Record<string, string>>({});
    const [savingId, setSavingId] = useState<string | null>(null);

    const fetchGames = useCallback(async () => {
        setLoading(true);
        try {
            const res =
                await noAuthFetch<GameNameItem[]>('/game-names');
            if (res.code === 0 && res.data) {
                setGames(res.data);
                setDrafts({});
            }
        } catch {
            showToast('获取游戏名称列表失败', 'error');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchGames();
    }, [fetchGames]);

    const unsetCount = useMemo(
        () => games.filter(isUnset).length,
        [games],
    );

    const filtered = useMemo(() => {
        return games.filter((g) => {
            if (filter === 'unset' && !isUnset(g)) return false;
            if (filter === 'same' && !isSameAsEn(g)) return false;
            if (filter === 'set' && (isUnset(g) || isSameAsEn(g))) {
                return false;
            }
            if (!search) return true;
            const q = search.toLowerCase();
            return (
                g.appid.includes(q) ||
                g.en.toLowerCase().includes(q) ||
                !!g.zh?.toLowerCase().includes(q)
            );
        });
    }, [games, search, filter]);

    const emptyText = search
        ? '没有匹配的游戏'
        : filter === 'unset'
          ? '没有未设置中文名的游戏'
          : filter === 'same'
            ? '没有英文同名的游戏'
            : filter === 'set'
              ? '没有已设置中文名的游戏'
              : '暂无游戏数据';

    const draftOf = (game: GameNameItem): string =>
        drafts[game.appid] ?? game.zh ?? '';

    const saveChineseName = async (game: GameNameItem) => {
        const zh = draftOf(game);
        setSavingId(game.appid);
        try {
            const res = await noAuthFetch<unknown>(
                `/game-name/${game.appid}`,
                {
                    method: 'PUT',
                    body: JSON.stringify({ zh }),
                },
            );
            if (res.code !== 0) {
                showToast(res.message || '保存失败', 'error');
                return;
            }
            setGames((prev) =>
                prev.map((g) =>
                    g.appid === game.appid
                        ? { ...g, zh: zh || undefined }
                        : g,
                ),
            );
            setDrafts((prev) => {
                const next = { ...prev };
                delete next[game.appid];
                return next;
            });
            showToast('已保存', 'success');
        } catch {
            showToast('保存失败', 'error');
        } finally {
            setSavingId(null);
        }
    };

    const removeGame = async (game: GameNameItem) => {
        try {
            const res = await noAuthFetch<unknown>(
                `/game-name/${game.appid}`,
                { method: 'DELETE' },
            );
            if (res.code !== 0) {
                showToast(res.message || '删除失败', 'error');
                return;
            }
            setGames((prev) =>
                prev.filter((g) => g.appid !== game.appid),
            );
            showToast('已删除', 'success');
        } catch {
            showToast('删除失败', 'error');
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64 empty-state">
                <div className="flex flex-col items-center gap-3">
                    <div className="loading-spinner text-primary" />
                    <div className="text-gray-400 text-sm">
                        加载游戏名称中...
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* 工具栏 */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 animate-fade-in-down">
                <div className="relative flex-1 w-full sm:max-w-xs">
                    <IconSearch
                        size={14}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                    />
                    <input
                        className="input-field pl-9"
                        placeholder="搜索 appid / 英文名 / 中文名..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
                <div className="flex flex-wrap items-center gap-1.5 p-0.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-white/[0.02]">
                    {FILTERS.map((f) => (
                        <button
                            key={f.key}
                            type="button"
                            className={`text-xs px-2.5 py-1 rounded-md transition-colors ${
                                filter === f.key
                                    ? 'bg-primary text-white'
                                    : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                            }`}
                            onClick={() => setFilter(f.key)}
                        >
                            {f.label}
                        </button>
                    ))}
                </div>
                <button
                    type="button"
                    className="btn btn-ghost text-xs"
                    onClick={fetchGames}
                >
                    <IconRefresh size={13} />
                    刷新
                </button>
            </div>

            {/* 统计 */}
            <p className="text-xs text-gray-400">
                共 {games.length} 个游戏
                {unsetCount > 0 && `，未设置中文名 ${unsetCount} 个`}
                {search && `，搜索到 ${filtered.length} 个`}
            </p>

            {/* 游戏列表 */}
            <div className="card overflow-hidden animate-fade-in-up">
                <table className="w-full text-sm stagger-rows">
                    <thead>
                        <tr className="text-left text-xs text-gray-400 border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-white/[0.02]">
                            <th className="py-2.5 px-4 font-medium w-28">
                                AppID
                            </th>
                            <th className="py-2.5 px-4 font-medium">
                                英文名
                            </th>
                            <th className="py-2.5 px-4 font-medium">
                                中文名
                            </th>
                            <th className="py-2.5 px-4 font-medium text-right w-24">
                                操作
                            </th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50 dark:divide-gray-800/50">
                        {filtered.map((game) => {
                            const draft = draftOf(game);
                            const dirty = draft !== (game.zh ?? '');
                            return (
                                <tr
                                    key={game.appid}
                                    className="hover:bg-gray-50/50 dark:hover:bg-white/[0.02] transition-colors"
                                >
                                    <td className="py-2.5 px-4 font-mono text-xs text-gray-500">
                                        {game.appid}
                                    </td>
                                    <td className="py-2.5 px-4 text-gray-700 dark:text-gray-300">
                                        {game.en}
                                    </td>
                                    <td className="py-2.5 px-4">
                                        <input
                                            className="input-field py-1.5"
                                            placeholder="未设置"
                                            value={draft}
                                            onChange={(e) =>
                                                setDrafts((prev) => ({
                                                    ...prev,
                                                    [game.appid]:
                                                        e.target
                                                            .value,
                                                }))
                                            }
                                        />
                                    </td>
                                    <td className="py-2.5 px-4">
                                        <div className="flex items-center justify-end gap-2">
                                            <button
                                                type="button"
                                                title="保存"
                                                className="btn btn-primary text-xs px-2 py-1.5"
                                                disabled={
                                                    !dirty ||
                                                    savingId ===
                                                        game.appid
                                                }
                                                onClick={() =>
                                                    saveChineseName(
                                                        game,
                                                    )
                                                }
                                            >
                                                <IconCheck
                                                    size={13}
                                                />
                                            </button>
                                            <button
                                                type="button"
                                                title="删除"
                                                className="btn btn-danger text-xs px-2 py-1.5"
                                                onClick={() =>
                                                    removeGame(game)
                                                }
                                            >
                                                <IconTrash
                                                    size={13}
                                                />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>

                {filtered.length === 0 && (
                    <div className="py-12 text-center empty-state">
                        <IconGame
                            size={32}
                            className="mx-auto text-gray-300 dark:text-gray-600 mb-3"
                        />
                        <p className="text-gray-400 text-sm">
                            {emptyText}
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
