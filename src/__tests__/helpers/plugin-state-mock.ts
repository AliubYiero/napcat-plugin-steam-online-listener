/**
 * pluginState 测试桩
 *
 * 通过 `src/__tests__/setup.ts` 全局 `vi.mock('../core/state')` 注入，
 * 所有测试默认拿到本桩对象（同一实例）。测试可 import 本模块的
 * `pluginStateStub` 直接改写各 `vi.fn()` 的行为。
 *
 * 注意：真实 `pluginState.ctx` 是 getter，未 `init` 时访问会抛错；
 * 本桩把它替换为普通对象，避免测试踩到该约束。
 */

import { vi } from 'vitest';
import type { Mock } from 'vitest';
import { DEFAULT_CONFIG } from '../../config';
import type { PluginConfig } from '../../types';

export interface StubLogger {
	info: Mock;
	warn: Mock;
	error: Mock;
	debug: Mock;
}

export interface PluginStateStub {
	config: PluginConfig;
	selfId: string;
	loadDataFile: Mock;
	saveDataFile: Mock;
	getDataFilePath: Mock;
	logger: StubLogger;
	ctx: {
		actions: { call: Mock };
		adapterName: string;
		pluginManager: { config: Record<string, unknown> };
		dataPath: string;
		logger: StubLogger;
	};
}

function makeLogger(): StubLogger {
	return { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
}

/**
 * 将桩对象恢复为初始默认行为
 * 全局 `beforeEach` 会调用一次，测试可在其后再覆写自己关心的字段。
 */
export function resetPluginStateStub(stub: PluginStateStub = pluginStateStub): void {
	stub.config = structuredClone(DEFAULT_CONFIG);
	stub.selfId = '10001';

	// 默认透传 defaultValue（等价于「文件不存在」）
	stub.loadDataFile.mockReset();
	stub.loadDataFile.mockImplementation((_filename: string, defaultValue: unknown) => defaultValue);

	stub.saveDataFile.mockReset();
	stub.getDataFilePath.mockReset();
	stub.getDataFilePath.mockImplementation((filename: string) => filename);

	for (const key of ['info', 'warn', 'error', 'debug'] as const) {
		stub.logger[key].mockReset();
		stub.ctx.logger[key].mockReset();
	}

	stub.ctx.actions.call.mockReset();
	stub.ctx.actions.call.mockResolvedValue({});
	stub.ctx.adapterName = 'napcat';
	stub.ctx.pluginManager = { config: {} };
	stub.ctx.dataPath = '';
}

export function createPluginStateStub(): PluginStateStub {
	const logger = makeLogger();
	const stub: PluginStateStub = {
		config: structuredClone(DEFAULT_CONFIG),
		selfId: '10001',
		loadDataFile: vi.fn(),
		saveDataFile: vi.fn(),
		getDataFilePath: vi.fn(),
		logger,
		ctx: {
			actions: { call: vi.fn() },
			adapterName: 'napcat',
			pluginManager: { config: {} },
			dataPath: '',
			logger,
		},
	};
	resetPluginStateStub(stub);
	return stub;
}

/** 全局共享的 pluginState 桩单例 */
export const pluginStateStub = createPluginStateStub();
