import type { ApiResponse } from '../types'

function resolvePluginName(): string {
    if (window.__PLUGIN_NAME__) return window.__PLUGIN_NAME__
    try {
        if (window.parent && (window.parent as Window & { __PLUGIN_NAME__?: string }).__PLUGIN_NAME__) {
            return (window.parent as Window & { __PLUGIN_NAME__?: string }).__PLUGIN_NAME__!
        }
    } catch { /* ignore */ }
    const extMatch = location.pathname.match(/\/ext\/([^/]+)/)
    if (extMatch) return extMatch[1]
    const pluginMatch = location.pathname.match(/\/plugin\/([^/]+)/)
    if (pluginMatch) return pluginMatch[1]
    return 'napcat-plugin-template'
}

const PLUGIN_NAME = resolvePluginName()

const API_BASE_NO_AUTH = '/plugin/' + PLUGIN_NAME + '/api'
const API_BASE_AUTH = '/api/Plugin/ext/' + PLUGIN_NAME

function getToken(): string {
    return localStorage.getItem('token') || ''
}

function authHeaders(h: Record<string, string> = {}): Record<string, string> {
    const token = getToken()
    if (token) h['Authorization'] = 'Bearer ' + token
    return h
}

function buildUrl(base: string, path: string): string {
    return new URL(base + path, window.location.origin).toString()
}

/**
 * 无认证 API 请求
 * 用于插件自带 WebUI 页面调用后端 router.getNoAuth / router.postNoAuth 注册的路由
 */
export async function noAuthFetch<T = unknown>(path: string, options: RequestInit = {}): Promise<ApiResponse<T>> {
    const res = await fetch(buildUrl(API_BASE_NO_AUTH, path), {
        ...options,
        headers: { 'Content-Type': 'application/json', ...options.headers }
    })
    if (!res.ok) {
        const text = await res.text()
        throw new Error(text || `HTTP ${res.status}`)
    }
    return res.json()
}

/**
 * 认证 API 请求
 * 用于需要 NapCat WebUI 登录认证的接口
 */
export async function authFetch<T = unknown>(path: string, options: RequestInit = {}): Promise<ApiResponse<T>> {
    const res = await fetch(buildUrl(API_BASE_AUTH, path), {
        ...options,
        headers: { 'Content-Type': 'application/json', ...options.headers, ...authHeaders() }
    })
    if (!res.ok) {
        const text = await res.text()
        throw new Error(text || `HTTP ${res.status}`)
    }
    return res.json()
}

// ==================== Steam 绑定管理 API ====================

import type { SteamBindItem } from '../types'

export async function getSteamBinds(fromId?: string, type?: 'group' | 'private') {
    const query = new URLSearchParams()
    if (fromId) query.append('fromId', fromId)
    if (type) query.append('type', type)
    const queryStr = query.toString()
    return noAuthFetch<SteamBindItem[]>(`/steam-binds${queryStr ? '?' + queryStr : ''}`)
}

export async function addSteamBind(data: {
    steamId: string
    fromId: string
    type: 'private' | 'group'
    nickname?: string
}) {
    return noAuthFetch('/steam-bind', {
        method: 'POST',
        body: JSON.stringify(data),
    })
}

export async function deleteSteamBind(steamId: string, fromId: string, type: 'private' | 'group') {
    return noAuthFetch(`/steam-bind/${steamId}/from/${fromId}?type=${type}`, {
        method: 'DELETE',
    })
}

// ==================== 游戏名称管理 API ====================

export interface GameNameItem {
    appid: string
    en: string
    zh?: string
}

export async function getGameNames() {
    return noAuthFetch<GameNameItem[]>('/game-names')
}

export async function updateGameName(appid: string, zh: string) {
    return noAuthFetch(`/game-name/${appid}`, {
        method: 'PUT',
        body: JSON.stringify({ zh }),
    })
}

export async function deleteGameName(appid: string) {
    return noAuthFetch(`/game-name/${appid}`, {
        method: 'DELETE',
    })
}
