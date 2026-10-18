import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    IconPlus,
    IconRefresh,
    IconSearch,
    IconSteam,
    IconTrash,
} from '../components/Icons';
import { showToast } from '../hooks/useToast';
import type { SteamBindItem } from '../types';
import { noAuthFetch } from '../utils/api';

interface AddForm {
    steamId: string;
    fromId: string;
    nickname: string;
}

const EMPTY_FORM: AddForm = { steamId: '', fromId: '', nickname: '' };

/**
 * Steam 绑定管理页
 *
 * 绑定关系为「Steam 账号 ↔ 群聊」：一个 Steam 账号可被多个群绑定，
 * 每个来源可带独立昵称。本页只处理 `type: 'group'` 的来源。
 */
export default function BindingsPage() {
    const [binds, setBinds] = useState<SteamBindItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [showAdd, setShowAdd] = useState(false);
    const [form, setForm] = useState<AddForm>(EMPTY_FORM);
    const [submitting, setSubmitting] = useState(false);

    const fetchBinds = useCallback(async () => {
        setLoading(true);
        try {
            const res =
                await noAuthFetch<SteamBindItem[]>('/steam-binds');
            if (res.code === 0 && res.data) {
                setBinds(res.data);
            }
        } catch {
            showToast('获取绑定列表失败', 'error');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchBinds();
    }, [fetchBinds]);

    const filtered = useMemo(() => {
        if (!search) return binds;
        const q = search.toLowerCase();
        return binds.filter((item) => {
            if (item.steamId.includes(q)) return true;
            if (item.personName?.toLowerCase().includes(q))
                return true;
            return item.from?.some(
                (f) =>
                    f.id.includes(q) ||
                    f.nickname?.toLowerCase().includes(q),
            );
        });
    }, [binds, search]);

    const submitAdd = async () => {
        const steamId = form.steamId.trim();
        const fromId = form.fromId.trim();
        if (!steamId || !fromId) {
            showToast('Steam ID 与群号均不能为空', 'warning');
            return;
        }
        setSubmitting(true);
        try {
            const res = await noAuthFetch<unknown>('/steam-bind', {
                method: 'POST',
                body: JSON.stringify({
                    steamId,
                    fromId,
                    type: 'group',
                    nickname: form.nickname.trim() || undefined,
                }),
            });
            if (res.code !== 0) {
                showToast(res.message || '绑定失败', 'error');
                return;
            }
            showToast('绑定成功', 'success');
            setForm(EMPTY_FORM);
            setShowAdd(false);
            await fetchBinds();
        } catch {
            showToast('绑定失败', 'error');
        } finally {
            setSubmitting(false);
        }
    };

    const removeFrom = async (steamId: string, fromId: string) => {
        try {
            const res = await noAuthFetch<unknown>(
                `/steam-bind/${steamId}/from/${fromId}?type=group`,
                { method: 'DELETE' },
            );
            if (res.code !== 0) {
                showToast(res.message || '解绑失败', 'error');
                return;
            }
            showToast('已解绑', 'success');
            await fetchBinds();
        } catch {
            showToast('解绑失败', 'error');
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64 empty-state">
                <div className="flex flex-col items-center gap-3">
                    <div className="loading-spinner text-primary" />
                    <div className="text-gray-400 text-sm">
                        加载绑定列表中...
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
                        placeholder="搜索 Steam ID / 昵称 / 群号..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        className="btn btn-ghost text-xs"
                        onClick={fetchBinds}
                    >
                        <IconRefresh size={13} />
                        刷新
                    </button>
                    <button
                        type="button"
                        className="btn btn-primary text-xs"
                        onClick={() => setShowAdd((v) => !v)}
                    >
                        <IconPlus size={13} />
                        新增绑定
                    </button>
                </div>
            </div>

            {/* 新增表单 */}
            {showAdd && (
                <div className="card p-4 animate-fade-in-up">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <input
                            className="input-field"
                            placeholder="Steam ID64"
                            value={form.steamId}
                            onChange={(e) =>
                                setForm({
                                    ...form,
                                    steamId: e.target.value,
                                })
                            }
                        />
                        <input
                            className="input-field"
                            placeholder="群号"
                            value={form.fromId}
                            onChange={(e) =>
                                setForm({
                                    ...form,
                                    fromId: e.target.value,
                                })
                            }
                        />
                        <input
                            className="input-field"
                            placeholder="群内昵称（可选）"
                            value={form.nickname}
                            onChange={(e) =>
                                setForm({
                                    ...form,
                                    nickname: e.target.value,
                                })
                            }
                        />
                    </div>
                    <div className="flex justify-end gap-2 mt-3">
                        <button
                            type="button"
                            className="btn btn-ghost text-xs"
                            onClick={() => {
                                setShowAdd(false);
                                setForm(EMPTY_FORM);
                            }}
                        >
                            取消
                        </button>
                        <button
                            type="button"
                            className="btn btn-primary text-xs"
                            disabled={submitting}
                            onClick={submitAdd}
                        >
                            {submitting ? '提交中...' : '确认绑定'}
                        </button>
                    </div>
                </div>
            )}

            {/* 统计 */}
            <p className="text-xs text-gray-400">
                共 {binds.length} 个绑定
                {search && `，搜索到 ${filtered.length} 个`}
            </p>

            {/* 绑定列表 */}
            <div className="card overflow-hidden animate-fade-in-up">
                <table className="w-full text-sm stagger-rows">
                    <thead>
                        <tr className="text-left text-xs text-gray-400 border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-white/[0.02]">
                            <th className="py-2.5 px-4 font-medium">
                                Steam 账号
                            </th>
                            <th className="py-2.5 px-4 font-medium">
                                绑定来源
                            </th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50 dark:divide-gray-800/50">
                        {filtered.map((bind) => (
                            <tr
                                key={bind.steamId}
                                className="hover:bg-gray-50/50 dark:hover:bg-white/[0.02] transition-colors align-top"
                            >
                                <td className="py-3 px-4">
                                    <div className="flex items-center gap-3">
                                        {bind.face ? (
                                            <img
                                                src={bind.face}
                                                alt=""
                                                className="w-9 h-9 rounded-full bg-gray-100 dark:bg-gray-800"
                                            />
                                        ) : (
                                            <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                                                <IconSteam
                                                    size={18}
                                                />
                                            </div>
                                        )}
                                        <div>
                                            <div className="text-gray-800 dark:text-gray-200 font-medium">
                                                {bind.personName ||
                                                    '未知'}
                                            </div>
                                            <div className="font-mono text-xs text-gray-500">
                                                {bind.steamId}
                                            </div>
                                        </div>
                                    </div>
                                </td>
                                <td className="py-3 px-4">
                                    {bind.from &&
                                    bind.from.length > 0 ? (
                                        <div className="flex flex-wrap gap-2">
                                            {bind.from.map((f) => (
                                                <span
                                                    key={`${f.type}:${f.id}`}
                                                    className="inline-flex items-center gap-1.5 rounded-lg bg-gray-100 dark:bg-white/[0.06] pl-2.5 pr-1 py-1 text-xs"
                                                >
                                                    <span className="text-gray-700 dark:text-gray-200">
                                                        {f.nickname ||
                                                            f.id}
                                                    </span>
                                                    <span className="font-mono text-[10px] text-gray-400">
                                                        {f.type ===
                                                        'group'
                                                            ? '群'
                                                            : '私'}
                                                        {f.id}
                                                    </span>
                                                    <button
                                                        type="button"
                                                        title="解绑"
                                                        className="text-gray-400 hover:text-red-500 transition-colors"
                                                        onClick={() =>
                                                            removeFrom(
                                                                bind.steamId,
                                                                f.id,
                                                            )
                                                        }
                                                    >
                                                        <IconTrash
                                                            size={12}
                                                        />
                                                    </button>
                                                </span>
                                            ))}
                                        </div>
                                    ) : (
                                        <span className="text-xs text-gray-400">
                                            未绑定任何来源
                                        </span>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                {filtered.length === 0 && (
                    <div className="py-12 text-center empty-state">
                        <IconSteam
                            size={32}
                            className="mx-auto text-gray-300 dark:text-gray-600 mb-3"
                        />
                        <p className="text-gray-400 text-sm">
                            {search
                                ? '没有匹配的绑定'
                                : '暂无绑定数据'}
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
