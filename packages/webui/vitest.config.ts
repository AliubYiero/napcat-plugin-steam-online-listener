import { defineConfig } from 'vitest/config';

/**
 * 单测配置
 *
 * 与 vite.config.ts (构建配置) 分开: 构建配置带单文件内联与插件身份注入,
 * 不适合测试期加载。测试只覆盖纯函数模块 (hash 路由解析/序列化), 跑在 node 环境。
 */
export default defineConfig({
    resolve: {
        // 与 vite.config.ts 保持一致的条件解析顺序
        conditions: ['node', 'default'],
    },
    test: {
        environment: 'node',
        include: ['test/**/*.test.ts'],
    },
});
