/**
 * ============================================================
 * 童蹊积分勋章激励体系 · 原型演示系统 页面渲染 + 业务交互（window.MedalDemo）
 * 依赖：medal-data.js（window.MDS）、prototype.js（window.Proto）
 * 用途：
 *   - 角色解析（URL 参数 > localStorage > 默认 admin）
 *   - 自动注入角色切换浮动按钮/面板（5 角色）
 *   - PC 端管理台外壳：侧边栏菜单按角色动态渲染 + TagsView 联动 + 内容区切换
 *   - 核心闭环页面渲染：活动/作品/排行榜/积分方案/勋章/奖金/教师管理
 *   - 移动端 5 Tab 角色化渲染：首页/活动/排行榜/我的勋章/我的
 * 数据流：UI action → MDS.set/update → watch → render 重绘
 * 对应文档：2026-08-11-01 需求拆解 / 2026-08-11-02 菜单模块设计
 * ============================================================
 */

window.MedalDemo = (function () {
  'use strict';

  /* ═══════════════════════ 工具函数 ═══════════════════════ */

  function qs(sel) {
    return document.querySelector(sel);
  }

  function esc(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function getParam(name) {
    var m = location.search.match(new RegExp('[?&]' + name + '=([^&]+)'));
    return m ? decodeURIComponent(m[1]) : '';
  }

  /* 当前日期（yyyy-MM-dd，用于活动发布时记录发布时间） */
  function todayStr() {
    var d = new Date();
    var mm = ('0' + (d.getMonth() + 1)).slice(-2);
    var dd = ('0' + d.getDate()).slice(-2);
    return d.getFullYear() + '-' + mm + '-' + dd;
  }

  /* 解析当前角色：URL ?role= 参数优先，其次 localStorage，缺省 admin */
  function resolveRole() {
    var fromUrl = getParam('role');
    if (fromUrl && MDS.ROLE_KEYS.indexOf(fromUrl) >= 0) {
      MDS.setRole(fromUrl);
      return fromUrl;
    }
    return MDS.get('role');
  }

  function currentRole() {
    return window.__medalRole || 'admin';
  }

  /* ═══════════════════════ 角色切换浮动按钮 / 面板（复用 demo.css 类） ═══════════════════════ */

  function injectRoleFab() {
    if (document.getElementById('roleFab')) return;

    var fab = document.createElement('div');
    fab.id = 'roleFab';
    fab.className = 'mb-role-fab';
    fab.textContent = '⚙';
    fab.title = '角色切换 / 重置数据';
    fab.setAttribute('data-action', 'role-fab-toggle');
    document.body.appendChild(fab);

    var panel = document.createElement('div');
    panel.id = 'rolePanel';
    panel.className = 'role-panel';
    panel.hidden = true;

    var title = document.createElement('div');
    title.className = 'role-panel-title';
    title.textContent = '切换演示角色';
    panel.appendChild(title);

    var list = document.createElement('div');
    list.className = 'role-list';
    MDS.ROLE_KEYS.forEach(function (key) {
      var item = document.createElement('div');
      item.className = 'role-item' + (key === currentRole() ? ' is-current' : '');
      item.setAttribute('data-action', 'role-switch');
      item.setAttribute('data-role', key);
      var dot = document.createElement('span');
      dot.className = 'role-dot';
      dot.style.background = { admin: '#2563eb', principal: '#a855f7', teacher: '#66cc99', judge: '#f59e0b', parent: '#ff8a00' }[key] || '#ff8a00';
      var txt = document.createElement('span');
      txt.textContent = MDS.ROLES[key].name;
      item.appendChild(dot);
      item.appendChild(txt);
      list.appendChild(item);
    });
    panel.appendChild(list);

    var ops = document.createElement('div');
    ops.className = 'role-ops';
    var resetBtn = document.createElement('button');
    resetBtn.className = 'btn-reset';
    resetBtn.type = 'button';
    resetBtn.textContent = '重置演示数据';
    resetBtn.setAttribute('data-action', 'reset-demo');
    var indexBtn = document.createElement('button');
    indexBtn.className = 'btn-index';
    indexBtn.type = 'button';
    indexBtn.textContent = '返回入口';
    indexBtn.setAttribute('data-action', 'goto-index');
    ops.appendChild(resetBtn);
    ops.appendChild(indexBtn);
    panel.appendChild(ops);

    document.body.appendChild(panel);

    document.addEventListener('click', function (e) {
      if (e.target.closest('#roleFab') || e.target.closest('#rolePanel')) return;
      panel.hidden = true;
    });
  }

  /* ═══════════════════════ PC 端：动态菜单 + TagsView 联动（逻辑对齐 demo.js） ═══════════════════════ */

  function pcMenus() {
    return MDS.get('pcMenus') || [];
  }

  /* 非侧边栏菜单的可打开页面（不挂在菜单树中，但可从活动列表等入口进入，保留标签/面包屑） */
  var EXTRA_PAGES = {
    'activity-works': { groupTitle: '活动管理', title: '作品管理' },
  };

  function findMenuByKey(key) {
    var menus = pcMenus();
    for (var i = 0; i < menus.length; i++) {
      var children = menus[i].children || [];
      for (var j = 0; j < children.length; j++) {
        if (children[j].key === key) {
          return { groupTitle: menus[i].title, key: children[j].key, title: children[j].title };
        }
      }
    }
    var extra = EXTRA_PAGES[key];
    if (extra) {
      return { groupTitle: extra.groupTitle, key: key, title: extra.title };
    }
    return null;
  }

  function defaultMenuKey() {
    var menus = pcMenus();
    for (var i = 0; i < menus.length; i++) {
      var children = menus[i].children || [];
      if (children.length) return children[0].key;
    }
    return '';
  }

  function resolveActiveKey() {
    var fromUrl = getParam('menu');
    if (fromUrl && findMenuByKey(fromUrl)) return fromUrl;
    var saved = MDS.get('pcActiveTag');
    if (saved && findMenuByKey(saved)) return saved;
    return defaultMenuKey();
  }

  function normalizeTags(tags) {
    var menuKeys = {};
    pcMenus().forEach(function (g) {
      (g.children || []).forEach(function (c) {
        menuKeys[c.key] = c.title;
      });
    });
    // 隐藏页（如活动列表进入的作品管理）同样允许出现在标签中
    Object.keys(EXTRA_PAGES).forEach(function (key) {
      menuKeys[key] = EXTRA_PAGES[key].title;
    });
    var out = [];
    var seen = {};
    (tags || []).forEach(function (t) {
      var title = menuKeys[t.key];
      if (!title || seen[t.key]) return;
      seen[t.key] = true;
      out.push({ key: t.key, title: title });
    });
    return out;
  }

  function seedPcActive() {
    var active = resolveActiveKey();
    MDS.set('pcActiveTag', active);
    var tags = normalizeTags(MDS.get('pcTags'));
    if (active) {
      var exists = tags.some(function (t) { return t.key === active; });
      if (!exists) {
        var info = findMenuByKey(active);
        if (info) tags = tags.concat([{ key: info.key, title: info.title }]);
      }
    }
    MDS.set('pcTags', tags);
  }

  function ensureActiveState() {
    var active = MDS.get('pcActiveTag');
    if (active && !findMenuByKey(active)) active = '';
    var tags = normalizeTags(MDS.get('pcTags'));
    if (active) {
      var exists = tags.some(function (t) { return t.key === active; });
      if (!exists) {
        var info = findMenuByKey(active);
        if (info) tags = tags.concat([{ key: info.key, title: info.title }]);
      }
    }
    MDS.set('pcTags', tags);
    MDS.set('pcActiveTag', active);
  }

  function activateTag(key) {
    var info = findMenuByKey(key);
    if (!info) return;
    var tags = normalizeTags(MDS.get('pcTags'));
    var exists = tags.some(function (t) { return t.key === key; });
    if (!exists) {
      tags = tags.concat([{ key: info.key, title: info.title }]);
    }
    MDS.set('pcTags', tags);
    MDS.set('pcActiveTag', key);
    renderPcShell();
  }

  function closeTag(key) {
    if (!key) return;
    var tags = normalizeTags(MDS.get('pcTags'));
    var idx = -1;
    tags.forEach(function (t, i) {
      if (t.key === key) idx = i;
    });
    if (idx < 0) return;
    var active = MDS.get('pcActiveTag');
    if (active === key) {
      var rest = tags.filter(function (t) { return t.key !== key; });
      var neighbor = rest.length ? rest[Math.min(idx, rest.length - 1)] : null;
      active = neighbor ? neighbor.key : '';
    }
    tags.splice(idx, 1);
    MDS.set('pcTags', tags);
    MDS.set('pcActiveTag', active);
    renderPcShell();
  }

  function closeOtherTags() {
    var active = MDS.get('pcActiveTag');
    var info = findMenuByKey(active);
    MDS.set('pcTags', info ? [{ key: info.key, title: info.title }] : []);
    MDS.set('pcActiveTag', active);
    renderPcShell();
  }

  function closeAllTags() {
    MDS.set('pcTags', []);
    MDS.set('pcActiveTag', '');
    renderPcShell();
  }

  function renderPcMenu() {
    var root = document.getElementById('pcMenuRoot');
    if (!root) return;
    var menus = pcMenus();
    var active = MDS.get('pcActiveTag');
    var expanded = MDS.get('pcExpanded') || [];
    var collapsed = !!document.querySelector('.pc-sidebar.is-collapsed');

    if (!menus.length) {
      root.innerHTML = '<div style="padding:20px 14px;font-size:13px;color:#909399;line-height:1.8;">当前角色暂无<br>PC 后台菜单</div>';
      return;
    }

    var html = '';
    menus.forEach(function (group) {
      var children = group.children || [];
      var isOpen = collapsed ? false : expanded.indexOf(group.title) >= 0 || children.some(function (c) { return c.key === active; });
      html +=
        '<div class="pc-menu-parent' + (isOpen ? ' is-open' : '') + '" data-action="pc-menu-toggle" data-menu-parent="' + esc(group.title) + '">' +
        '<span class="parent-title">' + esc(group.title) + '</span>' +
        '<span class="parent-char">' + esc(group.title.charAt(0)) + '</span>' +
        '<span class="parent-arrow">▸</span>' +
        '</div>';
      html += '<div class="pc-menu-sub"' + (isOpen ? '' : ' hidden') + '>';
      children.forEach(function (item) {
        var isActive = item.key === active ? ' is-active' : '';
        html += '<div class="pc-menu-item' + isActive + '" data-action="pc-menu-select" data-menu-key="' + esc(item.key) + '">' + esc(item.title) + '</div>';
      });
      html += '</div>';
    });
    root.innerHTML = html;
  }

  function renderTagsView() {
    var root = document.getElementById('pcTagsRoot');
    if (!root) return;
    var tags = normalizeTags(MDS.get('pcTags'));
    var active = MDS.get('pcActiveTag');
    root.innerHTML = tags
      .map(function (t) {
        var isActive = t.key === active ? ' is-active' : '';
        return (
          '<span class="tag-item' + isActive + '" data-action="pc-tag-select" data-tag-key="' + esc(t.key) + '">' +
          esc(t.title) +
          '<span class="tag-close" data-action="pc-tag-close" data-tag-key="' + esc(t.key) + '">×</span>' +
          '</span>'
        );
      })
      .join('');
  }

  function renderBreadcrumb() {
    var el = document.getElementById('pcBreadcrumb');
    if (!el) return;
    var active = MDS.get('pcActiveTag');
    var info = findMenuByKey(active);
    if (!info) {
      el.innerHTML = '';
      return;
    }
    el.innerHTML =
      '<span>' + esc(info.groupTitle) + '</span><span class="sep">/</span>' +
      '<span class="current">' + esc(info.title) + '</span>';
  }

  /* 内容区渲染注册表：key → 渲染函数（真实页）；未注册的 key 走占位 */
  var PC_PAGES = {
    overview: renderOverview,
    'activity-list': renderActivityList,
    'activity-works': renderActivityWorks,
    'review-assign': renderReviewAssign,
    'review-monitor': renderReviewMonitor,
    'review-result': renderReviewResult,
    'rank-garden': renderRankGarden,
    'rank-parent': renderRankParent,
    'score-scheme': renderScoreScheme,
    'medal-threshold': renderMedalThreshold,
    'medal-archive': renderMedalArchive,
    'bonus-monthly': renderBonusMonthly,
    'user-teacher': renderUserTeacher,
    'judge-scoring': renderJudgeTasks,
  };

  /* 渲染内容区：真实页切换对应内容块，其余显示建设中占位 */
  function renderPageContent() {
    var active = MDS.get('pcActiveTag');
    var pageRoot = document.getElementById('pcPage');
    var placeholder = document.getElementById('pagePlaceholder');
    if (!pageRoot || !placeholder) return;

    // 隐藏所有真实内容块
    pageRoot.querySelectorAll('.pc-page-block').forEach(function (b) {
      b.hidden = true;
    });

    if (!active) {
      pageRoot.hidden = true;
      placeholder.hidden = false;
      placeholder.innerHTML =
        '<section class="pc-card"><div class="card-head"><span class="card-title">页面</span></div><div class="card-body">' +
        '<div class="pc-empty"><div class="empty-icon">📄</div><div>请点击左侧菜单查看对应页面</div></div></div></section>';
      return;
    }

    var render = PC_PAGES[active];
    if (render) {
      placeholder.hidden = true;
      pageRoot.hidden = false;
      var block = pageRoot.querySelector('.pc-page-block[data-page-key="' + active + '"]');
      if (block) block.hidden = false;
      render(block || pageRoot);
      return;
    }

    var info = findMenuByKey(active);
    var title = info ? info.title : '功能';
    pageRoot.hidden = true;
    placeholder.hidden = false;
    placeholder.innerHTML =
      '<section class="pc-card"><div class="card-head"><span class="card-title">' + esc(title) + '</span></div><div class="card-body">' +
      '<div class="pc-empty"><div class="empty-icon">🚧</div><div>「' + esc(title) + '」原型建设中</div>' +
      '<div style="margin-top:8px;font-size:12px;color:#909399;">该页面用于演示：侧边栏菜单动态控制 + TagsView 随选中菜单联动切换</div>' +
      '</div></div></section>';
  }

  function renderPcShell() {
    ensureActiveState();
    renderPcMenu();
    renderTagsView();
    renderBreadcrumb();
    renderPageContent();
    var menu = document.getElementById('tagsMoreMenu');
    if (menu) menu.hidden = true;
  }

  function toggleMoreMenu() {
    var more = document.getElementById('pcTagsMore');
    if (!more) return;
    var menu = document.getElementById('tagsMoreMenu');
    if (!menu) {
      menu = document.createElement('div');
      menu.id = 'tagsMoreMenu';
      menu.className = 'tags-more-menu';
      menu.hidden = true;
      menu.innerHTML =
        '<div class="tags-more-item" data-action="pc-tags-close-others">关闭其他</div>' +
        '<div class="tags-more-item" data-action="pc-tags-close-all">关闭全部</div>';
      more.appendChild(menu);
    }
    menu.hidden = !menu.hidden;
  }

  /* ═══════════════════════ PC：数据概览 ═══════════════════════ */

  function renderOverview(root) {
    var box = document.getElementById('overviewRoot');
    if (!box) return;
    root = box;
    var isPrincipal = currentRole() === 'principal';
    var scope = isPrincipal ? '本园' : '全平台';
    var teachers = MDS.get('teachers') || [];
    var activeTeachers = teachers.filter(function (t) { return t.isActive; }).length;
    var activities = MDS.get('activities') || [];
    var medals = MDS.get('medals') || [];
    var gold = medals.filter(function (m) { return m.level === '金'; }).length;

    var html = '';
    html += '<div class="stat-grid">';
    html += statCard('积分', '本月累计积分', '12,680', '🔥', 'rgba(255,138,0,0.14)');
    html += statCard('教师', '在册教师（' + scope + '）', String(activeTeachers) + ' 人', '👥', 'rgba(37,99,235,0.12)');
    html += statCard('勋章', '本月勋章发放', String(gold) + ' 枚金牌', '🎖️', 'rgba(245,166,35,0.16)');
    html += statCard('奖金', '待发奖金（' + scope + '）', '¥ 16,800', '💰', 'rgba(245,158,11,0.14)');
    html += '</div>';

    html += '<div class="pc-overview-row">';
    // 待办事项
    html += '<section class="pc-card"><div class="card-head"><span class="card-title">待办事项</span></div><div class="card-body">';
    html += '<div class="pc-list">';
    html += overviewTodo('评奖管理', '课件制作技能大赛 · 已发布，待结算评奖', 'review-assign');
    html += overviewTodo('作品管理', '2026 春季论文评选大赛 · 38 份作品待审', 'activity-works', { action: 'act-works', extra: 'data-works-activity="2026 春季论文评选大赛"' });
    html += overviewTodo('活动发布', '家园互动创意活动评选 · 已发布，等待报名', 'activity-list');
    if (!isPrincipal) html += overviewTodo('积分方案', '月度常规勋章积分方案运行中', 'score-scheme');
    html += '</div></div></section>';

    // 核心闭环说明卡
    html += '<section class="pc-card"><div class="card-head"><span class="card-title">激励闭环概览</span></div><div class="card-body">';
    html += '<div class="pc-closed-loop">';
    html += closedLoopStep('① 活动组织', '活动发布 → 作品收集', 'activity-list');
    html += closedLoopStep('② 积分计算', '四大维度累计积分', 'score-scheme');
    html += closedLoopStep('③ 园内排行', '5 榜实时更新', 'rank-garden');
    html += closedLoopStep('④ 勋章授予', '金银铜按月结算', 'medal-threshold');
    html += closedLoopStep('⑤ 奖金发放', '月度清单 + 期末汇总', 'bonus-monthly');
    html += '</div></div></section>';
    html += '</div>';

    root.innerHTML = html;
  }

  function statCard(title, label, value, icon, bg) {
    return (
      '<div class="stat-card">' +
      '<div class="stat-icon" style="background:' + bg + ';">' + icon + '</div>' +
      '<div class="stat-body"><div class="stat-value">' + esc(value) + '</div><div class="stat-label">' + esc(label) + '</div></div>' +
      '</div>'
    );
  }

  function overviewTodo(text, desc, menuKey, opts) {
    opts = opts || {};
    var action = opts.action || 'pc-menu-select';
    var extra = opts.extra || '';
    return (
      '<div class="pc-todo-item" data-action="' + esc(action) + '" data-menu-key="' + esc(menuKey) + '"' + (extra ? ' ' + extra : '') + '>' +
      '<span class="todo-dot"></span>' +
      '<div class="todo-body"><div class="todo-title">' + esc(text) + '</div><div class="todo-desc">' + esc(desc) + '</div></div>' +
      '<span class="todo-arrow">›</span>' +
      '</div>'
    );
  }

  function closedLoopStep(title, desc, menuKey) {
    return (
      '<div class="pc-loop-step" data-action="pc-menu-select" data-menu-key="' + esc(menuKey) + '">' +
      '<div class="loop-title">' + esc(title) + '</div><div class="loop-desc">' + esc(desc) + '</div>' +
      '</div>'
    );
  }

  /* ═══════════════════════ PC：活动列表（状态机 + CRUD） ═══════════════════════ */

  var actFilter = 'ALL';
  var actTypeFilter = '';

  function actStatusClass(status) {
    return 'st-' + status;
  }

  /* 活动对象（幼儿园多选）展示：含「全部幼儿园」则显示全部，否则逐园展示 */
  function actScopeHtml(kgList) {
    var list = kgList || [];
    if (!list.length) return '—';
    if (list.indexOf('全部幼儿园') >= 0) return '<span class="act-scope-tag">全部幼儿园</span>';
    return list
      .map(function (k) {
        return '<span class="act-scope-tag">' + esc(k) + '</span>';
      })
      .join('');
  }

  /* 活动对象纯文本（移动端卡内描述用） */
  function actScopeText(kgList) {
    var list = kgList || [];
    if (!list.length) return '—';
    return list.join('、');
  }

  /* 读取表单内活动对象多选（checkbox 组，data-scope-group=prefix） */
  function readScopeChecks(prefix) {
    var checked = document.querySelectorAll('input[data-scope-group="' + prefix + '"]:checked');
    var vals = [];
    var hasAll = false;
    checked.forEach(function (c) {
      if (c.value === '全部幼儿园') hasAll = true;
      vals.push(c.value);
    });
    // 勾了「全部幼儿园」即视为全部
    if (hasAll) return ['全部幼儿园'];
    return vals;
  }

  /* 回填表单活动对象多选 */
  function fillScopeChecks(prefix, kgList) {
    var kgs = kgList || [];
    var isAll = kgs.indexOf('全部幼儿园') >= 0;
    document.querySelectorAll('input[data-scope-group="' + prefix + '"]').forEach(function (c) {
      if (c.value === '全部幼儿园') {
        c.checked = isAll;
      } else {
        c.checked = !isAll && kgs.indexOf(c.value) >= 0;
      }
    });
  }

  /* 活动对象范围内的老师（不含已离职；含全部幼儿园=所有在职老师） */
  function scopeTeachers(activity) {
    var kgs = (activity && activity.targetKindergartens) || [];
    var all = MDS.get('teachers') || [];
    var active = all.filter(function (t) { return t.isActive !== false; });
    if (kgs.indexOf('全部幼儿园') >= 0) return active;
    return active.filter(function (t) {
      return kgs.indexOf(t.kindergarten) >= 0;
    });
  }

  /* ═══════════════════════ PC：活动奖项设置（CRUD 表格：序号/奖项名称/数量） ═══════════════════════ */

  function awardRowHtml(a) {
    a = a || {};
    return (
      '<tr>' +
      '<td class="award-idx"></td>' +
      '<td><input class="pc-input award-name" placeholder="如：一等奖" value="' + esc(a.name || '') + '"></td>' +
      '<td><input class="pc-input award-count" type="number" min="1" placeholder="如：3" style="width:100px;" value="' + (a.count ? esc(String(a.count)) : '') + '"></td>' +
      '<td><span class="action-btn action-delete" data-action="award-row-del">删除</span></td>' +
      '</tr>'
    );
  }

  /* 渲染奖项表格：awards 为空时给一行空行方便录入 */
  function renderAwardRows(tbodyId, awards) {
    var tbody = document.getElementById(tbodyId);
    if (!tbody) return;
    var list = (awards && awards.length) ? awards : [{}];
    tbody.innerHTML = list.map(awardRowHtml).join('');
    renumberAwardRows(tbody);
  }

  /* 序号重排 */
  function renumberAwardRows(tbody) {
    if (!tbody) return;
    tbody.querySelectorAll('tr').forEach(function (tr, i) {
      var idx = tr.querySelector('.award-idx');
      if (idx) idx.textContent = i + 1;
    });
  }

  /* 读取奖项表格：仅收录有奖项名称的行，数量缺省为 1 */
  function readAwardRows(tbodyId) {
    var out = [];
    var tbody = document.getElementById(tbodyId);
    if (!tbody) return out;
    tbody.querySelectorAll('tr').forEach(function (tr) {
      var name = ((tr.querySelector('.award-name') || {}).value || '').trim();
      if (!name) return;
      var count = parseInt((tr.querySelector('.award-count') || {}).value, 10);
      out.push({ name: name, count: isNaN(count) || count < 1 ? 1 : count });
    });
    return out;
  }

  /* 通知弹窗：默认发送给活动对象范围内全体老师，可取消个别老师，并支持按幼儿园/姓名筛选 */
  var notifyActivityId = null;
  var notifyTeachers = [];   // 当前活动范围内全部在职老师（主数据）
  var notifySelected = {};   // 已选老师 name → true（跨筛选保持选中）
  var notifyKgFilter = '';   // 幼儿园筛选值
  var notifyNameFilter = ''; // 姓名筛选关键字

  function fillNotifyDialog(activity) {
    notifyActivityId = activity.id;
    var title = document.getElementById('notifyActTitle');
    if (title) title.textContent = '「' + activity.title + '」通知';
    var scope = document.getElementById('notifyScopeText');
    if (scope) scope.textContent = '发送对象：' + (actScopeHtml(activity.targetKindergartens).replace(/<[^>]+>/g, ''));
    notifyTeachers = scopeTeachers(activity);

    // 重置筛选并默认全选（发送给全体范围老师，可取消个别）
    notifyKgFilter = '';
    notifyNameFilter = '';
    notifySelected = {};
    notifyTeachers.forEach(function (t) { notifySelected[t.name] = true; });

    // 幼儿园筛选下拉：按范围内老师的所属园去重填充
    var kgSel = document.getElementById('notifyKgFilter');
    if (kgSel) {
      var seen = {};
      var opts = ['<option value="">全部幼儿园</option>'];
      notifyTeachers.forEach(function (t) {
        if (!seen[t.kindergarten]) {
          seen[t.kindergarten] = true;
          opts.push('<option value="' + esc(t.kindergarten) + '">' + esc(t.kindergarten) + '</option>');
        }
      });
      kgSel.innerHTML = opts.join('');
      kgSel.value = '';
    }
    var nameInput = document.getElementById('notifyNameFilter');
    if (nameInput) nameInput.value = '';

    renderNotifyList();
    updateNotifyCount();
    Proto.openDialog('notifyDialog');
  }

  /* 渲染老师列表：按幼儿园 + 姓名筛选当前主数据 */
  function renderNotifyList() {
    var box = document.getElementById('notifyTeacherList');
    if (!box) return;
    var list = notifyTeachers.filter(function (t) {
      if (notifyKgFilter && t.kindergarten !== notifyKgFilter) return false;
      if (notifyNameFilter && t.name.indexOf(notifyNameFilter) < 0) return false;
      return true;
    });
    if (!list.length) {
      box.innerHTML = '<div class="pc-empty" style="padding:30px 0;"><div>' + (notifyKgFilter || notifyNameFilter ? '无匹配老师' : '活动对象范围内暂无在职教师') + '</div></div>';
      return;
    }
    box.innerHTML = list
      .map(function (t) {
        return (
          '<label class="notify-teacher-item">' +
          '<input type="checkbox" class="notify-teacher" value="' + esc(t.name) + '"' + (notifySelected[t.name] ? ' checked' : '') + '>' +
          '<span class="nt-name">' + esc(t.name) + '</span>' +
          '<span class="nt-sub">' + esc(t.kindergarten) + ' · ' + esc(t.className) + '</span>' +
          '</label>'
        );
      })
      .join('');
  }

  /* 更新已选人数：按范围内全部老师统计（跨筛选累计，不受当前筛选影响） */
  function updateNotifyCount() {
    var count = notifyTeachers.filter(function (t) { return notifySelected[t.name]; }).length;
    var el = document.getElementById('notifyCheckedCount');
    if (el) el.textContent = '已选 ' + count + ' 位老师';
  }

  /* 通知弹窗筛选事件绑定（一次性绑定，元素仅在 admin 端存在） */
  function bindNotifyEvents() {
    var kgSel = document.getElementById('notifyKgFilter');
    if (kgSel) {
      kgSel.addEventListener('change', function () {
        notifyKgFilter = kgSel.value;
        renderNotifyList();
      });
    }
    var nameInput = document.getElementById('notifyNameFilter');
    if (nameInput) {
      nameInput.addEventListener('input', function () {
        notifyNameFilter = nameInput.value.trim();
        renderNotifyList();
      });
    }
    // 勾选/取消老师（事件委托，兼容列表重绘）
    document.addEventListener('change', function (e) {
      if (e.target && e.target.classList && e.target.classList.contains('notify-teacher')) {
        if (e.target.checked) {
          notifySelected[e.target.value] = true;
        } else {
          delete notifySelected[e.target.value];
        }
        updateNotifyCount();
      }
    });
  }

  function filteredActivities() {
    var all = MDS.get('activities') || [];
    var kw = ((qs('#actSearch') || {}).value || '').trim();
    var type = ((qs('#actTypeFilter') || {}).value || '').trim();
    return all.filter(function (a) {
      if (actFilter !== 'ALL' && a.status !== actFilter) return false;
      if (type && a.type !== type) return false;
      if (kw && a.title.indexOf(kw) < 0) return false;
      return true;
    });
  }

  /* 活动生命周期操作（未发布 → 已发布；发布后教师即可上传作品） */
  function activityOps(a) {
    var map = {
      DRAFT: [{ label: '发布', next: 'PUBLISHED', cls: 'pc-btn-add' }],
      PUBLISHED: [{ label: '撤回', next: 'DRAFT', cls: 'pc-btn-default' }],
    };
    return map[a.status] || [];
  }

  function renderActivityList(root) {
    // 骨架在 admin.html 中；这里仅渲染表格行
    renderActivityTable();
  }

  function renderActivityTable() {
    var tbody = document.getElementById('actTbody');
    var count = document.getElementById('actCount');
    if (count) count.textContent = '共 ' + filteredActivities().length + ' 条记录';
    if (!tbody) return;
    var list = filteredActivities();
    if (!list.length) {
      tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;color:#909399;padding:40px 0;">暂无匹配活动</td></tr>';
      return;
    }
    tbody.innerHTML = list
      .map(function (a) {
        var statusHtml = '<span class="act-status ' + actStatusClass(a.status) + '">' + esc(MDS.ACTIVITY_STATUS[a.status]) + '</span>';
        var ops = activityOps(a)
          .map(function (op) {
            return '<button type="button" class="pc-btn ' + op.cls + ' pc-btn-sm" data-action="act-transition" data-id="' + a.id + '" data-next="' + op.next + '">' + op.label + '</button>';
          })
          .join('');
        if (a.status === 'DRAFT' || a.status === 'PUBLISHED') {
          ops += '<button type="button" class="pc-btn pc-btn-default pc-btn-sm" data-action="act-edit" data-id="' + a.id + '">编辑</button>';
        }
        // 查看作品：仅已发布状态显示；点击进入作品管理页（过滤为该活动的作品）
        if (a.status === 'PUBLISHED') {
          ops += '<button type="button" class="pc-btn pc-btn-edit pc-btn-sm" data-action="act-works" data-id="' + a.id + '">查看作品</button>';
        }
        // 通知：仅已发布状态显示；点击打开通知弹窗，可过滤部分老师不发送
        if (a.status === 'PUBLISHED') {
          ops += '<button type="button" class="pc-btn pc-btn-import pc-btn-sm" data-action="act-notify" data-id="' + a.id + '">通知</button>';
        }
        if (a.status === 'DRAFT') {
          ops += '<button type="button" class="pc-btn pc-btn-delete pc-btn-sm" data-action="act-delete" data-id="' + a.id + '">删除</button>';
        }
        return (
          '<tr>' +
          '<td><input type="checkbox" class="act-check" data-id="' + a.id + '"></td>' +
          '<td><strong>' + esc(a.title) + '</strong></td>' +
          '<td>' + esc(a.type) + '</td>' +
          '<td>' + esc(a.signupStart || '—') + ' ~ ' + esc(a.signupEnd || '—') + '</td>' +
          '<td>' + actScopeHtml(a.targetKindergartens) + '</td>' +
          '<td>' + a.worksCount + '</td>' +
          '<td>' + esc(a.publishTime || '—') + '</td>' +
          '<td>' + statusHtml + '</td>' +
          '<td class="op-col">' + ops + '</td>' +
          '</tr>'
        );
      })
      .join('');
  }

  /* ═══════════════════════ PC：作品管理（由活动列表「查看作品」进入，支持按活动/作品名/教师筛选） ═══════════════════════ */

  var worksActivityFilter = '';
  var worksSearch = { name: '', teacher: '' };

  function renderActivityWorks(root) {
    // 顶部标题同步显示当前活动
    var title = document.getElementById('worksTitle');
    if (title) title.textContent = worksActivityFilter ? '参赛作品 · ' + worksActivityFilter : '参赛作品';
    renderWorksTable();
  }

  function filteredWorks() {
    var works = MDS.get('works') || [];
    return works.filter(function (w) {
      if (worksActivityFilter && w.activity !== worksActivityFilter) return false;
      if (worksSearch.name && (w.title || '').indexOf(worksSearch.name) < 0) return false;
      if (worksSearch.teacher && w.teacher.indexOf(worksSearch.teacher) < 0) return false;
      return true;
    });
  }

  function renderWorksTable() {
    var tbody = document.getElementById('worksTbody');
    var count = document.getElementById('worksCount');
    var list = filteredWorks();
    if (count) count.textContent = '共 ' + list.length + ' 条记录';
    if (!tbody) return;
    if (!list.length) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:#909399;padding:40px 0;">' + (worksActivityFilter || worksSearch.name || worksSearch.teacher ? '无匹配作品' : '暂无作品') + '</td></tr>';
      return;
    }
    tbody.innerHTML = list
      .map(function (w) {
        var checkTag = w.check === '未检出重复'
          ? '<span class="status-tag status-success">' + esc(w.check) + '</span>'
          : '<span class="status-tag status-warning">' + esc(w.check) + '</span>';
        return (
          '<tr>' +
          '<td><input type="checkbox" class="work-check"></td>' +
          '<td><strong>' + esc(w.title || w.teacher + ' 的作品') + '</strong></td>' +
          '<td><span class="cell-avatar">' + esc(w.teacher.charAt(0)) + '</span>' + esc(w.teacher) + '</td>' +
          '<td>' + esc(w.type) + '</td>' +
          '<td>' + esc(w.size) + '</td>' +
          '<td>' + checkTag + '</td>' +
          '<td>' + esc(w.submitTime) + '</td>' +
          '<td class="op-col">' +
          '<span class="action-btn action-primary" data-action="works-preview" data-id="' + w.id + '">预览</span>' +
          '<span class="action-btn action-edit" data-action="show-toast" data-toast="演示功能：下载作品">下载</span>' +
          '</td>' +
          '</tr>'
        );
      })
      .join('');
  }

  /* ═══════════════════════ PC：评奖管理（评委分批 / 打分监控 / 结果管理） ═══════════════════════ */

  var reviewAssignActivityId = 2;
  var reviewBatchSize = 5;
  var reviewResultActivityId = 2;

  function activityById(id) {
    var num = Number(id);
    return (MDS.get('activities') || []).filter(function (a) { return a.id === num; })[0] || null;
  }

  function worksForActivityId(id) {
    var act = activityById(id);
    if (!act) return [];
    return (MDS.get('works') || []).filter(function (w) { return w.activity === act.title; });
  }

  /* ── 评委分配 / 分批 ── */

  function fillReviewAssignAct() {
    var sel = document.getElementById('reviewAssignAct');
    if (!sel) return;
    sel.innerHTML = (MDS.get('activities') || [])
      .map(function (a) { return '<option value="' + a.id + '">' + esc(a.title) + '</option>'; })
      .join('');
    sel.value = String(reviewAssignActivityId);
  }

  /* 自动分批：每批 batchSize 份，评委轮询分配 */
  function buildReviewBatches(activityId, batchSize) {
    var works = worksForActivityId(activityId);
    var judges = MDS.get('judges') || [];
    var batches = [];
    for (var i = 0; i < works.length; i += batchSize) {
      var workIds = works.slice(i, i + batchSize).map(function (w) { return w.id; });
      var judge = judges[batches.length % judges.length] || judges[0] || {};
      batches.push({ batchNo: batches.length + 1, workIds: workIds, judgeId: judge.id || 0, judgeName: judge.name || '未分配', done: 0 });
    }
    return batches;
  }

  function saveReviewBatches(activityId, batches) {
    MDS.update('reviewBatches', function (map) {
      var next = Object.assign({}, map || {});
      next[activityId] = batches;
      return next;
    });
  }

  function renderReviewAssign(root) {
    fillReviewAssignAct();
    var act = activityById(reviewAssignActivityId);
    var works = worksForActivityId(reviewAssignActivityId);
    var hint = document.getElementById('reviewAssignHint');
    if (hint) hint.textContent = act ? ('「' + act.title + '」作品池共 ' + works.length + ' 份 · 每批 ' + reviewBatchSize + ' 份 · 评委自动轮询分配') : '请选择活动';
    var count = document.getElementById('reviewAssignCount');
    if (count) count.textContent = '共 ' + works.length + ' 份作品';
    var workTbody = document.getElementById('reviewAssignWorks');
    if (workTbody) {
      workTbody.innerHTML = works.length
        ? works.map(function (w) {
            return '<tr><td><strong>' + esc(w.title) + '</strong></td><td>' + esc(w.teacher) + '</td><td>' + esc(w.type) + '</td><td>' + esc(w.size) + '</td></tr>';
          }).join('')
        : '<tr><td colspan="4" style="text-align:center;color:#909399;padding:30px 0;">该活动暂无作品</td></tr>';
    }
    renderReviewBatchTable();
  }

  function renderReviewBatchTable() {
    var tbody = document.getElementById('reviewBatchTbody');
    if (!tbody) return;
    var batches = ((MDS.get('reviewBatches') || {})[reviewAssignActivityId]) || [];
    var works = worksForActivityId(reviewAssignActivityId);
    var judges = MDS.get('judges') || [];
    var judgeOpts = judges
      .map(function (j) { return '<option value="' + j.id + '">' + esc(j.name) + '（' + esc(j.weight) + '）</option>'; })
      .join('');
    tbody.innerHTML = batches.length
      ? batches.map(function (b) {
          var detail = b.workIds
            .map(function (id) {
              var w = works.filter(function (x) { return x.id === id; })[0];
              return w ? w.title : '';
            })
            .filter(Boolean)
            .join('、');
          return (
            '<tr>' +
            '<td><strong>第 ' + b.batchNo + ' 批</strong></td>' +
            '<td style="font-size:12px;color:#606266;">' + esc(detail) + '</td>' +
            '<td>' + b.workIds.length + '</td>' +
            '<td><select class="pc-select review-batch-judge" data-batch="' + b.batchNo + '" style="width:200px;">' + judgeOpts + '</select></td>' +
            '<td><span class="action-btn action-delete" data-action="review-batch-del" data-batch="' + b.batchNo + '">删除</span></td>' +
            '</tr>'
          );
        }).join('')
      : '<tr><td colspan="5" style="text-align:center;color:#909399;padding:30px 0;">暂无分批，点击「自动分批」生成</td></tr>';
    // 回填当前选中评委
    batches.forEach(function (b) {
      var sel = tbody.querySelector('.review-batch-judge[data-batch="' + b.batchNo + '"]');
      if (sel) sel.value = String(b.judgeId);
    });
  }

  /* ── 打分监控 ── */

  function renderReviewMonitor(root) {
    var rootEl = document.getElementById('reviewMonitorRoot');
    var html = '';
    var batches = MDS.get('reviewBatches') || {};
    (MDS.get('activities') || []).forEach(function (act) {
      var list = batches[act.id];
      if (!list || !list.length) return;
      html += '<div class="scheme-card" style="margin-bottom:12px;">';
      html += '<div class="scheme-head"><span class="scheme-name">' + esc(act.title) + '</span><span class="enable-tag">评奖中</span></div>';
      list.forEach(function (b) {
        var total = b.workIds.length || 0;
        var pct = total ? Math.round((b.done / total) * 100) : 0;
        var finished = total > 0 && b.done >= total;
        html +=
          '<div style="display:flex;align-items:center;gap:14px;padding:10px 0;border-top:1px dashed var(--pc-border-divider);">' +
          '<span style="width:70px;font-weight:600;">第 ' + b.batchNo + ' 批</span>' +
          '<span style="width:140px;font-size:12px;color:#606266;">评委：' + esc(b.judgeName) + '</span>' +
          '<div class="progress-tri" style="flex:1;max-width:280px;height:8px;">' +
          '<span class="seg seg-registered" style="width:' + pct + '%;"></span></div>' +
          '<span style="font-size:12px;color:#909399;">' + b.done + ' / ' + total + '</span>' +
          '<span class="status-tag ' + (finished ? 'status-success' : 'status-warning') + '">' + (finished ? '已完成' : '进行中') + '</span>' +
          '</div>';
      });
      html += '</div>';
    });
    if (!html) {
      html = '<div class="pc-empty"><div class="empty-icon">📋</div><div>暂无分批任务，请先在「评委分配」中分批</div></div>';
    }
    if (rootEl) rootEl.innerHTML = html;
    renderReviewRecordTable();
  }

  function renderReviewRecordTable() {
    var tbody = document.getElementById('reviewRecordTbody');
    if (!tbody) return;
    var records = MDS.get('reviewRecords') || [];
    tbody.innerHTML = records.length
      ? records.map(function (r) {
          return (
            '<tr>' +
            '<td>' + esc(r.activity) + '</td>' +
            '<td>' + esc(r.work) + '</td>' +
            '<td>' + esc(r.judge) + '</td>' +
            '<td>' + esc(r.scores) + '</td>' +
            '<td style="font-size:12px;color:#606266;">' + esc(r.comment) + '</td>' +
            '<td>' + esc(r.time) + '</td>' +
            '</tr>'
          );
        }).join('')
      : '<tr><td colspan="6" style="text-align:center;color:#909399;padding:30px 0;">暂无打分记录</td></tr>';
  }

  /* ── 结果管理 ── */

  function fillReviewResultAct() {
    var sel = document.getElementById('reviewResultAct');
    if (!sel) return;
    sel.innerHTML = (MDS.get('activities') || [])
      .map(function (a) { return '<option value="' + a.id + '">' + esc(a.title) + '</option>'; })
      .join('');
    sel.value = String(reviewResultActivityId);
  }

  function renderReviewResult(root) {
    fillReviewResultAct();
    var act = activityById(reviewResultActivityId);
    if (!act) return;
    var works = worksForActivityId(reviewResultActivityId);
    var records = MDS.get('reviewRecords') || [];
    var results = works.map(function (w) {
      var recs = records.filter(function (r) { return r.activity === act.title && r.work.indexOf(w.teacher) >= 0; });
      if (!recs.length) return { work: w.title, teacher: w.teacher, total: 0, avg: 0, scored: false };
      var total = 0, n = 0;
      recs.forEach(function (r) {
        (r.scores || '').split('/').forEach(function (s) {
          var v = parseInt(s.trim(), 10);
          if (!isNaN(v)) { total += v; n++; }
        });
      });
      return { work: w.title, teacher: w.teacher, total: total, avg: n ? Math.round((total / n) * 10) / 10 : 0, scored: true };
    });
    // 已评分按总分降序，未评分排最后
    results.sort(function (a, b) {
      if (a.scored !== b.scored) return a.scored ? -1 : 1;
      return b.total - a.total;
    });
    // 奖项分配（按名次依活动奖项名额）
    var awards = (act && act.awards) || [];
    results.forEach(function (r, i) {
      if (!r.scored) { r.award = '待评分'; return; }
      var remaining = i + 1;
      r.award = '未获奖';
      awards.forEach(function (a) {
        if (remaining <= a.count && r.award === '未获奖') r.award = a.name;
        remaining -= a.count;
      });
    });
    var hint = document.getElementById('reviewResultHint');
    if (hint && act) hint.textContent = act.title + ' · 总分自动计算 · 名次/奖项可手动调整';
    var tbody = document.getElementById('reviewResultTbody');
    if (!tbody) return;
    tbody.innerHTML = results.length
      ? results.map(function (r, i) {
          return (
            '<tr>' +
            '<td><strong>' + (r.scored ? (i + 1) : '—') + '</strong></td>' +
            '<td><strong>' + esc(r.work) + '</strong></td>' +
            '<td>' + esc(r.teacher) + '</td>' +
            '<td>' + (r.scored ? r.total : '—') + '</td>' +
            '<td>' + (r.scored ? r.avg : '—') + '</td>' +
            '<td>' + (r.scored ? '<span class="status-tag status-success">' + esc(r.award) + '</span>' : '<span class="status-tag status-warning">待评分</span>') + '</td>' +
            '<td class="op-col"><span class="action-btn action-edit" data-action="show-toast" data-toast="演示功能：调整名次/奖项">调整</span></td>' +
            '</tr>'
          );
        }).join('')
      : '<tr><td colspan="7" style="text-align:center;color:#909399;padding:30px 0;">该活动暂无作品</td></tr>';
  }

  /* 评委分配事件绑定（一次性：分批表评委变更） */
  function bindReviewEvents() {
    document.addEventListener('change', function (e) {
      var t = e.target;
      if (!t || !t.classList || !t.classList.contains('review-batch-judge')) return;
      var batchNo = Number(t.getAttribute('data-batch'));
      var judgeId = Number(t.value);
      var judge = (MDS.get('judges') || []).filter(function (j) { return j.id === judgeId; })[0];
      MDS.update('reviewBatches', function (map) {
        var next = Object.assign({}, map || {});
        next[reviewAssignActivityId] = (next[reviewAssignActivityId] || []).map(function (b) {
          return b.batchNo === batchNo ? Object.assign({}, b, { judgeId: judgeId, judgeName: judge ? judge.name : '' }) : b;
        });
        return next;
      });
    });
  }

  /* ═══════════════════════ PC：园内排行榜（5 榜 + TOP10 + 本人定位） ═══════════════════════ */

  var RANK_BOARDS = [
    { key: 'total', name: '综合榜' },
    { key: 'usage', name: '平台使用榜' },
    { key: 'interaction', name: '家园互动榜' },
    { key: 'promotion', name: '外部推广榜' },
    { key: 'conversion', name: '会员转化榜' },
  ];

  function renderRankGarden(root) {
    var panel = document.getElementById('rankBoardPanel');
    if (!panel) return;
    var rankData = MDS.get('rankData') || {};
    var boards = RANK_BOARDS.map(function (b) {
      var items = rankData[b.key] || [];
      var listHtml = items
        .map(function (it) {
          var isMe = it.isMe ? ' is-me' : '';
          var badgeCls = it.rank <= 3 ? 'rk-' + it.rank : 'rk-n';
          var trendIcon = it.trend === 'up' ? '↑' : it.trend === 'down' ? '↓' : '→';
          var trendCls = it.trend === 'up' ? 'trend-up' : it.trend === 'down' ? 'trend-down' : 'trend-flat';
          return (
            '<div class="rank-item' + isMe + '">' +
            '<span class="rank-badge ' + badgeCls + '">' + it.rank + '</span>' +
            '<span class="rank-name">' + esc(it.name) + (isMe ? '<span class="me-tag">我</span>' : '') + '</span>' +
            '<span class="rank-class">' + esc(it.className) + '</span>' +
            '<span class="rank-score">' + it.score + '<span class="unit">分</span></span>' +
            '<span class="rank-trend ' + trendCls + '">' + trendIcon + '</span>' +
            '</div>'
          );
        })
        .join('');
      return (
        '<div data-tab-content="' + b.key + '"' + (b.key === 'total' ? '' : ' hidden') + '>' +
        '<div class="rank-list">' + listHtml + '</div>' +
        '</div>'
      );
    });
    panel.innerHTML = boards.join('');
  }

  /* ═══════════════════════ PC：家长进度看板（三色进度） ═══════════════════════ */

  function renderRankParent(root) {
    var box = document.getElementById('parentProgressRoot');
    if (!box) return;
    var progress = MDS.get('parentProgress') || [];
    var totalAll = 0, regAll = 0, actAll = 0;
    progress.forEach(function (p) {
      totalAll += p.total;
      regAll += p.registered;
      actAll += p.active;
    });

    var html = '';
    // 汇总统计卡
    html += '<div class="stat-grid" style="margin-bottom:0;">';
    html += statCard('幼儿', '在册幼儿总数', totalAll + ' 人', '👶', 'rgba(102,204,153,0.14)');
    html += statCard('注册', '家长已注册', regAll + ' 人', '📱', 'rgba(37,99,235,0.12)');
    html += statCard('激活', '会员已激活', actAll + ' 人', '⭐', 'rgba(255,138,0,0.14)');
    html += statCard('注册率', '平均注册率', Math.round((regAll / totalAll) * 100) + '%', '📊', 'rgba(245,158,11,0.14)');
    html += '</div>';

    // 图例
    html += '<div class="progress-legend" style="margin:16px 0 4px;">';
    html += '<span class="lg-item"><span class="lg-dot" style="background:#66cc99;"></span>家长已注册</span>';
    html += '<span class="lg-item"><span class="lg-dot" style="background:#ff8a00;"></span>会员已激活</span>';
    html += '<span class="lg-item"><span class="lg-dot" style="background:#d1d5db;"></span>未注册</span>';
    html += '</div>';

    // 班级进度行
    progress.forEach(function (p) {
      var regPct = Math.round((p.registered / p.total) * 100);
      var actPct = Math.round((p.active / p.total) * 100);
      var unregPct = 100 - regPct;
      html +=
        '<div class="parent-progress-row">' +
        '<span class="row-class">' + esc(p.className) + '</span>' +
        '<div style="flex:1;">' +
        '<div class="progress-tri">' +
        '<span class="seg seg-registered" style="width:' + regPct + '%"></span>' +
        '<span class="seg seg-active" style="width:' + actPct + '%"></span>' +
        '<span class="seg seg-unregistered" style="width:' + unregPct + '%"></span>' +
        '</div>' +
        '</div>' +
        '<span class="row-nums">已注册 ' + p.registered + ' / 激活 ' + p.active + ' / 未注册 ' + (p.total - p.registered) + '</span>' +
        '</div>';
    });

    box.innerHTML = html;
  }

  /* ═══════════════════════ PC：积分方案管理（权重配置 + 启用 + 复制） ═══════════════════════ */

  var editingSchemeId = null;

  function renderScoreScheme(root) {
    var box = document.getElementById('schemeList');
    if (!box) return;
    var schemes = MDS.get('scoreSchemes') || [];
    box.innerHTML = schemes
      .map(function (s) {
        var dims = (s.dimensions || [])
          .map(function (d) {
            var enabled = d.enabled
              ? '单条得分 <b>' + d.points + '</b> · 权重 <b>' + d.weight + '%</b> · 班主任 ' + d.headCoef.toFixed(1) + ' / 配班 ' + d.assocCoef.toFixed(1)
              : '<span class="dim-off">计分已关闭</span>';
            return '<div class="scheme-dim-row"><span class="dim-name">' + esc(d.name) + '</span><span class="dim-info">' + enabled + '</span></div>';
          })
          .join('');
        return (
          '<div class="scheme-card' + (s.isActive ? ' is-active' : '') + '">' +
          '<div class="scheme-head">' +
          '<span class="scheme-name">' + esc(s.name) + '</span>' +
          (s.isActive ? '<span class="enable-tag">启用中</span>' : '<span class="status-tag status-warning">未启用</span>') +
          '<div class="scheme-ops">' +
          (!s.isActive ? '<button type="button" class="pc-btn pc-btn-add pc-btn-sm" data-action="score-enable" data-id="' + s.id + '">启用</button>' : '') +
          '<button type="button" class="pc-btn pc-btn-edit pc-btn-sm" data-action="score-weight-edit" data-id="' + s.id + '">编辑权重</button>' +
          '<button type="button" class="pc-btn pc-btn-default pc-btn-sm" data-action="score-copy" data-id="' + s.id + '">复制方案</button>' +
          '</div>' +
          '</div>' +
          '<div class="scheme-meta">类型：' + esc(s.type) + ' · 最近更新：' + esc(s.updatedAt) + '</div>' +
          dims +
          '</div>'
        );
      })
      .join('');
  }

  /* 权重配置弹窗：填充当前方案维度值 */
  function fillWeightDialog(schemeId) {
    var schemes = MDS.get('scoreSchemes') || [];
    var s = schemes.filter(function (x) { return x.id === schemeId; })[0];
    if (!s) return;
    editingSchemeId = schemeId;
    var nameEl = document.getElementById('schemeNameText');
    if (nameEl) nameEl.textContent = s.name;
    (s.dimensions || []).forEach(function (d, i) {
      var points = document.getElementById('dimPoints' + i);
      var weight = document.getElementById('dimWeight' + i);
      var enabled = document.getElementById('dimEnabled' + i);
      var head = document.getElementById('dimHead' + i);
      var assoc = document.getElementById('dimAssoc' + i);
      if (points) points.value = d.points;
      if (weight) weight.value = d.weight;
      if (enabled) enabled.checked = d.enabled;
      if (head) head.value = String(d.headCoef);
      if (assoc) assoc.value = String(d.assocCoef);
    });
    Proto.openDialog('weightDialog');
  }

  function saveWeightDialog() {
    MDS.update('scoreSchemes', function (schemes) {
      return schemes.map(function (s) {
        if (s.id !== editingSchemeId) return s;
        var dims = (s.dimensions || []).map(function (d, i) {
          var points = parseInt((document.getElementById('dimPoints' + i) || {}).value, 10);
          var weight = parseInt((document.getElementById('dimWeight' + i) || {}).value, 10);
          var enabled = !!(document.getElementById('dimEnabled' + i) || {}).checked;
          var head = parseFloat((document.getElementById('dimHead' + i) || {}).value);
          var assoc = parseFloat((document.getElementById('dimAssoc' + i) || {}).value);
          return {
            key: d.key,
            name: d.name,
            points: isNaN(points) ? d.points : points,
            weight: isNaN(weight) ? d.weight : weight,
            enabled: enabled,
            headCoef: isNaN(head) ? d.headCoef : head,
            assocCoef: isNaN(assoc) ? d.assocCoef : assoc,
          };
        });
        return Object.assign({}, s, { dimensions: dims, updatedAt: '刚刚 更新' });
      });
    });
    Proto.closeDialog('weightDialog');
    renderScoreScheme(qs('#pcPage'));
    Proto.showToast('权重配置已保存');
  }

  /* ═══════════════════════ PC：勋章门槛配置（金银铜双套） ═══════════════════════ */

  var thresholdSet = 1;
  var editingThresholdId = null;

  function renderMedalThreshold(root) {
    var grid = document.getElementById('thresholdGrid');
    if (!grid) return;
    var thresholds = MDS.get('medalThresholds') || [];
    var t = thresholds.filter(function (x) { return x.id === thresholdSet; })[0] || thresholds[0];
    if (!t) return;
    var levels = [
      { key: 'gold', label: '金牌', score: t.gold, cls: 'th-gold' },
      { key: 'silver', label: '银牌', score: t.silver, cls: 'th-silver' },
      { key: 'bronze', label: '铜牌', score: t.bronze, cls: 'th-bronze' },
    ];
    grid.innerHTML = levels
      .map(function (l) {
        return (
          '<div class="threshold-card ' + l.cls + '">' +
          '<span class="medal-badge level-' + l.key + '"></span>' +
          '<div class="th-level">' + l.label + '</div>' +
          '<div class="th-score">' + l.score + '<span class="unit"> 分</span></div>' +
          '<div class="th-desc">积分达门槛授予' + l.label + '</div>' +
          '<button type="button" class="pc-btn pc-btn-edit pc-btn-sm th-edit" data-action="threshold-edit" data-id="' + t.id + '" data-level="' + l.key + '">调整门槛</button>' +
          '</div>'
        );
      })
      .join('');
  }

  function fillThresholdDialog(id, level) {
    var thresholds = MDS.get('medalThresholds') || [];
    var t = thresholds.filter(function (x) { return x.id === id; })[0];
    if (!t) return;
    editingThresholdId = id;
    var setText = document.getElementById('thresholdSetText');
    if (setText) setText.textContent = t.set;
    var cur = level === 'gold' ? t.gold : level === 'silver' ? t.silver : t.bronze;
    var gold = document.getElementById('thGold');
    var silver = document.getElementById('thSilver');
    var bronze = document.getElementById('thBronze');
    if (gold) gold.value = t.gold;
    if (silver) silver.value = t.silver;
    if (bronze) bronze.value = t.bronze;
    Proto.openDialog('thresholdDialog');
  }

  function saveThresholdDialog() {
    var gold = parseInt((document.getElementById('thGold') || {}).value, 10);
    var silver = parseInt((document.getElementById('thSilver') || {}).value, 10);
    var bronze = parseInt((document.getElementById('thBronze') || {}).value, 10);
    if (isNaN(gold) || isNaN(silver) || isNaN(bronze)) {
      Proto.showToast('请填写完整门槛分值');
      return;
    }
    MDS.update('medalThresholds', function (list) {
      return list.map(function (t) {
        return t.id === editingThresholdId ? Object.assign({}, t, { gold: gold, silver: silver, bronze: bronze }) : t;
      });
    });
    Proto.closeDialog('thresholdDialog');
    renderMedalThreshold(qs('#pcPage'));
    Proto.showToast('门槛已更新，已联动月度发放清单');
  }

  /* ═══════════════════════ PC：教师勋章档案 ═══════════════════════ */

  var medalTeacherFilter = '';
  var medalSemesterFilter = '';
  var detailMedalId = null;

  function renderMedalArchive(root) {
    var grid = document.getElementById('medalArchiveGrid');
    if (!grid) return;
    var medals = MDS.get('medals') || [];
    var list = medals.filter(function (m) {
      if (medalTeacherFilter && m.teacher !== medalTeacherFilter) return false;
      if (medalSemesterFilter && m.period.indexOf(medalSemesterFilter) < 0) return false;
      return true;
    });
    if (!list.length) {
      grid.innerHTML = '<div class="pc-empty" style="grid-column:1/-1;"><div class="empty-icon">🎖️</div><div>暂无匹配勋章记录</div></div>';
      return;
    }
    grid.innerHTML = list
      .map(function (m) {
        return (
          '<div class="medal-cell" data-action="medal-detail" data-id="' + m.id + '">' +
          '<span class="medal-badge level-' + (m.level === '金' ? 'gold' : m.level === '银' ? 'silver' : 'bronze') + '"></span>' +
          '<div class="mc-period">' + esc(m.teacher) + ' · ' + esc(m.period) + '</div>' +
          '<span class="mc-type">' + esc(m.type) + (m.type === '活动专项' ? ' · ' + esc(m.activity) : '') + '</span>' +
          '<div class="mc-total">当期总积分 ' + m.total + ' · 第 ' + m.rank + ' 名</div>' +
          '</div>'
        );
      })
      .join('');
  }

  function fillMedalDetail(id) {
    var medals = MDS.get('medals') || [];
    var m = medals.filter(function (x) { return x.id === id; })[0];
    if (!m) return;
    detailMedalId = id;
    var head = document.getElementById('medalDetailTitle');
    if (head) head.textContent = m.teacher + ' · ' + m.period + ' · ' + m.type;
    var body = document.getElementById('medalDetailBody');
    if (!body) return;
    body.innerHTML =
      '<table class="dim-table">' +
      '<thead><tr><th>指标</th><th>数值</th><th>单项排位分</th></tr></thead>' +
      '<tbody>' +
      '<tr><td>平台使用</td><td>' + m.usage + '</td><td>' + Math.round(m.usage / 10) + '</td></tr>' +
      '<tr><td>家园互动</td><td>' + m.interaction + '</td><td>' + Math.round(m.interaction / 10) + '</td></tr>' +
      '<tr><td>外部推广</td><td>' + m.promotion + '</td><td>' + Math.round(m.promotion / 10) + '</td></tr>' +
      '<tr><td>会员转化</td><td>' + m.conversion + '</td><td>' + Math.round(m.conversion / 10) + '</td></tr>' +
      '<tr><td><strong>当期总积分</strong></td><td class="dim-total"><strong>' + m.total + '</strong></td><td><strong>' + m.rank + ' 名</strong></td></tr>' +
      '</tbody></table>';
    Proto.openDialog('medalDetailDialog');
  }

  /* ═══════════════════════ PC：月度发放清单（含离职剔除标注） ═══════════════════════ */

  var bonusFilter = 'ALL';

  function renderBonusMonthly(root) {
    renderBonusTable();
  }

  function filteredBonus() {
    var all = MDS.get('monthlyBonus') || [];
    return all.filter(function (b) {
      if (bonusFilter === 'ALL') return true;
      if (bonusFilter === 'EXCLUDED') return b.status === '已剔除';
      return b.status === '正常';
    });
  }

  function renderBonusTable() {
    var tbody = document.getElementById('bonusTbody');
    var count = document.getElementById('bonusCount');
    if (count) count.textContent = '共 ' + filteredBonus().length + ' 条';
    if (!tbody) return;
    var list = filteredBonus();
    if (!list.length) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:#909399;padding:40px 0;">暂无清单记录</td></tr>';
      return;
    }
    tbody.innerHTML = list
      .map(function (b) {
        var excluded = b.status === '已剔除';
        var levelCls = b.medal === '金' ? 'gold' : b.medal === '银' ? 'silver' : 'bronze';
        var statusCell = excluded
          ? '<span class="excluded-tag">已剔除</span>'
          : '<span class="status-tag status-success">正常</span>';
        var remarkCell = excluded
          ? '<span style="color:#e03a2e;font-size:12px;">' + esc(b.remark) + '</span>'
          : '<span style="color:#909399;">—</span>';
        return (
          '<tr class="' + (excluded ? 'row-excluded' : '') + '">' +
          '<td>' + esc(b.teacher) + '</td>' +
          '<td>' + esc(b.className) + '</td>' +
          '<td><span class="medal-badge level-' + levelCls + '"></span></td>' +
          '<td>' + b.usage + '</td>' +
          '<td>' + b.interaction + '</td>' +
          '<td>' + b.promotion + '</td>' +
          '<td>' + b.conversion + '</td>' +
          '<td><strong>' + b.total + '</strong></td>' +
          '<td class="bonus-amount">' + b.bonus + '</td>' +
          '<td>' + statusCell + '</td>' +
          '<td>' + remarkCell + '</td>' +
          '</tr>'
        );
      })
      .join('');
  }

  /* ═══════════════════════ PC：教师管理（含离职标注，复用 CRUD 模式） ═══════════════════════ */

  var teacherSearch = { name: '', phone: '', className: '' };
  var editingTeacherId = null;

  function statusTagClass(status) {
    return { '在职': 'status-primary', '离职': 'status-danger', '试用': 'status-warning' }[status] || 'status-primary';
  }

  function filteredTeachers() {
    var all = MDS.get('teachers') || [];
    var s = teacherSearch;
    return all.filter(function (t) {
      if (s.name && t.name.indexOf(s.name) < 0) return false;
      if (s.phone && t.phone.indexOf(s.phone) < 0) return false;
      if (s.className && t.className !== s.className) return false;
      return true;
    });
  }

  function renderUserTeacher(root) {
    renderTeacherTable();
  }

  function renderTeacherTable() {
    var tbody = document.getElementById('medalTeacherTbody');
    var count = document.getElementById('medalTeacherCount');
    var list = filteredTeachers();
    if (count) count.textContent = '共 ' + list.length + ' 条记录';
    if (!tbody) return;
    if (!list.length) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:#909399;padding:40px 0;">暂无匹配记录</td></tr>';
      return;
    }
    tbody.innerHTML = list
      .map(function (t) {
        var statusCell = t.status === '离职'
          ? '<span class="status-tag status-danger">离职</span>'
          : '<span class="status-tag status-primary">在职</span>';
        return (
          '<tr' + (t.status === '离职' ? ' class="row-excluded"' : '') + '>' +
          '<td><input type="checkbox" class="mt-check" data-id="' + t.id + '"></td>' +
          '<td><span class="cell-avatar">' + esc(t.name.charAt(0)) + '</span>' + esc(t.name) + '</td>' +
          '<td>' + esc(t.gender) + '</td>' +
          '<td>' + esc(t.phone) + '</td>' +
          '<td>' + esc(t.className) + '</td>' +
          '<td>' + esc(t.role) + '</td>' +
          '<td>' + esc(t.hireDate) + '</td>' +
          '<td>' + statusCell + '</td>' +
          '<td class="op-col">' +
          '<span class="action-btn action-edit" data-action="teacher-edit" data-id="' + t.id + '">编辑</span>' +
          '<span class="action-btn action-delete" data-action="teacher-delete" data-id="' + t.id + '">删除</span>' +
          '</td>' +
          '</tr>'
        );
      })
      .join('');
  }

  /* ═══════════════════════ 移动端：tabBar ═══════════════════════ */

  function renderTabBar(activeKey) {
    var root = document.getElementById('tabbarRoot');
    if (!root) return;
    var items = MDS.get('tabBar') || [];
    root.innerHTML = items
      .map(function (it) {
        var active = it.key === activeKey ? ' is-active' : '';
        // 不可点击 Tab（如教师端「我的」）：不绑定 navigate 动作，仅展示
        var disabledCls = it.disabled ? ' is-disabled' : '';
        var action = it.disabled ? '' : ' data-action="navigate" data-path="' + esc(it.href) + '"';
        var badge = it.badge ? '<span class="badge">' + it.badge + '</span>' : '';
        return (
          '<div class="tab-item' + active + disabledCls + '"' + action + '>' +
          '<span class="tab-icon">' + it.icon + '</span>' +
          '<span>' + it.text + '</span>' +
          badge +
          '</div>'
        );
      })
      .join('');
  }

  function currentTabKey() {
    var path = location.pathname;
    if (path.indexOf('activity.html') >= 0) return 'activity';
    if (path.indexOf('rank.html') >= 0) return 'rank';
    if (path.indexOf('medal.html') >= 0) return 'medal';
    if (path.indexOf('mine.html') >= 0) return 'mine';
    return 'home';
  }

  /* ═══════════════════════ 移动端：首页（教师/园长/家长差异化） ═══════════════════════ */

  /* 原始首页功能宫格：分组宫格（点击提示仅演示激励体系，无独立二级页） */
  function homeGridHtml(items) {
    var cells = items
      .map(function (it) {
        return (
          '<div class="mb-grid-item" data-action="show-toast" data-toast="此原型只演示激励体系相关内容">' +
          '<div class="mb-grid-icon" style="background:' + esc(it.bg) + ';color:' + esc(it.color) + '">' + esc(it.icon) + '</div>' +
          '<div class="mb-grid-name">' + esc(it.name) + '</div>' +
          '</div>'
        );
      })
      .join('');
    return '<div class="mb-grid-wrap" style="margin-top:0;"><div class="mb-grid">' + cells + '</div></div>';
  }

  function renderMobileHome() {
    var root = document.getElementById('homeRoot');
    if (!root) return;
    var role = currentRole();
    var p = MDS.get('userProfile');
    var html = '';

    // ── 原始首页内容：Hero（指标胶囊）+ 出勤横幅 + 功能宫格（mock 对齐通用平台原型） ──
    html += '<div class="hero-card">';
    html += '<div class="hero-top">';
    html += '<div class="hero-avatar">' + esc(p.avatar) + '</div>';
    html += '<div class="hero-info">';
    html += '<div class="hero-name">' + esc(p.name) + '</div>';
    html += '<div class="hero-class">' + esc(p.roleLine) + '</div>';
    html += '<div class="hero-date">2026年8月11日 星期二</div>';
    html += '</div></div>';
    if (role === 'teacher' || role === 'principal') {
      html += '<div class="metric-chips">';
      if (role === 'teacher') {
        html +=
          '<div class="metric-chip"><span class="num">35</span><span class="label">在册幼儿</span></div>' +
          '<div class="metric-chip"><span class="num">32</span><span class="label">今日出勤</span></div>' +
          '<div class="metric-chip"><span class="num absent">3</span><span class="label">缺勤/请假</span></div>';
      } else {
        html +=
          '<div class="metric-chip"><span class="num">280</span><span class="label">在册幼儿</span></div>' +
          '<div class="metric-chip"><span class="num">256</span><span class="label">今日出勤</span></div>' +
          '<div class="metric-chip"><span class="num absent">24</span><span class="label">缺勤/请假</span></div>';
      }
      html += '</div>';
    }
    html += '</div>';

    // 教师/园长：出勤横幅 + 原始功能宫格（点击提示仅演示激励体系）
    if (role === 'teacher' || role === 'principal') {
      var att = (MDS.get('homeAttendance') || {})[role] || {};
      html +=
        '<div class="hero-attendance-banner" data-action="show-toast" data-toast="此原型只演示激励体系相关内容">' +
        '<div class="banner-icon">✓</div>' +
        '<div class="banner-body">' +
        '<div class="banner-title">' + esc(att.title) + '</div>' +
        '<div class="banner-sub">' + esc(att.sub) + '</div>' +
        '</div>' +
        '<span class="banner-tag ' + (att.tagClass || 'tag-present') + '">' + esc(att.tag) + '</span>' +
        '</div>';

      var grid = (MDS.get('homeGrid') || {})[role] || [];
      grid.forEach(function (sec) {
        html += '<div class="mb-section-title"><span class="title">' + esc(sec.title) + '</span><span class="subtitle">点击进入功能</span></div>';
        html += homeGridHtml(sec.items);
      });
    }

    // ── 底部：激励体系内容（勋章激励卡 + 勋章功能宫格） ──
    if (role === 'teacher' || role === 'principal') {
      // 勋章激励专区卡：勋章模块作为角色首页的卡片
      html += renderMedalHomeCard(role);
      // 勋章功能宫格（入口进入二级页）
      html += renderMedalGrid(role);
    } else {
      // 家长简版首页（无勋章卡片）
      html += renderParentHome();
    }

    root.innerHTML = html;
  }

  /* 勋章激励专区卡：勋章模块作为角色首页的卡片（教师/园长差异化） */
  function renderMedalHomeCard(role) {
    if (role === 'teacher') return renderTeacherMedalCard();
    return renderPrincipalMedalCard();
  }

  /* 教师勋章卡：今日积分 + 排名/勋章/差距 + 距金牌进度 + 快捷按钮 */
  function renderTeacherMedalCard() {
    var s = MDS.get('teacherScores') || {};
    var total = s.usage.total + s.interaction.total + s.promotion.total + s.conversion.total;
    var today = s.usage.today + s.interaction.today + s.promotion.today + s.conversion.today;
    var next = 2000; // 金牌目标
    var pct = Math.min(100, Math.round((total / next) * 100));
    var html = '';
    html += '<div class="mb-section-title"><span class="title">积分勋章激励</span><span class="subtitle">点击卡片查看勋章档案</span></div>';
    html += '<div class="mb-card medal-home-hero" data-action="navigate" data-path="medal.html" style="padding:16px;">';
    html += '<div class="flex-between">';
    html += '<div><div style="font-size:13px;color:#6b7280;">今日新增积分</div>' +
      '<div class="mb-point-today"><span class="num">+' + today + '</span><span class="unit">分</span></div></div>';
    html += '<span class="medal-badge level-gold"></span>';
    html += '</div>';
    html += '<div class="mb-point-grid">';
    html += '<div class="mb-point-cell"><div class="num">' + s.interaction.rank + '</div><div class="label">本园排名</div></div>';
    html += '<div class="mb-point-cell"><div class="num">金牌</div><div class="label">本月勋章</div></div>';
    html += '<div class="mb-point-cell"><div class="num">-' + s.usage.gap + '</div><div class="label">距上一名</div></div>';
    html += '</div>';
    html += '<div style="margin-top:14px;"><div class="mb-medal-progress"><div class="bar" style="width:' + pct + '%;"></div></div>' +
      '<div class="flex-between" style="font-size:11px;color:#9ca3af;margin-top:6px;">' +
      '<span>当前 ' + total + ' 分</span><span>距金牌 ' + Math.max(0, next - total) + ' 分</span></div></div>';
    html += '<div class="medal-quick-row">';
    html += '<span class="medal-quick-btn" data-action="navigate" data-path="rank.html">🏆 查看排行榜</span>';
    html += '<span class="medal-quick-btn" data-action="navigate" data-path="activity.html">✎ 上传作品</span>';
    html += '</div>';
    html += '</div>';
    return html;
  }

  /* 园长勋章卡：园内 TOP5 + 家长三色进度 + 待办 */
  function renderPrincipalMedalCard() {
    var rankData = MDS.get('rankData') || {};
    var top5 = (rankData.total || []).slice(0, 5);
    var progress = MDS.get('parentProgress') || [];
    var html = '';
    html += '<div class="mb-section-title"><span class="title">园内激励动态</span><span class="subtitle">积分勋章体系</span></div>';
    html += '<div class="mb-card" style="padding:4px 14px;">';
    top5.forEach(function (it) {
      html +=
        '<div class="mb-rank-item' + (it.isMe ? ' is-me' : '') + '">' +
        '<span class="rank-badge ' + (it.rank <= 3 ? 'rk-' + it.rank : 'rk-n') + '" style="width:26px;height:26px;font-size:13px;">' + it.rank + '</span>' +
        '<span class="rk-name">' + esc(it.name) + '</span><span class="rk-score">' + it.score + '</span></div>';
    });
    html += '<div style="border-top:1px dashed var(--mb-border-light);padding:10px 0 12px;">' +
      '<div style="font-weight:600;font-size:14px;">家长注册进度</div>';
    progress.slice(0, 2).forEach(function (p) {
      var regPct = Math.round((p.registered / p.total) * 100);
      var actPct = Math.round((p.active / p.total) * 100);
      html +=
        '<div style="margin-top:8px;"><div class="flex-between"><span style="font-size:12px;">' + esc(p.className) + '</span><span style="font-size:11px;color:#9ca3af;">注册率 ' + regPct + '%</span></div>' +
        '<div class="progress-tri" style="margin-top:4px;"><span class="seg seg-registered" style="width:' + regPct + '%"></span>' +
        '<span class="seg seg-active" style="width:' + actPct + '%"></span>' +
        '<span class="seg seg-unregistered" style="width:' + (100 - regPct) + '%"></span></div></div>';
    });
    html += '</div>';
    html += '</div>';

    html += '<div class="mb-section-title" style="padding-top:10px;"><span class="title">待处理事项</span></div>';
    html += '<div class="mb-card" style="padding:4px 0;">';
    html += mbListRow('作品审核', '38 份作品待审核', 'activity.html');
    html += mbListRow('评委分配', '课件大赛待分配评委', 'activity.html');
    html += '</div>';
    return html;
  }

  /* 勋章功能宫格：勋章模块入口（点击进入二级页） */
  function renderMedalGrid(role) {
    var items = [];
    if (role === 'teacher') {
      items = [
        { name: '我的勋章', icon: '★', color: '#f5a623', bg: '#fff7e6', path: 'medal.html' },
        { name: '排行榜', icon: '♛', color: '#f9ca24', bg: '#fffce8', path: 'rank.html' },
        { name: '上传作品', icon: '✎', color: '#ff8a00', bg: '#fff5eb', path: 'activity.html' },
        { name: '我的奖金', icon: '💰', color: '#f59e0b', bg: '#fffbe6', path: 'mine.html' },
        { name: '活动中心', icon: '📋', color: '#4facfe', bg: '#e6f4ff', path: 'activity.html' },
      ];
    } else {
      items = [
        { name: '园内排行榜', icon: '♛', color: '#f9ca24', bg: '#fffce8', path: 'rank.html' },
        { name: '家长进度', icon: '👪', color: '#66cc99', bg: '#e6f9f0', path: 'rank.html' },
        { name: '勋章档案', icon: '★', color: '#f5a623', bg: '#fff7e6', path: 'medal.html' },
        { name: '奖金清单', icon: '💰', color: '#f59e0b', bg: '#fffbe6', path: 'mine.html' },
        { name: '活动管理', icon: '📋', color: '#4facfe', bg: '#e6f4ff', path: 'activity.html' },
      ];
    }
    var html = '<div class="mb-section-title"><span class="title">积分勋章</span><span class="subtitle">激励体系</span></div>';
    html += '<div class="mb-grid-wrap" style="margin-top:0;"><div class="mb-grid">';
    items.forEach(function (it) {
      html += mbGridCell(it.name, it.icon, it.color, it.bg, it.path);
    });
    html += '</div></div>';
    return html;
  }

  /* 家长端首页：班级动态 + 活动推荐 */
  function renderParentHome() {
    var notices = MDS.get('notices') || [];
    var html = '';
    html += '<div class="mb-section-title"><span class="title">班级动态</span></div>';
    html += '<div class="mb-card" style="padding:4px 0;">';
    notices.slice(0, 3).forEach(function (n) {
      html +=
        '<div class="mb-list-item" style="box-shadow:none;margin-top:0;" data-action="notice-read" data-id="' + esc(n.id) + '">' +
        '<div class="item-title">' + esc(n.title) + '</div>' +
        '<div class="item-time">' + esc(n.time) + ' · ' + esc(n.from) + '</div>' +
        '</div>';
    });
    html += '</div>';
    html += '<div class="mb-section-title"><span class="title">活动推荐</span></div>';
    html += '<div class="mb-card" style="padding:14px;">' +
      '<div style="font-weight:600;">六一主题环创比赛</div>' +
      '<div style="font-size:12px;color:#9ca3af;margin-top:4px;">全园征集 · 投稿截止 09-15</div>' +
      '</div>';
    return html;
  }

  function mbGridCell(name, icon, color, bg, path) {
    return (
      '<div class="mb-grid-item" data-action="navigate" data-path="' + path + '">' +
      '<div class="mb-grid-icon" style="background:' + bg + ';color:' + color + '">' + icon + '</div>' +
      '<div class="mb-grid-name">' + name + '</div>' +
      '</div>'
    );
  }

  function mbListRow(title, desc, path) {
    return (
      '<div class="list-cell list-cell-arrow" data-action="navigate" data-path="' + path + '">' +
      '<span class="menu-icon">▸</span>' +
      '<div><div style="font-size:14px;">' + esc(title) + '</div><div style="font-size:11px;color:#9ca3af;margin-top:2px;">' + esc(desc) + '</div></div>' +
      '</div>'
    );
  }

  /* ═══════════════════════ 移动端：活动页 ═══════════════════════ */

  var mobileActFilter = 'all';

  function renderMobileActivity() {
    var list = document.getElementById('activityList');
    if (!list) return;
    var activities = MDS.get('activities') || [];
    var filtered = activities.filter(function (a) {
      switch (mobileActFilter) {
        case 'published':
          return a.status === 'PUBLISHED';
        case 'draft':
          return a.status === 'DRAFT';
        default:
          return true;
      }
    });
    if (!filtered.length) {
      list.innerHTML = '<div class="mb-empty-tip">暂无活动</div>';
      return;
    }
    var isTeacher = currentRole() === 'teacher';
    list.innerHTML = filtered
      .map(function (a) {
        var statusText = MDS.ACTIVITY_STATUS[a.status] || a.status;
        var statusCls = 'st-' + a.status;
        var ops = '';
        // 活动发布后教师即可上传作品
        if (isTeacher && a.status === 'PUBLISHED') {
          ops = '<button type="button" class="mb-btn" style="height:34px;padding:0 18px;font-size:13px;" data-action="upload-sheet" data-id="' + a.id + '">上传作品</button>';
        }
        return (
          '<div class="mb-activity-card">' +
          '<div class="ac-title">' + esc(a.title) + '<span class="act-status ' + statusCls + '" style="font-size:11px;">' + esc(statusText) + '</span></div>' +
          '<div class="ac-desc">活动对象：' + esc(actScopeText(a.targetKindergartens)) + ' · 作品格式：' + esc(a.format) + '</div>' +
          '<div class="ac-meta">' +
          '<span>报名：' + esc(a.signupStart || '—') + ' ~ ' + esc(a.signupEnd || '—') + '</span>' +
          ops +
          '</div>' +
          '</div>'
        );
      })
      .join('');
  }

  /* ═══════════════════════ 移动端：排行榜 ═══════════════════════ */

  function renderMobileRank() {
    var box = document.getElementById('mobileRankList');
    if (!box) return;
    var rankData = MDS.get('rankData') || {};
    var boardKey = getParam('board') || 'total';
    var items = rankData[boardKey] || [];
    box.innerHTML = items
      .map(function (it) {
        var isMe = it.isMe ? ' is-me' : '';
        var badgeCls = it.rank <= 3 ? 'rk-' + it.rank : 'rk-n';
        var trendIcon = it.trend === 'up' ? '↑' : it.trend === 'down' ? '↓' : '→';
        var trendCls = it.trend === 'up' ? 'trend-up' : it.trend === 'down' ? 'trend-down' : 'trend-flat';
        return (
          '<div class="mb-rank-item' + isMe + '">' +
          '<span class="rank-badge ' + badgeCls + '" style="width:26px;height:26px;font-size:13px;">' + it.rank + '</span>' +
          '<span class="rk-name">' + esc(it.name) + (isMe ? '<span class="me-tag">我</span>' : '') + '</span>' +
          '<span class="rk-class" style="font-size:11px;color:#9ca3af;">' + esc(it.className) + '</span>' +
          '<span class="rk-score">' + it.score + '</span>' +
          '<span class="rank-trend ' + trendCls + '" style="width:20px;height:20px;">' + trendIcon + '</span>' +
          '</div>'
        );
      })
      .join('');
  }

  /* 个人排行详情（移动端排行榜下方）：多维度看板 + 趋势图 + 家长进度 */
  function renderMobileRankDetail() {
    var box = document.getElementById('rankDetail');
    if (!box) return;
    var s = MDS.get('teacherScores') || {};
    var progress = MDS.get('parentProgress') || [];
    var meClass = progress[1] || progress[0]; // 中一班
    var html = '';

    // 多维度看板
    html += '<div class="mb-section-title"><span class="title">我的多维数据</span></div>';
    html += '<div class="mb-card" style="padding:4px 0;">';
    html += dimCell('平台使用', s.usage.total, s.usage.today, s.usage.gap);
    html += dimCell('家园互动', s.interaction.total, s.interaction.today, s.interaction.gap);
    html += dimCell('外部推广', s.promotion.total, s.promotion.today, s.promotion.gap);
    html += dimCell('会员转化', s.conversion.total, s.conversion.today, s.conversion.gap);
    html += '</div>';

    // 趋势图（简易柱状，占位演示：本人/园内均值/当日第一 三条线）
    html += '<div class="mb-section-title"><span class="title">积分趋势</span><span class="subtitle">近 7 日</span></div>';
    html += '<div class="mb-card" style="padding:12px 14px;">';
    var trend = s.trend || [];
    html += '<div class="mb-bar-chart">';
    var maxV = 180;
    trend.forEach(function (t) {
      var hMe = Math.round((t.me / maxV) * 100);
      var hAvg = Math.round((t.avg / maxV) * 100);
      var hTop = Math.round((t.top / maxV) * 100);
      html +=
        '<div class="bar" style="height:' + Math.max(hMe, hAvg, hTop) + '%;">' +
        '<span class="bar-top" style="bottom:' + hTop + '%;"></span>' +
        '<span class="bar-avg" style="bottom:' + hAvg + '%;"></span>' +
        '<span class="bar-me" style="bottom:' + hMe + '%;"></span>' +
        '</div>';
    });
    html += '</div>';
    html += '<div class="mb-legend">' +
      '<span class="lg"><span class="swatch" style="background:#ff8a00;"></span>本人</span>' +
      '<span class="lg"><span class="swatch" style="background:#9ca3af;"></span>园内均值</span>' +
      '<span class="lg"><span class="swatch" style="background:#f9ca24;"></span>当日第一</span>' +
      '</div>';
    html += '</div>';

    // 班级家长进度
    html += '<div class="mb-section-title"><span class="title">班级家长进度</span><span class="subtitle">' + esc(meClass.className) + '</span></div>';
    html += '<div class="mb-card" style="padding:12px 14px;">';
    var regPct = Math.round((meClass.registered / meClass.total) * 100);
    var actPct = Math.round((meClass.active / meClass.total) * 100);
    html += '<div class="progress-tri">' +
      '<span class="seg seg-registered" style="width:' + regPct + '%"></span>' +
      '<span class="seg seg-active" style="width:' + actPct + '%"></span>' +
      '<span class="seg seg-unregistered" style="width:' + (100 - regPct) + '%"></span>' +
      '</div>';
    html += '<div class="mb-legend">' +
      '<span class="lg"><span class="swatch" style="background:#66cc99;"></span>已注册 ' + meClass.registered + '</span>' +
      '<span class="lg"><span class="swatch" style="background:#ff8a00;"></span>已激活 ' + meClass.active + '</span>' +
      '<span class="lg"><span class="swatch" style="background:#d1d5db;"></span>未注册 ' + (meClass.total - meClass.registered) + '</span>' +
      '</div>';
    html += '</div>';

    box.innerHTML = html;
  }

  function dimCell(name, total, today, gap) {
    return (
      '<div class="mb-rank-item">' +
      '<span class="rk-name" style="flex:0 0 76px;">' + esc(name) + '</span>' +
      '<div style="flex:1;font-size:12px;color:#6b7280;">' +
      '<span style="margin-right:12px;">累计 <b>' + total + '</b></span>' +
      '<span style="margin-right:12px;color:#33c28a;">今日 +' + today + '</span>' +
      '<span style="color:#9ca3af;">距上名 ' + gap + '</span>' +
      '</div>' +
      '</div>'
    );
  }

  /* ═══════════════════════ 移动端：我的勋章 ═══════════════════════ */

  var medalTypeFilter = 'all';
  var medalPeriodFilter = '';

  function renderMobileMedal() {
    var hero = document.getElementById('medalHero');
    var list = document.getElementById('medalList');
    var s = MDS.get('teacherScores') || {};
    if (hero) {
      var total = s.usage.total + s.interaction.total + s.promotion.total + s.conversion.total;
      var next = 2000; // 距下一级（金牌）目标
      var pct = Math.min(100, Math.round((total / next) * 100));
      hero.innerHTML =
        '<div class="mb-medal-hero">' +
        '<div class="flex-between">' +
        '<div><div style="font-size:13px;color:#6b7280;">本月勋章</div>' +
        '<div style="margin-top:8px;"><span class="medal-badge level-gold medal-badge-lg"></span></div></div>' +
        '<div style="text-align:right;">' +
        '<div style="font-size:13px;color:#6b7280;">当前积分</div>' +
        '<div style="font-size:26px;font-weight:800;color:#ff8a00;">' + total + '</div>' +
        '<div style="font-size:11px;color:#9ca3af;">距金牌 ' + Math.max(0, next - total) + ' 分</div>' +
        '</div></div>' +
        '<div style="margin-top:14px;"><div class="mb-medal-progress"><div class="bar" style="width:' + pct + '%;"></div></div>' +
        '<div style="display:flex;justify-content:space-between;font-size:11px;color:#9ca3af;margin-top:6px;"><span>铜牌 150</span><span>银牌 300</span><span>金牌 500</span></div></div>' +
        '</div>';
    }
    if (!list) return;
    var medals = MDS.get('medals') || [];
    var filtered = medals.filter(function (m) {
      if (medalTypeFilter !== 'all' && m.type !== medalTypeFilter) return false;
      if (medalPeriodFilter && m.period !== medalPeriodFilter) return false;
      return true;
    });
    list.innerHTML = filtered
      .map(function (m) {
        var levelCls = m.level === '金' ? 'gold' : m.level === '银' ? 'silver' : 'bronze';
        return (
          '<div class="mb-medal-row" data-action="medal-detail" data-id="' + m.id + '">' +
          '<span class="medal-badge level-' + levelCls + '"></span>' +
          '<div class="mm-period">' + esc(m.period) + ' · ' + esc(m.type) + '</div>' +
          '<span style="font-size:12px;color:#6b7280;">总积分 ' + m.total + '</span>' +
          '</div>'
        );
      })
      .join('');
    if (!filtered.length) list.innerHTML = '<div class="mb-empty-tip">暂无勋章记录</div>';
  }

  /* ═══════════════════════ 移动端：我的 ═══════════════════════ */

  var noticeFilter = 'all';

  function renderMobileMine() {
    var role = currentRole();
    var p = MDS.get('userProfile');
    var avatar = document.getElementById('mineAvatar');
    var name = document.getElementById('mineName');
    var roleLine = document.getElementById('mineRole');
    if (avatar) avatar.textContent = p.avatar;
    if (name) name.textContent = p.name;
    if (roleLine) roleLine.textContent = p.roleLine;

    var bonus = document.getElementById('mineBonus');
    if (bonus) {
      bonus.innerHTML =
        '<div class="sub-row"><span class="label">本月勋章</span><span class="value" style="color:#f5a623;">金牌 · 奖金 ¥800</span></div>' +
        '<div class="sub-row"><span class="label">历史累计奖金</span><span class="value">¥ 5,200</span></div>' +
        '<div class="sub-row"><span class="label">期末汇总</span><span class="value">¥ 6,300（含专项）</span></div>';
    }

    renderNoticeList();

    var switchBox = document.getElementById('switchAdmin');
    if (switchBox) {
      switchBox.hidden = role !== 'principal';
    }
  }

  function renderNoticeList() {
    var root = document.getElementById('noticeList');
    if (!root) return;
    var all = MDS.get('notices') || [];
    var list = all.filter(function (n) {
      if (noticeFilter === 'unread') return !n.read;
      if (noticeFilter === 'read') return n.read;
      return true;
    });
    if (!list.length) {
      root.innerHTML = '<div class="mb-empty-tip">暂无消息</div>';
      return;
    }
    root.innerHTML = list
      .map(function (n) {
        return (
          '<div class="mb-list-item' + (n.read ? '' : ' is-unread') + '" data-action="notice-read" data-id="' + esc(n.id) + '">' +
          '<div class="item-title">' + esc(n.title) + '</div>' +
          '<div class="item-desc">' + esc(n.desc) + '</div>' +
          '<div class="item-time">' + esc(n.time) + ' · ' + esc(n.from) + '</div>' +
          '</div>'
        );
      })
      .join('');
  }

  /* ═══════════════════════ 业务 action 注册 ═══════════════════════ */

  function registerActions() {
    // 角色切换 / 入口 / 重置
    // 入口导航页（index.html）：新标签页打开目标端（导航页停留，便于多端对比）
    Proto.registerAction('role-open-tab', function (el) {
      var role = el.getAttribute('data-role');
      if (!role) return;
      MDS.setRole(role);
      window.open(MDS.ROLES[role].home, '_blank');
    });

    // 原型内浮动面板角色切换：当前标签页就地跳转
    Proto.registerAction('role-switch', function (el) {
      var role = el.getAttribute('data-role');
      if (!role) return;
      MDS.setRole(role);
      location.href = MDS.ROLES[role].home;
    });

    Proto.registerAction('goto-index', function () {
      // 勋章体系独立入口（medal-system/index.html）
      var from = location.pathname;
      if (from.indexOf('/pc/') >= 0 || from.indexOf('/mobile/') >= 0) {
        location.href = '../index.html';
      } else {
        location.href = 'index.html';
      }
    });

    Proto.registerAction('reset-demo', function () {
      MDS.resetAll();
      rerenderCurrentPage();
      Proto.showToast('已重置为默认数据');
      var panel = document.getElementById('rolePanel');
      if (panel) panel.hidden = true;
    });

    Proto.registerAction('role-fab-toggle', function () {
      var panel = document.getElementById('rolePanel');
      if (panel) panel.hidden = !panel.hidden;
    });

    Proto.registerAction('navigate', function (el) {
      var path = el.getAttribute('data-path');
      if (!path) return;
      location.href = path;
    });

    // ── PC 端：动态菜单 + TagsView ──
    Proto.registerAction('pc-menu-toggle', function (el) {
      var sidebar = document.querySelector('.pc-sidebar');
      if (sidebar && sidebar.classList.contains('is-collapsed')) {
        sidebar.classList.remove('is-collapsed');
      }
      var title = el.getAttribute('data-menu-parent');
      if (!title) return;
      var expanded = MDS.get('pcExpanded') || [];
      var idx = expanded.indexOf(title);
      if (idx >= 0) {
        expanded.splice(idx, 1);
      } else {
        expanded.push(title);
      }
      MDS.set('pcExpanded', expanded);
      renderPcMenu();
    });

    Proto.registerAction('pc-menu-select', function (el) {
      activateTag(el.getAttribute('data-menu-key'));
    });

    Proto.registerAction('pc-tag-select', function (el) {
      activateTag(el.getAttribute('data-tag-key'));
    });

    Proto.registerAction('pc-tag-close', function (el) {
      closeTag(el.getAttribute('data-tag-key'));
    });

    Proto.registerAction('pc-tags-more', function () {
      toggleMoreMenu();
    });

    Proto.registerAction('pc-tags-close-others', function () {
      closeOtherTags();
    });

    Proto.registerAction('pc-tags-close-all', function () {
      closeAllTags();
    });

    // ── 活动：搜索 / 重置（名称 + 类型） ──
    Proto.registerAction('act-search', function () {
      actTypeFilter = (qs('#actTypeFilter') || {}).value || '';
      renderActivityTable();
      Proto.showToast('已按筛选条件查询');
    });

    Proto.registerAction('act-reset', function () {
      var nameEl = qs('#actSearch');
      if (nameEl) nameEl.value = '';
      var typeEl = qs('#actTypeFilter');
      if (typeEl) typeEl.value = '';
      actTypeFilter = '';
      renderActivityTable();
      Proto.showToast('已重置筛选条件');
    });

    // ── 活动：状态机 + CRUD ──
    Proto.registerAction('act-transition', function (el) {
      var id = Number(el.getAttribute('data-id'));
      var next = el.getAttribute('data-next');
      MDS.update('activities', function (arr) {
        return arr.map(function (a) {
          if (a.id !== id) return a;
          var status = next;
          // 两态流转：未发布 ↔ 已发布，作品数不变；发布时记录发布时间，撤回时清空
          var publishTime = a.publishTime || '';
          if (status === 'PUBLISHED') {
            publishTime = publishTime || todayStr();
          } else {
            publishTime = '';
          }
          return Object.assign({}, a, { status: status, publishTime: publishTime });
        });
      });
      renderActivityTable();
      Proto.showToast('状态已更新为「' + (MDS.ACTIVITY_STATUS[next] || next) + '」');
    });

    Proto.registerAction('act-add', function () {
      renderAwardRows('actAwardTbody');
      Proto.openDialog('actAddDialog');
    });

    Proto.registerAction('act-save-add', function () {
      var title = (document.getElementById('actTitle') || {}).value || '';
      if (!title) {
        Proto.showToast('请填写活动名称');
        return;
      }
      var a = {
        id: Date.now(),
        title: title,
        type: (document.getElementById('actType') || {}).value || '论文比赛',
        status: 'DRAFT',
        signupStart: (document.getElementById('actStart') || {}).value || '',
        signupEnd: (document.getElementById('actEnd') || {}).value || '',
        targetKindergartens: readScopeChecks('kgScope').length ? readScopeChecks('kgScope') : ['全部幼儿园'],
        format: (document.getElementById('actFormat') || {}).value || '文档',
        awards: readAwardRows('actAwardTbody'),
        desc: (document.getElementById('actDesc') || {}).value || '',
        publishTime: '',
        participants: 0,
        worksCount: 0,
      };
      MDS.update('activities', function (arr) {
        return [a].concat(arr || []);
      });
      Proto.closeDialog('actAddDialog');
      actFilter = 'ALL';
      syncFilterTabs('actFilterTabs', 'ALL');
      renderActivityTable();
      Proto.showToast('已新增活动（未发布）');
    });

    Proto.registerAction('act-edit', function (el) {
      var id = Number(el.getAttribute('data-id'));
      var a = (MDS.get('activities') || []).filter(function (x) { return x.id === id; })[0];
      if (!a) return;
      var fields = { eActTitle: a.title, eActType: a.type, eActStart: a.signupStart, eActEnd: a.signupEnd, eActFormat: a.format, eActDesc: a.desc || '' };
      Object.keys(fields).forEach(function (fid) {
        var input = document.getElementById(fid);
        if (input) input.value = fields[fid];
      });
      fillScopeChecks('eKgScope', a.targetKindergartens);
      renderAwardRows('eActAwardTbody', a.awards);
      document.getElementById('eActId').value = id;
      Proto.openDialog('actEditDialog');
    });

    Proto.registerAction('act-save-edit', function () {
      var id = Number((document.getElementById('eActId') || {}).value);
      MDS.update('activities', function (arr) {
        return arr.map(function (a) {
          if (a.id !== id) return a;
          return Object.assign({}, a, {
            title: (document.getElementById('eActTitle') || {}).value || a.title,
            type: (document.getElementById('eActType') || {}).value || a.type,
            signupStart: (document.getElementById('eActStart') || {}).value || a.signupStart,
            signupEnd: (document.getElementById('eActEnd') || {}).value || a.signupEnd,
            targetKindergartens: readScopeChecks('eKgScope').length ? readScopeChecks('eKgScope') : a.targetKindergartens,
            format: (document.getElementById('eActFormat') || {}).value || a.format,
            awards: readAwardRows('eActAwardTbody'),
            desc: (document.getElementById('eActDesc') || {}).value || a.desc,
          });
        });
      });
      Proto.closeDialog('actEditDialog');
      renderActivityTable();
      Proto.showToast('已保存活动修改');
    });

    Proto.registerAction('act-delete', function (el) {
      var id = Number(el.getAttribute('data-id'));
      MDS.update('activities', function (arr) {
        return arr.filter(function (x) { return x.id !== id; });
      });
      renderActivityTable();
      Proto.showToast('已删除活动');
    });

    // ── 活动：查看作品（已发布活动 → 跳转作品管理页，过滤为该活动；概览待办亦可按活动进入） ──
    Proto.registerAction('act-works', function (el) {
      var act = el.getAttribute('data-works-activity') || '';
      var id = Number(el.getAttribute('data-id') || '');
      if (!act && id) {
        var a = (MDS.get('activities') || []).filter(function (x) { return x.id === id; })[0];
        if (a) act = a.title;
      }
      worksActivityFilter = act;
      activateTag('activity-works');
    });

    // ── 活动：奖项设置 CRUD 表格（新增/编辑弹窗内） ──
    Proto.registerAction('award-row-add', function (el) {
      var tbody = document.getElementById(el.getAttribute('data-target'));
      if (tbody) {
        tbody.insertAdjacentHTML('beforeend', awardRowHtml({}));
        renumberAwardRows(tbody);
      }
    });

    Proto.registerAction('award-row-del', function (el) {
      var tbody = el.closest('tbody');
      var tr = el.closest('tr');
      if (tbody && tr) {
        tr.remove();
        renumberAwardRows(tbody);
      }
    });

    // ── 活动：通知弹窗（过滤部分老师不发送） ──
    Proto.registerAction('act-notify', function (el) {
      var id = Number(el.getAttribute('data-id'));
      var a = (MDS.get('activities') || []).filter(function (x) { return x.id === id; })[0];
      if (!a) return;
      fillNotifyDialog(a);
    });

    Proto.registerAction('notify-toggle-all', function (el) {
      // 仅对当前筛选后可见的老师做全选/全不选，其他已选老师状态保持不变
      var box = document.getElementById('notifyTeacherList');
      var checks = box ? box.querySelectorAll('.notify-teacher') : [];
      var allChecked = checks.length > 0 && box.querySelectorAll('.notify-teacher:checked').length === checks.length;
      checks.forEach(function (c) {
        if (allChecked) {
          delete notifySelected[c.value];
        } else {
          notifySelected[c.value] = true;
        }
        c.checked = !allChecked;
      });
      updateNotifyCount();
    });

    Proto.registerAction('notify-count', function () {
      updateNotifyCount();
    });

    Proto.registerAction('notify-send', function () {
      // 已选集合跨筛选累计：以 notifySelected 为准，而非 DOM 中可见的勾选项
      var names = notifyTeachers.filter(function (t) { return notifySelected[t.name]; }).map(function (t) { return t.name; });
      if (!names.length) {
        Proto.showToast('请至少选择一位老师');
        return;
      }
      Proto.closeDialog('notifyDialog');
      Proto.showToast('已向 ' + names.length + ' 位老师发送通知');
    });

    Proto.registerAction('act-batch-delete', function () {
      var checks = document.querySelectorAll('.act-check:checked');
      if (!checks.length) {
        Proto.showToast('请先勾选要删除的活动');
        return;
      }
      var ids = {};
      checks.forEach(function (c) {
        ids[Number(c.getAttribute('data-id'))] = true;
      });
      MDS.update('activities', function (arr) {
        return arr.filter(function (a) {
          return !ids[a.id];
        });
      });
      renderActivityTable();
      Proto.showToast('已删除所选 ' + checks.length + ' 条');
    });

    // ── 作品：筛选（作品名称 + 教师名称） ──
    Proto.registerAction('works-search', function () {
      worksSearch.name = (qs('#worksSearchName') || {}).value || '';
      worksSearch.teacher = (qs('#worksSearchTeacher') || {}).value || '';
      renderWorksTable();
      Proto.showToast('已按筛选条件查询');
    });

    Proto.registerAction('works-reset', function () {
      var n = qs('#worksSearchName');
      if (n) n.value = '';
      var t = qs('#worksSearchTeacher');
      if (t) t.value = '';
      worksSearch = { name: '', teacher: '' };
      renderWorksTable();
      Proto.showToast('已重置筛选条件');
    });

    // ── 作品：预览 ──
    Proto.registerAction('works-preview', function (el) {
      var id = Number(el.getAttribute('data-id'));
      var w = (MDS.get('works') || []).filter(function (x) { return x.id === id; })[0];
      if (!w) return;
      var body = document.getElementById('worksPreviewBody');
      if (body) {
        body.innerHTML =
          '<div style="text-align:center;padding:24px 0;">' +
          '<div style="font-size:46px;">' + (w.type === '图片' ? '🖼️' : '📄') + '</div>' +
          '<div style="margin-top:10px;font-weight:600;">' + esc(w.title || w.teacher + ' 的作品') + '</div>' +
          '<div style="font-size:12px;color:#909399;margin-top:6px;">' + esc(w.teacher) + ' · ' + esc(w.activity) + ' · ' + esc(w.type) + ' · ' + esc(w.size) + '</div>' +
          '<div style="margin-top:16px;font-size:12px;color:#909399;">（演示原型：在线预览为占位区域）</div>' +
          '</div>';
      }
      Proto.openDialog('worksPreviewDialog');
    });

    // ── 积分方案 ──
    Proto.registerAction('score-weight-edit', function (el) {
      fillWeightDialog(Number(el.getAttribute('data-id')));
    });

    Proto.registerAction('score-weight-save', function () {
      saveWeightDialog();
    });

    Proto.registerAction('score-enable', function (el) {
      var id = Number(el.getAttribute('data-id'));
      var s = (MDS.get('scoreSchemes') || []).filter(function (x) { return x.id === id; })[0];
      if (!s) return;
      if (!confirm('切换后将从下个结算周期起生效，当前周期不受影响。\n方案快照将自动生成，是否继续启用「' + s.name + '」？')) {
        return;
      }
      MDS.update('scoreSchemes', function (arr) {
        return arr.map(function (x) { return Object.assign({}, x, { isActive: x.id === id }); });
      });
      renderScoreScheme(qs('#pcPage'));
      Proto.showToast('已启用「' + s.name + '」，方案快照已生成');
    });

    Proto.registerAction('score-copy', function (el) {
      var id = Number(el.getAttribute('data-id'));
      var s = (MDS.get('scoreSchemes') || []).filter(function (x) { return x.id === id; })[0];
      if (!s) return;
      var copy = JSON.parse(JSON.stringify(s));
      copy.id = Date.now();
      copy.name = s.name + '（副本）';
      copy.isActive = false;
      copy.updatedAt = '刚刚 复制';
      MDS.update('scoreSchemes', function (arr) {
        return arr.concat([copy]);
      });
      renderScoreScheme(qs('#pcPage'));
      Proto.showToast('已复制为「' + copy.name + '」');
    });

    // ── 勋章门槛 ──
    Proto.registerAction('threshold-edit', function (el) {
      fillThresholdDialog(Number(el.getAttribute('data-id')), el.getAttribute('data-level'));
    });

    Proto.registerAction('threshold-save', function () {
      saveThresholdDialog();
    });

    // ── 勋章档案 ──
    Proto.registerAction('medal-detail', function (el) {
      var id = Number(el.getAttribute('data-id'));
      if (location.pathname.indexOf('pc/') >= 0) {
        fillMedalDetail(id);
      } else {
        showMedalDetailSheet(id);
      }
    });

    // ── 月度清单 ──
    Proto.registerAction('bonus-export', function () {
      Proto.showToast('演示功能：已导出月度发放清单（含四大维度数据）');
    });

    Proto.registerAction('bonus-batch-export', function () {
      Proto.showToast('演示功能：已导出所选清单');
    });

    // ── 教师管理 ──
    Proto.registerAction('teacher-search', function () {
      teacherSearch.name = (qs('#mtSearchName') || {}).value || '';
      teacherSearch.phone = (qs('#mtSearchPhone') || {}).value || '';
      teacherSearch.className = (qs('#mtSearchClass') || {}).value || '';
      renderTeacherTable();
    });

    Proto.registerAction('teacher-reset', function () {
      teacherSearch = { name: '', phone: '', className: '' };
      ['#mtSearchName', '#mtSearchPhone'].forEach(function (sel) {
        var el = qs(sel);
        if (el) el.value = '';
      });
      var cls = qs('#mtSearchClass');
      if (cls) cls.value = '';
      renderTeacherTable();
    });

    Proto.registerAction('teacher-edit', function (el) {
      var id = Number(el.getAttribute('data-id'));
      var t = (MDS.get('teachers') || []).filter(function (x) { return x.id === id; })[0];
      if (!t) return;
      editingTeacherId = id;
      var fields = { mtEditName: t.name, mtEditGender: t.gender, mtEditPhone: t.phone, mtEditClass: t.className, mtEditRole: t.role, mtEditStatus: t.status };
      Object.keys(fields).forEach(function (fid) {
        var input = document.getElementById(fid);
        if (input) input.value = fields[fid];
      });
      Proto.openDialog('mtEditDialog');
    });

    Proto.registerAction('teacher-save-edit', function () {
      var t = (MDS.get('teachers') || []).filter(function (x) { return x.id === editingTeacherId; })[0];
      if (!t) return;
      var name = (document.getElementById('mtEditName') || {}).value || '';
      if (!name) {
        Proto.showToast('请填写姓名');
        return;
      }
      var status = (document.getElementById('mtEditStatus') || {}).value || t.status;
      MDS.update('teachers', function (arr) {
        return arr.map(function (x) {
          return x.id === editingTeacherId
            ? Object.assign({}, x, {
                name: name,
                gender: (document.getElementById('mtEditGender') || {}).value || x.gender,
                phone: (document.getElementById('mtEditPhone') || {}).value || x.phone,
                className: (document.getElementById('mtEditClass') || {}).value || x.className,
                role: (document.getElementById('mtEditRole') || {}).value || x.role,
                status: status,
                isActive: status !== '离职',
              })
            : x;
        });
      });
      Proto.closeDialog('mtEditDialog');
      renderTeacherTable();
      Proto.showToast(status === '离职' ? '已标注离职，结算时将自动剔除' : '已更新');
    });

    Proto.registerAction('teacher-delete', function (el) {
      var id = Number(el.getAttribute('data-id'));
      MDS.update('teachers', function (arr) {
        return arr.filter(function (x) { return x.id !== id; });
      });
      renderTeacherTable();
      Proto.showToast('已删除');
    });

    Proto.registerAction('teacher-save-add', function () {
      var name = (document.getElementById('mtAddName') || {}).value || '';
      var phone = (document.getElementById('mtAddPhone') || {}).value || '';
      if (!name || !phone) {
        Proto.showToast('请填写必填项（姓名、手机号）');
        return;
      }
      var t = {
        id: Date.now(),
        name: name,
        gender: (document.getElementById('mtAddGender') || {}).value || '女',
        phone: phone,
        className: (document.getElementById('mtAddClass') || {}).value || '中一班',
        role: (document.getElementById('mtAddRole') || {}).value || '配班',
        hireDate: (document.getElementById('mtAddDate') || {}).value || '2026-08-11',
        status: '在职',
        isActive: true,
      };
      MDS.update('teachers', function (arr) {
        return arr.concat([t]);
      });
      Proto.closeDialog('mtAddDialog');
      renderTeacherTable();
      Proto.showToast('已新增教师');
    });

    // ── 移动端：活动上传弹层 ──
    Proto.registerAction('upload-sheet', function () {
      var mask = document.getElementById('uploadSheet');
      if (mask) mask.hidden = false;
    });

    Proto.registerAction('upload-confirm', function () {
      var file = document.getElementById('uploadFileName');
      if (file && !file.value.trim()) {
        Proto.showToast('请先选择要上传的文件');
        return;
      }
      Proto.closeDialog('uploadSheet');
      Proto.showToast('作品提交成功');
    });

    // ── 移动端：消息已读 ──
    Proto.registerAction('notice-read', function (el) {
      var id = el.getAttribute('data-id');
      MDS.update('notices', function (arr) {
        return arr.map(function (n) {
          return n.id === id ? Object.assign({}, n, { read: true }) : n;
        });
      });
      Proto.showToast('已标记为已读');
    });

    Proto.registerAction('notice-all-read', function () {
      MDS.update('notices', function (arr) {
        return arr.map(function (n) {
          return Object.assign({}, n, { read: true });
        });
      });
      Proto.showToast('已全部标记为已读');
    });

    // ── 移动端：园长切换管理端 ──
    Proto.registerAction('switch-admin', function () {
      location.href = '../pc/admin.html?role=principal';
    });

    // ── 评奖：评委分配 / 分批 ──
    Proto.registerAction('review-rebatch', function () {
      reviewBatchSize = parseInt((qs('#reviewBatchSize') || {}).value, 10) || 5;
      var batches = buildReviewBatches(reviewAssignActivityId, reviewBatchSize);
      saveReviewBatches(reviewAssignActivityId, batches);
      renderReviewAssign(qs('#pcPage'));
      Proto.showToast('已按每批 ' + reviewBatchSize + ' 份重新分批');
    });

    Proto.registerAction('review-save', function () {
      Proto.showToast('分批与评委分配已保存');
    });

    Proto.registerAction('review-batch-del', function (el) {
      var batchNo = Number(el.getAttribute('data-batch'));
      MDS.update('reviewBatches', function (map) {
        var next = Object.assign({}, map || {});
        var list = (next[reviewAssignActivityId] || []).filter(function (b) { return b.batchNo !== batchNo; });
        next[reviewAssignActivityId] = list.map(function (b, i) { return Object.assign({}, b, { batchNo: i + 1 }); });
        return next;
      });
      renderReviewBatchTable();
    });

    // ── 评委端：打分 ──
    Proto.registerAction('judge-open', function (el) {
      var id = Number(el.getAttribute('data-id'));
      fillJudgeDialog(id);
    });

    Proto.registerAction('judge-save', function () {
      var taskId = Number((document.getElementById('judgeTaskId') || {}).value);
      var score1 = (document.getElementById('judgeScore1') || {}).value;
      var score2 = (document.getElementById('judgeScore2') || {}).value;
      var score3 = (document.getElementById('judgeScore3') || {}).value;
      if (!score1 || !score2 || !score3) {
        Proto.showToast('请填写各维度评分');
        return;
      }
      var comment = (document.getElementById('judgeComment') || {}).value || '';
      var tasks = window.__judgeTasks || [];
      var w = tasks.filter(function (x) { return x.id === taskId; })[0];
      if (w) {
        w.done = true;
        MDS.update('reviewRecords', function (arr) {
          return (arr || []).concat([{
            id: Date.now(),
            activity: w.activity,
            work: w.work,
            judge: '王教授',
            scores: score1 + ' / ' + score2 + ' / ' + score3,
            comment: comment,
            time: '刚刚',
          }]);
        });
        // 同步分批进度：作品所在批次已完成数 +1（联动打分监控看板）
        MDS.update('reviewBatches', function (map) {
          var next = Object.assign({}, map || {});
          Object.keys(next).forEach(function (aid) {
            next[aid] = (next[aid] || []).map(function (b) {
              if (b.workIds.indexOf(w.id) >= 0) {
                return Object.assign({}, b, { done: Math.min(b.done + 1, b.workIds.length) });
              }
              return b;
            });
          });
          return next;
        });
      }
      Proto.closeDialog('judgeDialog');
      renderJudgeTasks();
      Proto.showToast('打分已提交并留痕');
    });
  }

  function fillJudgeDialog(id) {
    var tasks = window.__judgeTasks || [];
    var w = tasks.filter(function (x) { return x.id === id; })[0];
    if (!w) return;
    document.getElementById('judgeTaskId').value = id;
    var head = document.getElementById('judgeWorkTitle');
    if (head) head.textContent = w.work;
    var meta = document.getElementById('judgeWorkMeta');
    if (meta) {
      meta.innerHTML =
        '<div class="m-item"><div class="m-label">所属活动</div><div class="m-value">' + esc(w.activity) + '</div></div>' +
        '<div class="m-item"><div class="m-label">提交教师</div><div class="m-value">' + esc(w.teacher) + '</div></div>' +
        '<div class="m-item"><div class="m-label">作品类型</div><div class="m-value">' + esc(w.type) + '</div></div>';
    }
    // 已打分作品回填分数与评语（留痕可追溯）
    var record = (MDS.get('reviewRecords') || []).filter(function (r) { return r.work === w.work; })[0];
    if (record) {
      var parts = (record.scores || '').split('/');
      var s1 = document.getElementById('judgeScore1');
      var s2 = document.getElementById('judgeScore2');
      var s3 = document.getElementById('judgeScore3');
      if (s1) s1.value = (parts[0] || '').trim();
      if (s2) s2.value = (parts[1] || '').trim();
      if (s3) s3.value = (parts[2] || '').trim();
      var cm = document.getElementById('judgeComment');
      if (cm) cm.value = record.comment || '';
    }
    Proto.openDialog('judgeDialog');
  }

  /* ═══════════════════════ 评委端：打分任务渲染 ═══════════════════════ */

  function buildJudgeTasks() {
    // 从作品数据派生评委任务（模拟分配给当前评委的活动）
    var works = MDS.get('works') || [];
    var records = MDS.get('reviewRecords') || [];
    var doneKeys = {};
    records.forEach(function (r) {
      doneKeys[r.work] = true;
    });
    var tasks = works
      .filter(function (w) { return w.status === '评审中' || w.activity === '课件制作技能大赛'; })
      .map(function (w) {
        var key = w.teacher + '的' + w.type;
        return {
          id: w.id,
          activity: w.activity,
          work: w.teacher + '的作品',
          teacher: w.teacher,
          type: w.type,
          done: !!doneKeys[w.teacher + '的作品'],
        };
      });
    // 补充已完成记录的映射
    records.forEach(function (r) {
      if (!tasks.some(function (t) { return t.work === r.work; })) {
        tasks.push({ id: Date.now() + r.id, activity: r.activity, work: r.work, teacher: r.work.replace('的作品', ''), type: '课件', done: true });
      }
    });
    return tasks;
  }

  function renderJudgeTasks() {
    var root = document.getElementById('judgeTaskList');
    if (!root) return;
    // 评委端为完整 PC 后台外壳，顶栏用户信息由 renderPcHeader 统一渲染
    var tasks = buildJudgeTasks();
    window.__judgeTasks = tasks;
    var total = tasks.length;
    var done = tasks.filter(function (t) { return t.done; }).length;
    var count = document.getElementById('judgeTaskCount');
    if (count) count.textContent = '已评 ' + done + ' / 共 ' + total + ' 份';
    var progress = document.getElementById('judgeTaskProgress');
    if (progress) progress.style.width = (total ? Math.round((done / total) * 100) : 0) + '%';
    if (!tasks.length) {
      root.innerHTML = '<div class="pc-empty"><div class="empty-icon">📋</div><div>暂无打分任务</div></div>';
      return;
    }
    root.innerHTML = tasks
      .map(function (t) {
        return (
          '<div class="scheme-card' + (t.done ? '' : ' is-active') + '">' +
          '<div class="scheme-head">' +
          '<span class="scheme-name">' + esc(t.work) + '</span>' +
          (t.done ? '<span class="status-tag status-success">已完成</span>' : '<span class="status-tag status-warning">待打分</span>') +
          '</div>' +
          '<div class="scheme-meta">' + esc(t.activity) + ' · 提交教师 ' + esc(t.teacher) + ' · ' + esc(t.type) + '</div>' +
          '<div style="margin-top:12px;">' +
          (t.done
            ? '<span class="action-btn action-edit" data-action="judge-open" data-id="' + t.id + '">查看打分</span>'
            : '<button type="button" class="pc-btn pc-btn-add pc-btn-sm" data-action="judge-open" data-id="' + t.id + '">去打分</button>') +
          '</div>' +
          '</div>'
        );
      })
      .join('');
  }

  /* 移动端：勋章详情底部弹层 */
  function showMedalDetailSheet(id) {
    var medals = MDS.get('medals') || [];
    var m = medals.filter(function (x) { return x.id === id; })[0];
    if (!m) return;
    var sheet = document.getElementById('medalDetailSheet');
    if (!sheet) return;
    var levelCls = m.level === '金' ? 'gold' : m.level === '银' ? 'silver' : 'bronze';
    var body = document.getElementById('medalDetailSheetBody');
    if (body) {
      body.innerHTML =
        '<div style="text-align:center;padding:12px 0 16px;">' +
        '<span class="medal-badge level-' + levelCls + ' medal-badge-lg"></span>' +
        '<div style="margin-top:10px;font-weight:700;">' + esc(m.period) + ' · ' + esc(m.type) + '</div>' +
        '<div style="font-size:12px;color:#9ca3af;margin-top:4px;">' + esc(m.activity) + ' · 当期排名第 ' + m.rank + ' 名</div>' +
        '</div>' +
        '<table class="dim-table">' +
        '<thead><tr><th>指标</th><th>当期原始数据</th><th>单项排位分</th></tr></thead>' +
        '<tbody>' +
        '<tr><td>平台使用</td><td>' + m.usage + '</td><td>' + Math.round(m.usage / 10) + '</td></tr>' +
        '<tr><td>家园互动</td><td>' + m.interaction + '</td><td>' + Math.round(m.interaction / 10) + '</td></tr>' +
        '<tr><td>外部推广</td><td>' + m.promotion + '</td><td>' + Math.round(m.promotion / 10) + '</td></tr>' +
        '<tr><td>会员转化</td><td>' + m.conversion + '</td><td>' + Math.round(m.conversion / 10) + '</td></tr>' +
        '<tr><td><strong>当期总积分</strong></td><td class="dim-total"><strong>' + m.total + '</strong></td><td><strong>第 ' + m.rank + ' 名</strong></td></tr>' +
        '</tbody></table>';
    }
    sheet.hidden = false;
  }

  /* ═══════════════════════ 重新渲染当前页 ═══════════════════════ */

  function rerenderCurrentPage() {
    if (document.getElementById('homeRoot')) renderMobileHome();
    if (document.getElementById('activityList')) renderMobileActivity();
    if (document.getElementById('mobileRankList')) {
      renderMobileRank();
      renderMobileRankDetail();
    }
    if (document.getElementById('medalList')) renderMobileMedal();
    if (document.getElementById('noticeList')) renderNoticeList();
    if (document.getElementById('tabbarRoot')) renderTabBar(currentTabKey());
    if (document.getElementById('pcMenuRoot')) renderPcShell();
    if (document.getElementById('judgeTaskList')) renderJudgeTasks();
  }

  /* 筛选 tab 同步高亮 */
  function syncFilterTabs(group, value) {
    document.querySelectorAll('[data-tab-group="' + group + '"]').forEach(function (s) {
      s.classList.toggle('is-active', s.getAttribute('data-tab-value') === value);
    });
  }

  /* PC 顶栏用户名 + 活动全选 */
  function renderPcHeader() {
    var p = MDS.get('userProfile');
    var user = document.getElementById('pcUserName');
    if (user) user.textContent = p.name;
    var avatar = document.getElementById('pcAvatar');
    if (avatar) avatar.textContent = p.avatar;
  }

  /* ═══════════════════════ 初始化 ═══════════════════════ */

  function init() {
    MDS.init();
    window.__medalRole = resolveRole();
    // 评委端为完整 PC 后台外壳：固定为评委角色（不随 localStorage 演示角色漂移）
    if (location.pathname.indexOf('judge.html') >= 0) {
      MDS.setRole('judge');
      window.__medalRole = 'judge';
    }
    registerActions();
    injectRoleFab();
    bindNotifyEvents();
    bindReviewEvents();

    // 入口页：显示当前角色 + 重置按钮
    var curRoleEl = document.getElementById('curRole');
    if (curRoleEl) {
      var r = MDS.get('role');
      curRoleEl.textContent = MDS.ROLES[r].name;
    }
    var entryReset = document.getElementById('entryReset');
    if (entryReset) {
      entryReset.addEventListener('click', function () {
        MDS.resetAll();
        Proto.showToast('已重置演示数据');
      });
    }

    // PC 端管理台外壳
    if (document.getElementById('pcMenuRoot')) {
      seedPcActive();
      renderPcHeader();
      renderPcShell();
      var hamburger = document.querySelector('.nav-hamburger');
      if (hamburger) {
        hamburger.addEventListener('click', function () {
          setTimeout(renderPcMenu, 0);
        });
      }
      document.addEventListener('click', function (e) {
        var more = document.getElementById('pcTagsMore');
        if (!more || e.target.closest('#pcTagsMore')) return;
        var menu = document.getElementById('tagsMoreMenu');
        if (menu) menu.hidden = true;
      });
      // 活动列表全选
      var actCheckAll = document.getElementById('actCheckAll');
      if (actCheckAll) {
        actCheckAll.addEventListener('change', function () {
          var tbody = document.getElementById('actTbody');
          var checks = tbody ? tbody.querySelectorAll('.act-check') : [];
          checks.forEach(function (c) {
            c.checked = actCheckAll.checked;
          });
        });
      }
    }

    // 评委端
    if (document.getElementById('judgeTaskList')) {
      renderJudgeTasks();
    }

    // 移动端：首页为角色化首页（hero + 勋章卡 + 宫格 + tabBar），二级页无 tabBar
    if (document.getElementById('homeRoot')) {
      renderMobileHome();
      renderTabBar(currentTabKey());
    }
    if (document.getElementById('activityList')) {
      renderMobileActivity();
      document.querySelectorAll('[data-tab-group="actFilter"]').forEach(function (tab) {
        tab.addEventListener('click', function () {
          mobileActFilter = tab.getAttribute('data-tab-value') || 'all';
          renderMobileActivity();
        });
      });
    }
    if (document.getElementById('mobileRankList')) {
      renderMobileRank();
      renderMobileRankDetail();
      // 榜单 tab 高亮同步（基于 URL ?board= 参数）
      var boardKey = getParam('board') || 'total';
      document.querySelectorAll('[data-tab-group="rankBoard"]').forEach(function (tab) {
        tab.classList.toggle('is-active', tab.getAttribute('data-tab-value') === boardKey);
        tab.addEventListener('click', function () {
          var board = tab.getAttribute('data-tab-value') || 'total';
          location.href = 'rank.html?board=' + board;
        });
      });
    }
    if (document.getElementById('medalList')) {
      renderMobileMedal();
      document.querySelectorAll('[data-tab-group="medalFilter"]').forEach(function (tab) {
        tab.addEventListener('click', function () {
          medalTypeFilter = tab.getAttribute('data-tab-value') || 'all';
          renderMobileMedal();
        });
      });
    }
    if (document.getElementById('noticeList')) {
      renderNoticeList();
      document.querySelectorAll('[data-tab-group="noticeFilter"]').forEach(function (tab) {
        tab.addEventListener('click', function () {
          noticeFilter = tab.getAttribute('data-tab-value') || 'all';
          renderNoticeList();
        });
      });
    }
    if (document.getElementById('mineBonus')) {
      renderMobileMine();
    }

    // 活动状态筛选（PC）
    if (document.getElementById('actTbody')) {
      renderActivityTable();
      document.querySelectorAll('[data-tab-group="actFilterTabs"]').forEach(function (tab) {
        tab.addEventListener('click', function () {
          actFilter = tab.getAttribute('data-tab-value') || 'ALL';
          renderActivityTable();
        });
      });
      // 活动搜索
      var actSearch = document.getElementById('actSearch');
      if (actSearch) {
        actSearch.addEventListener('input', function () {
          renderActivityTable();
        });
      }
    }
    if (document.getElementById('worksTbody')) {
      renderWorksTable();
      // 作品筛选：名称 / 教师 输入即时过滤
      var worksName = document.getElementById('worksSearchName');
      if (worksName) worksName.addEventListener('input', function () {
        worksSearch.name = worksName.value.trim();
        renderWorksTable();
      });
      var worksTeacher = document.getElementById('worksSearchTeacher');
      if (worksTeacher) worksTeacher.addEventListener('input', function () {
        worksSearch.teacher = worksTeacher.value.trim();
        renderWorksTable();
      });
    }
    if (document.getElementById('reviewAssignAct')) {
      renderReviewAssign(qs('#pcPage'));
      var raAct = document.getElementById('reviewAssignAct');
      raAct.addEventListener('change', function () {
        reviewAssignActivityId = Number(raAct.value);
        renderReviewAssign(qs('#pcPage'));
      });
    }
    if (document.getElementById('reviewMonitorRoot')) {
      renderReviewMonitor(qs('#pcPage'));
    }
    if (document.getElementById('reviewResultAct')) {
      renderReviewResult(qs('#pcPage'));
      var rrAct = document.getElementById('reviewResultAct');
      rrAct.addEventListener('change', function () {
        reviewResultActivityId = Number(rrAct.value);
        renderReviewResult(qs('#pcPage'));
      });
    }
    if (document.getElementById('rankBoardPanel')) {
      renderRankGarden(qs('#pcPage'));
    }
    if (document.getElementById('parentProgressRoot')) {
      renderRankParent(qs('#pcPage'));
    }
    if (document.getElementById('schemeList')) {
      renderScoreScheme(qs('#pcPage'));
    }
    if (document.getElementById('thresholdGrid')) {
      renderMedalThreshold(qs('#pcPage'));
      // 门槛双套切换
      document.querySelectorAll('[data-tab-group="thresholdTabs"]').forEach(function (tab) {
        tab.addEventListener('click', function () {
          thresholdSet = Number(tab.getAttribute('data-tab-value')) || 1;
          renderMedalThreshold(qs('#pcPage'));
        });
      });
    }
    if (document.getElementById('medalArchiveGrid')) {
      renderMedalArchive(qs('#pcPage'));
      var mt = document.getElementById('mtTeacher');
      if (mt) mt.addEventListener('change', function () {
        medalTeacherFilter = mt.value;
        renderMedalArchive(qs('#pcPage'));
      });
      var ms = document.getElementById('mtSemester');
      if (ms) ms.addEventListener('change', function () {
        medalSemesterFilter = ms.value;
        renderMedalArchive(qs('#pcPage'));
      });
    }
    if (document.getElementById('bonusTbody')) {
      renderBonusTable();
      document.querySelectorAll('[data-tab-group="bonusFilter"]').forEach(function (tab) {
        tab.addEventListener('click', function () {
          bonusFilter = tab.getAttribute('data-tab-value') || 'ALL';
          renderBonusTable();
        });
      });
    }
    if (document.getElementById('medalTeacherTbody')) {
      renderTeacherTable();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  return {
    init: init,
    currentRole: currentRole,
  };
})();
