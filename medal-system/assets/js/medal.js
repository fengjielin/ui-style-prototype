/**
 * ============================================================
 * 童蹊社区-原型 · 原型演示系统 页面渲染 + 业务交互（window.MedalDemo）
 * 依赖：medal-data.js（window.MDS）、prototype.js（window.Proto）
 * 用途：
 *   - 角色解析（URL 参数 > localStorage > 默认 admin）
 *   - 自动注入角色切换浮动按钮/面板（5 角色）
 *   - PC 端管理台外壳：侧边栏菜单按角色动态渲染 + TagsView 联动 + 内容区切换
 *   - 核心闭环页面渲染：活动/作品/排行榜/积分方案/积分获得情况/教师管理
 *   - 移动端 Tab 角色化渲染：首页/活动/排行榜/消息/我的
 *   - 注：积分体系重构后已移除勋章体系与奖金管理
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

  /* 转义并保留换行（公告/通知多行内容渲染用，换行转 <br> 避免 HTML 折叠成一段） */
  function escBr(str) {
    return esc(str).replace(/\n/g, '<br>');
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

  /* 当前日期时间（yyyy-MM-dd HH:mm，用于通知发送时间） */
  function nowTimeStr() {
    var d = new Date();
    var mm = ('0' + (d.getMonth() + 1)).slice(-2);
    var dd = ('0' + d.getDate()).slice(-2);
    var hh = ('0' + d.getHours()).slice(-2);
    var mi = ('0' + d.getMinutes()).slice(-2);
    return d.getFullYear() + '-' + mm + '-' + dd + ' ' + hh + ':' + mi;
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

  /* 教师端「活动中心」当前教师（对应 teachers 数据 id:1 张慧 · 中一班班主任，即 profile「张老师」） */
  var TEACHER_NAME = '张慧';

  /* ═══════════════════════ 电子奖状：变量 / 背景预设 / 渲染工具 ═══════════════════════ */

  /* 奖状模板可用变量（占位符用中文标签，便于用户理解） */
  var CERT_VARIABLES = [
    { key: '{{教师姓名}}', label: '教师姓名' },
    { key: '{{活动名称}}', label: '活动名称' },
    { key: '{{奖项等级}}', label: '奖项等级' },
    { key: '{{名次}}', label: '名次' },
    { key: '{{班级}}', label: '班级' },
    { key: '{{幼儿园}}', label: '幼儿园' },
    { key: '{{获奖日期}}', label: '获奖日期' },
  ];

  /* 预设背景（有序列表：key + 中文名 + CSS 背景） */
  var CERT_BG_PRESETS = [
    { key: 'red-gold', label: '红金渐变', css: 'linear-gradient(135deg,#fff3e0,#ffe0b2,#fff8e1)' },
    { key: 'blue-gold', label: '蓝金渐变', css: 'linear-gradient(135deg,#e3f2fd,#bbdefb,#fff8e1)' },
    { key: 'green-gold', label: '绿金渐变', css: 'linear-gradient(135deg,#e8f5e9,#c8e6c9,#fff8e1)' },
    { key: 'plain-white', label: '纯白', css: '#ffffff' },
  ];

  /* 预设键 → CSS 背景（找不到回退首个预设） */
  function certBgCss(key) {
    for (var i = 0; i < CERT_BG_PRESETS.length; i++) {
      if (CERT_BG_PRESETS[i].key === key) return CERT_BG_PRESETS[i].css;
    }
    return CERT_BG_PRESETS[0].css;
  }

  /* 预设键 → 中文名 */
  function certBgLabel(key) {
    for (var i = 0; i < CERT_BG_PRESETS.length; i++) {
      if (CERT_BG_PRESETS[i].key === key) return CERT_BG_PRESETS[i].label;
    }
    return CERT_BG_PRESETS[0].label;
  }

  function certTemplateById(id) {
    var num = Number(id);
    return (MDS.get('certTemplates') || []).filter(function (t) { return t.id === num; })[0] || null;
  }

  /* 生成奖状模板下拉选项（含「不绑定」空项） */
  function certTemplateOptions() {
    var templates = MDS.get('certTemplates') || [];
    var opts = ['<option value="">不绑定</option>'];
    templates.forEach(function (t) {
      opts.push('<option value="' + t.id + '">' + esc(t.name) + '</option>');
    });
    return opts.join('');
  }

  /* 背景 → 内联样式：image 用 background-image:url；preset 用 certBgCss */
  function certBgStyle(tpl) {
    if (tpl && tpl.backgroundType === 'image' && tpl.background) {
      return 'background-image:url(' + tpl.background + ');background-size:cover;background-position:center;';
    }
    return 'background:' + certBgCss(tpl && tpl.background) + ';';
  }

  /* 内容渲染：esc 后按占位符替换为已 esc 值，\n → <br> */
  function renderCertText(content, map) {
    var html = esc(content || '');
    Object.keys(map || {}).forEach(function (k) {
      html = html.split(k).join(esc(map[k]));
    });
    return html.replace(/\n/g, '<br>');
  }

  /* 变量取值（activity + 单个报名项 → 占位符映射） */
  function certVarMap(act, item) {
    return {
      '{{教师姓名}}': item.name,
      '{{活动名称}}': act.title,
      '{{奖项等级}}': item.awardName || '参与奖',
      '{{名次}}': item.rank != null ? '第' + item.rank + '名' : '—',
      '{{班级}}': item.className,
      '{{幼儿园}}': item.kindergarten,
      '{{获奖日期}}': todayStr(),
    };
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

  /* 非侧边栏菜单的可打开页面（不挂在菜单树中，但可从活动管理各阶段入口进入，保留标签/面包屑） */
  var EXTRA_PAGES = {
    'activity-works': { groupTitle: '活动管理', title: '作品管理' },
    'activity-notify': { groupTitle: '活动组织', title: '通知管理' },
    'rank-garden-all': { groupTitle: '排行榜', title: '园内教师榜' },
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
    'activity-launch': renderActivityLaunch,
    'activity-works': renderActivityWorks,
    'activity-notify': renderActivityNotify,
    'activity-manage': renderActivityManage,
    'activity-query': renderActivityQuery,
    'score-standard': renderScoreStandardList,
    'rank-garden': renderRankGarden,
    'rank-garden-all': renderRankGardenAll,
    'rank-parent': renderRankParent,
    'score-scheme': renderScoreScheme,
    'score-obtained': renderScoreObtained,
    'user-teacher': renderUserTeacher,
    'judge-scoring': renderJudgeTasks,
    'cert-template': renderCertTemplate,
    'teacher-activity': renderTeacherActivity,
    'teacher-rank': renderTeacherRank,
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

  function statCard(title, label, value, icon, bg) {
    return (
      '<div class="stat-card">' +
      '<div class="stat-icon" style="background:' + bg + ';">' + icon + '</div>' +
      '<div class="stat-body"><div class="stat-value">' + esc(value) + '</div><div class="stat-label">' + esc(label) + '</div></div>' +
      '</div>'
    );
  }

  /* ═══════════════════════ PC：活动列表（状态机 + CRUD） ═══════════════════════ */

  var actFilter = 'ALL';
  var actTypeFilter = '';

  function actStatusClass(status) {
    return 'st-' + status;
  }

  /* 参赛角色范围描述文本（活动对象展示：园长与教师 / 仅园长 / 仅教师 / 指定教师）。
     指定教师仅展示字样，不在列表/表格中展示具体人选（人选见活动编辑表单回显） */
  function actRoleText(activity) {
    var role = (activity && activity.targetRole) || 'ALL';
    return { ALL: '园长与教师', PRINCIPAL: '仅园长', TEACHER: '仅教师', SPECIFIED: '指定教师' }[role] || '园长与教师';
  }

  /* 活动对象展示（HTML）：幼儿园 tag + 参赛对象（角色）tag，含「全部幼儿园」则显示全部 */
  function actScopeHtml(activity) {
    var kgs = (activity && activity.targetKindergartens) || [];
    if (!kgs.length) return '—';
    var parts;
    if (kgs.indexOf('全部幼儿园') >= 0) {
      parts = ['<span class="act-scope-tag">全部幼儿园</span>'];
    } else {
      parts = kgs.map(function (k) {
        return '<span class="act-scope-tag">' + esc(k) + '</span>';
      });
    }
    parts.push('<span class="act-scope-tag act-scope-role">' + esc(actRoleText(activity)) + '</span>');
    return parts.join('');
  }

  /* 活动对象纯文本（移动端卡内描述用）：'幼儿园A、幼儿园B · 仅教师' */
  function actScopeText(activity) {
    var kgs = (activity && activity.targetKindergartens) || [];
    if (!kgs.length) return '—';
    return kgs.join('、') + ' · ' + actRoleText(activity);
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

  /* 读取参赛对象角色（radio 组 name=prefix，缺省 ALL=园长与教师） */
  function readTargetRole(prefix) {
    var checked = document.querySelector('input[name="' + prefix + '"]:checked');
    return (checked && checked.value) || 'ALL';
  }

  /* 回填参赛对象角色 radio */
  function fillTargetRole(prefix, activity) {
    var role = (activity && activity.targetRole) || 'ALL';
    var radio = document.querySelector('input[name="' + prefix + '"][value="' + role + '"]');
    if (radio) radio.checked = true;
  }

  /* 指定教师弹窗：按模式（add 新增弹窗 / edit 编辑弹窗）取元素配置 */
  function specTeacherCfg(mode) {
    var isAdd = mode === 'add';
    return {
      kgPrefix: isAdd ? 'kgScope' : 'eKgScope',
      dialogId: isAdd ? 'actSpecTeacherDialog' : 'eActSpecTeacherDialog',
      searchId: isAdd ? 'actSpecTeacherSearch' : 'eActSpecTeacherSearch',
      listId: isAdd ? 'actSpecTeacherList' : 'eActSpecTeacherList',
      boxId: isAdd ? 'actSpecTeacherBox' : 'eActSpecTeacherBox',
      tagsId: isAdd ? 'actSpecTeacherTags' : 'eActSpecTeacherTags',
      countId: isAdd ? 'actSpecTeacherCount' : 'eActSpecTeacherCount',
    };
  }

  var specSelected = { add: {}, edit: {} };   // 指定教师已选集合（按弹窗模式 name→true）
  var specSearchText = { add: '', edit: '' }; // 弹窗内教师姓名搜索关键字

  /* 渲染「指定教师」弹窗内教师多选列表：按所选幼儿园范围 + 姓名关键字过滤在职教师 */
  function renderSpecTeacherList(mode, selected) {
    var cfg = specTeacherCfg(mode);
    var box = document.getElementById(cfg.listId);
    if (!box) return;
    var sel = selected || specSelected[mode] || {};
    var kgs = readScopeChecks(cfg.kgPrefix);
    var isAll = kgs.indexOf('全部幼儿园') >= 0;
    var kw = (specSearchText[mode] || '').trim();
    var teachers = (MDS.get('teachers') || []).filter(function (t) {
      if (t.isActive === false) return false;
      if (!isAll && kgs.indexOf(t.kindergarten) < 0) return false;
      if (kw && t.name.indexOf(kw) < 0) return false;
      return true;
    });
    if (!teachers.length) {
      box.innerHTML = '<div class="pc-empty" style="padding:20px 0;"><div>' + (kw ? '无匹配教师' : '所选幼儿园范围内暂无在职教师') + '</div></div>';
      return;
    }
    box.innerHTML = teachers
      .map(function (t) {
        return (
          '<label class="notify-teacher-item">' +
          '<input type="checkbox" class="spec-teacher" value="' + esc(t.name) + '"' + (sel[t.name] ? ' checked' : '') + '>' +
          '<span class="nt-name">' + esc(t.name) + '</span>' +
          '<span class="nt-sub">' + esc(t.kindergarten) + ' · ' + esc(t.className) + '</span>' +
          '</label>'
        );
      })
      .join('');
  }

  /* 打开「指定教师」选择弹窗：重置搜索并按当前幼儿园范围渲染列表 */
  function openSpecTeacherDialog(mode) {
    var cfg = specTeacherCfg(mode);
    var search = document.getElementById(cfg.searchId);
    if (search) search.value = '';
    specSearchText[mode] = '';
    renderSpecTeacherList(mode);
    Proto.openDialog(cfg.dialogId);
  }

  /* 回显指定教师：在「参赛对象」下方展示已选教师 tag + 已选数量 */
  function renderSpecTeacherEcho(mode) {
    var cfg = specTeacherCfg(mode);
    var countEl = document.getElementById(cfg.countId);
    var tags = document.getElementById(cfg.tagsId);
    var names = Object.keys(specSelected[mode] || {});
    if (countEl) countEl.textContent = String(names.length);
    if (!tags) return;
    tags.innerHTML = names.length
      ? names.map(function (n) { return '<span class="spec-teacher-tag">' + esc(n) + '</span>'; }).join('')
      : '';
  }

  /* 读取指定教师已选集合（返回选中教师姓名数组） */
  function readSpecTeachers(mode) {
    return Object.keys(specSelected[mode] || {});
  }

  /* 回填指定教师：从活动读取已选集合，并刷新表单下方回显 */
  function fillSpecTeachers(activity, mode) {
    specSelected[mode] = {};
    ((activity && activity.targetTeachers) || []).filter(Boolean).forEach(function (n) {
      specSelected[mode][n] = true;
    });
    renderSpecTeacherEcho(mode);
  }

  /* 绑定「参赛对象」联动事件（admin 端一次性绑定）：
     选择按钮 → 打开弹窗；弹窗内搜索 → 刷新列表；确定 → 收集勾选并回显；
     参赛对象 radio → 切换指定教师回显区显隐 */
  function bindSpecTeacherEvents() {
    // 打开指定教师弹窗（「选择指定教师」按钮）
    document.querySelectorAll('[data-action="open-spec-teacher"]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        openSpecTeacherDialog(btn.getAttribute('data-mode') || 'add');
      });
    });
    // 弹窗「确定」：收集勾选 → 回显 → 关闭
    document.querySelectorAll('[data-action="spec-teacher-confirm"]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var mode = btn.getAttribute('data-mode') || 'add';
        var cfg = specTeacherCfg(mode);
        var box = document.getElementById(cfg.listId);
        var next = {};
        if (box) {
          box.querySelectorAll('input.spec-teacher:checked').forEach(function (c) {
            next[c.value] = true;
          });
        }
        specSelected[mode] = next;
        renderSpecTeacherEcho(mode);
        Proto.closeDialog(cfg.dialogId);
      });
    });
    // 弹窗内姓名搜索：刷新列表（保留已勾选）
    [['actSpecTeacherSearch', 'add'], ['eActSpecTeacherSearch', 'edit']].forEach(function (pair) {
      var search = document.getElementById(pair[0]);
      if (search) {
        search.addEventListener('input', function () {
          specSearchText[pair[1]] = search.value;
          renderSpecTeacherList(pair[1]);
        });
      }
    });
    // 参赛对象 radio：勾选「指定教师」时显示回显区，否则隐藏
    [['actTargetRole', 'actSpecTeacherBox', 'add'], ['eActTargetRole', 'eActSpecTeacherBox', 'edit']].forEach(function (cfgArr) {
      document.querySelectorAll('input[name="' + cfgArr[0] + '"]').forEach(function (r) {
        r.addEventListener('change', function () {
          var show = r.value === 'SPECIFIED' && r.checked;
          var box = document.getElementById(cfgArr[1]);
          if (box) box.hidden = !show;
          if (show) renderSpecTeacherEcho(cfgArr[2]);
        });
      });
    });
    // 评分标准仅在「需要专家评审」时显示并允许关联（=否 时隐藏并清空已选）
    [['actExpertReview', 'actScoreStandardField', 'actScoreStandard'], ['eActExpertReview', 'eActScoreStandardField', 'eActScoreStandard']].forEach(function (pair) {
      document.querySelectorAll('input[name="' + pair[0] + '"]').forEach(function (r) {
        r.addEventListener('change', function () {
          var enabled = r.value === '1' && r.checked;
          var field = document.getElementById(pair[1]);
          var sel = document.getElementById(pair[2]);
          if (field) field.hidden = !enabled;
          if (sel) {
            sel.disabled = !enabled;
            if (!enabled) sel.value = '';
          }
        });
      });
    });
  }

  /* 同步评分标准字段显隐：仅「需要专家评审」时显示并允许关联（=否 时隐藏并清空已选） */
  function syncScoreStandardByReview(scope) {
    var isAdd = scope === 'add';
    var expert = document.querySelector('input[name="' + (isAdd ? 'actExpertReview' : 'eActExpertReview') + '"]:checked');
    var field = document.getElementById(isAdd ? 'actScoreStandardField' : 'eActScoreStandardField');
    var sel = document.getElementById(isAdd ? 'actScoreStandard' : 'eActScoreStandard');
    if (!field) return;
    var enabled = !!expert && expert.value === '1';
    field.hidden = !enabled;
    if (sel) {
      sel.disabled = !enabled;
      if (!enabled) sel.value = '';
    }
  }

  /* 活动对象范围内的参赛人员（不含已离职；按参赛对象角色派生：
     ALL=园长+教师 / PRINCIPAL=仅园长 / TEACHER=仅教师 / SPECIFIED=指定教师）
     返回对象统一含 { name, kindergarten, className, roleLabel }，园长 roleLabel=园长、className='—' */
  function scopeParticipants(activity) {
    var role = (activity && activity.targetRole) || 'ALL';
    var kgs = (activity && activity.targetKindergartens) || [];
    var isAll = kgs.indexOf('全部幼儿园') >= 0;
    var inKg = function (p) {
      return isAll || kgs.indexOf(p.kindergarten) >= 0;
    };
    var principals = (MDS.get('principals') || [])
      .filter(function (p) { return p.isActive !== false && inKg(p); })
      .map(function (p) {
        return { name: p.name, kindergarten: p.kindergarten, className: '—', roleLabel: p.roleLabel || '园长' };
      });
    var teachers = (MDS.get('teachers') || [])
      .filter(function (t) { return t.isActive !== false && inKg(t); })
      .map(function (t) {
        return { name: t.name, kindergarten: t.kindergarten, className: t.className, roleLabel: '教师' };
      });
    if (role === 'PRINCIPAL') return principals;
    if (role === 'TEACHER') return teachers;
    if (role === 'SPECIFIED') {
      var names = ((activity && activity.targetTeachers) || []).filter(Boolean);
      return teachers.filter(function (t) { return names.indexOf(t.name) >= 0; });
    }
    return principals.concat(teachers);
  }

  /* ═══════════════════════ PC：活动通知（通知状态 + 已读回执） ═══════════════════════ */

  /* 某活动的通知记录列表（activityNotices 按活动 id 键控） */
  function activityNoticesFor(activity) {
    var map = MDS.get('activityNotices') || {};
    return (activity && map[activity.id]) || [];
  }

  /* 单条通知的已读人数 */
  function noticeReadCount(n) {
    return (n && n.recipients || []).filter(function (r) { return r.read; }).length;
  }

  /* 活动通知状态元信息（活动列表「通知状态」列）：仅已发布活动展示；
     未发送 → 未通知；已发送 → 已通知 + 已读进度（跨多条通知汇总） */
  function activityNoticeMeta(a) {
    if (a.status !== 'PUBLISHED') return null;
    var notices = activityNoticesFor(a);
    if (!notices.length) return { text: '未通知', cls: 'status-warning', sub: '' };
    var total = 0, read = 0;
    notices.forEach(function (n) {
      total += (n.recipients || []).length;
      read += noticeReadCount(n);
    });
    return { text: '已通知', cls: 'status-primary', sub: '已读 ' + read + '/' + total };
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
  var notifyTeachers = [];   // 当前活动范围内全部在职参赛人员（主数据，含园长，见 scopeParticipants）
  var notifySelected = {};   // 已选老师 name → true（跨筛选保持选中）
  var notifyKgFilter = '';   // 幼儿园筛选值
  var notifyNameFilter = ''; // 姓名筛选关键字
  var notifyRecordKgFilter = ''; // 通知记录回执表：幼儿园筛选值

  /* 各园区通知统计：通知已读率（该活动既有通知收件人已读/总数）+ 活动参与率（报名/参赛范围内人数） */
  function notifyKgStats(activity) {
    var byKg = {};
    // 参赛范围内人数（含园长）
    scopeParticipants(activity).forEach(function (p) {
      var kg = p.kindergarten || '未知园区';
      if (!byKg[kg]) byKg[kg] = { kg: kg, eligible: 0, signed: 0, read: 0, total: 0 };
      byKg[kg].eligible++;
    });
    // 参与率：按报名名单（signupListForActivity 模拟）统计各园报名人数
    signupListForActivity(activity).forEach(function (s) {
      var kg = s.kindergarten || '未知园区';
      if (byKg[kg]) byKg[kg].signed++;
    });
    // 通知已读率：该活动既有通知按收件人园区汇总已读/总数
    activityNoticesFor(activity).forEach(function (n) {
      (n.recipients || []).forEach(function (r) {
        var kg = r.kindergarten || '未知园区';
        if (!byKg[kg]) byKg[kg] = { kg: kg, eligible: 0, signed: 0, read: 0, total: 0 };
        byKg[kg].total++;
        if (r.read) byKg[kg].read++;
      });
    });
    return Object.keys(byKg).map(function (k) { return byKg[k]; });
  }

  /* 渲染通知弹窗顶部各园区统计（各园区一张小卡：通知已读率 + 活动参与率） */
  function renderNotifyKgStats(activity) {
    var box = document.getElementById('notifyKgStats');
    if (!box) return;
    var stats = notifyKgStats(activity);
    if (!stats.length) { box.innerHTML = ''; return; }
    box.innerHTML = '<div class="notify-stats">' + stats.map(function (s) {
      var readPct = s.total ? Math.round((s.read / s.total) * 100) + '%' : '—';
      var joinPct = s.eligible ? Math.round((s.signed / s.eligible) * 100) + '%' : '—';
      return (
        '<div class="notify-stat-card">' +
        '<div class="ns-kg">' + esc(s.kg) + '</div>' +
        '<div class="ns-cell"><span class="ns-label">通知已读率</span><span class="ns-val">' + readPct + '</span></div>' +
        '<div class="ns-cell"><span class="ns-label">活动参与率</span><span class="ns-val">' + joinPct + '</span></div>' +
        '</div>'
      );
    }).join('') + '</div>';
  }

  function fillNotifyDialog(activity) {
    notifyActivityId = activity.id;
    var title = document.getElementById('notifyActTitle');
    if (title) title.textContent = '「' + activity.title + '」通知';
    var scope = document.getElementById('notifyScopeText');
    if (scope) scope.textContent = '发送对象：' + actScopeText(activity);
    // 清空标题/内容输入（每次发送重新填写）
    var nt = document.getElementById('notifyTitle');
    if (nt) nt.value = '';
    var nc = document.getElementById('notifyContent');
    if (nc) nc.value = '';
    notifyTeachers = scopeParticipants(activity);

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

    // 各园区统计（通知已读率 + 活动参与率）
    renderNotifyKgStats(activity);
    renderNotifyList();
    updateNotifyCount();
    Proto.openDialog('notifyDialog');
  }

  /* 渲染老师列表：按幼儿园区域分组 + 姓名筛选（分层展示，保留原筛选与勾选） */
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
    // 按幼儿园分组，每园一个分区标题 + 该园教师勾选项
    var groups = {};
    list.forEach(function (t) {
      var kg = t.kindergarten || '未知园区';
      (groups[kg] = groups[kg] || []).push(t);
    });
    var html = Object.keys(groups)
      .map(function (kg) {
        var rows = groups[kg]
          .map(function (t) {
            return (
              '<label class="notify-teacher-item">' +
              '<input type="checkbox" class="notify-teacher" value="' + esc(t.name) + '"' + (notifySelected[t.name] ? ' checked' : '') + '>' +
              '<span class="nt-name">' + esc(t.name) + '</span>' +
              '<span class="nt-sub">' + esc(t.roleLabel === '园长' ? '园长' : t.className) + '</span>' +
              '</label>'
            );
          })
          .join('');
        return '<div class="notify-kg-title">' + esc(kg) + '</div>' + rows;
      })
      .join('');
    box.innerHTML = html;
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
    // 通知记录回执表：幼儿园筛选（元素由 renderActivityNotify 动态渲染，用事件委托绑定）
    document.addEventListener('change', function (e) {
      if (e.target && e.target.id === 'notifyRecordKgFilter') {
        notifyRecordKgFilter = e.target.value;
        renderActivityNotify();
      }
    });
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

  /* 单条通知记录卡片（通知标题/内容/发送信息 + 接收老师已读回执表格） */
  function noticeRecordHtml(n, kgFilter) {
    // 按幼儿园筛选回执表（kgFilter 为空=全部园区）
    var allRecipients = n.recipients || [];
    var recipients = kgFilter ? allRecipients.filter(function (r) { return r.kindergarten === kgFilter; }) : allRecipients;
    var total = recipients.length;
    var read = recipients.filter(function (r) { return r.read; }).length;
    var rows = recipients.length
      ? recipients.map(function (r) {
          var statusTag = r.read
            ? '<span class="status-tag status-success">已读</span>'
            : '<span class="status-tag status-warning">未读</span>';
          return (
            '<tr>' +
            '<td>' + esc(r.name) + '</td>' +
            '<td>' + esc(r.kindergarten || '—') + '</td>' +
            '<td>' + esc(r.className || '—') + '</td>' +
            '<td>' + statusTag + '</td>' +
            '<td style="color:' + (r.read ? '#606266' : '#c0c4cc') + ';">' + (r.read ? esc(r.readTime || '—') : '—') + '</td>' +
            '</tr>'
          );
        }).join('')
      : '<tr><td colspan="5" style="text-align:center;color:#c0c4cc;padding:20px 0;">该园区暂无收件人</td></tr>';
    return (
      '<div class="notify-record">' +
      '<div class="nr-head">' +
      '<div class="nr-title">' + esc(n.title) + '</div>' +
      '<span class="status-tag ' + (read >= total ? 'status-success' : 'status-primary') + '">已读 ' + read + ' / ' + total + '</span>' +
      '</div>' +
      '<div class="nr-content">' + esc(n.content) + '</div>' +
      '<div class="nr-meta">发送人：' + esc(n.sender) + ' · 发送时间：' + esc(n.sendTime) + ' · 共 ' + total + ' 位接收老师</div>' +
      '<table class="pc-table nr-table"><thead><tr>' +
      '<th>接收老师</th><th>幼儿园</th><th>班级</th><th>回执状态</th><th>阅读时间</th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table>' +
      '</div>'
    );
  }

  /* 通知管理页：活动标题 + 返回/发送工具条 + 通知记录（含已读回执） */
  function renderActivityNotify() {
    var box = document.getElementById('activityNotifyRoot');
    if (!box) return;
    var act = activityById(notifyActivityId);
    if (!act) {
      box.innerHTML = '<section class="pc-card"><div class="card-body"><div class="pc-empty"><div class="empty-icon">📭</div><div>请从「活动发起」页点击「通知」进入</div></div></div></section>';
      return;
    }
    var notices = activityNoticesFor(act);
    var html = '';
    // 顶部工具条：返回活动发起 + 发送通知
    html += '<section class="pc-card">' +
      '<div class="card-head"><span class="card-title">通知管理 · ' + esc(act.title) + '</span><span class="table-count">活动对象：' + esc(actScopeText(act)) + '</span></div>' +
      '<div class="card-body" style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">' +
      '<button type="button" class="pc-btn pc-btn-default pc-btn-sm" data-action="notify-back">← 返回活动发起</button>' +
      '<button type="button" class="pc-btn pc-btn-add pc-btn-sm" data-action="notify-open-send">＋ 发送通知</button>' +
      '<span style="font-size:12px;color:#909399;">向该活动参与对象（范围内老师）发送通知，并查看已读回执状态。</span>' +
      '</div></section>';
    // 各园区统计（通知已读率 + 活动参与率）
    var kgStats = notifyKgStats(act);
    if (kgStats.length) {
      html += '<section class="pc-card">' +
        '<div class="card-head"><span class="card-title">园区统计</span><span class="table-count">通知已读率 · 活动参与率</span></div>' +
        '<div class="card-body"><div class="notify-stats">' +
        kgStats.map(function (s) {
          var readPct = s.total ? Math.round((s.read / s.total) * 100) + '%' : '—';
          var joinPct = s.eligible ? Math.round((s.signed / s.eligible) * 100) + '%' : '—';
          return (
            '<div class="notify-stat-card">' +
            '<div class="ns-kg">' + esc(s.kg) + '</div>' +
            '<div class="ns-cell"><span class="ns-label">通知已读率</span><span class="ns-val">' + readPct + '</span></div>' +
            '<div class="ns-cell"><span class="ns-label">活动参与率</span><span class="ns-val">' + joinPct + '</span></div>' +
            '</div>'
          );
        }).join('') +
        '</div></div></section>';
    }
    // 通知记录列表（顶部提供幼儿园筛选，回执表按所选园区过滤）
    var kgOpts = ['<option value="">全部幼儿园</option>'];
    var seenKg = {};
    scopeParticipants(act).forEach(function (p) {
      if (p.kindergarten && !seenKg[p.kindergarten]) { seenKg[p.kindergarten] = true; }
    });
    notices.forEach(function (n) {
      (n.recipients || []).forEach(function (r) {
        if (r.kindergarten && !seenKg[r.kindergarten]) { seenKg[r.kindergarten] = true; }
      });
    });
    Object.keys(seenKg).forEach(function (kg) {
      kgOpts.push('<option value="' + esc(kg) + '"' + (notifyRecordKgFilter === kg ? ' selected' : '') + '>' + esc(kg) + '</option>');
    });
    html += '<section class="pc-card">' +
      '<div class="card-head"><span class="card-title">通知记录</span><span class="table-count">共 ' + notices.length + ' 条通知</span></div>' +
      '<div class="card-body" style="padding-bottom:6px;">' +
      '<div class="search-form"><div class="search-item"><label>幼儿园筛选</label>' +
      '<select class="pc-select" id="notifyRecordKgFilter" style="width:180px;">' + kgOpts.join('') + '</select></div></div>' +
      '</div>' +
      '<div class="card-body" style="display:flex;flex-direction:column;gap:14px;padding-top:0;">' +
      (notices.length
        ? notices.map(function (n) { return noticeRecordHtml(n, notifyRecordKgFilter); }).join('')
        : '<div class="pc-empty"><div class="empty-icon">📭</div><div>暂无通知记录，点击「发送通知」向参与老师发送</div></div>') +
      '</div></section>';
    box.innerHTML = html;
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

  function renderActivityLaunch(root) {
    // 骨架在 admin.html 中；这里仅渲染表格行（活动发起页：发起/发布活动）
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
        // 通知：仅已发布状态显示；点击打开通知管理页，可发送通知并查看已读回执
        if (a.status === 'PUBLISHED') {
          ops += '<button type="button" class="pc-btn pc-btn-import pc-btn-sm" data-action="act-notify" data-id="' + a.id + '">通知</button>';
        }
        if (a.status === 'DRAFT') {
          ops += '<button type="button" class="pc-btn pc-btn-delete pc-btn-sm" data-action="act-delete" data-id="' + a.id + '">删除</button>';
        }
        // 通知状态：仅已发布活动展示（未通知 / 已通知 + 已读进度）
        var nMeta = activityNoticeMeta(a);
        var noticeCell = !nMeta
          ? '<span style="color:#c0c4cc;">—</span>'
          : '<span class="status-tag ' + nMeta.cls + '">' + nMeta.text + '</span>' +
            (nMeta.sub ? '<div style="font-size:12px;color:#909399;margin-top:2px;">' + nMeta.sub + '</div>' : '');
        return (
          '<tr>' +
          '<td><input type="checkbox" class="act-check" data-id="' + a.id + '"></td>' +
          '<td><strong>' + esc(a.title) + '</strong></td>' +
          '<td>' + esc(a.type) + '</td>' +
          '<td>' + esc(a.signupStart || '—') + ' ~ ' + esc(a.signupEnd || '—') + '</td>' +
          '<td>' + actScopeHtml(a) + '</td>' +
          '<td>' + esc(a.publishTime || '—') + '</td>' +
          '<td>' + statusHtml + '</td>' +
          '<td>' + noticeCell + '</td>' +
          '<td class="op-col">' + ops + '</td>' +
          '</tr>'
        );
      })
      .join('');
  }

  /* ═══════════════════════ PC：作品管理（由活动管理·报名阶段「查看作品」进入，支持按活动/作品名/教师筛选） ═══════════════════════ */

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
          '<td>' + esc(w.teacher) + '</td>' +
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

  /* ═══════════════════════ PC：活动管理（阶段筛选 + 统一活动列表表格：报名 / 审核 / 归档） ═══════════════════════ */

  // 评委手动分配状态：分组数 + 每组已选评委 id（key: groupNo → [judgeId]，确定分配时写入）
  // （已取消系统随机抽评，仅保留手动分配专家，详见需求调整）
  var judgeGroupCount = 2;
  var judgeAssignSel = {};

  /* 渲染手动分配分组（每组一个卡片：已选评委表格 + 「选择评委」按钮，不在页面直接铺开勾选框） */
  function renderJudgeAssignGroups() {
    var box = document.getElementById('judgeDrawPreview');
    if (!box) return;
    var judges = MDS.get('judges') || [];
    var judgeById = {};
    judges.forEach(function (j) { judgeById[String(j.id)] = j; });
    var curAct = activityById(amActivityId);
    var totalWorks = curAct ? (curAct.worksCount || 0) : 0;
    var base = Math.floor(totalWorks / judgeGroupCount);
    var remainder = totalWorks % judgeGroupCount;
    if (!judges.length) {
      box.innerHTML = '<div class="pc-empty" style="padding:20px 0;">暂无可分配评委，请先在「评委管理」添加评委账号</div>';
      return;
    }
    var html = '<div style="font-weight:600;color:#606266;margin-bottom:8px;">共 ' + totalWorks + ' 份作品，按 ' + judgeGroupCount + ' 组均匀分配；请为每组选择评委：</div>';
    for (var g = 1; g <= judgeGroupCount; g++) {
      var workCount = base + (g <= remainder ? 1 : 0);
      var ids = judgeAssignSel[g] || [];
      var rows = ids.map(function (id) {
        var j = judgeById[id];
        return (
          '<tr>' +
          '<td><strong>' + esc(j ? j.name : '') + '</strong></td>' +
          '<td>' + esc(j ? (j.account || '—') : '—') + '</td>' +
          '<td class="op-col"><button type="button" class="pc-btn pc-btn-delete pc-btn-sm" data-action="judge-remove" data-group="' + g + '" data-judge="' + id + '">移除</button></td>' +
          '</tr>'
        );
      }).join('');
      var tableHtml = ids.length
        ? '<table class="pc-table" style="margin-top:8px;"><thead><tr><th>评委名称</th><th>评委账号</th><th style="width:90px;">操作</th></tr></thead><tbody>' + rows + '</tbody></table>'
        : '<div style="color:#c0c4cc;padding:8px 0;">暂未选择评委</div>';
      html +=
        '<div class="draw-group-card" style="margin-bottom:10px;">' +
        '<div class="draw-group-head">第 ' + g + ' 组 · 需评 ' + workCount + ' 份作品' +
        '<span style="font-weight:400;color:#909399;margin-left:6px;">已选 ' + ids.length + ' 位评委</span></div>' +
        tableHtml +
        '<button type="button" class="pc-btn pc-btn-add pc-btn-sm" data-action="judge-open-select" data-group="' + g + '" style="margin-top:8px;">＋ 选择评委</button>' +
        '</div>';
    }
    box.innerHTML = html;
  }

  /* 渲染「选择评委」弹窗：评委列表（可多选），支持按姓名筛选；本组已选预勾，其他组已选置灰 */
  function renderJudgeSelectList() {
    var box = document.getElementById('judgeSelectList');
    if (!box) return;
    var g = window.__judgeSelectGroup;
    var judges = MDS.get('judges') || [];
    var kw = ((document.getElementById('judgeSelectSearch') || {}).value || '').trim();
    var checked = window.__judgeSelectChecked || {};
    var list = judges.filter(function (j) {
      return !kw || (j.name || '').indexOf(kw) >= 0;
    });
    if (!list.length) {
      box.innerHTML = '<div class="pc-empty" style="padding:20px 0;">无匹配评委</div>';
      return;
    }
    var rows = list.map(function (j) {
      var id = String(j.id);
      return (
        '<tr>' +
        '<td style="width:40px;"><input type="checkbox" class="judge-check" data-group="' + g + '" value="' + id + '"' + (checked[id] ? ' checked' : '') + '></td>' +
        '<td><strong>' + esc(j.name) + '</strong></td>' +
        '<td>' + esc(j.account || '—') + '</td>' +
        '<td style="font-size:12px;color:#606266;">' + esc(j.org || '—') + '</td>' +
        '</tr>'
      );
    }).join('');
    box.innerHTML =
      '<table class="pc-table"><thead><tr>' +
      '<th style="width:40px;"></th><th>评委名称</th><th>评委账号</th><th>所属机构</th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table>';
    updateJudgeCheckDisabled();
  }

  /* 跨组禁用：某评委已被其他分组选择时，在当前分组的选择弹窗中置灰不可选 */
  function updateJudgeCheckDisabled() {
    document.querySelectorAll('#judgeSelectList .judge-check').forEach(function (cb) {
      var g = cb.getAttribute('data-group');
      var usedElsewhere = false;
      Object.keys(judgeAssignSel).forEach(function (k) {
        if (k !== g && (judgeAssignSel[k] || []).indexOf(cb.value) >= 0) usedElsewhere = true;
      });
      cb.disabled = usedElsewhere;
      var tr = cb.closest('tr');
      if (tr) tr.classList.toggle('is-disabled', usedElsewhere);
    });
  }

  function activityById(id) {
    var num = Number(id);
    return (MDS.get('activities') || []).filter(function (a) { return a.id === num; })[0] || null;
  }

  function worksForActivityId(id) {
    var act = activityById(id);
    if (!act) return [];
    return (MDS.get('works') || []).filter(function (w) { return w.activity === act.title; });
  }

  /* 按生命周期阶段筛选活动 */
  function activitiesByStage(stage) {
    return (MDS.get('activities') || []).filter(function (a) { return a.stage === stage; });
  }

  /* 报名名单：由活动对象范围内在职老师派生（模拟报名数据，取活动 participants 人） */
  function signupListForActivity(act) {
    var teachers = scopeParticipants(act) || [];
    var count = Math.min(act.participants || 0, teachers.length);
    var rows = [];
    for (var i = 0; i < count; i++) {
      var t = teachers[i];
      rows.push({ name: t.name, className: t.className || t.roleLabel, kindergarten: t.kindergarten, signupTime: amMockSignupTime(act, i) });
    }
    return rows;
  }

  /* 模拟报名时间：在报名区间内按报名人数分摊日期 */
  function amMockSignupTime(act, i) {
    var start = act.signupStart || '';
    if (!start) return '—';
    var d = new Date(start);
    d.setDate(d.getDate() + (i % 10));
    var m = ('0' + (d.getMonth() + 1)).slice(-2);
    var day = ('0' + d.getDate()).slice(-2);
    return d.getFullYear() + '-' + m + '-' + day + ' 09:0' + (i % 9 + 1);
  }

  /* 报名详情弹窗：填充报名者信息及其上传的作品 */
  function fillSignupDetailDialog(act, teacher) {
    var title = document.getElementById('signupDetailTitle');
    if (title) title.textContent = '「' + act.title + '」报名详情';
    var meta = document.getElementById('signupDetailMeta');
    var list = signupListForActivity(act);
    var item = list.filter(function (s) { return s.name === teacher; })[0] || { name: teacher, className: '—', kindergarten: '—', signupTime: '—' };
    if (meta) meta.textContent = '报名教师：' + item.name + ' · 班级：' + item.className + ' · 幼儿园：' + item.kindergarten + ' · 报名时间：' + item.signupTime;
    // 该报名者上传的作品（works 中 activity+teacher 匹配）
    var works = worksForActivityId(act.id).filter(function (w) { return w.teacher === teacher; });
    var body = document.getElementById('signupDetailBody');
    if (body) {
      if (works.length) {
        body.innerHTML = works.map(function (w) {
          return (
            '<div class="draw-group-card" style="margin-bottom:8px;">' +
            '<div class="draw-group-head">' + esc(w.title || w.teacher + ' 的作品') + '</div>' +
            '<div style="font-size:12px;color:#606266;margin-top:6px;">' +
            '作品类型：' + esc(w.type) + ' · 大小：' + esc(w.size) + '<br>' +
            '提交时间：' + esc(w.submitTime) + ' · 查重：' + esc(w.check) +
            '</div>' +
            '</div>'
          );
        }).join('');
      } else {
        body.innerHTML = '<div class="pc-empty"><div class="empty-icon">📄</div><div>该教师暂未上传作品</div></div>';
      }
    }
    Proto.openDialog('signupDetailDialog');
  }

  /* 评分详情弹窗：填充每位评委对该作品的评分情况 */
  function fillScoreDetailDialog(act, work) {
    var title = document.getElementById('scoreDetailTitle');
    if (title) title.textContent = '「' + (work.title || work.teacher + ' 的作品') + '」评分详情';
    var meta = document.getElementById('scoreDetailMeta');
    if (meta) meta.textContent = '活动：' + act.title + ' · 作品教师：' + work.teacher + ' · 作品类型：' + work.type;
    var records = (MDS.get('reviewRecords') || []).filter(function (r) {
      return r.activity === act.title && r.work.indexOf(work.teacher) >= 0;
    });
    var tbody = document.getElementById('scoreDetailTbody');
    if (tbody) {
      tbody.innerHTML = records.length
        ? records.map(function (r) {
            // 各指标分数与评语按关联评分标准对齐展示（兼容旧记录仅有总评 comment）
            var indicators = judgeIndicatorsFor(act.title);
            var parts = (r.scores || '').split('/').map(function (s) { return s.trim(); });
            var comments = r.comments || [];
            var scoreCell = indicators.length === parts.length
              ? indicators.map(function (ind, i) {
                  return '<div>' + esc(ind.name) + '：<b>' + esc(parts[i]) + '</b></div>';
                }).join('')
              : esc(r.scores);
            var commentCell = comments.length
              ? (comments.map(function (c, i) {
                  var name = indicators[i] ? indicators[i].name : ('指标' + (i + 1));
                  return c ? '<div><b>' + esc(name) + '</b>：' + esc(c) + '</div>' : '';
                }).filter(Boolean).join('') || '<span style="color:#c0c4cc;">未填写</span>')
              : esc(r.comment || '—');
            return (
              '<tr>' +
              '<td><strong>' + esc(r.judge) + '</strong></td>' +
              '<td>' + scoreCell + '</td>' +
              '<td style="font-size:12px;color:#606266;">' + commentCell + '</td>' +
              '<td>' + esc(r.time) + '</td>' +
              '</tr>'
            );
          }).join('')
        : '<tr><td colspan="4" style="text-align:center;color:#909399;padding:30px 0;">暂无评分记录</td></tr>';
    }
    Proto.openDialog('scoreDetailDialog');
  }

  /* ── 主渲染：选择活动 → 步骤条（报名/评审/归档）→ 阶段内容 ── */

  var amActivityId = 2;    // 当前选中的活动
  var amStep = '';         // 当前查看的阶段：signup / review / archive（默认=活动当前阶段）

  /* 已进入阶段流的活动（报名 / 审核 / 归档） */
  function amPhaseActivities() {
    return (MDS.get('activities') || []).filter(function (a) {
      return a.stage === 'signup' || a.stage === 'review' || a.stage === 'archive';
    });
  }

  function stageText(stage) {
    return stage === 'signup' ? '报名阶段' : stage === 'review' ? '活动评审' : '活动结果';
  }

  // 活动阶段流转顺序：报名 → 评审 → 归档
  var STAGE_ORDER = ['signup', 'review', 'archive'];

  /* 主渲染：筛选条件（选活动）→ 步骤条 → 阶段内容 */
  function renderActivityManage(root) {
    var box = document.getElementById('activityManageRoot');
    if (!box) return;
    var all = amPhaseActivities();
    var act = activityById(amActivityId);
    if (!act || !(act.stage === 'signup' || act.stage === 'review' || act.stage === 'archive')) {
      amActivityId = (all[0] && all[0].id) || 0;
      act = activityById(amActivityId);
    }
    // 默认步骤 = 活动当前阶段
    if (act && ['signup', 'review', 'archive'].indexOf(amStep) < 0) {
      amStep = act.stage;
    }
    var actOpts = all
      .map(function (a) { return '<option value="' + a.id + '">' + esc(a.title) + '（' + stageText(a.stage) + '）</option>'; })
      .join('');

    var html =
      '<section class="pc-card">' +
      '<div class="card-head"><span class="card-title">筛选条件</span></div>' +
      '<div class="card-body"><div class="search-form">' +
      '<div class="search-item"><label>选择活动</label><select class="pc-select" id="amActivitySelect" style="width:360px;">' + actOpts + '</select></div>' +
      '</div></div></section>' +
      amRenderSteps(act) +
      (amStep === 'signup' ? amRenderSignup(act) : amStep === 'review' ? amRenderReview(act) : amRenderArchive(act));
    box.innerHTML = html;
    // 回填选中活动
    var sel = document.getElementById('amActivitySelect');
    if (sel) sel.value = String(amActivityId);
  }

  /* 活动步骤条（针对当前活动，当前阶段高亮，可点击切换查看；支持手动进入下一阶段 / 返回上一阶段） */
  function amRenderSteps(act) {
    if (!act) return '';
    var steps = [
      { key: 'signup', no: 1, title: '报名阶段', desc: '发布后教师报名' },
      { key: 'review', no: 2, title: '活动评审', desc: '分配评委' },
      { key: 'archive', no: 3, title: '活动结果', desc: '评审结果 · 归档' },
    ];
    var idx = STAGE_ORDER.indexOf(act.stage);
    var canPrev = idx > 0;
    var canNext = idx >= 0 && idx < STAGE_ORDER.length - 1;
    var html = '<section class="pc-card">' +
      '<div class="card-head"><span class="card-title">活动步骤 · ' + esc(act.title) + '</span><span class="table-count">当前阶段：' + stageText(act.stage) + '</span></div>' +
      '<div class="card-body"><div class="pc-stepper">';
    steps.forEach(function (s, i) {
      // 仅当前阶段及之前的阶段可点击查看，后续阶段禁用
      var clickable = STAGE_ORDER.indexOf(s.key) <= STAGE_ORDER.indexOf(act.stage);
      var cls = 'pc-stepper-step' + (amStep === s.key ? ' is-active' : '') + (clickable ? '' : ' is-disabled');
      html +=
        '<div class="' + cls + '"' + (clickable ? ' data-action="am-switch-step" data-step="' + s.key + '"' : '') + '>' +
        '<div class="step-index">' + s.no + '</div>' +
        '<div class="step-label">' + s.title + '</div>' +
        '<div class="step-desc">' + s.desc + '</div>' +
        '</div>';
      if (i < steps.length - 1) html += '<div class="pc-stepper-connector"></div>';
    });
    // 阶段流转操作（手动控制进入下一阶段 / 返回上一阶段）
    html += '</div>' +
      '<div class="am-stage-nav">' +
      '<span style="font-size:12px;color:#909399;">阶段需手动推进：</span>' +
      (canPrev
        ? '<button type="button" class="pc-btn pc-btn-default pc-btn-sm" data-action="am-prev-stage">← 返回上一阶段</button>'
        : '<span class="am-stage-nav-disabled">← 返回上一阶段</span>') +
      (canNext
        ? '<button type="button" class="pc-btn pc-btn-add pc-btn-sm" data-action="am-next-stage">进入下一阶段 →</button>'
        : '<span class="am-stage-nav-disabled">进入下一阶段 →</span>') +
      '</div>' +
      '</div></section>';
    return html;
  }

  /* ── 报名阶段：报名信息列表（每条可查看详情 → 作品） ── */
  function amRenderSignup(act) {
    if (!act) return '';
    var list = signupListForActivity(act);
    var works = worksForActivityId(act.id);
    var rows = list.length
      ? list.map(function (s) {
          var w = works.filter(function (x) { return x.teacher === s.name; })[0];
          // 作品上传状态：根据该教师是否已上传作品判断
          var uploadCell = w
            ? '<span class="status-tag status-success">已上传</span><div style="font-size:12px;color:#909399;margin-top:2px;">' + esc(w.submitTime || '') + '</div>'
            : '<span class="status-tag status-warning">未上传</span>';
          return (
            '<tr>' +
            '<td>' + esc(s.name) + '</td>' +
            '<td>' + esc(s.className) + '</td>' +
            '<td>' + esc(s.kindergarten) + '</td>' +
            '<td>' + esc(s.signupTime) + '</td>' +
            '<td>' + uploadCell + '</td>' +
            '<td class="op-col"><button type="button" class="pc-btn pc-btn-edit pc-btn-sm" data-action="am-view-signup-detail" data-activity="' + act.id + '" data-teacher="' + esc(s.name) + '">查看详情</button></td>' +
            '</tr>'
          );
        }).join('')
      : '<tr><td colspan="6" style="text-align:center;color:#909399;padding:40px 0;">暂无报名信息</td></tr>';
    // 补交开关状态（活动级：截止后是否仍可补交作品）
    var supplementOn = !!act.supplementEnabled;
    return (
      '<section class="pc-card">' +
      '<div class="card-head"><span class="card-title">报名阶段 · 报名信息</span><span class="table-count">共 ' + list.length + ' 人报名</span></div>' +
      '<div class="card-body" style="display:flex;align-items:center;gap:14px;flex-wrap:wrap;">' +
      '<button type="button" class="pc-btn pc-btn-export pc-btn-sm" data-action="am-export-signup">⇩ 导出报名表</button>' +
      '<span style="font-size:12px;color:#909399;">导出报名信息表格（报名教师 / 班级 / 幼儿园 / 报名时间）</span>' +
      '</div>' +
      '<div class="card-body" style="display:flex;align-items:center;gap:24px;flex-wrap:wrap;padding-top:0;">' +
      '<div style="display:flex;align-items:center;gap:8px;"><label style="font-size:13px;color:#606266;">作品提交截止</label><input class="pc-input" type="date" id="amWorkDeadline" value="' + esc(act.workDeadline || '') + '" style="width:160px;"></div>' +
      '<div style="display:flex;align-items:center;gap:8px;"><label style="font-size:13px;color:#606266;">允许补交</label><span class="am-switch' + (supplementOn ? ' is-on' : '') + '" data-action="am-supplement-toggle" data-id="' + act.id + '" title="' + (supplementOn ? '已开启：截止后仍可补交' : '已关闭：截止后不可补交') + '"><span class="am-switch-knob"></span></span><span style="font-size:12px;color:#909399;">' + (supplementOn ? '已开启' : '已关闭') + '</span></div>' +
      '</div>' +
      '<div class="card-body no-padding">' +
      '<table class="pc-table"><thead><tr>' +
      '<th>报名教师</th><th>班级</th><th>幼儿园</th><th>报名时间</th><th>作品上传状态</th><th>操作</th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table>' +
      '</div></section>'
    );
  }

  /* ── 评审阶段：专家评审（评委分配）或 管理员直接审核（可退回标注原因） ── */
  function amRenderReview(act) {
    if (!act) return '';
    // 非专家评审：由管理员直接审核（无需分配专家，可审核退回并标注原因）
    if (act.expertReview === false) {
      return amRenderAdminReview(act);
    }
    // 专家评审：单次评委分配，无评分阶段划分
    var groups = ((MDS.get('reviewGroups') || {})[act.id]) || [];
    // 评审状态：未开始 / 评审中 / 已结束（分配评委后控制是否开始）
    var curStatus = ((MDS.get('reviewStageStatus') || {})[act.id]) || 'notstarted';
    var stageCtrl = '';
    if (curStatus === 'reviewing') {
      stageCtrl = '<button type="button" class="pc-btn pc-btn-import pc-btn-sm" data-action="review-finish">结束评审</button>';
    } else if (curStatus === 'finished') {
      stageCtrl = '<span class="status-tag status-success">已结束</span>';
    } else {
      stageCtrl = '<button type="button" class="pc-btn pc-btn-import pc-btn-sm" data-action="review-start">开始评审</button>';
    }
    // 该活动关联的评分标准（评审按关联标准打分，可查看指标明细）
    var std = scoreStandardById(act.scoreStandardId);
    var stdHtml = std
      ? '<span style="font-size:12px;color:#606266;">评分标准：' + esc(std.name) + '</span>' +
        '<button type="button" class="pc-btn pc-btn-default pc-btn-sm" data-action="score-standard-view">查看</button>'
      : '<span style="font-size:12px;color:#909399;">未关联评分标准</span>';
    return (
      '<section class="pc-card">' +
      '<div class="card-head"><span class="card-title">活动评审 · ' + esc(act.title) + '</span><span class="table-count">' + (curStatus === 'reviewing' ? '评审中' : curStatus === 'finished' ? '已结束' : '未开始') + '</span></div>' +
      '<div class="card-body">' +
      '<div class="search-form">' +
      '<div class="search-item">' +
      stdHtml +
      '<button type="button" class="pc-btn pc-btn-add pc-btn-sm" data-action="judge-open-assign">' + (groups.length ? '重新分配' : '评委分配') + '</button>' +
      stageCtrl +
      '</div>' +
      '</div>' +
      '</div></section>' +
      amRenderJudgeGroups(act)
    );
  }

  /* ── 管理员直接审核模式（活动设置「无需专家评审」）：逐条审核，可审核退回并标注原因 ── */
  function amRenderAdminReview(act) {
    var list = signupListForActivity(act);
    var works = worksForActivityId(act.id);
    var adminReviews = ((MDS.get('adminReviews') || {})[act.id]) || {};
    var rows = list.length
      ? list.map(function (s) {
          var w = works.filter(function (x) { return x.teacher === s.name; })[0];
          var ar = adminReviews[s.name] || { status: 'pending', reason: '' };
          var statusHtml = ar.status === 'approved'
            ? '<span class="status-tag status-success">已通过</span>'
            : ar.status === 'rejected'
              ? '<span class="status-tag status-danger">已退回</span>' + (ar.reason ? '<div style="font-size:12px;color:#e03a2e;margin-top:4px;">原因：' + esc(ar.reason) + '</div>' : '')
              : '<span class="status-tag status-warning">待审核</span>';
          var ops = '<button type="button" class="pc-btn pc-btn-edit pc-btn-sm" data-action="am-view-signup-detail" data-activity="' + act.id + '" data-teacher="' + esc(s.name) + '">查看详情</button>';
          if (ar.status !== 'approved') {
            ops += '<button type="button" class="pc-btn pc-btn-add pc-btn-sm" data-action="admin-approve" data-activity="' + act.id + '" data-teacher="' + esc(s.name) + '">审核通过</button>';
          }
          if (ar.status !== 'rejected') {
            ops += '<button type="button" class="pc-btn pc-btn-edit pc-btn-sm" data-action="admin-reject-open" data-activity="' + act.id + '" data-teacher="' + esc(s.name) + '">审核退回</button>';
          }
          return (
            '<tr>' +
            '<td><strong>' + esc(s.name) + '</strong></td>' +
            '<td>' + esc(s.className) + '</td>' +
            '<td>' + (w ? esc(w.title) : '<span style="color:#c0c4cc;">未提交作品</span>') + '</td>' +
            '<td>' + statusHtml + '</td>' +
            '<td class="op-col">' + ops + '</td>' +
            '</tr>'
          );
        }).join('')
      : '<tr><td colspan="5" style="text-align:center;color:#909399;padding:40px 0;">暂无报名信息</td></tr>';
    return (
      '<section class="pc-card">' +
      '<div class="card-head"><span class="card-title">活动评审 · ' + esc(act.title) + '</span><span class="table-count">管理员直接审核（无需分配专家）</span></div>' +
      '<div style="font-size:12px;color:#909399;padding:10px 16px 0;">该活动未开启专家评审，由管理员逐条审核；退回时将标注退回原因。</div>' +
      '<div class="card-body no-padding">' +
      '<table class="pc-table"><thead><tr>' +
      '<th>报名教师</th><th>班级</th><th>作品</th><th>审核状态</th><th>操作</th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table>' +
      '</div></section>'
    );
  }

  /* 已分配评委分组卡片（每个分组一个卡片，卡片内表格展示该组评委） */
  function amRenderJudgeGroups(act) {
    if (!act) return '';
    var groups = ((MDS.get('reviewGroups') || {})[act.id]) || [];
    var groupMap = {};
    groups.forEach(function (g) {
      if (!groupMap[g.groupNo]) groupMap[g.groupNo] = { groupNo: g.groupNo, workCount: g.workCount, judges: [] };
      groupMap[g.groupNo].judges.push(g);
    });
    var groupNos = Object.keys(groupMap).sort(function (a, b) { return Number(a) - Number(b); });
    var cards = groupNos.length
      ? groupNos.map(function (no) {
          var gr = groupMap[no];
          var rows = gr.judges.map(function (j) {
            return (
              '<tr>' +
              '<td><strong>' + esc(j.judgeName) + '</strong></td>' +
              '<td>' + esc(j.judgeAccount || '—') + '</td>' +
              '<td>' + (j.workCount || 0) + '</td>' +
              '</tr>'
            );
          }).join('');
          return (
            '<section class="pc-card">' +
            '<div class="card-head"><span class="card-title">第 ' + gr.groupNo + ' 组</span><span class="table-count">需评 ' + (gr.workCount || 0) + ' 份作品</span></div>' +
            '<div class="card-body no-padding">' +
            '<table class="pc-table"><thead><tr>' +
            '<th>评委名称</th><th>评委账号</th><th>需评作品数</th>' +
            '</tr></thead><tbody>' + rows + '</tbody></table>' +
            '</div></section>'
          );
        }).join('')
      : '<section class="pc-card"><div class="card-body"><div class="pc-empty"><div class="empty-icon">👥</div><div>暂无评委分配，点击「评委分配」设置分组并分配评委</div></div></div></section>';
    return cards;
  }

  /* 作品综合评分：该作品所有评委评分的平均分（保留 1 位小数）；无评分返回 null */
  function workAvgScore(act, work) {
    var records = MDS.get('reviewRecords') || [];
    var recs = records.filter(function (r) { return r.activity === act.title && r.work.indexOf(work.teacher) >= 0; });
    var total = 0, n = 0;
    recs.forEach(function (r) {
      (r.scores || '').split('/').forEach(function (s) {
        var v = parseInt(s.trim(), 10);
        if (!isNaN(v)) { total += v; n++; }
      });
    });
    if (!n) return null;
    return Math.round((total / n) * 10) / 10;
  }

  /* 奖项等级配置：优先取已保存配置，否则从活动奖项设置派生默认名次范围 */
  function awardConfigForAct(act) {
    var cfg = ((MDS.get('awardConfigs') || {})[act.id]);
    if (cfg && cfg.length) return cfg;
    var out = [];
    var from = 1;
    (act.awards || []).forEach(function (aw) {
      out.push({ name: aw.name, rankFrom: from, rankTo: from + (aw.count || 1) - 1 });
      from += aw.count || 1;
    });
    return out;
  }

  /* 设置奖项等级弹窗：填充 / 渲染 / 保存 */
  function fillAwardConfigDialog(act) {
    var title = document.getElementById('awardConfigTitle');
    if (title) title.textContent = '设置奖项等级 · ' + act.title;
    renderAwardConfigRows(awardConfigForAct(act));
    Proto.openDialog('awardConfigDialog');
  }

  function renderAwardConfigRows(configs) {
    var tbody = document.getElementById('awardConfigTbody');
    if (!tbody) return;
    tbody.innerHTML = (configs.length ? configs : [{}]).map(function (c) {
      return (
        '<tr>' +
        '<td><input class="pc-input ac-name" placeholder="奖项名称" value="' + esc(c.name || '') + '"></td>' +
        '<td><input class="pc-input ac-range" placeholder="如 1-3" value="' + esc(c.range || (c.rankFrom != null ? c.rankFrom + '-' + c.rankTo : '')) + '" style="width:110px;"></td>' +
        '<td><span class="action-btn action-delete" data-action="ac-del">删除</span></td>' +
        '</tr>'
      );
    }).join('');
  }

  /* ── 评分标准：按 id 查标准 / 渲染列表 / 指标行 / 权重合计 / 下拉选项 ── */
  function scoreStandardById(id) {
    return (MDS.get('scoreStandards') || []).filter(function (s) { return s.id === id; })[0];
  }

  /* 评分标准列表页：每张标准一张卡片（名称/备注/指标摘要/编辑/删除） */
  function renderScoreStandardList() {
    var box = document.getElementById('scoreStandardList');
    if (!box) return;
    var standards = MDS.get('scoreStandards') || [];
    if (!standards.length) {
      box.innerHTML = '<section class="pc-card"><div class="pc-empty"><div class="empty-icon">📋</div><div>暂无评分标准，点击「新增评分标准」创建</div></div></section>';
      return;
    }
    var rows = standards.map(function (s) {
      var indicators = (s.indicators || []).map(function (ind) {
        return '<span class="score-standard-indicator" title="' + esc(ind.desc || '') + '">' + esc(ind.name) + ' · ' + ind.maxScore + '分 · ' + ind.weight + '%' + (ind.desc ? ' · ' + esc(ind.desc) : '') + '</span>';
      }).join('');
      return (
        '<tr>' +
        '<td><strong>' + esc(s.name) + '</strong></td>' +
        '<td style="color:#909399;">' + esc(s.remark || '—') + '</td>' +
        '<td class="op-col">' +
        '<button type="button" class="pc-btn pc-btn-edit pc-btn-sm" data-action="score-standard-edit" data-id="' + s.id + '">编辑</button>' +
        '<button type="button" class="pc-btn pc-btn-delete pc-btn-sm" data-action="score-standard-del" data-id="' + s.id + '">删除</button>' +
        '</td>' +
        '</tr>'
      );
    }).join('');
    box.innerHTML =
      '<section class="pc-card">' +
      '<div class="card-head"><span class="card-title">评分标准列表</span><span class="table-count">共 ' + standards.length + ' 套</span></div>' +
      '<div class="card-body no-padding">' +
      '<table class="pc-table"><thead><tr>' +
      '<th style="width:180px;">标准名称</th><th style="width:220px;">备注</th><th style="width:130px;">操作</th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table>' +
      '</div></section>';
  }

  /* 打开评分标准弹窗：standard 为空=新增，否则编辑回填 */
  function fillScoreStandardDialog(standard) {
    var title = document.getElementById('scoreStandardTitle');
    if (title) title.textContent = standard ? '编辑评分标准' : '新增评分标准';
    var idEl = document.getElementById('ssId');
    if (idEl) idEl.value = standard ? String(standard.id) : '';
    var nameEl = document.getElementById('ssName');
    if (nameEl) nameEl.value = standard ? (standard.name || '') : '';
    var remarkEl = document.getElementById('ssRemark');
    if (remarkEl) remarkEl.value = standard ? (standard.remark || '') : '';
    var tbody = document.getElementById('ssIndicatorTbody');
    if (tbody) {
      var indicators = (standard && standard.indicators && standard.indicators.length)
        ? standard.indicators
        : [{ name: '', maxScore: 100, weight: 100 }];
      tbody.innerHTML = indicators.map(ssIndicatorRowHtml).join('');
    }
    updateSSWeightHint();
    Proto.openDialog('scoreStandardDialog');
  }

  /* 指标行 HTML（ss-name 指标名 / ss-desc 指标说明 / ss-max 满分 / ss-weight 权重） */
  function ssIndicatorRowHtml(ind) {
    ind = ind || {};
    return (
      '<tr>' +
      '<td><input class="pc-input ss-name" placeholder="指标名称" value="' + esc(ind.name || '') + '"></td>' +
      '<td><input class="pc-input ss-desc" placeholder="指标说明（选填，评委打分时可见）" value="' + esc(ind.desc || '') + '" style="width:100%;"></td>' +
      '<td><input class="pc-input ss-max" type="number" min="0" placeholder="满分" value="' + (ind.maxScore != null ? ind.maxScore : '') + '" style="width:100px;"></td>' +
      '<td><input class="pc-input ss-weight" type="number" min="0" max="100" placeholder="权重" value="' + (ind.weight != null ? ind.weight : '') + '" style="width:100px;"></td>' +
      '<td><span class="action-btn action-delete" data-action="ss-indicator-del">删除</span></td>' +
      '</tr>'
    );
  }

  /* 权重合计提示（满分/权重实时校验） */
  function updateSSWeightHint() {
    var tbody = document.getElementById('ssIndicatorTbody');
    var hint = document.getElementById('ssWeightHint');
    if (!tbody || !hint) return;
    var total = 0;
    tbody.querySelectorAll('.ss-weight').forEach(function (el) {
      total += parseInt(el.value, 10) || 0;
    });
    var ok = total === 100;
    hint.innerHTML = '权重合计：<strong>' + total + '%</strong>' +
      (ok
        ? ' <span style="color:#67c23a;">✓ 合计 100%，可保存</span>'
        : ' <span style="color:#e6a23c;">应合计 100%（当前 ' + total + '%）</span>');
  }

  /* 评分标准下拉选项（活动发起/编辑弹窗）：含「不关联」 */
  function scoreStandardOptions(selectedId) {
    var opts = ['<option value="">不关联评分标准</option>'];
    (MDS.get('scoreStandards') || []).forEach(function (s) {
      var sel = s.id === selectedId ? ' selected' : '';
      opts.push('<option value="' + s.id + '"' + sel + '>' + esc(s.name) + '</option>');
    });
    return opts.join('');
  }

  /* 归档结果组装：报名 + 作品 + 综合评分 → 排序 → 名次 → 奖项（结果页与电子奖状共用的单一数据源） */
  function buildArchiveItems(act) {
    var list = signupListForActivity(act);
    var works = worksForActivityId(act.id);
    var awards = awardConfigForAct(act);
    // 组装：报名 + 作品 + 综合评分
    var items = list.map(function (s) {
      var w = works.filter(function (x) { return x.teacher === s.name; })[0];
      var score = w ? workAvgScore(act, w) : null;
      return { s: s, w: w, score: score };
    });
    // 排序：有综合评分者按评分降序排前，未评分者排最后
    items.sort(function (a, b) {
      if (a.score === null && b.score === null) return 0;
      if (a.score === null) return 1;
      if (b.score === null) return -1;
      return b.score - a.score;
    });
    // 分配自动名次；支持手动调整覆盖（rankOverrides[actId][教师名] = 名次）
    var rankOverrides = ((MDS.get('rankOverrides') || {})[act.id]) || {};
    var autoRank = 0;
    items.forEach(function (it) {
      if (it.score !== null) autoRank++;
      it.autoRank = it.score !== null ? autoRank : null;
      it.rank = it.score !== null ? (rankOverrides[it.s.name] || it.autoRank) : null;
    });
    // 奖项等级：按名次区间匹配
    items.forEach(function (it) {
      var awardName = '';
      if (it.rank !== null) {
        awards.forEach(function (a) {
          if (it.rank >= a.rankFrom && it.rank <= a.rankTo) awardName = a.name;
        });
      }
      it.awardName = awardName;
    });
    return items;
  }

  /* ── 归档阶段：评审结果列表（综合评分 + 名次 + 奖项等级 + 电子奖状 + 查看详情/评分详情） ── */
  function amRenderArchive(act) {
    if (!act) return '';
    var items = buildArchiveItems(act);
    // 电子奖状生成状态（会话态）：{ [actId]: { [教师名]: true } }
    var certStatus = ((MDS.get('certStatus') || {})[act.id]) || {};
    var rows = items.length
      ? items.map(function (it) {
          var s = it.s, w = it.w;
          var ops = '<button type="button" class="pc-btn pc-btn-edit pc-btn-sm" data-action="am-view-signup-detail" data-activity="' + act.id + '" data-teacher="' + esc(s.name) + '">查看详情</button>';
          if (w) {
            ops += '<button type="button" class="pc-btn pc-btn-edit pc-btn-sm" data-action="am-view-score-detail" data-work-id="' + w.id + '" data-activity="' + act.id + '">查看评分详情</button>';
          }
          if (it.rank !== null) {
            ops += '<button type="button" class="pc-btn pc-btn-edit pc-btn-sm" data-action="rank-adjust-open" data-activity="' + act.id + '" data-teacher="' + esc(s.name) + '" data-rank="' + it.rank + '">调整名次</button>';
          }
          if (certStatus[s.name]) {
            ops += '<button type="button" class="pc-btn pc-btn-edit pc-btn-sm" data-action="cert-view" data-activity="' + act.id + '" data-teacher="' + esc(s.name) + '">查看奖状</button>';
          }
          return (
            '<tr>' +
            '<td><strong>' + esc(s.name) + '</strong></td>' +
            '<td>' + esc(s.className) + '</td>' +
            '<td>' + (w ? esc(w.title) : '<span style="color:#c0c4cc;">未提交作品</span>') + '</td>' +
            '<td>' + (it.score === null ? '<span style="color:#c0c4cc;">—</span>' : '<span class="status-tag status-success">' + it.score + '</span>') + '</td>' +
            '<td>' + (it.rank === null ? '<span style="color:#c0c4cc;">—</span>' : '<strong>' + it.rank + '</strong>' + (it.rank !== it.autoRank ? '<span style="color:#e6a23c;font-size:12px;margin-left:4px;">手动</span>' : '')) + '</td>' +
            '<td>' + (it.rank !== null && it.awardName ? '<span class="status-tag status-primary">' + esc(it.awardName) + '</span>' : '<span style="color:#c0c4cc;">—</span>') + '</td>' +
            '<td>' + (certStatus[s.name] ? '<span class="status-tag status-success">已生成</span>' : '<span style="color:#c0c4cc;">—</span>') + '</td>' +
            '<td class="op-col">' + ops + '</td>' +
            '</tr>'
          );
        }).join('')
      : '<tr><td colspan="8" style="text-align:center;color:#909399;padding:40px 0;">暂无报名信息</td></tr>';
    // 结果状态 + 发布/归档（流程完整：未发布 → 发布结果 → 归档）
    var statusBtn = '';
    if (act.resultStatus === 'pending') {
      statusBtn = '<button type="button" class="pc-btn pc-btn-add pc-btn-sm" data-action="am-publish-result" data-id="' + act.id + '">发布结果</button>';
    } else if (act.resultStatus === 'published') {
      statusBtn = '<button type="button" class="pc-btn pc-btn-edit pc-btn-sm" data-action="am-archive" data-id="' + act.id + '">归档</button>';
    }
    return (
      '<section class="pc-card">' +
      '<div class="card-head"><span class="card-title">活动结果 · 评审结果</span><span class="table-count">' + (act.resultStatus === 'archived' ? '已归档' : act.resultStatus === 'published' ? '已发布' : '未发布') + '</span></div>' +
      '<div class="card-body" style="display:flex;align-items:center;gap:14px;flex-wrap:wrap;">' +
      '<button type="button" class="pc-btn pc-btn-default pc-btn-sm" data-action="ac-open">设置奖项等级</button>' +
      '<button type="button" class="pc-btn pc-btn-import pc-btn-sm" data-action="am-calc-score">计算综合得分</button>' +
      '<button type="button" class="pc-btn pc-btn-add pc-btn-sm" data-action="cert-generate">🎓 生成电子奖状</button>' +
      statusBtn +
      '<button type="button" class="pc-btn pc-btn-export pc-btn-sm" data-action="am-export-archive">⇩ 导出全量数据</button>' +
      '</div>' +
      '<div class="card-body no-padding">' +
      '<table class="pc-table"><thead><tr>' +
      '<th>报名教师</th><th>班级</th><th>作品</th><th>综合评分</th><th>名次</th><th>奖项等级</th><th>电子奖状</th><th>操作</th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table>' +
      '</div></section>'
    );
  }

  /* ── 报名/评审/归档三阶段内容由 renderActivityManage 承载（见 amRenderSignup / amRenderReview / amRenderArchive） ── */

  /* ═══════════════════════ PC：活动查询（归档历史活动：统计 + 表格 + 全量导出 + 报名/评审详情） ═══════════════════════ */

  // 查询页状态：当前查看的活动（null=列表态）；名称/类型筛选条件
  var aqActivityId = null;
  var aqNameFilter = '';
  var aqTypeFilter = '';

  /* 归档历史活动：仅已归档的活动（stage=archive 且 resultStatus=archived） */
  function queryActivities() {
    return (MDS.get('activities') || []).filter(function (a) {
      return a.stage === 'archive' && a.resultStatus === 'archived';
    });
  }

  /* 按名称/类型筛选归档活动 */
  function filteredQueryActivities() {
    return queryActivities().filter(function (a) {
      if (aqNameFilter && (a.title || '').indexOf(aqNameFilter) < 0) return false;
      if (aqTypeFilter && a.type !== aqTypeFilter) return false;
      return true;
    });
  }

  /* 结果状态中文 + 标签类 */
  function resultStatusMeta(status) {
    return status === 'archived'
      ? { text: '已归档', cls: 'status-success' }
      : status === 'published'
        ? { text: '已发布', cls: 'status-primary' }
        : { text: '未发布', cls: 'status-warning' };
  }

  /* 主渲染：列表态（统计 + 筛选 + 归档活动表格）或 详情态（报名数据 + 评审数据） */
  function renderActivityQuery(root) {
    var box = document.getElementById('activityQueryRoot');
    if (!box) return;
    if (aqActivityId) {
      var act = activityById(aqActivityId);
      // 活动被移出「已归档」状态则回到列表态
      if (!act || act.stage !== 'archive' || act.resultStatus !== 'archived') aqActivityId = null;
      if (aqActivityId) {
        box.innerHTML = aqRenderQueryDetail(act);
        return;
      }
    }
    box.innerHTML = aqRenderQueryList();
  }

  /* 列表态：统计卡片 + 筛选条件 + 归档历史活动表格 */
  function aqRenderQueryList() {
    var list = filteredQueryActivities();
    var all = queryActivities();
    // 统计：归档活动数 / 累计报名人次 / 累计作品数 / 累计奖项名额
    var totalActs = all.length;
    var totalSignups = all.reduce(function (s, a) { return s + (a.participants || 0); }, 0);
    var totalWorks = all.reduce(function (s, a) { return s + (a.worksCount || 0); }, 0);
    var totalAwards = all.reduce(function (s, a) {
      return s + (a.awards || []).reduce(function (t, aw) { return t + (aw.count || 0); }, 0);
    }, 0);

    var html = '';
    html += '<div class="stat-grid">';
    html += statCard('归档活动', '历史归档活动数', String(totalActs) + ' 个', '📦', 'rgba(37,99,235,0.12)');
    html += statCard('报名人次', '累计报名教师', String(totalSignups) + ' 人次', '👥', 'rgba(255,138,0,0.14)');
    html += statCard('参赛作品', '累计提交作品', String(totalWorks) + ' 份', '📄', 'rgba(245,166,35,0.16)');
    html += statCard('获奖名额', '累计奖项名额', String(totalAwards) + ' 名', '🏆', 'rgba(245,158,11,0.14)');
    html += '</div>';

    // 筛选条件
    var typeOpts = ['<option value="">全部类型</option>'];
    (MDS.get('activityTypes') || []).forEach(function (t) {
      typeOpts.push('<option value="' + esc(t.name) + '"' + (aqTypeFilter === t.name ? ' selected' : '') + '>' + esc(t.name) + '</option>');
    });
    html += '<section class="pc-card">' +
      '<div class="card-head"><span class="card-title">筛选条件</span></div>' +
      '<div class="card-body"><div class="search-form">' +
      '<div class="search-item"><label>活动名称</label><input class="pc-input" id="aqSearchName" placeholder="请输入活动名称" value="' + esc(aqNameFilter) + '"></div>' +
      '<div class="search-item"><label>活动类型</label><select class="pc-select" id="aqTypeFilter">' + typeOpts.join('') + '</select></div>' +
      '<div class="search-item"><button type="button" class="pc-btn pc-btn-add" data-action="aq-search">搜 索</button>' +
      '<button type="button" class="pc-btn pc-btn-default" data-action="aq-reset">重 置</button></div>' +
      '</div></div></section>';

    // 归档历史活动表格
    var rows = list.length
      ? list.map(function (a) {
          var st = resultStatusMeta(a.resultStatus);
          return (
            '<tr>' +
            '<td><strong>' + esc(a.title) + '</strong></td>' +
            '<td>' + esc(a.type) + '</td>' +
            '<td>' + esc(a.signupStart || '—') + ' ~ ' + esc(a.signupEnd || '—') + '</td>' +
            '<td>' + actScopeHtml(a) + '</td>' +
            '<td>' + (a.participants || 0) + ' 人</td>' +
            '<td>' + (a.worksCount || 0) + ' 份</td>' +
            '<td>' + esc(a.publishTime || '—') + '</td>' +
            '<td><span class="status-tag ' + st.cls + '">' + st.text + '</span></td>' +
            '<td class="op-col">' +
            '<button type="button" class="pc-btn pc-btn-edit pc-btn-sm" data-action="aq-view" data-id="' + a.id + '">查看</button>' +
            '<button type="button" class="pc-btn pc-btn-export pc-btn-sm" data-action="aq-export" data-id="' + a.id + '">导出全量数据</button>' +
            '</td>' +
            '</tr>'
          );
        }).join('')
      : '<tr><td colspan="9" style="text-align:center;color:#909399;padding:40px 0;">暂无归档历史活动</td></tr>';

    html += '<section class="pc-card">' +
      '<div class="card-head"><span class="card-title">归档历史活动</span><span class="table-count">共 ' + list.length + ' 条记录</span></div>' +
      '<div class="card-body no-padding">' +
      '<table class="pc-table"><thead><tr>' +
      '<th>活动名称</th><th>活动类型</th><th>报名时间</th><th>活动对象</th><th>报名人数</th><th>作品数</th><th>发布时间</th><th>结果状态</th><th>操作</th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table>' +
      '</div></section>';

    return html;
  }

  /* 详情态：返回/导出工具条 + 报名/评审合并表格（报名信息 + 作品 + 综合评分 + 名次 + 奖项等级） */
  function aqRenderQueryDetail(act) {
    // 合并数据源：buildArchiveItems 同时含报名信息（s）、作品（w）、综合评分/名次/奖项等级
    var items = buildArchiveItems(act);
    var rows = items.length
      ? items.map(function (it) {
          var s = it.s, w = it.w;
          // 作品列：已提交显示标题 + 提交时间，未提交灰显
          var workCell = w
            ? esc(w.title) + '<div style="font-size:12px;color:#909399;margin-top:2px;">' + esc(w.submitTime || '') + '</div>'
            : '<span style="color:#c0c4cc;">未提交作品</span>';
          var ops = '<button type="button" class="pc-btn pc-btn-edit pc-btn-sm" data-action="am-view-signup-detail" data-activity="' + act.id + '" data-teacher="' + esc(s.name) + '">查看详情</button>';
          if (w) {
            ops += '<button type="button" class="pc-btn pc-btn-edit pc-btn-sm" data-action="am-view-score-detail" data-work-id="' + w.id + '" data-activity="' + act.id + '">查看评分详情</button>';
          }
          return (
            '<tr>' +
            '<td>' + esc(s.name) + '</td>' +
            '<td>' + esc(s.className) + '</td>' +
            '<td>' + esc(s.kindergarten) + '</td>' +
            '<td>' + esc(s.signupTime) + '</td>' +
            '<td>' + workCell + '</td>' +
            '<td>' + (it.score === null ? '<span style="color:#c0c4cc;">—</span>' : '<span class="status-tag status-success">' + it.score + '</span>') + '</td>' +
            '<td>' + (it.rank === null ? '<span style="color:#c0c4cc;">—</span>' : '<strong>' + it.rank + '</strong>') + '</td>' +
            '<td>' + (it.rank !== null && it.awardName ? '<span class="status-tag status-primary">' + esc(it.awardName) + '</span>' : '<span style="color:#c0c4cc;">—</span>') + '</td>' +
            '<td class="op-col">' + ops + '</td>' +
            '</tr>'
          );
        }).join('')
      : '<tr><td colspan="9" style="text-align:center;color:#909399;padding:40px 0;">暂无报名信息</td></tr>';

    var st = resultStatusMeta(act.resultStatus);
    return (
      '<section class="pc-card">' +
      '<div class="card-head"><span class="card-title">活动详情 · ' + esc(act.title) + '</span><span class="table-count"><span class="status-tag ' + st.cls + '">' + st.text + '</span></span></div>' +
      '<div class="card-body" style="display:flex;align-items:center;gap:14px;flex-wrap:wrap;">' +
      '<button type="button" class="pc-btn pc-btn-default pc-btn-sm" data-action="aq-back">← 返回列表</button>' +
      '<button type="button" class="pc-btn pc-btn-export pc-btn-sm" data-action="aq-export" data-id="' + act.id + '">⇩ 导出全量数据</button>' +
      '<span style="font-size:12px;color:#909399;">活动类型：' + esc(act.type) + ' · 报名时间：' + esc(act.signupStart || '—') + ' ~ ' + esc(act.signupEnd || '—') + ' · 活动对象：' + esc(actScopeText(act)) + '</span>' +
      '</div></section>' +
      '<section class="pc-card">' +
      '<div class="card-head"><span class="card-title">报名与评审数据</span><span class="table-count">共 ' + items.length + ' 人</span></div>' +
      '<div class="card-body no-padding">' +
      '<table class="pc-table"><thead><tr>' +
      '<th>报名教师</th><th>班级</th><th>幼儿园</th><th>报名时间</th><th>作品名称</th><th>综合评分</th><th>名次</th><th>奖项等级</th><th>操作</th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table>' +
      '</div></section>'
    );
  }

  /* ═══════════════════════ PC：电子奖状模板管理 ═══════════════════════ */

  /* 预览用的示例变量取值（模板编辑时展示占位符渲染效果） */
  function certSampleMap() {
    return {
      '{{教师姓名}}': '张老师',
      '{{活动名称}}': '示例活动名称',
      '{{奖项等级}}': '一等奖',
      '{{名次}}': '第1名',
      '{{班级}}': '中一班',
      '{{幼儿园}}': '童蹊幼儿园',
      '{{获奖日期}}': todayStr(),
    };
  }

  /* 构建单张奖状预览 HTML（背景 + 标题 + 变量替换后的内容） */
  function buildCertPreviewHtml(tpl, map) {
    return (
      '<div class="cert-preview" style="' + certBgStyle(tpl) + '">' +
      '<div class="cert-preview-inner">' +
      '<div class="cert-preview-title">荣誉证书</div>' +
      '<div class="cert-preview-content">' + renderCertText((tpl && tpl.content) || '', map) + '</div>' +
      '</div>' +
      '</div>'
    );
  }

  /* 奖状模板列表页：模板卡片网格 */
  function renderCertTemplate(root) {
    var box = document.getElementById('certTemplateList');
    if (!box) return;
    var templates = MDS.get('certTemplates') || [];
    if (!templates.length) {
      box.innerHTML = '<section class="pc-card"><div class="card-body"><div class="pc-empty"><div class="empty-icon">🎓</div><div>暂无奖状模板，点击「新增奖状模板」创建</div></div></div></section>';
      return;
    }
    box.innerHTML =
      '<section class="pc-card">' +
      '<div class="card-head"><span class="card-title">奖状模板</span><span class="table-count">共 ' + templates.length + ' 个模板</span></div>' +
      '<div class="card-body"><div class="cert-tpl-grid">' +
      templates.map(function (t) {
        var bgText = t.backgroundType === 'image' ? '自定义背景图' : certBgLabel(t.background);
        return (
          '<div class="cert-tpl-card">' +
          '<div class="cert-tpl-thumb">' + buildCertPreviewHtml(t, certSampleMap()) + '</div>' +
          '<div class="cert-tpl-info">' +
          '<div class="cert-tpl-name">' + esc(t.name) + '</div>' +
          '<div class="cert-tpl-meta">背景：' + esc(bgText) + '</div>' +
          '<div class="cert-tpl-ops">' +
          '<button type="button" class="pc-btn pc-btn-edit pc-btn-sm" data-action="cert-tpl-edit" data-id="' + t.id + '">编辑</button>' +
          '<button type="button" class="pc-btn pc-btn-delete pc-btn-sm" data-action="cert-tpl-delete" data-id="' + t.id + '">删除</button>' +
          '</div>' +
          '</div>' +
          '</div>'
        );
      }).join('') +
      '</div></div></section>';
  }

  /* 渲染背景预设色板（含选中态） */
  function renderCertBgPicker(activeKey) {
    var box = document.getElementById('certBgPresets');
    if (!box) return;
    box.innerHTML = CERT_BG_PRESETS.map(function (p) {
      var isActive = p.key === activeKey ? ' is-active' : '';
      return '<span class="cert-bg-preset' + isActive + '" data-action="cert-bg-preset" data-preset="' + p.key + '" style="background:' + p.css + ';" title="' + esc(p.label) + '"></span>';
    }).join('');
  }

  /* 打开模板编辑弹窗：tpl 为 null 表示新增，否则编辑 */
  function fillCertTemplateDialog(tpl) {
    var title = document.getElementById('certTplDialogTitle');
    if (title) title.textContent = tpl ? '编辑奖状模板' : '新增奖状模板';
    var idInput = document.getElementById('certTplId');
    if (idInput) idInput.value = tpl ? tpl.id : '';
    var name = document.getElementById('certTplName');
    if (name) name.value = tpl ? tpl.name : '';
    var content = document.getElementById('certTplContent');
    if (content) content.value = tpl ? tpl.content : '';
    window.__certTplBgType = tpl ? (tpl.backgroundType || 'preset') : 'preset';
    window.__certTplBg = tpl ? (tpl.background || CERT_BG_PRESETS[0].key) : CERT_BG_PRESETS[0].key;
    renderCertBgPicker(window.__certTplBgType === 'preset' ? window.__certTplBg : '');
    // 变量插入按钮
    var chips = document.getElementById('certVarChips');
    if (chips) {
      chips.innerHTML = CERT_VARIABLES.map(function (v) {
        return '<button type="button" class="cert-var-chip" data-action="cert-insert-var" data-key="' + esc(v.key) + '" title="插入变量">' + esc(v.label) + '</button>';
      }).join('');
    }
    renderCertTplPreview();
    Proto.openDialog('certTemplateDialog');
  }

  /* 模板编辑弹窗实时预览（读取当前表单值） */
  function renderCertTplPreview() {
    var box = document.getElementById('certTplPreview');
    if (!box) return;
    var content = (document.getElementById('certTplContent') || {}).value || '';
    var tpl = {
      name: (document.getElementById('certTplName') || {}).value || '奖状模板',
      backgroundType: window.__certTplBgType,
      background: window.__certTplBg,
      content: content,
    };
    box.innerHTML = buildCertPreviewHtml(tpl, certSampleMap());
  }

  /* 事件绑定（一次性：活动管理页切换活动） */
  function bindManageEvents() {
    document.addEventListener('change', function (e) {
      var t = e.target;
      if (!t || !t.id) return;
      // 活动管理页：切换活动 → 重设为活动当前阶段
      if (t.id === 'amActivitySelect') {
        amActivityId = Number(t.value);
        amStep = '';
        renderActivityManage(qs('#pcPage'));
        return;
      }
      // 报名阶段：修改作品提交截止 → 保存到当前活动
      if (t.id === 'amWorkDeadline') {
        MDS.update('activities', function (arr) {
          return arr.map(function (x) { return x.id === amActivityId ? Object.assign({}, x, { workDeadline: t.value }) : x; });
        });
        Proto.showToast('作品提交截止已更新');
        return;
      }
      // 积分获得情况：切换积分方案 → 重渲染表格
      if (t.id === 'soSchemeSelect') {
        scoreObtainedSchemeId = Number(t.value);
        renderScoreObtained(qs('#pcPage'));
        return;
      }
    });
    // 评分标准弹窗：指标输入实时刷新权重合计
    document.addEventListener('input', function (e) {
      var t = e.target;
      if (!t || !t.classList) return;
      if (t.classList.contains('ss-name') || t.classList.contains('ss-max') || t.classList.contains('ss-weight')) {
        updateSSWeightHint();
      }
    });
    // 选择评委弹窗：按姓名筛选评委（实时过滤列表）
    document.addEventListener('input', function (e) {
      var t = e.target;
      if (t && t.id === 'judgeSelectSearch') {
        renderJudgeSelectList();
      }
    });
    // 选择评委弹窗：勾选/取消评委 → 同步临时已选集（供筛选重绘时保留勾选状态）
    document.addEventListener('change', function (e) {
      var t = e.target;
      if (!t || !t.classList || !t.classList.contains('judge-check')) return;
      var checked = window.__judgeSelectChecked || {};
      if (t.checked) checked[t.value] = true;
      else delete checked[t.value];
      window.__judgeSelectChecked = checked;
    });
  }

  /* ═══════════════════════ PC：园内排行榜（KPI + 全园 TOP10 综合榜） ═══════════════════════ */

  /* 切换园状态（管理员端园内排行榜；园长固定童蹊幼儿园） */
  var gardenFilter = '童蹊幼儿园';

  /* 排位分综合榜表格（园长/管理员视角，无「本人」高亮；每行「查看明细」查看该教师积分获取明细）：data = buildRankScoreTable 返回 */
  function rankScoreTableHtml(data) {
    var tableRows = data.rows.map(function (r) {
      var dimCells = data.dims.map(function (d) {
        var cell = r[d.key];
        return '<td><span class="score-cell">' + cell.score + '</span><span class="sub">分</span> / <span class="rank-cell' + (cell.rank <= 3 ? ' rank-top' : '') + '">第 ' + cell.rank + '</span></td>';
      }).join('');
      return (
        '<tr>' +
        '<td>' + esc(r.name) + '<div style="font-size:11px;color:#909399;">' + esc(r.className) + '</div></td>' +
        dimCells +
        '<td><span class="total-cell">' + r.totalPoints + '</span><span class="sub">分</span></td>' +
        '<td><span class="rank-cell' + (r.totalRank <= 3 ? ' rank-top' : '') + '">第 ' + r.totalRank + '</span></td>' +
        '<td><span class="action-btn action-primary" data-action="rank-point-detail" data-teacher="' + esc(r.name) + '">查看明细</span></td>' +
        '</tr>'
      );
    }).join('');
    return (
      '<table class="pc-table rank-score-table"><thead><tr>' +
      '<th>姓名</th>' +
      data.dims.map(function (d) {
        return '<th>' + esc(d.name) + '<br><span style="font-weight:400;font-size:11px;color:#909399;">得分 / 排名</span></th>';
      }).join('') +
      '<th>总得分</th><th>总排名</th><th>操作</th>' +
      '</tr></thead><tbody>' + tableRows + '</tbody></table>'
    );
  }

  /* 园内排行榜 KPI 总览 + 管理员端「切换园」下拉 */
  function renderGardenKpi(garden) {
    var summary = (MDS.get('gardenSummary') || []).filter(function (g) { return g.name === garden; })[0] || {};
    var progress = (MDS.get('parentProgress') || []).filter(function (p) { return p.kindergarten === garden; });
    var totalP = 0, regP = 0, actP = 0;
    progress.forEach(function (p) { totalP += p.total; regP += p.registered; actP += p.active; });
    var regRate = totalP ? Math.round((regP / totalP) * 100) : 0;
    var memberRate = totalP ? Math.round((actP / totalP) * 100) : 0;

    var html = '<div class="stat-grid" style="margin-bottom:0;">';
    html += statCard('在职教师', '参与活动教师', (summary.teachers || 0) + ' 人', '👩‍🏫', 'rgba(37,99,235,0.12)');
    html += statCard('平均总分', '园内教师平均', (summary.avgTotal || 0) + ' 分', '📊', 'rgba(255,138,0,0.14)');
    html += statCard('家长注册率', '已注册家长', regRate + '%', '📱', 'rgba(102,204,153,0.14)');
    html += statCard('会员转化率', '会员激活', memberRate + '%', '⭐', 'rgba(245,158,11,0.14)');
    html += '</div>';

    // 管理员端：切换园下拉（园长端固定本园，不显示）
    if (currentRole() === 'admin') {
      var options = (MDS.get('kindergartens') || []).map(function (k) {
        return '<option value="' + esc(k.name) + '"' + (k.name === garden ? ' selected' : '') + '>' + esc(k.name) + '</option>';
      }).join('');
      html += '<div class="stat-filter-bar"><span class="filter-label">切换园</span>' +
        '<select class="filter-select" data-garden-filter>' + options + '</select></div>';
    }
    return html;
  }

  /* 园内排行榜：KPI 总览 + 全园 TOP10 综合榜（对齐教师端「全园 TOP10 综合榜」；园长固定本园，管理员可切换园） */
  function renderRankGarden(root) {
    var box = document.getElementById('rankGardenRoot');
    if (!box) return;
    var garden = currentRole() === 'admin' ? gardenFilter : '童蹊幼儿园';
    var gardenRanks = MDS.get('gardenRanks') || {};
    var rankData = gardenRanks[garden] || {};
    var N = (rankData.total || []).length || 1;

    var scoreData = buildRankScoreTable(rankData, N);
    var groupId = 'rankGardenTabs';
    box.innerHTML =
      renderGardenKpi(garden) +
      '<section class="pc-card" style="margin-top:var(--pc-card-gap);">' +
      '<div class="card-head"><span class="card-title">全园 TOP10 综合榜</span>' +
      '<div style="margin-left:auto;display:flex;align-items:center;gap:12px;">' +
      '<span class="table-count">' + esc(garden) + ' · 数据更新于 ' + RANK_UPDATE_TIME + '</span>' +
      '<button type="button" class="pc-btn pc-btn-default pc-btn-sm" data-action="pc-menu-select" data-menu-key="rank-garden-all">查看全部</button>' +
      '</div></div>' +
      '<div class="card-body no-padding">' +
      rankTabs(groupId, 'total') +
      rankPanel(groupId, 'total', rankScoreTableHtml(scoreData), true) +
      RANK_DIMS.map(function (d) {
        return rankPanel(groupId, d.key, singleDimTableHtml(scoreData, d, { withAction: true }), false);
      }).join('') +
      '</div></section>' +
      '<div class="rank-rule-note">' +
      '排位分规则：全园在职参与活动老师共 <b>' + N + '</b> 名，单维度按数值从高到低倒序排名，第 1 名得 ' + N + ' 分、第 2 名得 ' + (N - 1) + ' 分……第 ' + N + ' 名得 1 分；并列名次得相同排位分、后续名次顺延。总积分 = 平台使用 + 家园互动 + 外部推广 + 会员转化 四项排位分之和。' +
      '</div>';
  }

  /* 园内教师榜（全部）：园长/管理员「园内排行榜」二级页，列出当前园全部教师并支持查看积分获取明细 */
  function renderRankGardenAll(root) {
    var box = document.getElementById('rankGardenAllRoot');
    if (!box) return;
    var garden = currentRole() === 'admin' ? gardenFilter : '童蹊幼儿园';
    var gardenRanks = MDS.get('gardenRanks') || {};
    var rankData = gardenRanks[garden] || {};
    var N = (rankData.total || []).length || 1;
    var data = buildRankScoreTable(rankData, N);

    var rows = data.rows.map(function (r) {
      var dimCells = data.dims.map(function (d) {
        var cell = r[d.key];
        return '<td><span class="score-cell">' + cell.score + '</span><span class="sub">分</span> / <span class="rank-cell' + (cell.rank <= 3 ? ' rank-top' : '') + '">第 ' + cell.rank + '</span></td>';
      }).join('');
      return (
        '<tr>' +
        '<td><span class="rank-cell' + (r.totalRank <= 3 ? ' rank-top' : '') + '">第 ' + r.totalRank + '</span></td>' +
        '<td>' + esc(r.name) + '<div style="font-size:11px;color:#909399;">' + esc(r.className) + '</div></td>' +
        dimCells +
        '<td><span class="total-cell">' + r.totalPoints + '</span><span class="sub">分</span></td>' +
        '<td><span class="action-btn action-primary" data-action="rank-point-detail" data-teacher="' + esc(r.name) + '">查看明细</span></td>' +
        '</tr>'
      );
    }).join('');

    box.innerHTML =
      '<div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;">' +
      '<button type="button" class="pc-btn pc-btn-default pc-btn-sm" data-action="pc-menu-select" data-menu-key="rank-garden">← 返回园内排行榜</button>' +
      '<span style="font-size:12px;color:#909399;">当前园：' + esc(garden) + ' · 点击任一教师「查看明细」可查看其积分获取明细（获得方式 / 积分 / 时间）</span>' +
      '</div>' +
      '<section class="pc-card">' +
      '<div class="card-head"><span class="card-title">园内教师排位分榜（全部）</span><span class="table-count">' + esc(garden) + ' · 共 ' + N + ' 名 · 数据更新于 ' + RANK_UPDATE_TIME + '</span></div>' +
      '<div class="card-body no-padding">' +
      '<table class="pc-table rank-score-table"><thead><tr>' +
      '<th>总排名</th><th>姓名</th>' +
      data.dims.map(function (d) {
        return '<th>' + esc(d.name) + '<br><span style="font-weight:400;font-size:11px;color:#909399;">得分 / 排名</span></th>';
      }).join('') +
      '<th>总得分</th><th>操作</th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table>' +
      '</div></section>';
  }

  /* ═══════════════════════ PC：家长进度看板（三色进度） ═══════════════════════ */

  function parentProgressRow(p) {
    var regPct = Math.round((p.registered / p.total) * 100);
    var actPct = Math.round((p.active / p.total) * 100);
    // 已激活是「已注册」的子集：注册段只展示「已注册未激活」部分，
    // 否则两段叠加会使总宽超过 100%，进度条溢出、未注册段被裁剪。
    var regOnlyPct = regPct - actPct; // 已注册未激活
    var unregPct = 100 - regPct;      // 未注册
    return (
      '<div class="parent-progress-row">' +
      '<span class="row-class">' + esc(p.className) + '</span>' +
      '<div style="flex:1;">' +
      '<div class="progress-tri">' +
      '<span class="seg seg-active" style="width:' + actPct + '%"></span>' +
      '<span class="seg seg-registered" style="width:' + regOnlyPct + '%"></span>' +
      '<span class="seg seg-unregistered" style="width:' + unregPct + '%"></span>' +
      '</div>' +
      '</div>' +
      '<span class="row-nums">已注册 ' + p.registered + ' / 激活 ' + p.active + ' / 未注册 ' + (p.total - p.registered) + '</span>' +
      '</div>'
    );
  }

  function renderRankParent(root) {
    var box = document.getElementById('parentProgressRoot');
    if (!box) return;
    var progress = MDS.get('parentProgress') || [];
    var isAdmin = currentRole() === 'admin';
    // 园长只看本园（童蹊），管理员看全园并按园分组
    var list = isAdmin ? progress : progress.filter(function (p) { return p.kindergarten === '童蹊幼儿园'; });

    var totalAll = 0, regAll = 0, actAll = 0;
    list.forEach(function (p) {
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
    html += '<span class="lg-item"><span class="lg-dot" style="background:#ff8a00;"></span>会员已激活</span>';
    html += '<span class="lg-item"><span class="lg-dot" style="background:#66cc99;"></span>已注册未激活</span>';
    html += '<span class="lg-item"><span class="lg-dot" style="background:#d1d5db;"></span>未注册</span>';
    html += '</div>';

    if (isAdmin) {
      // 管理员端：按园分组
      (MDS.get('kindergartens') || []).forEach(function (g) {
        var gardenList = list.filter(function (p) { return p.kindergarten === g.name; });
        if (!gardenList.length) return;
        html += '<div class="garden-group-title">' + esc(g.name) + '</div>';
        gardenList.forEach(function (p) { html += parentProgressRow(p); });
      });
    } else {
      list.forEach(function (p) { html += parentProgressRow(p); });
    }

    box.innerHTML = html;
  }

  /* 教师名 → 教师信息（teachers 数据映射，供积分明细弹窗展示园所、班级、岗位） */
  function teacherInfoMap() {
    var map = {};
    (MDS.get('teachers') || []).forEach(function (t) { map[t.name] = t; });
    return map;
  }

  /* 积分获取明细维度 → 颜色（供积分明细弹窗 / 园内教师榜共用） */
  function pointDims() {
    return [
      { key: '平台使用', color: '#2563eb', bg: 'rgba(37,99,235,0.12)' },
      { key: '家园互动', color: '#16a34a', bg: 'rgba(102,204,153,0.18)' },
      { key: '外部推广', color: '#ff8a00', bg: 'rgba(255,138,0,0.14)' },
      { key: '会员转化', color: '#d97706', bg: 'rgba(245,158,11,0.14)' },
    ];
  }

  /* 某教师积分获取明细（按维度汇总 + 逐条记录） */
  function pointDetailRecords(name) {
    return (MDS.get('pointRecords') || []).filter(function (r) { return r.teacher === name; });
  }

  function renderPointDetailDialog(name) {
    var dialog = document.getElementById('pointDetailDialog');
    if (!dialog) return;
    var records = pointDetailRecords(name);
    var info = teacherInfoMap()[name] || {};
    var dims = pointDims();

    // 按维度汇总积分
    var sum = {}, total = 0;
    dims.forEach(function (d) { sum[d.key] = 0; });
    records.forEach(function (r) { sum[r.dimension] = (sum[r.dimension] || 0) + r.points; total += r.points; });

    var title = document.getElementById('pointDetailTitle');
    if (title) title.textContent = '积分获取明细 · ' + name;
    var meta = document.getElementById('pointDetailMeta');
    if (meta) meta.textContent = (info.className || '—') + ' · ' + (info.kindergarten || '—') + (info.role ? ' · ' + info.role : '') + ' · 本月累计 ' + total + ' 分';

    var summary = document.getElementById('pointDetailSummary');
    if (summary) {
      summary.innerHTML =
        dims.map(function (d) {
          return '<div class="point-dim-chip" style="border-color:' + d.color + ';background:' + d.bg + ';">' +
            '<span class="pd-name">' + d.key + '</span><span class="pd-val" style="color:' + d.color + ';">' + sum[d.key] + ' 分</span></div>';
        }).join('') +
        '<div class="point-dim-chip point-dim-total"><span class="pd-name">合计</span><span class="pd-val">' + total + ' 分</span></div>';
    }

    var tbody = document.getElementById('pointDetailTbody');
    if (tbody) {
      if (!records.length) {
        tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;color:#909399;padding:32px 0;">暂无积分获取记录</td></tr>';
      } else {
        // 按获取时间倒序展示
        var sorted = records.slice().sort(function (a, b) { return a.time < b.time ? 1 : -1; });
        tbody.innerHTML = sorted.map(function (r) {
          var d = dims.filter(function (x) { return x.key === r.dimension; })[0] || {};
          return '<tr>' +
            '<td style="color:#909399;white-space:nowrap;">' + esc(r.time) + '</td>' +
            '<td><span class="point-dim-tag" style="color:' + (d.color || '#606266') + ';background:' + (d.bg || '#f4f5f7') + ';">' + esc(r.dimension) + '</span> ' + esc(r.method) + '</td>' +
            '<td style="text-align:right;"><span class="score-cell">+' + r.points + '</span><span class="sub">分</span></td>' +
            '</tr>';
        }).join('');
      }
    }
    Proto.openDialog('pointDetailDialog');
  }

  /* ═══════════════════════ PC：积分方案管理（专项积分方案 CRUD） ═══════════════════════
     注：积分体系重构后已移除月度常规勋章积分方案与关联活动；参与对象 = 所选幼儿园范围的全部在职教师 */

  function renderScoreScheme(root) {
    renderScoreSchemes();
  }

  /* 积分方案列表 */
  function renderScoreSchemes() {
    var box = document.getElementById('scoreSchemeList');
    if (!box) return;
    var count = document.getElementById('scoreSchemeCount');
    var list = MDS.get('scoreSchemes') || [];
    if (count) count.textContent = '共 ' + list.length + ' 条';
    box.innerHTML = list.length
      ? list.map(scoreSchemeCard).join('')
      : '<div class="pc-empty"><div class="empty-icon">🏷️</div><div>暂无积分方案，点击「新增积分方案」创建</div></div>';
  }

  /* 积分方案状态标签：由积分周期推导 */
  function scoreSchemeStatus(s) {
    var today = todayStr();
    if (!s.cycleStart) return '<span class="status-tag status-warning">未设置周期</span>';
    if (s.cycleStart > today) return '<span class="status-tag status-warning">未开始</span>';
    if (!s.cycleEnd || s.cycleEnd >= today) return '<span class="status-tag status-primary">进行中</span>';
    return '<span class="status-tag status-success">已结束</span>';
  }

  /* 积分方案卡片：展示参与对象（所选幼儿园范围 + 在职教师数）与积分周期 */
  function scoreSchemeCard(s) {
    var scopeHtml = (s.targetKindergartens || []).map(function (k) {
      return '<span class="act-scope-tag">' + esc(k) + '</span>';
    }).join('');
    var participants = scoreSchemeParticipants(s);
    return (
      '<div class="scheme-card">' +
      '<div class="scheme-head">' +
      '<span class="scheme-name">' + esc(s.name) + '</span>' +
      scoreSchemeStatus(s) +
      '<div class="scheme-ops">' +
      '<button type="button" class="pc-btn pc-btn-edit pc-btn-sm" data-action="as-edit" data-id="' + s.id + '">编辑</button>' +
      '<button type="button" class="pc-btn pc-btn-default pc-btn-sm" data-action="as-copy" data-id="' + s.id + '">复制方案</button>' +
      '<button type="button" class="pc-btn pc-btn-delete pc-btn-sm" data-action="as-delete" data-id="' + s.id + '">删除</button>' +
      '</div>' +
      '</div>' +
      '<div class="scheme-meta">参与对象：' + (scopeHtml || '<span style="color:#c0c4cc;">—</span>') + '（' + participants.length + ' 名在职教师）</div>' +
      '<div class="scheme-meta">积分周期：' + esc(s.cycleStart || '—') + ' ~ ' + esc(s.cycleEnd || '—') + '</div>' +
      '</div>'
    );
  }

  /* ── 积分方案参与对象：所选幼儿园范围（targetKindergartens）内的全部在职教师（不含园长/离职） ── */
  function scoreSchemeParticipants(scheme) {
    var kgs = (scheme && scheme.targetKindergartens) || [];
    var isAll = kgs.indexOf('全部幼儿园') >= 0;
    return (MDS.get('teachers') || [])
      .filter(function (t) { return t.isActive !== false && (isAll || kgs.indexOf(t.kindergarten) >= 0); })
      .map(function (t) { return { name: t.name, className: t.className, kindergarten: t.kindergarten }; });
  }

  /* ═══════════════════════ PC：积分获得情况（按积分方案查看参与对象四维度积分 + 总积分 + 排位分 + 可编辑奖金 + 发布公告） ═══════════════════════ */

  var scoreObtainedSchemeId = null;

  /* 积分获得情况：由方案参与对象四维度积分组装行，并按总积分计算名次与排位分
     （并列同分取相同名次、后续名次顺延；排位分 = N - 名次 + 1，N=参与对象数） */
  function buildSchemeRows(scheme) {
    var seeds = ((MDS.get('schemeScores') || {})[scheme.id]) || [];
    var base = seeds.length
      ? seeds
      : ((scoreSchemeParticipants(scheme) || []).map(function (p) {
          return { name: p.name, className: p.className, kindergarten: p.kindergarten, usage: 0, interaction: 0, promotion: 0, conversion: 0, bonus: 0 };
        }));
    var rows = base.map(function (r) {
      return {
        name: r.name,
        className: r.className || '—',
        kindergarten: r.kindergarten || '童蹊幼儿园',
        usage: r.usage || 0,
        interaction: r.interaction || 0,
        promotion: r.promotion || 0,
        conversion: r.conversion || 0,
        bonus: r.bonus || 0,
      };
    });
    rows.forEach(function (r) {
      r.total = r.usage + r.interaction + r.promotion + r.conversion;
    });
    // 竞赛名次：按总积分降序，并列同分取相同名次、后续名次顺延
    var rank = 0;
    var prev = null;
    rows.slice().sort(function (a, b) { return b.total - a.total; }).forEach(function (r, i) {
      if (r.total !== prev) {
        rank = i + 1;
        prev = r.total;
      }
      r.totalRank = rank;
      r.rankPoints = Math.max(1, rows.length - rank + 1);
    });
    rows.sort(function (a, b) { return a.totalRank - b.totalRank || (a.name < b.name ? -1 : 1); });
    return { rows: rows, N: rows.length };
  }

  /* 积分汇总文本（只读预览 + 发布时拼入公告内容；若表格已渲染则读取奖金输入框实时值） */
  function buildScoreSummaryText(scheme) {
    var data = buildSchemeRows(scheme);
    var box = document.getElementById('scoreObtainedRoot');
    if (box) {
      box.querySelectorAll('.so-bonus-input').forEach(function (inp) {
        var row = data.rows.filter(function (x) { return x.name === inp.getAttribute('data-name'); })[0];
        if (row) row.bonus = parseInt(inp.value, 10) || 0;
      });
    }
    var lines = [
      '《' + scheme.name + '》积分获得情况汇总',
      '积分周期：' + (scheme.cycleStart || '—') + ' ~ ' + (scheme.cycleEnd || '—') + ' · 参与对象 ' + data.N + ' 名',
      '',
    ];
    var medalMarks = ['🥇', '🥈', '🥉'];
    data.rows.forEach(function (r, i) {
      // 前三名用奖牌标记，其余用序号，便于扫读
      var mark = r.totalRank <= 3 ? medalMarks[r.totalRank - 1] + ' ' : (i + 1) + '. ';
      lines.push(mark + r.name + '（' + r.className + '）· 总积分 ' + r.total + ' 分 · 排位分 ' + r.rankPoints + ' · 奖金 ¥' + r.bonus);
    });
    return lines.join('\n');
  }

  /* 积分获得情况页：方案下拉 + 保存奖金按钮 + 表格（名次/参与对象/班级/四维度/总积分/排位分/奖金输入框） */
  function renderScoreObtained(root) {
    var box = document.getElementById('scoreObtainedRoot');
    if (!box) return;
    var schemes = MDS.get('scoreSchemes') || [];
    if (!scoreObtainedSchemeId || !schemes.some(function (s) { return s.id === scoreObtainedSchemeId; })) {
      scoreObtainedSchemeId = schemes.length ? schemes[0].id : null;
    }
    if (!scoreObtainedSchemeId) {
      box.innerHTML = '<section class="pc-card"><div class="card-body"><div class="pc-empty"><div class="empty-icon">🏷️</div><div>请先在「积分方案管理」创建积分方案</div></div></div></section>';
      return;
    }
    var s = schemes.filter(function (x) { return x.id === scoreObtainedSchemeId; })[0];
    var opts = schemes.map(function (x) {
      return '<option value="' + x.id + '"' + (x.id === scoreObtainedSchemeId ? ' selected' : '') + '>' + esc(x.name) + '</option>';
    }).join('');
    var data = buildSchemeRows(s);
    var trs = data.rows.map(function (r) {
      return (
        '<tr>' +
        '<td>' + esc(r.name) + '</td>' +
        '<td>' + esc(r.className) + '</td>' +
        '<td>' + r.usage + '</td><td>' + r.interaction + '</td><td>' + r.promotion + '</td><td>' + r.conversion + '</td>' +
        '<td><span class="total-cell">' + r.total + '</span> 分</td>' +
        '<td><span class="rank-cell">' + r.rankPoints + '</span> 分</td>' +
        '<td><span class="rank-cell' + (r.totalRank <= 3 ? ' rank-top' : '') + '">第 ' + r.totalRank + ' 名</span></td>' +
        '<td><input class="pc-input so-bonus-input" type="number" min="0" style="width:90px;" data-name="' + esc(r.name) + '" value="' + r.bonus + '"></td>' +
        '</tr>'
      );
    }).join('');
    box.innerHTML =
      '<section class="pc-card">' +
      '<div class="card-head"><span class="card-title">筛选条件</span></div>' +
      '<div class="card-body"><div class="search-form">' +
      '<div class="search-item"><label>积分方案</label><select class="pc-select" id="soSchemeSelect" style="width:320px;">' + opts + '</select></div>' +
      '<div class="search-item" style="color:#909399;font-size:12px;">奖金列可编辑，保存后持久化；「发布公告」自动附带积分汇总。</div>' +
      '</div></div></section>' +
      '<section class="pc-card">' +
      '<div class="card-head">' +
      '<button type="button" class="pc-btn pc-btn-default pc-btn-sm" data-action="score-obtained-bonus-save">保存奖金</button>' +
      '<button type="button" class="pc-btn pc-btn-add pc-btn-sm" data-action="score-obtained-announce-open" style="margin-left: 12px;">📢 发布公告</button>' +
      '<span class="table-count">' + esc(s.name) + ' · 参与对象 ' + data.N + ' 名 · 排位分：第 1 名 ' + data.N + ' 分 … 第 ' + data.N + ' 名 1 分，并列顺延</span>' +
      '</div>' +
      '<div class="card-body no-padding"><table class="pc-table"><thead><tr>' +
      '<th>参与对象</th><th>班级</th><th>平台使用</th><th>家园互动</th><th>外部推广</th><th>会员转化</th><th>总积分</th><th>排位分</th><th>名次</th><th>奖金（元）</th>' +
      '</tr></thead><tbody>' + trs + '</tbody></table></div></section>';
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
          '<td>' + esc(t.name) + '</td>' +
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
    if (path.indexOf('notice.html') >= 0) return 'notice';
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

    // ── 底部：激励体系内容 ──
    if (role === 'teacher') {
      // 教师：童蹊社区专区（活动中心 + 排行榜宫格，激励卡已移除）
      html += renderTeacherCommunity();
    } else if (role === 'principal') {
      // 园长：童蹊社区专区（园内激励动态 + 排行榜/家长进度入口）
      html += renderPrincipalCommunity();
    } else {
      // 家长简版首页（班级动态 + 活动推荐）
      html += renderParentHome();
    }

    root.innerHTML = html;
  }

  /* 教师「童蹊社区」专区：活动中心 + 排行榜快捷入口宫格（激励卡已移除，结构与园长端对齐） */
  function renderTeacherCommunity() {
    var html = '';
    html += '<div class="mb-section-title"><span class="title">童蹊社区</span><span class="subtitle">活动中心 · 园内排行</span></div>';
    html += '<div class="mb-card community-card">';
    html += '<div class="mb-grid community-grid">';
    var items = [
      { name: '活动中心', icon: '📋', color: '#4facfe', bg: '#e6f4ff', path: 'activity.html' },
      { name: '排行榜', icon: '♛', color: '#f9ca24', bg: '#fffce8', path: 'rank.html' },
    ];
    items.forEach(function (it) {
      html += mbGridCell(it.name, it.icon, it.color, it.bg, it.path);
    });
    html += '</div>';
    html += '</div>';
    return html;
  }

  /* 园长「童蹊社区」专区：活动中心 + 排行榜 + 家长进度入口宫格（对齐教师端结构，无激励卡） */
  function renderPrincipalCommunity() {
    var html = '';
    html += '<div class="mb-section-title"><span class="title">童蹊社区</span><span class="subtitle">活动中心 · 园内排行 · 家长进度</span></div>';
    html += '<div class="mb-card community-card">';
    html += '<div class="mb-grid community-grid">';
    var items = [
      // 活动中心：园长可报名参赛（角色感知渲染，?role=principal 保证园长视角）
      { name: '活动中心', icon: '📋', color: '#4facfe', bg: '#e6f4ff', path: 'activity.html?role=principal' },
      { name: '排行榜', icon: '♛', color: '#f9ca24', bg: '#fffce8', path: 'principal.html' },
      { name: '家长进度', icon: '👪', color: '#66cc99', bg: '#e6f9f0', path: 'principal.html?view=parent' },
    ];
    items.forEach(function (it) {
      html += mbGridCell(it.name, it.icon, it.color, it.bg, it.path);
    });
    html += '</div>';
    html += '</div>';
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

  /* ═══════════════════════ 移动端：活动中心（教师/园长端完整流程：查看 → 报名 → 上传 → 结果） ═══════════════════════ */

  var mobileActTab = 'all';      // 分段：all 全部 / signup 待报名 / doing 进行中 / done 已出结果
  var uploadActivityId = null;   // 当前上传作品对应的活动 id（upload-sheet 时写入）
  var signupActivityId = null;   // 当前报名对应的活动 id（activity-signup 时写入）

  /* 当前端侧参与者（活动中心按角色区分：教师=张慧 / 园长=userProfile（李园长），无对应角色返回 null） */
  function currentParticipant() {
    var role = currentRole();
    if (role === 'teacher') return { role: 'teacher', name: TEACHER_NAME, kindergarten: '童蹊幼儿园' };
    if (role === 'principal') {
      var p = MDS.get('userProfile') || {};
      return { role: 'principal', name: p.name || '李园长', kindergarten: '童蹊幼儿园' };
    }
    return null;
  }

  /* 当前参与者在某活动的报名记录（教师读 teacherSignups、园长读 principalSignups，按活动 id 键控） */
  function participantSignupFor(act) {
    var p = currentParticipant();
    if (!p) return null;
    var store = p.role === 'principal' ? 'principalSignups' : 'teacherSignups';
    return (MDS.get(store) || {})[act.id] || null;
  }

  /* 写入当前参与者的报名/作品状态（教师写 teacherSignups、园长写 principalSignups） */
  function setParticipantSignup(id, data) {
    var p = currentParticipant();
    if (!p) return;
    var store = p.role === 'principal' ? 'principalSignups' : 'teacherSignups';
    MDS.update(store, function (map) {
      var next = Object.assign({}, map || {});
      next[id] = Object.assign({}, next[id] || {}, data);
      return next;
    });
  }

  /* 当前参与者是否在某活动参赛范围内（由 scopeParticipants 派生，控制可见性与报名资格） */
  function participantInScope(act) {
    var p = currentParticipant();
    if (!p) return false;
    return scopeParticipants(act).some(function (x) { return x.name === p.name; });
  }

  /* 当前参与者是否参与某活动（已报名 或 已提交作品，作品按参与者姓名匹配） */
  function participantMyActivity(act) {
    if (participantSignupFor(act)) return true;
    var p = currentParticipant();
    if (!p) return false;
    return worksForActivityId(act.id).some(function (w) { return w.teacher === p.name; });
  }

  /* 当前教师（张慧）在某活动的参与状态（teacherSignups 按活动 id 键控；无则 null，PC 教师工作台专用） */
  function teacherSignupFor(act) {
    return (MDS.get('teacherSignups') || {})[act.id] || null;
  }

  /* 某活动张慧是否参与：已报名 或 提交过作品 */
  function isMyActivity(act) {
    if (teacherSignupFor(act)) return true;
    return worksForActivityId(act.id).some(function (w) { return w.teacher === TEACHER_NAME; });
  }

  /* 活动流程提示条：①查看 → ②报名 → ③上传 → ④结果 */
  function renderActivityFlowBar() {
    var steps = ['查看活动', '报名', '上传作品', '查看结果'];
    var html = '<div class="act-flow-bar">';
    steps.forEach(function (s, i) {
      html +=
        '<div class="act-flow-step"><span class="act-flow-no">' + (i + 1) + '</span><span class="act-flow-name">' + s + '</span></div>';
      if (i < steps.length - 1) html += '<span class="act-flow-arrow">›</span>';
    });
    html += '</div>';
    return html;
  }

  /* 活动卡片状态标签（教师视角：报名中 / 评审中 / 已出结果 / 已发布） */
  function activityStatusTag(a) {
    if (a.resultStatus === 'published' || a.resultStatus === 'archived') return '<span class="act-status st-done">已出结果</span>';
    if (a.stage === 'signup') return '<span class="act-status st-signup">报名中</span>';
    if (a.stage === 'review') return '<span class="act-status st-review">评审中</span>';
    return '<span class="act-status st-PUBLISHED">已发布</span>';
  }

  /* 活动卡片（参与者视角：教师/园长）：整体点击看详情，底部按状态给操作按钮 */
  function activityCardHtml(a) {
    var mine = participantSignupFor(a);
    var done = a.resultStatus === 'published' || a.resultStatus === 'archived';

    var ops = '';
    var myLine = '';
    if (done && participantMyActivity(a)) {
      // 已出结果且本人参与：查看结果
      ops = '<button type="button" class="mb-btn" style="height:34px;padding:0 18px;font-size:13px;" data-action="activity-result" data-id="' + a.id + '">查看结果</button>';
    } else if (a.stage === 'signup' && !mine) {
      // 报名中且未报名：报名
      ops = '<button type="button" class="mb-btn" style="height:34px;padding:0 18px;font-size:13px;" data-action="activity-signup" data-id="' + a.id + '">报名</button>';
    } else if (mine && !mine.workSubmitted) {
      // 已报名未上传：上传作品
      ops = '<button type="button" class="mb-btn" style="height:34px;padding:0 18px;font-size:13px;" data-action="upload-sheet" data-id="' + a.id + '">上传作品</button>';
    }
    // 我的参与信息行
    if (mine) {
      myLine = mine.workSubmitted
        ? '<div class="ac-my">我的作品：' + esc(mine.workTitle || '已提交') + '</div>'
        : '<div class="ac-my">已报名 · 待上传作品</div>';
    }

    return (
      '<div class="mb-activity-card" data-action="activity-detail" data-id="' + a.id + '">' +
      '<div class="ac-title">' + esc(a.title) + activityStatusTag(a) + '</div>' +
      '<div class="ac-desc">活动对象：' + esc(actScopeText(a)) + '</div>' +
      myLine +
      '<div class="ac-meta">' +
      '<span>报名：' + esc(a.signupStart || '—') + ' ~ ' + esc(a.signupEnd || '—') + '</span>' +
      ops +
      '</div>' +
      '</div>'
    );
  }

  /* 活动列表主渲染：按参与者视角分段（全部 / 待报名 / 进行中 / 已出结果），仅展示本人参赛范围内活动 */
  function renderMobileActivity() {
    var list = document.getElementById('activityList');
    if (!list) return;
    var flowBar = document.getElementById('actFlowBar');
    if (flowBar) flowBar.innerHTML = renderActivityFlowBar();
    // 仅展示已发布且当前参与者在参赛范围内的活动（教师/园长同理）
    var activities = (MDS.get('activities') || []).filter(function (a) {
      return a.status === 'PUBLISHED' && participantInScope(a);
    });

    var filtered = activities.filter(function (a) {
      var mine = participantSignupFor(a);
      switch (mobileActTab) {
        case 'signup':
          return a.stage === 'signup' && !mine;
        case 'doing':
          if (mine) return !(a.resultStatus === 'published' || a.resultStatus === 'archived');
          return a.stage === 'review' && participantMyActivity(a);
        case 'done':
          return (a.resultStatus === 'published' || a.resultStatus === 'archived') && participantMyActivity(a);
        default:
          return true;
      }
    });

    if (!filtered.length) {
      list.innerHTML = '<div class="mb-empty-tip">暂无活动</div>';
      return;
    }
    list.innerHTML = filtered.map(function (a) { return activityCardHtml(a); }).join('');
  }

  /* ═══════════════════════ 移动端：消息页（活动通知） ═══════════════════════ */

  /* 发送给当前教师（张慧）的活动通知列表（activityNotices 按活动分组，取 recipients 含本人） */
  function renderMobileNotice() {
    var root = document.getElementById('mobileNoticeList');
    if (!root) return;
    var p = currentParticipant();
    var activityNotices = MDS.get('activityNotices') || {};
    var list = [];
    Object.keys(activityNotices).forEach(function (key) {
      (activityNotices[key] || []).forEach(function (n) {
        var me = (n.recipients || []).filter(function (r) { return p && r.name === p.name; })[0];
        if (!me) return;
        // 积分公告按 scheme{id} 键控（与活动解耦），普通通知按活动 id 键控
        var isScheme = key.indexOf('scheme') === 0;
        var title;
        if (isScheme) {
          var scheme = (MDS.get('scoreSchemes') || []).filter(function (x) { return String(x.id) === key.slice(6); })[0];
          title = scheme ? scheme.name : '积分方案';
        } else {
          var act = activityById(Number(key));
          title = act ? act.title : '未知活动';
        }
        list.push({
          actId: key,
          activityTitle: title,
          notice: n,
          read: me.read,
        });
      });
    });
    if (!list.length) {
      root.innerHTML = '<div class="mb-empty-tip">暂无活动消息</div>';
      return;
    }
    root.innerHTML = list.map(function (item) {
      // 积分公告：列表仅展示标题 + 正文摘要 + 「查看完整公告」入口，详情进入独立公告详情页
      var SEP = '━━━━━━━━━━━━';
      var raw = item.notice.content || '';
      var head = raw;
      var sepIdx = raw.indexOf(SEP);
      if (sepIdx >= 0) head = raw.slice(0, sepIdx);
      var isAnnounce = sepIdx >= 0;
      if (isAnnounce) {
        // 正文摘要：取首段（最多约 64 字）
        var brief = head.replace(/\s+/g, ' ').trim();
        if (brief.length > 64) brief = brief.slice(0, 64) + '…';
        return (
          '<div class="mb-list-item' + (item.read ? '' : ' is-unread') + '" data-action="open-announce-detail" data-activity="' + item.actId + '" data-notice="' + esc(item.notice.id) + '">' +
          '<div class="item-title">' + esc(item.notice.title) + '</div>' +
          '<div class="item-desc" style="margin-top:8px;">' + escBr(brief) + '</div>' +
          '<div style="margin-top:10px;padding-top:8px;border-top:1px solid var(--mb-border-divider,#f5f5f5);">' +
          '<div style="display:flex;align-items:center;color:#ff8a00;font-size:12px;font-weight:600;">查看完整公告 <span style="margin-left:2px;">›</span></div>' +
          '<div style="font-size:11px;color:var(--mb-text-muted,#9ca3af);margin-top:6px;">' + esc(item.activityTitle) + ' · ' + esc(item.notice.sendTime) + '</div>' +
          '</div>' +
          '</div>'
        );
      }
      // 普通活动通知：标题 + 内容 + 跳转活动详情
      return (
        '<div class="mb-list-item' + (item.read ? '' : ' is-unread') + '" data-action="open-activity-detail" data-id="' + item.actId + '">' +
        '<div class="item-title">' + esc(item.notice.title) + '</div>' +
        '<div class="item-desc" style="margin-top:8px;">' + escBr(item.notice.content) + '</div>' +
        '<div class="item-time">' + esc(item.activityTitle) + ' · ' + esc(item.notice.sendTime) + '</div>' +
        '</div>'
      );
    }).join('');
  }

  /* ═══════════════════════ 移动端：积分公告详情页 ═══════════════════════ */

  /* 独立公告详情页：公告标题/正文 + 积分获得情况汇总表格（数据来源发布时存的 scoreSummary） */
  function renderAnnounceDetail() {
    var root = document.getElementById('announceDetailRoot');
    if (!root) return;
    var actId = getParam('activityId');
    var noticeId = getParam('noticeId');
    // 积分公告键（scheme{id}）与活动解耦：按方案 id 解析标题，普通通知按活动 id 解析
    var isScheme = String(actId).indexOf('scheme') === 0;
    var scopeTitle = '';
    if (isScheme) {
      var scheme = (MDS.get('scoreSchemes') || []).filter(function (x) { return String(x.id) === String(actId).slice(6); })[0];
      scopeTitle = scheme ? scheme.name : '积分方案';
    } else {
      var act = activityById(Number(actId));
      scopeTitle = act ? act.title : '—';
    }
    var notices = (MDS.get('activityNotices') || {})[String(actId)] || [];
    var n = notices.filter(function (x) { return String(x.id) === String(noticeId); })[0];
    if (!n) {
      root.innerHTML = '<div class="mb-empty-tip">公告不存在或已删除</div>';
      return;
    }
    // 打开即标记当前参与对象已读
    var p = currentParticipant();
    if (p) {
      MDS.update('activityNotices', function (map) {
        var next = Object.assign({}, map || {});
        var key = String(actId);
        next[key] = (next[key] || []).map(function (x) {
          if (String(x.id) !== String(noticeId)) return x;
          var recipients = (x.recipients || []).map(function (r) {
            return r.name === p.name ? Object.assign({}, r, { read: true, readTime: nowTimeStr() }) : r;
          });
          return Object.assign({}, x, { recipients: recipients });
        });
        return next;
      });
    }
    // 公告正文：分隔线前为用户填写的内容
    var SEP = '━━━━━━━━━━━━';
    var raw = n.content || '';
    var head = raw;
    var sepIdx = raw.indexOf(SEP);
    if (sepIdx >= 0) head = raw.slice(0, sepIdx);
    var summary = n.scoreSummary || null;

    var medalMarks = ['🥇', '🥈', '🥉'];
    var html = '';
    // 公告正文卡
    html += '<div class="mb-card" style="margin-top:12px;padding:16px;">';
    html += '<div style="font-size:16px;font-weight:700;color:#1f2937;line-height:1.5;">' + esc(n.title) + '</div>';
    html += '<div style="font-size:12px;color:var(--mb-text-muted,#9ca3af);margin-top:8px;padding-bottom:10px;border-bottom:1px solid var(--mb-border-light,#e5e7eb);">' +
      esc(scopeTitle) + ' · ' + esc(n.sender || '管理员') + ' · ' + esc(n.sendTime) + '</div>';
    html += '<div style="font-size:14px;color:#1f2937;line-height:1.8;margin-top:12px;">' + escBr(head) + '</div>';
    html += '</div>';
    // 积分汇总卡
    html += '<div class="mb-section-title" style="margin-top:16px;"><span class="title">积分获得情况汇总</span>' +
      (summary ? '<span class="subtitle">' + esc(summary.schemeName) + '</span>' : '') + '</div>';
    html += '<div class="mb-card" style="padding:2px 14px 6px;">';
    if (summary && summary.rows && summary.rows.length) {
      html += '<div style="font-size:12px;color:var(--mb-text-secondary,#6b7280);padding:10px 0;border-bottom:1px solid var(--mb-border-light,#e5e7eb);">积分周期：' +
        esc(summary.cycleStart || '—') + ' ~ ' + esc(summary.cycleEnd || '—') + ' · 参与对象 ' + summary.rows.length + ' 名</div>';
      html += '<div style="padding:2px 0;">' + summary.rows.map(function (r) {
        var mark = r.totalRank <= 3 ? medalMarks[r.totalRank - 1] + ' ' : '';
        var isTop = r.totalRank <= 3;
        var nameCls = 'style="font-size:14px;color:' + (isTop ? '#ff8a00' : 'var(--mb-text-primary,#1f2937)') + ';' + (isTop ? 'font-weight:600;' : '') + '"';
        return (
          // 移动端双行布局：第一行 姓名/班级/名次排位，第二行 总积分/奖金，避免窄屏拥挤
          '<div style="padding:9px 0;border-bottom:1px solid var(--mb-border-divider,#f5f5f5);">' +
          '<div style="display:flex;align-items:center;gap:8px;">' +
          '<span ' + nameCls + '>' + mark + esc(r.name) + '</span>' +
          '<span style="font-size:12px;color:var(--mb-text-muted,#9ca3af);">' + esc(r.className) + '</span>' +
          '<span style="margin-left:auto;font-size:12px;color:var(--mb-text-secondary,#6b7280);">第 ' + r.totalRank + ' 名 · 排位分 ' + r.rankPoints + '</span>' +
          '</div>' +
          '<div style="display:flex;align-items:baseline;gap:8px;margin-top:6px;padding-left:20px;">' +
          '<span style="font-size:12px;color:var(--mb-text-secondary,#6b7280);">总积分</span>' +
          '<span style="font-size:16px;font-weight:700;color:var(--mb-text-primary,#1f2937);">' + r.total + '<span style="font-size:11px;font-weight:400;color:var(--mb-text-muted,#9ca3af);"> 分</span></span>' +
          '<span style="margin-left:auto;font-size:13px;color:#ff8a00;font-weight:600;">奖金 ¥' + r.bonus + '</span>' +
          '</div>' +
          '</div>'
        );
      }).join('') + '</div>';
    } else {
      html += '<div class="mb-empty-tip" style="padding:20px 0;">暂无积分明细</div>';
    }
    html += '</div>';
    root.innerHTML = html;
  }

  /* ═══════════════════════ 移动端：活动详情页 ═══════════════════════ */

  /* 活动详情页：活动信息卡 + 底部报名操作 */
  function renderActivityDetail() {
    var root = document.getElementById('activityDetailRoot');
    if (!root) return;
    var id = Number(getParam('activityId') || getParam('id'));
    var act = activityById(id);
    if (!act) {
      root.innerHTML = '<div class="mb-empty-tip">活动不存在</div>';
      return;
    }
    var mine = participantSignupFor(act);
    var done = act.resultStatus === 'published' || act.resultStatus === 'archived';
    var awards = (act.awards || []).map(function (aw) { return aw.name + '×' + aw.count; }).join(' / ');
    var statusText = done ? '已出结果' : act.stage === 'signup' ? '报名中' : act.stage === 'review' ? '评审中' : '已发布';
    var statusCls = done ? 'st-done' : act.stage === 'signup' ? 'st-signup' : act.stage === 'review' ? 'st-review' : 'st-PUBLISHED';

    var html = '';
    // 活动信息卡
    html += '<div class="mb-card" style="margin-top:12px;padding:16px;">';
    html += '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">' +
      '<span style="font-size:17px;font-weight:700;color:#1f2937;">' + esc(act.title) + '</span>' +
      '<span class="act-status ' + statusCls + '">' + statusText + '</span>' +
      '</div>';
    html += '<div style="font-size:12px;color:#9ca3af;margin-top:6px;">' + esc(act.type) + '</div>';
    html += '<div style="font-size:13px;color:#6b7280;margin-top:12px;line-height:1.7;">' + esc(act.desc || '—') + '</div>';
    html += '<div class="act-detail-rows">';
    html += '<div class="adr"><span class="label">报名时间</span><span class="value">' + esc(act.signupStart || '—') + ' ~ ' + esc(act.signupEnd || '—') + '</span></div>';
    html += '<div class="adr"><span class="label">活动对象</span><span class="value">' + esc(actScopeText(act)) + '</span></div>';
    html += '<div class="adr"><span class="label">奖项设置</span><span class="value">' + esc(awards || '—') + '</span></div>';
    html += '</div>';
    html += '</div>';

    // 底部操作区（非参赛范围则禁止报名）
    var btn = '';
    if (!participantInScope(act)) {
      btn = '<button type="button" class="mb-btn act-detail-btn" disabled>非参赛对象</button>';
    } else if (done && participantMyActivity(act)) {
      btn = '<button type="button" class="mb-btn act-detail-btn" disabled>已出结果</button>';
    } else if (act.stage === 'signup' && !mine) {
      btn = '<button type="button" class="mb-btn act-detail-btn act-detail-primary" data-action="activity-detail-signup" data-id="' + act.id + '">立即报名</button>';
    } else if (mine && !mine.workSubmitted) {
      btn = '<button type="button" class="mb-btn act-detail-btn" disabled>已报名 · 待上传作品</button>';
    } else {
      btn = '<button type="button" class="mb-btn act-detail-btn" disabled>已提交作品</button>';
    }
    html += '<div class="act-detail-footer">' + btn + '</div>';

    root.innerHTML = html;
  }

  /* 活动详情弹层：说明 + 时间 + 格式 + 对象 + 奖项 */
  function openActivityDetail(act) {
    var title = document.getElementById('activityDetailTitle');
    if (title) title.textContent = act.title;
    var body = document.getElementById('activityDetailBody');
    if (body) {
      var awards = (act.awards || []).map(function (aw) { return aw.name + '×' + aw.count; }).join(' / ');
      body.innerHTML =
        '<div class="sheet-card">' +
        '<div class="sheet-desc-label">活动说明</div>' +
        '<div class="sheet-desc">' + esc(act.desc || '—') + '</div>' +
        '<div class="sub-row"><span class="label">报名时间</span><span class="value">' + esc(act.signupStart || '—') + ' ~ ' + esc(act.signupEnd || '—') + '</span></div>' +
        '<div class="sub-row"><span class="label">作品格式</span><span class="value">' + esc(act.format || '—') + '</span></div>' +
        '<div class="sub-row"><span class="label">活动对象</span><span class="value">' + esc(actScopeText(act)) + '</span></div>' +
        '<div class="sub-row"><span class="label">奖项设置</span><span class="value">' + esc(awards || '—') + '</span></div>' +
        '</div>';
    }
    Proto.openDialog('activitySheet');
  }

  /* 结果弹层：展示当前教师（张慧）的名次/奖项/评分 + 电子奖状（管理端生成后） */
  function openMyResult(act) {
    var title = document.getElementById('resultTitle');
    if (title) title.textContent = '「' + act.title + '」获奖公示';
    var body = document.getElementById('resultBody');
    if (body) {
      // 当前参与者（教师/园长）的获奖结果 + 全员得奖报表（完整获奖名单公示）
      var p = currentParticipant();
      var meName = p ? p.name : '';
      var item = meName ? buildArchiveItems(act).filter(function (it) { return it.s.name === meName; })[0] : null;
      var html = '';
      if (!item) {
        html = '<div class="mb-empty-tip">未参与该活动</div>';
      } else if (!item.w) {
        html = '<div class="mb-empty-tip">未提交作品</div>';
      } else {
        html += '<div class="result-hero">' +
          '<div class="result-award">' + esc(item.awardName || '参与奖') + '</div>' +
          '<div class="result-rank">' + (item.rank != null ? '第 ' + item.rank + ' 名' : '未获奖') + '</div>' +
          '</div>';
        html += '<div class="sheet-card" style="margin-top:12px;">';
        html += '<div class="sub-row"><span class="label">作品</span><span class="value">' + esc(item.w.title) + '</span></div>';
        if (item.score != null) {
          html += '<div class="sub-row"><span class="label">综合评分</span><span class="value">' + item.score + '</span></div>';
        }
        html += '<div class="sub-row"><span class="label">奖项等级</span><span class="value">' + esc(item.awardName || '—') + '</span></div>';
        html += '</div>';
        var certStatus = ((MDS.get('certStatus') || {})[act.id]) || {};
        if (p && certStatus[p.name]) {
          var tpl = certTemplateById(act.certTemplateId);
          html += '<div class="cert-card" style="margin-top:12px;">' + buildCertPreviewHtml(tpl, certVarMap(act, {
            name: item.s.name,
            className: item.s.className,
            kindergarten: item.s.kindergarten,
            rank: item.rank,
            awardName: item.awardName,
          })) + '</div>';
        } else {
          html += '<div style="margin-top:12px;font-size:12px;color:#9ca3af;text-align:center;">电子奖状由管理端发布后生成</div>';
        }
      }
      // 全员得奖报表：公示完整获奖名单（含未获奖，本人行高亮）
      html += resultFullTableHtml(act, meName);
      body.innerHTML = html;
    }
    Proto.openDialog('resultSheet');
  }

  /* 全员得奖报表：活动结果发布后，参赛者可查看完整获奖名单（含未获奖，本人行高亮） */
  function resultFullTableHtml(act, meName) {
    var items = buildArchiveItems(act);
    // 有名次者按名次在前，未获奖（无评分/名次）排后
    var ranked = items.filter(function (it) { return it.rank !== null; });
    var unranked = items.filter(function (it) { return it.rank === null; });
    var rows = ranked.concat(unranked).map(function (it) {
      var isMe = it.s.name === meName;
      var cls = (it.rank === null ? 'result-row-nonwin ' : '') + (isMe ? 'result-row-me' : '');
      var rankCell = it.rank !== null ? '<strong>' + it.rank + '</strong>' : '<span style="color:#c0c4cc;">—</span>';
      var scoreCell = it.score !== null ? it.score : '<span style="color:#c0c4cc;">—</span>';
      var awardCell = it.awardName
        ? '<span class="status-tag status-primary">' + esc(it.awardName) + '</span>'
        : '<span style="color:#c0c4cc;">未获奖</span>';
      return (
        '<tr class="' + cls + '">' +
        '<td>' + rankCell + '</td>' +
        '<td>' + (isMe ? '<strong>' + esc(it.s.name) + '</strong><span class="result-me-tag">我</span>' : esc(it.s.name)) + '</td>' +
        '<td>' + esc(it.s.kindergarten) + '</td>' +
        '<td>' + scoreCell + '</td>' +
        '<td>' + awardCell + '</td>' +
        '</tr>'
      );
    }).join('');
    return (
      '<div class="result-full-block" style="margin-top:16px;">' +
      '<div class="result-full-title">🏆 全员得奖报表</div>' +
      '<div style="font-size:12px;color:#9ca3af;margin:6px 0 10px;">共 ' + items.length + ' 位参赛者，完整获奖名单公示如下</div>' +
      '<table class="result-full-table">' +
      '<thead><tr><th>名次</th><th>姓名</th><th>幼儿园</th><th>综合评分</th><th>奖项</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table>' +
      '</div>'
    );
  }

  /* ═══════════════════════ 移动端：排行榜 ═══════════════════════ */

  /* ═══════════════════════ 移动端：我的统计（KPI + 4 维度 ECharts 图表） ═══════════════════════ */

  var mobileStatECharts = {}; // 移动端 ECharts 实例注册表（dim → instance）

  /* 数据总览 KPI 卡（2 列网格） */
  function renderMobileKpi(meRow) {
    var s = MDS.get('teacherScores') || {};
    var d = s.duration || {};
    var cd = s.conversionDetail || {};
    var me = meRow || null;
    var interGap = s.interaction.rank === 1 ? '已领先' : '距上一名 ' + s.interaction.gap + ' 次';
    var cards = [
      { icon: '🏆', title: '总积分', value: me ? me.totalPoints : 0, unit: '分', sub: '本园第 ' + (me ? me.totalRank : '-') + ' 名' },
      { icon: '⚙️', title: '平台使用', value: s.usage.total, unit: '次', sub: '今日 +' + s.usage.today + ' · 第 ' + s.usage.rank + ' 名' },
      { icon: '⏱️', title: '使用时长', value: fmtMinutes(d.total), unit: '', sub: '今日 ' + fmtMinutes(d.today) },
      { icon: '💬', title: '家园互动', value: s.interaction.total, unit: '次', sub: '今日 +' + s.interaction.today + ' · ' + interGap },
      { icon: '👪', title: '会员转化', value: cd.registered + cd.members, unit: '人', sub: '注册 ' + cd.registered + ' · 会员 ' + cd.members },
    ];
    return (
      '<div class="mb-stat-kpi-grid">' +
      cards.map(function (c) {
        return (
          '<div class="mb-stat-kpi-card">' +
          '<div class="kpi-title"><span>' + c.icon + '</span>' + esc(c.title) + '</div>' +
          '<div class="kpi-value">' + c.value + (c.unit ? '<span class="kpi-unit">' + esc(c.unit) + '</span>' : '') + '</div>' +
          '<div class="kpi-sub">' + c.sub + '</div>' +
          '</div>'
        );
      }).join('') +
      '</div>' +
      '<div class="mb-stat-update">数据更新于 ' + RANK_UPDATE_TIME + '（精确到分钟）</div>'
    );
  }

  /* 单个维度面板（摘要 + 筛选 + ECharts 图表容器；摘要/筛选复用 PC 端样式类） */
  function renderMobileStatDimPanel(dim) {
    var s = MDS.get('teacherScores') || {};
    var meta = STAT_DIM_META[dim] || [dim, ''];
    return (
      statSummaryRow(dim, s) +
      statFilterBar(dim) +
      '<div class="mb-chart-box">' +
      '<div class="mb-chart-title">' + esc(meta[0]) + '</div>' +
      '<div class="mb-chart-desc">' + esc(meta[1]) + '</div>' +
      '<div class="mb-chart-echarts" id="mobileStatChart-' + dim + '"></div>' +
      '</div>'
    );
  }

  /* 渲染 4 个维度 Tab 面板 */
  function renderMobileStatDim() {
    var panel = document.getElementById('mobileStatDimPanel');
    if (!panel) return;
    panel.innerHTML = STAT_DIMS.map(function (d, i) {
      return '<div id="mobileStatPanel-' + d.key + '"' + (i === 0 ? '' : ' hidden') + '>' + renderMobileStatDimPanel(d.key) + '</div>';
    }).join('');
  }

  /* 初始化/重建移动端 4 个维度图表实例 */
  function initMobileStatECharts() {
    if (typeof echarts === 'undefined') return;
    STAT_DIMS.forEach(function (d) {
      if (mobileStatECharts[d.key]) { mobileStatECharts[d.key].dispose(); mobileStatECharts[d.key] = null; }
      var el = document.getElementById('mobileStatChart-' + d.key);
      if (el) {
        mobileStatECharts[d.key] = echarts.init(el);
        mobileStatECharts[d.key].setOption(buildDimChartOption(d.key), true);
      }
    });
  }

  /* 移动端「我的统计」入口：KPI + 4 维度 Tab + ECharts */
  function renderMobileStat() {
    var root = document.getElementById('statRoot');
    if (!root) return;
    var scoreData = buildRankScoreTable();
    var meRow = null;
    scoreData.rows.forEach(function (r) { if (r.isMe) meRow = r; });
    root.innerHTML =
      renderMobileKpi(meRow) +
      '<div class="mb-section-title"><span class="title">我的统计详情</span><span class="subtitle">切换维度查看趋势</span></div>' +
      '<div class="mb-card" style="padding:12px 14px;">' +
      '<div class="mb-filter-tabs">' +
      STAT_DIMS.map(function (d, i) {
        return '<span class="mb-filter-tab' + (i === 0 ? ' is-active' : '') + '" data-action="stat-dim-switch" data-tab-group="mobileStatDim" data-tab-value="' + d.key + '">' + d.name + '</span>';
      }).join('') +
      '</div>' +
      '<div id="mobileStatDimPanel"></div>' +
      '</div>';
    renderMobileStatDim();
    initMobileStatECharts();
  }

  /* ═══════════════════════ 移动端：我的排位分 + 综合榜卡片 + 家长进度 ═══════════════════════ */

  /* 移动端排位分规则说明（对齐 PC rank-rule-note；补充榜单每项「原始值 · 单项排名 · 排位分」字段含义） */
  function mobileRankRuleNote(N) {
    return (
      '<div class="mb-rank-rule-note">' +
      '<b>排位分规则：</b>全园在职参与活动教师共 ' + N + ' 名，各维度按原始数值从高到低排名，第 1 名得 ' + N + ' 分、第 2 名得 ' + (N - 1) + ' 分……第 ' + N + ' 名得 1 分；并列名次得相同排位分、后续名次顺延。' +
      '榜单每项显示「原始值 · 单项排名 · 排位分」，总分 = 平台使用 + 家园互动 + 外部推广 + 会员转化 四项排位分之和。' +
      '</div>'
    );
  }

  function renderMobileRankScore() {
    var root = document.getElementById('rankScoreRoot');
    if (!root) return;
    var data = buildRankScoreTable();
    var me = null;
    data.rows.forEach(function (r) { if (r.isMe) me = r; });

    var html = '';
    // 我的排位分
    html += '<div class="mb-section-title"><span class="title">我的排位分</span><span class="subtitle">四项排位分之和</span></div>';
    if (me) {
      html += '<div class="mb-card" style="padding:14px;">';
      html += '<div class="mb-score-grid">';
      data.dims.forEach(function (d) {
        var cell = me[d.key];
        html += '<div class="mb-score-cell"><div class="sc-name">' + esc(d.name) + '</div><div class="sc-value">' + cell.score + '</div><div class="sc-meta">第 ' + cell.rank + ' 名 · ' + cell.points + ' 分</div></div>';
      });
      html += '</div>';
      html += '<div class="mb-score-total"><span>总积分 <b>' + me.totalPoints + '</b> 分 · 本园第 <b>' + me.totalRank + '</b> 名</span><span class="trend-hint">↑ 上升 1 位</span></div>';
      html += '</div>';
    }

    // 综合榜卡片（tab 切换：综合榜 + 4 单项榜）
    html += '<div class="mb-section-title"><span class="title">全园 TOP10 综合榜</span><span class="subtitle">四项排位分合计 · 点击切换单项榜</span></div>';
    html += '<div class="mb-card" style="padding:4px 14px;">';
    html += mobileRankTabs('mobileRankTabs', 'total');
    var totalCardsHtml = '';
    data.rows.forEach(function (r) {
      var dimsHtml = data.dims.map(function (d) {
        var cell = r[d.key];
        return '<span class="rsc-dim"><span class="rsc-dim-name">' + esc(d.name) + '</span><span class="rsc-dim-score">' + cell.score + '</span><span class="rsc-dim-rank">第 ' + cell.rank + ' 名</span><span class="rsc-dim-points">' + cell.points + ' 分</span></span>';
      }).join('');
      totalCardsHtml +=
        '<div class="mb-rank-score-card' + (r.isMe ? ' is-me' : '') + '">' +
        '<div class="rsc-top">' +
        '<span class="rsc-rank' + (r.totalRank <= 3 ? ' top' : '') + '">' + r.totalRank + '</span>' +
        '<span class="rsc-name">' + esc(r.name) + (r.isMe ? '<span class="me-tag">我</span>' : '') + '</span>' +
        '<span class="rsc-class">' + esc(r.className) + '</span>' +
        '<span class="rsc-total">' + r.totalPoints + ' 分</span>' +
        '</div>' +
        '<div class="rsc-dims">' + dimsHtml + '</div>' +
        '</div>';
    });
    html += rankPanel('mobileRankTabs', 'total', totalCardsHtml, true);
    html += RANK_DIMS.map(function (d) {
      return rankPanel('mobileRankTabs', d.key, singleDimCardsHtml(data, d), false);
    }).join('');
    html += '</div>';

    // 排位分规则说明
    html += mobileRankRuleNote(data.N);

    root.innerHTML = html;
  }

  /* ═══════════════════════ 移动端：我的 ═══════════════════════
     注：积分重构后已移除「我的奖金」模块（奖金管理已移除），消息中心保留 */

  var noticeFilter = 'all';

  function renderMobileMine() {
    var p = MDS.get('userProfile');
    var avatar = document.getElementById('mineAvatar');
    var name = document.getElementById('mineName');
    var roleLine = document.getElementById('mineRole');
    if (avatar) avatar.textContent = p.avatar;
    if (name) name.textContent = p.name;
    if (roleLine) roleLine.textContent = p.roleLine;

    renderNoticeList();
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

  /* ═══════════════════════ 教师 PC 个人工作台（teacher.html） ═══════════════════════ */

  /* 活动状态标签（PC 版：复用 status-tag 状态色，区别于移动端 act-status） */
  function teacherActStatusTag(a) {
    if (a.resultStatus === 'published' || a.resultStatus === 'archived') return '<span class="status-tag status-primary">已出结果</span>';
    if (a.stage === 'signup') return '<span class="status-tag status-warning">报名中</span>';
    if (a.stage === 'review') return '<span class="status-tag status-success">评审中</span>';
    return '<span class="status-tag">已发布</span>';
  }

  /* 教师 PC 活动中心：分段状态（all 全部 / signup 待报名 / doing 进行中 / done 已出结果） */
  var teacherActTab = 'all';

  /* 我的活动：按活动流程（查看 → 报名 → 上传 → 结果）分段展示，操作闭环 */
  function renderTeacherActivity(root) {
    var box = document.getElementById('teacherActivityRoot');
    if (!box) return;
    var activities = (MDS.get('activities') || []).filter(function (a) { return a.status === 'PUBLISHED'; });

    var filtered = activities.filter(function (a) {
      var mine = teacherSignupFor(a);
      var done = a.resultStatus === 'published' || a.resultStatus === 'archived';
      switch (teacherActTab) {
        case 'signup': return a.stage === 'signup' && !mine;
        case 'doing':
          if (mine) return !done;
          return a.stage === 'review' && isMyActivity(a);
        case 'done': return done && isMyActivity(a);
        default: return isMyActivity(a) || a.stage === 'signup';
      }
    });

    var tabs = [
      { key: 'all', name: '全部' },
      { key: 'signup', name: '待报名' },
      { key: 'doing', name: '进行中' },
      { key: 'done', name: '已出结果' },
    ];

    var html = '';
    // 分段 tab + 表格
    html += '<section class="pc-card">' +
      '<div class="card-head"><span class="card-title">我的活动</span><span class="table-count">共 ' + filtered.length + ' 个</span></div>' +
      '<div class="card-body" style="padding-bottom:0;">' +
      '<div class="pc-filter-tabs">';
    tabs.forEach(function (t) {
      html += '<span class="pc-filter-tab' + (teacherActTab === t.key ? ' is-active' : '') + '" data-action="teacher-act-tab" data-tab-value="' + t.key + '">' + t.name + '</span>';
    });
    html += '</div></div>';
    html += '<div class="card-body no-padding">';
    html += '<table class="pc-table"><thead><tr>' +
      '<th>活动名称</th><th>类型</th><th>报名时间</th><th>活动状态</th><th>我的参与</th><th>操作</th>' +
      '</tr></thead><tbody>';

    if (!filtered.length) {
      html += '<tr><td colspan="6" style="text-align:center;color:#909399;padding:40px 0;">暂无活动</td></tr>';
    } else {
      filtered.forEach(function (a) {
        var mine = teacherSignupFor(a);
        var done = a.resultStatus === 'published' || a.resultStatus === 'archived';
        var partCell = mine
          ? (mine.workSubmitted ? '<span class="status-tag status-success">已提交作品</span>' : '<span class="status-tag status-warning">已报名 · 待上传</span>')
          : '<span style="color:#c0c4cc;">未报名</span>';
        var ops = '';
        if (done && isMyActivity(a)) {
          ops = '<button type="button" class="pc-btn pc-btn-edit pc-btn-sm" data-action="teacher-result" data-id="' + a.id + '">查看结果</button>';
        } else if (a.stage === 'signup' && !mine) {
          ops = '<button type="button" class="pc-btn pc-btn-add pc-btn-sm" data-action="teacher-signup" data-id="' + a.id + '">报名</button>';
        } else if (mine && !mine.workSubmitted) {
          ops = '<button type="button" class="pc-btn pc-btn-edit pc-btn-sm" data-action="teacher-upload" data-id="' + a.id + '">上传作品</button>';
        } else {
          ops = '<span style="color:#c0c4cc;">—</span>';
        }
        html +=
          '<tr>' +
          '<td><strong>' + esc(a.title) + '</strong></td>' +
          '<td>' + esc(a.type) + '</td>' +
          '<td>' + esc(a.signupStart || '—') + ' ~ ' + esc(a.signupEnd || '—') + '</td>' +
          '<td>' + teacherActStatusTag(a) + '</td>' +
          '<td>' + partCell + '</td>' +
          '<td class="op-col">' + ops + '</td>' +
          '</tr>';
      });
    }
    html += '</tbody></table></div></section>';
    box.innerHTML = html;
  }

  /* PC 端「我的活动」结果弹窗：复用 buildArchiveItems 取本人评分/名次/奖项 + 全员得奖报表 */
  function openTeacherResult(act) {
    var title = document.getElementById('teacherResultTitle');
    if (title) title.textContent = '「' + act.title + '」获奖公示';
    var body = document.getElementById('teacherResultBody');
    if (body) {
      var item = buildArchiveItems(act).filter(function (it) { return it.s.name === TEACHER_NAME; })[0];
      var html = '';
      if (!item) {
        html = '<div class="pc-empty"><div class="empty-icon">📄</div><div>未参与该活动</div></div>';
      } else if (!item.w) {
        html = '<div class="pc-empty"><div class="empty-icon">📄</div><div>未提交作品</div></div>';
      } else {
        html += '<div class="teacher-result-hero">' +
          '<div class="award">' + esc(item.awardName || '参与奖') + '</div>' +
          '<div class="rank">' + (item.rank != null ? '第 ' + item.rank + ' 名' : '未获奖') + '</div>' +
          '</div>';
        html += '<table class="pc-table" style="margin-top:12px;"><tbody>';
        html += '<tr><td style="width:96px;color:#909399;">作品</td><td>' + esc(item.w.title) + '</td></tr>';
        if (item.score != null) {
          html += '<tr><td style="color:#909399;">综合评分</td><td><b>' + item.score + '</b></td></tr>';
        }
        html += '<tr><td style="color:#909399;">奖项等级</td><td>' + esc(item.awardName || '—') + '</td></tr>';
        html += '</tbody></table>';
      }
      // 全员得奖报表：公示完整获奖名单（含未获奖，本人行高亮）
      html += resultFullTableHtml(act, TEACHER_NAME);
      body.innerHTML = html;
    }
    Proto.openDialog('teacherResultDialog');
  }

  /* ═══════════════════════ 教师 PC 工作台：统计排行（需求 1-5） ═══════════════════════ */

  /* 排位分规则（需求 5）：第 1 名 N 分 … 第 N 名 1 分，并列同分、后续名次顺延。
     N 取全园在职教师数（teachers 中非离职者），实时获取，演示值为 9（孙悦离职不计）。 */
  function rankScoreN() {
    var teachers = MDS.get('teachers') || [];
    var active = teachers.filter(function (t) { return t.isActive !== false; }).length;
    return active || 1;
  }

  /* 数据更新时间（精确到分钟，演示固定值） */
  var RANK_UPDATE_TIME = '2026-08-11 09:32';

  /* 分钟 → 「X 小时 Y 分」 */
  function fmtMinutes(min) {
    var h = Math.floor(min / 60);
    var m = min % 60;
    return h + ' 小时 ' + m + ' 分';
  }

  /* 今日新增涨跌样式/文案（+n / -n / 持平） */
  function deltaClass(n) {
    return n > 0 ? 'up' : n < 0 ? 'down' : 'flat';
  }
  function deltaText(n) {
    if (n > 0) return '+' + n;
    if (n < 0) return String(n);
    return '持平';
  }

  /* 维度筛选状态（活动名称 / 时间范围，演示切换） */
  var STAT_DIMS = [
    { key: 'usage', name: '使用次数' },
    { key: 'duration', name: '使用时长' },
    { key: 'interaction', name: '互动频次' },
    { key: 'conversion', name: '会员转化' },
  ];
  var statFilterState = {};

  /* ── A. 数据总览 KPI 卡 ── */
  function kpiCard(title, icon, value, unit, subs) {
    return (
      '<div class="rank-kpi-card">' +
      '<div class="kpi-title"><span class="kpi-icon">' + icon + '</span>' + esc(title) + '</div>' +
      '<div class="kpi-value">' + value + (unit ? '<span class="kpi-unit">' + esc(unit) + '</span>' : '') + '</div>' +
      '<div class="kpi-sub">' + subs.map(function (x) { return '<span>' + x + '</span>'; }).join('') + '</div>' +
      '</div>'
    );
  }

  function renderTeacherStatOverview(meRow) {
    var s = MDS.get('teacherScores') || {};
    var d = s.duration || {};
    var cd = s.conversionDetail || {};
    var me = meRow || null;

    var interGap = s.interaction.rank === 1 ? '已领先' : '距上一名 ' + s.interaction.gap + ' 次';
    var cards = [
      kpiCard('总积分', '🏆', String(me ? me.totalPoints : 0), '分', [
        '本园第 <span class="rank-tag">' + (me ? me.totalRank : '-') + '</span> 名',
        '<span class="muted">四项排位分之和</span>',
      ]),
      kpiCard('平台使用次数', '⚙️', String(s.usage.total), '次', [
        '今日 <span class="up">+' + s.usage.today + '</span>',
        '本园第 <span class="rank-tag">' + s.usage.rank + '</span> 名',
        '<span class="muted">距上一名 ' + s.usage.gap + ' 次</span>',
      ]),
      kpiCard('使用总时长', '⏱️', fmtMinutes(d.total), '', [
        '今日 <b>' + fmtMinutes(d.today) + '</b>',
      ]),
      kpiCard('家园互动次数', '💬', String(s.interaction.total), '次', [
        '今日 <span class="up">+' + s.interaction.today + '</span>',
        '本园第 <span class="rank-tag">' + s.interaction.rank + '</span> 名',
        '<span class="muted">' + interGap + '</span>',
      ]),
      kpiCard('会员转化', '👪', String(cd.registered + cd.members), '人', [
        '注册 <span class="' + deltaClass(cd.registeredToday) + '">' + deltaText(cd.registeredToday) + '</span> · 会员 <span class="' + deltaClass(cd.membersToday) + '">' + deltaText(cd.membersToday) + '</span>',
        '本园第 <span class="rank-tag">' + s.conversion.rank + '</span> 名',
      ]),
    ];

    return (
      '<div class="rank-kpi-grid">' + cards.join('') + '</div>' +
      '<div class="rank-update-note">数据更新于 ' + RANK_UPDATE_TIME + '（精确到分钟）</div>'
    );
  }

  /* ── B. 我的统计详情（4 维度 Tab） ── */
  function sumItem(label, value) {
    return { label: label, value: value };
  }

  function statSummaryRow(dim, s) {
    var items = [];
    if (dim === 'usage') {
      items = [
        sumItem('累计总次数', s.usage.total + ' 次'),
        sumItem('今日新增', '<span class="up">+' + s.usage.today + '</span>'),
        sumItem('本园排名', '<span class="rank-tag">第 ' + s.usage.rank + ' 名</span>'),
        sumItem('距上一名', s.usage.gap + ' 次'),
      ];
    } else if (dim === 'duration') {
      var d = s.duration || {};
      items = [
        sumItem('累计总时长', fmtMinutes(d.total)),
        sumItem('今日时长', fmtMinutes(d.today)),
      ];
    } else if (dim === 'interaction') {
      items = [
        sumItem('累计互动次数', s.interaction.total + ' 次'),
        sumItem('今日新增', '<span class="up">+' + s.interaction.today + '</span>'),
        sumItem('本园排名', '<span class="rank-tag">第 ' + s.interaction.rank + ' 名</span>'),
        sumItem('距上一名', s.interaction.rank === 1 ? '已领先' : s.interaction.gap + ' 次'),
      ];
    } else if (dim === 'conversion') {
      var cd = s.conversionDetail || {};
      items = [
        sumItem('注册账号', cd.registered + ' 人'),
        sumItem('会员人数', cd.members + ' 人'),
        sumItem('合计人数', (cd.registered + cd.members) + ' 人'),
        sumItem('今日新增', '注册 <span class="' + deltaClass(cd.registeredToday) + '">' + deltaText(cd.registeredToday) + '</span> · 会员 <span class="' + deltaClass(cd.membersToday) + '">' + deltaText(cd.membersToday) + '</span>'),
      ];
    }
    items.push(sumItem('更新时间', RANK_UPDATE_TIME));
    return '<div class="stat-summary-row">' + items.map(function (it) {
      return '<span class="sum-item">' + it.label + ' <b>' + it.value + '</b></span>';
    }).join('') + '</div>';
  }

  /* 维度筛选条：使用次数/互动频次按「活动名称」，使用时长/会员转化按「时间范围」 */
  function statFilterBar(dim) {
    var isActivity = (dim === 'usage' || dim === 'interaction');
    var cur = statFilterState[dim] || (isActivity ? 'all' : '7d');
    var options = isActivity
      ? [{ v: 'all', t: '全部活动' }, { v: 'act8', t: '秋季家园共育案例评选' }, { v: 'act5', t: '亲子阅读打卡活动' }]
      : [{ v: '7d', t: '近 7 天' }, { v: '3d', t: '近 3 天' }];
    var opts = options.map(function (o) {
      return '<option value="' + o.v + '"' + (o.v === cur ? ' selected' : '') + '>' + esc(o.t) + '</option>';
    }).join('');
    return (
      '<div class="stat-filter-bar">' +
      '<span class="filter-label">' + (isActivity ? '筛选活动' : '筛选时间') + '</span>' +
      '<select class="filter-select" data-stat-filter data-dim="' + dim + '">' + opts + '</select>' +
      '</div>'
    );
  }

  /* 取当前维度趋势并按筛选切片：活动筛选→尾部 4 天；时间筛选→近 3 天 */
  function currentTrend(dim) {
    var s = MDS.get('teacherScores') || {};
    var trend = s[dim + 'Trend'] || [];
    var val = statFilterState[dim] || '';
    var days = 7;
    if (dim === 'usage' || dim === 'interaction') {
      days = (val === 'all' || val === '') ? 7 : 4;
    } else {
      days = val === '3d' ? 3 : 7;
    }
    return trend.slice(-days);
  }

  /* ═══ ECharts 图表（组合图表：堆叠柱 + 折线；折线图：多系列） ═══ */

  /* 折线图 option（本人/园内平均/当日第一 多系列） */
  function lineChartOption(labels, series, unit) {
    return {
      tooltip: { trigger: 'axis' },
      legend: { bottom: 0, icon: 'circle', itemWidth: 10, itemHeight: 10, textStyle: { color: '#606266' } },
      grid: { left: 46, right: 16, top: 20, bottom: 48, containLabel: false },
      xAxis: {
        type: 'category', boundaryGap: false, data: labels,
        axisLine: { lineStyle: { color: '#e5e7eb' } }, axisTick: { show: false },
        axisLabel: { color: '#909399' },
      },
      yAxis: {
        type: 'value', name: unit, nameTextStyle: { color: '#909399' },
        splitLine: { lineStyle: { color: '#ebeef5' } }, axisLabel: { color: '#909399' },
      },
      series: series.map(function (sr) {
        return {
          name: sr.name, type: 'line', smooth: true, symbol: 'circle', symbolSize: 6,
          data: sr.values, itemStyle: { color: sr.color }, lineStyle: { width: 2, color: sr.color },
        };
      }),
    };
  }

  /* 组合图表 option（并排柱 = 各分项左右两条柱 + 折线 = 合计），单 y 轴同量纲 */
  function comboChartOption(labels, barSeries, lineSeries, unit) {
    var series = barSeries.map(function (sr) {
      return { name: sr.name, type: 'bar', barMaxWidth: 24, data: sr.values, itemStyle: { color: sr.color } };
    });
    series.push({
      name: lineSeries.name, type: 'line', smooth: true, symbol: 'circle', symbolSize: 6, z: 3,
      data: lineSeries.values, itemStyle: { color: lineSeries.color }, lineStyle: { width: 2.5, color: lineSeries.color },
    });
    return {
      tooltip: { trigger: 'axis' },
      legend: { bottom: 0, icon: 'circle', itemWidth: 10, itemHeight: 10, textStyle: { color: '#606266' } },
      grid: { left: 46, right: 16, top: 20, bottom: 48, containLabel: false },
      xAxis: {
        type: 'category', data: labels,
        axisLine: { lineStyle: { color: '#e5e7eb' } }, axisTick: { show: false },
        axisLabel: { color: '#909399' },
      },
      yAxis: {
        type: 'value', name: unit, nameTextStyle: { color: '#909399' },
        splitLine: { lineStyle: { color: '#ebeef5' } }, axisLabel: { color: '#909399' },
      },
      series: series,
    };
  }

  /* 维度图表标题/描述映射 */
  var STAT_DIM_META = {
    usage: ['使用次数趋势', '横向为日期 · 纵向为总次数'],
    duration: ['每日使用时长与板块分布', '柱：家园互动 / 日常工作 · 折线：总时长'],
    interaction: ['互动次数趋势', '横向为日期 · 纵向为总次数'],
    conversion: ['注册 / 会员趋势与合计', '柱：注册账号 / 会员人数 · 折线：合计'],
  };

  /* 构建某维度的 ECharts option（读取当前筛选状态） */
  function buildDimChartOption(dim) {
    var trend = currentTrend(dim);
    if (dim === 'usage' || dim === 'interaction') {
      var series = [
        { name: '本人', color: '#ff8a00', values: trend.map(function (t) { return t.me; }) },
        { name: '园内平均', color: '#9ca3af', values: trend.map(function (t) { return t.avg; }) },
        { name: '当日第一', color: '#f9ca24', values: trend.map(function (t) { return t.top; }) },
      ];
      return lineChartOption(trend.map(function (t) { return t.date; }), series, '次');
    }
    if (dim === 'duration') {
      var barSeries2 = [
        { name: '家园互动', color: '#4facfe', values: trend.map(function (t) { return t.home; }) },
        { name: '日常工作', color: '#66cc99', values: trend.map(function (t) { return t.work; }) },
      ];
      var lineSeries2 = { name: '总时长', color: '#ff8a00', values: trend.map(function (t) { return t.home + t.work; }) };
      return comboChartOption(trend.map(function (t) { return t.date; }), barSeries2, lineSeries2, '分钟');
    }
    if (dim === 'conversion') {
      var barSeries4 = [
        { name: '注册账号', color: '#66cc99', values: trend.map(function (t) { return t.registered; }) },
        { name: '会员人数', color: '#4facfe', values: trend.map(function (t) { return t.members; }) },
      ];
      var lineSeries4 = { name: '合计', color: '#ff8a00', values: trend.map(function (t) { return t.registered + t.members; }) };
      return comboChartOption(trend.map(function (t) { return t.date; }), barSeries4, lineSeries4, '人');
    }
    return {};
  }

  /* 渲染单个维度面板（摘要 + 筛选 + 图表容器） */
  function renderStatDimPanel(dim) {
    var s = MDS.get('teacherScores') || {};
    var meta = STAT_DIM_META[dim] || [dim, ''];
    return (
      statSummaryRow(dim, s) +
      statFilterBar(dim) +
      '<div class="chart-box">' +
      '<div class="chart-title">' + esc(meta[0]) + '</div>' +
      '<div class="chart-desc">' + esc(meta[1]) + '</div>' +
      '<div class="chart-echarts" id="statChart-' + dim + '"></div>' +
      '</div>'
    );
  }

  /* 渲染 4 个维度 Tab 面板（初始仅第一个可见，切换由 stat-dim-switch 驱动） */
  function renderTeacherStatDim() {
    var panel = document.getElementById('teacherStatDimPanel');
    if (!panel) return;
    panel.innerHTML = STAT_DIMS.map(function (d, i) {
      return '<div id="statPanel-' + d.key + '"' + (i === 0 ? '' : ' hidden') + '>' + renderStatDimPanel(d.key) + '</div>';
    }).join('');
  }

  /* ECharts 实例注册表（dim → instance），重渲染前先 dispose */
  var statECharts = {};

  /* 初始化/重建 4 个维度图表实例 */
  function initStatECharts() {
    if (typeof echarts === 'undefined') return;
    STAT_DIMS.forEach(function (d) {
      if (statECharts[d.key]) { statECharts[d.key].dispose(); statECharts[d.key] = null; }
      var el = document.getElementById('statChart-' + d.key);
      if (el) {
        statECharts[d.key] = echarts.init(el);
        statECharts[d.key].setOption(buildDimChartOption(d.key), true);
      }
    });
  }

  /* ── C. 园内排名情况：我的排位分 + 综合榜（由 rankData 4 榜单推导排位分） ── */

  /* 排位分 4 项计分维度（综合榜 / 单项排行榜 tab 共用） */
  var RANK_DIMS = [
    { key: 'usage', name: '平台使用' },
    { key: 'interaction', name: '家园互动' },
    { key: 'promotion', name: '外部推广' },
    { key: 'conversion', name: '会员转化' },
  ];

  /* 排行榜 tab 页签（PC）：综合榜 + 4 单项榜 */
  function rankTabs(groupId, activeKey) {
    var tabs = [{ key: 'total', name: '综合榜' }].concat(RANK_DIMS);
    return (
      '<div class="rank-tabs-bar"><div class="pc-filter-tabs">' +
      tabs.map(function (t) {
        return '<span class="pc-filter-tab' + (t.key === activeKey ? ' is-active' : '') + '" data-action="rank-tab-switch" data-tab-group="' + groupId + '" data-tab-value="' + t.key + '">' + t.name + '</span>';
      }).join('') +
      '</div></div>'
    );
  }

  /* 排行榜 tab 页签（移动端）：综合榜 + 4 单项榜 */
  function mobileRankTabs(groupId, activeKey) {
    var tabs = [{ key: 'total', name: '综合榜' }].concat(RANK_DIMS);
    return (
      '<div class="mb-filter-tabs mb-rank-tabs">' +
      tabs.map(function (t) {
        return '<span class="mb-filter-tab' + (t.key === activeKey ? ' is-active' : '') + '" data-action="rank-tab-switch" data-tab-group="' + groupId + '" data-tab-value="' + t.key + '">' + t.name + '</span>';
      }).join('') +
      '</div>'
    );
  }

  /* 排行榜 tab 面板包装：data-rank-panel-group 关联 tab 组，data-rank-panel 标识当前单项（非激活隐藏） */
  function rankPanel(groupId, key, html, active) {
    return '<div data-rank-panel-group="' + groupId + '" data-rank-panel="' + key + '"' + (active ? '' : ' hidden') + '>' + html + '</div>';
  }

  /* 单项排行榜表格（PC）：某维度按单项排名升序；data = buildRankScoreTable 返回 */
  function singleDimTableHtml(data, dim, opts) {
    opts = opts || {};
    var rows = data.rows.slice().sort(function (a, b) { return a[dim.key].rank - b[dim.key].rank; });
    var rowsHtml = rows.map(function (r) {
      var cell = r[dim.key];
      return (
        '<tr class="' + (r.isMe ? 'is-me' : '') + '">' +
        '<td><span class="rank-cell' + (cell.rank <= 3 ? ' rank-top' : '') + '">第 ' + cell.rank + '</span></td>' +
        '<td>' + esc(r.name) + (r.isMe ? '<span class="me-tag">我</span>' : '') + '<div style="font-size:11px;color:#909399;">' + esc(r.className) + '</div></td>' +
        '<td><span class="score-cell">' + cell.score + '</span><span class="sub">分</span></td>' +
        '<td><span class="total-cell">' + cell.points + '</span><span class="sub">分</span></td>' +
        (opts.withAction ? '<td><span class="action-btn action-primary" data-action="rank-point-detail" data-teacher="' + esc(r.name) + '">查看明细</span></td>' : '') +
        '</tr>'
      );
    }).join('');
    return (
      '<table class="pc-table rank-score-table"><thead><tr>' +
      '<th>排名</th><th>姓名</th><th>' + esc(dim.name) + '得分</th><th>排位分</th>' +
      (opts.withAction ? '<th>操作</th>' : '') +
      '</tr></thead><tbody>' + rowsHtml + '</tbody></table>'
    );
  }

  /* 单项排行榜卡片（移动端）：某维度按单项排名升序 */
  function singleDimCardsHtml(data, dim) {
    var rows = data.rows.slice().sort(function (a, b) { return a[dim.key].rank - b[dim.key].rank; });
    return rows.map(function (r) {
      var cell = r[dim.key];
      return (
        '<div class="mb-rank-score-card' + (r.isMe ? ' is-me' : '') + '">' +
        '<div class="rsc-top">' +
        '<span class="rsc-rank' + (cell.rank <= 3 ? ' top' : '') + '">' + cell.rank + '</span>' +
        '<span class="rsc-name">' + esc(r.name) + (r.isMe ? '<span class="me-tag">我</span>' : '') + '</span>' +
        '<span class="rsc-class">' + esc(r.className) + '</span>' +
        '<span class="rsc-total">' + cell.score + ' 分</span>' +
        '</div>' +
        '<div class="rsc-dims">' +
        '<span class="rsc-dim"><span class="rsc-dim-name">' + esc(dim.name) + '</span><span class="rsc-dim-rank">单项第 ' + cell.rank + ' 名</span><span class="rsc-dim-points">排位分 ' + cell.points + ' 分</span></span>' +
        '</div>' +
        '</div>'
      );
    }).join('');
  }

  function buildRankScoreTable(rankData, N) {
    rankData = rankData || MDS.get('rankData') || {};
    N = N || rankScoreN();
    var dims = RANK_DIMS;
    // 各维度：教师名 → { score, rank }
    var dimMap = {};
    dims.forEach(function (d) {
      var map = {};
      (rankData[d.key] || []).forEach(function (it) { map[it.name] = { score: it.score, rank: it.rank }; });
      dimMap[d.key] = map;
    });
    var rows = (rankData.total || []).map(function (t) {
      var r = { name: t.name, className: t.className, isMe: t.isMe };
      var totalPoints = 0;
      dims.forEach(function (d) {
        var m = dimMap[d.key][t.name] || { score: 0, rank: N };
        var p = Math.max(1, N - m.rank + 1);
        r[d.key] = { score: m.score, rank: m.rank, points: p };
        totalPoints += p;
      });
      r.totalPoints = totalPoints;
      return r;
    });
    // 总排名：总得分降序，并列同分顺延
    rows.sort(function (a, b) { return b.totalPoints - a.totalPoints; });
    var rank = 0, prev = null;
    rows.forEach(function (r, i) {
      if (r.totalPoints !== prev) { rank = i + 1; prev = r.totalPoints; }
      r.totalRank = rank;
    });
    return { dims: dims, rows: rows, N: N };
  }

  function renderRankScoreSection(data, meRow) {
    var N = data.N;
    var me = meRow || null;

    // 我的排位分
    var myHtml = '';
    if (me) {
      var dimCards = data.dims.map(function (d) {
        var cell = me[d.key];
        return (
          '<div class="score-dim-card">' +
          '<div class="sd-name">' + esc(d.name) + '</div>' +
          '<div class="sd-value">' + cell.score + '</div>' +
          '<div class="sd-meta">单项排名 <span class="rank-tag">第 ' + cell.rank + ' 名</span><br>排位分 <span class="point">' + cell.points + ' 分</span></div>' +
          '</div>'
        );
      }).join('');
      myHtml =
        '<div class="score-dim-grid">' + dimCards + '</div>' +
        '<div class="score-total-bar">' +
        '<div class="st-left"><div class="st-label">总积分</div><div class="st-value">' + me.totalPoints + '<span class="unit">分</span></div></div>' +
        '<div class="st-right">总积分园内排名 <b>第 ' + me.totalRank + ' 名</b><br><span class="trend-hint">↑ 综合排名上升 1 位</span></div>' +
        '</div>';
    }

    // 综合榜表格
    var tableRows = data.rows.map(function (r) {
      var dimCells = data.dims.map(function (d) {
        var cell = r[d.key];
        return '<td><span class="score-cell">' + cell.score + '</span><span class="sub">分</span> / <span class="rank-cell' + (cell.rank <= 3 ? ' rank-top' : '') + '">第 ' + cell.rank + '</span></td>';
      }).join('');
      return (
        '<tr class="' + (r.isMe ? 'is-me' : '') + '">' +
        '<td>' + esc(r.name) + (r.isMe ? '<span class="me-tag">我</span>' : '') + '<div style="font-size:11px;color:#909399;">' + esc(r.className) + '</div></td>' +
        dimCells +
        '<td><span class="total-cell">' + r.totalPoints + '</span><span class="sub">分</span></td>' +
        '<td><span class="rank-cell' + (r.totalRank <= 3 ? ' rank-top' : '') + '">第 ' + r.totalRank + '</span></td>' +
        '</tr>'
      );
    }).join('');

    var tableHtml =
      '<table class="pc-table rank-score-table"><thead><tr>' +
      '<th>姓名</th>' +
      data.dims.map(function (d) {
        return '<th>' + esc(d.name) + '<br><span style="font-weight:400;font-size:11px;color:#909399;">得分 / 排名</span></th>';
      }).join('') +
      '<th>总得分</th><th>总排名</th>' +
      '</tr></thead><tbody>' + tableRows + '</tbody></table>';

    var ruleNote =
      '<div class="rank-rule-note">' +
      '排位分规则：全园在职参与活动老师共 <b>' + N + '</b> 名，单维度按数值从高到低倒序排名，第 1 名得 ' + N + ' 分、第 2 名得 ' + (N - 1) + ' 分……第 ' + N + ' 名得 1 分；并列名次得相同排位分、后续名次顺延。总积分 = 平台使用 + 家园互动 + 外部推广 + 会员转化 四项排位分之和。' +
      '</div>';

    return (
      '<section class="pc-card">' +
      '<div class="card-head"><span class="card-title">我的排位分</span><span class="table-count">数据更新于 ' + RANK_UPDATE_TIME + '</span></div>' +
      '<div class="card-body">' + myHtml + '</div>' +
      '</section>' +
      '<section class="pc-card">' +
      '<div class="card-head"><span class="card-title">全园 TOP10 综合榜</span><span class="table-count">四项排位分合计 · 本人行高亮</span></div>' +
      '<div class="card-body no-padding">' +
      rankTabs('teacherRankTabs', 'total') +
      rankPanel('teacherRankTabs', 'total', tableHtml, true) +
      RANK_DIMS.map(function (d) {
        return rankPanel('teacherRankTabs', d.key, singleDimTableHtml(data, d), false);
      }).join('') +
      '</div>' +
      '</section>' +
      ruleNote
    );
  }

  /* 统计排行页入口：数据总览 + 维度详情 + 园内排名 */
  function renderTeacherRank(root) {
    var box = document.getElementById('teacherRankRoot');
    if (!box) return;
    var scoreData = buildRankScoreTable();
    var meRow = null;
    scoreData.rows.forEach(function (r) { if (r.isMe) meRow = r; });
    box.innerHTML =
      renderTeacherStatOverview(meRow) +
      '<section class="pc-card">' +
      '<div class="card-head"><span class="card-title">我的统计详情</span><span class="table-count">切换维度查看趋势与时间分布</span></div>' +
      '<div class="card-body">' +
      '<div class="pc-filter-tabs">' +
      STAT_DIMS.map(function (d, i) {
        return '<span class="pc-filter-tab' + (i === 0 ? ' is-active' : '') + '" data-action="stat-dim-switch" data-tab-group="teacherStatDim" data-tab-value="' + d.key + '">' + d.name + '</span>';
      }).join('') +
      '</div>' +
      '<div id="teacherStatDimPanel"></div>' +
      '</div></section>' +
      renderRankScoreSection(scoreData, meRow);
    renderTeacherStatDim();
    initStatECharts();
  }

  /* 维度 Tab 切换：高亮 + 面板显隐 + 可见图表 resize（隐藏容器下 ECharts 尺寸为 0）
     PC（teacherStatDim / statPanel-）与移动端（mobileStatDim / mobileStatPanel-）共用 */
  Proto.registerAction('stat-dim-switch', function (el) {
    var value = el.getAttribute('data-tab-value');
    var group = el.getAttribute('data-tab-group');
    document.querySelectorAll('[data-tab-group="' + group + '"]').forEach(function (s) {
      s.classList.toggle('is-active', s.getAttribute('data-tab-value') === value);
    });
    var prefix = group === 'mobileStatDim' ? 'mobileStatPanel-' : 'statPanel-';
    STAT_DIMS.forEach(function (d) {
      var p = document.getElementById(prefix + d.key);
      if (p) p.hidden = (d.key !== value);
    });
    setTimeout(function () {
      var reg = group === 'mobileStatDim' ? mobileStatECharts : statECharts;
      if (reg[value]) reg[value].resize();
    }, 0);
  });

  /* 排行榜 tab 切换：综合榜 / 单项榜（PC 与移动端共用），高亮当前页签 + 面板显隐 */
  Proto.registerAction('rank-tab-switch', function (el) {
    var value = el.getAttribute('data-tab-value');
    var group = el.getAttribute('data-tab-group');
    document.querySelectorAll('[data-tab-group="' + group + '"]').forEach(function (s) {
      s.classList.toggle('is-active', s.getAttribute('data-tab-value') === value);
    });
    document.querySelectorAll('[data-rank-panel-group="' + group + '"]').forEach(function (p) {
      p.hidden = p.getAttribute('data-rank-panel') !== value;
    });
  });

  /* 下拉 change 事件委托（data-action 为 click 委托，不适用于下拉）：
     ① 切换园（管理员端园内排行榜）；② 维度筛选（活动/时间），仅 setOption 重绘该维度图表 */
  document.addEventListener('change', function (e) {
    var el = e && e.target;
    if (!el || !el.getAttribute) return;
    // 切换园
    if (el.getAttribute('data-garden-filter') !== null) {
      gardenFilter = el.value;
      renderRankGarden();
      return;
    }
    // 维度筛选
    if (el.getAttribute('data-stat-filter') === null) return;
    var dim = el.getAttribute('data-dim');
    statFilterState[dim] = el.value;
    var opt = buildDimChartOption(dim);
    if (statECharts[dim]) statECharts[dim].setOption(opt, true);
    if (mobileStatECharts[dim]) mobileStatECharts[dim].setOption(opt, true);
  });

  /* 窗口尺寸变化时自适应 */
  if (window.addEventListener) {
    window.addEventListener('resize', function () {
      STAT_DIMS.forEach(function (d) {
        if (statECharts[d.key]) statECharts[d.key].resize();
        if (mobileStatECharts[d.key]) mobileStatECharts[d.key].resize();
      });
    });
  }

  /* ═══════════════════════ 园长小程序端（principal.html） ═══════════════════════ */

  /* 园长小程序独立首页：仅排行榜（园内排行榜 + 家长注册进度），无工作台 */
  function renderPrincipalMini() {
    var root = document.getElementById('principalMiniRoot');
    if (!root) return;
    var view = getParam('view') || 'rank';
    var title = document.getElementById('principalNavTitle');
    if (title) title.textContent = view === 'parent' ? '家长进度' : '园内排行';
    root.innerHTML = view === 'parent' ? renderPrincipalParentView() : renderPrincipalRankView();
  }

  /* 园长排行榜视图：KPI + 园内教师排位分综合榜（无 Hero） */
  function renderPrincipalRankView() {
    var garden = '童蹊幼儿园';
    var gardenRanks = MDS.get('gardenRanks') || {};
    var rankData = gardenRanks[garden] || {};
    var N = (rankData.total || []).length || 1;
    var scoreData = buildRankScoreTable(rankData, N);
    var summary = (MDS.get('gardenSummary') || []).filter(function (g) { return g.name === garden; })[0] || {};
    var progress = (MDS.get('parentProgress') || []).filter(function (pr) { return pr.kindergarten === garden; });

    var totalAll = 0, regAll = 0, actAll = 0;
    progress.forEach(function (pr) { totalAll += pr.total; regAll += pr.registered; actAll += pr.active; });
    var regRate = totalAll ? Math.round((regAll / totalAll) * 100) : 0;
    var memberRate = totalAll ? Math.round((actAll / totalAll) * 100) : 0;

    var html = '';
    // KPI 卡（2 列）
    html += '<div class="mb-stat-kpi-grid">';
    html += mbKpiCard('👩‍🏫', '在职教师', (summary.teachers || 0) + ' 人');
    html += mbKpiCard('📊', '平均总分', (summary.avgTotal || 0) + ' 分');
    html += mbKpiCard('📱', '家长注册率', regRate + '%');
    html += mbKpiCard('⭐', '会员转化率', memberRate + '%');
    html += '</div>';

    // 园内教师排位分综合榜（tab 切换：综合榜 + 4 单项榜）
    html += '<div class="mb-section-title"><span class="title">园内教师排位分综合榜</span><span class="subtitle">四项排位分合计</span></div>';
    html += '<div class="mb-card" style="padding:4px 14px;">';
    html += mobileRankTabs('principalRankTabs', 'total');
    var totalCardsHtml = '';
    scoreData.rows.forEach(function (r) {
      var dimsHtml = scoreData.dims.map(function (d) {
        var cell = r[d.key];
        return '<span class="rsc-dim"><span class="rsc-dim-name">' + esc(d.name) + '</span><span class="rsc-dim-score">' + cell.score + '</span><span class="rsc-dim-rank">第 ' + cell.rank + ' 名</span><span class="rsc-dim-points">' + cell.points + ' 分</span></span>';
      }).join('');
      totalCardsHtml +=
        '<div class="mb-rank-score-card">' +
        '<div class="rsc-top">' +
        '<span class="rsc-rank' + (r.totalRank <= 3 ? ' top' : '') + '">' + r.totalRank + '</span>' +
        '<span class="rsc-name">' + esc(r.name) + '</span>' +
        '<span class="rsc-class">' + esc(r.className) + '</span>' +
        '<span class="rsc-total">' + r.totalPoints + ' 分</span>' +
        '</div>' +
        '<div class="rsc-dims">' + dimsHtml + '</div>' +
        '</div>';
    });
    html += rankPanel('principalRankTabs', 'total', totalCardsHtml, true);
    html += RANK_DIMS.map(function (d) {
      return rankPanel('principalRankTabs', d.key, singleDimCardsHtml(scoreData, d), false);
    }).join('');
    html += '</div>';

    // 排位分规则说明
    html += mobileRankRuleNote(scoreData.N);
    return html;
  }

  /* 园长家长进度视图：班级三色进度（无 Hero） */
  function renderPrincipalParentView() {
    var garden = '童蹊幼儿园';
    var progress = (MDS.get('parentProgress') || []).filter(function (pr) { return pr.kindergarten === garden; });

    // 汇总数据（与 PC 端「家长进度看板」统计卡对齐，补齐移动端缺失的汇总信息）
    var totalAll = 0, regAll = 0, actAll = 0;
    progress.forEach(function (pr) { totalAll += pr.total; regAll += pr.registered; actAll += pr.active; });
    var regRate = totalAll ? Math.round((regAll / totalAll) * 100) : 0;

    var html = '';
    html += '<div class="mb-section-title"><span class="title">家长注册进度</span><span class="subtitle">' + esc(garden) + '</span></div>';

    // 汇总 KPI 卡（2 列，对应 PC 端「幼儿/注册/激活/注册率」四张统计卡）
    html += '<div class="mb-stat-kpi-grid">';
    html += mbKpiCard('👶', '在册幼儿总数', totalAll + ' 人');
    html += mbKpiCard('📱', '家长已注册', regAll + ' 人');
    html += mbKpiCard('⭐', '会员已激活', actAll + ' 人');
    html += mbKpiCard('📊', '平均注册率', regRate + '%');
    html += '</div>';

    // 三色图例（复用 PC 图例结构，字号/颜色用内联兜底，规避移动端缺少 --pc-* 令牌）
    html += '<div class="progress-legend" style="margin:16px 0 6px;font-size:11px;color:#6b7280;">';
    html += '<span class="lg-item"><span class="lg-dot" style="background:#ff8a00;"></span>会员已激活</span>';
    html += '<span class="lg-item"><span class="lg-dot" style="background:#66cc99;"></span>已注册未激活</span>';
    html += '<span class="lg-item"><span class="lg-dot" style="background:#d1d5db;"></span>未注册</span>';
    html += '</div>';

    // 班级进度明细
    html += '<div class="mb-card" style="padding:12px 14px;margin-bottom:16px;">';
    progress.forEach(function (pr) {
      var regPct = Math.round((pr.registered / pr.total) * 100);
      var actPct = Math.round((pr.active / pr.total) * 100);
      var regOnlyPct = regPct - actPct; // 已注册未激活（已激活是已注册的子集，避免叠加溢出）
      html +=
        '<div style="margin-bottom:14px;">' +
        '<div class="flex-between"><span style="font-size:13px;font-weight:600;">' + esc(pr.className) + '</span>' +
        '<span style="font-size:11px;color:#9ca3af;">注册率 ' + regPct + '%</span></div>' +
        '<div class="progress-tri" style="margin:6px 0 4px;">' +
        '<span class="seg seg-active" style="width:' + actPct + '%"></span>' +
        '<span class="seg seg-registered" style="width:' + regOnlyPct + '%"></span>' +
        '<span class="seg seg-unregistered" style="width:' + (100 - regPct) + '%"></span>' +
        '</div>' +
        '<div style="font-size:11px;color:#6b7280;">已注册 ' + pr.registered + ' · 激活 ' + pr.active + ' · 未注册 ' + (pr.total - pr.registered) + '</div>' +
        '</div>';
    });
    html += '</div>';
    return html;
  }

  /* 园长小程序 KPI 卡 */
  function mbKpiCard(icon, title, value) {
    return (
      '<div class="mb-stat-kpi-card">' +
      '<div class="kpi-title"><span>' + icon + '</span>' + esc(title) + '</div>' +
      '<div class="kpi-value">' + value + '</div>' +
      '</div>'
    );
  }

  /* ═══════════════════════ 业务 action 注册 ═══════════════════════ */

  function registerActions() {
    // 角色切换 / 入口 / 重置
    // 入口导航页（index.html）：新标签页打开目标端（导航页停留，便于多端对比）
    Proto.registerAction('role-open-tab', function (el) {
      var role = el.getAttribute('data-role');
      if (!role) return;
      MDS.setRole(role);
      // data-path 可覆盖默认首页（用于入口页直接打开某角色的非默认端，如园长小程序 / 教师 PC 工作台）
      var path = el.getAttribute('data-path') || MDS.ROLES[role].home;
      window.open(path, '_blank');
    });

    // 原型内浮动面板角色切换：当前标签页就地跳转
    Proto.registerAction('role-switch', function (el) {
      var role = el.getAttribute('data-role');
      if (!role) return;
      MDS.setRole(role);
      location.href = MDS.ROLES[role].home;
    });

    Proto.registerAction('goto-index', function () {
      // 返回原型演示入口（medal-system/index.html）
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
          // 发布后进入「活动管理」报名阶段（stage='signup'），撤回时回到草稿
          var publishTime = a.publishTime || '';
          if (status === 'PUBLISHED') {
            publishTime = publishTime || todayStr();
          } else {
            publishTime = '';
          }
          return Object.assign({}, a, { status: status, publishTime: publishTime, stage: status === 'PUBLISHED' ? 'signup' : '' });
        });
      });
      renderActivityTable();
      Proto.showToast('状态已更新为「' + (MDS.ACTIVITY_STATUS[next] || next) + '」');
    });

    Proto.registerAction('act-add', function () {
      renderAwardRows('actAwardTbody');
      // 默认专家评审=是
      var expertYes = document.querySelector('input[name="actExpertReview"][value="1"]');
      if (expertYes) expertYes.checked = true;
      // 奖状模板下拉：动态填充（含「不绑定」）
      var actCertSel = document.getElementById('actCertTemplate');
      if (actCertSel) { actCertSel.innerHTML = certTemplateOptions(); actCertSel.value = ''; }
      // 评分标准下拉：动态填充（含「不关联」）
      var actScoreSel = document.getElementById('actScoreStandard');
      if (actScoreSel) { actScoreSel.innerHTML = scoreStandardOptions(); actScoreSel.value = ''; }
      // 评分标准仅「需要专家评审」时可关联
      syncScoreStandardByReview('add');
      // 参赛对象：默认「园长与教师」，隐藏指定教师回显区并清空已选
      var allRole = document.querySelector('input[name="actTargetRole"][value="ALL"]');
      if (allRole) allRole.checked = true;
      var specBox = document.getElementById('actSpecTeacherBox');
      if (specBox) specBox.hidden = true;
      specSelected.add = {};
      renderSpecTeacherEcho('add');
      Proto.openDialog('actAddDialog');
    });

    Proto.registerAction('act-save-add', function () {
      var title = (document.getElementById('actTitle') || {}).value || '';
      if (!title) {
        Proto.showToast('请填写活动名称');
        return;
      }
      // 参赛对象为「指定教师」时，必须至少勾选一位教师
      var role = readTargetRole('actTargetRole');
      if (role === 'SPECIFIED' && !readSpecTeachers('add').length) {
        Proto.showToast('请至少选择一位指定教师');
        return;
      }
      // 是否需要专家评审（radio）：是=1 / 否=0
      var expertChecked = document.querySelector('input[name="actExpertReview"]:checked');
      var a = {
        id: Date.now(),
        title: title,
        type: (document.getElementById('actType') || {}).value || '论文比赛',
        status: 'DRAFT',
        stage: '',
        signupStart: (document.getElementById('actStart') || {}).value || '',
        signupEnd: (document.getElementById('actEnd') || {}).value || '',
        targetKindergartens: readScopeChecks('kgScope').length ? readScopeChecks('kgScope') : ['全部幼儿园'],
        // 参赛对象（角色控制）：角色 + 指定教师（仅 SPECIFIED 时取勾选）
        targetRole: role,
        targetTeachers: role === 'SPECIFIED' ? readSpecTeachers('add') : [],
        // 是否专家评审
        expertReview: expertChecked ? expertChecked.value === '1' : true,
        // 关联评分标准（仅「需要专家评审」时可关联）
        scoreStandardId: (expertChecked && expertChecked.value === '1')
          ? (function () { var v = (document.getElementById('actScoreStandard') || {}).value; return v ? Number(v) : null; })()
          : null,
        awards: readAwardRows('actAwardTbody'),
        desc: (document.getElementById('actDesc') || {}).value || '',
        certTemplateId: (function () { var v = (document.getElementById('actCertTemplate') || {}).value; return v ? Number(v) : null; })(),
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
      var fields = { eActTitle: a.title, eActType: a.type, eActStart: a.signupStart, eActEnd: a.signupEnd, eActDesc: a.desc || '' };
      Object.keys(fields).forEach(function (fid) {
        var input = document.getElementById(fid);
        if (input) input.value = fields[fid];
      });
      fillScopeChecks('eKgScope', a.targetKindergartens);
      // 回填参赛对象角色 + 指定教师（并同步指定教师区显隐）
      fillTargetRole('eActTargetRole', a);
      fillSpecTeachers(a, 'edit');
      var eSpecBox = document.getElementById('eActSpecTeacherBox');
      if (eSpecBox) eSpecBox.hidden = (a.targetRole || 'ALL') !== 'SPECIFIED';
      var expertRadio = document.querySelector('input[name="eActExpertReview"][value="' + (a.expertReview === false ? '0' : '1') + '"]');
      if (expertRadio) expertRadio.checked = true;
      // 评分标准仅「需要专家评审」时可关联
      syncScoreStandardByReview('edit');
      renderAwardRows('eActAwardTbody', a.awards);
      // 奖状模板下拉：回填绑定
      var eCertSel = document.getElementById('eActCertTemplate');
      if (eCertSel) { eCertSel.innerHTML = certTemplateOptions(); eCertSel.value = a.certTemplateId ? String(a.certTemplateId) : ''; }
      // 评分标准下拉：动态填充并回填关联
      var eScoreSel = document.getElementById('eActScoreStandard');
      if (eScoreSel) { eScoreSel.innerHTML = scoreStandardOptions(a.scoreStandardId); }
      document.getElementById('eActId').value = id;
      Proto.openDialog('actEditDialog');
    });

    Proto.registerAction('act-save-edit', function () {
      var id = Number((document.getElementById('eActId') || {}).value);
      // 参赛对象为「指定教师」时，必须至少勾选一位教师
      var role = readTargetRole('eActTargetRole');
      if (role === 'SPECIFIED' && !readSpecTeachers('edit').length) {
        Proto.showToast('请至少选择一位指定教师');
        return;
      }
      MDS.update('activities', function (arr) {
        return arr.map(function (a) {
          if (a.id !== id) return a;
          return Object.assign({}, a, {
            title: (document.getElementById('eActTitle') || {}).value || a.title,
            type: (document.getElementById('eActType') || {}).value || a.type,
            signupStart: (document.getElementById('eActStart') || {}).value || a.signupStart,
            signupEnd: (document.getElementById('eActEnd') || {}).value || a.signupEnd,
            targetKindergartens: readScopeChecks('eKgScope').length ? readScopeChecks('eKgScope') : a.targetKindergartens,
            // 参赛对象（角色控制）：角色 + 指定教师（仅 SPECIFIED 时取勾选）
            targetRole: role,
            targetTeachers: role === 'SPECIFIED' ? readSpecTeachers('edit') : [],
            expertReview: (function () {
              var checked = document.querySelector('input[name="eActExpertReview"]:checked');
              return checked ? checked.value === '1' : (a.expertReview !== false);
            })(),
            // 关联评分标准（仅「需要专家评审」时可关联）
            scoreStandardId: (function () {
              var checked = document.querySelector('input[name="eActExpertReview"]:checked');
              var expertOn = checked ? checked.value === '1' : (a.expertReview !== false);
              if (!expertOn) return null;
              var v = (document.getElementById('eActScoreStandard') || {}).value;
              return v ? Number(v) : null;
            })(),
            awards: readAwardRows('eActAwardTbody'),
            desc: (document.getElementById('eActDesc') || {}).value || a.desc,
            certTemplateId: (function () { var v = (document.getElementById('eActCertTemplate') || {}).value; return v ? Number(v) : null; })(),
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

    // ── 活动：通知（点击打开通知管理页 → 发送通知 + 查看已读回执） ──
    Proto.registerAction('act-notify', function (el) {
      var id = Number(el.getAttribute('data-id'));
      var a = (MDS.get('activities') || []).filter(function (x) { return x.id === id; })[0];
      if (!a) return;
      notifyActivityId = a.id;
      activateTag('activity-notify');
    });

    // 通知管理页：返回活动发起
    Proto.registerAction('notify-back', function () {
      activateTag('activity-launch');
    });

    // 通知管理页：打开发送通知弹窗（填标题/内容 + 选择接收老师）
    Proto.registerAction('notify-open-send', function () {
      var a = activityById(notifyActivityId);
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
      var title = ((document.getElementById('notifyTitle') || {}).value || '').trim();
      var content = ((document.getElementById('notifyContent') || {}).value || '').trim();
      if (!title) {
        Proto.showToast('请填写通知标题');
        return;
      }
      if (!content) {
        Proto.showToast('请填写通知内容');
        return;
      }
      // 已选集合跨筛选累计：以 notifySelected 为准，而非 DOM 中可见的勾选项
      var names = notifyTeachers.filter(function (t) { return notifySelected[t.name]; }).map(function (t) { return t.name; });
      if (!names.length) {
        Proto.showToast('请至少选择一位老师');
        return;
      }
      // 组装接收对象（含回执状态，初始全部未读，回执由接收方阅读后回填）
      var recipients = notifyTeachers.filter(function (t) { return notifySelected[t.name]; }).map(function (t) {
        return { name: t.name, kindergarten: t.kindergarten, className: t.className, read: false, readTime: '' };
      });
      var record = {
        id: 'an' + Date.now(),
        title: title,
        content: content,
        sender: '管理员',
        sendTime: nowTimeStr(),
        recipients: recipients,
      };
      MDS.update('activityNotices', function (map) {
        var next = Object.assign({}, map || {});
        var key = String(notifyActivityId);
        var arr = (next[key] || []).slice();
        arr.unshift(record);
        next[key] = arr;
        return next;
      });
      Proto.closeDialog('notifyDialog');
      renderActivityNotify();
      renderActivityTable();
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

    // ── 积分方案 CRUD（与活动解耦：参与对象 = 所选幼儿园范围的全部在职教师；月度常规勋章积分方案已移除） ──

    // 新增积分方案：打开空表单弹窗（参与对象默认「全部幼儿园」）
    Proto.registerAction('as-add', function () {
      document.getElementById('asId').value = '';
      document.getElementById('asDialogTitle').textContent = '新增积分方案';
      document.getElementById('asName').value = '';
      document.getElementById('asCycleStart').value = '';
      document.getElementById('asCycleEnd').value = '';
      fillScopeChecks('asKgScope', ['全部幼儿园']);
      Proto.openDialog('asDialog');
    });

    // 编辑积分方案：回填
    Proto.registerAction('as-edit', function (el) {
      var id = Number(el.getAttribute('data-id'));
      var s = (MDS.get('scoreSchemes') || []).filter(function (x) { return x.id === id; })[0];
      if (!s) return;
      document.getElementById('asId').value = id;
      document.getElementById('asDialogTitle').textContent = '编辑积分方案';
      document.getElementById('asName').value = s.name;
      document.getElementById('asCycleStart').value = s.cycleStart || '';
      document.getElementById('asCycleEnd').value = s.cycleEnd || '';
      fillScopeChecks('asKgScope', s.targetKindergartens || ['全部幼儿园']);
      Proto.openDialog('asDialog');
    });

    // 复制积分方案：副本保留周期与参与对象范围
    Proto.registerAction('as-copy', function (el) {
      var id = Number(el.getAttribute('data-id'));
      var s = (MDS.get('scoreSchemes') || []).filter(function (x) { return x.id === id; })[0];
      if (!s) return;
      var copy = JSON.parse(JSON.stringify(s));
      copy.id = Date.now();
      copy.name = s.name + '（副本）';
      copy.updatedAt = '刚刚 复制';
      MDS.update('scoreSchemes', function (arr) {
        return (arr || []).concat([copy]);
      });
      renderScoreScheme(qs('#pcPage'));
      Proto.showToast('已复制为「' + copy.name + '」');
    });

    // 删除积分方案
    Proto.registerAction('as-delete', function (el) {
      var id = Number(el.getAttribute('data-id'));
      var s = (MDS.get('scoreSchemes') || []).filter(function (x) { return x.id === id; })[0];
      if (!s) return;
      if (!confirm('确定删除积分方案「' + s.name + '」吗？')) return;
      MDS.update('scoreSchemes', function (arr) {
        return (arr || []).filter(function (x) { return x.id !== id; });
      });
      renderScoreScheme(qs('#pcPage'));
      Proto.showToast('已删除积分方案');
    });

    // 保存积分方案
    Proto.registerAction('as-save', function () {
      var name = ((qs('#asName') || {}).value || '').trim();
      var cycleStart = (qs('#asCycleStart') || {}).value || '';
      var cycleEnd = (qs('#asCycleEnd') || {}).value || '';
      // 参与对象 = 所选幼儿园范围（该范围全部在职教师）
      var kgs = readScopeChecks('asKgScope');
      if (!name) {
        Proto.showToast('请填写方案名称');
        return;
      }
      if (!kgs.length) {
        Proto.showToast('请选择参与对象（幼儿园范围）');
        return;
      }
      if (!cycleStart || !cycleEnd) {
        Proto.showToast('请填写积分周期');
        return;
      }
      if (cycleStart > cycleEnd) {
        Proto.showToast('积分周期开始日期不能晚于结束日期');
        return;
      }
      var id = Number((qs('#asId') || {}).value);
      var payload = {
        name: name,
        targetKindergartens: kgs,
        cycleStart: cycleStart,
        cycleEnd: cycleEnd,
        updatedAt: '刚刚 更新',
      };
      MDS.update('scoreSchemes', function (arr) {
        if (id) {
          return (arr || []).map(function (x) {
            return x.id === id ? Object.assign({}, x, payload) : x;
          });
        }
        return (arr || []).concat([Object.assign({ id: Date.now() }, payload)]);
      });
      Proto.closeDialog('asDialog');
      renderScoreScheme(qs('#pcPage'));
      Proto.showToast(id ? '已保存积分方案修改' : '已新增积分方案');
    });

    // ── 积分获得情况：打开发布公告弹窗（生成只读积分汇总预览） ──
    Proto.registerAction('score-obtained-announce-open', function () {
      var s = (MDS.get('scoreSchemes') || []).filter(function (x) { return x.id === scoreObtainedSchemeId; })[0];
      if (!s) {
        Proto.showToast('请先选择积分方案');
        return;
      }
      var titleEl = document.getElementById('soAnnounceTitle');
      var contentEl = document.getElementById('soAnnounceContent');
      if (titleEl) titleEl.value = '';
      if (contentEl) contentEl.value = '';
      var nameEl = document.getElementById('soAnnounceSchemeName');
      if (nameEl) nameEl.textContent = s.name;
      var pv = document.getElementById('soAnnouncePreview');
      if (pv) pv.textContent = buildScoreSummaryText(s);
      Proto.openDialog('scoreAnnounceDialog');
    });

    // ── 积分获得情况：发布公告 → 写入活动通知（recipients=参与对象，消息中心可收） ──
    Proto.registerAction('score-obtained-announce-publish', function () {
      var s = (MDS.get('scoreSchemes') || []).filter(function (x) { return x.id === scoreObtainedSchemeId; })[0];
      if (!s) {
        Proto.showToast('请先选择积分方案');
        return;
      }
      var title = ((document.getElementById('soAnnounceTitle') || {}).value || '').trim();
      var content = ((document.getElementById('soAnnounceContent') || {}).value || '').trim();
      if (!title) {
        Proto.showToast('请填写公告标题');
        return;
      }
      if (!content) {
        Proto.showToast('请填写公告内容');
        return;
      }
      var data = buildSchemeRows(s);
      var recipients = data.rows.map(function (r) {
        return { name: r.name, kindergarten: r.kindergarten, className: r.className, read: false, readTime: '' };
      });
      var record = {
        id: 'an' + Date.now(),
        title: title,
        content: content + '\n\n━━━━━━━━━━━━\n' + buildScoreSummaryText(s),
        sender: '管理员',
        sendTime: nowTimeStr(),
        recipients: recipients,
        // 结构化积分汇总：供「积分公告详情页」渲染表格（name/className/total/totalRank/rankPoints/bonus）
        scoreSummary: {
          schemeName: s.name,
          cycleStart: s.cycleStart || '',
          cycleEnd: s.cycleEnd || '',
          rows: data.rows.map(function (r) {
            return {
              name: r.name,
              className: r.className,
              total: r.total,
              totalRank: r.totalRank,
              rankPoints: r.rankPoints,
              bonus: r.bonus,
            };
          }),
        },
      };
      MDS.update('activityNotices', function (map) {
        var next = Object.assign({}, map || {});
        // 积分公告与活动解耦：按积分方案 id 键控（scheme1 / scheme2 …），避免与活动通知键冲突
        var key = 'scheme' + s.id;
        next[key] = (next[key] || []).slice();
        next[key].unshift(record);
        return next;
      });
      Proto.closeDialog('scoreAnnounceDialog');
      Proto.showToast('公告已发布，发送给 ' + recipients.length + ' 位参与对象');
    });

    // ── 积分获得情况：保存奖金（持久化到 schemeScores[方案id]） ──
    Proto.registerAction('score-obtained-bonus-save', function () {
      if (scoreObtainedSchemeId == null) {
        Proto.showToast('请先选择积分方案');
        return;
      }
      var box = document.getElementById('scoreObtainedRoot');
      var map = {};
      (box ? box.querySelectorAll('.so-bonus-input') : []).forEach(function (inp) {
        var v = parseInt(inp.value, 10);
        map[inp.getAttribute('data-name')] = isNaN(v) || v < 0 ? 0 : v;
      });
      MDS.update('schemeScores', function (all) {
        var next = Object.assign({}, all || {});
        next[scoreObtainedSchemeId] = (next[scoreObtainedSchemeId] || []).map(function (r) {
          return map[r.name] != null ? Object.assign({}, r, { bonus: map[r.name] }) : r;
        });
        return next;
      });
      Proto.showToast('奖金已保存');
    });

    // ── 排行榜：查看教师积分获取明细（园内教师榜 / 园内排行榜共用） ──
    Proto.registerAction('rank-point-detail', function (el) {
      var name = el.getAttribute('data-teacher');
      if (name) renderPointDetailDialog(name);
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

    // ── 移动端：活动中心（教师端完整流程：查看 → 报名 → 上传 → 结果）──

    // 打开活动详情页（活动中心点击活动卡 → 跳转详情页）
    Proto.registerAction('activity-detail', function (el) {
      var id = el.getAttribute('data-id');
      if (id) location.href = 'activity-detail.html?activityId=' + id;
    });

    // 消息页点击活动消息 → 跳转对应活动详情页
    Proto.registerAction('open-activity-detail', function (el) {
      var id = el.getAttribute('data-id');
      if (id) location.href = 'activity-detail.html?activityId=' + id;
    });

    // 积分公告：进入独立「积分公告详情页」
    Proto.registerAction('open-announce-detail', function (el) {
      var actId = el.getAttribute('data-activity');
      var noticeId = el.getAttribute('data-notice');
      location.href = 'announce-detail.html?activityId=' + actId + '&noticeId=' + encodeURIComponent(noticeId);
    });

    // 活动详情页报名：写入当前参与者（教师/园长）报名状态并回显
    Proto.registerAction('activity-detail-signup', function (el) {
      var id = Number(el.getAttribute('data-id'));
      if (!id) return;
      setParticipantSignup(id, { signedUp: true, signupTime: nowTimeStr(), workSubmitted: false, workTitle: '' });
      renderActivityDetail();
      Proto.showToast('报名成功，请及时上传参赛作品');
    });

    // 打开报名确认弹层
    Proto.registerAction('activity-signup', function (el) {
      signupActivityId = Number(el.getAttribute('data-id')) || null;
      var act = activityById(signupActivityId);
      var title = document.getElementById('signupActTitle');
      if (title) title.textContent = act ? '「' + act.title + '」' : '';
      Proto.openDialog('signupSheet');
    });

    // 确认报名：写入当前参与者（教师/园长）报名状态
    Proto.registerAction('activity-signup-confirm', function () {
      if (!signupActivityId) return;
      setParticipantSignup(signupActivityId, { signedUp: true, signupTime: nowTimeStr(), workSubmitted: false, workTitle: '' });
      Proto.closeDialog('signupSheet');
      renderMobileActivity();
      Proto.showToast('报名成功，请上传参赛作品');
    });

    // 打开上传作品弹层（记录当前活动 id）
    Proto.registerAction('upload-sheet', function (el) {
      uploadActivityId = Number(el.getAttribute('data-id')) || null;
      var mask = document.getElementById('uploadSheet');
      if (mask) mask.hidden = false;
    });

    // 提交作品：更新当前参与者（教师/园长）的作品状态（workSubmitted + workTitle）
    Proto.registerAction('upload-confirm', function () {
      var file = document.getElementById('uploadFileName');
      if (file && !file.value.trim()) {
        Proto.showToast('请先选择要上传的文件');
        return;
      }
      var workTitle = (document.getElementById('uploadFileName') || {}).value.trim();
      if (uploadActivityId) {
        setParticipantSignup(uploadActivityId, { workSubmitted: true, workTitle: workTitle });
      }
      Proto.closeDialog('uploadSheet');
      renderMobileActivity();
      Proto.showToast('作品提交成功');
    });

    // 打开我的结果弹层
    Proto.registerAction('activity-result', function (el) {
      var act = activityById(Number(el.getAttribute('data-id')));
      if (act) openMyResult(act);
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

    // 教师 PC 个人工作台：活动分段切换（全部/待报名/进行中/已出结果）
    Proto.registerAction('teacher-act-tab', function (el) {
      teacherActTab = el.getAttribute('data-tab-value') || 'all';
      renderTeacherActivity();
    });

    // 教师 PC 个人工作台：查看我的结果（弹窗展示评分/名次/奖项）
    Proto.registerAction('teacher-result', function (el) {
      var act = activityById(Number(el.getAttribute('data-id')));
      if (act) openTeacherResult(act);
    });

    // 教师 PC 个人工作台：报名（打开确认弹窗）
    Proto.registerAction('teacher-signup', function (el) {
      var id = Number(el.getAttribute('data-id'));
      if (!id) return;
      signupActivityId = id;
      var act = activityById(id);
      var title = document.getElementById('teacherSignupTitle');
      if (title) title.textContent = '「' + (act ? act.title : '') + '」报名';
      var body = document.getElementById('teacherSignupBody');
      if (body) body.innerHTML = '<div style="font-size:14px;color:#606266;line-height:1.8;">确认报名该活动？报名后请在活动报名时间内上传参赛作品。</div>';
      Proto.openDialog('teacherSignupDialog');
    });

    // 教师 PC 个人工作台：确认报名
    Proto.registerAction('teacher-signup-confirm', function () {
      if (!signupActivityId) return;
      MDS.update('teacherSignups', function (map) {
        var next = Object.assign({}, map || {});
        next[signupActivityId] = { signedUp: true, signupTime: nowTimeStr(), workSubmitted: false, workTitle: '' };
        return next;
      });
      Proto.closeDialog('teacherSignupDialog');
      renderTeacherActivity();
      Proto.showToast('报名成功，请及时上传参赛作品');
    });

    // 教师 PC 个人工作台：上传作品（打开弹窗）
    Proto.registerAction('teacher-upload', function (el) {
      var id = Number(el.getAttribute('data-id'));
      if (!id) return;
      uploadActivityId = id;
      var input = document.getElementById('teacherWorkTitle');
      if (input) input.value = '';
      var fileInput = document.getElementById('teacherWorkFile');
      if (fileInput) fileInput.value = '';
      Proto.openDialog('teacherUploadDialog');
    });

    // 教师 PC 个人工作台：提交作品（校验作品名称 + 附件）
    Proto.registerAction('teacher-upload-confirm', function () {
      var input = document.getElementById('teacherWorkTitle');
      if (input && !input.value.trim()) {
        Proto.showToast('请先填写作品名称');
        return;
      }
      var fileInput = document.getElementById('teacherWorkFile');
      if (fileInput && !fileInput.value) {
        Proto.showToast('请选择要上传的作品附件');
        return;
      }
      var workTitle = input ? input.value.trim() : '（教师 PC 端上传）演示作品';
      if (uploadActivityId) {
        MDS.update('teacherSignups', function (map) {
          var next = Object.assign({}, map || {});
          var cur = next[uploadActivityId] || { signedUp: true, signupTime: nowTimeStr(), workSubmitted: false };
          next[uploadActivityId] = Object.assign({}, cur, { signedUp: true, workSubmitted: true, workTitle: workTitle });
          return next;
        });
      }
      Proto.closeDialog('teacherUploadDialog');
      renderTeacherActivity();
      Proto.showToast('作品提交成功');
    });

    // ── 活动管理：分配评委独立页面 ──
    // 审核阶段「分配评委」→ 跳转独立页面
    // ── 活动管理：步骤条 / 阶段操作 ──
    // 步骤条切换阶段视图
    Proto.registerAction('am-switch-step', function (el) {
      amStep = el.getAttribute('data-step') || 'signup';
      renderActivityManage(qs('#pcPage'));
    });

    // 进入下一阶段（手动推进：报名 → 评审 → 归档）
    Proto.registerAction('am-next-stage', function () {
      var act = activityById(amActivityId);
      if (!act) return;
      var idx = STAGE_ORDER.indexOf(act.stage);
      if (idx < 0 || idx >= STAGE_ORDER.length - 1) {
        Proto.showToast('活动已处于最后阶段');
        return;
      }
      var next = STAGE_ORDER[idx + 1];
      MDS.update('activities', function (arr) {
        return arr.map(function (x) {
          if (x.id !== amActivityId) return x;
          var upd = Object.assign({}, x, { stage: next });
          // 进入归档阶段时结果状态缺省为「未发布」，供管理端发布
          if (next === 'archive' && !x.resultStatus) upd.resultStatus = 'pending';
          return upd;
        });
      });
      amStep = next;
      renderActivityManage(qs('#pcPage'));
      Proto.showToast('已进入「' + stageText(next) + '」');
    });

    // 返回上一阶段（手动回退：归档 → 评审 → 报名）
    Proto.registerAction('am-prev-stage', function () {
      var act = activityById(amActivityId);
      if (!act) return;
      var idx = STAGE_ORDER.indexOf(act.stage);
      if (idx <= 0) {
        Proto.showToast('活动已处于第一阶段');
        return;
      }
      var prev = STAGE_ORDER[idx - 1];
      MDS.update('activities', function (arr) {
        return arr.map(function (x) {
          return x.id === amActivityId ? Object.assign({}, x, { stage: prev }) : x;
        });
      });
      amStep = prev;
      renderActivityManage(qs('#pcPage'));
      Proto.showToast('已返回「' + stageText(prev) + '」');
    });

    // 报名/归档阶段：查看报名详情（展示该报名者上传的作品）
    Proto.registerAction('am-view-signup-detail', function (el) {
      var act = activityById(Number(el.getAttribute('data-activity')));
      var teacher = el.getAttribute('data-teacher');
      if (!act) return;
      fillSignupDetailDialog(act, teacher);
    });

    // 归档阶段：查看评分详情（每位评委对该作品的评分）
    Proto.registerAction('am-view-score-detail', function (el) {
      var act = activityById(Number(el.getAttribute('data-activity')));
      var work = (MDS.get('works') || []).filter(function (w) { return w.id === Number(el.getAttribute('data-work-id')); })[0];
      if (!act || !work) return;
      fillScoreDetailDialog(act, work);
    });

    // ── 报名阶段：导出报名信息表格（提示导出成功） ──
    Proto.registerAction('am-export-signup', function () {
      var a = activityById(amActivityId);
      if (!a) return;
      var list = signupListForActivity(a);
      Proto.showToast('报名信息表格导出成功（共 ' + list.length + ' 条报名）');
    });

    // ── 报名阶段：补交开关（截止后是否仍可补交作品） ──
    Proto.registerAction('am-supplement-toggle', function (el) {
      var id = Number(el.getAttribute('data-id'));
      MDS.update('activities', function (arr) {
        return arr.map(function (x) {
          return x.id === id ? Object.assign({}, x, { supplementEnabled: !x.supplementEnabled }) : x;
        });
      });
      renderActivityManage(qs('#pcPage'));
    });

    // ── 归档阶段：导出全量数据（提示导出成功） ──
    Proto.registerAction('am-export-archive', function () {
      var a = activityById(amActivityId);
      if (!a) return;
      var list = signupListForActivity(a);
      Proto.showToast('全量数据导出成功（共 ' + list.length + ' 条报名 · 含作品与综合评分）');
    });

    // ── 活动查询：进入详情 / 返回列表 / 导出全量数据 / 筛选 ──
    Proto.registerAction('aq-view', function (el) {
      aqActivityId = Number(el.getAttribute('data-id'));
      renderActivityQuery(qs('#pcPage'));
    });

    Proto.registerAction('aq-back', function () {
      aqActivityId = null;
      renderActivityQuery(qs('#pcPage'));
    });

    Proto.registerAction('aq-export', function (el) {
      var a = activityById(Number(el.getAttribute('data-id')));
      if (!a) return;
      var list = signupListForActivity(a);
      var items = buildArchiveItems(a);
      Proto.showToast('「' + a.title + '」全量数据导出成功（报名 ' + list.length + ' 人 · 评审 ' + items.length + ' 人）');
    });

    Proto.registerAction('aq-search', function () {
      aqNameFilter = ((document.getElementById('aqSearchName') || {}).value || '').trim();
      aqTypeFilter = (document.getElementById('aqTypeFilter') || {}).value || '';
      renderActivityQuery(qs('#pcPage'));
    });

    Proto.registerAction('aq-reset', function () {
      aqNameFilter = '';
      aqTypeFilter = '';
      renderActivityQuery(qs('#pcPage'));
    });

    // ── 归档阶段：设置奖项等级弹窗（自定义奖项名称及名次范围） ──
    Proto.registerAction('ac-open', function () {
      var a = activityById(amActivityId);
      if (!a) return;
      fillAwardConfigDialog(a);
    });

    // 添加奖项等级
    Proto.registerAction('ac-add', function () {
      var tbody = document.getElementById('awardConfigTbody');
      if (tbody) {
        tbody.insertAdjacentHTML('beforeend',
          '<tr>' +
          '<td><input class="pc-input ac-name" placeholder="奖项名称"></td>' +
          '<td><input class="pc-input ac-range" placeholder="如 1-3" style="width:110px;"></td>' +
          '<td><span class="action-btn action-delete" data-action="ac-del">删除</span></td>' +
          '</tr>'
        );
      }
    });

    // 删除奖项等级
    Proto.registerAction('ac-del', function (el) {
      var tr = el.closest('tr');
      if (tr) tr.remove();
    });

    // 保存奖项等级配置
    Proto.registerAction('ac-save', function () {
      var tbody = document.getElementById('awardConfigTbody');
      var rows = [];
      tbody.querySelectorAll('tr').forEach(function (tr) {
        var name = ((tr.querySelector('.ac-name') || {}).value || '').trim();
        var rangeStr = ((tr.querySelector('.ac-range') || {}).value || '').trim();
        if (!name || !rangeStr) return;
        var parts = rangeStr.split('-');
        var rankFrom = parseInt(parts[0], 10);
        var rankTo = parseInt(parts[1], 10);
        if (isNaN(rankFrom) || isNaN(rankTo) || rankFrom < 1 || rankTo < rankFrom) return;
        rows.push({ name: name, rankFrom: rankFrom, rankTo: rankTo });
      });
      if (!rows.length) {
        Proto.showToast('请至少配置一个奖项等级（含名称与名次范围）');
        return;
      }
      MDS.update('awardConfigs', function (map) {
        var next = Object.assign({}, map || {});
        next[amActivityId] = rows;
        return next;
      });
      Proto.closeDialog('awardConfigDialog');
      renderActivityManage(qs('#pcPage'));
      Proto.showToast('奖项等级配置已保存');
    });

    // ── 归档阶段：计算综合得分（需确认） ──
    Proto.registerAction('am-calc-score', function () {
      if (!confirm('是否需要计算综合得分？\n将根据各评委评分自动汇总计算综合得分。')) return;
      renderActivityManage(qs('#pcPage'));
      Proto.showToast('综合得分已计算完成');
    });

    // ── 归档阶段：调整名次（手动调整获奖名次） ──
    Proto.registerAction('rank-adjust-open', function (el) {
      var teacher = el.getAttribute('data-teacher');
      var rank = Number(el.getAttribute('data-rank'));
      var a = activityById(Number(el.getAttribute('data-activity')));
      var title = document.getElementById('rankAdjustTitle');
      if (title) title.textContent = '调整名次 · ' + (a ? a.title : '');
      var meta = document.getElementById('rankAdjustMeta');
      if (meta) meta.textContent = '报名教师：' + teacher;
      var cur = document.getElementById('rankAdjustCurrent');
      if (cur) cur.textContent = '第 ' + rank + ' 名';
      var input = document.getElementById('rankAdjustNew');
      if (input) input.value = '';
      window.__rankAdjust = { teacher: teacher };
      Proto.openDialog('rankAdjustDialog');
    });

    Proto.registerAction('rank-save', function () {
      var act = activityById(amActivityId);
      var info = window.__rankAdjust;
      var newRank = parseInt((qs('#rankAdjustNew') || {}).value, 10);
      if (!act || !info || !info.teacher) return;
      if (isNaN(newRank) || newRank < 1) {
        Proto.showToast('请输入正确的名次');
        return;
      }
      MDS.update('rankOverrides', function (map) {
        var next = Object.assign({}, map || {});
        var actMap = Object.assign({}, next[act.id] || {});
        actMap[info.teacher] = newRank;
        next[act.id] = actMap;
        return next;
      });
      window.__rankAdjust = null;
      Proto.closeDialog('rankAdjustDialog');
      renderActivityManage(qs('#pcPage'));
      Proto.showToast('已将「' + info.teacher + '」名次调整为第 ' + newRank + ' 名');
    });

    // ── 评审阶段 · 管理员直接审核（非专家评审）：审核通过 / 审核退回（标注原因） ──
    Proto.registerAction('admin-approve', function (el) {
      var actId = Number(el.getAttribute('data-activity'));
      var teacher = el.getAttribute('data-teacher');
      MDS.update('adminReviews', function (map) {
        var next = Object.assign({}, map || {});
        var actMap = Object.assign({}, next[actId] || {});
        actMap[teacher] = { status: 'approved', reason: '' };
        next[actId] = actMap;
        return next;
      });
      renderActivityManage(qs('#pcPage'));
      Proto.showToast('已通过「' + teacher + '」的审核');
    });

    Proto.registerAction('admin-reject-open', function (el) {
      var actId = Number(el.getAttribute('data-activity'));
      var teacher = el.getAttribute('data-teacher');
      var a = activityById(actId);
      var title = document.getElementById('adminRejectTitle');
      if (title) title.textContent = '审核退回 · ' + (a ? a.title : '');
      var meta = document.getElementById('adminRejectMeta');
      if (meta) meta.textContent = '报名教师：' + teacher;
      var reason = document.getElementById('adminRejectReason');
      if (reason) reason.value = '';
      window.__adminReject = { activityId: actId, teacher: teacher };
      Proto.openDialog('adminRejectDialog');
    });

    Proto.registerAction('admin-reject-save', function () {
      var info = window.__adminReject;
      var reason = ((qs('#adminRejectReason') || {}).value || '').trim();
      if (!info || !info.teacher) return;
      if (!reason) {
        Proto.showToast('请填写退回原因');
        return;
      }
      MDS.update('adminReviews', function (map) {
        var next = Object.assign({}, map || {});
        var actMap = Object.assign({}, next[info.activityId] || {});
        actMap[info.teacher] = { status: 'rejected', reason: reason };
        next[info.activityId] = actMap;
        return next;
      });
      window.__adminReject = null;
      Proto.closeDialog('adminRejectDialog');
      renderActivityManage(qs('#pcPage'));
      Proto.showToast('已退回「' + info.teacher + '」并标注原因');
    });

    // ── 评审阶段：控制评审开始 / 结束（分配评委后开始评审） ──
    Proto.registerAction('review-start', function () {
      MDS.update('reviewStageStatus', function (map) {
        var next = Object.assign({}, map || {});
        next[amActivityId] = 'reviewing';
        return next;
      });
      renderActivityManage(qs('#pcPage'));
      Proto.showToast('评审已开始，评委可进行打分');
    });

    Proto.registerAction('review-finish', function () {
      MDS.update('reviewStageStatus', function (map) {
        var next = Object.assign({}, map || {});
        next[amActivityId] = 'finished';
        return next;
      });
      renderActivityManage(qs('#pcPage'));
      Proto.showToast('评审已结束');
    });

    // ── 评分标准弹窗（score-standard：新增/编辑，配置指标名称/指标说明/满分上限/权重） ──
    // 打开新增弹窗
    Proto.registerAction('score-standard-add', function () {
      fillScoreStandardDialog(null);
    });

    // 打开编辑弹窗
    Proto.registerAction('score-standard-edit', function (el) {
      var id = Number(el.getAttribute('data-id'));
      var s = scoreStandardById(id);
      if (!s) return;
      fillScoreStandardDialog(s);
    });

    // 删除评分标准（需确认）
    Proto.registerAction('score-standard-del', function (el) {
      var id = Number(el.getAttribute('data-id'));
      var s = scoreStandardById(id);
      if (!confirm('确定删除评分标准「' + (s ? s.name : '') + '」吗？删除后已关联该标准的活动需重新选择。')) return;
      MDS.update('scoreStandards', function (arr) {
        return (arr || []).filter(function (x) { return x.id !== id; });
      });
      renderScoreStandardList();
      Proto.showToast('已删除评分标准');
    });

    // 添加指标行
    Proto.registerAction('ss-indicator-add', function () {
      var tbody = document.getElementById('ssIndicatorTbody');
      if (tbody) tbody.insertAdjacentHTML('beforeend', ssIndicatorRowHtml({}));
      updateSSWeightHint();
    });

    // 删除指标行
    Proto.registerAction('ss-indicator-del', function (el) {
      var tr = el.closest('tr');
      if (tr) tr.remove();
      updateSSWeightHint();
    });

    // 保存评分标准（新增/编辑）
    Proto.registerAction('ss-save', function () {
      var name = ((document.getElementById('ssName') || {}).value || '').trim();
      if (!name) {
        Proto.showToast('请填写标准名称');
        return;
      }
      var tbody = document.getElementById('ssIndicatorTbody');
      var indicators = [];
      tbody.querySelectorAll('tr').forEach(function (tr) {
        var iname = ((tr.querySelector('.ss-name') || {}).value || '').trim();
        if (!iname) return;
        var maxScore = parseInt((tr.querySelector('.ss-max') || {}).value, 10);
        var weight = parseInt((tr.querySelector('.ss-weight') || {}).value, 10);
        indicators.push({
          name: iname,
          desc: ((tr.querySelector('.ss-desc') || {}).value || '').trim(),
          maxScore: isNaN(maxScore) || maxScore < 0 ? 100 : maxScore,
          weight: isNaN(weight) || weight < 0 ? 0 : weight,
        });
      });
      if (!indicators.length) {
        Proto.showToast('请至少添加一个评分指标');
        return;
      }
      var total = indicators.reduce(function (s, r) { return s + (r.weight || 0); }, 0);
      if (total !== 100) {
        Proto.showToast('权重合计应为 100%，当前 ' + total + '%');
        return;
      }
      var remark = ((document.getElementById('ssRemark') || {}).value || '').trim();
      var id = Number((document.getElementById('ssId') || {}).value);
      if (id) {
        // 编辑：按 id 更新
        MDS.update('scoreStandards', function (arr) {
          return (arr || []).map(function (s) {
            return s.id === id ? Object.assign({}, s, { name: name, remark: remark, indicators: indicators }) : s;
          });
        });
      } else {
        // 新增：取当前最大 id + 1
        var nextId = (MDS.get('scoreStandards') || []).reduce(function (m, s) { return Math.max(m, s.id || 0); }, 0) + 1;
        MDS.update('scoreStandards', function (arr) {
          return (arr || []).concat([{ id: nextId, name: name, remark: remark, indicators: indicators }]);
        });
      }
      Proto.closeDialog('scoreStandardDialog');
      renderScoreStandardList();
      Proto.showToast(id ? '评分标准已更新' : '已新增评分标准');
    });

    // 评审阶段：查看该活动关联的评分标准（只读弹窗）
    Proto.registerAction('score-standard-view', function () {
      var a = activityById(amActivityId);
      var title = document.getElementById('ssViewTitle');
      var body = document.getElementById('ssViewBody');
      if (!body) return;
      var s = a ? scoreStandardById(a.scoreStandardId) : null;
      if (!s) {
        if (title) title.textContent = '评分标准';
        body.innerHTML = '<div class="pc-empty" style="padding:24px 0;"><div>该活动未关联评分标准</div></div>';
      } else {
        if (title) title.textContent = '评分标准 · ' + s.name;
        body.innerHTML =
          (s.remark ? '<div style="font-size:12px;color:#909399;margin-bottom:10px;">' + esc(s.remark) + '</div>' : '') +
          '<table class="pc-table"><thead><tr><th>指标名称</th><th>指标说明</th><th>满分上限</th><th>权重</th></tr></thead><tbody>' +
          (s.indicators || []).map(function (ind) {
            return '<tr><td>' + esc(ind.name) + '</td><td>' + esc(ind.desc || '—') + '</td><td>' + ind.maxScore + ' 分</td><td>' + ind.weight + '%</td></tr>';
          }).join('') +
          '</tbody></table>';
      }
      Proto.openDialog('scoreStandardViewDialog');
    });

    // ── 评委分配弹窗（评审阶段「评委分配」：仅手动分配专家，已取消系统随机抽评） ──
    // 打开弹窗：预填已有分配（重新分配时展示当前分组与评委）
    Proto.registerAction('judge-open-assign', function () {
      var a = activityById(amActivityId);
      var title = document.getElementById('judgeAssignTitle');
      if (title) title.textContent = '评委分配 · ' + (a ? a.title : '');
      // 手动分配：预填已有分配（按 groupNo 聚合评委 id，供重新分配时回显）
      var existing = ((MDS.get('reviewGroups') || {})[amActivityId]) || [];
      var groupMap = {};
      existing.forEach(function (r) {
        if (!groupMap[r.groupNo]) groupMap[r.groupNo] = [];
        groupMap[r.groupNo].push(String(r.judgeId));
      });
      judgeAssignSel = {};
      Object.keys(groupMap).forEach(function (g) { judgeAssignSel[g] = groupMap[g]; });
      judgeGroupCount = Object.keys(groupMap).length || 2;
      var gc = document.getElementById('judgeGroupCount');
      if (gc) gc.value = judgeGroupCount;
      renderJudgeAssignGroups();
      Proto.openDialog('judgeAssignDialog');
    });

    // 评委分配弹窗（手动分配）：生成/重置分组（读取分组数，清空勾选后重新选择）
    Proto.registerAction('judge-build-groups', function () {
      var n = parseInt((qs('#judgeGroupCount') || {}).value, 10);
      judgeGroupCount = (isNaN(n) || n < 1) ? 1 : n;
      judgeAssignSel = {};
      for (var i = 1; i <= judgeGroupCount; i++) judgeAssignSel[i] = [];
      renderJudgeAssignGroups();
    });

    // 评委分配弹窗：打开「选择评委」弹窗（针对某组，评委列表可多选，确定后回填到该组表格）
    Proto.registerAction('judge-open-select', function (el) {
      var g = el.getAttribute('data-group');
      window.__judgeSelectGroup = g;
      // 初始化临时已选集（从该组已选评委复制），供筛选重绘时保留勾选状态
      var checked = {};
      (judgeAssignSel[g] || []).forEach(function (id) { checked[id] = true; });
      window.__judgeSelectChecked = checked;
      var title = document.getElementById('judgeSelectTitle');
      if (title) title.textContent = '第 ' + g + ' 组 · 选择评委';
      var search = document.getElementById('judgeSelectSearch');
      if (search) search.value = '';
      renderJudgeSelectList();
      Proto.openDialog('judgeSelectDialog');
    });

    // 选择评委弹窗：确定（把临时已选集写回该组，关闭后刷新分组表格）
    Proto.registerAction('judge-select-confirm', function () {
      var g = window.__judgeSelectGroup;
      var checked = window.__judgeSelectChecked || {};
      judgeAssignSel[g] = Object.keys(checked);
      window.__judgeSelectChecked = {};
      Proto.closeDialog('judgeSelectDialog');
      renderJudgeAssignGroups();
    });

    // 评委分配弹窗：移除该组某位评委（从已选列表删除后刷新分组表格）
    Proto.registerAction('judge-remove', function (el) {
      var g = el.getAttribute('data-group');
      var jid = el.getAttribute('data-judge');
      judgeAssignSel[g] = (judgeAssignSel[g] || []).filter(function (id) { return id !== jid; });
      renderJudgeAssignGroups();
    });

    // 评委分配弹窗：确定分配（手动分配校验后写入 reviewGroups[actId]，每行一个评委）
    Proto.registerAction('judge-confirm', function () {
      var rows = [];
      // 手动分配：校验每组均选择评委，作品数均匀分配（已取消系统随机抽评）
      var judges = MDS.get('judges') || [];
      var judgeById = {};
      judges.forEach(function (j) { judgeById[j.id] = j; });
      var curAct = activityById(amActivityId);
      var totalWorks = curAct ? (curAct.worksCount || 0) : 0;
      // 每组需评作品数：均匀分配（前几组可稍多），总和与实际作品数一致
      var base = Math.floor(totalWorks / judgeGroupCount);
      var remainder = totalWorks % judgeGroupCount;
      for (var g = 1; g <= judgeGroupCount; g++) {
        var ids = judgeAssignSel[g] || [];
        if (!ids.length) {
          Proto.showToast('请为第 ' + g + ' 组选择至少一位评委');
          return;
        }
        var workCount = base + (g <= remainder ? 1 : 0);
        ids.forEach(function (id) {
          var j = judgeById[id];
          rows.push({
            groupNo: g,
            judgeId: Number(id),
            judgeName: j ? j.name : '',
            judgeAccount: j ? (j.account || '') : '',
            workCount: workCount,
          });
        });
      }
      MDS.update('reviewGroups', function (map) {
        var next = Object.assign({}, map || {});
        next[amActivityId] = rows;
        return next;
      });
      Proto.closeDialog('judgeAssignDialog');
      renderActivityManage(qs('#pcPage'));
      Proto.showToast('评委分配完成');
    });

    // 归档阶段：发布评审结果（需确认）
    Proto.registerAction('am-publish-result', function (el) {
      var id = Number(el.getAttribute('data-id'));
      var a = activityById(id);
      if (!confirm('确定发布「' + (a ? a.title : '') + '」的评审结果吗？\n发布后活动进入归档阶段，教师端可查看获奖公示。')) return;
      MDS.update('activities', function (arr) {
        return arr.map(function (x) { return x.id === id ? Object.assign({}, x, { resultStatus: 'published' }) : x; });
      });
      renderActivityManage(qs('#pcPage'));
      Proto.showToast('评审结果已发布，活动进入归档');
    });

    // 归档阶段：归档（需确认）
    Proto.registerAction('am-archive', function (el) {
      var id = Number(el.getAttribute('data-id'));
      var a = activityById(id);
      if (!confirm('确定将「' + (a ? a.title : '') + '」归档吗？\n归档后活动进入历史归档，可查看与导出全量数据。')) return;
      MDS.update('activities', function (arr) {
        return arr.map(function (x) { return x.id === id ? Object.assign({}, x, { resultStatus: 'archived' }) : x; });
      });
      renderActivityManage(qs('#pcPage'));
      Proto.showToast('活动已归档');
    });

    // ── 电子奖状模板：新增 / 编辑 / 删除 / 保存 ──
    Proto.registerAction('cert-tpl-add', function () {
      fillCertTemplateDialog(null);
    });

    Proto.registerAction('cert-tpl-edit', function (el) {
      var id = Number(el.getAttribute('data-id'));
      var tpl = certTemplateById(id);
      if (tpl) fillCertTemplateDialog(tpl);
    });

    Proto.registerAction('cert-tpl-delete', function (el) {
      var id = Number(el.getAttribute('data-id'));
      var tpl = certTemplateById(id);
      if (!confirm('确定删除模板「' + (tpl ? tpl.name : '') + '」吗？\n已绑定该模板的活动将不再能生成奖状。')) return;
      MDS.update('certTemplates', function (arr) {
        return (arr || []).filter(function (t) { return t.id !== id; });
      });
      renderCertTemplate();
      Proto.showToast('已删除奖状模板');
    });

    Proto.registerAction('cert-tpl-save', function () {
      var name = (document.getElementById('certTplName') || {}).value || '';
      var content = (document.getElementById('certTplContent') || {}).value || '';
      if (!name.trim()) { Proto.showToast('请填写模板名称'); return; }
      if (!content.trim()) { Proto.showToast('请填写模板内容'); return; }
      var id = Number((document.getElementById('certTplId') || {}).value) || null;
      var tpl = {
        name: name.trim(),
        backgroundType: window.__certTplBgType || 'preset',
        background: window.__certTplBg || CERT_BG_PRESETS[0].key,
        content: content,
      };
      if (id) {
        MDS.update('certTemplates', function (arr) {
          return (arr || []).map(function (t) { return t.id === id ? Object.assign({}, t, tpl) : t; });
        });
      } else {
        tpl.id = Date.now();
        MDS.update('certTemplates', function (arr) {
          return (arr || []).concat([tpl]);
        });
      }
      Proto.closeDialog('certTemplateDialog');
      renderCertTemplate();
      Proto.showToast(id ? '模板已更新' : '已新增奖状模板');
    });

    // ── 电子奖状模板：背景预设 / 上传背景图 / 插入变量 ──
    Proto.registerAction('cert-bg-preset', function (el) {
      window.__certTplBgType = 'preset';
      window.__certTplBg = el.getAttribute('data-preset');
      renderCertBgPicker(window.__certTplBg);
      renderCertTplPreview();
    });

    Proto.registerAction('cert-bg-upload', function () {
      var input = document.getElementById('certBgFile');
      if (input) input.click();
    });

    Proto.registerAction('cert-insert-var', function (el) {
      var key = el.getAttribute('data-key');
      var ta = document.getElementById('certTplContent');
      if (!ta || !key) return;
      var start = ta.selectionStart == null ? ta.value.length : ta.selectionStart;
      var end = ta.selectionEnd == null ? ta.value.length : ta.selectionEnd;
      ta.value = ta.value.slice(0, start) + key + ta.value.slice(end);
      var pos = start + key.length;
      ta.focus();
      ta.setSelectionRange(pos, pos);
      renderCertTplPreview();
    });

    // ── 电子奖状：生成（确认后写入会话态生成状态） / 查看 ──
    Proto.registerAction('cert-generate', function () {
      var act = activityById(amActivityId);
      if (!act) return;
      if (!certTemplateById(act.certTemplateId)) {
        Proto.showToast('该活动未绑定奖状模板，请先在「活动发起」中绑定模板');
        return;
      }
      // 只为有奖项等级（获奖）的老师生成电子奖状
      var winners = buildArchiveItems(act).filter(function (it) { return it.awardName; });
      if (!winners.length) { Proto.showToast('暂无可生成奖状的获奖教师'); return; }
      if (!confirm('确定要为「' + act.title + '」的 ' + winners.length + ' 位获奖教师生成电子奖状吗？\n生成后可在下方结果列表中查看每位教师的奖状。')) return;
      var names = {};
      winners.forEach(function (it) { names[it.s.name] = true; });
      MDS.update('certStatus', function (map) {
        var next = Object.assign({}, map || {});
        next[act.id] = Object.assign({}, next[act.id] || {}, names);
        return next;
      });
      renderActivityManage(qs('#pcPage'));
      Proto.showToast('已为 ' + winners.length + ' 位获奖教师生成电子奖状');
    });

    Proto.registerAction('cert-view', function (el) {
      var act = activityById(Number(el.getAttribute('data-activity')));
      var teacher = el.getAttribute('data-teacher');
      if (!act) return;
      var tpl = certTemplateById(act.certTemplateId);
      var item = buildArchiveItems(act).filter(function (it) { return it.s.name === teacher; })[0];
      if (!item) return;
      var body = document.getElementById('certPreviewBody');
      if (body) {
        body.innerHTML = buildCertPreviewHtml(tpl, certVarMap(act, {
          name: item.s.name,
          className: item.s.className,
          kindergarten: item.s.kindergarten,
          rank: item.rank,
          awardName: item.awardName,
        }));
      }
      Proto.openDialog('certPreviewDialog');
    });

    // ── 电子奖状：活动发起/编辑「预览」按钮 → 弹窗预览所选模板内容 ──
    Proto.registerAction('cert-bind-preview', function (el) {
      var scope = el.getAttribute('data-scope') || 'add';
      var selectId = scope === 'add' ? 'actCertTemplate' : 'eActCertTemplate';
      var sel = document.getElementById(selectId);
      var id = sel ? Number(sel.value) : null;
      var tpl = id ? certTemplateById(id) : null;
      if (!tpl) { Proto.showToast('请先选择奖状模板'); return; }
      var body = document.getElementById('certPreviewBody');
      if (body) body.innerHTML = buildCertPreviewHtml(tpl, certSampleMap());
      Proto.openDialog('certPreviewDialog');
    });

    // ── 评委端：打分 ──
    Proto.registerAction('judge-open', function (el) {
      var id = Number(el.getAttribute('data-id'));
      fillJudgeDialog(id);
    });

    Proto.registerAction('judge-save', function () {
      var taskId = Number((document.getElementById('judgeTaskId') || {}).value);
      // 按活动关联评分标准动态生成的评分指标逐项取值（每个指标：分数 + 该指标评语，无总评）
      var fields = document.getElementById('judgeScoreFields');
      var rows = fields ? fields.querySelectorAll('.judge-score-row') : [];
      var values = [];
      var comments = [];
      var allFilled = rows.length > 0;
      rows.forEach(function (row) {
        var inp = row.querySelector('input.judge-score');
        var ta = row.querySelector('textarea.judge-comment');
        var v = ((inp && inp.value) || '').trim();
        if (!v) allFilled = false;
        values.push(v);
        comments.push(((ta && ta.value) || '').trim());
      });
      if (!allFilled) {
        Proto.showToast('请填写各指标评分');
        return;
      }
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
            scores: values.join(' / '),
            comments: comments,
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
    // 按作品所属活动关联评分标准动态渲染评分指标（无关联回退默认三维度）
    var indicators = judgeIndicatorsFor(w.activity);
    var hint = document.getElementById('judgeScoreHint');
    if (hint) hint.textContent = '评分指标 · ' + indicators.map(function (i) { return i.name + '（满分 ' + i.maxScore + '）'; }).join('、');
    var fields = document.getElementById('judgeScoreFields');
    if (fields) {
      // 每个评分指标：指标名称 + 指标说明 + 满分上限 + 分数输入 + 该指标评语（无总评）
      fields.innerHTML = indicators.map(function (ind, idx) {
        return (
          '<div class="judge-score-row">' +
          '<div class="js-head">' +
          '<span class="js-name">' + esc(ind.name) + '</span>' +
          '<span class="js-max">满分 ' + ind.maxScore + '</span>' +
          '<input class="pc-input judge-score" type="number" min="0" max="' + ind.maxScore + '" placeholder="0-' + ind.maxScore + '">' +
          '</div>' +
          (ind.desc ? '<div class="js-desc">' + esc(ind.desc) + '</div>' : '') +
          '<textarea class="judge-comment" rows="2" placeholder="该指标评语（选填）"></textarea>' +
          '</div>'
        );
      }).join('');
    }
    // 已打分作品回填分数与各指标评语（留痕可追溯）
    var record = (MDS.get('reviewRecords') || []).filter(function (r) { return r.work === w.work; })[0];
    if (record) {
      var parts = (record.scores || '').split('/');
      var comments = record.comments || [];
      if (fields) {
        fields.querySelectorAll('.judge-score-row').forEach(function (row, idx) {
          var inp = row.querySelector('input.judge-score');
          var ta = row.querySelector('textarea.judge-comment');
          if (inp) inp.value = (parts[idx] || '').trim();
          if (ta) ta.value = (comments[idx] || '');
        });
      }
    }
    Proto.openDialog('judgeDialog');
  }

  /* 评委打分指标：按作品所属活动关联的评分标准动态生成（无关联时回退默认三维度，来自 defaultIndicators mock）
     每项含 name 指标名 / desc 指标说明 / maxScore 满分上限 */
  function judgeIndicatorsFor(activityTitle) {
    var act = (MDS.get('activities') || []).filter(function (a) { return a.title === activityTitle; })[0];
    var std = act ? scoreStandardById(act.scoreStandardId) : null;
    if (std && std.indicators && std.indicators.length) {
      return std.indicators.map(function (ind) {
        return { name: ind.name, desc: ind.desc || '', maxScore: ind.maxScore || 100 };
      });
    }
    return (MDS.get('defaultIndicators') || []).map(function (ind) {
      return { name: ind.name, desc: ind.desc || '', maxScore: ind.maxScore || 100 };
    });
  }

  /* ═══════════════════════ 评委端：打分任务渲染 ═══════════════════════ */

  function buildJudgeTasks() {
    // 从作品数据派生评委任务（模拟分配给当前评委的活动）
    var works = MDS.get('works') || [];
    var records = MDS.get('reviewRecords') || [];
    // 已评判断：按「活动 + 教师」精确匹配（兼容留痕中「X的作品 / X的课件」两种命名），
    // 避免同教师跨活动同名作品被误判为已评
    function isDone(w) {
      return records.some(function (r) {
        return r.activity === w.activity && r.work.indexOf(w.teacher) >= 0;
      });
    }
    var tasks = works
      .filter(function (w) { return w.status === '评审中' || w.activity === '课件制作技能大赛'; })
      .map(function (w) {
        return {
          id: w.id,
          activity: w.activity,
          work: w.teacher + '的作品',
          teacher: w.teacher,
          type: w.type,
          done: isDone(w),
        };
      });
    // 补充已完成记录的映射（按活动 + 教师去重，保留跨活动评分历史）
    records.forEach(function (r) {
      var teacher = r.work.replace('的作品', '').replace('的课件', '');
      var exists = tasks.some(function (t) {
        return t.activity === r.activity && t.teacher === teacher;
      });
      if (!exists) {
        tasks.push({ id: Date.now() + r.id, activity: r.activity, work: r.work, teacher: teacher, type: '课件', done: true });
      }
    });
    return tasks;
  }

  var judgeActFilter = ''; // 评委打分：活动筛选值（先按活动筛选，再按具体活动评分）

  /* 作品综合评分：该作品全部评委评分的平均（取 1 位小数；未评分返回 null），卡片展示总分用 */
  function judgeWorkScore(t) {
    var records = (MDS.get('reviewRecords') || []).filter(function (r) {
      return r.activity === t.activity && r.work.indexOf(t.teacher) >= 0;
    });
    var total = 0, n = 0;
    records.forEach(function (r) {
      (r.scores || '').split('/').forEach(function (s) {
        var v = parseInt(s.trim(), 10);
        if (!isNaN(v)) { total += v; n++; }
      });
    });
    return n ? Math.round((total / n) * 10) / 10 : null;
  }

  function renderJudgeTasks() {
    var root = document.getElementById('judgeTaskList');
    if (!root) return;
    // 评委端为完整 PC 后台外壳，顶栏用户信息由 renderPcHeader 统一渲染
    var tasks = buildJudgeTasks();
    window.__judgeTasks = tasks;
    // 活动筛选下拉：按任务所属活动去重填充（保留当前选择）
    var actSel = document.getElementById('judgeActFilter');
    if (actSel) {
      var seen = {};
      var opts = ['<option value="">全部活动</option>'];
      tasks.forEach(function (t) {
        if (t.activity && !seen[t.activity]) {
          seen[t.activity] = true;
          opts.push('<option value="' + esc(t.activity) + '"' + (judgeActFilter === t.activity ? ' selected' : '') + '>' + esc(t.activity) + '</option>');
        }
      });
      actSel.innerHTML = opts.join('');
    }
    // 按所选活动过滤任务
    var filtered = judgeActFilter ? tasks.filter(function (t) { return t.activity === judgeActFilter; }) : tasks;
    var total = filtered.length;
    var done = filtered.filter(function (t) { return t.done; }).length;
    var count = document.getElementById('judgeTaskCount');
    if (count) count.textContent = '已评 ' + done + ' / 共 ' + total + ' 份';
    var progress = document.getElementById('judgeTaskProgress');
    if (progress) progress.style.width = (total ? Math.round((done / total) * 100) : 0) + '%';
    if (!filtered.length) {
      root.innerHTML = '<div class="pc-empty"><div class="empty-icon">📋</div><div>' + (judgeActFilter ? '该活动暂无打分任务' : '暂无打分任务') + '</div></div>';
      return;
    }
    root.innerHTML = filtered
      .map(function (t) {
        // 已完成作品：计算该作品综合评分（总分）并展示在卡片上
        var score = t.done ? judgeWorkScore(t) : null;
        return (
          '<div class="scheme-card' + (t.done ? '' : ' is-active') + '">' +
          '<div class="scheme-head">' +
          '<span class="scheme-name">' + esc(t.work) + '</span>' +
          (t.done ? '<span class="status-tag status-success">已完成</span>' : '<span class="status-tag status-warning">待打分</span>') +
          '</div>' +
          '<div class="scheme-meta">' + esc(t.activity) + ' · 提交教师 ' + esc(t.teacher) + ' · ' + esc(t.type) + '</div>' +
          (score !== null
            ? '<div class="judge-task-score">该作品总分：<b>' + score + '</b> 分</div>'
            : '') +
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

  /* ═══════════════════════ 重新渲染当前页 ═══════════════════════ */

  function rerenderCurrentPage() {
    if (document.getElementById('homeRoot')) renderMobileHome();
    if (document.getElementById('principalMiniRoot')) renderPrincipalMini();
    if (document.getElementById('activityList')) renderMobileActivity();
    if (document.getElementById('rankScoreRoot')) {
      renderMobileRankScore();
    }
    if (document.getElementById('statRoot')) renderMobileStat();
    if (document.getElementById('noticeList')) renderNoticeList();
    if (document.getElementById('mobileNoticeList')) renderMobileNotice();
    if (document.getElementById('announceDetailRoot')) renderAnnounceDetail();
    if (document.getElementById('activityDetailRoot')) renderActivityDetail();
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
    // 教师 PC 个人工作台：固定为教师角色（不随 localStorage 演示角色漂移）
    if (location.pathname.indexOf('teacher.html') >= 0) {
      MDS.setRole('teacher');
      window.__medalRole = 'teacher';
    }
    // 园长独立小程序页：固定为园长角色
    if (location.pathname.indexOf('principal.html') >= 0) {
      MDS.setRole('principal');
      window.__medalRole = 'principal';
    }
    registerActions();
    injectRoleFab();
    bindNotifyEvents();
    bindManageEvents();
    bindSpecTeacherEvents();

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
      // 活动筛选下拉由 renderJudgeTasks 动态重绘，用事件委托绑定变更
      document.addEventListener('change', function (e) {
        if (e.target && e.target.id === 'judgeActFilter') {
          judgeActFilter = e.target.value;
          renderJudgeTasks();
        }
      });
    }

    // 移动端：首页为角色化首页（hero + 社区宫格 + tabBar），二级页无 tabBar
    if (document.getElementById('homeRoot')) {
      renderMobileHome();
      renderTabBar(currentTabKey());
    }
    // 园长独立小程序页
    if (document.getElementById('principalMiniRoot')) {
      renderPrincipalMini();
    }
    if (document.getElementById('activityList')) {
      renderMobileActivity();
      document.querySelectorAll('[data-tab-group="actTab"]').forEach(function (tab) {
        tab.addEventListener('click', function () {
          mobileActTab = tab.getAttribute('data-tab-value') || 'all';
          renderMobileActivity();
        });
      });
    }
    if (document.getElementById('rankScoreRoot')) {
      renderMobileRankScore();
    }
    if (document.getElementById('statRoot')) {
      renderMobileStat();
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
    if (document.getElementById('mobileNoticeList')) renderMobileNotice();
    if (document.getElementById('announceDetailRoot')) renderAnnounceDetail();
    if (document.getElementById('activityDetailRoot')) renderActivityDetail();
    if (document.getElementById('mineAvatar')) {
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
    if (document.getElementById('activityManageRoot')) {
      renderActivityManage(qs('#pcPage'));
      // 活动切换由 bindManageEvents 委托处理（change 事件）
    }
    if (document.getElementById('activityQueryRoot')) {
      renderActivityQuery(qs('#pcPage'));
    }
    if (document.getElementById('rankBoardPanel')) {
      renderRankGarden(qs('#pcPage'));
    }
    if (document.getElementById('parentProgressRoot')) {
      renderRankParent(qs('#pcPage'));
    }
    if (document.getElementById('scoreSchemeList')) {
      renderScoreScheme(qs('#pcPage'));
    }
    if (document.getElementById('scoreObtainedRoot')) {
      renderScoreObtained(qs('#pcPage'));
    }
    if (document.getElementById('medalTeacherTbody')) {
      renderTeacherTable();
    }
    // 电子奖状模板页
    if (document.getElementById('certTemplateList')) {
      renderCertTemplate(qs('#pcPage'));
    }
    // 电子奖状模板：上传背景图（FileReader 转 data URL 预览）
    var certBgFile = document.getElementById('certBgFile');
    if (certBgFile) {
      certBgFile.addEventListener('change', function () {
        var file = certBgFile.files && certBgFile.files[0];
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function (e) {
          window.__certTplBgType = 'image';
          window.__certTplBg = e.target.result;
          renderCertBgPicker('');
          renderCertTplPreview();
        };
        reader.readAsDataURL(file);
      });
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
