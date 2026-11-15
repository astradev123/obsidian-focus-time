# Focus Time 升级计划（v1.3.x → v2.0）

> 目标：把 Focus Time 从一个"按笔记累计时长的计时器"升级成"可信的专注数据采集 + 可分析的个人专注系统"。
> 约束：不破坏任何已有用户数据；Obsidian 桌面端与移动端都能跑；多设备同步不产生冲突。

---

## 0. 目标与非目标

### 目标

1. **数据可信**：挂机、睡眠、切窗口不再产生虚假时长；每条时长能追溯到一段真实会话。
2. **存储可扩展**：写入量与数据总量解耦，历史再长也不拖慢启动和同步。
3. **同步无冲突**：多设备各写各的，冲突在结构上不可能发生。
4. **分析有深度**：从"每天多少分钟"扩展到会话质量、时段、目录、目标、趋势、异常。
5. **界面成体系**：统一设计 token，适配明暗主题与移动端，不再是零散样式。
6. **升级无感**：老用户打开即迁移，失败可回滚，混版不丢数据。
7. **文案可国际化**：所有面向用户的文案走语言包，新增语言不改代码，默认跟随 Obsidian/系统语言。

### 非目标

- 不做云端账号体系，不引入服务端。
- 不做团队协作/共享看板（可作为后续插件生态）。
- 不引入 SQLite 等二进制数据库（移动端不可用、同步不可合并）。
- 不默认改写用户笔记的 frontmatter（作为可选能力）。

---

## 1. 现状与约束

### 1.1 数据审计结论（基于真实 vault）

| 项目 | 数值 |
|---|---|
| `data.json` | 196 KB，779 条笔记记录 |
| `data/` 日文件 | 423 个，1.7 MB，2468 条日记录 |
| 累计时长 | 149.4 小时 |
| 命名不一致 | 69 个补零、354 个不补零 |
| 重复 fileId | 11 个被多条路径共用 |
| 旧字段 | 10 条用 `id` 而非 `fileId` |
| 静默丢失 | 5.7 小时（3.8%）无法映射；其中 34 分钟落在 `"undefined"` 键 |
| 写入放大 | 每 6 秒全量读写 `data.json`，24 小时约 2.8 GB |

### 1.2 平台约束

- **Obsidian Sync 只跟踪插件目录里的 4 个文件**：`data.json`、`main.js`、`styles.css`、`manifest.json`（1.6.0 起）。插件目录里的其他数据文件不同步。
- 因此事件日志必须放在 **vault 内**，否则 Sync 用户的数据不会跨设备。
- 移动端没有 Node/Electron API，只能用 `DataAdapter`、`Vault`、DOM。
- `DataAdapter.append()` 提供追加写；`DataAdapter.process()` 提供原子读改写。
- 插件卸载时必须释放所有监听与定时器，统一用 `registerEvent` / `registerInterval` / `registerDomEvent`。
- 插件私有目录不在 Vault 索引内，只能用 adapter 访问；vault 内文件优先用 Vault API。

---

## 2. 目标架构

### 2.1 目录布局

```
<vault>/_focus_time/                     # vault 内，参与同步；路径可配置
  events/
    2026-11.mac-7f3a.jsonl               # 月 + 设备分片，只追加
    2026-11.iphone-2c91.jsonl
  notes.json                             # noteId ↔ 路径注册表
  meta.json                              # schemaVersion、deviceId、迁移状态
  goals.json                             # 目标与偏好（可选合并进 data.json）
  archive/
    v0-2026-11-15T12-30/                 # 迁移前原样备份，只读
    conflicts/                           # 同步冲突副本归档
  reports/
    migration-2026-11-15.json            # 迁移报告

.obsidian/plugins/focus-time/
  data.json                              # 只放设置
  wal.mac-7f3a.jsonl                     # 本地崩溃缓冲，不同步
```

**为什么分片到月 + 设备**

- 两台设备永远不写同一个文件 → 写-写冲突不可能发生。
- 单文件上限约 200–250 KB/月 → Sync 每次上传成本可控。
- 月份结束后文件不再变化 → 历史永久稳定，适合 Git/版本快照。

### 2.2 事件模型

一行一个事件，JSONL。`ms` 是权威时长，`start/end` 用于展示与时段分析。

```ts
type EventBase = {
  v: 1;
  id: string;        // ULID，可排序、全局唯一
  dev: string;       // 设备短 id，如 mac-7f3a
  at: number;        // 写入时间 epoch ms
};

type SessionEvent = EventBase & {
  type: "session";
  ses: string;       // 会话 id；跨午夜切段共用同一 ses
  note: string;      // noteId
  path: string;      // 采集时路径，仅作提示；可配置关闭
  start: number;     // 段开始 epoch ms（本地墙钟）
  end: number;       // 段结束 epoch ms
  ms: number;        // 有效时长，由单调时钟差值累计
  kind: "edit" | "read";
  idle: "guard" | "off";  // 采集时的空闲策略，用于口径标注
  tz: string;        // 如 Asia/Shanghai
};

type AdjustEvent = EventBase & {
  type: "adjust";    // 手动扣减/补录/排除可疑段
  target: string;    // 事件 id 或 noteId
  ms: number;        // 可正可负
  reason: "idle" | "manual" | "suspect" | "merge";
};

type RenameEvent = EventBase & {
  type: "rename";
  note: string;
  from: string;
  to: string;
};

type LegacyDayEvent = EventBase & {
  type: "legacyDay"; // v0 日粒度数据，无会话时间
  key: string;       // hash(date + noteId + ms)，跨设备去重
  note: string;
  date: string;      // YYYY-MM-DD
  ms: number;
  src: "v0";
};

type LegacyTotalEvent = EventBase & {
  type: "legacyTotal"; // data.json 中有、日文件里没有的早期时长
  note: string;
  ms: number;
  src: "v0-readData";
};
```

### 2.3 写入路径（四层）

| 层 | 时机 | 目的 | 代价 |
|---|---|---|---|
| 内存 | 每次结算 | 零成本累计 | 0 |
| WAL（插件目录） | 每 15 秒有脏数据 | 崩溃恢复 | 追加几十字节，本地 |
| 同步分片（vault） | 每 3–5 分钟、失焦、隐藏、退出 | 跨设备 | 追加 ≤ 几百字节 |
| `data.json` | 用户改设置时 | 设置同步 | 几 KB，一天几次 |

**追加实现要点**

```ts
// 追加，不读旧内容
await adapter.append(shard, lines.map(e => JSON.stringify(e) + "\n").join(""));
```

- 写入前检查文件末尾是否有换行；没有则先补 `\n`，避免残行与新事件粘连。
- 读取时逐行 `JSON.parse`，坏行跳过；断电最多损失最后一批（≤ 15 秒）。
- 启动时先回放 WAL 到分片，按事件 `id` 去重，再用 `process()` 原子清空 WAL。
- 冲突副本（`sync-conflict`、`conflicted copy`、`xxx 2.jsonl`）扫描导入后移到 `archive/conflicts/`。
- `meta.json`、`notes.json` 用 `process()` 原子读改写；`meta.json` 最后写，作为迁移提交标记。

### 2.4 读取与索引

- 启动时只加载 `meta.json` + `notes.json` + 当前月分片，首屏可用。
- 其余月份按需懒加载；索引结构：
  - `byDay: Map<date, DayAgg>`
  - `byNote: Map<noteId, NoteAgg>`
  - `byHour: number[24][7]`
  - `sessions: Session[]`（仅当前查询区间）
- 聚合优先用 `ms`，不要用 `end - start`（时钟跳变时会不一致）。
- 派生 rollup 暂不落盘；超过 5 万事件后再引入可重建的缓存（带 sourceHash）。
- 跨设备重叠检测：同一用户两台设备同时活跃时，可选出"去重后的专注"口径；默认展示总投入，重叠 > 1% 时在面板提示。

### 2.5 身份与改名

- `noteId`：首次见到某路径时生成 ULID，写入 `notes.json`；路径只作提示。
- 改名：追加 `rename` 事件，不重写历史；查询时按时间线解析路径。
- 删除后重建同名文件：新 noteId（正确语义）；提供"合并笔记记录"命令处理误判。
- 旧数据：保留原数字 id，加前缀 `legacy:`，保证历史连续。
- `deviceId`：写入 `meta.json`，同时存 localStorage；启动时比对，不一致则重新生成（防止同步导致两台设备同 id）。

---

## 3. 时间追踪规则

### 3.1 结算算法

核心原则：**结算到最后一次真实操作 + 阈值；检测到空闲的时刻不等于停止计时的时刻。**

```ts
const cutoff = Math.min(now, lastInputAt + idleMs);
const delta = cutoff - accruedUntil;
if (delta > 0) accrue(delta);
accruedUntil = cutoff;

if (now - lastInputAt > idleMs) {
  closeSegment(lastInputAt + idleMs, "idle");
  accruedUntil = now;          // 恢复时不补空档
}
```

补充规则：

- 增量用 `performance.now()` 计算，时间戳用 `Date.now()`；两者偏差 > 5 秒视为系统时间被改，切段。
- 单次 `delta` 超过 2 倍心跳间隔视为睡眠/节流，丢弃超出部分。
- 跨本地午夜时把段拆成两条 `session` 事件，共用 `ses`，`ms` 按毫秒精确分配。
- 切笔记时以切换时刻结算上一段，不再等下一次心跳。
- 窗口失焦、`visibilitychange` 为 hidden 时立即结算并暂停。

### 3.2 空闲策略（用户可配）

| 模式 | 行为 | 适用 |
|---|---|---|
| `off` | 不检测空闲，窗口在前台就一直计时 | 明确知道自己会长时间阅读/演示 |
| `fixed` | 统一阈值，默认 5 分钟 | 默认 |
| `perMode` | 编辑阈值（默认 5 分钟）+ 阅读阈值（默认 10 分钟） | 大量 PDF/长文阅读 |
| `custom` | 1–120 分钟任意值 | 进阶 |

规则：

- **"一直没输入"不等于挂机**：纯阅读场景用更长的阅读阈值，滚动、翻页、选中、复制、方向键都算活动。
- **关闭空闲检测允许存在，但数据要诚实**：事件里记 `idle: "off"`，仪表盘对这批数据加口径标注，体检面板提示"可能包含挂机时长"。
- **临时豁免**：状态栏提供"保持计时 30 分钟"，适合精读长文，比全局关掉安全。
- 默认值建议：编辑 5 分钟、阅读 10 分钟。1 分钟太激进（思考会被切断），30 分钟太宽松。
- 阈值改动只影响之后的数据，不改历史。

### 3.3 会话与质量信号

- 会话（`ses`）= 连续专注同一笔记；切笔记、空闲、失焦超阈值、跨午夜都结束当前段。
- `kind`：段内发生过编辑 → `edit`；否则 `read`（PDF、阅读视图天然为 read）。
- 每段记录输入次数与 `activeRatio`（有效时长 / 段跨度），用于：
  - 可疑段标记：`ms > 90 min && inputs < 5`；
  - 深工作判定：`ms ≥ 25 min`；
  - 上下文切换：单位活跃小时内的笔记切换次数。

### 3.4 修正机制

- 手动暂停 / 继续（状态栏）。
- 撤销上一段（写入 `adjust` 负值）。
- 仪表盘"可疑段"列表，一键排除。
- 补录：手动添加一段（`adjust` 正值 + 时间范围）。
- 所有修正都是追加事件，原始记录永不修改，可审计、可撤销。

---

## 4. 迁移方案

### 4.1 原则

1. **自动触发，但不阻塞**：检测不到 `meta.json` 即后台迁移，Notice 显示进度；计时功能同时可用。
2. **只写新格式，永久双读**：读层始终合并"v1 事件 + 未导入的 v0 日文件"；迁移状态只决定是否继续扫描 v0。
3. **不双写**：双写会重新引入"两台设备写同一个当日文件"的冲突源。
4. **非破坏**：只复制不移动，v0 文件保留为只读归档。
5. **可验证**：迁移后任意笔记总时长不得小于迁移前。
6. **可回滚**：保留 `archive/v0-*` 与回滚命令。

### 4.2 步骤

1. **检测**：`meta.json` 不存在 → 状态 `legacy`。
2. **备份**：复制 `data.json` 与 `data/` 到 `archive/v0-<ISO>/`，记录文件数与时长的基线。
3. **导入**：
   - 扫描 `data/*.json`，兼容 `2026-1-5` 与 `2026-01-05` 两种命名；同日重复则相加并报告。
   - 每笔记每天生成一条 `legacyDay`，`key = hash(date + noteId + ms)`。
   - `data.json` 中比日文件多出的时长生成 `legacyTotal`（无日期）。
   - `"undefined"` 与无法映射的记录进入 `unmapped` 桶，在质量面板可见。
4. **校验**：按笔记、按天对比迁移前后总量；差值必须为 0（`unmapped` 单独列出）。
5. **提交**：写 `meta.json`（`schema: 1`、`migratedAt`、统计摘要）。
6. **报告**：生成 `reports/migration-<date>.json`，设置页可查看。

### 4.3 混版兼容

- 旧版本设备继续写 `data/<date>.json`：新版本启动时扫描未导入文件（按 `key` 幂等），自动吸收。
- 旧版本看不到新事件：属于预期，不丢数据；升级后自动补全。
- 同一份日文件被 iCloud 同步到两台设备：`key` 相同，合并去重。
- 两台设备各自独立记录：`key` 不同，正常相加。

### 4.4 失败与回滚

- 校验不一致 → 不写 `meta.json`，状态保持 `legacy`，插件继续用旧数据工作。
- 提供命令"回滚到 v0 存储"：删除/忽略 v1 事件，恢复读 v0；`data.json` 从未被改写。
- 断电/崩溃：迁移可重入，已导入文件按 `key` 去重，不会重复计数。

---

## 5. 仪表盘 v2

### 5.1 形态

- 从 Modal 改为自定义 `ItemView`（`registerView`），可在标签页打开、可多开、移动端友好。
- 命令面板 + Ribbon + 状态栏三处入口。
- 布局：顶部周期切换 + KPI 行 + 主图表区 + 明细区 + 洞察区。
- 移动端：底部标签栏，单列，图表简化。

### 5.2 信息架构

```
概览 Overview
  今日 / 本周 / 本月 / 今年 / 全部 / 自定义
  KPI：专注时长、会话数、平均会话、深工作占比、连续天数、目标完成率
  趋势图（堆叠：编辑 / 阅读）+ 目标线
  日历热力图（53 周）
  洞察卡片（最多 4 条）

趋势 Trends
  日 / 周 / 月粒度切换
  7 日移动平均
  与上期对比
  时段分布（24 × 7 热力）

笔记 Notes
  区间排行榜（修复 #5）
  每篇：总时长、会话数、最近活跃、sparkline
  点击打开笔记 / 查看明细抽屉

分类 Categories
  目录树聚合（可折叠）
  标签聚合（读取 metadataCache）
  占比与趋势

质量 Quality
  未映射时长、legacy 记录、重复 id、可疑段、跨设备重叠
  一键修正 / 排除 / 合并
```

### 5.3 指标定义

| 指标 | 定义 | 数据来源 |
|---|---|---|
| 专注时长 | Σ `session.ms` + `adjust.ms` | events |
| 编辑 / 阅读占比 | 按 `kind` 汇总 | events |
| 会话数 | distinct `ses` | events |
| 平均 / 中位会话 | 按 `ses` 聚合 | events |
| 深工作占比 | `ms ≥ 25 min` 的时长 / 总时长 | events |
| 上下文切换 | 笔记切换次数 / 活跃小时 | events |
| 专注天数 | 当日 ≥ 5 分钟 | events + legacyDay |
| 连续天数 | 达标日连续计数 | goals |
| 目标完成率 | 实际 / 目标 | goals |
| 回访率 | 7 天内再次打开的笔记占比 | events |
| 高峰时段 | 24×7 矩阵中位时长 Top 3 | events |
| 数据质量 | unmapped / legacy / adjust 占比 | ledger |

口径说明：

- `legacyDay` 只有日粒度，参与总量与日历，不参与会话/时段指标；相关图表标注"自迁移起"。
- `idle: "off"` 的段单独标记，可切换"包含/排除宽松计时"。

### 5.4 图表清单

| 图 | 类型 | 交互 |
|---|---|---|
| 专注趋势 | 堆叠柱 + 目标线 + 移动平均 | 点击下钻到日/周 |
| 日历热力图 | 53 周网格 | hover 详情，点击进日视图 |
| 时段分布 | 24×7 热力 | hover 显示中位时长 |
| 会话长度 | 直方图（0-5/5-15/15-30/30-60/60+） | 点击筛选 |
| 目录分布 | 横向条形 Top 10 | 点击过滤 |
| 笔记排行 | 列表 + sparkline | 区间切换、打开笔记 |
| 目标进度 | 环形进度 | 点击改目标 |

技术决策：**不引入图表库**，沿用自绘 SVG + React。理由：包体、主题一致性、移动端性能可控；当前 `main.js` 已 226 KB，不再增重。

### 5.5 洞察（规则引擎）

按显著性排序，最多展示 4 条：

- 本周 vs 上周变化（±%）。
- 最专注时段（如"周三 9–11 点"）。
- 最长连续达标天数。
- 增长最快的目录/标签。
- 可疑段数量与总时长。
- 目标完成/未完成提醒。
- 长期未回访的重要笔记。

不调用 LLM，纯规则，保证离线、可解释。

### 5.6 视觉规范

- 全部颜色改用 Obsidian CSS 变量：`--text-normal`、`--background-secondary`、`--background-modifier-border`、`--interactive-accent` 等；清除现有 20+ 处硬编码色值。
- 自定义 token：`--ft-space-1..6`（4/8/12/16/24/32）、`--ft-radius-sm/md/lg`（6/10/14）、字号 11/12/13/14/16/20/24。
- 卡片：1px 边框 + 12px 圆角 + 无阴影，贴合 Obsidian 原生观感。
- 配色语义：专注=accent，阅读=蓝，深工作=琥珀，异常=红；不靠颜色单独传达信息。
- 动效：120–180ms ease-out，尊重 `prefers-reduced-motion`。
- 空状态、加载骨架、错误态统一组件。
- 无障碍：对比度 ≥ 4.5:1、键盘可达、`aria-label`、焦点环。

### 5.7 性能预算

- 冷启动索引 5 年数据：桌面 < 300 ms，移动 < 800 ms。
- 仪表盘首屏：< 200 ms。
- 迁移：分片处理（每帧 ≤ 20 个文件），主线程单次阻塞 < 50 ms。
- 内存：10 万事件 < 30 MB。

---

## 6. 国际化（i18n）

### 6.1 现状

- 只有 `en` / `zh` 两个语言包，各 47 个 key，扁平命名。
- 语言检测用 `moment.locale()`，跟随 Obsidian 界面语言（默认跟随系统），只取语言基码（`zh-CN` → `zh`）。
- 问题：
  - 缺 key 时直接 `undefined.replace` 抛错，没有回退链。
  - 5 处硬编码英文：`BarChart` 空状态、`StatisticsView` 的 "Unknown"、`dashboardModal` 的 "File not found"、命令名 "Open dashboard"。
  - 没有复数、日期、数字、时长的本地化格式；周起始日固定。
  - 语言切换不会触发已打开视图重渲染。

### 6.2 目标

- 面向用户的文案 100% 走 i18n，包括命令、设置、通知、错误、空状态、图表标签、洞察。
- 语言选择：跟随 Obsidian（默认）/ 手动指定；切换后立即生效。
- 语言包可增量扩展，新增语言不改代码。
- 日期、时间、数字、时长、复数、周起始日按 locale 正确显示。
- 为 RTL 语言预留（CSS 逻辑属性、`dir`）。

### 6.3 架构

```
src/language/
  i18n.ts
  locale/en.json
  locale/zh.json
  locale/zh-TW.json
  locale/ja.json
  ...
```

- **key 命名空间**：`dashboard.kpi.focusTime`、`settings.idle.title`、`notice.migration.done`。
- **嵌套 JSON**，运行时按点路径解析；构建期可扁平化。
- **回退链**：`zh-TW` → `zh-Hant` → `zh` → `en`；`pt-BR` → `pt` → `en`；最终 `en`。
- **缺 key**：回退 `en`；`en` 也缺则返回 key 本身并在 dev 环境 `console.warn`，绝不抛错。
- **插值**：`{count}`、`{minutes}`；禁止把句子拆成多段拼接（语序会变）。
- **复数**：`Intl.PluralRules`，key 形如 `sessions_one` / `sessions_other`；无复数语言只写 `_other`。
- **日期/时间**：`Intl.DateTimeFormat`；周起始日用 `moment.localeData().firstDayOfWeek()`（跨平台稳定）。
- **数字**：`Intl.NumberFormat`。
- **相对时间**：`Intl.RelativeTimeFormat`。
- **时长**：统一 `formatDuration(ms, { style: "short" | "long" })`，中英分别输出 "2h 14m" / "2 小时 14 分钟"。
- **洞察与规则引擎**返回 `{ key, params }`，由视图渲染，不在逻辑层拼句子。

### 6.4 语言与切换

- 设置项：语言 = 跟随 Obsidian / English / 简体中文 / 繁體中文 / 日本語 / 한국어 / …
- 默认「跟随 Obsidian」，沿用 `moment.locale()`；保留完整 tag（`zh-TW`、`pt-BR`）。
- 切换后 I18n 发出 `language-change`，打开的仪表盘与设置页重渲染，无需重启。
- 语言偏好存 `data.json` 的 settings，不写入事件。

### 6.5 语言批次

| 阶段 | 语言 | 说明 |
|---|---|---|
| 现有 | `en`、`zh-CN` | 保持 |
| 第一批 | `zh-TW`、`ja`、`ko` | 用户量大，术语接近 |
| 第二批 | `de`、`fr`、`es`、`pt-BR`、`ru` | 社区翻译 |
| 预留 | `ar`、`he` | RTL，需布局验证 |

### 6.6 翻译流程

- 仓库内 JSON + PR；新增 `docs/i18n.md` 写术语表与上下文说明。
- `scripts/check-i18n.mjs` 检查：
  - key 与 `en` 完全对齐（缺/多都报错）；
  - 占位符集合一致；
  - 空值与重复 key；
  - `.tsx` 中不得出现中文字面量（白名单除外）。
- CI 跑 `npm run i18n:check`；发布前生成翻译完成度表。
- 翻译量变大后接 Crowdin（开源免费）或 Weblate，JSON 格式不变。

### 6.7 验收

- 切换任意语言，界面无英文残留、无 `undefined`、无 key 原文。
- 德语（文本膨胀约 30%）下卡片与按钮不溢出。
- 缺 key 时回退 `en`，控制台仅 dev 警告。
- 周起始日、12/24 小时制、日期格式随 locale 变化。
- 用伪 locale（`en-XA`）跑一遍，能发现截断与句子拼接问题。

## 7. 里程碑

### M0 · v1.3.x 止血（不换存储）

范围：

- 空闲检测 + 设置（`off` / 固定阈值 / 自定义）。
- 结算改为 delta + cutoff，切笔记精确结算，跨午夜切分。
- 写入降频：心跳不再全量写 `data.json`；`data.json` 只在设置变更时写。
- 日文件改用 `process()` 原子读改写。
- 修复 `"undefined"` fileId：新笔记先建 id 再写；历史 `undefined` 进 `unmapped`。
- 日期格式统一为零填充，读取兼容两种；同日重复相加。
- 重复 fileId 检测与拆分；旧 `id` 字段兼容。
- 资源清理：`registerInterval` / `registerDomEvent`；移除 3 秒 `stat` 轮询，改用 `onExternalSettingsChange`。
- 状态栏显示暂停原因（失焦/空闲/手动）。
- i18n 基础设施：回退链、命名空间 key、`formatDuration` / `formatDate` / `formatNumber`、`language-change` 事件。
- 清掉 5 处硬编码文案；47 个 key 迁到命名空间结构；CI 加 `i18n:check`。
- 设置项加「语言」：跟随 Obsidian（默认）/ 手动指定。

验收：

- 挂机 2 小时 → 计入 ≤ 阈值 + 1 个心跳。
- 睡眠 8 小时 → 0。
- 连续切笔记 100 次 → 累计丢失 < 1 秒。
- 8 小时使用写入量 < 10 MB。
- `kill -9` 模拟断电 → JSON 不损坏，最多丢最后一批。
- 423 个真实日文件解析结果与迁移前一致。
- 切换中英，界面无硬编码英文；缺 key 不抛错。

### M1 · v1.4 存储 v1 + 迁移

范围：

- 目录布局、事件 schema、WAL、月+设备分片。
- 读层索引 + 双读（v1 事件 + v0 日文件）。
- 迁移器：备份 / 导入 / 校验 / 提交 / 报告 / 回滚。
- 冲突副本处理、设备 id 校验、`notes.json` 注册表。
- 数据质量面板（基础）。
- 迁移报告、通知、质量面板文案全部走语言包。

验收：

- 迁移前后每笔记每天总量完全一致；`unmapped` 单独可见。
- 两台模拟设备并发 24 小时 → 0 个冲突文件。
- 回滚后旧版本仍能读出全部 v0 数据。
- 5 年数据冷启动索引 < 300 ms。
- Beta 期（BRAT）至少 2 周、10 名用户无数据事故。
- 迁移报告在中英下字段名与单位正确。

### M2 · v1.5 追踪 v2 + 仪表盘 v2

范围：

- 会话化、`kind`、可疑段、`adjust` 事件、手动暂停/撤销/补录。
- 分析 API 与全部指标；`legacyDay` 口径隔离。
- 仪表盘重做为 `ItemView`：概览 / 趋势 / 笔记 / 分类 / 质量。
- 新图表：热力图、时段、直方图、目录、目标环。
- 洞察规则引擎。
- 设计 token 与明暗主题适配；移动端布局。
- 仪表盘全部文案走 key；日期、周起始日、数字、时长按 locale 格式化。
- 洞察规则返回 `{ key, params }`；语言切换即时重渲染。

验收：

- 指标 golden tests 全部通过。
- 首屏 < 200 ms，移动端滚动无明显掉帧。
- 明暗主题下无硬编码色值（CI grep 检查）。
- 键盘可完成主要操作。
- 切换任意语言无 `undefined`/key 原文；德语下布局不溢出。

### M3 · v2.0 深化与生态

范围：

- 目标与连续天数、周报生成、CSV/JSON/Markdown 导出。
- `focus-time` 代码块（在笔记里嵌入统计）。
- 可选 frontmatter 写入（`focus_total`、`focus_7d`），手动或每日一次。
- 分模式空闲阈值（编辑 / 阅读）。
- 可选番茄钟与提醒。
- 文档、迁移指南、数据格式说明。
- 首批语言 `zh-TW` / `ja` / `ko`，第二批 `de` / `fr` / `es` / `pt-BR` / `ru`。
- `docs/i18n.md` 术语表与翻译指南；发布前生成完成度表。
- 无障碍与 i18n 完整度检查；RTL 预研（逻辑属性、`dir`）。

验收：

- 导出可被 Excel/pandas 直接消费。
- 代码块在阅读视图与导出 PDF 中正常渲染。
- 新用户首次使用 3 分钟内能看到有效数据。
- 首批语言完成度 ≥ 95%，缺项全部回退英文。

---

## 8. 测试矩阵

**单元（Vitest）**

- 空闲结算：无输入、临界值、恢复不补空档。
- 跨午夜切分：23:59:30–00:00:30。
- 时钟跳变、睡眠、定时器节流。
- 聚合：按天/周/月/年、跨时区。
- 迁移：422 个文件、重复 id、双格式日期、`undefined`、损坏 JSON。
- 去重：内容哈希、事件 id、冲突副本。

**i18n**

- key 与占位符对齐、复数分类、伪 locale（`en-XA`）膨胀与截断。
- 时长/日期/数字格式在各 locale 的快照。

**集成**

- 内存版 `DataAdapter`（实现 append/read/process/list/stat）跑完整写入路径。
- 双设备模拟：并发追加、冲突副本导入、WAL 回放。

**Golden**

- 匿名化真实 vault 作为 fixture，迁移前后总量对账。

**手动**

- macOS / Windows / iOS / Android。
- Obsidian Sync / iCloud / Dropbox / Git。
- 明暗主题、0 条/1 条/10 万条数据。

---

## 9. 风险与对策

| 风险 | 影响 | 对策 |
|---|---|---|
| 用户误删/编辑 vault 内数据文件 | 数据损坏 | 启动校验、`.jsonl` 只追加、修复命令、归档备份 |
| Sync 排除了数据目录 | 不同步 | 设置页检测提示、文档说明、可改路径 |
| 混版设备写 v0 | 新数据不可见 | 永久双读 + 增量导入 |
| 迁移中断 | 半迁移 | 幂等 + `meta.json` 最后写 + 可回滚 |
| 事件日志膨胀 | 启动变慢 | 按月懒加载、超阈值启用可重建缓存 |
| 移动端性能 | 卡顿 | 分片索引、虚拟列表、图表降采样 |
| 范围蔓延 | 版本失控 | 每期功能开关，M3 项默认关闭 |
| 隐私（路径出现在数据里） | 泄露目录名 | 提供"不记录路径"选项，仅存 noteId |
| 文案膨胀（德语约 +30%） | 布局溢出 | 弹性宽度、伪 locale 测试、按钮不固定宽 |
| 缺翻译/占位符不一致 | 崩溃或语句错乱 | CI 检查、回退链、禁止拼接句子 |
| 地区变体（`zh-TW`、`pt-BR`） | 显示成错误变体 | 完整 tag + 回退链 |

---

## 10. 待定问题

1. 数据目录默认名：`_focus_time` 还是 `Focus Time`？（前者排序靠后、不易误碰）
2. 空闲默认值：编辑 5 分钟 / 阅读 10 分钟是否合适？
3. 是否默认在事件中记录路径？关闭后跨设备只能显示 noteId，需要注册表同步。
4. 目标默认值：每日 60 分钟？还是不设默认、首次引导填写？
5. `legacyDay` 在趋势图中是否显示为浅色柱，还是仅计入总量？
6. 首批语言是否就按 `zh-TW` / `ja` / `ko` 起步？
7. 语言默认严格跟随 Obsidian，还是首次启动让用户选一次？
8. 翻译走仓库 PR，还是直接接 Crowdin？
