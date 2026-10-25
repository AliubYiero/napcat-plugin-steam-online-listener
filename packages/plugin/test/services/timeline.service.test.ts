import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import {
    afterAll,
    afterEach,
    beforeAll,
    beforeEach,
    describe,
    expect,
    it,
} from 'vitest';
import type { SteamPlayerSummary } from '../../src/services/steam.service';
import type { StatusChange } from '../../src/services/steam-cache.service';
import { timelineService } from '../../src/services/timeline.service';
import type {
    TimelineLog,
    TimelineLogEntry,
} from '../../src/types';
import { getChinaDateKey } from '../../src/utils/format';
import { pluginStateStub } from '../helpers/plugin-state-mock';
import {
    cleanupTempDirs,
    clearTempDir,
    makeTempDir,
    type TempDir,
} from '../helpers/temp-dir';
import {
    freezeSystemTime,
    unfreezeSystemTime,
} from '../helpers/time';

// 中国时间 2026-03-07 22:30, 今天/昨天稳定为 03-07 / 03-06
const FIXED_NOW = Date.parse('2026-03-07T14:30:00Z');
const TODAY_KEY = '2026-03-07';
const YESTERDAY_KEY = '2026-03-06';
const LOG_PREFIX = 'steam-status-log';
const HEADER = [
    'steamId',
    'changeType',
    'gameId',
    'updateTime',
] as TimelineLog['h'];

let temp: TempDir;

beforeAll(() => {
    temp = makeTempDir();
});

beforeEach(() => {
    clearTempDir(temp);
    // 复用同一路径，避免服务内部缓存的 logDir/archiveDir 失效
    fs.mkdirSync(path.join(temp.dataPath, 'archives'), {
        recursive: true,
    });
    pluginStateStub.ctx.dataPath = temp.dataPath;
    freezeSystemTime(FIXED_NOW);
});

afterEach(() => {
    unfreezeSystemTime();
});

afterAll(() => {
    cleanupTempDirs();
});

// ==================== 工具 ====================

function archiveDir(): string {
    return path.join(temp.dataPath, 'archives');
}

function listDataFiles(predicate = (name: string) => true): string[] {
    return fs
        .readdirSync(temp.dataPath)
        .filter((name) => fs.statSync(path.join(temp.dataPath, name)).isFile())
        .filter(predicate);
}

function listLogFiles(): string[] {
    return listDataFiles(
        (name) => name.startsWith(LOG_PREFIX) && name.endsWith('.json'),
    );
}

function listArchives(): string[] {
    return fs.readdirSync(archiveDir());
}

function writeLogFile(
    name: string,
    entries: TimelineLogEntry[] = [],
): string {
    const filePath = path.join(temp.dataPath, name);
    const log: TimelineLog = { h: HEADER, d: entries };
    fs.writeFileSync(filePath, JSON.stringify(log, null, 0), 'utf-8');
    return filePath;
}

function readLogFile(name: string): TimelineLog {
    return JSON.parse(
        fs.readFileSync(path.join(temp.dataPath, name), 'utf-8'),
    ) as TimelineLog;
}

function readArchive(name: string): TimelineLog {
    return JSON.parse(
        zlib
            .gunzipSync(fs.readFileSync(path.join(archiveDir(), name)))
            .toString('utf-8'),
    ) as TimelineLog;
}

function makeChange(
    steamId: string,
    changeType: StatusChange['changeType'],
    gameid?: string,
    detectedAt = FIXED_NOW,
): StatusChange {
    return {
        steamId,
        oldStatus: null,
        newStatus: {
            steamid: steamId,
            gameid,
        } as unknown as SteamPlayerSummary,
        detectedAt,
        changeType,
    } as StatusChange;
}

function cacheItem(
    steamId: string,
    personastate: number,
    gameid?: string,
) {
    return {
        steamId,
        personaname: 'U',
        personastate,
        gameid,
        lastUpdateTime: 0,
    };
}

// ==================== record ====================

describe('TimelineService — record', () => {
    it('空变更不写文件', () => {
        timelineService.record([]);
        expect(listLogFiles()).toHaveLength(0);
    });

    it('追加一条变更到事件当天日志', () => {
        timelineService.record([makeChange('111', 'online', '570')]);

        const log = readLogFile(`${LOG_PREFIX}-${TODAY_KEY}.json`);
        expect(log.d).toHaveLength(1);
        expect(log.d[0][0]).toBe('111');
        expect(log.d[0][1]).toBe('online');
        expect(log.d[0][2]).toBe('570');
        expect(log.d[0][3]).toBe(FIXED_NOW);
    });

    it('同一天多次 record 会累加', () => {
        timelineService.record([makeChange('111', 'online')]);
        timelineService.record([makeChange('222', 'offline')]);
        expect(
            readLogFile(`${LOG_PREFIX}-${TODAY_KEY}.json`).d,
        ).toHaveLength(2);
    });

    it('无游戏时 gameId 记录为 null', () => {
        timelineService.record([makeChange('111', 'online')]);
        expect(
            readLogFile(`${LOG_PREFIX}-${TODAY_KEY}.json`).d[0][2],
        ).toBeNull();
    });

    it('按事件时刻的中国日期分文件：23:59 与 00:01 落到不同文件', () => {
        const chinaMidnight = Date.parse('2026-03-07T16:00:00Z');
        timelineService.record([
            makeChange('111', 'online', undefined, chinaMidnight - 60000),
            makeChange('111', 'offline', undefined, chinaMidnight + 60000),
        ]);

        expect(listLogFiles().sort()).toEqual([
            `${LOG_PREFIX}-2026-03-07.json`,
            `${LOG_PREFIX}-2026-03-08.json`,
        ]);
        expect(
            readLogFile(`${LOG_PREFIX}-2026-03-07.json`).d,
        ).toHaveLength(1);
        expect(
            readLogFile(`${LOG_PREFIX}-2026-03-08.json`).d,
        ).toHaveLength(1);
    });

    it('写入今日日志时把旧命名的同日文件并入', () => {
        writeLogFile(`${LOG_PREFIX}-2026-3-7.json`, [
            ['999', 'offline', null, FIXED_NOW - 1000],
        ]);

        timelineService.record([makeChange('111', 'online')]);

        expect(listLogFiles()).toEqual([
            `${LOG_PREFIX}-${TODAY_KEY}.json`,
        ]);
        const log = readLogFile(`${LOG_PREFIX}-${TODAY_KEY}.json`);
        expect(log.d.map((entry) => entry[0])).toEqual(['999', '111']);
    });
});

// ==================== 快照 ====================

describe('TimelineService — midnightSnapshot', () => {
    it('按 personastate 推导状态类型并写入指定日期与时间戳', () => {
        timelineService.midnightSnapshot(
            {
                '1': cacheItem('1', 0),
                '2': cacheItem('2', 1, '570'),
                '3': cacheItem('3', 1),
                '4': cacheItem('4', 3),
            },
            TODAY_KEY,
            FIXED_NOW,
        );

        const log = readLogFile(`${LOG_PREFIX}-${TODAY_KEY}.json`);
        const map = new Map(log.d.map((e) => [e[0], e[1]]));
        expect(map.get('1')).toBe('offline');
        expect(map.get('2')).toBe('ingame');
        expect(map.get('3')).toBe('online');
        expect(map.get('4')).toBe('inAfk');
        expect(log.d.every((e) => e[3] === FIXED_NOW)).toBe(true);
    });

    it('缓存为空时不写文件', () => {
        timelineService.midnightSnapshot({}, TODAY_KEY, FIXED_NOW);
        expect(listLogFiles()).toHaveLength(0);
    });
});

describe('TimelineService — startupSnapshot', () => {
    it('只为今日缺记录的用户补起点', () => {
        writeLogFile(`${LOG_PREFIX}-${TODAY_KEY}.json`, [
            ['111', 'online', null, FIXED_NOW - 1000],
        ]);

        timelineService.startupSnapshot({
            '111': cacheItem('111', 1, '570'),
            '222': cacheItem('222', 0),
        });

        const log = readLogFile(`${LOG_PREFIX}-${TODAY_KEY}.json`);
        expect(log.d.map((entry) => entry[0])).toEqual(['111', '222']);
        expect(log.d[1][1]).toBe('offline');
        expect(log.d[1][3]).toBe(FIXED_NOW);
    });

    it('缓存为空时不创建文件', () => {
        timelineService.startupSnapshot({});
        expect(listLogFiles()).toHaveLength(0);
    });
});

// ==================== 同日命名合并 ====================

describe('TimelineService — normalizeDateVariants', () => {
    it('同日多份命名合并为补零文件并去重排序', () => {
        writeLogFile(`${LOG_PREFIX}-2026-3-1.json`, [
            ['222', 'offline', null, 2000],
            ['111', 'online', null, 1000],
        ]);
        writeLogFile(`${LOG_PREFIX}-2026-03-01.json`, [
            ['111', 'online', null, 1000],
            ['333', 'ingame', '570', 3000],
        ]);

        timelineService.normalizeDateVariants();

        expect(listLogFiles()).toEqual([
            `${LOG_PREFIX}-2026-03-01.json`,
        ]);
        const log = readLogFile(`${LOG_PREFIX}-2026-03-01.json`);
        expect(log.d.map((entry) => entry[0])).toEqual([
            '111',
            '222',
            '333',
        ]);
    });

    it('单独存在的旧命名文件保持原样', () => {
        writeLogFile(`${LOG_PREFIX}-2026-3-1.json`, [
            ['111', 'online', null, 1000],
        ]);

        timelineService.normalizeDateVariants();

        expect(listLogFiles()).toEqual([
            `${LOG_PREFIX}-2026-3-1.json`,
        ]);
    });
});

// ==================== 归档 ====================

describe('TimelineService — checkAndArchive', () => {
    it('只保留今天与昨天', () => {
        writeLogFile(`${LOG_PREFIX}-${YESTERDAY_KEY}.json`);
        writeLogFile(`${LOG_PREFIX}-${TODAY_KEY}.json`);

        timelineService.checkAndArchive();

        expect(listLogFiles().sort()).toEqual(
            [
                `${LOG_PREFIX}-${YESTERDAY_KEY}.json`,
                `${LOG_PREFIX}-${TODAY_KEY}.json`,
            ].sort(),
        );
        expect(listArchives()).toHaveLength(0);
    });

    it('更早的日志逐日 gzip 并删除源文件', () => {
        const entries: TimelineLogEntry[] = [
            ['111', 'online', null, 1000],
        ];
        writeLogFile(`${LOG_PREFIX}-2026-03-01.json`, entries);

        timelineService.checkAndArchive();

        expect(listLogFiles()).toHaveLength(0);
        expect(listArchives()).toEqual([
            `${LOG_PREFIX}-2026-03-01.json.gz`,
        ]);
        expect(
            readArchive(`${LOG_PREFIX}-2026-03-01.json.gz`).d,
        ).toEqual(entries);
    });

    it('旧命名归档为补零文件名', () => {
        writeLogFile(`${LOG_PREFIX}-2026-3-1.json`);

        timelineService.checkAndArchive();

        expect(listArchives()).toEqual([
            `${LOG_PREFIX}-2026-03-01.json.gz`,
        ]);
    });

    it('未来日期的文件保留', () => {
        writeLogFile(`${LOG_PREFIX}-2026-03-09.json`);

        timelineService.checkAndArchive();

        expect(listLogFiles()).toEqual([
            `${LOG_PREFIX}-2026-03-09.json`,
        ]);
        expect(listArchives()).toHaveLength(0);
    });

    it('无法解析日期的同名文件原样归档并保留原名', () => {
        writeLogFile(`${LOG_PREFIX}-backup.json`);

        timelineService.checkAndArchive();

        expect(listLogFiles()).toHaveLength(0);
        expect(listArchives()).toEqual([
            `${LOG_PREFIX}-backup.json.gz`,
        ]);
    });

    it('原子写残留的 .tmp 不归档', () => {
        fs.writeFileSync(
            path.join(temp.dataPath, `${LOG_PREFIX}-2026-03-01.json.tmp`),
            '{}',
            'utf-8',
        );

        timelineService.checkAndArchive();

        expect(listArchives()).toHaveLength(0);
        expect(listDataFiles()).toHaveLength(1);
    });

    it('归档同名且内容不同时另存 -2，不覆盖旧归档', () => {
        writeLogFile(`${LOG_PREFIX}-2026-03-01.json`, [
            ['222', 'offline', null, 2000],
        ]);
        fs.writeFileSync(
            path.join(archiveDir(), `${LOG_PREFIX}-2026-03-01.json.gz`),
            zlib.gzipSync(Buffer.from('old-content')),
        );

        timelineService.checkAndArchive();

        expect(listArchives().sort()).toEqual(
            [
                `${LOG_PREFIX}-2026-03-01.json.gz`,
                `${LOG_PREFIX}-2026-03-01-2.json.gz`,
            ].sort(),
        );
        expect(
            zlib
                .gunzipSync(
                    fs.readFileSync(
                        path.join(
                            archiveDir(),
                            `${LOG_PREFIX}-2026-03-01.json.gz`,
                        ),
                    ),
                )
                .toString('utf-8'),
        ).toBe('old-content');
    });

    it('归档同名且内容一致时只删除源文件', () => {
        const log: TimelineLog = {
            h: HEADER,
            d: [['111', 'online', null, 1000]],
        };
        const content = JSON.stringify(log, null, 0);
        const sourcePath = path.join(
            temp.dataPath,
            `${LOG_PREFIX}-2026-03-01.json`,
        );
        fs.writeFileSync(sourcePath, content, 'utf-8');
        fs.writeFileSync(
            path.join(archiveDir(), `${LOG_PREFIX}-2026-03-01.json.gz`),
            zlib.gzipSync(Buffer.from(content)),
        );

        timelineService.checkAndArchive();

        expect(fs.existsSync(sourcePath)).toBe(false);
        expect(listArchives()).toEqual([
            `${LOG_PREFIX}-2026-03-01.json.gz`,
        ]);
    });

    it('归档失败时不删除源文件', () => {
        writeLogFile(`${LOG_PREFIX}-2026-03-01.json`);

        // 归档目录不可写: 写入临时文件会失败
        fs.rmSync(archiveDir(), { recursive: true, force: true });

        timelineService.checkAndArchive();

        expect(listLogFiles()).toEqual([
            `${LOG_PREFIX}-2026-03-01.json`,
        ]);
        expect(fs.existsSync(archiveDir())).toBe(false);
    });
});
