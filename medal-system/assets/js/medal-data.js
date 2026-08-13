/**
 * ============================================================
 * 童蹊社区-原型 · 原型演示系统 数据层（window.MDS）
 * 用途：统一管理童蹊社区-原型的 mock 数据 + localStorage 持久化 + 订阅渲染
 * 约束：纯静态、无后端、无依赖，file:// 下 localStorage 按目录生效
 * 说明：
 *   - 与通用平台原型（data-store.js）互相独立，localStorage 键前缀 demo.medal.
 *   - 可持久化键：role / activities / medals / reviewRecords / notices
 *   - 派生数据（不入库，由 role 即时计算）：userProfile / tabBar / pcMenus
 *   - 数据流单向：UI action → MDS.set/update → watch 通知 → 页面 render 重绘
 * 对应文档：2026-08-11-01 需求拆解 / 2026-08-11-02 菜单模块设计
 * ============================================================
 */

window.MDS = (function () {
  'use strict';

  var PREFIX = 'demo.medal.';
  var cache = {}; // 内存缓存（避免频繁读 localStorage）
  var watchers = {}; // { key: [fn, ...] }

  /* ────────────────────────── 角色配置（5 角色：管理员/园长/教师/评委/家长） ────────────────────────── */
  var ROLES = {
    admin: {
      key: 'admin',
      name: '平台管理员',
      home: 'pc/admin.html',
      profile: { avatar: '管', name: '平台管理员', roleLine: '童蹊平台 · 超级管理员' },
    },
    principal: {
      key: 'principal',
      name: '园长',
      home: 'pc/admin.html?role=principal',
      profile: { avatar: '李', name: '李园长', roleLine: '童蹊幼儿园 · 园长' },
    },
    teacher: {
      key: 'teacher',
      name: '教师',
      home: 'mobile/home.html?role=teacher',
      profile: { avatar: '张', name: '张老师', roleLine: '中一班 · 班主任' },
    },
    judge: {
      key: 'judge',
      name: '评委',
      home: 'pc/judge.html',
      profile: { avatar: '王', name: '王教授', roleLine: '童蹊平台 · 特约评委' },
    },
    parent: {
      key: 'parent',
      name: '家长',
      home: 'mobile/home.html?role=parent',
      profile: { avatar: '桐', name: '桐桐妈妈', roleLine: '中一班 · 家长' },
    },
  };

  var ROLE_KEYS = ['admin', 'principal', 'teacher', 'judge', 'parent'];

  /* ────────────────────────── 移动端 tabBar（勋章不再是独立 tab，入口全走首页卡片；选中金黄 #f9ca24） ────────────────────────── */
  /* 教师/园长：首页 + 我的（我的不可点击，仅展示，disabled=true）；家长：首页 + 活动 + 我的（家长简版） */
  var TAB_BARS = {
    teacher: [
      { key: 'home', text: '首页', icon: '⌂', href: 'home.html' },
      { key: 'mine', text: '我的', icon: '◉', href: 'mine.html', disabled: true },
    ],
    principal: [
      { key: 'home', text: '首页', icon: '⌂', href: 'home.html' },
      { key: 'mine', text: '我的', icon: '◉', href: 'mine.html', disabled: true },
    ],
    parent: [
      { key: 'home', text: '首页', icon: '⌂', href: 'home.html' },
      { key: 'activity', text: '活动', icon: '✎', href: 'activity.html' },
      { key: 'mine', text: '我的', icon: '◉', href: 'mine.html' },
    ],
  };

  /* ────────────────────────── PC 端后台菜单（对齐方案文档 2.1 完整菜单树，按角色） ────────────────────────── */
  /* key 对应 medal.js 中按菜单渲染的内容块；未实现的 key 显示"建设中"占位 */
  var PC_MENUS = {
    /* 平台管理员：全量 7 组 */
    admin: [
      {
        title: '活动组织',
        children: [
          { key: 'activity-launch', title: '活动发起' },
          // 活动类型配置不做单独子菜单，由数据字典定义
          // 作品管理不做独立菜单，由活动发起「查看作品」入口进入（medal.js EXTRA_PAGES）
          // 打分监控 / 结果管理 / 活动归档并入「活动管理」页的审核 / 归档阶段（步骤条）
          // 活动查询：归档历史活动只读查询（统计 / 全量导出 / 报名与评审详情）
          { key: 'activity-manage', title: '活动管理' },
          { key: 'activity-query', title: '活动查询' },
          { key: 'cert-template', title: '奖状模板' },
        ],
      },
      {
        title: '排行榜',
        children: [
          { key: 'rank-garden', title: '园内排行榜' },
          { key: 'rank-platform', title: '全平台排行榜' },
          { key: 'rank-parent', title: '家长进度看板' },
        ],
      },
      {
        title: '积分规则',
        children: [
          { key: 'score-scheme', title: '积分方案管理' },
        ],
      },
      {
        title: '勋章体系',
        children: [
          { key: 'medal-threshold', title: '勋章门槛配置' },
          { key: 'medal-archive', title: '教师勋章档案' },
        ],
      },
      {
        title: '奖金管理',
        children: [
          { key: 'bonus-gradient', title: '奖金梯度配置' },
          { key: 'bonus-monthly', title: '月度发放清单' },
          { key: 'bonus-semester', title: '期末汇总清单' },
        ],
      },
      {
        title: '人员管理',
        children: [
          { key: 'user-teacher', title: '教师管理' },
          { key: 'user-class', title: '班级管理' },
          { key: 'user-judge', title: '评委管理' },
        ],
      },
      {
        title: '系统设置',
        children: [
          { key: 'system-config', title: '基础配置' },
          { key: 'system-role', title: '角色权限管理' },
          { key: 'system-log', title: '操作日志' },
        ],
      },
    ],
    /* 园长：仅排行榜（园内排行榜 + 家长进度看板）
       活动组织 / 勋章体系 / 奖金管理 / 人员管理 仅平台管理员端可见 */
    principal: [
      {
        title: '排行榜',
        children: [
          { key: 'rank-garden', title: '园内排行榜' },
          { key: 'rank-parent', title: '家长进度看板' },
        ],
      },
    ],
    /* 评委：完整 PC 后台外壳，仅评奖打分（打分监控为管理员/园长功能，非评委） */
    judge: [
      {
        title: '评奖管理',
        children: [{ key: 'judge-scoring', title: '评委打分' }],
      },
    ],
    /* 教师：PC 个人工作台（教师视角：我的活动 / 园内排行 / 我的勋章 / 我的奖金） */
    teacher: [
      { title: '活动中心', children: [{ key: 'teacher-activity', title: '我的活动' }] },
      { title: '排行榜', children: [{ key: 'teacher-rank', title: '园内排行榜' }] },
      { title: '我的勋章', children: [{ key: 'teacher-medal', title: '勋章档案' }] },
      { title: '我的奖金', children: [{ key: 'teacher-bonus', title: '奖金明细' }] },
    ],
    parent: [],
  };

  /* ────────────────────────── mock 种子 ────────────────────────── */

  /* 活动生命周期：仅保留两个状态 —— 未发布 / 已发布
     （发布后教师即可上传作品，活动结束后仅保留历史，归入已发布展示） */
  var ACTIVITY_STATUS = {
    DRAFT: '未发布',
    PUBLISHED: '已发布',
  };

  /* 解析旧版奖项字符串「一等奖×3 / 二等奖×5」为数组 [{ name, count }] */
  function parseAwardStr(str) {
    var out = [];
    String(str || '').split(/[\/／]/).forEach(function (part) {
      part = part.trim();
      if (!part) return;
      var m = part.match(/^(.+?)\s*[xX×]\s*(\d+)\s*$/);
      if (m) {
        out.push({ name: m[1].trim(), count: parseInt(m[2], 10) });
      } else {
        out.push({ name: part, count: 1 });
      }
    });
    return out;
  }

  var MOCK = {
    /* 活动列表（含全生命周期状态） */
    activities: [
      // stage 生命周期阶段：'' 草稿 / signup 报名 / review 审核 / archive 归档（驱动「活动管理」步骤条）
      // resultStatus 归档阶段结果状态：pending 未发布 / published 已发布 / archived 已归档
      { id: 1, title: '2026 春季论文评选大赛', type: '论文比赛', status: 'PUBLISHED', stage: 'review', publishTime: '2026-06-25', signupStart: '2026-07-01', signupEnd: '2026-08-20', targetKindergartens: ['全部幼儿园'], format: '文档/PDF', awards: [{ name: '一等奖', count: 3 }, { name: '二等奖', count: 5 }, { name: '三等奖', count: 8 }], desc: '面向全体教师的春季教育教学论文评选，围绕教学实践总结与反思展开，鼓励一线教师沉淀教学经验。', participants: 46, worksCount: 38 },
      { id: 2, title: '课件制作技能大赛', type: '课件比赛', status: 'PUBLISHED', stage: 'review', publishTime: '2026-06-05', signupStart: '2026-06-10', signupEnd: '2026-07-15', targetKindergartens: ['童蹊幼儿园'], format: '课件/PPT/图片', awards: [{ name: '一等奖', count: 2 }, { name: '二等奖', count: 4 }, { name: '三等奖', count: 6 }], desc: '提升教师多媒体课件制作能力，展示信息技术与课堂教学的融合成果。', participants: 32, worksCount: 32, certTemplateId: 1 },
      { id: 3, title: '家园互动创意活动评选', type: '朋友圈点赞比赛', status: 'PUBLISHED', stage: 'signup', publishTime: '2026-07-25', signupStart: '2026-08-01', signupEnd: '2026-09-15', targetKindergartens: ['全部幼儿园'], format: '文档/图片/压缩包', awards: [{ name: '一等奖', count: 3 }, { name: '二等奖', count: 5 }, { name: '三等奖', count: 8 }], desc: '征集家园共育创意活动方案，促进幼儿园与家庭之间的深度互动与协作。', participants: 8, worksCount: 0 },
      { id: 4, title: '六一主题环创比赛', type: '朋友圈点赞比赛', status: 'DRAFT', stage: '', publishTime: '', signupStart: '', signupEnd: '', targetKindergartens: ['童蹊幼儿园', '阳光幼儿园'], format: '图片/压缩包', awards: [{ name: '一等奖', count: 2 }, { name: '二等奖', count: 4 }, { name: '三等奖', count: 6 }], desc: '围绕六一儿童节主题开展班级环境创设评比，营造节日氛围、提升幼儿参与感。', participants: 0, worksCount: 0 },
      { id: 5, title: '亲子阅读打卡活动', type: '论文比赛', status: 'PUBLISHED', stage: 'archive', resultStatus: 'published', publishTime: '2026-02-20', signupStart: '2026-03-01', signupEnd: '2026-04-30', targetKindergartens: ['全部幼儿园'], format: '文档', awards: [{ name: '一等奖', count: 5 }, { name: '二等奖', count: 8 }, { name: '三等奖', count: 12 }], desc: '以亲子共读为主题的持续阅读打卡活动，培养幼儿早期阅读习惯。', participants: 58, worksCount: 58 },
      { id: 6, title: '2025 秋季论文大赛', type: '论文比赛', status: 'PUBLISHED', stage: 'archive', resultStatus: 'archived', publishTime: '2025-08-25', signupStart: '2025-09-01', signupEnd: '2025-10-31', targetKindergartens: ['全部幼儿园'], format: '文档/PDF', awards: [{ name: '一等奖', count: 3 }, { name: '二等奖', count: 5 }, { name: '三等奖', count: 8 }], desc: '上一学年秋季学期教育教学论文评选，现已归档保存。', participants: 51, worksCount: 51 },
      { id: 7, title: '班级环创成果评比', type: '朋友圈点赞比赛', status: 'PUBLISHED', stage: 'archive', resultStatus: 'archived', publishTime: '2025-12-30', signupStart: '2026-01-05', signupEnd: '2026-02-10', targetKindergartens: ['童蹊幼儿园'], format: '图片/压缩包', awards: [{ name: '一等奖', count: 3 }, { name: '二等奖', count: 6 }, { name: '三等奖', count: 9 }], desc: '学期初班级环创成果集中评比，检验各班环境创设的完成质量。', participants: 28, worksCount: 28 },
      // 报名阶段：已发布待报名
      { id: 8, title: '秋季家园共育案例评选', type: '论文比赛', status: 'PUBLISHED', stage: 'signup', publishTime: '2026-08-10', signupStart: '2026-08-10', signupEnd: '2026-09-20', targetKindergartens: ['全部幼儿园'], format: '文档/PDF', awards: [{ name: '一等奖', count: 2 }, { name: '二等奖', count: 4 }, { name: '三等奖', count: 6 }], desc: '征集家园共育优秀案例，推动家园协作经验沉淀与分享。', participants: 15, worksCount: 0, supplementEnabled: true, workDeadline: '2026-09-25' },
      // 审核阶段：初评中 / 复评待分配
      { id: 9, title: '户外活动设计大赛', type: '课件比赛', status: 'PUBLISHED', stage: 'review', expertReview: false, reviewStages: ['初评', '复评'], publishTime: '2026-07-20', signupStart: '2026-07-22', signupEnd: '2026-08-08', targetKindergartens: ['阳光幼儿园', '蓝天幼儿园'], format: '课件/压缩包', awards: [{ name: '一等奖', count: 2 }, { name: '二等奖', count: 3 }, { name: '三等奖', count: 5 }], desc: '提升教师户外活动组织与设计能力，展示户外游戏课程化探索成果。', participants: 20, worksCount: 12 },
      // 归档阶段：评审已完成，待发布结果
      { id: 10, title: '区域活动观察记录评比', type: '论文比赛', status: 'PUBLISHED', stage: 'archive', resultStatus: 'pending', publishTime: '2026-05-10', signupStart: '2026-05-12', signupEnd: '2026-06-05', targetKindergartens: ['童蹊幼儿园'], format: '文档', awards: [{ name: '一等奖', count: 2 }, { name: '二等奖', count: 3 }, { name: '三等奖', count: 5 }], desc: '检验教师区域活动观察与分析能力，初评复评均已完成，待发布评审结果。', participants: 30, worksCount: 30, certTemplateId: 1 },
    ],

    /* 教师端「活动中心」当前教师（张慧）的报名/上传状态（活动 id → 参与状态，可持久化）
       signedUp 是否已报名 / workSubmitted 是否已上传作品 / workTitle 上传的作品名称 */
    teacherSignups: {
      1:  { signedUp: true, signupTime: '2026-07-02 09:00', workSubmitted: true,  workTitle: '浅谈幼儿园一日活动中的生活教育' },
      6:  { signedUp: true, signupTime: '2025-09-05 10:00', workSubmitted: true,  workTitle: '幼儿园户外自主游戏的教师支持策略' },
      10: { signedUp: true, signupTime: '2026-05-15 09:30', workSubmitted: true,  workTitle: '建构区幼儿合作行为观察记录' },
    },

    /* 活动类型字典（可配置，多层级） */
    activityTypes: [
      { id: 1, name: '论文比赛', parent: '教学教研', sort: 1, enabled: true },
      { id: 2, name: '课件比赛', parent: '教学教研', sort: 2, enabled: true },
      { id: 3, name: '朋友圈点赞比赛', parent: '家园互动', sort: 3, enabled: true },
    ],

    /* 参赛作品（含作品名称 title，作品管理页支持按作品名称/教师筛选） */
    works: [
      { id: 1, activity: '2026 春季论文评选大赛', title: '浅谈幼儿园一日活动中的生活教育', teacher: '张慧', className: '中一班', type: '文档', size: '2.3MB', status: '已提交', check: '未检出重复', submitTime: '2026-08-03 14:20' },
      { id: 2, activity: '2026 春季论文评选大赛', title: '家园共育背景下小班幼儿自理能力培养策略', teacher: '李娜', className: '小一班', type: '文档', size: '1.8MB', status: '已提交', check: '未检出重复', submitTime: '2026-08-05 09:12' },
      { id: 3, activity: '2026 春季论文评选大赛', title: '游戏化教学在幼儿数学启蒙中的应用', teacher: '王强', className: '大一班', type: 'PDF', size: '3.1MB', status: '已提交', check: '相似度 12%', submitTime: '2026-08-07 16:40' },
      { id: 4, activity: '课件制作技能大赛', title: '《秋天的果实》科学活动课件', teacher: '赵敏', className: '小一班', type: '课件', size: '15.6MB', status: '评审中', check: '未检出重复', submitTime: '2026-07-10 10:05' },
      { id: 5, activity: '课件制作技能大赛', title: '《你好，春天》主题教学课件', teacher: '陈晨', className: '中一班', type: '课件', size: '22.4MB', status: '评审中', check: '未检出重复', submitTime: '2026-07-12 11:30' },
      { id: 6, activity: '课件制作技能大赛', title: '大班户外体育游戏资源包', teacher: '刘洋', className: '大一班', type: '压缩包', size: '48.2MB', status: '评审中', check: '相似度 8%', submitTime: '2026-07-14 15:22' },
      { id: 7, activity: '亲子阅读打卡活动', title: '亲子共读 21 天打卡记录', teacher: '孙悦', className: '中一班', type: '文档', size: '1.2MB', status: '已完成', check: '未检出重复', submitTime: '2026-04-20 09:00' },
      // 户外活动设计大赛（审核阶段）
      { id: 8, activity: '户外活动设计大赛', title: '户外体育循环活动方案', teacher: '周涛', className: '大一班', type: '课件', size: '18.2MB', status: '评审中', check: '未检出重复', submitTime: '2026-08-10 09:30' },
      { id: 9, activity: '户外活动设计大赛', title: '沙水区自主游戏观察方案', teacher: '吴倩', className: '小一班', type: '文档', size: '2.1MB', status: '评审中', check: '未检出重复', submitTime: '2026-08-11 10:15' },
      { id: 10, activity: '户外活动设计大赛', title: '晨间户外体能大循环设计', teacher: '郑爽', className: '中一班', type: '压缩包', size: '35.6MB', status: '评审中', check: '相似度 5%', submitTime: '2026-08-12 14:40' },
      // 区域活动观察记录评比（归档阶段 · 待发布结果）
      { id: 11, activity: '区域活动观察记录评比', title: '建构区幼儿合作行为观察记录', teacher: '张慧', className: '中一班', type: '文档', size: '1.6MB', status: '已评审', check: '未检出重复', submitTime: '2026-05-18 09:00' },
      { id: 12, activity: '区域活动观察记录评比', title: '角色区语言发展观察记录', teacher: '李娜', className: '小一班', type: '文档', size: '1.4MB', status: '已评审', check: '未检出重复', submitTime: '2026-05-20 11:20' },
      // 2025 秋季论文大赛（归档阶段 · 已归档）
      { id: 13, activity: '2025 秋季论文大赛', title: '幼儿园户外自主游戏的教师支持策略', teacher: '张慧', className: '中一班', type: '文档', size: '1.9MB', status: '已评审', check: '未检出重复', submitTime: '2025-10-12 09:30' },
      { id: 14, activity: '2025 秋季论文大赛', title: '小班幼儿入园适应的家园协同路径', teacher: '李娜', className: '小一班', type: 'PDF', size: '2.4MB', status: '已评审', check: '未检出重复', submitTime: '2025-10-15 14:05' },
      { id: 15, activity: '2025 秋季论文大赛', title: '基于游戏观察的大班学习品质培养', teacher: '王强', className: '大一班', type: '文档', size: '2.0MB', status: '已评审', check: '相似度 6%', submitTime: '2025-10-18 10:20' },
      // 班级环创成果评比（归档阶段 · 已归档）
      { id: 16, activity: '班级环创成果评比', title: '小一班主题环创布置方案', teacher: '赵敏', className: '小一班', type: '压缩包', size: '28.5MB', status: '已评审', check: '未检出重复', submitTime: '2026-01-20 09:00' },
      { id: 17, activity: '班级环创成果评比', title: '中一班区域角环境创设', teacher: '陈晨', className: '中一班', type: '图片', size: '12.3MB', status: '已评审', check: '未检出重复', submitTime: '2026-01-21 11:30' },
    ],

    /* 评委账号（20 位，供分组抽取演示） */
    judges: [
      { id: 1, name: '王教授', account: 'JS001', org: '教育研究院', assign: '3 个活动', weight: '评委权重 60%' },
      { id: 2, name: '陈园长', account: 'YZ001', org: '示范幼儿园', assign: '2 个活动', weight: '评委权重 55%' },
      { id: 3, name: '刘教研员', account: 'JYY001', org: '区教研室', assign: '2 个活动', weight: '评委权重 55%' },
      { id: 4, name: '张园长', account: 'YZ002', org: '中心幼儿园', assign: '2 个活动', weight: '评委权重 50%' },
      { id: 5, name: '李教授', account: 'JS002', org: '师范学院', assign: '3 个活动', weight: '评委权重 65%' },
      { id: 6, name: '赵教研员', account: 'JYY002', org: '市教科院', assign: '1 个活动', weight: '评委权重 50%' },
      { id: 7, name: '孙园长', account: 'YZ003', org: '实验幼儿园', assign: '2 个活动', weight: '评委权重 55%' },
      { id: 8, name: '周教授', account: 'JS003', org: '教育科学研究院', assign: '3 个活动', weight: '评委权重 70%' },
      { id: 9, name: '吴教研员', account: 'JYY003', org: '区教研室', assign: '1 个活动', weight: '评委权重 50%' },
      { id: 10, name: '郑园长', account: 'YZ004', org: '机关幼儿园', assign: '1 个活动', weight: '评委权重 50%' },
      { id: 11, name: '钱教授', account: 'JS004', org: '师范学院', assign: '2 个活动', weight: '评委权重 60%' },
      { id: 12, name: '冯园长', account: 'YZ005', org: '双语幼儿园', assign: '1 个活动', weight: '评委权重 50%' },
      { id: 13, name: '蒋教研员', account: 'JYY004', org: '市教研中心', assign: '2 个活动', weight: '评委权重 55%' },
      { id: 14, name: '沈教授', account: 'JS005', org: '教育研究院', assign: '3 个活动', weight: '评委权重 65%' },
      { id: 15, name: '韩园长', account: 'YZ006', org: '直属幼儿园', assign: '1 个活动', weight: '评委权重 50%' },
      { id: 16, name: '杨教研员', account: 'JYY005', org: '区教研室', assign: '1 个活动', weight: '评委权重 50%' },
      { id: 17, name: '朱教授', account: 'JS006', org: '师范大学', assign: '2 个活动', weight: '评委权重 60%' },
      { id: 18, name: '秦园长', account: 'YZ007', org: '示范幼儿园', assign: '1 个活动', weight: '评委权重 50%' },
      { id: 19, name: '许教研员', account: 'JYY006', org: '市教科院', assign: '2 个活动', weight: '评委权重 55%' },
      { id: 20, name: '何教授', account: 'JS007', org: '教育科学研究院', assign: '3 个活动', weight: '评委权重 70%' },
    ],

    /* 评委打分留痕（评委端提交后写入；round 标注评分阶段：初评 / 复评） */
    reviewRecords: [
      { id: 1, activity: '课件制作技能大赛', work: '赵敏的课件', judge: '王教授', round: '初评', scores: '85 / 90 / 88', comment: '课件结构完整，交互设计较好。', time: '2026-08-06 10:15' },
      { id: 2, activity: '课件制作技能大赛', work: '陈晨的课件', judge: '王教授', round: '初评', scores: '92 / 88 / 90', comment: '动画流畅，课堂适用性强。', time: '2026-08-06 10:40' },
      // 区域活动观察记录评比（归档阶段 · 初评 + 复评两轮打分）
      { id: 3, activity: '区域活动观察记录评比', work: '张慧的作品', judge: '王教授', round: '初评', scores: '88 / 90 / 86', comment: '观察记录详实，分析与建议到位。', time: '2026-06-10 09:20' },
      { id: 4, activity: '区域活动观察记录评比', work: '张慧的作品', judge: '陈园长', round: '复评', scores: '90 / 92 / 89', comment: '初评复评一致，一等奖候选。', time: '2026-06-12 10:05' },
      { id: 5, activity: '区域活动观察记录评比', work: '李娜的作品', judge: '王教授', round: '初评', scores: '82 / 85 / 84', comment: '记录完整，可补充改进建议。', time: '2026-06-10 09:40' },
      { id: 6, activity: '区域活动观察记录评比', work: '李娜的作品', judge: '陈园长', round: '复评', scores: '85 / 87 / 86', comment: '二等奖水平。', time: '2026-06-12 10:30' },
      // 户外活动设计大赛（审核阶段 · 复评打分）
      { id: 7, activity: '户外活动设计大赛', work: '周涛的作品', judge: '王教授', round: '复评', scores: '86 / 88 / 90', comment: '方案设计完整，可执行性强。', time: '2026-08-14 09:30' },
      { id: 8, activity: '户外活动设计大赛', work: '吴倩的作品', judge: '王教授', round: '复评', scores: '90 / 92 / 88', comment: '观察记录详实，目标明确。', time: '2026-08-14 09:45' },
      { id: 9, activity: '户外活动设计大赛', work: '郑爽的作品', judge: '王教授', round: '复评', scores: '84 / 86 / 85', comment: '设计新颖，需补充安全预案。', time: '2026-08-14 10:00' },
      // 2025 秋季论文大赛（归档阶段 · 已归档 · 初评 + 复评）
      { id: 10, activity: '2025 秋季论文大赛', work: '张慧的作品', judge: '李教授', round: '初评', scores: '90 / 88 / 92', comment: '选题贴合实际，论证充分。', time: '2025-10-20 09:10' },
      { id: 11, activity: '2025 秋季论文大赛', work: '张慧的作品', judge: '周教授', round: '复评', scores: '91 / 90 / 93', comment: '初评复评一致，一等奖候选。', time: '2025-10-22 10:00' },
      { id: 12, activity: '2025 秋季论文大赛', work: '李娜的作品', judge: '李教授', round: '初评', scores: '84 / 86 / 85', comment: '案例丰富，可再提炼策略。', time: '2025-10-20 09:30' },
      { id: 13, activity: '2025 秋季论文大赛', work: '李娜的作品', judge: '周教授', round: '复评', scores: '86 / 87 / 85', comment: '二等奖水平。', time: '2025-10-22 10:20' },
      { id: 14, activity: '2025 秋季论文大赛', work: '王强的作品', judge: '李教授', round: '初评', scores: '82 / 84 / 83', comment: '结构完整，可补数据支撑。', time: '2025-10-20 09:50' },
      // 班级环创成果评比（归档阶段 · 已归档 · 初评）
      { id: 15, activity: '班级环创成果评比', work: '赵敏的作品', judge: '陈园长', round: '初评', scores: '88 / 90 / 87', comment: '环创主题鲜明，幼儿参与度高。', time: '2026-01-22 09:20' },
      { id: 16, activity: '班级环创成果评比', work: '陈晨的作品', judge: '陈园长', round: '初评', scores: '85 / 86 / 84', comment: '区域角布局合理。', time: '2026-01-22 09:45' },
    ],

    /* 评奖分批（活动 id → 批次列表；每批次：评审轮次 round(初评/复评) + 作品 ids + 分配评委 + 已评数量 done） */
    reviewBatches: {
      // 初评中（进行中）
      1: [
        { batchNo: 1, round: '初评', workIds: [1, 2], judgeId: 1, judgeName: '王教授', done: 0 },
        { batchNo: 2, round: '初评', workIds: [3], judgeId: 3, judgeName: '刘教研员', done: 0 },
      ],
      // 复评中（初评已完成，复评进行中）
      2: [
        { batchNo: 1, round: '初评', workIds: [4, 5], judgeId: 1, judgeName: '王教授', done: 2 },
        { batchNo: 2, round: '初评', workIds: [6], judgeId: 2, judgeName: '陈园长', done: 1 },
        { batchNo: 1, round: '复评', workIds: [4, 5, 6], judgeId: 3, judgeName: '刘教研员', done: 1 },
      ],
      // 评审完成（初评 + 复评均已完成）
      9: [
        { batchNo: 1, round: '初评', workIds: [8, 9], judgeId: 2, judgeName: '陈园长', done: 2 },
        { batchNo: 2, round: '初评', workIds: [10], judgeId: 3, judgeName: '刘教研员', done: 1 },
        { batchNo: 1, round: '复评', workIds: [8, 9, 10], judgeId: 1, judgeName: '王教授', done: 3 },
      ],
      // 区域活动观察记录评比：初评 / 复评均已完成，待发布结果
      10: [
        { batchNo: 1, round: '初评', workIds: [11, 12], judgeId: 1, judgeName: '王教授', done: 2 },
        { batchNo: 1, round: '复评', workIds: [11, 12], judgeId: 2, judgeName: '陈园长', done: 2 },
      ],
    },

    /* 月度常规勋章积分方案（固定唯一 · 始终生效 · 不可复制） */
    monthlyScheme: {
      id: 1,
      name: '月度常规勋章积分方案',
      updatedAt: '2026-08-01 更新',
      dimensions: [
        { key: 'usage', name: '平台使用', points: 5, weight: 30, enabled: true, headCoef: 1.0, assocCoef: 0.8 },
        { key: 'interaction', name: '家园互动', points: 8, weight: 35, enabled: true, headCoef: 1.0, assocCoef: 1.0 },
        { key: 'promotion', name: '外部推广', points: 15, weight: 20, enabled: true, headCoef: 1.0, assocCoef: 1.2 },
        { key: 'conversion', name: '会员转化', points: 20, weight: 15, enabled: true, headCoef: 1.0, assocCoef: 1.0 },
      ],
    },

    /* 活动方案（可多套 · 可复制 · 对应关联活动；参与对象由关联活动界定） */
    /* bonusRules：该专项活动独立配置的一套活动奖金体系（活动金/银/铜 → 奖金），与月度勋章奖金分开核算 */
    activitySchemes: [
      {
        id: 1,
        name: '秋季家园共育案例评选专项积分方案',
        activityId: 8,
        cycleStart: '2026-08-10',
        cycleEnd: '2026-09-20',
        awardRules: [
          { level: '一等奖', points: 100 },
          { level: '二等奖', points: 60 },
          { level: '三等奖', points: 30 },
          { level: '参与奖', points: 10 },
        ],
        bonusRules: [
          { level: '活动金', amount: 600 },
          { level: '活动银', amount: 400 },
          { level: '活动铜', amount: 200 },
        ],
        updatedAt: '2026-08-10 更新',
      },
      {
        id: 2,
        name: '亲子阅读打卡专项积分方案',
        activityId: 5,
        cycleStart: '2026-03-01',
        cycleEnd: '2026-04-30',
        awardRules: [
          { level: '一等奖', points: 80 },
          { level: '二等奖', points: 50 },
          { level: '三等奖', points: 20 },
        ],
        bonusRules: [
          { level: '活动金', amount: 500 },
          { level: '活动银', amount: 300 },
          { level: '活动铜', amount: 150 },
        ],
        updatedAt: '2026-04-28 更新',
      },
    ],

    /* 规则生效记录（方案切换历史） */
    scoreLogs: [
      { id: 1, scheme: '月度常规勋章积分方案', action: '启用', operator: '管理员', time: '2026-08-01 09:30' },
      { id: 2, scheme: '临时专项活动积分方案', action: '启用', operator: '管理员', time: '2026-08-05 14:00' },
      { id: 3, scheme: '月度常规勋章积分方案', action: '切回启用', operator: '管理员', time: '2026-08-06 10:20' },
      { id: 4, scheme: '月度常规勋章积分方案', action: '修改权重', operator: '管理员', time: '2026-07-28 16:45' },
    ],

    /* 勋章门槛（金银铜双套，对齐需求文档 4.1） */
    medalThresholds: [
      { id: 1, set: '月度常规勋章门槛', gold: 500, silver: 300, bronze: 150, note: '月度结算积分达门槛授予对应等级勋章' },
      { id: 2, set: '活动专项勋章门槛', gold: 400, silver: 240, bronze: 120, note: '专项活动总积分达门槛授予对应等级勋章' },
    ],

    /* 教师勋章档案（历史每月勋章，永久留存） */
    medals: [
      { id: 1, teacher: '张慧', className: '中一班', period: '2026-07', type: '月度常规', level: '金', activity: '—', usage: 520, interaction: 610, promotion: 380, conversion: 300, total: 1810, rank: 2 },
      { id: 2, teacher: '李娜', className: '小一班', period: '2026-07', type: '月度常规', level: '银', activity: '—', usage: 480, interaction: 520, promotion: 420, conversion: 260, total: 1680, rank: 4 },
      { id: 3, teacher: '王强', className: '大一班', period: '2026-07', type: '月度常规', level: '铜', activity: '—', usage: 420, interaction: 460, promotion: 300, conversion: 240, total: 1420, rank: 7 },
      { id: 4, teacher: '张慧', className: '中一班', period: '2026-06', type: '月度常规', level: '金', activity: '—', usage: 500, interaction: 580, promotion: 360, conversion: 320, total: 1760, rank: 1 },
      { id: 5, teacher: '李娜', className: '小一班', period: '2026-06', type: '月度常规', level: '银', activity: '—', usage: 460, interaction: 500, promotion: 400, conversion: 250, total: 1610, rank: 5 },
      { id: 6, teacher: '张慧', className: '中一班', period: '2026-05', type: '活动专项', level: '金', activity: '六一主题环创比赛', usage: 300, interaction: 420, promotion: 280, conversion: 200, total: 1200, rank: 1 },
      { id: 7, teacher: '陈晨', className: '中一班', period: '2026-07', type: '活动专项', level: '银', activity: '课件制作技能大赛', usage: 280, interaction: 360, promotion: 300, conversion: 220, total: 1160, rank: 3 },
      { id: 8, teacher: '刘洋', className: '大一班', period: '2026-06', type: '月度常规', level: '银', activity: '—', usage: 470, interaction: 540, promotion: 340, conversion: 280, total: 1630, rank: 3 },
      // 2026-07 月度常规勋章（补齐赵敏/孙悦，与月度发放清单 mock 一致，供「自动生成当月发放清单」演示）
      { id: 9, teacher: '赵敏', className: '小一班', period: '2026-07', type: '月度常规', level: '银', activity: '—', usage: 460, interaction: 500, promotion: 380, conversion: 270, total: 1610, rank: 5 },
      { id: 10, teacher: '孙悦', className: '中一班', period: '2026-07', type: '月度常规', level: '铜', activity: '—', usage: 400, interaction: 450, promotion: 320, conversion: 230, total: 1400, rank: 9 },
      // 亲子阅读打卡活动专项勋章（关联专项活动奖金方案：活动金500/活动银300/活动铜150，供期末汇总「月度+专项合并统计」演示）
      { id: 11, teacher: '张慧', className: '中一班', period: '2026-04', type: '活动专项', level: '金', activity: '亲子阅读打卡活动', usage: 320, interaction: 400, promotion: 260, conversion: 180, total: 1160, rank: 2 },
      { id: 12, teacher: '李娜', className: '小一班', period: '2026-04', type: '活动专项', level: '银', activity: '亲子阅读打卡活动', usage: 300, interaction: 360, promotion: 240, conversion: 160, total: 1060, rank: 4 },
      { id: 13, teacher: '王强', className: '大一班', period: '2026-04', type: '活动专项', level: '铜', activity: '亲子阅读打卡活动', usage: 280, interaction: 320, promotion: 220, conversion: 150, total: 970, rank: 6 },
    ],

    /* 月度勋章奖金梯度（勋章等级 ↔ 月度奖金标准，纯配置面板，需求文档 5.1；固定唯一 · 每月勋章等级自动绑定） */
    /* 专项活动奖金按活动方案独立配置（见 activitySchemes[].bonusRules），与月度勋章奖金分开核算 */
    bonusGradients: [
      { id: 1, level: '金', amount: 800, note: '月度勋章等级 · 金牌' },
      { id: 2, level: '银', amount: 500, note: '月度勋章等级 · 银牌' },
      { id: 3, level: '铜', amount: 300, note: '月度勋章等级 · 铜牌' },
    ],

    /* 月度发放清单（含离职剔除标注，需求文档 5.3） */
    monthlyBonus: [
      { id: 1, teacher: '张慧', className: '中一班', medal: '金', bonus: 800, usage: 520, interaction: 610, promotion: 380, conversion: 300, total: 1810, status: '正常', remark: '' },
      { id: 2, teacher: '李娜', className: '小一班', medal: '银', bonus: 500, usage: 480, interaction: 520, promotion: 420, conversion: 260, total: 1680, status: '正常', remark: '' },
      { id: 3, teacher: '王强', className: '大一班', medal: '铜', bonus: 300, usage: 420, interaction: 460, promotion: 300, conversion: 240, total: 1420, status: '正常', remark: '' },
      { id: 4, teacher: '赵敏', className: '小一班', medal: '银', bonus: 500, usage: 460, interaction: 500, promotion: 380, conversion: 270, total: 1610, status: '正常', remark: '' },
      { id: 5, teacher: '孙悦', className: '中一班', medal: '铜', bonus: 300, usage: 400, interaction: 450, promotion: 320, conversion: 230, total: 1400, status: '已剔除', remark: '6 月离职，放弃评比资格（不影响历史数据）' },
    ],

    /* 期末汇总清单 */
    semesterBonus: [
      { id: 1, teacher: '张慧', className: '中一班', medals: '金×3 / 银×2', monthBonus: 3400, activityBonus: 1800, total: 5200, status: '正常' },
      { id: 2, teacher: '李娜', className: '小一班', medals: '银×4 / 铜×2', monthBonus: 2600, activityBonus: 1000, total: 3600, status: '正常' },
      { id: 3, teacher: '王强', className: '大一班', medals: '铜×5', monthBonus: 1500, activityBonus: 400, total: 1900, status: '正常' },
      { id: 4, teacher: '孙悦', className: '中一班', medals: '铜×2', monthBonus: 600, activityBonus: 0, total: 600, status: '已剔除', remark: '6 月离职，放弃评比资格' },
    ],

    /* 幼儿园（活动对象多选维度） */
    kindergartens: [
      { id: 1, name: '童蹊幼儿园' },
      { id: 2, name: '阳光幼儿园' },
      { id: 3, name: '蓝天幼儿园' },
    ],

    /* 教师信息（含离职状态字段 is_active，需求文档 5.3 离职判定依据；含所属幼儿园） */
    teachers: [
      { id: 1, name: '张慧', gender: '女', phone: '138****0001', className: '中一班', kindergarten: '童蹊幼儿园', role: '班主任', hireDate: '2023-09-01', status: '在职', isActive: true },
      { id: 2, name: '李娜', gender: '女', phone: '139****0002', className: '小一班', kindergarten: '童蹊幼儿园', role: '班主任', hireDate: '2022-03-15', status: '在职', isActive: true },
      { id: 3, name: '王强', gender: '男', phone: '137****0003', className: '大一班', kindergarten: '童蹊幼儿园', role: '班主任', hireDate: '2024-02-20', status: '在职', isActive: true },
      { id: 4, name: '赵敏', gender: '女', phone: '136****0004', className: '小一班', kindergarten: '童蹊幼儿园', role: '配班', hireDate: '2023-06-01', status: '在职', isActive: true },
      { id: 5, name: '陈晨', gender: '女', phone: '135****0005', className: '中一班', kindergarten: '童蹊幼儿园', role: '配班', hireDate: '2021-09-01', status: '在职', isActive: true },
      { id: 6, name: '刘洋', gender: '男', phone: '134****0006', className: '大一班', kindergarten: '童蹊幼儿园', role: '配班', hireDate: '2020-08-10', status: '在职', isActive: true },
      // leaveReason：离职时记录的评比资格放弃原因（期末汇总剔除清单标注依据）
      { id: 7, name: '孙悦', gender: '女', phone: '133****0007', className: '中一班', kindergarten: '阳光幼儿园', role: '配班', hireDate: '2024-09-01', status: '离职', isActive: false, leaveReason: '6 月离职，放弃评比资格' },
      { id: 8, name: '周涛', gender: '男', phone: '132****0008', className: '大一班', kindergarten: '阳光幼儿园', role: '班主任', hireDate: '2019-05-20', status: '在职', isActive: true },
      { id: 9, name: '吴倩', gender: '女', phone: '131****0009', className: '小一班', kindergarten: '蓝天幼儿园', role: '配班', hireDate: '2025-03-01', status: '在职', isActive: true },
      { id: 10, name: '郑爽', gender: '女', phone: '130****0010', className: '中一班', kindergarten: '蓝天幼儿园', role: '班主任', hireDate: '2023-11-15', status: '在职', isActive: true },
    ],

    /* 班级 */
    classes: [
      { id: 1, name: '小一班', head: '李娜', students: 32, registeredParents: 30, activeMembers: 24 },
      { id: 2, name: '中一班', head: '张慧', students: 35, registeredParents: 33, activeMembers: 27 },
      { id: 3, name: '大一班', head: '王强', students: 33, registeredParents: 31, activeMembers: 25 },
    ],

    /* 系统基础配置（结算日可配置，需求文档 6.4） */
    sysConfig: {
      semester: '2025-2026 第二学期',
      year: '2026 年度',
      settleDay: '每月最后一日',
      rankRefresh: '实时（精确到分钟）',
      bonusDate: '次月 5 日',
    },

    /* 操作日志 */
    sysLogs: [
      { id: 1, user: '管理员', module: '积分方案管理', action: '启用「月度常规勋章积分方案」', time: '2026-08-01 09:30' },
      { id: 2, user: '管理员', module: '勋章门槛配置', action: '修改金奖门槛 500 → 480', time: '2026-08-02 11:20' },
      { id: 3, user: '管理员', module: '活动管理', action: '发布「家园互动创意活动评选」', time: '2026-08-03 15:00' },
      { id: 4, user: '李园长', module: '教师管理', action: '将孙悦标记为离职', time: '2026-08-05 10:10' },
    ],

    /* 园内排行榜数据（5 榜：综合/平台使用/家园互动/外部推广/会员转化，含本人定位） */
    rankData: {
      total: [
        { rank: 1, name: '郑爽', className: '中一班', score: 2150, trend: 'up', isMe: false },
        { rank: 2, name: '张慧', className: '中一班', score: 1960, trend: 'up', isMe: true },
        { rank: 3, name: '刘洋', className: '大一班', score: 1780, trend: 'down', isMe: false },
        { rank: 4, name: '李娜', className: '小一班', score: 1690, trend: 'flat', isMe: false },
        { rank: 5, name: '赵敏', className: '小一班', score: 1560, trend: 'up', isMe: false },
        { rank: 6, name: '陈晨', className: '中一班', score: 1480, trend: 'down', isMe: false },
        { rank: 7, name: '王强', className: '大一班', score: 1320, trend: 'up', isMe: false },
        { rank: 8, name: '吴倩', className: '小一班', score: 1240, trend: 'down', isMe: false },
        { rank: 9, name: '周涛', className: '大一班', score: 1180, trend: 'flat', isMe: false },
        { rank: 10, name: '孙悦', className: '中一班', score: 960, trend: 'down', isMe: false },
      ],
      usage: [
        { rank: 1, name: '郑爽', className: '中一班', score: 640, trend: 'up', isMe: false },
        { rank: 2, name: '张慧', className: '中一班', score: 520, trend: 'up', isMe: true },
        { rank: 3, name: '李娜', className: '小一班', score: 480, trend: 'flat', isMe: false },
        { rank: 4, name: '刘洋', className: '大一班', score: 470, trend: 'down', isMe: false },
        { rank: 5, name: '赵敏', className: '小一班', score: 460, trend: 'up', isMe: false },
        { rank: 6, name: '陈晨', className: '中一班', score: 440, trend: 'up', isMe: false },
        { rank: 7, name: '王强', className: '大一班', score: 420, trend: 'down', isMe: false },
        { rank: 8, name: '吴倩', className: '小一班', score: 400, trend: 'flat', isMe: false },
        { rank: 9, name: '周涛', className: '大一班', score: 380, trend: 'up', isMe: false },
        { rank: 10, name: '孙悦', className: '中一班', score: 320, trend: 'down', isMe: false },
      ],
      interaction: [
        { rank: 1, name: '张慧', className: '中一班', score: 610, trend: 'up', isMe: true },
        { rank: 2, name: '郑爽', className: '中一班', score: 590, trend: 'up', isMe: false },
        { rank: 3, name: '李娜', className: '小一班', score: 520, trend: 'flat', isMe: false },
        { rank: 4, name: '刘洋', className: '大一班', score: 540, trend: 'up', isMe: false },
        { rank: 5, name: '赵敏', className: '小一班', score: 500, trend: 'down', isMe: false },
        { rank: 6, name: '陈晨', className: '中一班', score: 480, trend: 'up', isMe: false },
        { rank: 7, name: '王强', className: '大一班', score: 460, trend: 'down', isMe: false },
        { rank: 8, name: '吴倩', className: '小一班', score: 430, trend: 'flat', isMe: false },
        { rank: 9, name: '周涛', className: '大一班', score: 410, trend: 'up', isMe: false },
        { rank: 10, name: '孙悦', className: '中一班', score: 350, trend: 'down', isMe: false },
      ],
      promotion: [
        { rank: 1, name: '李娜', className: '小一班', score: 420, trend: 'up', isMe: false },
        { rank: 2, name: '张慧', className: '中一班', score: 380, trend: 'up', isMe: true },
        { rank: 3, name: '陈晨', className: '中一班', score: 360, trend: 'up', isMe: false },
        { rank: 4, name: '郑爽', className: '中一班', score: 340, trend: 'down', isMe: false },
        { rank: 5, name: '王强', className: '大一班', score: 320, trend: 'flat', isMe: false },
        { rank: 6, name: '赵敏', className: '小一班', score: 310, trend: 'up', isMe: false },
        { rank: 7, name: '吴倩', className: '小一班', score: 290, trend: 'down', isMe: false },
        { rank: 8, name: '周涛', className: '大一班', score: 270, trend: 'flat', isMe: false },
        { rank: 9, name: '刘洋', className: '大一班', score: 260, trend: 'down', isMe: false },
        { rank: 10, name: '孙悦', className: '中一班', score: 200, trend: 'up', isMe: false },
      ],
      conversion: [
        { rank: 1, name: '郑爽', className: '中一班', score: 380, trend: 'up', isMe: false },
        { rank: 2, name: '张慧', className: '中一班', score: 300, trend: 'up', isMe: true },
        { rank: 3, name: '刘洋', className: '大一班', score: 280, trend: 'up', isMe: false },
        { rank: 4, name: '李娜', className: '小一班', score: 260, trend: 'flat', isMe: false },
        { rank: 5, name: '赵敏', className: '小一班', score: 240, trend: 'up', isMe: false },
        { rank: 6, name: '吴倩', className: '小一班', score: 220, trend: 'down', isMe: false },
        { rank: 7, name: '周涛', className: '大一班', score: 200, trend: 'flat', isMe: false },
        { rank: 8, name: '王强', className: '大一班', score: 190, trend: 'down', isMe: false },
        { rank: 9, name: '陈晨', className: '中一班', score: 180, trend: 'up', isMe: false },
        { rank: 10, name: '孙悦', className: '中一班', score: 150, trend: 'down', isMe: false },
      ],
    },

    /* 家长进度（班级维度：注册/未注册/会员激活 三色） */
    parentProgress: [
      { className: '小一班', total: 32, registered: 30, active: 24 },
      { className: '中一班', total: 35, registered: 33, active: 27 },
      { className: '大一班', total: 33, registered: 31, active: 25 },
    ],

    /* 教师个人多维数据看板（移动端 + PC 教师工作台统计排行，需求文档 2.3 / 统计排行描述）
       usage/interaction/promotion/conversion：四项计分维度（total 累计 / today 今日新增 / gap 距上一名差距 / rank 园内排名）
       trend：移动端通用趋势（本人/园内平均/当日第一，兼容旧渲染）
       duration：使用时长（分钟，需求 2）；durationTrend：每日时长分项（家园互动/日常工作 堆叠柱 + 合计折线，组合图表）
       conversionDetail：本班家长会员转化计数口径（注册量 + 会员人数，需求 4，区别于计分维度 conversion 的分值）
       *Trend：各维度按日趋势（折线图数据；top 语义为「当日第一」，非累计第一） */
    teacherScores: {
      usage: { total: 520, today: 12, gap: 120, rank: 2 },
      interaction: { total: 610, today: 18, gap: 40, rank: 1 },
      promotion: { total: 380, today: 6, gap: 40, rank: 2 },
      conversion: { total: 300, today: 4, gap: 80, rank: 2 },
      trend: [
        { date: '08-05', me: 126, avg: 102, top: 150 },
        { date: '08-06', me: 132, avg: 105, top: 155 },
        { date: '08-07', me: 128, avg: 104, top: 152 },
        { date: '08-08', me: 140, avg: 108, top: 158 },
        { date: '08-09', me: 145, avg: 110, top: 160 },
        { date: '08-10', me: 152, avg: 112, top: 163 },
        { date: '08-11', me: 160, avg: 115, top: 168 },
      ],
      /* 使用时长（需求 2）：total 累计 7716 分钟 = 128 小时 36 分；today 今日 135 分钟 */
      duration: { total: 7716, today: 135 },
      /* 本班家长会员转化（需求 4）：registered 注册账号数 / members 会员人数 / *Today 今日新增（+1/-1/持平） */
      conversionDetail: { registered: 33, members: 27, registeredToday: 1, membersToday: 2 },
      /* 使用平台功能总次数·按日趋势（需求 1）：本人 / 园内平均 / 当日第一 */
      usageTrend: [
        { date: '08-05', me: 46, avg: 40, top: 55 },
        { date: '08-06', me: 52, avg: 42, top: 60 },
        { date: '08-07', me: 48, avg: 41, top: 58 },
        { date: '08-08', me: 58, avg: 44, top: 62 },
        { date: '08-09', me: 55, avg: 45, top: 63 },
        { date: '08-10', me: 62, avg: 46, top: 66 },
        { date: '08-11', me: 68, avg: 48, top: 70 },
      ],
      /* 使用总时长·每日时长分项（需求 2）：home 家园互动 / work 日常工作 分钟数（合计 = 当日总时长） */
      durationTrend: [
        { date: '08-05', home: 35, work: 57 },
        { date: '08-06', home: 42, work: 66 },
        { date: '08-07', home: 30, work: 55 },
        { date: '08-08', home: 48, work: 72 },
        { date: '08-09', home: 45, work: 70 },
        { date: '08-10', home: 38, work: 60 },
        { date: '08-11', home: 52, work: 83 },
      ],
      /* 与家长互动频次·按日趋势（需求 3）：本人 / 园内平均 / 当日第一 */
      interactionTrend: [
        { date: '08-05', me: 58, avg: 46, top: 62 },
        { date: '08-06', me: 66, avg: 48, top: 70 },
        { date: '08-07', me: 60, avg: 47, top: 65 },
        { date: '08-08', me: 72, avg: 50, top: 74 },
        { date: '08-09', me: 78, avg: 52, top: 80 },
        { date: '08-10', me: 84, avg: 54, top: 82 },
        { date: '08-11', me: 90, avg: 55, top: 88 },
      ],
      /* 本班家长会员转化·按日趋势（需求 4）：registered 累计注册 / members 累计会员 */
      conversionTrend: [
        { date: '08-05', registered: 26, members: 20 },
        { date: '08-06', registered: 27, members: 21 },
        { date: '08-07', registered: 28, members: 22 },
        { date: '08-08', registered: 29, members: 23 },
        { date: '08-09', registered: 30, members: 24 },
        { date: '08-10', registered: 32, members: 25 },
        { date: '08-11', registered: 33, members: 27 },
      ],
    },

    /* 首页原始内容（对齐通用平台原型：出勤横幅 + 教师/园长功能宫格；点击提示仅演示激励体系） */
    homeAttendance: {
      teacher: { title: '班级出勤', sub: '已到 32 人 · 共 35 人', tag: '已到 32', tagClass: 'tag-present' },
      principal: { title: '全园出勤', sub: '已到 256 人 · 共 280 人', tag: '已到 256', tagClass: 'tag-present' },
    },
    homeGrid: {
      teacher: [
        {
          title: '日常工作',
          items: [
            { name: '观察记录', color: '#ff9800', bg: '#fff6e5', icon: '◉' },
            { name: '幼儿评语', color: '#6b3df5', bg: '#f3efff', icon: '☺' },
            { name: '发展评估', color: '#4ecdc4', bg: '#e8f8f7', icon: '▦' },
            { name: '健康档案', color: '#ff6b6b', bg: '#ffecec', icon: '♥' },
            { name: '综合评价', color: '#5c6bc0', bg: '#eef0ff', icon: '▣' },
            { name: '教研纪要', color: '#607d8b', bg: '#eceff1', icon: '▤' },
          ],
        },
        {
          title: '家园互动',
          items: [
            { name: '通知分享', color: '#f9ca24', bg: '#fffce8', icon: '☏' },
            { name: '在园生活', color: '#4facfe', bg: '#e6f4ff', icon: '▤' },
            { name: '习惯养成', color: '#4facfe', bg: '#e8f4fc', icon: '☑' },
            { name: '亲子任务', color: '#ff6b6b', bg: '#fff1f0', icon: '♥' },
            { name: '家庭时光', color: '#ff8a00', bg: '#fff5eb', icon: '⌂' },
            { name: '幼儿考勤', color: '#4facfe', bg: '#e8f4fc', icon: '✓' },
          ],
        },
      ],
      principal: [
        {
          title: '日常工作',
          items: [
            { name: '班级设置', color: '#2263ff', bg: '#eaf1ff', icon: '⌂' },
            { name: '幼儿考勤', color: '#4facfe', bg: '#e8f4fc', icon: '✓' },
            { name: '食堂报餐', color: '#ff9800', bg: '#fff6e5', icon: '▦' },
            { name: '安全日志', color: '#ff8a00', bg: '#fff5eb', icon: '☰' },
            { name: '综合评价', color: '#5c6bc0', bg: '#eef0ff', icon: '▣' },
          ],
        },
        {
          title: '家园互动',
          items: [
            { name: '通知分享', color: '#f9ca24', bg: '#fffce8', icon: '☏' },
            { name: '在园生活', color: '#4facfe', bg: '#e6f4ff', icon: '▤' },
            { name: '习惯养成', color: '#4facfe', bg: '#e8f4fc', icon: '☑' },
            { name: '亲子任务', color: '#ff6b6b', bg: '#fff1f0', icon: '♥' },
            { name: '家庭时光', color: '#ff8a00', bg: '#fff5eb', icon: '⌂' },
          ],
        },
      ],
    },

    /* 消息/通知（移动端消息中心 + 班级动态） */
    notices: [
      { id: 'n1', title: '【积分】8 月积分榜已更新', desc: '本园 8 月积分榜已实时更新，查看个人排名……', time: '今天 09:30', from: '系统', read: false },
      { id: 'n2', title: '【活动】课件大赛进入评审阶段', desc: '课件制作技能大赛已进入评审阶段，共 32 份作品……', time: '昨天 17:20', from: '管理员', read: false },
      { id: 'n3', title: '【勋章】7 月月度勋章已发放', desc: '您的 7 月勋章为「金牌」，查看勋章档案与奖金明细……', time: '08-01 08:00', from: '系统', read: true },
      { id: 'n4', title: '【奖金】7 月奖金清单已生成', desc: '7 月月度奖金清单已生成，请查看发放明细……', time: '08-02 10:15', from: '财务', read: true },
      { id: 'n5', title: '【活动】春季论文大赛截止提醒', desc: '2026 春季论文评选大赛将于 8 月 20 日截止提交……', time: '08-10 14:30', from: '管理员', read: false },
    ],

    /* 活动通知记录（活动 id → 通知列表；每条通知含接收对象及已读回执状态，需求文档 2.4 通知/回执）
       recipients 每位接收老师：read 是否已读 / readTime 阅读时间（未读为空串） */
    activityNotices: {
      '1': [
        {
          id: 'an1',
          title: '报名启动通知',
          content: '2026 春季论文评选大赛已正式启动，请在报名时间内登录平台上传作品，逾期不再受理。',
          sender: '管理员',
          sendTime: '2026-07-01 10:00',
          recipients: [
            { name: '张慧', kindergarten: '童蹊幼儿园', className: '中一班', read: true, readTime: '2026-07-01 10:23' },
            { name: '李娜', kindergarten: '童蹊幼儿园', className: '小一班', read: true, readTime: '2026-07-01 11:05' },
            { name: '王强', kindergarten: '童蹊幼儿园', className: '大一班', read: true, readTime: '2026-07-01 15:40' },
            { name: '赵敏', kindergarten: '童蹊幼儿园', className: '小一班', read: false, readTime: '' },
            { name: '陈晨', kindergarten: '童蹊幼儿园', className: '中一班', read: false, readTime: '' },
            { name: '刘洋', kindergarten: '童蹊幼儿园', className: '大一班', read: false, readTime: '' },
            { name: '周涛', kindergarten: '阳光幼儿园', className: '大一班', read: true, readTime: '2026-07-02 08:12' },
            { name: '吴倩', kindergarten: '蓝天幼儿园', className: '小一班', read: false, readTime: '' },
            { name: '郑爽', kindergarten: '蓝天幼儿园', className: '中一班', read: false, readTime: '' },
          ],
        },
      ],
      '3': [
        {
          id: 'an2',
          title: '作品提交提醒',
          content: '家园互动创意活动评选作品提交将于 9 月 15 日截止，请尽早准备并上传参赛作品。',
          sender: '管理员',
          sendTime: '2026-08-05 09:30',
          recipients: [
            { name: '张慧', kindergarten: '童蹊幼儿园', className: '中一班', read: true, readTime: '2026-08-05 10:02' },
            { name: '李娜', kindergarten: '童蹊幼儿园', className: '小一班', read: false, readTime: '' },
            { name: '王强', kindergarten: '童蹊幼儿园', className: '大一班', read: false, readTime: '' },
            { name: '赵敏', kindergarten: '童蹊幼儿园', className: '小一班', read: true, readTime: '2026-08-05 09:58' },
            { name: '陈晨', kindergarten: '童蹊幼儿园', className: '中一班', read: false, readTime: '' },
            { name: '刘洋', kindergarten: '童蹊幼儿园', className: '大一班', read: false, readTime: '' },
            { name: '周涛', kindergarten: '阳光幼儿园', className: '大一班', read: false, readTime: '' },
            { name: '吴倩', kindergarten: '蓝天幼儿园', className: '小一班', read: false, readTime: '' },
            { name: '郑爽', kindergarten: '蓝天幼儿园', className: '中一班', read: true, readTime: '2026-08-05 12:11' },
          ],
        },
      ],
    },

    /* 电子奖状模板：背景（预设/上传图）+ 模板内容（含 {{变量}} 占位）+ 绑定到活动 */
    /* backgroundType：preset 预设样式 / image 上传背景图（background 存 data URL） */
    certTemplates: [
      {
        id: 1,
        name: '荣誉奖状 · 红金经典',
        backgroundType: 'preset',
        background: 'red-gold',
        content: '兹授予 {{教师姓名}} 老师\n在「{{活动名称}}」活动中\n荣获 {{奖项等级}}\n特发此状，以资鼓励。\n{{幼儿园}} · {{获奖日期}}',
      },
      {
        id: 2,
        name: '荣誉证书 · 蓝金典雅',
        backgroundType: 'preset',
        background: 'blue-gold',
        content: '{{教师姓名}}（{{班级}}）\n在「{{活动名称}}」中表现优异\n荣获 {{奖项等级}}\n{{幼儿园}} · {{获奖日期}}',
      },
      {
        id: 3,
        name: '优秀教师证书 · 简约白',
        backgroundType: 'preset',
        background: 'plain-white',
        content: '恭喜 {{教师姓名}} 老师\n于「{{活动名称}}」\n获得 {{奖项等级}}\n{{获奖日期}}',
      },
    ],
  };

  var MUTABLE_KEYS = ['activities', 'medals', 'reviewRecords', 'reviewBatches', 'notices', 'activityNotices', 'activitySchemes', 'bonusGradients', 'certTemplates', 'teacherSignups'];

  /* ────────────────────────── PC 端界面状态（可持久化，重置时恢复默认） ────────────────────────── */
  var UI_DEFAULTS = {
    pcTags: [],
    pcActiveTag: '',
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

  function currentRole() {
    var r = cache.role;
    return ROLE_KEYS.indexOf(r) >= 0 ? r : 'admin';
  }

  /* ────────────────────────── 对外 API ────────────────────────── */
  var MDS = {
    ROLES: ROLES,
    ROLE_KEYS: ROLE_KEYS,
    TAB_BARS: TAB_BARS,
    PC_MENUS: PC_MENUS,
    ACTIVITY_STATUS: ACTIVITY_STATUS,

    /* 初始化：逐键读 localStorage，缺失用 mock 补齐写回；role 缺省 admin */
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
      // 状态机兼容迁移：活动仅保留两态（未发布/已发布）。
      // 旧版本 localStorage 残留的旧状态统一归一为已发布：
      //   COLLECTING / REVIEWING / FINISHED / ARCHIVED / ENDED → PUBLISHED
      // 已发布活动若缺发布时间，则从 mock 种子按 id 补齐，保证旧缓存数据也有发布时间展示
      if (Array.isArray(cache.activities)) {
        var migrated = false;
        cache.activities.forEach(function (a) {
          if (a.status === 'COLLECTING' || a.status === 'REVIEWING' || a.status === 'FINISHED' || a.status === 'ARCHIVED' || a.status === 'ENDED') {
            a.status = 'PUBLISHED';
            migrated = true;
          }
          if (a.status === 'PUBLISHED' && !a.publishTime) {
            var seedAct = MOCK.activities.filter(function (m) { return m.id === a.id; })[0];
            if (seedAct && seedAct.publishTime) {
              a.publishTime = seedAct.publishTime;
              migrated = true;
            }
          }
          // 旧版 award 字符串 → awards 数组（奖项设置 CRUD 表格数据）
          if (!Array.isArray(a.awards)) {
            a.awards = parseAwardStr(a.award);
            delete a.award;
            migrated = true;
          }
          // 电子奖状模板绑定：旧缓存活动缺 certTemplateId 时，按 id 从 mock 种子补齐
          if (a.certTemplateId == null) {
            var seedAct2 = MOCK.activities.filter(function (m) { return m.id === a.id; })[0];
            if (seedAct2 && seedAct2.certTemplateId != null) {
              a.certTemplateId = seedAct2.certTemplateId;
              migrated = true;
            }
          }
          // 作品提交截止（缺省=报名截止）与补交开关（缺省关闭）
          var seedAct3 = MOCK.activities.filter(function (m) { return m.id === a.id; })[0];
          if (a.workDeadline == null) {
            a.workDeadline = (seedAct3 && seedAct3.workDeadline) ? seedAct3.workDeadline : (a.signupEnd || '');
            migrated = true;
          }
          if (a.supplementEnabled == null) {
            a.supplementEnabled = !!(seedAct3 && seedAct3.supplementEnabled);
            migrated = true;
          }
        });
        if (migrated) {
          lsSet('activities', cache.activities);
        }
      }
      // 奖金梯度兼容迁移：旧版为「金/银/铜 + 活动金/银/铜」单列表 → 归一为仅月度 金/银/铜 三项
      // （专项活动奖金已独立到 activitySchemes[].bonusRules，与月度勋章奖金分开核算）
      if (Array.isArray(cache.bonusGradients)) {
        var MONTHLY_LEVELS = { '金': true, '银': true, '铜': true };
        cache.bonusGradients = cache.bonusGradients.filter(function (g) { return !!MONTHLY_LEVELS[g.level]; });
        var bgSeed = JSON.parse(JSON.stringify(MOCK.bonusGradients));
        var bgMigrated = false;
        bgSeed.forEach(function (seed) {
          var exists = cache.bonusGradients.some(function (g) { return g.level === seed.level; });
          if (!exists) {
            cache.bonusGradients.push(seed);
            bgMigrated = true;
          }
        });
        if (bgMigrated) lsSet('bonusGradients', cache.bonusGradients);
      }
      // 活动方案兼容迁移：确保每个专项活动方案含 bonusRules（缺失时按 mock 种子补齐）
      if (Array.isArray(cache.activitySchemes)) {
        var asMigrated = false;
        cache.activitySchemes.forEach(function (s) {
          if (!Array.isArray(s.bonusRules)) {
            var seed = (MOCK.activitySchemes || []).filter(function (m) { return m.id === s.id; })[0];
            s.bonusRules = seed && seed.bonusRules
              ? JSON.parse(JSON.stringify(seed.bonusRules))
              : [{ level: '活动金', amount: 0 }, { level: '活动银', amount: 0 }, { level: '活动铜', amount: 0 }];
            asMigrated = true;
          }
        });
        if (asMigrated) lsSet('activitySchemes', cache.activitySchemes);
      }
      // 只读 mock（不入库）：幼儿园/活动类型/作品/门槛/榜单/首页原始内容等演示数据
      // （activitySchemes / bonusGradients 已移入 MUTABLE_KEYS 持久化，奖金梯度与活动奖金规则可编辑保留）
      ['kindergartens', 'activityTypes', 'works', 'judges', 'monthlyScheme', 'scoreLogs', 'medalThresholds', 'monthlyBonus', 'semesterBonus', 'teachers', 'classes', 'sysConfig', 'sysLogs', 'rankData', 'parentProgress', 'teacherScores', 'homeAttendance', 'homeGrid'].forEach(function (key) {
        cache[key] = JSON.parse(JSON.stringify(MOCK[key]));
      });
      var role = lsGet('role');
      cache.role = ROLE_KEYS.indexOf(role) >= 0 ? role : 'admin';
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
        case 'tabBar':
          return TAB_BARS[currentRole()] || [];
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

    /* 切换角色：写 role（入库），并 notify role */
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
  };

  return MDS;
})();
