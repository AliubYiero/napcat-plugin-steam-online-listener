import {
    afterAll,
    beforeAll,
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from 'vitest';
import type { SteamPlayerSummary } from '../../src/services/steam.service';
import { steamAvatarService } from '../../src/services/steam-avatar.service';
import { steamBindService } from '../../src/services/steam-bind.service';
import { pluginStateStub } from '../helpers/plugin-state-mock';
import {
    cleanupTempDirs,
    clearTempDir,
    makeTempDir,
    type TempDir,
} from '../helpers/temp-dir';

let temp: TempDir;

const STEAM_ID = '76561198000000001';
const FACE_A = 'https://avatars.steamstatic.com/aaa_medium.jpg';
const FACE_B = 'https://avatars.steamstatic.com/bbb_medium.jpg';
const FACE_C = 'https://avatars.steamstatic.com/ccc_medium.jpg';
const FACE_D = 'https://avatars.steamstatic.com/ddd_medium.jpg';

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

function stubImageFetch(
    bytes: Uint8Array = new Uint8Array([1, 2, 3]),
    contentType = 'image/jpeg',
) {
    const fn = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({
            'content-type': contentType,
            'content-length': String(bytes.byteLength),
        }),
        arrayBuffer: async () => new Uint8Array(bytes).buffer,
    });
    vi.stubGlobal('fetch', fn);
    return fn;
}

function summary(
    steamid: string,
    avatarmedium: string,
): SteamPlayerSummary {
    return { steamid, avatarmedium } as SteamPlayerSummary;
}

describe('SteamAvatarService — 取图', () => {
    it('未绑定返回 not-found', async () => {
        await expect(
            steamAvatarService.getAvatar(STEAM_ID),
        ).resolves.toEqual({ kind: 'not-found' });
    });

    it('绑定无 face 返回 not-found', async () => {
        steamBindService.save([{ steamId: STEAM_ID }]);
        await expect(
            steamAvatarService.getAvatar(STEAM_ID),
        ).resolves.toEqual({ kind: 'not-found' });
    });

    it('非白名单域名返回 not-found 且不发请求', async () => {
        steamBindService.save([
            {
                steamId: STEAM_ID,
                face: 'https://evil.example/avatar.jpg',
            },
        ]);
        const fetchFn = vi.fn();
        vi.stubGlobal('fetch', fetchFn);

        await expect(
            steamAvatarService.getAvatar(STEAM_ID),
        ).resolves.toEqual({ kind: 'not-found' });
        expect(fetchFn).not.toHaveBeenCalled();
    });

    it('成功回源并缓存, 第二次不再请求', async () => {
        steamBindService.save([{ steamId: STEAM_ID, face: FACE_A }]);
        const fetchFn = stubImageFetch();

        const first = await steamAvatarService.getAvatar(STEAM_ID);
        expect(first.kind).toBe('image');
        if (first.kind !== 'image') return;
        expect(first.image.contentType).toBe('image/jpeg');
        expect(first.image.buffer).toEqual(Buffer.from([1, 2, 3]));

        const second = await steamAvatarService.getAvatar(STEAM_ID);
        expect(second.kind).toBe('image');
        expect(fetchFn).toHaveBeenCalledTimes(1);
    });

    it('If-None-Match 命中返回 not-modified', async () => {
        steamBindService.save([{ steamId: STEAM_ID, face: FACE_B }]);
        const fetchFn = stubImageFetch();

        const first = await steamAvatarService.getAvatar(STEAM_ID);
        expect(first.kind).toBe('image');
        if (first.kind !== 'image') return;

        const cached = await steamAvatarService.getAvatar(
            STEAM_ID,
            first.image.etag,
        );
        expect(cached).toEqual({
            kind: 'not-modified',
            etag: first.image.etag,
        });
        expect(fetchFn).toHaveBeenCalledTimes(1);
    });

    it('上游失败且无缓存返回 upstream-error', async () => {
        steamBindService.save([{ steamId: STEAM_ID, face: FACE_C }]);
        vi.stubGlobal(
            'fetch',
            vi.fn().mockRejectedValue(new Error('upstream down')),
        );

        await expect(
            steamAvatarService.getAvatar(STEAM_ID),
        ).resolves.toEqual({ kind: 'upstream-error' });
    });

    it('上游失败时返回过期缓存', async () => {
        steamBindService.save([{ steamId: STEAM_ID, face: FACE_D }]);
        const fetchFn = stubImageFetch();
        await steamAvatarService.getAvatar(STEAM_ID);

        vi.useFakeTimers();
        vi.setSystemTime(Date.now() + 25 * 60 * 60 * 1000);
        fetchFn.mockRejectedValue(new Error('upstream down'));

        const result = await steamAvatarService.getAvatar(STEAM_ID);
        expect(result.kind).toBe('image');
        if (result.kind !== 'image') return;
        expect(result.image.stale).toBe(true);
        expect(fetchFn).toHaveBeenCalledTimes(2);
    });
});

describe('SteamAvatarService — syncFaces', () => {
    it('头像变化时写回绑定', () => {
        steamBindService.save([{ steamId: STEAM_ID, face: FACE_A }]);

        steamAvatarService.syncFaces([summary(STEAM_ID, FACE_B)]);

        expect(steamBindService.findBySteamId(STEAM_ID)?.face).toBe(
            FACE_B,
        );
    });

    it('相同或空头像不写盘', () => {
        steamBindService.save([{ steamId: STEAM_ID, face: FACE_A }]);
        pluginStateStub.saveDataFile.mockClear();

        steamAvatarService.syncFaces([
            summary(STEAM_ID, FACE_A),
            summary(STEAM_ID, ''),
        ]);

        expect(pluginStateStub.saveDataFile).not.toHaveBeenCalled();
    });

    it('未绑定用户忽略', () => {
        pluginStateStub.saveDataFile.mockClear();

        steamAvatarService.syncFaces([summary(STEAM_ID, FACE_B)]);

        expect(pluginStateStub.saveDataFile).not.toHaveBeenCalled();
    });
});
