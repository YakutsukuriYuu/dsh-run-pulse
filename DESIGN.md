# dsh-run-pulse — 设计方案与落地记录

> **状态：已实现。** 目录名按确认改为 `dsh-run-pulse`。
> 本文上半部分是决策依据（为什么只能这么做），下半部分是落地结果与验证边界。
> 使用说明见 README.md。

## 0. 落地记录（相对 v1 方案的差异）

| 项 | v1 方案 | 实际落地 | 原因 |
| --- | --- | --- | --- |
| 目录名 | `dsh-sidebar-run-pulse` | **`dsh-run-pulse`** | 按你的确认 |
| 最终实现方式 | 备选 A：把 `sidebar.workspaces` 包一层 React 组件 | **备选 B：纯 DOM 装饰 + 数据层订阅** | 不注册任何 slot，加载顺序无关；零模块依赖，连 `react` 都不需要 |
| 无头验证 | 未规划 | `src/` 保持 ESM、`client.js` 由脚本从源码打包，四个自检（含产物自检） | 产物形态错了只在浏览器里才炸，必须能在无浏览器环境下兜住 |
| 读屏 | 待确认 | 按「纯装饰、不打扰读屏」实现 | 默认项 |

验证边界（诚实说明）：`npm test` 覆盖状态引擎、DOM 装饰、入口集成，以及**用
`__ModuleLoader__` 桩真实求值产物**；但**尚未在运行中的 GUI 里实测过**——
客户端半边在启动时装载，需要重启 DSH 才会生效，无法在本会话内热加载验证。

---

## 1. 原设计方案（v1，决策依据）


> 目标：当侧边栏的工作区（文件夹）被折叠、或整条侧边栏被折叠成窄条时，
> 只要该文件夹下有会话在运行/等待我操作/有未读完成，文件夹标题行就出现一个
> **呼吸脉动的小圆点**，让人一眼看出「这个文件夹里有东西在动」。
> 不改变原有交互：点击文件夹行仍然是展开/折叠。

---

## 1. 现状与证据（为什么现在看不到）

已核对当前运行时（DSH 0.2.0-rc.2，asar `dsh` 包）的实际实现：

| 事实 | 证据 |
| --- | --- |
| 侧边栏工作区列表由 ui-workspace 填充 `sidebar.workspaces` 这个 **single slot** | `ui-workspace/lib/client.js:4300`、slot 树 `sidebar.workspaces`（`replaceRisk: shadows-shipped-ui`） |
| 每个工作区分组 = 一个 `div`，**没有任何 data-* 或 slot**，只有 CSS Module 哈希类名 `groupSection` 与行属性 `data-row-key="workspace:<key>"` | `ui-workspace/lib/client.js:2482`、`:1288` |
| 折叠组的头部就是 `ProjectRowItem`（文件夹图标 + 标题 + 悬停才出现的操作），**没有可插入的装饰插槽** | 同文件 `:1271` |
| 唯一的行级插槽是 `sidebar.session.row.leading`，它**只在行自己 idle 时渲染**，且属于会话行、不是分组头 | 同文件 `:1624`；ui-workspace README「leading seat renders only while the row's primary status is idle」 |
| 上游明确记载的限制：**待交互状态不会聚合到折叠分组上** | ui-workspace README Known Limitations：「**Pending user interaction is not aggregated into collapsed groups** — a waiting row inside a collapsed group lights no group-header indicator」 |
| 折叠还会隐藏行：默认每个工作区只显示 5 条空闲会话，**运行中的会话额外保留但也会随分组一起折叠** | ui-workspace README「An open Workspace shows five idle, non-blank Sessions by default. Running Sessions … remain visible in their ordered positions without using that quota」 |

**结论**：这个需求在上游是一个「已知空缺」，而它**没有留出可注册的 slot**。
因此唯一可行、且不重写官方 UI 的做法是：**用 `ctx.sessions` / `ctx.workspaces` 的数据层
判定状态，再以 DOM 装饰的方式把标记挂到分组头行上**。

## 2. 数据来源（运行时已确认存在）

| 需要的信息 | 取法 | 字段 |
| --- | --- | --- |
| 工作区清单与成员 | `ctx.get('workspaces').list`（ObservableSnapshot） | `items[].workspaceId / title / path / createdAt / sessionIds`、`archivedSessionIds`、`pinnedSessionIds`（`dsh-api-workspace-controller/lib/client.js:19`、`buildSnapshot()`） |
| 会话元数据 | `ctx.get('sessions').list`（ObservableSnapshot） | `ids`、`byId[id] = { id, displayTitle, running, blank, updatedAt, cwd, parentId, origin, retainedBy }`（`dsh-api-session-controller/lib/types/client/sessions/service.js:492`） |
| 统一运行状态 | 根 slot 标准 hook `useSessionStatus`（数据源 `sessionStatus`） | `Map<sessionId, { running, pendingInteraction: 'approval'\|'plan-review'\|'question', completionUnread }>`（`ui-session/lib/client.js:141`、`:473`、`:483`） |
| 分组头的 DOM 锚点 | DOM 观察 | `[data-row-key^="workspace:"]`（`key` 就是 `workspaceId`，`Ungrouped` 为 `""`） |

判定「文件夹里有动静」的口径（四项都做，按优先级决定表现）：

1. **正在跑**：`status.running === true` 或 `summary.running === true`（含父会话空闲但子代理/后台
   任务在跑的情况，即 `runningChildCount > 0`，与官方 loader 同源）。
2. **等我操作**：`status.pendingInteraction` 为 `approval` / `plan-review` / `question`。
3. **有未读完成**：`status.completionUnread === true`。
4. 归档过滤：归档会话默认不参与（跟随官方 `Hide archived` 语义），可在配置里放开。

## 3. 用户已选定的表现

| 维度 | 决定 |
| --- | --- |
| 效果 | **呼吸/脉动的小圆点**（文件夹标题行尾部，不打断文字） |
| 触发状态 | 正在跑 + 子代理/后台在跑 + 等待审批/回答 + 未读完成（四类） |
| 点击 | **保持默认展开行为**，提示本身纯装饰、不吃点击、不进 tab 焦点 |
| 附加 | 侧边栏收成 56px 窄条时，在窄条上给一个聚合提示（否则整条收起后仍然看不见） |

三态语义（用一个圆点承载，靠颜色+节奏区分）：

* **运行中**：实心圆 + 1.6s 呼吸（`--dsw-alias-state-business-primary`）。
* **等待我**：同位置圆点变警告色（`--dsw-alias-state-warning-primary`），节奏稍快。
* **有未读完成**：静态实心点 + 细描边（`--dsw-alias-state-success-primary`），不脉动。
* 多种并存时取优先级最高的一种，其余以 `title`/`aria-label` 文案说明（如「2 个会话等待你操作」）。
* `prefers-reduced-motion: reduce` 时全部退化为静态点（保留颜色，不做循环动画）。
* 同一文件夹内多个会话同时活动时，圆点带一个极小数字角标（≥2 才显示）。

## 4. 交付形态

```
dsh-sidebar-run-pulse/
├── package.json          # name=dsh-sidebar-run-pulse，dsh.client.platform=web，exports ./client
├── cordis.patch.yml      # - insert: [{ id: sidebar-run-pulse, name: dsh-sidebar-run-pulse }]
├── client.js             # 入口（window.__ModuleLoader__.load，async apply）
├── src/
│   ├── status.js         # 纯函数：workspaces × sessions × sessionStatus → Map<workspaceKey, Marker>
│   ├── decorator.js      # DOM 装饰器：锚点发现、插入、更新、卸载、动画克隆回收
│   ├── marker.js         # React 组件：圆点（props 驱动）+ 根 hook 订阅
│   ├── rail.js           # 窄条聚合提示（sidebar.workspaces 之外的第二落点）
│   └── locale.js         # zh / en 文案
└── README.md             # 安装、配置、验证、故障排查
```

* **只有 Client 半边**：全部逻辑在浏览器侧，`index.js` 缺省导出空 `apply`，
  仅让 profile 的 bundle 列表能把它挂上（对照 `dsh-chatgpt-login` 的双半边结构，
  本插件不需要 Host 服务，因此保留一个极薄 Host 半边以便安装）。
* **注册面**：本插件注册 0 个官方 slot（因为不存在需要的 slot），
  只订阅 `sessionStatus` / `sessions` / `workspaces` 三个数据源。
* **零运行时依赖**：只用 `React.createElement` + `styles.insert` + `ctx.get(...)`，
  与官方「dynamic client package」路径一致。

## 5. 运行机制

```
workspaces.list ─┐
sessions.list   ─┼─► status.js（纯函数，O(会话数)）
sessionStatus   ─┘        │  Map<workspaceKey, {state, count, label}>
                          ▼
                    React 根组件（挂在 sidebar.workspaces 分组之外的一处隐藏挂载点）
                          │  useEffect → decorator.apply(markers)
                          ▼
   [data-row-key^="workspace:"] ─► 在标题行末尾挂 <span class="dsh-rp-dot" data-dsh-rp="running">
                          ▲
                   MutationObserver（子树变化 → 重贴一次，幂等）
```

要点：

1. **幂等更新**：每个锚点元素用 `WeakMap` 记录自己的标记节点，值没变就只改 class/`title`，
   避免每帧重排。
2. **克隆回收**：官方 `AnimatedRows` 在行移动时会克隆节点（克隆体上 `data-row-key` 会被移除，
   `ui-workspace/lib/client.js:1730`），因此观察器需要在下一帧补挂；找不到锚点就静默跳过。
3. **不吃事件**：标记节点 `pointer-events: none`、`aria-hidden="true"`，
   可读信息放在锚点行的 `aria-describedby` 上（或不加，避免干扰读屏——见待确认项）。
4. **不碰官方行为**：不覆写 `sidebar.workspaces`，不拦截点击/拖拽/右键。
5. **降级**：找不到任何锚点、或数据源缺失（`ctx.get` 返回 `undefined`）时，
   插件保持静默（`console.warn` 一次），绝不影响侧边栏本身。

## 6. 配置（`config` schema，走官方 Config 面板）

| 键 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `enabled` | boolean | `true` | 总开关 |
| `states.running` / `pending` / `unread` | boolean | 全 `true` | 分别开关三类触发 |
| `appearance` | `"pulse"` \| `"tint"` \| `"icon"` | `"pulse"` | 圆点脉动 / 整行底色微亮 / 文件夹图标脉动 |
| `showCount` | boolean | `true` | 多点时显示数字角标 |
| `railIndicator` | boolean | `true` | 侧边栏收成窄条时给出聚合提示 |
| `includeArchived` | boolean | `false` | 归档会话是否参与判定 |

主题颜色全部走官方 token（`--dsw-alias-state-*`、`--ds-ease-in-out`），
因此浅色/深色主题自动跟随，不需要硬编码颜色。

## 7. 安装与验证

安装（与现有 `dsh-chatgpt-login` 完全相同的路径）：

1. `~/.dsh/profiles/desktop/package.json` → `dependencies` 加
   `"dsh-sidebar-run-pulse": "link:/Users/yakutsukuriyuu/Documents/Harness/dsh插件制作/dsh-sidebar-run-pulse"`，
   `dsh.profile.bundles` 里加 `dsh-sidebar-run-pulse`；
2. `~/.dsh/profiles/desktop/cordis.patch.yml` 末尾加 `- id: sidebar-run-pulse \n  disabled: false`；
3. 用 DSH 自带插件管理器或 `pnpm install` 建链接，重启会话后生效。

验证清单：

* 起一个长任务会话 → 收起它所在的工作区 → 文件夹标题行出现脉动点；任务结束点消失。
* 折叠状态下有审批请求 → 点变警告色。
* 侧边栏整体收成窄条 → 窄条上仍能看到聚合提示。
* `prefers-reduced-motion` 打开 → 变成静态点。
* 关闭插件 → 页面完全恢复原样，无残留节点（卸载时清空所有标记与观察器）。

## 8. 风险与缓解

| 风险 | 等级 | 缓解 |
| --- | --- | --- |
| 依赖 CSS 哈希类名（`groupSection` 等）在升级后改名 | 中 | 只用 **标准 DOM 属性** `[data-row-key^="workspace:"]` 定位；类名只作为兜底，且从实际样式表里动态解析，不做硬编码 |
| 官方将来给分组头加了真正的 slot | 低 | 一旦 `Slots` 里出现 `sidebar.workspaces.group.*` 之类的新座位，改走 slot 注册（本设计把状态计算层独立成 `status.js`，切换成本极低） |
| React 卸载时留下孤儿节点 | 中 | 观察器断开 + 遍历清理 + `ctx.effect` 返回清理函数；插件禁用时二次校验 |
| 行拖拽/动画克隆导致标记闪烁 | 低 | 幂等补挂 + 克隆体不带锚点属性直接跳过 |
| 数据源字段变动（`sessionStatus` 快照形状） | 低 | 全部读取做存在性判断，字段缺失按 `idle` 处理并 warn 一次 |

## 9. 实施阶段

1. **P1 骨架**：package.json / cordis.patch.yml / 入口 + 一个「状态自检」调试输出，确认
   `workspaces.list`、`sessions.list`、`useSessionStatus` 三者在插件侧都能读到。
2. **P2 最小可见**：DOM 装饰器 + 运行态脉动点（先只做 `running`）。
3. **P3 完整语义**：等待审批/回答、未读完成、数字角标、reduced-motion。
4. **P4 配置与文案**：config schema + zh/en。
5. **P5 窄条聚合提示** + P6 卸载清理与降级演练。

## 10. 待你确认的两点

1. **命名**：`dsh-sidebar-run-pulse`（当前方案）还是更短的 `dsh-run-pulse`？目录名会即定即用。
2. **无障碍**：脉动点是否需要给读屏用户也播报（在文件夹行上加 `aria-describedby`）？
   默认我按「纯装饰、不干扰读屏」实现。
