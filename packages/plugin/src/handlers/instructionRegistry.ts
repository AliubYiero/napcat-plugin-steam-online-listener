/**
 * 指令注册表 (装配层, 不含业务逻辑)
 *
 * 范式: docs/instruction-pattern.md
 * - 【必须】新增指令 = 注册表加一行; handler 写成独立文件 (handlers/commands/),
 *   注册表只做装配
 * - 【必须】指令名在分发前统一小写, 指令不区分大小写
 * - 【必须】因此**注册表的键必须全小写**——分发层用小写后的名字查表,
 *   驼峰或大写键永远命中不了 (不会被报错, 只会静默失效)
 * - 【必须】未命中模块/子指令/一级指令时静默返回 (见 instructionDispatch)
 *
 * 两种命名空间形态最终汇入同一个校验终点 (dispatch):
 * - 二级命名空间: 模块 → 子指令, 注册在 instructionSetMapper (group / admin)
 * - 一级命名空间: 无模块前缀的直达指令, 注册在 rootInstructionSetMapper
 */

import type { OB11Message } from 'napcat-types/napcat-onebot';
import type { NapCatPluginContext } from 'napcat-types/napcat-onebot/network/plugin/types';
import type { UserRole, UserRoleName } from '../core/admin';
import {
    adminAddHandler,
    adminHelpHandler,
    adminListHandler,
    adminRemoveHandler,
} from './commands/adminHandlers';
import { bindBatchHandler } from './commands/bindBatchHandler';
import { bindHandler } from './commands/bindHandler';
import {
    groupAddHandler,
    groupHelpHandler,
    groupListHandler,
    groupRemoveHandler,
} from './commands/groupHandlers';
import { helpHandler } from './commands/helpHandler';
import { listHandler } from './commands/listHandler';
import { pollingHandler } from './commands/pollingHandler';
import { removeHandler } from './commands/removeHandler';
import { reportHandler } from './commands/reportHandler';
import { resetHandler } from './commands/resetHandler';
import { searchHandler } from './commands/searchHandler';

/**
 * 指令 handler
 *
 * 【必须】收到的参数已保证满足角色与作用域要求, handler 内部不再重复校验。
 * 第四个参数 `userRole` 是入口处一次性推导的结果, 不需要时省略该形参即可。
 */
export type InstructionHandler = (
    ctx: NapCatPluginContext,
    event: OB11Message,
    commands: string[],
    userRole: UserRole,
) => void | Promise<void>;

/** 形态化作用域规则: 同一指令按参数个数绑定不同权限/作用域 */
export interface ScopeRule {
    /** 命中的参数个数 */
    args: number;
    /** 允许的会话类型, 缺省不限 */
    scope?: 'group' | 'private';
    /** 执行所需最低角色, 缺省 user */
    requiredRole?: UserRoleName;
}

/** 指令定义: 一个执行函数 + 可选的门槛声明 */
export interface InstructionDefinition {
    handler: InstructionHandler;
    /** 执行所需最低角色, 缺省 user (所有人可用) */
    requiredRole?: UserRoleName;
    /** 允许的会话类型, 缺省不限; 不满足时回复固定提示 */
    scope?: 'group' | 'private';
    /**
     * 形态化作用域规则 (进阶): 声明后按 args 数匹配第一条规则,
     * 【必须】未命中任何形态时静默返回, 因此新增参数形态时必须同步补充条目。
     */
    scopeRules?: ScopeRule[];
}

/**
 * 二级命名空间: 模块 → 子指令 → 定义
 *
 * 装配示例 (`#steam group add ...`): group / admin 两个超级管理员模块。
 * 管理模块仅私聊可用 (scope: 'private'), 门槛为 superAdmin。
 */
export const instructionSetMapper: Record<
    string,
    Record<string, InstructionDefinition>
> = {
    group: {
        add: {
            handler: groupAddHandler,
            requiredRole: 'superAdmin',
            scope: 'private',
        },
        remove: {
            handler: groupRemoveHandler,
            requiredRole: 'superAdmin',
            scope: 'private',
        },
        del: {
            handler: groupRemoveHandler,
            requiredRole: 'superAdmin',
            scope: 'private',
        },
        list: {
            handler: groupListHandler,
            requiredRole: 'superAdmin',
            scope: 'private',
        },
        help: {
            handler: groupHelpHandler,
            requiredRole: 'superAdmin',
            scope: 'private',
        },
    },
    admin: {
        list: {
            handler: adminListHandler,
            requiredRole: 'superAdmin',
            scope: 'private',
        },
        add: {
            handler: adminAddHandler,
            requiredRole: 'superAdmin',
            scope: 'private',
        },
        remove: {
            handler: adminRemoveHandler,
            requiredRole: 'superAdmin',
            scope: 'private',
        },
        help: {
            handler: adminHelpHandler,
            requiredRole: 'superAdmin',
            scope: 'private',
        },
    },
};

/** 一级命名空间: 指令名 → 定义 (无模块前缀的直达指令) */
export const rootInstructionSetMapper: Record<
    string,
    InstructionDefinition
> = {
    // 帮助与查询: 全体用户可用; help 的图片版本按角色与会话类型选择
    help: { handler: helpHandler },
    search: { handler: searchHandler, scope: 'group' },
    list: { handler: listHandler, scope: 'group' },
    // 绑定管理: 仅群聊
    bind: { handler: bindHandler, scope: 'group' },
    'bind-batch': { handler: bindBatchHandler, scope: 'group' },
    remove: { handler: removeHandler, scope: 'group' },
    // 报告: 仅群聊
    report: { handler: reportHandler, scope: 'group' },
    // 群内管理员可清空当前群全部绑定
    reset: {
        handler: resetHandler,
        requiredRole: 'admin',
        scope: 'group',
    },
    // 手动轮询: 仅私聊超级管理员
    polling: {
        handler: pollingHandler,
        requiredRole: 'superAdmin',
        scope: 'private',
    },
};
