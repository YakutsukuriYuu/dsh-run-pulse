/* 本文件由 scripts/build-client.mjs 从 src/ 生成，请勿手工修改；改源码后运行 npm run build。 */
window.__ModuleLoader__.load({
	id: "dsh-run-pulse",
	factory() {

		/** config.js */
		const __moduleConfig = () => {
		/**
		 * 本插件的配置读取与归一化。
		 *
		 * Client 半边拿不到 schemastery 的 JSON Schema 投影（那属于 Host 半边），
		 * 所以这里按「读原始配置 + 逐字段兜底」的方式处理：任何缺失、类型不对、
		 * 或未知取值都退回默认值，绝不因为配置错误让插件抛错。
		 *
		 * @module dsh-run-pulse/config
		 */

		/** 默认配置：全部按「开」交付，安装了就有效果。 */
		const DEFAULTS = Object.freeze({
			enabled: true,
			states: Object.freeze({ running: true, pending: true, unread: true }),
			appearance: 'all',
			showCount: true,
			railIndicator: true,
			includeArchived: false,
			debug: false
		});

		/** `appearance` 允许的取值。 */
		const APPEARANCES = Object.freeze(['all', 'pulse', 'tint', 'icon']);

		/**
		 * 判断一个值是否是「普通对象」（排除数组与 null）。
		 * @param value - 待判断的值。
		 * @returns 是否是普通对象。
		 */
		function isPlainObject(value) {
			return typeof value === 'object' && value !== null && !Array.isArray(value);
		}

		/**
		 * 取布尔值，非布尔一律退回兜底值。
		 * @param value - 原始值。
		 * @param fallback - 兜底值。
		 * @returns 布尔值。
		 */
		function readBoolean(value, fallback) {
			return typeof value === 'boolean' ? value : fallback;
		}

		/**
		 * 归一化任意原始配置。
		 * @param raw - 插件自身的配置（正确读法是 `ctx.fiber.config`），可能是任意值。
		 * @returns 一份完整、合法的配置。
		 */
		function normalizeConfig(raw) {
			const source = isPlainObject(raw) ? raw : {};
			const states = isPlainObject(source.states) ? source.states : {};
			const appearance = APPEARANCES.includes(source.appearance) ? source.appearance : DEFAULTS.appearance;
			return {
				enabled: readBoolean(source.enabled, DEFAULTS.enabled),
				states: {
					running: readBoolean(states.running, DEFAULTS.states.running),
					pending: readBoolean(states.pending, DEFAULTS.states.pending),
					unread: readBoolean(states.unread, DEFAULTS.states.unread)
				},
				appearance,
				showCount: readBoolean(source.showCount, DEFAULTS.showCount),
				railIndicator: readBoolean(source.railIndicator, DEFAULTS.railIndicator),
				includeArchived: readBoolean(source.includeArchived, DEFAULTS.includeArchived),
				debug: readBoolean(source.debug, DEFAULTS.debug)
			};
		}

		/**
		 * 公开默认值，供文档与自检使用。
		 * @returns 默认配置的只读副本。
		 */
		function defaultConfig() {
			return normalizeConfig(DEFAULTS);
		}

			return {
				normalizeConfig,
				defaultConfig,
			};
		};

		/** locale.js */
		const __moduleLocale = () => {
		/**
		 * 本插件的文案与语言判定。
		 *
		 * 优先走 Harness 的 locale 服务（`ctx.get('locale')`）：注册字典后由服务决定
		 * 当前语言，并随用户切换语言重新翻译。若 locale 服务不存在（更精简的组装），
		 * 退回按 `<html lang>` 判定的内置字典，保证任何情况下都有可用文案。
		 *
		 * @module dsh-run-pulse/locale
		 */

		/** 命名空间：注册进 locale 服务时使用。 */
		const NS = 'run-pulse';

		/** 简体中文字典（键集的事实来源）。 */
		const ZH = {
			'running.one': '正在运行',
			'running.other': '{n} 个会话正在运行',
			'running.withPending': '{n} 个会话正在运行（含等待你操作的会话）',
			'pending.approval': '等待你审批',
			'pending.plan': '等待你确认计划',
			'pending.question': '等待你回答',
			'pending.other': '{n} 个会话在等你操作',
			'unread.one': '有 1 个已完成但未查看的会话',
			'unread.other': '有 {n} 个已完成但未查看的会话',
			'rail.running': '有会话正在运行',
			'rail.pending': '有会话在等你操作',
			'rail.unread': '有未查看的完成结果'
		};

		/** English dictionary（与中文键集一一对应）。 */
		const EN = {
			'running.one': 'Running',
			'running.other': '{n} sessions running',
			'running.withPending': '{n} running (some waiting for you)',
			'pending.approval': 'Waiting for your approval',
			'pending.plan': 'Plan awaiting review',
			'pending.question': 'Waiting for your answer',
			'pending.other': '{n} sessions waiting for you',
			'unread.one': '1 finished session you have not viewed',
			'unread.other': '{n} finished sessions you have not viewed',
			'rail.running': 'A session is running',
			'rail.pending': 'A session is waiting for you',
			'rail.unread': 'Unviewed finished results'
		};

		/**
		 * 把 `{name}` 占位符替换成实参。
		 * @param template - 含占位符的模板串。
		 * @param params - 替换参数。
		 * @returns 替换后的文本。
		 */
		function interpolate(template, params) {
			if (params === undefined) return template;
			return template.replace(/\{(\w+)\}/g, (match, key) => (key in params ? String(params[key]) : match));
		}

		/**
		 * 组一个翻译函数；优先使用 locale 服务的 seat，缺失或注册失败时用内置字典。
		 *
		 * locale 注册是**纯装饰性**的（只为跟随应用语言），所以这里任何异常都吞掉并
		 * 退回内置字典——绝不允许它把整个插件的 `apply` 带崩。
		 *
		 * @param ctx - Client Cordis 上下文。
		 * @returns 翻译函数 `(key, params?) => string`。
		 */
		function createTranslator(ctx) {
			try {
				// `ctx.get` 是经 mixin 注册的成员：找不到只返回 undefined，不会抛错。
				const locale = typeof ctx?.get === 'function' ? ctx.get('locale') : undefined;
				if (locale === undefined || locale === null) return (key, params) => fallbackTranslate(key, params);
				if (typeof locale.register !== 'function' || typeof locale.bind !== 'function') {
					return (key, params) => fallbackTranslate(key, params);
				}
				if (typeof ctx.effect === 'function') {
					ctx.effect(() => {
						const disposeZh = locale.register(NS, 'zh', ZH);
						const disposeEn = locale.register(NS, 'en', EN);
						return () => {
							if (typeof disposeZh === 'function') disposeZh();
							if (typeof disposeEn === 'function') disposeEn();
						};
					}, 'dsh-run-pulse: locale dictionaries');
				}
				const seat = locale.bind(NS);
				return (key, params) => {
					try {
						const text = seat(key, params);
						if (typeof text === 'string' && text !== '' && text !== key) return text;
					} catch {
						/* 字典缺失时退回内置文案。 */
					}
					return fallbackTranslate(key, params);
				};
			} catch (error) {
				// locale 只影响文案语言，出任何问题都退回内置字典，不影响功能。
				if (typeof console !== 'undefined') console.warn('[dsh-run-pulse] locale 服务不可用，使用内置文案：', error);
				return (key, params) => fallbackTranslate(key, params);
			}
		}

		/**
		 * 不依赖 locale 服务的内置翻译：按 `<html lang>` 选中文或英文。
		 * 语言在每次调用时读取，因此用户切换语言后无需重挂插件。
		 * @param key - 字典键。
		 * @param params - 替换参数。
		 * @returns 文案；键不存在时原样返回键名（便于发现漏配）。
		 */
		function fallbackTranslate(key, params) {
			const lang = typeof document === 'undefined' ? 'en' : document.documentElement?.lang ?? '';
			const dict = lang.toLowerCase().startsWith('zh') ? ZH : EN;
			const template = dict[key];
			if (typeof template !== 'string') return key;
			return interpolate(template, params);
		}

			return {
				NS,
				ZH,
				EN,
				createTranslator,
				fallbackTranslate,
			};
		};

		/** status.js */
		const __moduleStatus = () => {
		/**
		 * 纯函数状态引擎：把「工作区清单 × 会话清单 × 统一运行状态」折算成
		 * 「每个工作区分组该显示什么标记」。
		 *
		 * 这一层不碰 DOM、不碰 Cordis，方便单测：输入快照，输出 `Map<workspaceKey, Marker>`。
		 * 分组键与官方 UI 完全一致：真实工作区是 `workspaceId`，不属于任何工作区的会话
		 * 归到空串（官方的 Ungrouped 分组）。
		 *
		 * @module dsh-run-pulse/status
		 */

		/** 标记状态，按优先级从高到低排列。 */
		const STATE_ORDER = Object.freeze(['pending', 'running', 'unread']);

		/** 不属于任何工作区的会话所使用的分组键（与 ui-workspace 的 Ungrouped 一致）。 */
		const UNGROUPED_KEY = '';

		/**
		 * 安全地取一个快照/对象上的数组字段。
		 * @param source - 可能是任意值的容器。
		 * @param key - 字段名。
		 * @returns 数组；字段不是数组时返回空数组。
		 */
		function arrayOf(source, key) {
			const value = source === null || source === undefined ? undefined : source[key];
			return Array.isArray(value) ? value : [];
		}

		/**
		 * 把 `sessionStatus` 的可观察快照归一化成 `Map<id, status>`。
		 * @param snapshot - `sessionStatus.getSnapshot()` 的返回值，可能是 Map 或普通对象。
		 * @returns 归一化后的 Map。
		 */
		function toStatusMap(snapshot) {
			const map = new Map();
			if (snapshot instanceof Map) {
				for (const [id, status] of snapshot) {
					if (typeof id === 'string' && status !== null && typeof status === 'object') map.set(id, status);
				}
				return map;
			}
			if (snapshot !== null && typeof snapshot === 'object') {
				for (const [id, status] of Object.entries(snapshot)) {
					if (status !== null && typeof status === 'object') map.set(id, status);
				}
			}
			return map;
		}

		/**
		 * 归一化 `sessions.list` 的快照。
		 * @param snapshot - `sessions.list.getSnapshot()` 的返回值。
		 * @returns `{ ids: string[], byId: Record<string, object> }`。
		 */
		function normalizeSessionList(snapshot) {
			const source = snapshot !== null && typeof snapshot === 'object' ? snapshot : {};
			const byId = source.byId !== null && typeof source.byId === 'object' ? source.byId : {};
			const ids = Array.isArray(source.ids) ? source.ids.filter((id) => typeof id === 'string') : Object.keys(byId);
			return { ids, byId };
		}

		/**
		 * 归一化 `workspaces.list` 的快照。
		 * @param snapshot - `workspaces.list.getSnapshot()` 的返回值。
		 * @returns `{ items, archived: Set, pinned: Set }`。
		 */
		function normalizeWorkspaceList(snapshot) {
			const source = snapshot !== null && typeof snapshot === 'object' ? snapshot : {};
			const items = Array.isArray(source.items) ? source.items.filter((item) => item !== null && typeof item === 'object') : [];
			return {
				items,
				archived: new Set(arrayOf(source, 'archivedSessionIds')),
				pinned: new Set(arrayOf(source, 'pinnedSessionIds'))
			};
		}

		/**
		 * 单个会话的标记状态；不需要标记时返回 `null`。
		 *
		 * 优先级：等待我操作 > 正在运行 > 未读完成。等待审批/回答的会话通常整体
		 * 仍处于 running，但「卡在等我」更需要被看见，所以排在最前。
		 *
		 * @param sessionId - 会话 id。
		 * @param list - 归一化后的会话清单。
		 * @param statuses - 归一化后的状态表。
		 * @param options - `{ states, includeArchived, archived }`。
		 * @returns `'pending' | 'running' | 'unread' | null`。
		 */
		function sessionState(sessionId, list, statuses, options) {
			const status = statuses.get(sessionId);
			const summary = list.byId[sessionId];
			const archived = options.archived.has(sessionId);
			if (archived && options.includeArchived !== true) return null;
			if (summary !== undefined && summary.origin === 'subagent') return null;
			const pending = options.states.pending === true && status?.pendingInteraction !== undefined && status.pendingInteraction !== null;
			if (pending) return 'pending';
			const running = options.states.running === true && (status?.running === true || summary?.running === true);
			if (running) return 'running';
			const unread = options.states.unread === true && status?.completionUnread === true;
			if (unread) return 'unread';
			return null;
		}

		/**
		 * 从若干会话状态里挑出分组的主状态（按 STATE_ORDER 优先级）。
		 * @param counts - `{ pending, running, unread }` 计数。
		 * @returns 主状态；全为 0 时返回 `null`。
		 */
		function primaryState(counts) {
			for (const state of STATE_ORDER) {
				if (counts[state] > 0) return state;
			}
			return null;
		}

		/**
		 * 计算所有需要标记的工作区分组。
		 *
		 * @param input - `{ sessions, workspaces, statuses, config, translate }`。
		 * @returns `Map<workspaceKey, { state, counts, activeCount, sessionIds, titles }>`，
		 *   只包含「至少有一个会话需要标记」的分组；`titles` 给提示文案用。
		 */
		function computeGroups(input) {
			const list = normalizeSessionList(input.sessions);
			const workspaces = normalizeWorkspaceList(input.workspaces);
			const statuses = toStatusMap(input.statuses);
			const states = input.config?.states ?? { running: true, pending: true, unread: true };
			const baseOptions = {
				states,
				includeArchived: input.config?.includeArchived === true,
				archived: workspaces.archived
			};
			const groups = new Map();
			const accounted = new Set();

			/**
			 * 把一个会话计入某个分组。
			 * @param key - 分组键。
			 * @param sessionId - 会话 id。
			 * @returns 无返回值。
			 */
			const account = (key, sessionId) => {
				const state = sessionState(sessionId, list, statuses, baseOptions);
				if (state === null) return;
				let group = groups.get(key);
				if (group === undefined) {
					group = { state: null, counts: { pending: 0, running: 0, unread: 0 }, sessionIds: [], titles: [] };
					groups.set(key, group);
				}
				group.counts[state] += 1;
				group.sessionIds.push(sessionId);
				const title = list.byId[sessionId]?.displayTitle;
				group.titles.push(typeof title === 'string' && title !== '' ? title : sessionId);
			};

			for (const workspace of workspaces.items) {
				const workspaceId = typeof workspace.workspaceId === 'string' ? workspace.workspaceId : undefined;
				if (workspaceId === undefined || workspaceId === '') continue;
				for (const sessionId of arrayOf(workspace, 'sessionIds')) {
					if (typeof sessionId !== 'string') continue;
					accounted.add(sessionId);
					account(workspaceId, sessionId);
				}
			}

			for (const sessionId of list.ids) {
				if (accounted.has(sessionId)) continue;
				const summary = list.byId[sessionId];
				if (summary === undefined) continue;
				account(UNGROUPED_KEY, sessionId);
			}

			for (const group of groups.values()) {
				group.state = primaryState(group.counts);
				group.activeCount = group.counts.pending + group.counts.running + group.counts.unread;
			}
			return groups;
		}

		/**
		 * 取整组聚合后的状态，供侧边栏窄条使用。
		 * @param groups - `computeGroups` 的结果。
		 * @returns `{ state, count }`；没有任何活动时 `state` 为 `null`。
		 */
		function aggregateState(groups) {
			const totals = { pending: 0, running: 0, unread: 0 };
			for (const group of groups.values()) {
				totals.pending += group.counts.pending;
				totals.running += group.counts.running;
				totals.unread += group.counts.unread;
			}
			return { state: primaryState(totals), count: totals.pending + totals.running + totals.unread };
		}

		/**
		 * 生成一个分组的提示文案（`title` / `aria-label`）。
		 * @param group - `computeGroups` 里的一个分组。
		 * @param translate - 翻译函数。
		 * @returns 文案。
		 */
		function groupLabel(group, translate) {
			const { counts } = group;
			if (counts.pending > 0) return translate('pending.other', { n: counts.pending });
			if (counts.running > 0) {
				return counts.running === 1 ? translate('running.one') : translate('running.other', { n: counts.running });
			}
			if (counts.unread > 0) {
				return counts.unread === 1 ? translate('unread.one') : translate('unread.other', { n: counts.unread });
			}
			return '';
		}

			return {
				UNGROUPED_KEY,
				toStatusMap,
				normalizeSessionList,
				normalizeWorkspaceList,
				sessionState,
				computeGroups,
				aggregateState,
				groupLabel,
			};
		};

		/** decorator.js */
		const __moduleDecorator = () => {
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

		const { groupLabel } = __moduleStatus();
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
		function createDecorator(options) {
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
		function renderRail(state, translate) {
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

			return {
				createDecorator,
				renderRail,
			};
		};

		/** entry.js */
		const __moduleEntry = () => {
		/**
		 * dsh-run-pulse — Client 半边入口（浏览器半边的事实源码）。
		 *
		 * 本文件是 ESM：测试直接 import 它，浏览器用的 `client.js` 由
		 * `scripts/build-client.mjs` 从它打包生成（运行时只认 __ModuleLoader__ 工厂形式）。
		 *
		 * 折叠的工作区（文件夹）里有会话在运行 / 等待你操作 / 有未读完成结果时，
		 * 在该文件夹的标题行尾部显示一个呼吸脉动的小圆点；侧边栏整体收成窄条时，
		 * 在「展开侧边栏」按钮上显示同一个聚合提示。
		 *
		 * 实现要点：
		 * - 不注册任何 slot、不重写官方 UI；只在官方已有的锚点行 `[data-row-key^="workspace:"]`
		 *   上追加一个 `pointer-events: none` + `aria-hidden` 的纯装饰节点。
		 * - 状态来自官方数据层：`sessions.list`、`workspaces.list`、`sessionStatus`；
		 *   三者都是可观察快照，订阅后任何变化都会触发一次幂等重绘。
		 * - 找不到锚点、数据源缺失、配置损坏时一律静默降级，绝不影响侧边栏本身。
		 *
		 * ⚠️ Cordis 的 `ctx` 是一个 Proxy：**未注册的属性读取会直接抛错**
		 * （`cannot get property "x" without inject`），而不是返回 undefined。
		 * 只有 `ctx.get()` / `ctx.effect()` / `ctx.on()` 这类经 `mixin` 注册的成员，
		 * 以及 `ctx.fiber` 这类实例自有属性才是安全的。
		 * 因此本模块绝不直接读 `ctx.<任意未注册属性>`，并且 `apply` 整体兜底，
		 * 任何异常都只降级为「本插件不生效」，绝不能让 DSH 启动失败。
		 *
		 * @module dsh-run-pulse/src/entry
		 */

		const { normalizeConfig } = __moduleConfig();
		const { createTranslator } = __moduleLocale();
		const { aggregateState, computeGroups, groupLabel } = __moduleStatus();
		const { createDecorator, renderRail } = __moduleDecorator();
		/**
		 * 观察不到任何数据源时的兜底轮询间隔（毫秒）。
		 *
		 * 产物形态：运行时把客户端半边作为 `factory(require)` 求值，本模块的导出会原样
		 * 交给 Cordis（它读 `plugin.inject` / `plugin.apply`）。这里不引用 `require`，
		 * 因为本插件只用官方主题 token 与原生 DOM，不需要任何外部模块。
		 */
		const FALLBACK_TICK_MS = 4000;

		/** 日志前缀。 */
		const LOG = '[dsh-run-pulse]';

		/**
		 * 读取本插件在 profile patch 里声明的 `config`。
		 *
		 * Cordis 的 `ctx.config` **不存在**（Context 原型上没有它，也未注册为服务），
		 * 直接读会抛错——这正是曾经把 DSH 启动打挂的那一行。插件自己的配置挂在
		 * fiber 上，且由 fiber 在执行 `apply` 之前解析好。
		 *
		 * @param ctx - Client Cordis 上下文。
		 * @returns 配置对象，或 undefined（此时用默认配置）。
		 */
		function readPluginConfig(ctx) {
			try {
				return ctx?.fiber?.config;
			} catch (error) {
				console.warn(`${LOG} 读取插件配置失败，改用默认值：`, error);
				return undefined;
			}
		}

		/**
		 * 安全地取一个服务：`ctx.get()` 是经 mixin 注册的成员，找不到只返回 undefined；
		 * 这里再包一层 try/catch，以防未来运行时收紧语义。
		 *
		 * @param ctx - Client Cordis 上下文。
		 * @param name - 服务名。
		 * @returns 服务或 undefined。
		 */
		function readService(ctx, name) {
			try {
				if (ctx !== null && ctx !== undefined && typeof ctx.get === 'function') return ctx.get(name);
			} catch (error) {
				console.warn(`${LOG} 读取服务 ${name} 失败：`, error);
			}
			return undefined;
		}

		/**
		 * 读取一个可观察快照上的字段。
		 * @param store - 可能是 undefined。
		 * @param key - 方法名。
		 * @returns 取到的值，或 undefined。
		 */
		function callStore(store, key) {
			if (store === null || store === undefined || typeof store[key] !== 'function') return undefined;
			try {
				return store[key]();
			} catch (error) {
				console.warn(`${LOG} 读取 ${key}() 失败：`, error);
				return undefined;
			}
		}

		/**
		 * 读一份数据源快照，读不到就返回 undefined（让状态引擎按「无活动」处理）。
		 * @param ctx - Client Cordis 上下文。
		 * @param serviceName - 服务名（`sessions` / `workspaces`）。
		 * @returns 快照或 undefined。
		 */
		function readServiceSnapshot(ctx, serviceName) {
			const service = readService(ctx, serviceName);
			if (service === undefined || service === null) return undefined;
			return callStore(service.list, 'getSnapshot');
		}

		/**
		 * 真正的启动流程；任何一步抛错都会由 `plugin.apply` 的外层兜住并回滚。
		 *
		 * @param ctx - Client Cordis 上下文。
		 * @param disposers - 已创建资源的清理函数栈（边创建边登记，失败时逐个回滚）。
		 * @returns 卸载函数，或 undefined（配置禁用时）。
		 */
		function start(ctx, disposers) {
			const config = normalizeConfig(readPluginConfig(ctx));
			const translate = createTranslator(ctx);
			/** 缓存最近一次计算结果，供 DOM 渲染重复读取。 */
			let groups = new Map();
			let rail = { state: null, count: 0 };

			const decorator = createDecorator({
				getConfig: () => config,
				getGroups: () => groups
			});
			disposers.push(() => decorator.dispose());

			/** 重新计算一次状态并重绘；本函数自身的任何异常都必须吞掉。 */
			const recompute = () => {
				try {
					const sessions = readServiceSnapshot(ctx, 'sessions');
					const workspaces = readServiceSnapshot(ctx, 'workspaces');
					const statuses = callStore(readService(ctx, 'uiSession')?.sessionStatus, 'getSnapshot');
					groups = computeGroups({ sessions, workspaces, statuses, config });
					rail = aggregateState(groups);
					for (const group of groups.values()) group.label = groupLabel(group, translate);
					decorator.render();
					if (config.railIndicator === true) renderRail(rail, translate);
					else renderRail(null, translate);
					if (config.debug === true) console.log(`${LOG} 状态`, { groups: Array.from(groups.entries()), rail });
				} catch (error) {
					console.warn(`${LOG} 计算状态失败：`, error);
				}
			};

			if (config.enabled !== true) {
				console.log(`${LOG} 已在配置中禁用（enabled: false），不做任何改动。`);
				return undefined;
			}

			decorator.start();

			/**
			 * 订阅一个服务的数据源。
			 * @param serviceName - 服务名。
			 * @param label - 日志标签。
			 * @returns 是否订阅成功。
			 */
			const subscribe = (serviceName, label) => {
				const list = readService(ctx, serviceName)?.list;
				if (list === null || list === undefined || typeof list.subscribe !== 'function') return false;
				try {
					const dispose = list.subscribe(() => recompute());
					disposers.push(typeof dispose === 'function' ? dispose : () => {});
					return true;
				} catch (error) {
					console.warn(`${LOG} 订阅 ${label} 失败：`, error);
					return false;
				}
			};

			const subscribedSessions = subscribe('sessions', 'sessions.list');
			const subscribedWorkspaces = subscribe('workspaces', 'workspaces.list');

			const statusSource = readService(ctx, 'uiSession')?.sessionStatus;
			let subscribedStatus = false;
			if (statusSource !== null && statusSource !== undefined && typeof statusSource.subscribe === 'function') {
				try {
					const dispose = statusSource.subscribe(() => recompute());
					disposers.push(typeof dispose === 'function' ? dispose : () => {});
					subscribedStatus = true;
				} catch (error) {
					console.warn(`${LOG} 订阅 sessionStatus 失败：`, error);
				}
			}

			// 首次计算：不依赖任何订阅是否成功，先让已有画面正确。
			recompute();

			// 数据源一个都没订阅上时，用低频轮询兜底（例如未来接口改名）。
			if (!subscribedSessions && !subscribedWorkspaces && !subscribedStatus) {
				console.warn(`${LOG} 未订阅到任何数据源，回退为 ${FALLBACK_TICK_MS}ms 轮询。`);
				if (typeof setInterval === 'function') {
					const timer = setInterval(recompute, FALLBACK_TICK_MS);
					disposers.push(() => clearInterval(timer));
				}
			} else {
				console.log(`${LOG} 已就绪`, {
					sessions: subscribedSessions,
					workspaces: subscribedWorkspaces,
					sessionStatus: subscribedStatus,
					appearance: config.appearance
				});
			}

			// Cordis 会把这个返回值当作卸载钩子。
			return () => {
				while (disposers.length > 0) {
					const dispose = disposers.pop();
					try {
						dispose();
					} catch {
						/* 卸载期的异常不再上报。 */
					}
				}
			};
		}

		const plugin = {
			/**
			 * 只软依赖数据源：`sessions` / `workspaces` / `uiSession` 都用 `ctx.get()` 取，
			 * 取不到就静默降级，所以这里不写死 inject，避免加载顺序不同时被卡住。
			 * （写死 inject 反而危险：任何依赖未就绪都会让 fiber 停在 PENDING，
			 *   而 web 启动审计会把非 ACTIVE 的条目判为失败。）
			 */
			inject: [],

			/**
			 * 挂载插件。
			 *
			 * **绝不抛错**：Cordis 在 `apply` 抛错时会把 fiber 置为 FAILED，而 DSH 的
			 * web 启动审计要求所有条目都是 ACTIVE，否则整个应用起不来。这里统一兜底，
			 * 把「插件出错」降级成「插件不生效」。
			 *
			 * @param ctx - Client Cordis 上下文。
			 * @returns 卸载函数；启动失败时返回 undefined。
			 */
			apply(ctx) {
				const disposers = [];
				try {
					return start(ctx, disposers);
				} catch (error) {
					console.error(`${LOG} 启动失败，已回滚本次创建的资源（不影响 DSH 启动）：`, error);
					while (disposers.length > 0) {
						const dispose = disposers.pop();
						try {
							dispose();
						} catch {
							/* 回滚期的异常不再上报。 */
						}
					}
					return undefined;
				}
			}
		};

			return {
				plugin,
			};
		};

		// 工厂返回入口模块的 plugin 导出（Cordis 会拿它的 inject / apply）。
		return __moduleEntry().plugin;
	}
});
