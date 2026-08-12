# 童蹊幼儿成长平台 · UI 风格原型模板（纯静态演示系统）

从现有系统（PC 管理后台 + 移动端）抽离出的 **UI 风格规范 + HTML 原型演示系统**。

- **纯静态**：无后端、无构建、零依赖，浏览器 `file://` 直接打开即可演示
- **分角色演示**：家长 / 教师 / 园长 / 后勤 / PC 管理后台
- **数据交互**：PC 侧边栏动态菜单 + TagsView 联动（教师表格增删改 + 搜索）；移动端通知列表已读 / 全部已读 / 新增
- **数据持久化**：交互数据 + 菜单/TagsView 状态（标签、激活、父级展开）存 localStorage，刷新保留；可"重置为默认数据"

## 目录导航

```
ui-style-prototype/
├─ index.html                    ← 演示入口：5 张角色卡选择进入（从这里开始！）
├─ README.md                    ← 本文件（入口说明）
├─ docs/
│  └─ UI风格规范.md              ← 完整风格规范（设计令牌 + 两端规范 + 使用说明）
├─ assets/
│  ├─ css/
│  │  ├─ tokens-pc.css          PC 设计令牌（:root CSS 变量）
│  │  ├─ tokens-mobile.css      移动端设计令牌（:root CSS 变量）
│  │  ├─ base-pc.css            PC 布局骨架 + 组件类（pc- 前缀）
│  │  ├─ base-mobile.css        移动端布局骨架 + 组件类（mb- 前缀）
│  │  ├─ common.css             reset、工具类
│  │  └─ demo.css               演示层控件（角色切换浮钮/面板/底部弹层）
│  └─ js/
│     ├─ data-store.js          数据层（window.DS：mock 种子 + localStorage + 订阅）
│     ├─ prototype.js           通用交互库（弹窗/折叠/tab/分页/toast）
│     └─ demo.js                页面渲染 + 业务交互（角色注入 + 各页 render）
├─ pc/                           PC 端管理后台模板
│  ├─ list.html                 管理台外壳：动态菜单 + TagsView 联动；默认教师管理（搜索 + 增删改）
│  ├─ form-dialog.html          表单 / 弹窗专项 + 提交记录（数据驱动）
│  └─ snippets.html             可复制代码片段合集（静态，不接数据层）
└─ mobile/                       移动端模板（独立全屏，非手机壳）
   ├─ home.html                 角色化首页：hero + 宫格 + tabBar（按角色渲染）
   ├─ list.html                 通知列表：筛选 + 已读/全部已读 + 新增（数据驱动）
   ├─ mine.html                 我的页：用户信息 + 菜单 + tabBar（按角色渲染）
   └─ snippets.html             可复制代码片段合集（静态，不接数据层）
```

## 快速开始（演示路径）

1. **打开入口**：双击 `index.html`，看到 5 张角色卡（家长/教师/园长/后勤/管理后台）。
2. **选角色进入**：点击卡片 → 跳转对应首页。
   - 移动端角色（家长/教师/园长/后勤）→ `mobile/home.html`，hero / 功能宫格 / 底部 tabBar 按角色不同。
   - 管理后台 → `pc/list.html`（管理台外壳，默认展示「教师管理」）。
3. **操作与持久化**：
   - 移动端 `list.html`：点击未读条目→已读（橙边消失）；"全部已读"批量置读；"新增通知"底部弹层写一条。
   - PC `list.html`：**左侧菜单按角色动态渲染（父子级、无图标，父级仅 hover 高亮）**，点击父级展开/收起、点击子级选中；选中菜单 → TagsView 自动新增并激活标签（标签保持打开顺序，点击仅切换高亮），面包屑 / 内容区同步切换；TagsView 支持 × 关闭、右侧 ▾ 批量（关闭其他/关闭全部）。
   - PC `list.html` 教师管理：搜索姓名/手机号/班级过滤；新增弹窗填表提交；行内编辑回填保存；行内删除 / 勾选批量删除。
   - **刷新页面** → 数据与菜单/TagsView 状态保留（localStorage 生效）。
4. **角色切换 / 重置**：页面右下角 ⚙ 浮钮 → 切换角色（整页跳转）→ 重置演示数据（保留当前角色）→ 返回入口。

## 移动端预览提示

- 移动端模板为**独立全屏页面**（宽度 100%），与小程序/H5 打开效果一致。
- 桌面浏览器预览时，可给 `<body>` 加 `class="preview-mobile"` 居中限宽 480px（可选）。

## 架构说明（新增页面如何接入）

三层结构：**HTML 骨架容器 + data-store.js（数据层）+ demo.js（渲染/交互）**。

做新原型页并接入数据时：
1. `<head>` 引 `demo.css`；body 底部按序引 `data-store.js` → `prototype.js` → `demo.js`。
2. 页面留容器 id（如 `#xxxList`），在 `demo.js` 增加对应 `renderXxx()` 并在 `init` 中调用、注册 `DS.watch('key', …)`。
3. 交互按钮加 `data-action="xxx"`，在 `demo.js` 用 `Proto.registerAction('xxx', fn)` 注册。
4. 数据写入 `DS.set/update`，自动触发 watch 重绘；localStorage 键前缀 `demo.v1.`。

**注意**：`snippets.html` 为静态代码参考，不接数据层，仅依赖 `prototype.js` 通用交互。

### PC 管理台外壳（list.html）如何工作

`pc/list.html` 作为 PC 端管理台外壳，侧边栏 / 面包屑 / TagsView / 内容区全部由 `demo.js` 按**当前角色**动态渲染：

- 菜单数据源：`data-store.js` 中 `PC_MENUS`（角色键控的父子级树，父级含 `children`），由 `DS.get('pcMenus')` 按角色读取。
- 菜单交互：父级 `pc-menu-toggle`（展开/收起，折叠态点击自动展开侧栏；父级不显示选中高亮，仅 hover 高亮）；子级 `pc-menu-select`（选中 → `activateTag`）。
- TagsView：`pc-tags-select` 切换激活（**标签保持打开顺序，点击仅移动高亮，不移动文字位置**）、`pc-tag-close` 关闭、`pc-tags-more` 批量；激活标签经 `pcTags` / `pcActiveTag` 持久化，`normalizeTags` 会过滤掉不在当前角色菜单内的历史标签。
- 内容区：`#pageTeacher`（key=teacher 真实表格）+ `#pagePlaceholder`（其余菜单"建设中"占位；关闭全部标签后显示"请点击左侧菜单"），由 `renderPageContent` 切换。

## 风格要点速查

| 项 | PC 后台 | 移动端 |
|----|---------|--------|
| 主色 | 橙 `#ff8a00`（侧栏/菜单选中/Logo） | 橙 `#ff8a00`（导航/主按钮/tabBar 除外） |
| 页面背景 | `#f5f7fa`（内容区） | `#f7f8fa`，首页三层渐变 |
| 卡片 | 圆角 8px、边框 `#ebeef5` | 圆角 24rpx(12px)、阴影泛光 |
| 表格 | 表头 `#f8fafc`、行 hover `#f0f9ff` | — |
| 按钮 | 新增蓝/修改绿/删除红/导入靛蓝/导出琥珀 | 橙渐变胶囊 88rpx |
| tabBar | TagsView 青绿激活 `#11a983` | 选中金黄 `#f9ca24` |

## 差异决策记录（重要）

源码中存在新旧风格并存，原型以"新版基准"为准，详见 `docs/UI风格规范.md` 第 7.3 节：
1. PC 卡片边框：基准 `#ebeef5`（变体 `#ffe8cc`）；
2. PC 新增按钮：基准 `#2563eb` 蓝（变体 `#66cc99` 绿）；
3. 移动端 tabBar 选中：基准 `#f9ca24` 金黄（变体橙）；
4. 移动端按钮圆角：主按钮胶囊 44rpx（普通按钮 16rpx）。

## 已知限制

- localStorage 在 `file://` 下按目录生效；个别浏览器/隐身模式可能禁写 → 自动降级为内存态（可演示，但刷新不保留）。
- 分页为静态展示（仅高亮切换），真实数据不分页（10 条以内）。
- 图片/头像使用文字占位，可自行替换为真实资源。

---

# 勋章体系独立原型（medal-system/）

在通用平台原型之外，另有一套**独立的「童蹊积分勋章激励体系」原型**，位于 `ui-style-prototype/medal-system/`，与通用平台原型互不干扰（数据前缀 `demo.medal.`）。

**入口**：`medal-system/index.html`（5 角色卡：平台管理员 / 园长 / 教师 / 评委 / 家长）

## 结构

```
medal-system/
├─ index.html            角色入口（5 角色卡）
├─ assets/
│  ├─ css/medal.css      勋章体系专属样式（榜单/勋章/三色进度/统计卡等）
│  └─ js/
│     ├─ medal-data.js   数据层（window.MDS，前缀 demo.medal.）
│     └─ medal.js        渲染 + 交互（window.MedalDemo）
├─ pc/
│  ├─ admin.html         PC 管理后台外壳（admin 全量 8 菜单 / principal 本园子集）
│  └─ judge.html         评委打分端（任务列表 + 打分弹窗，无侧栏）
└─ mobile/               角色化首页（hero + 勋章激励卡 + 功能宫格 + tabBar）
                          + 勋章二级页（activity / rank / medal / mine，无 tabBar）
```

## 演示路径

1. 打开 `medal-system/index.html`，选角色进入对应端。
2. **平台管理员** → `pc/admin.html`：核心闭环页真实实现（数据概览 / 活动列表状态机 / 园内排行榜 5 榜+TOP10 / 家长三色进度 / 积分方案权重配置 / 勋章门槛联动 / 勋章档案 / 月度发放清单含离职剔除 / 教师管理离职标注），其余菜单"建设中"占位。
3. **园长** → 菜单子集（本园 11 项）；**评委** → `pc/judge.html` 打分并留痕；**教师/园长** → 移动端角色化首页，勋章模块作为首页卡片（勋章激励卡 + 功能宫格），点击卡片进入勋章二级页；**家长** → 简版首页（无勋章卡片）。
4. 交互状态（活动流转 / 勋章 / 评委留痕 / 消息已读）存 localStorage `demo.medal.*`，刷新保留，「重置演示数据」可恢复默认。

对应需求/方案文档：`2026-08-11-01-需求-童蹊积分勋章激励体系需求拆解.md`、`2026-08-11-02-方案-童蹊系统菜单模块设计.md`。
