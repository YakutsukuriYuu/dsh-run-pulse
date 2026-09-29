/**
 * 产物自检：把**真正会被浏览器加载的** `client.js` 放进一个模拟的
 * `__ModuleLoader__` 环境里执行，确认：
 *
 * 1. 它是工厂形式、注册的 id 与包名一致（否则运行时根本不认）；
 * 2. 工厂返回的对象带 apply；
 * 3. 真正跑一遍 apply：标记贴上了、订阅建立了、卸载干净。
 *
 * 这一步专门用来兜住「源码是对的，但产物形态不对」这类只在浏览器里才炸的问题。
 * 运行：node test/bundle.test.mjs
 */

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** 极简元素（与其它自检一致的桩）。 */
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
		if (name.startsWith('data-')) this.dataset[datasetKey(name)] = String(value);
	}

	getAttribute(name) {
		return this.attributes.has(name) ? this.attributes.get(name) : null;
	}

	removeAttribute(name) {
		this.attributes.delete(name);
		if (name.startsWith('data-')) delete this.dataset[datasetKey(name)];
	}

	getBoundingClientRect() {
		return { right: 56, top: 8 };
	}

	querySelectorAll(selector) {
		return walk(this).filter((node) => matches(node, selector));
	}

	querySelector(selector) {
		return this.querySelectorAll(selector)[0] ?? null;
	}
}

const datasetKey = (name) => name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());

/** 深度优先收集后代。 */
function walk(root) {
	const out = [];
	for (const child of root.children) out.push(child, ...walk(child));
	return out;
}

/** 极小选择器匹配。 */
function matches(node, selector) {
	if (selector.startsWith('.')) return node.classList.contains(selector.slice(1));
	if (selector.startsWith('[')) return node.getAttribute(selector.slice(1, -1)) !== null;
	const bracket = selector.indexOf('[');
	if (bracket > 0 && selector.endsWith(']')) {
		return node.tagName === selector.slice(0, bracket).toUpperCase() && node.getAttribute(selector.slice(bracket + 1, -1)) !== null;
	}
	return node.tagName === selector.toUpperCase();
}

const body = new FakeElement('body');
const head = new FakeElement('head');
globalThis.document = {
	body,
	head,
	documentElement: { lang: 'zh-CN' },
	createElement: (tagName) => new FakeElement(tagName),
	querySelectorAll: (selector) => walk(body).concat(walk(head)).filter((node) => matches(node, selector)),
	querySelector: (selector) => document.querySelectorAll(selector)[0] ?? null
};
globalThis.MutationObserver = class {
	observe() {}
	disconnect() {}
};
globalThis.requestAnimationFrame = (callback) => {
	callback();
	return 1;
};

const here = path.dirname(fileURLToPath(import.meta.url));
const source = await readFile(path.join(here, '..', 'client.js'), 'utf8');

// 模拟运行时的模块加载器：浏览器直接 eval 产物，这里如实照做。
const registrations = [];
globalThis.window = {
	__ModuleLoader__: {
		load(registration) {
			registrations.push(registration);
			return registration;
		}
	}
};

// 产物里没有 import/export，所以用 Function 构造器求值即可（等价于浏览器的脚本求值）。
// eslint-disable-next-line no-new-func
new Function('window', source)(globalThis.window);

assert.equal(registrations.length, 1, '产物应当只做一次 __ModuleLoader__ 注册');
const registration = registrations[0];
assert.equal(registration.id, 'dsh-run-pulse', '注册 id 必须与包名一致，否则运行时不会挂载');
assert.equal(typeof registration.factory, 'function', '必须是 factory(require) 工厂形式');
console.log('✓ 产物形态：__ModuleLoader__ 工厂 + 正确 id');

/** 可观察快照。 */
function store(initial) {
	let value = initial;
	const listeners = new Set();
	return {
		getSnapshot: () => value,
		subscribe: (listener) => {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		set: (next) => {
			value = next;
			for (const listener of [...listeners]) listener();
		},
		listenerCount: () => listeners.size
	};
}

// 造现场：一个运行中的会话 + 它所在的工作区分组行 + 折叠后的展开按钮。
const row = new FakeElement('div');
row.setAttribute('data-row-key', 'workspace:ws-a');
body.appendChild(row);
const toggle = new FakeElement('button');
toggle.setAttribute('aria-label', '打开侧边栏');
body.appendChild(toggle);

const sessions = store({ ids: ['s1'], byId: { s1: { id: 's1', displayTitle: '跑着的会话', running: true } } });
const workspaces = store({
	items: [{ workspaceId: 'ws-a', title: 'A 项目', path: '/tmp/a', sessionIds: ['s1'] }],
	archivedSessionIds: [],
	pinnedSessionIds: []
});
const statusMap = new Map([['s1', { running: true, completionUnread: false }]]);
const statusListeners = new Set();
const sessionStatus = {
	getSnapshot: () => statusMap,
	subscribe: (listener) => {
		statusListeners.add(listener);
		return () => statusListeners.delete(listener);
	}
};

const ctx = {
	config: {},
	get(name) {
		if (name === 'sessions') return { list: sessions };
		if (name === 'workspaces') return { list: workspaces };
		if (name === 'uiSession') return { sessionStatus };
		return undefined;
	},
	effect: (callback) => callback()
};

const plugin = registration.factory();
assert.equal(typeof plugin.apply, 'function', '工厂返回值应当带 apply');
const dispose = plugin.apply(ctx);
assert.equal(typeof dispose, 'function', 'apply 应返回卸载函数');

const marker = row.children.find((child) => child.classList.contains('dsh-run-pulse'));
assert.ok(marker, '跑通 apply 后应当出现标记');
assert.ok(marker.classList.contains('dsh-run-pulse--running'));
assert.ok(toggle.querySelector('.dsh-run-pulse-rail'), '折叠侧边栏时应出现窄条提示');
console.log('✓ 产物 apply 可用：标记与窄条提示都出现了');

dispose();
assert.equal(row.children.length, 0, '卸载后应当清理干净');
assert.equal(sessions.listenerCount(), 0, '卸载后应当退订');
assert.equal(statusListeners.size, 0, '卸载后应当退订运行状态');
console.log('✓ 产物卸载清理与退订');

console.log('\n全部通过：dsh-run-pulse 产物自检');
