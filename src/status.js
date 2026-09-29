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
export const UNGROUPED_KEY = '';

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
export function toStatusMap(snapshot) {
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
export function normalizeSessionList(snapshot) {
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
export function normalizeWorkspaceList(snapshot) {
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
export function sessionState(sessionId, list, statuses, options) {
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
export function computeGroups(input) {
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
export function aggregateState(groups) {
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
export function groupLabel(group, translate) {
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
