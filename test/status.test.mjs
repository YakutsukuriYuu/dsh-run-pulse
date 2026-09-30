/**
 * 状态引擎自检：不依赖浏览器，用合成快照验证分组与状态判定。
 * 运行：node test/status.test.mjs
 */

import assert from 'node:assert/strict';
import { aggregateState, computeGroups, groupLabel, normalizeSessionList, normalizeWorkspaceList, toStatusMap } from '../src/status.js';
import { normalizeConfig } from '../src/config.js';

const config = normalizeConfig({});

const workspaces = {
	items: [
		{ workspaceId: 'ws-a', title: 'A 项目', path: '/tmp/a', sessionIds: ['s-run', 's-idle', 's-archived'] },
		{ workspaceId: 'ws-b', title: 'B 项目', path: '/tmp/b', sessionIds: ['s-pending', 's-unread'] },
		{ workspaceId: 'ws-c', title: 'C 项目', path: '/tmp/c', sessionIds: [] },
		{ workspaceId: 'ws-parent', title: '树根项目', path: '/projects/root', sessionIds: ['s-root'] },
		{ workspaceId: 'ws-child', title: '树内子项目', path: '/projects/root/child', sessionIds: ['s-child'] },
		{ workspaceId: 'ws-neighbor', title: '相似前缀项目', path: '/projects/rooted', sessionIds: ['s-neighbor'] }
	],
	archivedSessionIds: ['s-archived'],
	pinnedSessionIds: []
};

const sessions = {
	ids: ['s-run', 's-idle', 's-archived', 's-pending', 's-unread', 's-loose', 's-subagent', 's-root', 's-child', 's-neighbor'],
	byId: {
		's-run': { id: 's-run', displayTitle: '跑着的会话', running: true, origin: 'main' },
		's-idle': { id: 's-idle', displayTitle: '空闲会话', running: false },
		's-archived': { id: 's-archived', displayTitle: '归档会话', running: true },
		's-pending': { id: 's-pending', displayTitle: '等审批的会话', running: true },
		's-unread': { id: 's-unread', displayTitle: '刚跑完的会话', running: false },
		's-loose': { id: 's-loose', displayTitle: '没归属的会话', running: true },
		's-subagent': { id: 's-subagent', displayTitle: '子代理', running: true, origin: 'subagent' },
		's-root': { id: 's-root', displayTitle: '根目录会话', running: false },
		's-child': { id: 's-child', displayTitle: '子目录会话', running: true },
		's-neighbor': { id: 's-neighbor', displayTitle: '相似前缀会话', running: true }
	}
};

const statuses = new Map([
	['s-run', { running: true, pendingInteraction: undefined, completionUnread: false }],
	['s-pending', { running: true, pendingInteraction: 'approval', completionUnread: false }],
	['s-unread', { running: false, pendingInteraction: undefined, completionUnread: true }],
	['s-loose', { running: true, pendingInteraction: undefined, completionUnread: false }],
	['s-pending-child', { running: true, pendingInteraction: undefined, completionUnread: false }],
	['s-root', { running: false, pendingInteraction: undefined, completionUnread: false }],
	['s-child', { running: true, pendingInteraction: 'question', completionUnread: false }],
	['s-neighbor', { running: true, pendingInteraction: undefined, completionUnread: false }]
]);

const t = (key, params) => (params === undefined ? key : `${key}:${JSON.stringify(params)}`);

/** 第一组断言：基本分组与优先级。 */
function testGroups() {
	const groups = computeGroups({ sessions, workspaces, statuses, config });

	assert.deepEqual([...groups.keys()].sort(), ['', 'ws-a', 'ws-b', 'ws-child', 'ws-neighbor', 'ws-parent'], '应含活动分组、树父级与 Ungrouped');
	assert.equal(groups.get('ws-a').state, 'running', 'A 的主状态是正在运行');
	assert.equal(groups.get('ws-a').counts.running, 1, 'A 只统计未归档的运行中会话');
	assert.equal(groups.get('ws-a').counts.unread + groups.get('ws-a').counts.pending, 0, 'A 没有等待与未读');
	assert.equal(groups.get('ws-b').state, 'pending', '等待审批的优先级高于未读完成');
	assert.equal(groups.get('ws-b').counts.pending, 1);
	assert.equal(groups.get('ws-b').counts.unread, 1);
	assert.equal(groups.get('').state, 'running', '没有归属的会话归入 Ungrouped');
	assert.equal(groups.get('ws-c'), undefined, '没有会话的工作区不该有标记');
	assert.equal(groups.get('ws-parent').state, 'pending', '树父目录应聚合后代中的等待状态');
	assert.deepEqual(groups.get('ws-parent').counts, { pending: 1, running: 0, unread: 0 }, '树父目录只显示后代活动会话，不错误计入根目录空闲会话');
	assert.equal(groups.get('ws-parent').activeCount, 1, '后代会话在父目录中只计数一次');
	assert.equal(groups.get('ws-neighbor').state, 'running', '相似路径前缀但不是祖先的工作区独立显示');
	console.log('✓ 分组、优先级、归档过滤与树路径聚合');
}

/** 第二组断言：开关生效。 */
function testSwitches() {
	const onlyRunning = normalizeConfig({ states: { pending: false, unread: false } });
	const groups = computeGroups({ sessions, workspaces, statuses, config: onlyRunning });
	assert.equal(groups.get('ws-b').state, 'running', '关掉等待后，仍在运行的 s-pending 退化为「运行中」');
	assert.equal(groups.get('ws-b').counts.running, 1);
	assert.equal(groups.get('ws-b').counts.unread, 0, '关掉未读后不再统计完成提醒');
	assert.equal(groups.get('ws-a').state, 'running');

	const withArchived = computeGroups({ sessions, workspaces, statuses, config: normalizeConfig({ includeArchived: true }) });
	assert.equal(withArchived.get('ws-a').counts.running, 2, '打开 includeArchived 后归档会话也计入');
	console.log('✓ 状态开关与归档开关');
}

/** 第三组断言：子代理不参与（与官方行一致）。 */
function testSubagent() {
	const groups = computeGroups({ sessions, workspaces, statuses, config });
	assert.equal(groups.get('ws-c'), undefined);
	const looseIds = [];
	for (const id of groups.get('').sessionIds) looseIds.push(id);
	assert.deepEqual(looseIds, ['s-loose'], 'origin=subagent 的会话不产生标记');
	console.log('✓ 子代理会话被排除');
}

/** 第四组断言：聚合与文案。 */
function testAggregateAndLabel() {
	const groups = computeGroups({ sessions, workspaces, statuses, config });
	const rail = aggregateState(groups);
	assert.equal(rail.state, 'pending', '全局聚合优先级同样是 pending > running > unread');
	assert.equal(rail.count, 6, '窄条聚合仍按每个会话只计一次，不把树祖先副本重复计算');

	for (const group of groups.values()) group.label = groupLabel(group, t);
	assert.equal(groups.get('ws-a').label, 'running.one');
	assert.equal(groups.get('ws-b').label, 'pending.other:{"n":1}');
	assert.deepEqual(groups.get('ws-b').titles, ['等审批的会话', '刚跑完的会话']);

	const empty = aggregateState(new Map());
	assert.deepEqual(empty, { state: null, count: 0 });
	console.log('✓ 聚合状态与提示文案');
}

/** 第五组断言：容错（缺字段、错类型都不该抛）。 */
function testRobustness() {
	assert.doesNotThrow(() => computeGroups({ sessions: undefined, workspaces: null, statuses: 'nope', config: {} }));
	assert.doesNotThrow(() => normalizeConfig('not-an-object'));
	assert.deepEqual(normalizeConfig({ states: { running: 'yes' } }).states.running, true, '非法类型退回默认值');
	assert.equal(normalizeConfig({ appearance: 'rainbow' }).appearance, 'all', '未知 appearance 退回默认值');
	assert.deepEqual([...toStatusMap({ a: { running: true } }).keys()], ['a'], '普通对象形态的状态表也能读');
	assert.deepEqual(normalizeSessionList({ byId: { x: {} } }).ids, ['x'], '缺 ids 时用 byId 的键补齐');
	assert.deepEqual(normalizeWorkspaceList(undefined).items, []);
	assert.equal(computeGroups({ sessions, workspaces, statuses, config }).size, 6);
	console.log('✓ 缺字段与错类型的容错');
}

testGroups();
testSwitches();
testSubagent();
testAggregateAndLabel();
testRobustness();
console.log('\n全部通过：dsh-run-pulse 状态引擎自检');
