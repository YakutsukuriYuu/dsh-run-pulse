/**
 * 装饰器自检：用一个极小的 DOM 桩验证「贴标记 / 幂等 / 卸载清理」。
 * 不引入 jsdom，桩只实现装饰器真正用到的那一小撮 API。
 * 运行：node test/decorator.test.mjs
 */

import assert from 'node:assert/strict';

/**
 * 极简元素：只实现装饰器用到的属性与方法。
 */
class FakeElement {
	constructor(tagName) {
		this.tagName = tagName.toUpperCase();
		this.children = [];
		this.attributes = new Map();
		this.dataset = {};
		this.style = {
			values: new Map(),
			setProperty: (name, value) => this.style.values.set(name, value),
			removeProperty: (name) => this.style.values.delete(name),
			getPropertyValue: (name) => this.style.values.get(name) ?? ''
		};
		this._classes = new Set();
		this._text = '';
		this.parent = null;
		this.classList = {
			add: (...names) => names.forEach((name) => this._classes.add(name)),
			remove: (...names) => names.forEach((name) => this._classes.delete(name)),
			contains: (name) => this._classes.has(name),
			toggle: (name, force) => {
				const on = force ?? !this._classes.has(name);
				if (on) this._classes.add(name);
				else this._classes.delete(name);
				return on;
			}
		};
	}

	get className() {
		return [...this._classes].join(' ');
	}

	set className(value) {
		this._classes = new Set(String(value).split(/\s+/).filter(Boolean));
	}

	get textContent() {
		return this._text;
	}

	set textContent(value) {
		this._text = String(value);
		if (value === '') this.children = [];
	}

	get firstElementChild() {
		return this.children[0] ?? null;
	}

	get ownerDocument() {
		return document;
	}

	appendChild(child) {
		child.parent = this;
		this.children.push(child);
		return child;
	}

	remove() {
		if (this.parent !== null) this.parent.children = this.parent.children.filter((child) => child !== this);
		this.parent = null;
	}

	setAttribute(name, value) {
		this.attributes.set(name, String(value));
		if (name.startsWith('data-')) this.dataset[toDatasetKey(name)] = String(value);
	}

	getAttribute(name) {
		return this.attributes.has(name) ? this.attributes.get(name) : null;
	}

	removeAttribute(name) {
		this.attributes.delete(name);
		if (name.startsWith('data-')) delete this.dataset[toDatasetKey(name)];
	}

	/**
	 * 只实现装饰器用到的三种选择器：标签名、`.class`、`[attr]`。
	 * @param selector - 选择器。
	 * @returns 后代数组。
	 */
	querySelectorAll(selector) {
		return walk(this).filter((node) => matches(node, selector));
	}

	querySelector(selector) {
		return this.querySelectorAll(selector)[0] ?? null;
	}
}

/**
 * `data-dsh-run-pulse` ↔ `dataset.dshRunPulse` 的转换。
 * @param name - 属性名。
 * @returns dataset 键名。
 */
function toDatasetKey(name) {
	return name
		.slice('data-'.length)
		.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}

/**
 * 收集一个元素的所有后代（深度优先）。
 * @param root - 根元素。
 * @returns 后代数组。
 */
function walk(root) {
	const out = [];
	for (const child of root.children) {
		out.push(child, ...walk(child));
	}
	return out;
}

/**
 * 判断元素是否匹配极小选择器语法。
 * @param node - 元素。
 * @param selector - 选择器。
 * @returns 是否匹配。
 */
function matches(node, selector) {
	if (selector.startsWith('.')) return node.classList.contains(selector.slice(1));
	if (selector.startsWith('[')) {
		const name = selector.slice(1, -1);
		return node.getAttribute(name) !== null;
	}
	const bracket = selector.indexOf('[');
	if (bracket > 0 && selector.endsWith(']')) {
		return node.tagName === selector.slice(0, bracket).toUpperCase() && node.getAttribute(selector.slice(bracket + 1, -1)) !== null;
	}
	return node.tagName === selector.toUpperCase();
}

/** 建立全局 document 桩。 */
function installDom() {
	const body = new FakeElement('body');
	const head = new FakeElement('head');
	const documentStub = {
		body,
		head,
		documentElement: { lang: 'zh-CN' },
		createElement: (tagName) => new FakeElement(tagName),
		querySelectorAll: (selector) => walk(body).concat(walk(head)).filter((node) => matches(node, selector)),
		querySelector: (selector) => documentStub.querySelectorAll(selector)[0] ?? null
	};
	globalThis.document = documentStub;
	return { body, head, documentStub };
}

const dom = installDom();

const { createDecorator, renderRail } = await import('../src/decorator.js');

/** 造一行官方工作区分组锚点。 */
function makeAnchor(key) {
	const row = new FakeElement('div');
	row.className = 'projectRow';
	row.setAttribute('data-row-key', `workspace:${key}`);
	dom.body.appendChild(row);
	return row;
}

const marker = (count = 1) => ({ state: 'running', count, label: '正在运行' });

/** 场景一：贴标记、幂等更新、多分组互不干扰。 */
function testRender() {
	const a = makeAnchor('ws-a');
	const b = makeAnchor('ws-b');
	const groups = new Map([['ws-a', marker(1)]]);
	const decorator = createDecorator({ getConfig: () => ({ appearance: 'all', showCount: true }), getGroups: () => groups });

	decorator.render();
	const nodeA = a.children.find((child) => child.classList.contains('dsh-run-pulse'));
	assert.ok(nodeA, 'A 行应出现标记节点');
	assert.ok(nodeA.classList.contains('dsh-run-pulse--running'), '状态类名应为 running');
	assert.ok(nodeA.classList.contains('dsh-run-pulse--pulse'), '默认应当脉动');
	assert.equal(a.getAttribute('title'), '正在运行', '提示文案写到行上（不写进装饰节点）');
	assert.equal(nodeA.getAttribute('aria-hidden'), 'true', '装饰节点不进朗读');
	assert.equal(b.children.length, 0, '没有活动的分组不该被加节点');

	// 幂等：再渲染一次不应重建节点。
	decorator.render();
	assert.equal(a.children.filter((child) => child.classList.contains('dsh-run-pulse')).length, 1, '重复渲染不应产生第二个标记');

	// 状态变化：改成等待，类名应切换。
	groups.set('ws-a', { state: 'pending', count: 3, label: '3 个会话在等你操作' });
	decorator.render();
	assert.ok(nodeA.classList.contains('dsh-run-pulse--pending'), '状态变化应切到 pending 类');
	assert.equal(nodeA.querySelector('.dsh-run-pulse__count').textContent, '3', '多会话时应显示数字角标');

	// 活动消失：标记应被摘掉，行恢复原样。
	groups.delete('ws-a');
	decorator.render();
	assert.equal(a.children.length, 0, '活动结束后标记应移除');
	assert.equal(a.getAttribute('title'), null, '提示属性也应清理');
	assert.equal(a.children.length, 0, '标记节点应已清理');
	console.log('✓ 贴标记、幂等、状态切换与回收');
}

/** 场景二：外观开关。 */
function testAppearance() {
	const row = makeAnchor('ws-appearance');
	const groups = new Map([['ws-appearance', marker(1)]]);
	let appearance = 'tint';
	const decorator = createDecorator({ getConfig: () => ({ appearance, showCount: false }), getGroups: () => groups });

	decorator.render();
	assert.ok(row.classList.contains('dsh-run-pulse--tint-backing'), 'tint 外观应给行加底色类');
	const node = row.children.find((child) => child.classList.contains('dsh-run-pulse'));
	assert.ok(!node.classList.contains('dsh-run-pulse--pulse'), 'tint 外观不加脉动类');
	assert.equal(row.style.getPropertyValue('--dsh-run-pulse-color'), 'var(--dsh-run-pulse-running)', '底色用的颜色变量应写在行上');

	appearance = 'icon';
	decorator.render();
	assert.ok(!row.classList.contains('dsh-run-pulse--tint-backing'), '切回 icon 外观应移除底色类');
	assert.ok(node.classList.contains('dsh-run-pulse-icon-only'), 'icon 外观隐藏圆点');

	appearance = 'pulse';
	decorator.render();
	assert.ok(node.classList.contains('dsh-run-pulse--pulse'));
	assert.ok(!node.classList.contains('dsh-run-pulse-icon-only'));
	console.log('✓ 三种外观切换');
}

/** 场景三：卸载清理（含窄条提示）。 */
function testDispose() {
	const row = makeAnchor('ws-dispose');
	const groups = new Map([['ws-dispose', marker(2)]]);
	const decorator = createDecorator({ getConfig: () => ({ appearance: 'all', showCount: true }), getGroups: () => groups });
	const translate = (key) => key;

	const toggle = new FakeElement('button');
	toggle.setAttribute('aria-label', '打开侧边栏');
	toggle.getBoundingClientRect = () => ({ right: 56, top: 8 });
	dom.body.appendChild(toggle);

	decorator.start();
	decorator.render();
	renderRail({ state: 'pending', count: 2 }, translate);
	assert.equal(row.children.length, 1, '渲染后应有标记');
	assert.ok(toggle.querySelector('.dsh-run-pulse-rail'), '窄条提示应挂到展开按钮上');
	assert.equal(toggle.querySelector('.dsh-run-pulse-rail').getAttribute('title'), 'rail.pending');

	renderRail({ state: null, count: 0 }, translate);
	assert.equal(toggle.children.length, 0, '没有活动时窄条提示应移除');

	renderRail({ state: 'running', count: 1 }, translate);
	decorator.dispose();
	assert.equal(row.children.length, 0, '卸载后分组行应完全恢复');
	assert.equal(toggle.children.length, 0, '卸载后窄条提示也应移除');
	assert.ok(document.querySelector('style[data-dsh-run-pulse="styles"]') === null, '卸载后样式表应移除');

	// 卸载后再渲染不应复活。
	decorator.render();
	assert.equal(row.children.length, 0, '卸载后的渲染应被忽略');
	console.log('✓ 卸载清理与窄条提示');
}

testRender();
testAppearance();
testDispose();
console.log('\n全部通过：dsh-run-pulse 装饰器自检');
