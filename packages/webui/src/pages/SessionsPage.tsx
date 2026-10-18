import { useCallback, useEffect, useState } from 'react';
import {
    IconCheck,
    IconGroup,
    IconRefresh,
    IconSearch,
    IconX,
} from '../components/Icons';
import { showToast } from '../hooks/useToast';
import type { SessionInfo } from '../types';
import { noAuthFetch } from '../utils/api';

export default function SessionsPage() {
    const [sessions, setSessions] = useState<SessionInfo[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [selectAll, setSelectAll] = useState(false);
    const [selected, setSelected] = useState<Set<string>>(new Set());

    const fetchSessions = useCallback(async () => {
        setLoading(true);
        try {
            const res = await noAuthFetch<SessionInfo[]>('/sessions');
            if (res.code === 0 && res.data) {
                setSessions(res.data);
            }
        } catch {
            showToast('获取群列表失败', 'error');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchSessions();
    }, [fetchSessions]);

    const filtered = sessions.filter((s) => {
        if (!search) return true;
        const q = search.toLowerCase();
        return s.name?.toLowerCase().includes(q) || s.id.includes(q);
    });

    const toggleSession = async (
        session: SessionInfo,
        enabled: boolean,
    ) => {
        try {
            await noAuthFetch(`/sessions/${session.id}/config`, {
                method: 'POST',
                body: JSON.stringify({ enabled }),
            });
            setSessions((prev) =>
                prev.map((s) =>
                    s.id === session.id ? { ...s, enabled } : s,
                ),
            );
            showToast(
                `已${enabled ? '启用' : '禁用'} ${session.name || session.id}`,
                'success',
            );
        } catch {
            showToast('操作失败', 'error');
        }
    };

    const bulkToggle = async (enabled: boolean) => {
        const groupIds = filtered
            .filter((s) => selected.has(s.id))
            .map((s) => s.id);
        if (groupIds.length === 0) {
            showToast('请先选择群聊', 'warning');
            return;
        }
        try {
            await noAuthFetch('/sessions/bulk-config', {
                method: 'POST',
                body: JSON.stringify({ enabled, groupIds }),
            });
            setSessions((prev) =>
                prev.map((s) =>
                    selected.has(s.id) ? { ...s, enabled } : s,
                ),
            );
            showToast(
                `已批量${enabled ? '启用' : '禁用'} ${groupIds.length} 个群聊`,
                'success',
            );
            setSelected(new Set());
            setSelectAll(false);
        } catch {
            showToast('批量操作失败', 'error');
        }
    };

    const toggleSelect = (id: string) => {
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const toggleSelectAll = () => {
        if (selectAll) {
            setSelected(new Set());
        } else {
            setSelected(new Set(filtered.map((s) => s.id)));
        }
        setSelectAll(!selectAll);
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64 empty-state">
                <div className="flex flex-col items-center gap-3">
                    <div className="loading-spinner text-primary" />
                    <div className="text-gray-400 text-sm">
                        加载群列表中...
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
                        placeholder="搜索群名称或群号..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        className="btn btn-ghost text-xs"
                        onClick={fetchSessions}
                    >
                        <IconRefresh size={13} />
                        刷新
                    </button>
                    {selected.size > 0 && (
                        <>
                            <button
                                type="button"
                                className="btn btn-primary text-xs animate-scale-in"
                                onClick={() => bulkToggle(true)}
                            >
                                <IconCheck size={13} />
                                批量启用 ({selected.size})
                            </button>
                            <button
                                type="button"
                                className="btn btn-danger text-xs animate-scale-in"
                                onClick={() => bulkToggle(false)}
                            >
                                <IconX size={13} />
                                批量禁用 ({selected.size})
                            </button>
                        </>
                    )}
                </div>
            </div>

            {/* 统计 */}
            <p className="text-xs text-gray-400">
                共 {sessions.length} 个群，
                {sessions.filter((s) => s.enabled).length} 个已启用
                {search && `，搜索到 ${filtered.length} 个`}
            </p>

            {/* 群列表 */}
            <div className="card overflow-hidden animate-fade-in-up">
                <table className="w-full text-sm stagger-rows">
                    <thead>
                        <tr className="text-left text-xs text-gray-400 border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-white/[0.02]">
                            <th className="py-2.5 px-4 font-medium w-10">
                                <input
                                    type="checkbox"
                                    checked={selectAll}
                                    onChange={toggleSelectAll}
                                    className="rounded border-gray-300 dark:border-gray-600"
                                />
                            </th>
                            <th className="py-2.5 px-4 font-medium">
                                群名称
                            </th>
                            <th className="py-2.5 px-4 font-medium">
                                群号
                            </th>
                            <th className="py-2.5 px-4 font-medium">
                                成员
                            </th>
                            <th className="py-2.5 px-4 font-medium text-right">
                                状态
                            </th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50 dark:divide-gray-800/50">
                        {filtered.map((session) => (
                            <tr
                                key={session.id}
                                className="hover:bg-gray-50/50 dark:hover:bg-white/[0.02] transition-colors"
                            >
                                <td className="py-2.5 px-4">
                                    <input
                                        type="checkbox"
                                        checked={selected.has(
                                            session.id,
                                        )}
                                        onChange={() =>
                                            toggleSelect(session.id)
                                        }
                                        className="rounded border-gray-300 dark:border-gray-600"
                                    />
                                </td>
                                <td className="py-2.5 px-4">
                                    <span className="text-gray-800 dark:text-gray-200 font-medium">
                                        {session.name || '未知群'}
                                    </span>
                                </td>
                                <td className="py-2.5 px-4 font-mono text-xs text-gray-500">
                                    {session.id}
                                </td>
                                <td className="py-2.5 px-4 text-xs text-gray-500">
                                    {session.memberCount}/
                                    {session.maxMemberCount}
                                </td>
                                <td className="py-2.5 px-4 text-right">
                                    <label className="toggle">
                                        <input
                                            type="checkbox"
                                            checked={session.enabled}
                                            onChange={() =>
                                                toggleSession(
                                                    session,
                                                    !session.enabled,
                                                )
                                            }
                                        />
                                        <div className="slider" />
                                    </label>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                {filtered.length === 0 && (
                    <div className="py-12 text-center empty-state">
                        <IconGroup
                            size={32}
                            className="mx-auto text-gray-300 dark:text-gray-600 mb-3"
                        />
                        <p className="text-gray-400 text-sm">
                            {search ? '没有匹配的群聊' : '暂无群数据'}
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
