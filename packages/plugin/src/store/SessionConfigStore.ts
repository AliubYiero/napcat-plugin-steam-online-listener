/**
 * 会话级配置存储基类
 *
 * 在 BaseStore 的列表存储之上, 补齐"按 `id + type` 定位一条会话配置"的业务语义。
 * 典型场景: 哪些群开启了某推送、每个群的监听上限、某功能在某会话的开关状态。
 *
 * 范式: docs/store-pattern.md
 * - 【必须】单例与延迟实例化由子类实现 (private constructor + static getInstance),
 *   子类在 super() 中传入自己的数据文件名
 * - 【必须】写操作立即落盘 (由 BaseStore 负责)
 * - 【必须】本层不做权限校验: 是否允许改某会话的配置由 handler / service 判断
 */

import type { SessionConfigBase, SessionType } from '../types';
import { BaseStore } from './BaseStore';

export type { SessionConfigBase, SessionType };

export abstract class SessionConfigStore<
    T extends SessionConfigBase,
> extends BaseStore<T> {
    protected constructor(dataFilename: string) {
        super(dataFilename);
    }

    // ==================== 业务语义 ====================

    /**
     * 查找某会话的配置 (返回内部引用, 不要直接改动返回值, 改用 set / update)
     */
    find(id: string, type: SessionType): T | undefined {
        return this.findItem(
            (item) => item.id === id && item.type === type,
        );
    }

    /**
     * 设置某会话的配置
     *
     * 【必须】语义为"完全替换扩展字段": 传入的 config 未含某字段时, 该字段不会保留旧值,
     * 需要保留旧值时用 update。
     * @throws 校验失败时抛 Error (id 为空 / type 非法)
     */
    set(
        id: string,
        type: SessionType,
        config: Omit<T, 'id' | 'type'>,
    ): void {
        this.assertValidKey(id, type);

        const newItem = { id, type, ...config } as T;
        const updated = this.updateItem(
            (item) => item.id === id && item.type === type,
            () => newItem,
        );
        if (!updated) this.addItem(newItem);
    }

    /**
     * 批量 upsert 会话配置, 全程只落盘一次
     *
     * 【必须】语义为"合并扩展字段" (与 set 的整体覆盖不同): 已存在的记录保留未提及的
     * 字段。批量开关等场景下, 命中从未配置过的会话时新增, 命中已存在会话时更新。
     * @throws 任一 entry 校验失败时抛 Error (id 为空 / type 非法)
     */
    setMany(
        entries: Array<{
            id: string;
            type: SessionType;
            config: Partial<Omit<T, 'id' | 'type'>>;
        }>,
    ): void {
        for (const entry of entries)
            this.assertValidKey(entry.id, entry.type);

        this.mutate((items) => {
            const next = [...items];
            for (const entry of entries) {
                const index = next.findIndex(
                    (item) =>
                        item.id === entry.id &&
                        item.type === entry.type,
                );
                if (index === -1) {
                    next.push({
                        id: entry.id,
                        type: entry.type,
                        ...entry.config,
                    } as T);
                } else {
                    next[index] = {
                        ...next[index],
                        ...entry.config,
                        id: entry.id,
                        type: entry.type,
                    } as T;
                }
            }
            return next;
        });
    }

    /**
     * 部分更新某会话的配置 (保留未提及的字段)
     * @throws 校验失败或记录不存在时抛 Error
     */
    update(
        id: string,
        type: SessionType,
        partial: Partial<Omit<T, 'id' | 'type'>>,
    ): void {
        this.assertValidKey(id, type);

        const updated = this.updateItem(
            (item) => item.id === id && item.type === type,
            (old) => ({ ...old, ...partial, id, type }),
        );
        if (!updated) {
            throw new Error(`未找到会话配置: id=${id} type=${type}`);
        }
    }

    /**
     * 列出全部会话配置 (浅拷贝数组, 元素仍为内部引用)
     */
    list(): T[] {
        return [...this.getAll()];
    }

    /**
     * 删除某会话的配置
     * @returns 是否删除成功 (记录不存在时返回 false, 不抛错)
     */
    remove(id: string, type: SessionType): boolean {
        return this.removeItem(
            (item) => item.id === id && item.type === type,
        );
    }

    /**
     * 某会话是否已有配置
     */
    has(id: string, type: SessionType): boolean {
        return this.hasItem(
            (item) => item.id === id && item.type === type,
        );
    }

    // ==================== 内部 ====================

    /**
     * 定位字段校验: 尽早暴露开发者错误, 而非写出一条永远查不回来的脏数据
     */
    private assertValidKey(id: string, type: SessionType): void {
        if (!id) throw new Error('会话 id 不能为空');
        if (type !== 'private' && type !== 'group') {
            throw new Error(
                `会话 type 必须是 private 或 group, 收到: ${String(type)}`,
            );
        }
    }
}
