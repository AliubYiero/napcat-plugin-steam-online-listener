import type { OB11Message } from 'napcat-types/napcat-onebot';
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from 'vitest';
import {
    createAtMessage,
    createFaceMessage,
    createImageMessage,
    createReplyMessage,
    createTextMessage,
    sendForwardMsg,
    sendGroupMessage,
    sendPrivateMessage,
    sendReply,
} from '../../src/handlers/utils';
import {
    COOLDOWN_SECONDS,
    clearCooldowns,
    getCooldownRemaining,
    setCooldown,
} from '../../src/utils/cooldown';
import { makeFakeCtx } from '../helpers/fake-ctx';
import { freezeDateNow } from '../helpers/time';

function makeEvent(
    overrides: Record<string, unknown> = {},
): OB11Message {
    return {
        message_type: 'group',
        group_id: 100,
        user_id: 200,
        ...overrides,
    } as unknown as OB11Message;
}

describe('消息段工厂 createXxxMessage', () => {
    it('createTextMessage', () => {
        expect(createTextMessage('hi')).toEqual({
            type: 'text',
            data: { text: 'hi' },
        });
    });

    it('createImageMessage', () => {
        expect(createImageMessage('file://a.png')).toEqual({
            type: 'image',
            data: { file: 'file://a.png' },
        });
    });

    it('createFaceMessage', () => {
        expect(createFaceMessage('1')).toEqual({
            type: 'face',
            data: { id: '1' },
        });
    });

    it('createReplyMessage', () => {
        expect(createReplyMessage('999')).toEqual({
            type: 'reply',
            data: { id: '999' },
        });
    });

    it('createAtMessage 无 name 时不写入 name 字段', () => {
        expect(createAtMessage('123')).toEqual({
            type: 'at',
            data: { qq: '123' },
        });
    });

    it('createAtMessage 有 name 时写入 name 字段', () => {
        expect(createAtMessage('123', 'Tom')).toEqual({
            type: 'at',
            data: { qq: '123', name: 'Tom' },
        });
    });
});

describe('CD 冷却', () => {
    beforeEach(() => {
        clearCooldowns();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('未设置冷却时返回 0', () => {
        expect(getCooldownRemaining('g1', 'cmd')).toBe(0);
    });

    it('设置后返回剩余秒数', () => {
        freezeDateNow(1_000_000);
        setCooldown('g1', 'cmd');
        expect(getCooldownRemaining('g1', 'cmd')).toBe(
            COOLDOWN_SECONDS,
        );
    });

    it('过期后返回 0 并惰性清理', () => {
        const nowSpy = vi.spyOn(Date, 'now');
        nowSpy.mockReturnValue(1_000_000);
        setCooldown('g1', 'cmd');
        nowSpy.mockReturnValue(
            1_000_000 + (COOLDOWN_SECONDS + 1) * 1000,
        );
        expect(getCooldownRemaining('g1', 'cmd')).toBe(0);
    });

    it('不同 group / command 互不影响', () => {
        freezeDateNow(1_000_000);
        setCooldown('g1', 'cmd');
        expect(getCooldownRemaining('g2', 'cmd')).toBe(0);
        expect(getCooldownRemaining('g1', 'other')).toBe(0);
    });
});

describe('消息发送工具', () => {
    it('sendReply 群聊走 send_msg 并带 group_id', async () => {
        const ctx = makeFakeCtx();
        const ok = await sendReply(
            ctx,
            makeEvent(),
            createTextMessage('hi'),
        );
        expect(ok).toBe(true);
        expect(ctx.actions.call).toHaveBeenCalledTimes(1);
        const [action, params] = ctx.actions.call.mock.calls[0];
        expect(action).toBe('send_msg');
        expect(params).toMatchObject({
            message_type: 'group',
            group_id: '100',
        });
    });

    it('sendReply 私聊带 user_id', async () => {
        const ctx = makeFakeCtx();
        await sendReply(
            ctx,
            makeEvent({ message_type: 'private' }),
            'hi',
        );
        const [, params] = ctx.actions.call.mock.calls[0];
        expect(params).toMatchObject({
            message_type: 'private',
            user_id: '200',
        });
    });

    it('sendGroupMessage 走 send_group_msg', async () => {
        const ctx = makeFakeCtx();
        const ok = await sendGroupMessage(ctx, 100, 'hi');
        expect(ok).toBe(true);
        expect(ctx.actions.call.mock.calls[0][0]).toBe(
            'send_group_msg',
        );
        expect(ctx.actions.call.mock.calls[0][1]).toMatchObject({
            group_id: '100',
        });
    });

    it('sendPrivateMessage 走 send_private_msg', async () => {
        const ctx = makeFakeCtx();
        const ok = await sendPrivateMessage(ctx, 200, 'hi');
        expect(ok).toBe(true);
        expect(ctx.actions.call.mock.calls[0][0]).toBe(
            'send_private_msg',
        );
        expect(ctx.actions.call.mock.calls[0][1]).toMatchObject({
            user_id: '200',
        });
    });

    it('sendForwardMsg 群聊 / 私聊选择正确 action', async () => {
        const groupCtx = makeFakeCtx();
        await sendForwardMsg(groupCtx, 100, true, []);
        expect(groupCtx.actions.call.mock.calls[0][0]).toBe(
            'send_group_forward_msg',
        );

        const privateCtx = makeFakeCtx();
        await sendForwardMsg(privateCtx, 200, false, []);
        expect(privateCtx.actions.call.mock.calls[0][0]).toBe(
            'send_private_forward_msg',
        );
    });

    it('发送失败时不抛异常，返回 false', async () => {
        const ctx = makeFakeCtx();
        ctx.actions.call.mockRejectedValueOnce(
            new Error('network down'),
        );
        await expect(sendReply(ctx, makeEvent(), 'hi')).resolves.toBe(
            false,
        );
    });

    it('发送成功返回 true', async () => {
        const ctx = makeFakeCtx();
        await expect(sendGroupMessage(ctx, 100, 'hi')).resolves.toBe(
            true,
        );
    });
});
