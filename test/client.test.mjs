/**
 * 入口集成自检：在桩环境里跑通整条链路
 *   服务快照 → 状态引擎 → DOM 装饰 → 窄条提示 → 卸载清理。
 *
 * 复用 decorator.test.mjs 的极小 DOM 桩，再补上 client.js 会用到的
 * document / MutationObserver / requestAnimationFrame。
 * 运行：node test/client.test.mjs
 */

import assert from 'node:assert/strict';

/** 极简元素。 */
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
		return { right: 56, top: 8, left: 0, bottom: 48, width: 56, height: 40 };
	}

	querySelectorAll(selector) {
		return walk(this).filter((node) => matches(node, selector));
	}

	querySelector(selector) {
		return this.querySelectorAll(selector)[0] ?? null;
	}
}

/**
 * `data-x-y` → `dataset.xY`。
 * @param name - 属性名。
 * @returns dataset 键名。
 */
function datasetKey(name) {
	return name
		.slice('data-'.length)
		.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}

/**
 * 深度优先收集后代。
 * @param root - 根元素。
 * @returns 后代数组。
 */
function walk(root) {
	const out = [];
	for (const child of root.children) out.push(child, ...walk(child));
	return out;
}

/**
 * 极小选择器匹配。
 * @param node - 元素。
 * @param selector - 选择器。
 * @returns 是否匹配。
 */
function matches(node, selector) {
	if (selector.startsWith('.')) return node.classList.contains(selector.slice(1));
	if (selector.startsWith('[')) return node.getAttribute(selector.slice(1, -1)) !== null;
	const bracket = selector.indexOf('[');
	if (bracket > 0 && selector.endsWith(']')) {
		return node.tagName === selector.slice(0, bracket).toUpperCase() && node.getAttribute(selector.slice(bracket + 1, -1)) !== null;
	}
	return node.tagName === selector.toUpperCase();
}

/** 安装全局桩：document / MutationObserver / requestAnimationFrame。 */
function installGlobals() {
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
	globalThis.MutationObserver = class {
		observe() {}
		disconnect() {}
	};
	// 同步执行回调，自检里不需要真的等一帧。
	globalThis.requestAnimationFrame = (callback) => {
		callback();
		return 1;
	};
	return { body, head, documentStub };
}

const dom = installGlobals();

const { plugin } = await import('../src/entry.js');

/** 造一个可观察快照。 */
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

/** 造一份与官方同形的数据源。 */
function makeServices() {
	const sessions = store({
		ids: ['s1'],
		byId: { s1: { id: 's1', displayTitle: '跑着的会话', running: true } }
	});
	const workspaces = store({
		items: [{ workspaceId: 'ws-a', title: 'A 项目', path: '/tmp/a', sessionIds: ['s1'] }],
		archivedSessionIds: [],
		pinnedSessionIds: []
	});
	const status = new Map([['s1', { running: true, pendingInteraction: undefined, completionUnread: false }]]);
	const sessionStatus = {
		getSnapshot: () => status,
		subscribe: (listener) => {
			statusListeners.add(listener);
			return () => statusListeners.delete(listener);
		}
	};
	const statusListeners = new Set();
	return {
		sessions,
		workspaces,
		sessionStatus,
		publishStatus(next) {
			status.clear();
			for (const [id, value] of next) status.set(id, value);
			for (const listener of [...statusListeners]) listener();
		},
		statusSubscribers: () => statusListeners.size,
		ctx: {
			config: {},
			get(name) {
				if (name === 'sessions') return { list: sessions };
				if (name === 'workspaces') return { list: workspaces };
				if (name === 'uiSession') return { sessionStatus };
				return undefined;
			},
			effect(callback) {
				return callback();
			}
		}
	};
}

/** 造一行官方工作区分组锚点与折叠后的展开按钮。 */
function mountDom() {
	const row = new FakeElement('div');
	row.className = 'projectRow';
	row.setAttribute('data-row-key', 'workspace:ws-a');
	dom.body.appendChild(row);
	const toggle = new FakeElement('button');
	toggle.setAttribute('aria-label', '打开侧边栏');
	dom.body.appendChild(toggle);
	return { row, toggle };
}

const services = makeServices();
const { row, toggle } = mountDom();
const dispose = plugin.apply(services.ctx);

assert.equal(typeof dispose, 'function', 'apply 应返回卸载函数');
const node = row.children.find((child) => child.classList.contains('dsh-run-pulse'));
assert.ok(node, '运行中的工作区应立刻出现脉动标记');
assert.ok(node.classList.contains('dsh-run-pulse--running'));
assert.ok(node.classList.contains('dsh-run-pulse--pulse'));
assert.ok(toggle.querySelector('.dsh-run-pulse-rail'), '侧边栏折叠时应在展开按钮上出现聚合提示');
assert.equal(toggle.querySelector('.dsh-run-pulse-rail').className, 'dsh-run-pulse-rail dsh-run-pulse-rail--running');
console.log('✓ 首次渲染：分组标记 + 窄条聚合提示');

// 会话跑完并产生「未读完成」→ 订阅回调应把标记换成 unread。
// 真实运行时列表快照与状态快照同时变化，这里也如实模拟。
services.sessions.set({ ids: ['s1'], byId: { s1: { id: 's1', displayTitle: '跑着的会话', running: false } } });
services.publishStatus(new Map([['s1', { running: false, pendingInteraction: undefined, completionUnread: true }]]));
assert.ok(node.classList.contains('dsh-run-pulse--unread'), '未读完成应切换标记状态');
console.log('✓ 订阅回调查到了状态变化');

// 出现审批请求 → 优先级最高的 pending。
services.publishStatus(new Map([['s1', { running: true, pendingInteraction: 'approval', completionUnread: false }]]));
assert.ok(node.classList.contains('dsh-run-pulse--pending'), '等待审批应优先显示为 pending');
assert.equal(row.getAttribute('title'), '1 个会话在等你操作');
assert.equal(toggle.querySelector('.dsh-run-pulse-rail').className, 'dsh-run-pulse-rail dsh-run-pulse-rail--pending');
console.log('✓ 优先级与文案');

// 会话列表变化（活动结束）→ 标记消失、窄条提示消失。
services.sessions.set({ ids: ['s1'], byId: { s1: { id: 's1', displayTitle: '跑着的会话', running: false } } });
services.workspaces.set({ items: [{ workspaceId: 'ws-a', title: 'A 项目', path: '/tmp/a', sessionIds: ['s1'] }], archivedSessionIds: [], pinnedSessionIds: [] });
services.publishStatus(new Map([['s1', { running: false, pendingInteraction: undefined, completionUnread: false }]]));
assert.equal(row.children.length, 0, '活动结束后分组行应恢复原样');
assert.equal(toggle.children.length, 0, '没有活动时窄条提示应移除');
console.log('✓ 活动结束后的回收');

// 卸载：订阅退订、DOM 清空。
services.sessions.set({ ids: ['s1'], byId: { s1: { id: 's1', displayTitle: '又跑起来了', running: true } } });
assert.ok(row.children.length === 1, '重新活动后应再次出现标记');
dispose();
assert.equal(row.children.length, 0, '卸载后应清理标记');
assert.equal(services.sessions.listenerCount(), 0, '卸载后应退订会话列表');
assert.equal(services.statusSubscribers(), 0, '卸载后应退订运行状态');
console.log('✓ 卸载清理与退订');

// 配置：关掉 unread 后，未读完成不应再触发标记。
// 注意：Cordis 插件自己的配置挂在 fiber 上（`ctx.fiber.config`），
// 读 `ctx.config` 是非法的——那正是曾经打挂 DSH 的那一行。
const scoped = makeServices();
const scopedDom = mountDom();
const scopedDispose = plugin.apply({
	...scoped.ctx,
	fiber: { config: { states: { unread: false } } }
});
const scopedRow = scopedDom.row;
// 先把会话停下来（否则「运行中」这个仍然打开的开关本身就会让它亮），
// 再产生未读完成：此时唯一可能触发标记的就是被关掉的 unread。
scoped.sessions.set({ ids: ['s1'], byId: { s1: { id: 's1', displayTitle: '跑完的会话', running: false } } });
scoped.publishStatus(new Map([['s1', { running: false, pendingInteraction: undefined, completionUnread: true }]]));
assert.equal(scopedRow.children.length, 0, 'states.unread=false 时未读完成不应产生标记');
scopedDispose();
console.log('✓ 配置开关生效');

// 数据源缺失：不应抛错，也不应留下 DOM。
assert.doesNotThrow(() => {
	const bare = plugin.apply({ get: () => undefined, effect: (callback) => callback() });
	assert.equal(typeof bare, 'function');
	bare();
});
console.log('✓ 数据源缺失时静默降级');

/**
 * 造一个**忠实还原 Cordis `ctx`** 的 Proxy：
 *
 * Cordis 的 Context 是代理，只有经 `mixin`/自有成员注册的属性才可读，
 * 其余一律 `throw new Error('cannot get property "x" without inject')`
 * —— **不返回 undefined**。曾经的版本读了 `ctx.config`，`apply` 第一行就抛，
 * fiber 变成 FAILED，而 DSH 的 web 启动审计要求所有条目 ACTIVE，
 * 于是整个应用起不来。这个 Proxy 就是为了让这种错误再也进不了主干。
 *
 * @param services - 名字 → 服务对象的映射（相当于已激活的服务）。
 * @param config - 插件自身的配置，挂在 `fiber.config` 上。
 * @returns 形态等价于真实 ctx 的 Proxy。
 */
function cordisLikeCtx(services, config) {
	const target = {
		fiber: { config, runtime: {} },
		get(name) {
			return services[name];
		},
		effect(execute, label) {
			const dispose = execute();
			return typeof dispose === 'function' ? dispose : () => {};
		}
	};
	return new Proxy(target, {
		has: (t, prop) => (typeof prop === 'symbol' ? Reflect.has(t, prop) : prop in t),
		get(t, prop, receiver) {
			if (typeof prop === 'symbol') return Reflect.get(t, prop, receiver);
			if (prop in t) return Reflect.get(t, prop, receiver);
			throw new Error(`cannot get property "${String(prop)}" without inject`);
		}
	});
}

// ── 回归：真实 ctx 形态下 apply 绝不能抛 ─────────────────────
{
	// 1) 先证明这个桩是「有毒的」：读未注册属性确实会抛错。
	const probe = cordisLikeCtx({}, undefined);
	assert.throws(() => probe.config, /without inject/, '桩必须复现 Cordis「未注册属性读取即抛错」的行为');
	console.log('✓ 桩已复现 Cordis 的严格属性访问');

	// 2) 造一组就绪的服务 + 一个运行中的会话。
	const svcSessions = store({ ids: ['s1'], byId: { s1: { id: 's1', displayTitle: '跑着的会话', running: true } } });
	const svcWorkspaces = store({
		items: [{ workspaceId: 'ws-a', title: 'A 项目', path: '/tmp/a', sessionIds: ['s1'] }],
		archivedSessionIds: [],
		pinnedSessionIds: []
	});
	const svcStatus = new Map([['s1', { running: true, completionUnread: false }]]);
	const svcStatusListeners = new Set();
	const svcMap = {
		sessions: { list: svcSessions },
		workspaces: { list: svcWorkspaces },
		uiSession: {
			sessionStatus: {
				getSnapshot: () => svcStatus,
				subscribe: (listener) => {
					svcStatusListeners.add(listener);
					return () => svcStatusListeners.delete(listener);
				}
			}
		}
	};

	const dom2 = mountDom();
	const ctx2 = cordisLikeCtx(svcMap, { appearance: 'pulse' });

	// 3) 核心断言：真实 ctx 形态下 apply 不抛错、能跑起来。
	let dispose2;
	assert.doesNotThrow(() => {
		dispose2 = plugin.apply(ctx2);
	}, 'apply 读 Cordis 形态的 ctx 时绝不能抛错（否则整个 DSH 起不来）');
	assert.equal(typeof dispose2, 'function', '启动成功应当返回卸载函数');

	const marker2 = dom2.row.children.find((child) => child.classList.contains('dsh-run-pulse'));
	assert.ok(marker2, 'Cordis 形态 ctx 下也应贴上标记');
	assert.ok(marker2.classList.contains('dsh-run-pulse--pulse'), '配置 fiber.config 应当生效（appearance=pulse）');
	// 窄条提示按文档顺序挂在第一个「打开侧边栏」按钮上（桩里有多个同名按钮），
	// 所以按「文档里存在」断言，而不是绑死某一个按钮节点。
	assert.ok(document.querySelector('.dsh-run-pulse-rail'), '窄条提示也应出现');
	console.log('✓ 回归：Cordis 形态 ctx 下 apply 不抛错且功能正常');

	// 4) 配置确实来自 fiber.config：改回默认 appearance 后标记类应不同。
	dispose2();
	assert.equal(dom2.row.children.length, 0, '卸载后应清理干净');
	assert.equal(svcSessions.listenerCount(), 0, '卸载后应退订');
	assert.equal(svcStatusListeners.size, 0, '卸载后应退订运行状态');
	console.log('✓ 回归：卸载后完全清理');

	// 5) 安全网：启动过程中任何一步抛错，apply 也只能降级、不能外抛。
	const dom3 = mountDom();
	const originalCreate = document.createElement;
	document.createElement = () => {
		throw new Error('simulated failure inside start()');
	};
	let result3;
	assert.doesNotThrow(() => {
		result3 = plugin.apply(cordisLikeCtx(svcMap, undefined));
	}, 'start() 内部抛错时 apply 必须吞掉，不能让 fiber 变成 FAILED');
	assert.equal(result3, undefined, '启动失败应返回 undefined（不注册卸载钩子）');
	document.createElement = originalCreate;
	assert.equal(dom3.row.children.length, 0, '启动失败时不应留下任何标记');
	console.log('✓ 回归：内部异常被安全网兜住，启动失败也不会外抛');
}

console.log('\n全部通过：dsh-run-pulse 入口集成自检');
