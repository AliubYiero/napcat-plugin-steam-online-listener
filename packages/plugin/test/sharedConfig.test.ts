/**
 * 共享配置 codec: parseStringList
 *
 * 范式: docs/webui-config-pattern.md 的 stringList 标签输入。
 * 分隔符为逗号 / 换行 / 回车, 前端标签输入与后端清洗共用同一函数, 保证前后端一致。
 */

import { parseStringList } from 'shared';
import { describe, expect, it } from 'vitest';

describe('parseStringList codec', () => {
    it('逗号 / 换行分隔 → 去空白去空项', () => {
        expect(parseStringList(' 10001 , 10002 ,, ')).toEqual([
            '10001',
            '10002',
        ]);
        expect(parseStringList('10001\n10002\r\n10003')).toEqual([
            '10001',
            '10002',
            '10003',
        ]);
        expect(parseStringList(',,,')).toEqual([]);
    });
});
