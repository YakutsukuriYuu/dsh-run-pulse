/**
 * dsh-run-pulse — Host 半边。
 *
 * 本插件的全部逻辑都在浏览器半边（`./client.js`）：它只读官方客户端数据层并
 * 给折叠的工作区分组加一个纯装饰标记，不需要 Host 服务、工具或远程方法。
 * 这里保留一个空实现，让 profile 的 bundle 列表能正常挂载本条目。
 *
 * @module dsh-run-pulse
 */

/** 本包版本，随日志一起输出，便于确认运行时加载的是哪一份代码。 */
export const PLUGIN_VERSION = '0.1.0';

export default {
	/**
	 * 挂载 Host 半边。
	 * @param ctx - Host Cordis 上下文。
	 * @returns 无返回值。
	 */
	apply(ctx) {
		if (typeof ctx?.logger?.info === 'function') {
			ctx.logger.info(`dsh-run-pulse ${PLUGIN_VERSION}：UI 逻辑在 Client 半边，Host 侧无副作用。`);
		}
	}
};
