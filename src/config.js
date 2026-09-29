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
export function normalizeConfig(raw) {
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
export function defaultConfig() {
	return normalizeConfig(DEFAULTS);
}
