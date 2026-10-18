import { defineConfig } from 'vitest/config';

/**
 * 单测配置
 *
 * 与 vite.config.ts (构建配置) 分开: 构建配置带 lib 输出与热部署插件, 不适合测试期加载。
 * 测试只覆盖纯函数模块 (指令前缀剥离、权限推导、配置清洗、消息段工厂、分发判定),
 * 因此跑在 node 环境, 不需要浏览器运行时。
 */
export default defineConfig({
    resolve: {
        // 与 vite.config.ts 保持一致的条件解析顺序
        conditions: ['node', 'default'],
    },
    test: {
        environment: 'node',
        include: ['test/**/*.test.ts'],
        setupFiles: ['test/setup.ts'],
    },
});
