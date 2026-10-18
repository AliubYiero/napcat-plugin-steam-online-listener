/**
 * 权限模块
 *
 * 回答参与者身份 (发送者 / 机器人), 不回答"这条指令需要谁"——后者是指令定义里的
 * 门槛声明 (`requiredRole`), 校验时机与失败反馈见 instructionDispatch。
 *
 * 范式: docs/permission-pattern.md
 * - 【必须】推导而非配置: 除 superAdmin 需配置名单外, 发送者角色全部从消息事件推导
 * - 【必须】入口一次性推导, 下游复用: getUserRole 在消息入口调用一次
 * - 【必须】线性比较: 权限判断一律是 "至少 X 级" 的 >= 比较, 不写矩阵式权限表
 * - 【必须】机器人自身群身份不在消息事件里, 只能经 isBotAdmin 查一次 API
 */

import type { OB11Message } from 'napcat-types/napcat-onebot';
import type { NapCatPluginContext } from 'napcat-types/napcat-onebot/network/plugin/types';
import { pluginState } from './state';

/**
 * 三档角色标准模型
 *
 * `user(0) < admin(1) < superAdmin(2)`
 *
 * 【应该】按机器人形态裁剪档位 (本项目为纯群聊机器人, 去掉了 privateUser 档)。
 * 裁剪时本联合类型与 ROLE_LEVEL 等级表同步收窄, 让遗漏的档位在编译期暴露。
 */
export type UserRoleName = 'user' | 'admin' | 'superAdmin';

/** 角色等级表: 与 UserRoleName 同处一模块, 新增档位时两处同步修改 */
export const ROLE_LEVEL: Record<UserRoleName, number> = {
    user: 0,
    admin: 1,
    superAdmin: 2,
};

/** 角色推导结果: 一次推导、处处使用 */
export interface UserRole {
    /** 用户 QQ 号 */
    userId: string;
    /** 推导出的角色档位 */
    role: UserRoleName;
    /** 来源会话, 供作用域校验与回复目标复用 */
    from: {
        /** 群号或用户 QQ 号 */
        id: string;
        type: 'private' | 'group';
    };
}

/**
 * 超级管理员判定 (读全局状态配置)
 *
 * 名单在 sanitizeConfig 中已一次性清洗为 `string[]`, 此处只做包含检查,
 * 运行期不做字符串解析。
 */
export function isSuperAdmin(qq: string): boolean {
    return pluginState.config.adminUsers.includes(qq);
}

/**
 * 群管理员角色判定 (纯函数)
 *
 * 平台口径: `owner` = 群主, `admin` = 群管理员, 其余 (含 `member`、缺失) 均非管理员。
 * 发送者 (isAdmin) 与机器人 (isBotAdmin) 共用本判定, 保证两处口径一致。
 */
export function isGroupAdminRole(role: string | undefined): boolean {
    return role === 'admin' || role === 'owner';
}

/**
 * 发送人群管理员身份检查
 *
 * 【必须】只从消息事件的 sender.role 读取平台给出的判定结果, 不自行调用群成员查询 API。
 * 【必须】只在群聊分支调用: 非群聊场景不存在"群身份", 因此返回 false——
 * 返回 true 会让任何误在私聊路径上的调用静默通过权限判定。
 */
export function isAdmin(event: OB11Message): boolean {
    if (event.message_type !== 'group') return false;
    const role = (event.sender as Record<string, unknown>)?.role;
    return typeof role === 'string' && isGroupAdminRole(role);
}

/**
 * 机器人自身群身份判定: 机器人账号在该群是否为管理员/群主
 *
 * 【必须】机器人自身角色不在消息事件里, 只能查一次 API (get_group_member_info
 * 查 pluginState.selfId)。
 * 【必须】实现 fail-closed: selfId 缺失、查询异常或返回非管理员, 一律返回 false 并记日志。
 * 【必须】仅用于机器人能力自检; @全体成员 的机器人资格以 `can_at_all` 为准
 * (见 message-send-pattern), 不用本判定替代。
 */
export async function isBotAdmin(
    ctx: NapCatPluginContext,
    groupId: string | number,
): Promise<boolean> {
    if (!pluginState.selfId) return false;
    try {
        const member = (await ctx.actions.call(
            'get_group_member_info',
            {
                group_id: String(groupId),
                user_id: pluginState.selfId,
            },
            ctx.adapterName,
            ctx.pluginManager.config,
        )) as { role?: string };
        return isGroupAdminRole(member?.role);
    } catch (error) {
        pluginState.logger.error('查询机器人群身份失败:', error);
        return false;
    }
}

/**
 * 入口推导: 分发层、帮助输出版本选择与业务 handler 共用同一个 UserRole
 *
 * 【必须】按 superAdmin → admin → user 的顺序短路命中, 一票定档, 不做档位叠加。
 * 【应该】纯函数 (只读事件字段), 但 isSuperAdmin 读配置、isBotAdmin 读 selfId 并调 API,
 * 因此整个模块只在 plugin_init 之后的运行期可用, 不要在模块加载期求值任何角色。
 */
export function getUserRole(event: OB11Message): UserRole {
    const userId = String(event.user_id);
    const isGroup = event.message_type === 'group';

    let role: UserRoleName = 'user';
    if (isSuperAdmin(userId)) {
        role = 'superAdmin';
    } else if (isGroup && isAdmin(event)) {
        role = 'admin';
    }

    return {
        userId,
        role,
        from: {
            id: isGroup
                ? String(event.group_id)
                : String(event.user_id),
            type: isGroup ? 'group' : 'private',
        },
    };
}

/**
 * 线性比较: 角色是否达到所需档位
 *
 * 【必须】接收 UserRole 对象而非裸字符串, 避免调用方在传递过程中丢失来源会话信息。
 * 【应该】只做比较, 不负责拒绝与反馈; 拒绝路径 (静默还是提示) 属于分发层策略。
 */
export function hasRole(
    userRole: UserRole,
    required: UserRoleName,
): boolean {
    return ROLE_LEVEL[userRole.role] >= ROLE_LEVEL[required];
}
