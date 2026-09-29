/**
 * 把 `src/` 下的 ESM 源码打包成浏览器运行时真正要的那一个 `client.js`。
 *
 * 为什么需要这一步：运行时里**每一个**客户端半边（官方的、第三方的，包括仓库文档里的
 * 第三方示例）都是 `window.__ModuleLoader__.load({ id, factory(require) })` 形式，
 * 由浏览器直接 eval。普通 ESM 的 `export` 语句在那个环境里是语法错误。
 * 所以源码保持 ESM（便于单测直接 import），产物统一是工厂形式。
 *
 * 打包是确定性的：同样的源码永远产出完全相同的字节。`npm test` 会重新生成并与
 * 磁盘上的 `client.js` 逐字节比对，源码改了却忘了构建会直接测试失败。
 *
 * 用法：
 *   node scripts/build-client.mjs          # 校验产物是否与源码一致，不一致则退出码 1
 *   node scripts/build-client.mjs --write  # 写入 client.js
 */

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const SRC = path.join(root, 'src');
const OUT = path.join(root, 'client.js');

/** 插件包名：运行时按这个 id 注册客户端半边。 */
const PACKAGE_NAME = 'dsh-run-pulse';

/**
 * 依赖顺序（拓扑序）：模块 id → 源文件名。
 * 顺序即 `const x = __moduleX()` 赋值顺序，必须保证被依赖者在前。
 */
const MODULES = [
	['config', 'config.js'],
	['locale', 'locale.js'],
	['status', 'status.js'],
	['decorator', 'decorator.js'],
	['entry', 'entry.js']
];

/**
 * 把模块 id 归一化成源文件路径。
 * @param id - `./config.js` / `../src/config.js` / `config` 等写法。
 * @returns 对应的模块 id。
 */
function moduleIdOf(id) {
	const base = id.replace(/^\.\//, '').replace(/^.*\//, '');
	const plain = base.endsWith('.js') ? base.slice(0, -3) : base;
	if (MODULES.some(([name]) => name === plain)) return plain;
	throw new Error(`未知的模块引用：${id}`);
}

/**
 * 改写一个模块的源码：去掉 `export` 前缀、把 import 换成包装内局部读取。
 * @param source - 原始 ESM 源码。
 * @param id - 模块 id。
 * @returns 可直接放进工厂函数的 CommonJS 风格代码。
 */
function transform(source, id) {
	return source
		.replace(/^export (function|const|let|var|class) /gm, '$1 ')
		.replace(/^import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"];?\s*$/gm, (match, names, from) => {
			const dependency = moduleIdOf(from);
			const bindings = names
				.split(',')
				.map((name) => name.trim())
				.filter(Boolean);
			// 同名解构：import { a, b } from './x.js' → const { a, b } = __moduleX();
			return `const { ${bindings.join(', ')} } = __module${dependency[0].toUpperCase()}${dependency.slice(1)}();`;
		});
}

/** 逐模块生成包装代码。 */
async function build() {
	const chunks = [];
	chunks.push('/* 本文件由 scripts/build-client.mjs 从 src/ 生成，请勿手工修改；改源码后运行 npm run build。 */');
	chunks.push('window.__ModuleLoader__.load({');
	chunks.push(`\tid: ${JSON.stringify(PACKAGE_NAME)},`);
	chunks.push('\tfactory() {');

	for (const [id, file] of MODULES) {
		const source = await readFile(path.join(SRC, file), 'utf8');
		const constName = `__module${id[0].toUpperCase()}${id.slice(1)}`;
		chunks.push('');
		chunks.push(`\t\t/** ${file} */`);
		chunks.push(`\t\tconst ${constName} = () => {`);
		for (const line of transform(source, id).split('\n')) {
			chunks.push(line === '' ? '' : `\t\t${line}`);
		}
		chunks.push(`\t\t\treturn {`);
		chunks.push(...exportNames(source, id).map((name) => `\t\t\t\t${name},`));
		chunks.push(`\t\t\t};`);
		chunks.push('\t\t};');
	}

	chunks.push('');
	chunks.push('\t\t// 工厂返回入口模块的 plugin 导出（Cordis 会拿它的 inject / apply）。');
	chunks.push('\t\treturn __moduleEntry().plugin;');
	chunks.push('\t}');
	chunks.push('});');
	chunks.push('');
	return chunks.join('\n').replace(/\n{3,}/g, '\n\n');
}

/**
 * 收集一个模块导出的名字，用来生成返回对象。
 * @param source - 原始 ESM 源码。
 * @param id - 模块 id（仅用于报错信息）。
 * @returns 导出名数组。
 */
function exportNames(source, id) {
	const names = [];
	for (const match of source.matchAll(/^export (?:function|const|let|var|class)\s+([A-Za-z_$][\w$]*)/gm)) names.push(match[1]);
	if (/^export default/m.test(source)) names.push('default');
	if (names.length === 0) throw new Error(`模块 ${id} 没有任何导出，无法生成返回对象`);
	return names;
}

const generated = await build();
const current = await readFile(OUT, 'utf8').catch(() => undefined);
const write = process.argv.includes('--write');

if (write) {
	if (current === generated) {
		console.log('client.js 已是最新，无需修改。');
	} else {
		await writeFile(OUT, generated, 'utf8');
		console.log(`已写入 client.js（${generated.length} 字节）。`);
	}
	process.exit(0);
}

if (current === generated) {
	console.log('client.js 与 src/ 一致。');
	process.exit(0);
}

console.error('client.js 与 src/ 不一致：请运行 `npm run build` 重新生成。');
process.exit(1);
