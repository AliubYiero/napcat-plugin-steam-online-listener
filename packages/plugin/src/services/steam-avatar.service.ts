/**
 * Steam 头像服务
 *
 * 宿主 WebUI 的 CSP 会拦截外部图片, 因此头像由后端同源代理:
 * 只接受绑定表内的 Steam ID, 仅允许 avatars.steamstatic.com,
 * 字节缓存在进程内存中, 并在轮询时同步头像地址变更。
 */

import { createHash } from 'node:crypto';
import { pluginState } from '../core/state';
import type { SteamPlayerSummary } from './steam.service';
import { steamBindService } from './steam-bind.service';

const AVATAR_HOST = 'avatars.steamstatic.com';
const FETCH_TIMEOUT_MS = 5_000;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_CACHE_ENTRIES = 200;
const MAX_IMAGE_BYTES = 512 * 1024;

export interface AvatarImage {
    buffer: Buffer;
    contentType: string;
    etag: string;
    /** 上游失败时返回的过期缓存 */
    stale?: boolean;
}

export type AvatarLookupResult =
    | { kind: 'image'; image: AvatarImage }
    | { kind: 'not-modified'; etag: string }
    | { kind: 'not-found' }
    | { kind: 'upstream-error' };

interface CacheEntry {
    buffer: Buffer;
    contentType: string;
    etag: string;
    expiresAt: number;
}

class SteamAvatarService {
    private readonly cache = new Map<string, CacheEntry>();
    private readonly inflight = new Map<
        string,
        Promise<AvatarImage>
    >();

    /**
     * 按 Steam ID 取头像。只看绑定表, 不开放任意 URL。
     */
    async getAvatar(
        steamId: string,
        ifNoneMatch?: string,
    ): Promise<AvatarLookupResult> {
        const face = steamBindService.findBySteamId(steamId)?.face;
        if (!face) return { kind: 'not-found' };

        if (!this.isAllowedUrl(face)) {
            pluginState.logger.warn(
                `拒绝非 Steam 头像地址: ${steamId}`,
            );
            return { kind: 'not-found' };
        }

        const etag = this.buildEtag(face);
        if (ifNoneMatch && this.matchesEtag(ifNoneMatch, etag)) {
            return { kind: 'not-modified', etag };
        }

        const cached = this.getFresh(face);
        if (cached) {
            return { kind: 'image', image: toImage(cached) };
        }

        try {
            const image = await this.fetchWithDedup(face);
            return { kind: 'image', image };
        } catch (error) {
            const stale = this.cache.get(face);
            if (stale) {
                pluginState.logger.warn(
                    `获取 Steam 头像失败, 使用旧缓存: ${steamId}`,
                    error,
                );
                return {
                    kind: 'image',
                    image: { ...toImage(stale), stale: true },
                };
            }
            pluginState.logger.warn(
                `获取 Steam 头像失败: ${steamId}`,
                error,
            );
            return { kind: 'upstream-error' };
        }
    }

    /**
     * 轮询拿到玩家摘要后同步头像地址, 仅在变化时写盘。
     */
    syncFaces(summaries: SteamPlayerSummary[]): void {
        for (const summary of summaries) {
            const nextFace = summary.avatarmedium;
            if (!nextFace) continue;

            const bind = steamBindService.findBySteamId(
                summary.steamid,
            );
            if (!bind || bind.face === nextFace) continue;

            try {
                steamBindService.update({
                    steamId: bind.steamId,
                    face: nextFace,
                });
                pluginState.logger.debug(
                    `已更新 Steam 头像: ${bind.steamId}`,
                );
            } catch (error) {
                pluginState.logger.warn(
                    `更新 Steam 头像失败: ${bind.steamId}`,
                    error,
                );
            }
        }
    }

    private isAllowedUrl(face: string): boolean {
        try {
            const url = new URL(face);
            return (
                url.protocol === 'https:' &&
                url.hostname === AVATAR_HOST &&
                url.port === '' &&
                url.username === '' &&
                url.password === ''
            );
        } catch {
            return false;
        }
    }

    private buildEtag(face: string): string {
        const hash = createHash('sha1')
            .update(face)
            .digest('hex');
        return `"${hash}"`;
    }

    private matchesEtag(header: string, etag: string): boolean {
        return header.split(',').some((part) => {
            const value = part.trim();
            return (
                value === '*' ||
                value === etag ||
                value === `W/${etag}`
            );
        });
    }

    private getFresh(face: string): CacheEntry | undefined {
        const entry = this.cache.get(face);
        if (!entry || entry.expiresAt <= Date.now()) {
            return undefined;
        }
        // Map 插入顺序即 LRU 顺序
        this.cache.delete(face);
        this.cache.set(face, entry);
        return entry;
    }

    private store(face: string, entry: CacheEntry): void {
        if (
            this.cache.size >= MAX_CACHE_ENTRIES &&
            !this.cache.has(face)
        ) {
            const oldest = this.cache.keys().next().value;
            if (oldest !== undefined) this.cache.delete(oldest);
        }
        this.cache.set(face, entry);
    }

    private fetchWithDedup(face: string): Promise<AvatarImage> {
        const existing = this.inflight.get(face);
        if (existing) return existing;

        const task = this.fetchImage(face).finally(() => {
            this.inflight.delete(face);
        });
        this.inflight.set(face, task);
        return task;
    }

    private async fetchImage(face: string): Promise<AvatarImage> {
        const response = await fetch(face, {
            redirect: 'error',
            signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
            headers: { Accept: 'image/*' },
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const rawType = response.headers.get('content-type') ?? '';
        const contentType = rawType
            .split(';')[0]
            .trim()
            .toLowerCase();
        if (!contentType.startsWith('image/')) {
            throw new Error(`非图片响应: ${rawType || 'unknown'}`);
        }

        const lengthHeader = response.headers.get('content-length');
        if (
            lengthHeader &&
            Number(lengthHeader) > MAX_IMAGE_BYTES
        ) {
            throw new Error('头像文件过大');
        }

        const buffer = Buffer.from(await response.arrayBuffer());
        if (buffer.byteLength === 0) {
            throw new Error('头像响应为空');
        }
        if (buffer.byteLength > MAX_IMAGE_BYTES) {
            throw new Error('头像文件过大');
        }

        const entry: CacheEntry = {
            buffer,
            contentType,
            etag: this.buildEtag(face),
            expiresAt: Date.now() + CACHE_TTL_MS,
        };
        this.store(face, entry);
        return toImage(entry);
    }
}

function toImage(entry: CacheEntry): AvatarImage {
    return {
        buffer: entry.buffer,
        contentType: entry.contentType,
        etag: entry.etag,
    };
}

// ==================== 导出单例服务 ====================

export const steamAvatarService = new SteamAvatarService();
