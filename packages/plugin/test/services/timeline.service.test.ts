import fs from 'node:fs';
import path from 'node:path';
import {
    afterAll,
    beforeAll,
    beforeEach,
    describe,
    expect,
    it,
} from 'vitest';
import type { SteamPlayerSummary } from '../../src/services/steam.service';
import type {
    StatusChange,
    SteamStatusCacheItem,
} from '../../src/services/steam-cache.service';
import { timelineService } from '../../src/services/timeline.service';
import type { TimelineLog } from '../../src/types';
import { pluginStateStub } from '../helpers/plugin-state-mock';
import {
    cleanupTempDirs,
    clearTempDir,
    makeTempDir,
    type TempDir,
} from '../helpers/temp-dir';

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
});

afterAll(() => {
    cleanupTempDirs();
});

const LOG_PREFIX = 'steam-status-log';

function listLogFiles(): string[] {
    return fs
        .readdirSync(temp.dataPath)
        .filter(
            (f) => f.startsWith(LOG_PREFIX) && f.endsWith('.json'),
        );
}

function readTodayLog(): TimelineLog {
    const files = listLogFiles();
    expect(files).toHaveLength(1);
    return JSON.parse(
        fs.readFileSync(path.join(temp.dataPath, files[0]), 'utf-8'),
    ) as TimelineLog;
}

function makeChange(
    steamId: string,
    changeType: StatusChange['changeType'],
    gameid?: string,
    detectedAt = 1_700_000_000_000,
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
): SteamStatusCacheItem {
    return {
        steamId,
        personaname: 'U',
        personastate,
        gameid,
        lastUpdateTime: 0,
    };
}

function writeLogFile(dateStr: string): void {
    fs.writeFileSync(
        path.join(temp.dataPath, `${LOG_PREFIX}-${dateStr}.json`),
        JSON.stringify({
            h: ['steamId', 'changeType', 'gameId', 'updateTime'],
            d: [],
        }),
        'utf-8',
    );
}

describe('TimelineService — record', () => {
    it('空变更不写文件', () => {
        timelineService.record([]);
        expect(listLogFiles()).toHaveLength(0);
    });

    it('追加一条变更到当天日志', () => {
        timelineService.record([makeChange('111', 'online', '570')]);

        const log = readTodayLog();
        expect(log.d).toHaveLength(1);
        expect(log.d[0][0]).toBe('111');
        expect(log.d[0][1]).toBe('online');
        expect(log.d[0][2]).toBe('570');
        expect(log.d[0][3]).toBe(1_700_000_000_000);
    });

    it('同一天多次 record 会累加', () => {
        timelineService.record([makeChange('111', 'online')]);
        timelineService.record([makeChange('222', 'offline')]);
        expect(readTodayLog().d).toHaveLength(2);
    });

    it('无游戏时 gameId 记录为 null', () => {
        timelineService.record([makeChange('111', 'online')]);
        expect(readTodayLog().d[0][2]).toBeNull();
    });
});

describe('TimelineService — midnightSnapshot', () => {
    it('按 personastate 推导状态类型', () => {
        timelineService.midnightSnapshot({
            '1': cacheItem('1', 0),
            '2': cacheItem('2', 1, '570'),
            '3': cacheItem('3', 1),
            '4': cacheItem('4', 3),
        });

        const log = readTodayLog();
        const map = new Map(log.d.map((e) => [e[0], e[1]]));
        expect(map.get('1')).toBe('offline');
        expect(map.get('2')).toBe('ingame');
        expect(map.get('3')).toBe('online');
        expect(map.get('4')).toBe('inAfk');
    });
});

describe('TimelineService — checkAndArchive', () => {
    it('日志不超过 7 天时不归档', () => {
        for (let i = 1; i <= 7; i++) writeLogFile(`2026-01-0${i}`);

        timelineService.checkAndArchive();

        expect(listLogFiles()).toHaveLength(7);
        expect(
            fs.readdirSync(path.join(temp.dataPath, 'archives')),
        ).toHaveLength(0);
    });

    it('超过 7 天时归档最旧的为 ZIP 并删除源文件', () => {
        for (let i = 1; i <= 8; i++) writeLogFile(`2026-01-0${i}`);

        timelineService.checkAndArchive();

        // 保留最近 7 个
        expect(listLogFiles()).toHaveLength(7);
        expect(
            fs.existsSync(
                path.join(
                    temp.dataPath,
                    `${LOG_PREFIX}-2026-01-01.json`,
                ),
            ),
        ).toBe(false);

        // 生成 1 个 ZIP
        const archives = fs.readdirSync(
            path.join(temp.dataPath, 'archives'),
        );
        expect(archives).toHaveLength(1);
        expect(archives[0]).toMatch(/\.zip$/);
    });
});
