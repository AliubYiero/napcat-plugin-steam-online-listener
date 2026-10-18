/**
 * 权限模块: 角色推导与线性比较
 *
 * 范式: docs/permission-pattern.md
 * 三档模型 `user(0) < admin(1) < superAdmin(2)`
 * (本项目为纯群聊机器人, 相比标准四档去掉了 privateUser)
 */

import type { OB11Message } from 'napcat-types/napcat-onebot';
import { beforeEach, describe, expect, it } from 'vitest';
import {
    getUserRole,
    hasRole,
    isAdmin,
    isGroupAdminRole,
    isSuperAdmin,
    ROLE_LEVEL,
    type UserRole,
} from '../src/core/admin';
import { pluginState } from '../src/core/state';

const SUPER = '10001';

function groupMessage(userId: string, role?: string): OB11Message {
    return {
        message_type: 'group',
        group_id: 88888,
        user_id: userId,
        sender: { user_id: userId, nickname: 'u', role },
        raw_message: '',
    } as unknown as OB11Message;
}

function privateMessage(userId: string): OB11Message {
    return {
        message_type: 'private',
        user_id: userId,
        sender: { user_id: userId, nickname: 'u' },
        raw_message: '',
    } as unknown as OB11Message;
}

function role(
    name: UserRole['role'],
    type: 'group' | 'private' = 'group',
): UserRole {
    return { userId: '1', role: name, from: { id: '1', type } };
}

describe('ROLE_LEVEL 等级表', () => {
    it('三档线性排列', () => {
        expect(ROLE_LEVEL.user).toBeLessThan(ROLE_LEVEL.admin);
        expect(ROLE_LEVEL.admin).toBeLessThan(ROLE_LEVEL.superAdmin);
    });
});

describe('getUserRole', () => {
    beforeEach(() => {
        pluginState.config.adminUsers = [SUPER];
    });

    it('超管优先于会话类型推导 (群聊与私聊都是 superAdmin)', () => {
        expect(getUserRole(groupMessage(SUPER, 'member')).role).toBe(
            'superAdmin',
        );
        expect(getUserRole(privateMessage(SUPER)).role).toBe(
            'superAdmin',
        );
    });

    it('群管理员与群主 → admin', () => {
        expect(getUserRole(groupMessage('20001', 'admin')).role).toBe(
            'admin',
        );
        expect(getUserRole(groupMessage('20002', 'owner')).role).toBe(
            'admin',
        );
    });

    it('普通群成员 / 私聊非超管 → user', () => {
        expect(
            getUserRole(groupMessage('20003', 'member')).role,
        ).toBe('user');
        expect(getUserRole(groupMessage('20003')).role).toBe('user');
        expect(getUserRole(privateMessage('30001')).role).toBe(
            'user',
        );
    });

    it('from 记录来源会话, 供作用域校验与回复目标复用', () => {
        expect(
            getUserRole(groupMessage('20001', 'admin')).from,
        ).toEqual({ id: '88888', type: 'group' });
        expect(getUserRole(privateMessage('30001')).from).toEqual({
            id: '30001',
            type: 'private',
        });
    });
});

describe('isGroupAdminRole (纯角色判定)', () => {
    it('owner / admin 视为管理员', () => {
        expect(isGroupAdminRole('owner')).toBe(true);
        expect(isGroupAdminRole('admin')).toBe(true);
    });

    it('member / 其它 / 缺失均非管理员', () => {
        expect(isGroupAdminRole('member')).toBe(false);
        expect(isGroupAdminRole('unknown')).toBe(false);
        expect(isGroupAdminRole(undefined)).toBe(false);
    });
});

describe('isAdmin (发送人群身份检查)', () => {
    it('只在群聊分支成立', () => {
        expect(isAdmin(groupMessage('20001', 'admin'))).toBe(true);
        expect(isAdmin(groupMessage('20001', 'owner'))).toBe(true);
        expect(isAdmin(groupMessage('20001', 'member'))).toBe(false);
    });

    it('非群聊返回 false, 避免误在私聊路径上静默放行', () => {
        expect(isAdmin(privateMessage('30001'))).toBe(false);
    });
});

describe('isSuperAdmin', () => {
    beforeEach(() => {
        pluginState.config.adminUsers = [SUPER];
    });

    it('对清洗后的名单做包含检查', () => {
        expect(isSuperAdmin(SUPER)).toBe(true);
        expect(isSuperAdmin('99999')).toBe(false);
    });
});

describe('hasRole 线性比较', () => {
    it('达到或超过所需档位即通过', () => {
        expect(hasRole(role('user'), 'user')).toBe(true);
        expect(hasRole(role('user'), 'admin')).toBe(false);
        expect(hasRole(role('admin'), 'user')).toBe(true);
        expect(hasRole(role('admin'), 'admin')).toBe(true);
        expect(hasRole(role('admin'), 'superAdmin')).toBe(false);
        expect(hasRole(role('superAdmin'), 'admin')).toBe(true);
    });

    it('超管对任意档位都通过', () => {
        expect(hasRole(role('superAdmin'), 'superAdmin')).toBe(true);
    });
});
