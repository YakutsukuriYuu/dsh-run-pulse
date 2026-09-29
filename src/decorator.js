/**
 * DOM 装饰器：把计算好的分组标记贴到侧边栏的工作区分组行上。
 *
 * 为什么是 DOM 装饰而不是 slot：官方的工作区分组头（`ProjectRowItem`）没有任何
 * 可注册的插槽，`sidebar.workspaces` 是整块 single slot。为了不重写官方 UI，
 * 这里只在官方已有的锚点上增加一个「纯装饰」节点：
 *
 * - 锚点使用标准属性 `[data-row-key^="workspace:"]`（`key` 就是 workspaceId），
 *   不依赖 CSS Module 的哈希类名；
 * - 标记节点 `pointer-events: none` + `aria-hidden="true"`：不吃点击、不进朗读，
 *   也不改变原来「点文件夹行 = 展开/折叠」的行为；
 * - 所有更新都是幂等的：状态没变就一个属性都不写。
 *
 * @module dsh-run-pulse/decorator
 */

import { groupLabel } from './status.js';

/** 锚点属性前缀：官方 `ProjectRowItem` 上的 `data-row-key="workspace:<key>"`。 */
const ANCHOR_PREFIX = 'workspace:';

/** 写入 `<style>` 的开关：同一份文档只插一次。 */
let stylesInstalled = false;

/** 标记节点的 CSS。只使用官方主题 token，浅色/深色自动跟随。 */
const CSS = `
.dsh-run-pulse {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	flex: none;
	width: 16px;
	height: 16px;
	margin-inline-start: auto;
	margin-inline-end: 2px;
	pointer-events: none;
	-webkit-user-select: none;
	user-select: none;
}
.dsh-run-pulse__dot {
	position: relative;
	display: block;
	width: 8px;
	height: 8px;
	border-radius: 50%;
	background: var(--dsh-run-pulse-color, var(--dsw-alias-state-business-primary, var(--dsw-alias-brand-primary, currentColor)));
}
.dsh-run-pulse__count {
	position: absolute;
	top: -5px;
	left: 6px;
	font-size: 9px;
	line-height: 1;
	font-weight: 600;
	font-variant-numeric: tabular-nums;
	color: var(--dsw-alias-label-secondary, currentColor);
}
.dsh-run-pulse--pending {
	--dsh-run-pulse-color: var(--dsw-alias-state-warn-primary, var(--dsw-alias-state-error-primary, currentColor));
}
.dsh-run-pulse--running {
	--dsh-run-pulse-color: var(--dsw-alias-state-business-primary, var(--dsw-alias-brand-primary, currentColor));
}
.dsh-run-pulse--unread {
	--dsh-run-pulse-color: var(--dsw-alias-state-success-primary, currentColor);
}
.dsh-run-pulse--pulse .dsh-run-pulse__dot {
	animation: dsh-run-pulse-breathe 1.7s cubic-bezier(0.36, 0, 0.64, 1) infinite;
}
.dsh-run-pulse--pulse.dsh-run-pulse--pending .dsh-run-pulse__dot {
	animation-duration: 1.1s;
}
.dsh-run-pulse--icon .dsh-run-pulse__dot {
	animation: dsh-run-pulse-breathe 1.7s cubic-bezier(0.36, 0, 0.64, 1) infinite;
}
.dsh-run-pulse--unread.dsh-run-pulse--pulse .dsh-run-pulse__dot,
.dsh-run-pulse--unread.dsh-run-pulse--icon .dsh-run-pulse__dot {
	animation: none;
	box-shadow: 0 0 0 2px var(--dsw-alias-state-success-secondary, transparent);
}
.dsh-run-pulse--tint-backing {
	position: relative;
}
.dsh-run-pulse--tint-backing .dsh-run-pulse {
	position: relative;
	z-index: 1;
}
.dsh-run-pulse--tint-backing::before {
	content: "";
	position: absolute;
	inset: 0;
	border-radius: var(--dsw-radius-md, 8px);
	background: var(--dsh-run-pulse-color, var(--dsw-alias-state-business-primary, currentColor));
	opacity: 0.09;
	pointer-events: none;
	animation: dsh-run-pulse-tint 2.6s ease-in-out infinite;
}
.dsh-run-pulse-icon-only .dsh-run-pulse__dot {
	width: 0;
	height: 0;
	overflow: hidden;
}
.dsh-run-pulse--running .dsh-run-pulse-icon-only .dsh-run-pulse__dot {
	width: 8px;
	height: 8px;
}
@keyframes dsh-run-pulse-breathe {
	0%, 100% { opacity: 1; transform: scale(1); }
	50% { opacity: 0.45; transform: scale(0.72); }
}
@keyframes dsh-run-pulse-tint {
	0%, 100% { opacity: 0.04; }
	50% { opacity: 0.13; }
}
.dsh-run-pulse-rail {
	position: fixed;
	z-index: 40;
	display: block;
	width: 8px;
	height: 8px;
	border-radius: 50%;
	pointer-events: none;
	background: var(--dsh-run-pulse-color, var(--dsw-alias-state-business-primary, var(--dsw-alias-brand-primary, currentColor)));
}
.dsh-run-pulse-rail--pending {
	--dsh-run-pulse-color: var(--dsw-alias-state-warn-primary, var(--dsw-alias-state-error-primary, currentColor));
}
.dsh-run-pulse-rail--running {
	--dsh-run-pulse-color: var(--dsw-alias-state-business-primary, var(--dsw-alias-brand-primary, currentColor));
}
.dsh-run-pulse-rail--unread {
	--dsh-run-pulse-color: var(--dsw-alias-state-success-primary, currentColor);
}
.dsh-run-pulse-visible-rail .dsh-run-pulse-rail {
	animation: dsh-run-pulse-breathe 1.7s cubic-bezier(0.36, 0, 0.64, 1) infinite;
}
.dsh-run-pulse-visible-rail .dsh-run-pulse-rail--unread {
	animation: none;
}
@media (prefers-reduced-motion: reduce) {
	.dsh-run-pulse__dot,
	.dsh-run-pulse--tint-backing::before,
	.dsh-run-pulse-rail {
		animation: none !important;
	}
}
/* 硬编码兜底放在最后：万一某个版本没有状态色 token，也仍然看得到颜色差异。 */
.dsh-run-pulse--running,
.dsh-run-pulse-rail--running {
	--dsh-run-pulse-color: var(--dsw-alias-state-business-primary, #4d6bfe);
}
.dsh-run-pulse--pending,
.dsh-run-pulse-rail--pending {
	--dsh-run-pulse-color: var(--dsw-alias-state-warn-primary, #d99a2b);
}
.dsh-run-pulse--unread,
.dsh-run-pulse-rail--unread {
	--dsh-run-pulse-color: var(--dsw-alias-state-success-primary, #3fa46a);
}
`;

/**
 * 读取「减弱动效」偏好。
 * @returns 是否应当完全禁用循环动画。
 */
function prefersReducedMotion() {
	if (typeof matchMedia !== 'function') return false;
	try {
		return matchMedia('(prefers-reduced-motion: reduce)').matches;
	} catch {
		return false;
	}
}

/**
 * 幂等地插入本插件的样式表。
 * @returns 无返回值。
 */
function installStyles() {
	if (stylesInstalled || typeof document === 'undefined') return;
	const tag = document.createElement('style');
	tag.dataset.dshRunPulse = 'styles';
	tag.textContent = CSS;
	document.head.appendChild(tag);
	// 成功插入后才置位：中途抛错时下次重试，不会卡在「以为已装好」的假状态。
	stylesInstalled = true;
}

/** 移除本插件的样式表。 */
function uninstallStyles() {
	if (!stylesInstalled || typeof document === 'undefined') return;
	stylesInstalled = false;
	for (const tag of Array.from(document.querySelectorAll('style[data-dsh-run-pulse="styles"]'))) tag.remove();
}

/**
 * 把一个分组的标记状态写进它那一行。
 *
 * @param anchor - 分组的锚点行元素（`[data-row-key^="workspace:"]`）。
 * @param marker - 该分组当前的标记描述，`null` 表示不需要标记。
 * @param options - `{ appearance, showCount, reduced }`。
 * @returns 无返回值。
 */
function renderRow(anchor, marker, options) {
	if (marker === null) {
		const stale = directMarker(anchor);
		if (stale === null) return;
		stale.remove();
		anchor.classList.remove('dsh-run-pulse--tint-backing');
		anchor.style.removeProperty('--dsh-run-pulse-color');
		anchor.removeAttribute('title');
		return;
	}
	let node = directMarker(anchor);
	if (node === null) {
		node = document.createElement('span');
		node.className = 'dsh-run-pulse';
		node.setAttribute('aria-hidden', 'true');
		const dot = document.createElement('span');
		dot.className = 'dsh-run-pulse__dot';
		node.appendChild(dot);
		anchor.appendChild(node);
	}
	const className = ['dsh-run-pulse', `dsh-run-pulse--${marker.state}`];
	const wantsPulse = options.appearance === 'all' || options.appearance === 'pulse' || options.appearance === 'icon';
	if (wantsPulse && options.reduced !== true) className.push('dsh-run-pulse--pulse');
	if (options.appearance === 'icon') className.push('dsh-run-pulse-icon-only');
	node.className = className.join(' ');
	node.style.setProperty('--dsh-run-pulse-color', `var(--dsh-run-pulse-${marker.state})`);
	const dot = node.firstElementChild;
	if (dot !== null) {
		let count = dot.querySelector('.dsh-run-pulse__count');
		if (options.showCount === true && marker.count > 1) {
			if (count === null) {
				count = document.createElement('span');
				count.className = 'dsh-run-pulse__count';
				dot.appendChild(count);
			}
			count.textContent = String(marker.count);
		} else if (count !== null) {
			count.remove();
		}
	}
	anchor.classList.toggle('dsh-run-pulse--tint-backing', options.appearance === 'tint');
	anchor.style.setProperty('--dsh-run-pulse-color', `var(--dsh-run-pulse-${marker.state})`);
	if (typeof marker.label === 'string' && marker.label !== '') {
		anchor.setAttribute('title', marker.label);
	} else {
		anchor.removeAttribute('title');
	}
}

/**
 * 取锚点行的直接子标记节点（避免命中嵌套子工作区的标记）。
 * @param anchor - 锚点行元素。
 * @returns 标记节点或 null。
 */
function directMarker(anchor) {
	for (const child of Array.from(anchor.children)) {
		if (child.classList.contains('dsh-run-pulse')) return child;
	}
	return null;
}

/**
 * 创建一个装饰器实例。
 *
 * @param options - `{ getGroups, getConfig, translate, onCounts }`。
 *   `getGroups()` 返回 `Map<workspaceKey, marker>`；`onCounts(aggregate)` 用于窄条提示。
 * @returns `{ start, render, dispose }`。
 */
export function createDecorator(options) {
	/** 每个锚点行上一次写进去的签名，用来避免重复写 DOM。 */
	const signatures = new WeakMap();
	let observer = null;
	/** `document.body` 尚未就绪时挂起的 DOMContentLoaded 取消句柄。 */
	let cancelReady = null;
	let disposed = false;
	let scheduled = false;

	/** 找出所有工作区分组锚点行。 */
	const findAnchors = () => {
		const found = [];
		for (const element of Array.from(document.querySelectorAll('[data-row-key]'))) {
			const key = element.getAttribute('data-row-key');
			if (typeof key === 'string' && key.startsWith(ANCHOR_PREFIX)) found.push(element);
		}
		return found;
	};

	/** 把当前状态贴到所有锚点上；幂等，可在任意时刻重复调用。 */
	const render = () => {
		if (disposed || typeof document === 'undefined') return;
		// MutationObserver 的回调直接跑到这里：任何异常都必须吞掉，
		// 否则会在页面里刷出未捕获错误（虽然不致命，但很吵）。
		try {
			const config = options.getConfig();
			const groups = options.getGroups();
			const reduced = prefersReducedMotion();
			const anchors = findAnchors();
			for (const anchor of anchors) {
				const key = (anchor.getAttribute('data-row-key') ?? '').slice(ANCHOR_PREFIX.length);
				const group = groups.get(key) ?? null;
				const signature =
					group === null
						? 'none'
						: `${group.state}:${group.count}:${group.label}:${config.appearance}:${config.showCount}:${reduced}`;
				// 注意：签名相同还不够。组从「有」变成「没有」时签名会回到 'none'，
				// 必须靠「节点是否真的还在」来判断要不要清理，否则会留下过期的标记。
				if (signatures.get(anchor) === signature && (directMarker(anchor) !== null) === (group !== null)) continue;
				signatures.set(anchor, signature);
				try {
					renderRow(anchor, group, {
						appearance: config.appearance,
						showCount: config.showCount,
						reduced
					});
				} catch (error) {
					console.warn('[dsh-run-pulse] 装饰分组行失败：', error);
				}
			}
			if (typeof options.onRendered === 'function') options.onRendered();
		} catch (error) {
			console.warn('[dsh-run-pulse] 渲染失败（已跳过本轮，不影响页面）：', error);
		}
	};

	/** 把一次渲染推迟到下一帧，避免同一批变更里重复扫 DOM。 */
	const schedule = () => {
		if (disposed || scheduled) return;
		scheduled = true;
		const run = () => {
			scheduled = false;
			render();
		};
		if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run);
		else setTimeout(run, 16);
	};

	return {
		/**
		 * 开始观察 DOM 变化。
		 * @returns 无返回值。
		 */
		start() {
			installStyles();
			if (typeof MutationObserver !== 'function' || typeof document === 'undefined') return;
			observer = new MutationObserver(() => {
				schedule();
			});
			// 启动早期可能 `<body>` 还没解析出来：`observe(null)` 会抛 TypeError，
			// 而 `apply` 里这一抛就会让整个 DSH 起不来，所以必须先判空并延后挂载。
			if (document.body) {
				observer.observe(document.body, { childList: true, subtree: true });
				return;
			}
			const onReady = () => {
				if (cancelReady !== null) cancelReady();
				if (disposed || observer === null || !document.body) return;
				try {
					observer.observe(document.body, { childList: true, subtree: true });
				} catch (error) {
					console.warn('[dsh-run-pulse] 挂载 DOM 观察器失败：', error);
				}
			};
			cancelReady = () => {
				document.removeEventListener('DOMContentLoaded', onReady);
				cancelReady = null;
			};
			document.addEventListener('DOMContentLoaded', onReady);
		},
		render,
		schedule,
		/**
		 * 卸载：断开观察器、移除自己插入的所有节点与属性。
		 * @returns 无返回值。
		 */
		dispose() {
			disposed = true;
			if (cancelReady !== null) cancelReady();
			if (observer !== null) {
				observer.disconnect();
				observer = null;
			}
			try {
				for (const anchor of findAnchors()) {
					const node = directMarker(anchor);
					if (node !== null) node.remove();
					delete anchor.dataset.dshRunPulse;
					anchor.classList.remove('dsh-run-pulse--tint-backing');
					anchor.style.removeProperty('--dsh-run-pulse-color');
					anchor.removeAttribute('title');
				}
			} catch (error) {
				console.warn('[dsh-run-pulse] 卸载时清理分组行失败：', error);
			}
			try {
				for (const node of Array.from(document.querySelectorAll('.dsh-run-pulse-rail'))) node.remove();
			} catch {
				/* 卸载期的异常不再上报。 */
			}
			uninstallStyles();
		}
	};
}

/**
 * 在侧边栏窄条上渲染聚合提示。
 *
 * @param state - `aggregateState` 的结果。
 * @param translate - 翻译函数。
 * @returns 无返回值。
 */
export function renderRail(state, translate) {
	if (typeof document === 'undefined') return;
	const button = findRailAnchor();
	if (state === null || state.state === null) {
		removeRail();
		return;
	}
	if (button === null) return;
	let node = railOf(button);
	if (node === null) {
		removeRail();
		node = document.createElement('span');
		node.className = 'dsh-run-pulse-rail';
		node.setAttribute('aria-hidden', 'true');
		button.appendChild(node);
	}
	positionRail(node, button);
	const signature = `${state.state}:${state.count}`;
	if (node.dataset.dshRunPulseRail === signature) return;
	node.dataset.dshRunPulseRail = signature;
	node.className = `dsh-run-pulse-rail dsh-run-pulse-rail--${state.state}`;
	node.setAttribute('title', translate(state.state === 'pending' ? 'rail.pending' : state.state === 'running' ? 'rail.running' : 'rail.unread'));
}

/**
 * 取某个挂载点里的窄条提示节点。
 * @param host - 按钮元素。
 * @returns 节点或 null。
 */
function railOf(host) {
	for (const child of Array.from(host.children)) {
		if (child.classList.contains('dsh-run-pulse-rail')) return child;
	}
	return null;
}

/**
 * 把窄条提示摆到锚点按钮的右上角。
 *
 * 用 `position: fixed` 而不是 `absolute`，是为了不改动官方按钮自身的定位样式
 * （它可能是 `static`）；坐标每帧由按钮的矩形算出，纯装饰、不参与布局。
 *
 * @param node - 提示节点。
 * @param button - 锚点按钮。
 * @returns 无返回值。
 */
function positionRail(node, button) {
	try {
		const rect = button.getBoundingClientRect();
		node.style.left = `${Math.round(rect.right - 10)}px`;
		node.style.top = `${Math.round(rect.top + 4)}px`;
	} catch {
		/* 取不到矩形就保持上一次的位置。 */
	}
}

/** 移除所有窄条提示节点（侧边栏展开、或没有活动时调用）。 */
function removeRail() {
	if (typeof document === 'undefined') return;
	for (const node of Array.from(document.querySelectorAll('.dsh-run-pulse-rail'))) node.remove();
}

/**
 * 找到窄条提示的挂载点：侧边栏折叠时那个「展开侧边栏」按钮。
 *
 * 锚点选择器刻意避开 CSS Module 哈希类名：只认官方给出的可访问名
 * （`aria-label` = 打开侧边栏 / Open sidebar），找不到就静默跳过。
 *
 * @returns 按钮元素或 null。
 */
function findRailAnchor() {
	const labels = ['打开侧边栏', 'Open sidebar'];
	for (const button of Array.from(document.querySelectorAll('button[aria-label]'))) {
		const label = button.getAttribute('aria-label') ?? '';
		if (labels.includes(label)) return button;
	}
	return null;
}
