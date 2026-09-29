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
export const NS = 'run-pulse';

/** 简体中文字典（键集的事实来源）。 */
export const ZH = {
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
export const EN = {
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
export function createTranslator(ctx) {
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
export function fallbackTranslate(key, params) {
	const lang = typeof document === 'undefined' ? 'en' : document.documentElement?.lang ?? '';
	const dict = lang.toLowerCase().startsWith('zh') ? ZH : EN;
	const template = dict[key];
	if (typeof template !== 'string') return key;
	return interpolate(template, params);
}
