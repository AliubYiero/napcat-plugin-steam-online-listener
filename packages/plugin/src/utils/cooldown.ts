/**
 * 指令冷却管理 (固定内部常量)
 *
 * 冷却时长不再作为用户配置项, 改为固定常量: 同一会话对同一指令在冷却窗口内
 * 重复触发只会收到一次提示。
 */

/** 冷却时长（秒），0 表示不限制 */
export const COOLDOWN_SECONDS = 1;

/** 冷却记录 key: `${groupId}:${command}`, value: 过期时间戳 */
const cooldownMap = new Map<string, number>();

/**
 * 检查是否在冷却中
 * @returns 剩余秒数，0 表示可用
 */
export function getCooldownRemaining(
    groupId: number | string,
    command: string,
): number {
    if (COOLDOWN_SECONDS <= 0) return 0;

    const key = `${groupId}:${command}`;
    const expireTime = cooldownMap.get(key);
    if (!expireTime) return 0;

    const remaining = Math.ceil((expireTime - Date.now()) / 1000);
    if (remaining <= 0) {
        cooldownMap.delete(key);
        return 0;
    }
    return remaining;
}

/** 设置冷却 */
export function setCooldown(
    groupId: number | string,
    command: string,
): void {
    if (COOLDOWN_SECONDS <= 0) return;
    cooldownMap.set(
        `${groupId}:${command}`,
        Date.now() + COOLDOWN_SECONDS * 1000,
    );
}

/** 清空全部冷却记录 (测试与插件重载场景) */
export function clearCooldowns(): void {
    cooldownMap.clear();
}
