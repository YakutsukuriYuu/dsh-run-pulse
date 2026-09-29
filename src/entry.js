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

import { normalizeConfig } from './config.js';
import { createTranslator } from './locale.js';
import { aggregateState, computeGroups, groupLabel } from './status.js';
import { createDecorator, renderRail } from './decorator.js';

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

export const plugin = {
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
