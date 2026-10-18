/**
 * 伪造的 NapCat 插件上下文（ctx）
 *
 * 供 `handlers/utils.ts` 的发送函数（`sendReply` / `sendGroupMessage` /
 * `sendPrivateMessage` / `sendForwardMsg`）测试使用：
 * 它们的副作用统一走 `ctx.actions.call`，此处用 `vi.fn()` 捕获。
 */

import type { NapCatPluginContext } from 'napcat-types/napcat-onebot/network/plugin/types';
import type { Mock } from 'vitest';
import { vi } from 'vitest';

export interface FakeCtx {
    actions: { call: Mock };
    adapterName: string;
    pluginManager: { config: Record<string, unknown> };
    dataPath: string;
    logger: { info: Mock; warn: Mock; error: Mock; debug: Mock };
}

/**
 * 构造一个最小可用的假 ctx
 * 返回类型交叉 `NapCatPluginContext`，既可直接传给发送函数，
 * 也能访问 `actions.call` 等 `vi.fn()` 断言 API。
 */
export function makeFakeCtx(): FakeCtx & NapCatPluginContext {
    return {
        actions: { call: vi.fn().mockResolvedValue({}) },
        adapterName: 'napcat',
        pluginManager: { config: {} },
        dataPath: '',
        logger: {
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
            debug: vi.fn(),
        },
    } as unknown as FakeCtx & NapCatPluginContext;
}
