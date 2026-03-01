/**
 * 模块加载时序验证脚本
 * 验证 GameNameService 是否在模块加载时抛出错误
 */

import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log('=== 测试开始：模块加载时序 ===\n');
console.log('阶段 1: 尝试导入 dist/index.mjs');
console.log('如果模块加载时抛出 "PluginState 尚未初始化" 错误，则测试失败\n');

try {
    const modulePath = join(__dirname, '../dist/index.mjs');
    const moduleUrl = pathToFileURL(modulePath).href;
    const module = await import(moduleUrl);
    
    console.log('\n阶段 2: 模块加载成功');
    console.log('模块导出:', Object.keys(module));
    console.log('\n=== 测试通过：模块加载未抛出错误 ===');
    process.exit(0);
} catch (error) {
    console.error('\n=== 测试失败 ===');
    console.error('错误:', error.message);
    
    if (error.message.includes('PluginState 尚未初始化')) {
        console.error('\n❌ 确认：模块加载时访问了未初始化的 pluginState');
    }
    
    process.exit(1);
}
