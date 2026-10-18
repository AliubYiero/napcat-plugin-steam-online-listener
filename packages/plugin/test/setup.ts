/**
 * 测试全局 setup（vitest.config.ts 的 setupFiles）
 *
 * 约定（见 docs/plans/*-test-supplement.md）：
 *   1. 全局 mock `src/core/state`，所有测试默认拿到可配置的 pluginState 桩，
 *      `beforeEach` 自动重置为默认行为。
 *   2. 全局把 `fetch` 打桩为「直接 reject」，防止测试意外发起真实网络请求；
 *      需要 fetch 的测试自行 `vi.stubGlobal('fetch', ...)` 覆写。
 *   3. `afterEach` 统一清理临时目录、恢复真实时间与全局桩。
 */

import { afterEach, beforeEach, vi } from 'vitest';
import {
    pluginStateStub,
    resetPluginStateStub,
} from './helpers/plugin-state-mock';

// 全局 mock：把真实 pluginState（getter 会抛错、会碰文件）替换为桩
vi.mock('../src/core/state', () => ({
    pluginState: pluginStateStub,
}));

beforeEach(() => {
    resetPluginStateStub();
    vi.stubGlobal(
        'fetch',
        vi.fn().mockRejectedValue(new Error('fetch 未在测试中 mock')),
    );
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
});
