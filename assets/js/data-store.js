/**
 * ============================================================
 * 童蹊幼儿成长平台 · 原型演示系统 数据层（window.DS）
 * 用途：统一管理演示 mock 数据 + localStorage 持久化 + 订阅渲染
 * 约束：纯静态、无后端、无依赖，file:// 下 localStorage 按目录生效
 * 说明：
 *   - 可持久化键：role / teachers / notices / formLog / attendance /
 *     pcTags（TagsView 标签）/ pcActiveTag（激活标签）/ pcExpanded（父级菜单展开）
 *   - 派生数据（不入库，由 role 即时计算）：userProfile / gridModules / tabBar / pcMenus
 *   - 数据流单向：UI action → DS.set/update → watch 通知 → 页面 render 重绘
 *   - localStorage 读写全部 try/catch，隐私模式降级为内存态（刷新不保留）
 * ============================================================
 */

window.DS = (function () {
  'use strict';

  var PREFIX = 'demo.v1.';
  var cache = {}; // 内存缓存（避免频繁读 localStorage）
  var watchers = {}; // { key: [fn, ...] }

  /* ────────────────────────── 角色配置 ────────────────────────── */
  var ROLES = {
    parent: {
      key: 'parent',
      name: '家长',
      home: 'mobile/home.html',
      profile: { avatar: '桐', name: '桐桐妈妈', roleLine: '中一班 · 家长' },
    },
    teacher: {
      key: 'teacher',
      name: '教师',
      home: 'mobile/home.html?role=teacher',
      profile: { avatar: '张', name: '张老师', roleLine: '中一班 · 班主任' },
    },
    principal: {
      key: 'principal',
      name: '园长',
      home: 'mobile/home.html?role=principal',
      profile: { avatar: '李', name: '李园长', roleLine: '童蹊幼儿园 · 园长' },
    },
    logistics: {
      key: 'logistics',
      name: '后勤',
      home: 'mobile/home.html?role=logistics',
      profile: { avatar: '王', name: '王后勤', roleLine: '后勤管理组' },
    },
    admin: {
      key: 'admin',
      name: '管理后台',
      home: 'pc/list.html',
      profile: { avatar: '管', name: '管理员', roleLine: '系统管理员' },
    },
  };

  var ROLE_KEYS = ['parent', 'teacher', 'principal', 'logistics', 'admin'];

  /* ────────────────────────── tabBar 配置（对齐源系统 tab-bar/config.js） ────────────────────────── */
  var TAB_BARS = {
    parent: [
      { key: 'home', text: '首页', icon: '⌂', href: 'home.html' },
      { key: 'circle', text: '宝贝圈', icon: '◫', href: 'list.html' },
      { key: 'album', text: '成长手册', icon: '▣', href: 'list.html' },
      { key: 'msg', text: '消息', icon: '☏', href: 'list.html', badge: 3 },
      { key: 'mine', text: '我的', icon: '◉', href: 'mine.html' },
    ],
    teacher: [
      { key: 'home', text: '首页', icon: '⌂', href: 'home.html' },
      { key: 'circle', text: '宝贝圈', icon: '◫', href: 'list.html' },
      { key: 'msg', text: '消息', icon: '☏', href: 'list.html', badge: 2 },
      { key: 'directory', text: '通讯录', icon: '☺', href: 'list.html' },
      { key: 'mine', text: '我的', icon: '◉', href: 'mine.html' },
    ],
    principal: [
      { key: 'home', text: '首页', icon: '⌂', href: 'home.html' },
      { key: 'circle', text: '宝贝圈', icon: '◫', href: 'list.html' },
      { key: 'msg', text: '消息', icon: '☏', href: 'list.html', badge: 1 },
      { key: 'class', text: '年级班级', icon: '▣', href: 'list.html' },
      { key: 'mine', text: '我的', icon: '◉', href: 'mine.html' },
    ],
    logistics: [
      { key: 'home', text: '首页', icon: '⌂', href: 'home.html' },
      { key: 'mine', text: '我的', icon: '◉', href: 'mine.html' },
    ],
  };

  /* ────────────────────────── 出勤横幅（每角色一份，可持久化） ────────────────────────── */
  var MOCK_ATTENDANCE = {
    parent: { title: '今日出勤', sub: '上午 08:15 到园', tag: '已到园', tagClass: 'tag-present' },
    teacher: { title: '班级出勤', sub: '已到 32 人 · 共 35 人', tag: '已到 32', tagClass: 'tag-present' },
    principal: { title: '全园出勤', sub: '已到 256 人 · 共 280 人', tag: '已到 256', tagClass: 'tag-present' },
    logistics: { title: '报餐汇总', sub: '正常餐 260 · 过敏餐 6 · 请假 14', tag: '待确认', tagClass: 'tag-pending' },
  };

  /* ────────────────────────── 功能宫格（按角色，配色对齐源系统 role-modules.js） ────────────────────────── */
  var GRID = {
    /* 家长 11 项平铺 */
    parent: [
      { name: '学习成长', color: '#ff8a00', bg: '#fff5eb', icon: '★', badge: 0, highlight: false, path: 'list.html' },
      { name: '在园生活', color: '#4facfe', bg: '#e6f4ff', icon: '▤', badge: 0, highlight: false, path: 'list.html' },
      { name: '习惯养成', color: '#4facfe', bg: '#e8f4fc', icon: '☑', badge: 0, highlight: false, path: 'list.html' },
      { name: '亲子任务', color: '#ff6b6b', bg: '#fff1f0', icon: '♥', badge: 0, highlight: false, path: 'list.html' },
      { name: '家庭时光', color: '#ff8a00', bg: '#fff5eb', icon: '⌂', badge: 1, highlight: true, path: 'list.html' },
      { name: '健康档案', color: '#ff6b6b', bg: '#ffecec', icon: '♥', badge: 0, highlight: false, path: 'list.html' },
      { name: '成长手册', color: '#a855f7', bg: '#f3efff', icon: '▣', badge: 0, highlight: false, path: 'list.html' },
      { name: '留言管理', color: '#6b3df5', bg: '#f3efff', icon: '☺', badge: 0, highlight: false, path: 'list.html' },
      { name: '特别关注', color: '#f44336', bg: '#fff1f0', icon: '!', badge: 0, highlight: false, path: 'list.html' },
      { name: '请假管理', color: '#e03a2e', bg: '#fff0f0', icon: '▦', badge: 0, highlight: false, path: 'list.html' },
      { name: '学籍异动', color: '#009688', bg: '#e0f2f1', icon: '↻', badge: 0, highlight: false, path: 'list.html' },
    ],
    /* 教师 2 组 */
    teacher: [
      {
        title: '日常工作',
        items: [
          { name: '观察记录', color: '#ff9800', bg: '#fff6e5', icon: '◉', badge: 0, highlight: false, path: 'list.html' },
          { name: '幼儿评语', color: '#6b3df5', bg: '#f3efff', icon: '☺', badge: 0, highlight: false, path: 'list.html' },
          { name: '发展评估', color: '#4ecdc4', bg: '#e8f8f7', icon: '▦', badge: 0, highlight: false, path: 'list.html' },
          { name: '健康档案', color: '#ff6b6b', bg: '#ffecec', icon: '♥', badge: 0, highlight: false, path: 'list.html' },
          { name: '综合评价', color: '#5c6bc0', bg: '#eef0ff', icon: '▣', badge: 0, highlight: false, path: 'list.html' },
          { name: '教研纪要', color: '#607d8b', bg: '#eceff1', icon: '▤', badge: 0, highlight: false, path: 'list.html' },
        ],
      },
      {
        title: '家园互动',
        items: [
          { name: '通知分享', color: '#f9ca24', bg: '#fffce8', icon: '☏', badge: 1, highlight: false, path: 'list.html' },
          { name: '在园生活', color: '#4facfe', bg: '#e6f4ff', icon: '▤', badge: 0, highlight: false, path: 'list.html' },
          { name: '习惯养成', color: '#4facfe', bg: '#e8f4fc', icon: '☑', badge: 0, highlight: false, path: 'list.html' },
          { name: '亲子任务', color: '#ff6b6b', bg: '#fff1f0', icon: '♥', badge: 0, highlight: false, path: 'list.html' },
          { name: '家庭时光', color: '#ff8a00', bg: '#fff5eb', icon: '⌂', badge: 0, highlight: false, path: 'list.html' },
          { name: '幼儿考勤', color: '#4facfe', bg: '#e8f4fc', icon: '✓', badge: 0, highlight: false, path: 'list.html' },
        ],
      },
    ],
    /* 园长 2 组 */
    principal: [
      {
        title: '日常工作',
        items: [
          { name: '班级设置', color: '#2263ff', bg: '#eaf1ff', icon: '⌂', badge: 0, highlight: false, path: 'list.html' },
          { name: '幼儿考勤', color: '#4facfe', bg: '#e8f4fc', icon: '✓', badge: 0, highlight: false, path: 'list.html' },
          { name: '食堂报餐', color: '#ff9800', bg: '#fff6e5', icon: '▦', badge: 0, highlight: false, path: 'list.html' },
          { name: '安全日志', color: '#ff8a00', bg: '#fff5eb', icon: '☰', badge: 0, highlight: false, path: 'list.html' },
          { name: '综合评价', color: '#5c6bc0', bg: '#eef0ff', icon: '▣', badge: 0, highlight: false, path: 'list.html' },
        ],
      },
      {
        title: '家园互动',
        items: [
          { name: '通知分享', color: '#f9ca24', bg: '#fffce8', icon: '☏', badge: 1, highlight: false, path: 'list.html' },
          { name: '在园生活', color: '#4facfe', bg: '#e6f4ff', icon: '▤', badge: 0, highlight: false, path: 'list.html' },
          { name: '习惯养成', color: '#4facfe', bg: '#e8f4fc', icon: '☑', badge: 0, highlight: false, path: 'list.html' },
          { name: '亲子任务', color: '#ff6b6b', bg: '#fff1f0', icon: '♥', badge: 0, highlight: false, path: 'list.html' },
          { name: '家庭时光', color: '#ff8a00', bg: '#fff5eb', icon: '⌂', badge: 0, highlight: false, path: 'list.html' },
        ],
      },
    ],
    /* 后勤 1 组 */
    logistics: [
      {
        title: '快捷入口',
        items: [
          { name: '食堂报餐', color: '#ff9800', bg: '#fff6e5', icon: '▦', badge: 0, highlight: false, path: 'list.html' },
          { name: '全园考勤', color: '#4facfe', bg: '#e8f4fc', icon: '✓', badge: 0, highlight: false, path: 'list.html' },
          { name: '安全巡查', color: '#e03a2e', bg: '#fff0f0', icon: '!', badge: 0, highlight: false, path: 'list.html' },
          { name: '隐患派单', color: '#e03a2e', bg: '#fff0f0', icon: '▤', badge: 0, highlight: false, path: 'list.html' },
          { name: '外部维修', color: '#607d8b', bg: '#eceff1', icon: '☰', badge: 0, highlight: false, path: 'list.html' },
          { name: '日报推送', color: '#ff8a00', bg: '#fff5eb', icon: '✉', badge: 0, highlight: false, path: 'list.html' },
        ],
      },
    ],
  };

  /* ────────────────────────── PC 端后台菜单（按角色，父子级，无图标） ────────────────────────── */
  /* 说明：
   *   - 父级（title + children）可展开/收起，本身不可选中；子级（key + title）可选中联动 TagsView
   *   - 键按角色隔离，TagsView 渲染时仅保留当前角色菜单中存在（且 + 首页）的标签
   *   - key 对应 demo.js 中按菜单渲染的内容块（list.html 内置 teacher 真实表格，其余为占位）
   */
  var PC_MENUS = {
    admin: [
      {
        title: '基础信息',
        children: [
          { key: 'teacher', title: '教师管理' },
          { key: 'class', title: '班级管理' },
          { key: 'parent', title: '家长管理' },
          { key: 'student', title: '学生管理' },
          { key: 'school', title: '学校管理' },
        ],
      },
      {
        title: '业务模块',
        children: [
          { key: 'analysis', title: '数据分析' },
          { key: 'evaluation', title: '评价管理' },
          { key: 'health', title: '健康管理' },
          { key: 'record', title: '档案记录' },
        ],
      },
      {
        title: '系统管理',
        children: [
          { key: 'user', title: '用户管理' },
          { key: 'role', title: '角色管理' },
          { key: 'menu', title: '菜单管理' },
        ],
      },
    ],
    principal: [
      {
        title: '园务管理',
        children: [
          { key: 'class-set', title: '班级设置' },
          { key: 'staff', title: '教职工管理' },
          { key: 'attendance', title: '全园考勤' },
          { key: 'meal', title: '食堂报餐' },
          { key: 'safety', title: '安全日志' },
        ],
      },
      {
        title: '家园互动',
        children: [
          { key: 'notice', title: '通知分享' },
          { key: 'life', title: '在园生活' },
          { key: 'habit', title: '习惯养成' },
          { key: 'task', title: '亲子任务' },
          { key: 'family', title: '家庭时光' },
        ],
      },
    ],
    teacher: [
      {
        title: '教学工作',
        children: [
          { key: 'observe', title: '观察记录' },
          { key: 'comment', title: '幼儿评语' },
          { key: 'assess', title: '发展评估' },
          { key: 'health', title: '健康档案' },
          { key: 'synthesis', title: '综合评价' },
          { key: 'research', title: '教研纪要' },
        ],
      },
      {
        title: '家园互动',
        children: [
          { key: 'notice', title: '通知分享' },
          { key: 'life', title: '在园生活' },
          { key: 'habit', title: '习惯养成' },
          { key: 'task', title: '亲子任务' },
          { key: 'family', title: '家庭时光' },
        ],
      },
    ],
    logistics: [
      {
        title: '后勤管理',
        children: [
          { key: 'meal', title: '食堂报餐' },
          { key: 'attendance', title: '全园考勤' },
          { key: 'patrol', title: '安全巡查' },
          { key: 'hazard', title: '隐患派单' },
          { key: 'repair', title: '外部维修' },
          { key: 'report', title: '日报推送' },
        ],
      },
    ],
    /* 家长端无 PC 后台菜单 */
    parent: [],
  };

  /* ────────────────────────── mock 种子 ────────────────────────── */
  var MOCK = {
    teachers: [
      { id: 1, name: '张慧', gender: '女', phone: '138****0001', className: '小一班', hireDate: '2023-09-01', status: '在职' },
      { id: 2, name: '李娜', gender: '女', phone: '139****0002', className: '中一班', hireDate: '2022-03-15', status: '正常' },
      { id: 3, name: '王强', gender: '男', phone: '137****0003', className: '大一班', hireDate: '2024-02-20', status: '试用' },
      { id: 4, name: '赵敏', gender: '女', phone: '136****0004', className: '小一班', hireDate: '2023-06-01', status: '离职' },
      { id: 5, name: '陈晨', gender: '女', phone: '135****0005', className: '中一班', hireDate: '2021-09-01', status: '在职' },
      { id: 6, name: '刘洋', gender: '男', phone: '134****0006', className: '大一班', hireDate: '2020-08-10', status: '正常' },
      { id: 7, name: '孙悦', gender: '女', phone: '133****0007', className: '小一班', hireDate: '2024-09-01', status: '试用' },
      { id: 8, name: '周涛', gender: '男', phone: '132****0008', className: '中一班', hireDate: '2019-05-20', status: '正常' },
      { id: 9, name: '吴倩', gender: '女', phone: '131****0009', className: '大一班', hireDate: '2025-03-01', status: '试用' },
      { id: 10, name: '郑爽', gender: '女', phone: '130****0010', className: '小一班', hireDate: '2023-11-15', status: '在职' },
    ],
    notices: [
      { id: 'n1', title: '【通知】本周五举办亲子运动会', desc: '请各位家长提前安排好时间，准时参加……', time: '今天 09:30', from: '张老师', type: 'notice', read: false },
      { id: 'n2', title: '【安全】近期暴雨天气温馨提示', desc: '请家长接送孩子注意道路安全，带好雨具……', time: '昨天 17:20', from: '幼儿园', type: 'notice', read: false },
      { id: 'n3', title: '【通知】六一儿童节放假安排', desc: '6月1日（周一）放假一天，6月2日正常上课……', time: '06-01 08:00', from: '张老师', type: 'notice', read: true },
      { id: 'n4', title: '【分享】本月阅读绘本推荐', desc: '中一班本月推荐绘本《好饿的毛毛虫》……', time: '05-28 10:15', from: '李老师', type: 'share', read: true },
      { id: 'n5', title: '【通知】春季体检结果已上传', desc: '请家长查看孩子的体检报告，如有疑问可联系保健室……', time: '05-20 14:30', from: '保健室', type: 'notice', read: true },
      { id: 'n6', title: '【分享】六一文艺汇演精彩回顾', desc: '中一班小朋友们的精彩表演瞬间，快来围观……', time: '06-05 09:00', from: '李老师', type: 'share', read: false },
    ],
    formLog: [],
    attendance: MOCK_ATTENDANCE,
  };

  var MUTABLE_KEYS = ['teachers', 'notices', 'formLog', 'attendance'];

  /* ────────────────────────── PC 端界面状态（可持久化，重置时恢复默认） ────────────────────────── */
  /* pcTags：TagsView 标签数组 [{key,title}]；pcActiveTag：当前激活标签 key；pcExpanded：已展开父级标题 */
  var UI_DEFAULTS = {
    pcTags: [], // TagsView 标签数组 [{key,title}]，初始为空，随菜单点击新增
    pcActiveTag: '', // 当前激活标签 key；为空表示未选中（如关闭全部标签后）
    pcExpanded: [],
  };
  var UI_STATE_KEYS = ['pcTags', 'pcActiveTag', 'pcExpanded'];

  /* ────────────────────────── localStorage 封装 ────────────────────────── */
  function lsGet(key) {
    try {
      var raw = localStorage.getItem(PREFIX + key);
      return raw ? JSON.parse(raw) : undefined;
    } catch (e) {
      return undefined;
    }
  }

  function lsSet(key, value) {
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(value));
    } catch (e) {
      /* 隐私模式等无法写入时静默降级为内存态 */
    }
  }

  /* ────────────────────────── 通知 watcher ────────────────────────── */
  function notify(key) {
    var list = watchers[key] || [];
    var value = cache[key];
    list.forEach(function (fn) {
      try {
        fn(value);
      } catch (e) {
        /* 单个 watcher 异常不影响其他 */
      }
    });
  }

  /* ────────────────────────── 派生数据 ────────────────────────── */
  function currentRole() {
    var r = cache.role;
    return ROLE_KEYS.indexOf(r) >= 0 ? r : 'parent';
  }

  /* ────────────────────────── 对外 API ────────────────────────── */
  var DS = {
    ROLES: ROLES,
    ROLE_KEYS: ROLE_KEYS,
    TAB_BARS: TAB_BARS,
    GRID: GRID,
    PC_MENUS: PC_MENUS,

    /* 初始化：逐键读 localStorage，缺失用 mock 补齐写回；role 缺省 parent */
    init: function () {
      var self = this;
      MUTABLE_KEYS.forEach(function (key) {
        var v = lsGet(key);
        if (v === undefined) {
          v = JSON.parse(JSON.stringify(MOCK[key]));
          lsSet(key, v);
        }
        cache[key] = v;
      });
      var role = lsGet('role');
      cache.role = ROLE_KEYS.indexOf(role) >= 0 ? role : 'parent';
      // PC 界面状态：缺失用默认值补齐并写回
      UI_STATE_KEYS.forEach(function (key) {
        var v = lsGet(key);
        if (v === undefined) {
          v = JSON.parse(JSON.stringify(UI_DEFAULTS[key]));
          lsSet(key, v);
        }
        cache[key] = v;
      });
    },

    /* 读：可持久化键返回缓存值；派生键由 role 即时计算 */
    get: function (key) {
      switch (key) {
        case 'role':
          return currentRole();
        case 'userProfile':
          return ROLES[currentRole()].profile;
        case 'gridModules':
          return GRID[currentRole()];
        case 'tabBar':
          return TAB_BARS[currentRole()];
        case 'pcMenus':
          return PC_MENUS[currentRole()] || [];
        default:
          return cache[key];
      }
    },

    /* 写：JSON 入库并 notify */
    set: function (key, value) {
      cache[key] = value;
      if (MUTABLE_KEYS.indexOf(key) >= 0 || UI_STATE_KEYS.indexOf(key) >= 0) lsSet(key, value);
      notify(key);
    },

    /* 便捷改：fn(旧值) 返回新值 */
    update: function (key, fn) {
      this.set(key, fn(cache[key]));
    },

    /* 重置单个数据集为 mock 种子并 notify */
    reset: function (key) {
      this.set(key, JSON.parse(JSON.stringify(MOCK[key])));
    },

    /* 重置所有可持久化数据集（保留当前 role），notify 全部 */
    resetAll: function () {
      var self = this;
      MUTABLE_KEYS.forEach(function (key) {
        self.reset(key);
      });
      // PC 界面状态一并恢复默认（TagsView / 激活标签 / 父级展开）
      UI_STATE_KEYS.forEach(function (key) {
        self.set(key, JSON.parse(JSON.stringify(UI_DEFAULTS[key])));
      });
    },

    /* 切换角色：写 role（不入 MUTABLE，但入库），并 notify role */
    setRole: function (role) {
      if (ROLE_KEYS.indexOf(role) < 0) return;
      cache.role = role;
      lsSet('role', role);
      notify('role');
    },

    /* 订阅渲染：注册 fn(key, value)；返回退订函数 */
    watch: function (key, fn) {
      if (!watchers[key]) watchers[key] = [];
      watchers[key].push(fn);
      return function () {
        var i = watchers[key].indexOf(fn);
        if (i >= 0) watchers[key].splice(i, 1);
      };
    },

    /* 内部：可持久化数据集清单（供 resetAll 使用） */
    _keys: function () {
      return MUTABLE_KEYS.slice();
    },
  };

  return DS;
})();
