import { describe, it, expect, beforeEach, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { steamBindService } from '../../services/steam-bind.service';
import { pluginStateStub } from '../helpers/plugin-state-mock';
import { makeTempDir, clearTempDir, cleanupTempDirs, type TempDir } from '../helpers/temp-dir';
import type { SteamBindItem } from '../../types';

let temp: TempDir;

beforeAll(() => {
	temp = makeTempDir();
});

beforeEach(() => {
	clearTempDir(temp);
	pluginStateStub.ctx.dataPath = temp.dataPath;
	steamBindService.save([]);
});

afterAll(() => {
	cleanupTempDirs();
});

describe('SteamBindService — CRUD', () => {
	it('初始为空', () => {
		expect(steamBindService.getAll()).toEqual([]);
	});

	it('save 后可通过 getAll 读回', () => {
		steamBindService.save([{ steamId: '1' }]);
		expect(steamBindService.getAll()).toEqual([{ steamId: '1' }]);
	});

	it('save(null) 被拦截，数据不变', () => {
		steamBindService.save([{ steamId: '1' }]);
		steamBindService.save(null as unknown as SteamBindItem[]);
		expect(steamBindService.getAll()).toHaveLength(1);
	});

	it('save(非数组) 被拦截，数据不变', () => {
		steamBindService.save([{ steamId: '1' }]);
		steamBindService.save({} as unknown as SteamBindItem[]);
		expect(steamBindService.getAll()).toHaveLength(1);
	});

	it('findBySteamId', () => {
		steamBindService.save([{ steamId: '1' }, { steamId: '2' }]);
		expect(steamBindService.findBySteamId('2')).toEqual({ steamId: '2' });
		expect(steamBindService.findBySteamId('9')).toBeUndefined();
	});

	it('findByNickname 命中任意来源的自定义昵称', () => {
		steamBindService.save([
			{ steamId: '1', from: [{ id: 'u1', type: 'private', nickname: 'Al' }] },
		]);
		expect(steamBindService.findByNickname('Al')).toMatchObject({ steamId: '1' });
		expect(steamBindService.findByNickname('Bob')).toBeUndefined();
	});

	it('findByFrom 按 id + type 过滤', () => {
		steamBindService.save([
			{ steamId: '1', from: [{ id: 'g1', type: 'group' }] },
			{ steamId: '2', from: [{ id: 'g1', type: 'private' }] },
		]);
		expect(steamBindService.findByFrom('g1', 'group')).toHaveLength(1);
		expect(steamBindService.findByFrom('g1', 'group')[0].steamId).toBe('1');
		expect(steamBindService.findByFrom('g1', 'private')[0].steamId).toBe('2');
	});

	it('update 新增条目', () => {
		steamBindService.update({ steamId: '1', personName: 'A' });
		expect(steamBindService.findBySteamId('1')).toMatchObject({ personName: 'A' });
	});

	it('update 合并同来源的自定义昵称', () => {
		steamBindService.save([{ steamId: '1', from: [{ id: 'g1', type: 'group' }] }]);
		steamBindService.update({ steamId: '1', from: [{ id: 'g1', type: 'group', nickname: 'X' }] });
		expect(steamBindService.findBySteamId('1')?.from).toEqual([{ id: 'g1', type: 'group', nickname: 'X' }]);
	});

	it('removeFrom 保留其它来源', () => {
		steamBindService.save([
			{ steamId: '1', from: [{ id: 'g1', type: 'group' }, { id: 'g2', type: 'group' }] },
		]);
		steamBindService.removeFrom('g1', 'group');
		expect(steamBindService.findBySteamId('1')?.from).toEqual([{ id: 'g2', type: 'group' }]);
	});

	it('removeFrom 删空来源后删除整个条目', () => {
		steamBindService.save([{ steamId: '1', from: [{ id: 'g1', type: 'group' }] }]);
		steamBindService.removeFrom('g1', 'group');
		expect(steamBindService.getAll()).toHaveLength(0);
	});
});

describe('SteamBindService — 备份', () => {
	it('backup 在 ../backup 下生成备份文件', () => {
		steamBindService.save([{ steamId: '1' }]);
		steamBindService.backup();

		const backupDir = path.join(temp.root, 'backup');
		const files = fs.readdirSync(backupDir).filter(f => f.startsWith('steam-bind-data.backup.'));
		expect(files).toHaveLength(1);
		expect(JSON.parse(fs.readFileSync(path.join(backupDir, files[0]), 'utf-8'))).toEqual([{ steamId: '1' }]);
	});

	it('backup 清理旧文件，仅保留最新 5 个', () => {
		const backupDir = path.join(temp.root, 'backup');
		fs.mkdirSync(backupDir, { recursive: true });
		for (let i = 1; i <= 6; i++) {
			fs.writeFileSync(path.join(backupDir, `steam-bind-data.backup.2026-01-0${i}.json`), '[]', 'utf-8');
		}
		// 再备份一次 → 共 7 个 → 清理后剩 5 个
		steamBindService.save([{ steamId: '1' }]);
		steamBindService.backup();

		const files = fs.readdirSync(backupDir).filter(f => f.startsWith('steam-bind-data.backup.'));
		expect(files).toHaveLength(5);
		// 最旧的两个（...01 / ...02）应被删除
		expect(files.some(f => f.includes('2026-01-01'))).toBe(false);
		expect(files.some(f => f.includes('2026-01-02'))).toBe(false);
	});
});
