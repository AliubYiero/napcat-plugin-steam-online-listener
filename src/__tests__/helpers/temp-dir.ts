/**
 * 临时目录工具
 * 供需要真实文件 IO 的服务（timeline、steam-bind 备份）使用。
 *
 * `makeTempDir()` 返回 `{ root, dataPath }`：
 *   - `root` 为隔离根目录，`dataPath` 为其下的 `data/` 子目录。
 *   - 之所以多一层 `data/`，是因为 `steam-bind` 的备份目录为
 *     `path.resolve(ctx.dataPath, '../backup')`，即 `root/backup`，
 *     仍落在 `root` 内，清理时一并删除。
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const createdRoots: string[] = [];

export interface TempDir {
	root: string;
	dataPath: string;
}

export function makeTempDir(): TempDir {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'steam-plugin-test-'));
	const dataPath = path.join(root, 'data');
	fs.mkdirSync(dataPath, { recursive: true });
	createdRoots.push(root);
	return { root, dataPath };
}

/** 清空指定临时目录的全部内容（保留目录本身） */
export function clearTempDir(temp: TempDir): void {
	fs.rmSync(temp.root, { recursive: true, force: true });
	fs.mkdirSync(temp.dataPath, { recursive: true });
}

export function cleanupTempDirs(): void {
	while (createdRoots.length > 0) {
		const root = createdRoots.pop()!;
		fs.rmSync(root, { recursive: true, force: true });
	}
}
