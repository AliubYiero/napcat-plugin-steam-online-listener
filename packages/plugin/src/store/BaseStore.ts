/**
 * 通用列表型存储基类
 *
 * 封装"数组型数据的文件持久化 + 基础增删查改", 不含任何业务语义
 * (会话、配置键值等语义由子类或 SessionConfigStore 补充)。
 *
 * 范式: docs/store-pattern.md
 * - 【必须】构造函数 `protected` 且内部加载文件: 实例化时机由子类单例推迟到运行期,
 *   因此构造期的读取发生在 plugin_init 之后, 是安全的
 * - 【必须】写操作立即落盘, 不做批量延迟
 * - 【必须】单例 (private constructor + static getInstance) 由子类自行实现,
 *   基类不提供 getInstance
 */

import { pluginState } from '../core/state';

export abstract class BaseStore<T> {
    /** 数据文件名 (位于 ctx.dataPath 下) */
    private readonly fileName: string;

    /** 内存数据, getAll() 返回的即此引用 */
    private data: T[];

    protected constructor(fileName: string) {
        this.fileName = fileName;
        this.data = this.loadFromFile();
    }

    // ==================== 读取 ====================

    /**
     * 获取全部数据 (返回内存引用, 调用方不应直接改动其内容)
     */
    getAll(): T[] {
        return this.data;
    }

    /**
     * 从文件重新加载, 丢弃当前内存数据
     */
    reload(): void {
        this.data = this.loadFromFile();
    }

    /**
     * 查找第一个匹配项 (返回内部引用)
     */
    findItem(predicate: (item: T) => boolean): T | undefined {
        return this.data.find(predicate);
    }

    /**
     * 是否存在匹配项
     */
    hasItem(predicate: (item: T) => boolean): boolean {
        return this.data.some(predicate);
    }

    // ==================== 写入 ====================

    /**
     * 追加一项并保存
     */
    addItem(item: T): void {
        this.data.push(item);
        this.saveToFile();
    }

    /**
     * 删除第一个匹配项并保存
     * @returns 是否删除成功 (无匹配项时返回 false, 不抛错)
     */
    removeItem(predicate: (item: T) => boolean): boolean {
        const index = this.data.findIndex(predicate);
        if (index === -1) return false;
        this.data.splice(index, 1);
        this.saveToFile();
        return true;
    }

    /**
     * 替换第一个匹配项并保存
     * @param updater 接收旧项, 返回用于替换的新项 (不应原地修改旧项)
     * @returns 是否更新成功 (无匹配项时返回 false, 不抛错)
     */
    updateItem(
        predicate: (item: T) => boolean,
        updater: (item: T) => T,
    ): boolean {
        const index = this.data.findIndex(predicate);
        if (index === -1) return false;
        this.data[index] = updater(this.data[index]);
        this.saveToFile();
        return true;
    }

    /**
     * 清空并保存
     */
    reset(): void {
        this.data = [];
        this.saveToFile();
    }

    /**
     * 以一次落盘完成批量改动
     *
     * 【必须】供子类实现批量语义 (如 SessionConfigStore.setMany) 使用: 变更在内存中
     * 一次性完成, 只在末尾保存一次, 避免批量操作触发 N 次整文件重写。
     * @param mutator 接收当前数组, 返回替换后的数组 (不应原地修改传入数组)
     */
    protected mutate(mutator: (items: T[]) => T[]): void {
        this.data = mutator(this.data);
        this.saveToFile();
    }

    // ==================== 持久化 ====================

    /**
     * 从数据文件读取
     *
     * 【必须】容错: 文件缺失或内容不是数组时回退空数组, 不抛错——
     * 损坏的数据文件不应让插件启动失败。
     */
    protected loadFromFile(): T[] {
        const raw = pluginState.loadDataFile<unknown>(
            this.fileName,
            [],
        );
        if (!Array.isArray(raw)) {
            pluginState.logger.warn(
                `(；′⌒\`) 数据文件 ${this.fileName} 内容不是数组, 已按空数据加载`,
            );
            return [];
        }
        return raw as T[];
    }

    /**
     * 保存到数据文件
     */
    protected saveToFile(): void {
        pluginState.saveDataFile(this.fileName, this.data);
    }
}
