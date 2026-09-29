# dsh-run-pulse

折叠的工作区（文件夹）里有会话在运行时，让这个文件夹自己「亮起来」。

DSH 的侧边栏在会话被折叠后，看不出哪个文件夹里还有东西在跑：官方只把状态点画在
**会话行**上，而折叠会把会话行藏起来。上游的 ui-workspace 也把这一点写进了已知限制
（*Pending user interaction is not aggregated into collapsed groups*）。

本插件补上这个空缺：在文件夹标题行尾部加一个**呼吸脉动的小圆点**，
侧边栏整体收成窄条时，同一个提示会出现在「展开侧边栏」按钮上。

## 效果

| 情况 | 表现 |
| --- | --- |
| 文件夹里有会话正在运行（含父会话空闲但子代理/后台任务在跑） | 蓝色圆点，1.7s 呼吸 |
| 文件夹里有会话在等你（审批 / 计划确认 / 回答） | 警告色圆点，1.1s 呼吸（节奏更快） |
| 文件夹里有已完成但未查看的会话 | 成功色静态点 + 细描边（不脉动） |
| 同一文件夹里有多个这样的会话 | 圆点右上角显示数字 |
| 侧边栏收成窄条 | 「展开侧边栏」按钮右上角显示聚合提示 |
| 系统开启「减弱动效」 | 全部变成静态点，不做循环动画 |

优先级：**等待你 > 正在运行 > 未读完成**。

鼠标悬停在文件夹行上会看到具体说明（如「2 个会话在等你操作」）。

## 它是怎么做到的（以及不会做什么）

- **不改动官方 UI**：不注册 slot、不重写侧边栏、不替换任何官方组件。
- **数据来自官方数据层**：`sessions.list`、`workspaces.list`、`sessionStatus`
  三个可观察快照，订阅后任何变化都会触发一次幂等重绘。
- **DOM 装饰**：只认官方给的稳定锚点 `[data-row-key^="workspace:"]`
  （`key` 就是 workspaceId），在当前行末尾追加一个
  `pointer-events: none` + `aria-hidden="true"` 的纯装饰节点。
- **零侵入交互**：标记不吃点击、不进 tab 焦点、不改变「点文件夹行 = 展开/折叠」，
  也不给读屏增加噪音；配色全部走官方主题 token，浅色/深色自动跟随。
- **静默降级**：找不到锚点、数据源缺失、配置写错，都只是不显示标记，
  绝不影响侧边栏本身；插件卸载时会移掉所有自己插入的节点与样式。

## 源码与产物（改代码前必读）

运行时里每个客户端半边都是
`window.__ModuleLoader__.load({ id, factory(require) })` 形式，由浏览器直接求值；
普通 ESM 的 `export` 在那个环境里是语法错误。所以本包分两层：

- `src/*.js` —— **事实源码**，保持 ESM（自检可以直接 import）；
- `client.js` —— **产物**，由 `scripts/build-client.mjs` 从 `src/` 生成，请勿手工修改。

```bash
npm run build   # 改完 src/ 后重新生成 client.js
npm run check   # 只校验产物是否与源码一致
npm test        # check + 四个自检
```

打包是确定性的：`npm test` 会重新生成并与磁盘上的 `client.js` 逐字节比对，
**改源码忘了构建会直接测试失败**。

## 配置

配置写在 profile 的 `cordis.patch.yml` 里（所有字段都有默认值，不配也能用）：

```yaml
- id: run-pulse
  name: dsh-run-pulse
  disabled: false
  config:
    enabled: true          # 总开关
    states:
      running: true        # 正在运行（含子代理/后台任务）
      pending: true        # 等待审批 / 计划确认 / 回答
      unread: true         # 已完成但未查看
    appearance: all        # all | pulse | tint | icon
    showCount: true        # 多个会话时显示数字角标
    railIndicator: true    # 侧边栏收成窄条时的聚合提示
    includeArchived: false # 归档会话是否参与判定
    debug: false           # 打开后在控制台打印每次计算出的分组状态
```

`appearance` 的取值：

- `all`（默认）：圆点 + 脉动（+ 多个时的数字）
- `pulse`：只脉动圆点
- `tint`：整行底色微亮呼吸，不显示圆点
- `icon`：只脉动圆点，且把圆点压到最小（更克制）

本包暂时**没有** schemastery 的 JSON Schema，所以设置页里不会出现自动生成的配置表单
（Host 半边是空实现）。以后要做表单，把 schema 加到 Host 半边即可，
Client 侧的读取逻辑不用动。

## 安装

和其它本地插件一样，通过 profile 链接安装：

1. `~/.dsh/profiles/desktop/package.json`：

   ```json
   {
     "dependencies": {
       "dsh-run-pulse": "link:/Users/yakutsukuriyuu/Documents/Harness/dsh插件制作/dsh-run-pulse"
     },
     "dsh": { "profile": { "bundles": ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app", "dsh-run-pulse"] } }
   }
   ```

2. 在 profile 目录执行 `pnpm install`（或直接用 DSH 的插件管理器安装本地包）。
3. 重启会话 / 重开窗口后生效。

## 开发自检

```bash
npm test
```

四个自检都不依赖浏览器与网络：

| 文件 | 覆盖 |
| --- | --- |
| `test/status.test.mjs` | 状态引擎：分组、优先级、开关、归档、子代理排除、容错 |
| `test/decorator.test.mjs` | DOM 装饰：贴标记、幂等、外观切换、回收、卸载清理 |
| `test/client.test.mjs` | 入口集成：服务订阅 → 状态 → DOM → 窄条提示 → 卸载退订；**含 Cordis 形态 ctx 的启动回归** |
| `test/bundle.test.mjs` | 产物形态：以 `__ModuleLoader__` 方式求值 `client.js`，再跑一遍 apply |

## 排查

- **DSH 起不来 / 控制台报 `web boot: ... did not activate`**：先按下面的
  「紧急回滚」摘掉插件恢复启动。DSH 的 web 启动审计要求**所有**插件条目都进入
  ACTIVE，任何插件 `apply` 抛错都会整机起不来。本插件的 `apply` 已整体兜底
  （见 `src/entry.js`），正常最坏也只是「标记不显示」，并留下
  `[dsh-run-pulse] 启动失败，已回滚本次创建的资源`——看到这条就把后面的原始错误发出来。
- 看不到标记：先确认文件夹确实**被折叠**（展开时官方自己就画了状态点），
  再看控制台是否有 `[dsh-run-pulse] 已就绪`；若看到「未订阅到任何数据源」，
  说明运行时接口变了，插件会退化为 4s 轮询并仍能工作。
- 想确认判定结果：把 `debug: true` 打开，控制台会打印每个分组的
  `{ state, counts, sessionIds, titles }`。
- 升级 DSH 后若标记消失：先看控制台是否有「未订阅到任何数据源」或
  「装饰分组行失败」。锚点用的是官方 `data-row-key` 属性，理论上跨版本稳定；
  真出问题请把上面的日志贴出来。
- 控制台报 `Unexpected token 'export'`：说明加载到的是没打包的源码形态，
  运行 `npm run build` 重新生成 `client.js`。

### 紧急回滚（让 DSH 立刻能启动）

从 profile 的 `package.json` 里删掉 `dsh-run-pulse`（`dependencies` 与
`dsh.profile.bundles` 两处），在 profile 目录执行 `pnpm install`，然后重启。
崩溃原因看 `~/Library/Logs/DeepSeek Harness/crash-*.log`。

### 写给后续维护者：Cordis `ctx` 的坑

`ctx` 是一个 Proxy，**未注册的属性读取会直接抛错**，而不是返回 `undefined`：

```js
ctx.get('sessions')  // ✅ 安全：`get` 经 mixin 注册，找不到只返回 undefined
ctx.effect(fn, 'x')  // ✅ 安全：同上
ctx.fiber.config     // ✅ 安全：实例自有属性（插件自身配置的正确读法）
ctx.config           // ❌ 抛错：cannot get property "config" without inject
```

本插件曾因 `apply` 第一行读 `ctx.config` 而导致整机无法启动。
`test/client.test.mjs` 里有一个**忠实复现该 Proxy 行为**的桩（`cordisLikeCtx`），
以后任何新增的 `ctx.<属性>` 访问都会被它当场拦下。

## 目录

```
client.js              # 产物：浏览器实际加载的 __ModuleLoader__ 工厂（勿手改）
index.js               # Host 半边（空实现，仅为能挂进 profile 的 bundle 列表）
scripts/build-client.mjs  # 从 src/ 生成 client.js，并可校验产物是否过期
src/entry.js           # Client 半边入口（ESM 源码）：订阅数据源 + 调度渲染 + 卸载
src/config.js          # 配置归一化（任何缺失/错类型都退回默认值）
src/status.js          # 纯函数状态引擎（可单测，不碰 DOM）
src/decorator.js       # DOM 装饰器 + 窄条聚合提示 + 样式表
src/locale.js          # zh/en 文案，优先走官方 locale 服务
locale/*.json          # 文案的 JSON 形态（供别的工具读取）
test/*.test.mjs        # 四个自检
```
