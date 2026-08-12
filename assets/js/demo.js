/**
 * ============================================================
 * 童蹊幼儿成长平台 · 原型演示系统 页面渲染 + 业务交互（window.Demo）
 * 依赖：data-store.js（window.DS）、prototype.js（window.Proto）
 * 用途：
 *   - 角色解析（URL 参数 > localStorage > 默认 parent）
 *   - 自动注入角色切换浮动按钮/面板（所有 demo 页生效）
 *   - 按页面容器存在性调用各页 render 函数（home/list/mine/pc list/form-dialog）
 *   - 注册业务 data-action（role-switch / reset-demo / goto-index / navigate /
 *     notice-read / notice-all-read / notice-add / teacher-* / pc-menu-* / pc-tag-* 等）
 * PC 端管理台外壳（list.html）：
 *   - 侧边栏菜单按角色动态渲染（父子级、无图标、父级可展开/收起）
 *   - 点击子级菜单 → TagsView 新增并激活标签，面包屑/内容区同步切换
 *   - TagsView 标签保持原有顺序、点击仅切换高亮；支持 × 关闭、更多下拉（关闭其他/关闭全部）
 * 数据流：UI action → DS.set/update → watch → render 重绘
 * ============================================================
 */

window.Demo = (function () {
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

  /* 解析当前角色：URL ?role= 参数优先，其次 localStorage，缺省 parent */
  function resolveRole() {
    var fromUrl = getParam('role');
    if (fromUrl && DS.ROLE_KEYS.indexOf(fromUrl) >= 0) {
      DS.setRole(fromUrl); // 落库，供后续跳转共享
      return fromUrl;
    }
    return DS.get('role');
  }

  function currentRole() {
    return window.__demoRole || 'parent';
  }

  /* ═══════════════════════ 角色切换浮动按钮 / 面板 ═══════════════════════ */

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
    DS.ROLE_KEYS.forEach(function (key) {
      var item = document.createElement('div');
      item.className = 'role-item' + (key === currentRole() ? ' is-current' : '');
      item.setAttribute('data-action', 'role-switch');
      item.setAttribute('data-role', key);
      var dot = document.createElement('span');
      dot.className = 'role-dot';
      dot.style.background = { parent: '#ff8a00', teacher: '#66cc99', principal: '#a855f7', logistics: '#6366f1', admin: '#2563eb' }[key] || '#ff8a00';
      var txt = document.createElement('span');
      txt.textContent = DS.ROLES[key].name;
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

    // 点击面板外关闭
    document.addEventListener('click', function (e) {
      if (e.target.closest('#roleFab') || e.target.closest('#rolePanel')) return;
      panel.hidden = true;
    });
  }

  /* ═══════════════════════ 各页面 render 函数 ═══════════════════════ */

  /* ── 移动端：底部 tabBar ── */
  function renderTabBar(activeKey) {
    var root = document.getElementById('tabbarRoot');
    if (!root) return;
    var items = DS.get('tabBar') || [];
    root.innerHTML = items
      .map(function (it) {
        var active = it.key === activeKey ? ' is-active' : '';
        var badge = it.badge ? '<span class="badge">' + it.badge + '</span>' : '';
        return (
          '<div class="tab-item' + active + '" data-action="navigate" data-path="' + esc(it.href) + '">' +
          '<span class="tab-icon">' + it.icon + '</span>' +
          '<span>' + it.text + '</span>' +
          badge +
          '</div>'
        );
      })
      .join('');
  }

  /* ── 移动端：首页 hero + 宫格 ── */
  function renderHome() {
    var role = currentRole();
    var heroRoot = document.getElementById('heroRoot');
    var gridRoot = document.getElementById('gridRoot');
    var navTitle = qs('.mb-navbar .nav-title');

    // 导航标题按角色写入
    if (navTitle) {
      var titles = { parent: '童蹊家园', teacher: '教师工作台', principal: '园长工作台', logistics: '后勤工作台' };
      navTitle.textContent = titles[role] || '童蹊家园';
    }

    // hero
    if (heroRoot) {
      var p = DS.get('userProfile');
      var att = DS.get('attendance')[role] || {};
      var html = '';
      html += '<div class="hero-card">';
      html += '<div class="hero-top">';
      html += '<div class="hero-avatar">' + esc(p.avatar) + '</div>';
      html += '<div class="hero-info">';
      html += '<div class="hero-name">' + esc(p.name) + '</div>';
      html += '<div class="hero-class">' + esc(p.roleLine) + '</div>';
      html += '<div class="hero-date">2026年8月11日 星期二</div>';
      html += '</div></div>';

      // 教师/园长：指标胶囊
      if (role === 'teacher' || role === 'principal') {
        html +=
          '<div class="metric-chips">' +
          '<div class="metric-chip"><span class="num">' + (role === 'teacher' ? '35' : '280') + '</span><span class="label">在册幼儿</span></div>' +
          '<div class="metric-chip"><span class="num">' + (role === 'teacher' ? '32' : '256') + '</span><span class="label">今日出勤</span></div>' +
          '<div class="metric-chip"><span class="num absent">' + (role === 'teacher' ? '3' : '24') + '</span><span class="label">缺勤/请假</span></div>' +
          '</div>';
      }
      html += '</div>';

      // 出勤/报餐横幅（点击可切换状态，演示数据交互）
      var tagClasses = {
        '已到园': 'tag-present',
        '已到 32': 'tag-present',
        '已到 256': 'tag-present',
        '待确认': 'tag-pending',
        '请假': 'tag-leave',
        '缺勤': 'tag-absent',
      };
      var tagCls = att.tagClass || tagClasses[att.tag] || 'tag-present';
      html +=
        '<div class="hero-attendance-banner" data-action="toggle-attendance" title="点击切换状态">' +
        '<div class="banner-icon">✓</div>' +
        '<div class="banner-body">' +
        '<div class="banner-title">' + esc(att.title) + '</div>' +
        '<div class="banner-sub">' + esc(att.sub) + '</div>' +
        '</div>' +
        '<span class="banner-tag ' + tagCls + '">' + esc(att.tag) + '</span>' +
        '</div>';

      heroRoot.innerHTML = html;
    }

    // 宫格
    if (gridRoot) {
      renderGrid(gridRoot);
    }
  }

  function renderGrid(root) {
    var modules = DS.get('gridModules');
    if (!modules || !modules.length) return;

    // 分组结构：数组元素含 items 属性（教师/园长/后勤）；否则为平铺（家长）
    var isGrouped = !!modules[0] && !!modules[0].items;
    if (isGrouped) {
      var groupHtml = '';
      modules.forEach(function (sec) {
        if (sec.title) {
          groupHtml +=
            '<div class="mb-section-title"><span class="title">' + esc(sec.title) + '</span><span class="subtitle">点击进入功能</span></div>';
        }
        groupHtml += gridWrapHtml(sec.items);
      });
      root.innerHTML = groupHtml;
    } else {
      root.innerHTML = gridWrapHtml(modules);
    }
  }

  function gridWrapHtml(items) {
    var cells = items
      .map(function (it) {
        var badge = it.badge ? '<div class="mb-grid-icon grid-badge" style="background:' + esc(it.bg) + ';color:' + esc(it.color) + '">' + esc(it.icon) + '</div>' : '';
        var icon = badge || '<div class="mb-grid-icon" style="background:' + esc(it.bg) + ';color:' + esc(it.color) + '">' + esc(it.icon) + '</div>';
        var nameCls = it.highlight ? 'mb-grid-name is-highlight' : 'mb-grid-name';
        var path = it.path || 'list.html';
        return (
          '<div class="mb-grid-item" data-action="navigate" data-path="' + esc(path) + '">' +
          icon +
          '<div class="' + nameCls + '">' + esc(it.name) + '</div>' +
          '</div>'
        );
      })
      .join('');
    return '<div class="mb-grid-wrap"><div class="mb-grid">' + cells + '</div></div>';
  }

  /* ── 移动端：通知列表 ── */
  var noticeFilter = 'all';

  function renderNoticeList() {
    var root = document.getElementById('noticeList');
    if (!root) return;
    var all = DS.get('notices') || [];
    var list = all.filter(function (n) {
      switch (noticeFilter) {
        case 'unread':
          return !n.read;
        case 'read':
          return n.read;
        case 'notice':
          return n.type === 'notice';
        case 'share':
          return n.type === 'share';
        default:
          return true;
      }
    });
    if (!list.length) {
      root.innerHTML = '<div class="mb-empty-tip">暂无通知</div>';
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

  /* ── 移动端：我的页 ── */
  var MINE_MENUS = {
    parent: ['账号信息', '家庭关系', '孩子信息', '消息通知', '客服中心', '应用设置', '关于我们'],
    teacher: ['账号信息', '班级管理', '我的课表', '消息通知', '客服中心', '应用设置', '关于我们'],
    principal: ['账号信息', '园所管理', '教职工管理', '消息通知', '客服中心', '应用设置', '关于我们'],
    logistics: ['账号信息', '食堂管理', '安全巡查', '消息通知', '客服中心', '应用设置', '关于我们'],
    admin: ['账号信息', '系统管理', '操作日志', '消息通知', '客服中心', '应用设置', '关于我们'],
  };
  var MINE_ICONS = ['▣', '♥', '◉', '☏', '☺', '⚙', '⌂'];

  function renderMine() {
    var role = currentRole();
    var p = DS.get('userProfile');
    var avatar = document.getElementById('mineAvatar');
    var name = document.getElementById('mineName');
    var roleLine = document.getElementById('mineRole');
    if (avatar) avatar.textContent = p.avatar;
    if (name) name.textContent = p.name;
    if (roleLine) roleLine.textContent = p.roleLine;

    var menuRoot = document.getElementById('mineMenu');
    if (menuRoot) {
      var menus = MINE_MENUS[role] || MINE_MENUS.parent;
      menuRoot.innerHTML = menus
        .map(function (m, i) {
          return (
            '<div class="list-cell list-cell-arrow" data-action="show-toast" data-toast="' + esc(m) + '">' +
            '<span class="menu-icon">' + (MINE_ICONS[i] || '▣') + '</span>' + esc(m) +
            '</div>'
          );
        })
        .join('');
    }
  }

  /* ── PC 端：教师表格 CRUD + 搜索 ── */
  var teacherSearch = { name: '', phone: '', className: '', hireDate: '' };
  var editingTeacherId = null;

  function statusTagClass(status) {
    return { '在职': 'status-primary', '正常': 'status-success', '离职': 'status-danger', '试用': 'status-warning' }[status] || 'status-primary';
  }

  function filteredTeachers() {
    var all = DS.get('teachers') || [];
    var s = teacherSearch;
    return all.filter(function (t) {
      if (s.name && t.name.indexOf(s.name) < 0) return false;
      if (s.phone && t.phone.indexOf(s.phone) < 0) return false;
      if (s.className && t.className !== s.className) return false;
      if (s.hireDate && t.hireDate !== s.hireDate) return false;
      return true;
    });
  }

  function renderTeacherTable() {
    var tbody = document.getElementById('teacherTbody');
    var count = document.getElementById('tableCount');
    var pageTotal = document.getElementById('pageTotal');
    var list = filteredTeachers();
    if (count) count.textContent = '共 ' + list.length + ' 条记录';
    if (pageTotal) pageTotal.textContent = list.length;
    if (!tbody) return;
    if (!list.length) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:#909399;padding:40px 0;">暂无匹配记录</td></tr>';
      return;
    }
    tbody.innerHTML = list
      .map(function (t) {
        return (
          '<tr>' +
          '<td><input type="checkbox" data-id="' + t.id + '" class="teacher-check"></td>' +
          '<td><span class="cell-avatar">' + esc(t.name.charAt(0)) + '</span>' + esc(t.name) + '</td>' +
          '<td>' + esc(t.gender) + '</td>' +
          '<td>' + esc(t.phone) + '</td>' +
          '<td>' + esc(t.className) + '</td>' +
          '<td>' + esc(t.hireDate) + '</td>' +
          '<td><span class="status-tag ' + statusTagClass(t.status) + '">' + esc(t.status) + '</span></td>' +
          '<td class="op-col">' +
          '<span class="action-btn action-edit" data-action="teacher-edit" data-id="' + t.id + '">编辑</span>' +
          '<span class="action-btn action-delete" data-action="teacher-delete" data-id="' + t.id + '">删除</span>' +
          '</td>' +
          '</tr>'
        );
      })
      .join('');
  }

  /* ── PC 端：formLog 提交记录 ── */
  function renderFormLog() {
    var tbody = document.getElementById('formLog');
    if (!tbody) return;
    var logs = DS.get('formLog') || [];
    var count = document.getElementById('formLogCount');
    if (count) count.textContent = '共 ' + logs.length + ' 条';
    if (!logs.length) {
      tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;color:#909399;padding:30px 0;">暂无提交记录</td></tr>';
      return;
    }
    tbody.innerHTML = logs
      .map(function (l) {
        return '<tr><td>' + esc(l.name) + '</td><td>' + esc(l.phone) + '</td><td>' + esc(l.time) + '</td></tr>';
      })
      .join('');
  }

  /* ── PC 端：顶栏用户名 + 全选（checkAll 事件仅绑定一次） ── */
  var pcHeaderBound = false;

  function renderPcHeader() {
    var user = document.getElementById('pcUserName');
    if (user) {
      var p = DS.get('userProfile');
      user.textContent = p.name;
    }
    var checkAll = document.getElementById('checkAll');
    if (checkAll && !pcHeaderBound) {
      pcHeaderBound = true;
      checkAll.addEventListener('change', function () {
        var tbody = document.getElementById('teacherTbody');
        var checks = tbody ? tbody.querySelectorAll('.teacher-check') : [];
        checks.forEach(function (c) {
          c.checked = checkAll.checked;
        });
      });
    }
  }

  /* ═══════════════════════ PC 端：动态菜单 + TagsView 联动 + 内容切换 ═══════════════════════ */

  /* 当前角色 PC 菜单（父子级，来自 data-store PC_MENUS） */
  function pcMenus() {
    return DS.get('pcMenus') || [];
  }

  /* 按 key 查询子级菜单（含所属父级标题），返回 { groupTitle, key, title }；查不到返回 null */
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
    return null;
  }

  /* 当前角色默认子级菜单（第一个父级的第一项）；无菜单时返回空串 */
  function defaultMenuKey() {
    var menus = pcMenus();
    for (var i = 0; i < menus.length; i++) {
      var children = menus[i].children || [];
      if (children.length) return children[0].key;
    }
    return '';
  }

  /* 解析初始激活菜单 key：URL ?menu= → 保存的 pcActiveTag → 角色默认（仅在初始化时调用一次） */
  function resolveActiveKey() {
    var fromUrl = getParam('menu');
    if (fromUrl && findMenuByKey(fromUrl)) return fromUrl;
    var saved = DS.get('pcActiveTag');
    if (saved && findMenuByKey(saved)) return saved;
    return defaultMenuKey();
  }

  /* 过滤标签：仅保留当前角色菜单内的标签（去重），并校正标题；无「首页」固定标签 */
  function normalizeTags(tags) {
    var menuKeys = {};
    pcMenus().forEach(function (g) {
      (g.children || []).forEach(function (c) {
        menuKeys[c.key] = c.title;
      });
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

  /* 初始化激活项：应用 URL / 保存状态 / 角色默认，并补齐对应标签（仅调用一次） */
  function seedPcActive() {
    var active = resolveActiveKey();
    DS.set('pcActiveTag', active);
    var tags = normalizeTags(DS.get('pcTags'));
    if (active) {
      var exists = tags.some(function (t) { return t.key === active; });
      if (!exists) {
        var info = findMenuByKey(active);
        if (info) tags = tags.concat([{ key: info.key, title: info.title }]);
      }
    }
    DS.set('pcTags', tags);
  }

  /* 校正界面状态：激活项合法、激活标签存在；允许空激活（关闭全部后） */
  function ensureActiveState() {
    var active = DS.get('pcActiveTag');
    if (active && !findMenuByKey(active)) active = '';
    var tags = normalizeTags(DS.get('pcTags'));
    if (active) {
      var exists = tags.some(function (t) { return t.key === active; });
      if (!exists) {
        var info = findMenuByKey(active);
        if (info) tags = tags.concat([{ key: info.key, title: info.title }]);
      }
    }
    DS.set('pcTags', tags);
    DS.set('pcActiveTag', active);
  }

  /* 激活标签：选中菜单或点击标签时调用。标签保持原有顺序（不移动到末尾），仅切换高亮；新菜单标签追加在末尾 */
  function activateTag(key) {
    var info = findMenuByKey(key);
    if (!info) return;
    var tags = normalizeTags(DS.get('pcTags'));
    var exists = tags.some(function (t) { return t.key === key; });
    if (!exists) {
      tags = tags.concat([{ key: info.key, title: info.title }]);
    }
    DS.set('pcTags', tags);
    DS.set('pcActiveTag', key);
    renderPcShell();
  }

  /* 关闭标签：激活标签被关闭时，激活其相邻标签；全部关闭后激活为空 */
  function closeTag(key) {
    if (!key) return;
    var tags = normalizeTags(DS.get('pcTags'));
    var idx = -1;
    tags.forEach(function (t, i) {
      if (t.key === key) idx = i;
    });
    if (idx < 0) return;
    var active = DS.get('pcActiveTag');
    if (active === key) {
      var rest = tags.filter(function (t) { return t.key !== key; });
      var neighbor = rest.length ? rest[Math.min(idx, rest.length - 1)] : null;
      active = neighbor ? neighbor.key : '';
    }
    tags.splice(idx, 1);
    DS.set('pcTags', tags);
    DS.set('pcActiveTag', active);
    renderPcShell();
  }

  function closeOtherTags() {
    var active = DS.get('pcActiveTag');
    var info = findMenuByKey(active);
    DS.set('pcTags', info ? [{ key: info.key, title: info.title }] : []);
    DS.set('pcActiveTag', active);
    renderPcShell();
  }

  function closeAllTags() {
    DS.set('pcTags', []);
    DS.set('pcActiveTag', '');
    renderPcShell();
  }

  /* 渲染侧边栏：父级可展开/收起，子级可选中；折叠态仅显示父级首字 */
  function renderPcMenu() {
    var root = document.getElementById('pcMenuRoot');
    if (!root) return;
    var menus = pcMenus();
    var active = DS.get('pcActiveTag');
    var expanded = DS.get('pcExpanded') || [];
    var collapsed = !!document.querySelector('.pc-sidebar.is-collapsed');

    if (!menus.length) {
      root.innerHTML = '<div style="padding:20px 14px;font-size:13px;color:#909399;line-height:1.8;">当前角色暂无<br>PC 后台菜单</div>';
      return;
    }

    var html = '';
    menus.forEach(function (group) {
      var children = group.children || [];
      var isOpen = collapsed
        ? false
        : expanded.indexOf(group.title) >= 0 || children.some(function (c) { return c.key === active; });
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

  /* 渲染 TagsView：按标签原有顺序渲染，激活态青绿；全部标签可关闭（无固定标签） */
  function renderTagsView() {
    var root = document.getElementById('pcTagsRoot');
    if (!root) return;
    var tags = normalizeTags(DS.get('pcTags'));
    var active = DS.get('pcActiveTag');
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

  /* 渲染面包屑：父级 / 子级；无激活项时为空 */
  function renderBreadcrumb() {
    var el = document.getElementById('pcBreadcrumb');
    if (!el) return;
    var active = DS.get('pcActiveTag');
    var info = findMenuByKey(active);
    if (!info) {
      el.innerHTML = '';
      return;
    }
    el.innerHTML =
      '<span>' + esc(info.groupTitle) + '</span><span class="sep">/</span>' +
      '<span class="current">' + esc(info.title) + '</span>';
  }

  /* 渲染内容区：教师管理显示真实表格，其余显示建设中占位；无激活项时提示选择菜单 */
  function renderPageContent() {
    var active = DS.get('pcActiveTag');
    var teacherBlock = document.getElementById('pageTeacher');
    var placeholder = document.getElementById('pagePlaceholder');
    if (teacherBlock) teacherBlock.hidden = active !== 'teacher';
    if (!placeholder) return;

    if (active === 'teacher') {
      placeholder.hidden = true;
      placeholder.innerHTML = '';
      return;
    }
    if (!active) {
      placeholder.innerHTML =
        '<section class="pc-card">' +
        '<div class="card-head"><span class="card-title">页面</span></div>' +
        '<div class="card-body">' +
        '<div class="pc-empty">' +
        '<div class="empty-icon">📄</div>' +
        '<div>请点击左侧菜单查看对应页面</div>' +
        '</div></div></section>';
      placeholder.hidden = false;
      return;
    }
    var info = findMenuByKey(active);
    var title = info ? info.title : '功能';
    placeholder.innerHTML =
      '<section class="pc-card">' +
      '<div class="card-head"><span class="card-title">' + esc(title) + '</span></div>' +
      '<div class="card-body">' +
      '<div class="pc-empty">' +
      '<div class="empty-icon">🚧</div>' +
      '<div>「' + esc(title) + '」原型建设中</div>' +
      '<div style="margin-top:8px;font-size:12px;color:#909399;">该页面用于演示：侧边栏菜单动态控制 + TagsView 随选中菜单联动切换</div>' +
      '</div></div></section>';
    placeholder.hidden = false;
  }

  /* 统一渲染 PC 外壳（菜单 + TagsView + 面包屑 + 内容区） */
  function renderPcShell() {
    ensureActiveState();
    renderPcMenu();
    renderTagsView();
    renderBreadcrumb();
    renderPageContent();
    // 收起更多下拉
    var menu = document.getElementById('tagsMoreMenu');
    if (menu) menu.hidden = true;
  }

  /* TagsView 更多下拉开关 */
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

  /* ═══════════════════════ 业务 action 注册 ═══════════════════════ */

  function registerActions() {
    // 角色切换
    Proto.registerAction('role-switch', function (el) {
      var role = el.getAttribute('data-role');
      if (!role) return;
      DS.setRole(role);
      location.href = DS.ROLES[role].home;
    });

    // 返回入口页
    Proto.registerAction('goto-index', function () {
      var from = location.pathname;
      if (from.indexOf('/pc/') >= 0 || from.indexOf('/mobile/') >= 0) {
        location.href = '../index.html';
      } else {
        location.href = 'index.html';
      }
    });

    // 重置演示数据（保留当前角色）
    Proto.registerAction('reset-demo', function () {
      DS.resetAll();
      rerenderCurrentPage();
      Proto.showToast('已重置为默认数据');
      var panel = document.getElementById('rolePanel');
      if (panel) panel.hidden = true;
    });

    // 角色面板开关
    Proto.registerAction('role-fab-toggle', function () {
      var panel = document.getElementById('rolePanel');
      if (panel) panel.hidden = !panel.hidden;
    });

    // 页面内导航（宫格 / tabBar 跳转）
    Proto.registerAction('navigate', function (el) {
      var path = el.getAttribute('data-path');
      if (!path) return;
      location.href = path;
    });

    // 出勤横幅切换状态（演示数据交互）
    Proto.registerAction('toggle-attendance', function () {
      var role = currentRole();
      var att = DS.get('attendance');
      var cur = att[role] || {};
      var seq = ['已到园', '请假', '缺勤', '已到园'];
      var seqTag = { '已到园': ['已到园', 'tag-present'], 请假: ['请假', 'tag-leave'], 缺勤: ['缺勤', 'tag-absent'] };
      var next = seq[(seq.indexOf(cur.tag) + 1) % 3];
      var mapped = seqTag[next];
      att[role] = { title: cur.title, sub: cur.sub, tag: mapped[0], tagClass: mapped[1] };
      DS.set('attendance', att);
      Proto.showToast('出勤状态已切换为「' + mapped[0] + '」');
    });

    // ── 移动端：通知列表 ──
    Proto.registerAction('notice-read', function (el) {
      var id = el.getAttribute('data-id');
      DS.update('notices', function (arr) {
        return arr.map(function (n) {
          return n.id === id ? Object.assign({}, n, { read: true }) : n;
        });
      });
      Proto.showToast('已标记为已读');
    });

    Proto.registerAction('notice-all-read', function () {
      DS.update('notices', function (arr) {
        return arr.map(function (n) {
          return Object.assign({}, n, { read: true });
        });
      });
      Proto.showToast('已全部标记为已读');
    });

    // 新增通知弹层
    Proto.registerAction('open-sheet', function () {
      var mask = document.getElementById('noticeSheet');
      if (mask) mask.hidden = false;
    });

    Proto.registerAction('close-sheet', function () {
      var mask = document.getElementById('noticeSheet');
      if (mask) mask.hidden = true;
    });

    Proto.registerAction('notice-add', function () {
      var title = document.getElementById('noticeTitle');
      var desc = document.getElementById('noticeDesc');
      var from = document.getElementById('noticeFrom');
      var type = document.getElementById('noticeType');
      if (!title || !title.value.trim()) {
        Proto.showToast('请填写标题');
        return;
      }
      var n = {
        id: 'n' + Date.now(),
        title: title.value.trim(),
        desc: (desc && desc.value.trim()) || '暂无描述',
        time: '刚刚',
        from: (from && from.value.trim()) || '我',
        type: (type && type.value) || 'notice',
        read: false,
      };
      DS.update('notices', function (arr) {
        return [n].concat(arr || []);
      });
      if (title) title.value = '';
      if (desc) desc.value = '';
      Proto.closeDialog('noticeSheet');
      noticeFilter = 'all';
      // 同步筛选 tab 高亮
      document.querySelectorAll('[data-tab-group="read"]').forEach(function (s) {
        s.classList.toggle('is-active', s.getAttribute('data-tab-value') === 'all');
      });
      Proto.showToast('已新增通知');
    });

    // ── PC 端：教师表格 ──
    Proto.registerAction('teacher-search', function () {
      teacherSearch.name = (qs('#searchName') || {}).value || '';
      teacherSearch.phone = (qs('#searchPhone') || {}).value || '';
      teacherSearch.className = (qs('#searchClass') || {}).value || '';
      teacherSearch.hireDate = (qs('#searchDate') || {}).value || '';
      renderTeacherTable();
    });

    Proto.registerAction('teacher-reset', function () {
      teacherSearch = { name: '', phone: '', className: '', hireDate: '' };
      ['#searchName', '#searchPhone', '#searchDate'].forEach(function (sel) {
        var el = qs(sel);
        if (el) el.value = '';
      });
      var cls = qs('#searchClass');
      if (cls) cls.value = '';
      renderTeacherTable();
    });

    Proto.registerAction('teacher-edit', function (el) {
      var id = Number(el.getAttribute('data-id'));
      var t = (DS.get('teachers') || []).filter(function (x) {
        return x.id === id;
      })[0];
      if (!t) return;
      editingTeacherId = id;
      var fields = { editName: t.name, editGender: t.gender, editPhone: t.phone, editClass: t.className, editStatus: t.status };
      Object.keys(fields).forEach(function (fid) {
        var input = document.getElementById(fid);
        if (input) input.value = fields[fid];
      });
      Proto.openDialog('editDialog');
    });

    Proto.registerAction('teacher-save-edit', function () {
      var t = (DS.get('teachers') || []).filter(function (x) {
        return x.id === editingTeacherId;
      })[0];
      if (!t) return;
      var name = (document.getElementById('editName') || {}).value || '';
      if (!name) {
        Proto.showToast('请填写姓名');
        return;
      }
      DS.update('teachers', function (arr) {
        return arr.map(function (x) {
          return x.id === editingTeacherId
            ? Object.assign({}, x, {
                name: name,
                gender: (document.getElementById('editGender') || {}).value || x.gender,
                phone: (document.getElementById('editPhone') || {}).value || x.phone,
                className: (document.getElementById('editClass') || {}).value || x.className,
                status: (document.getElementById('editStatus') || {}).value || x.status,
              })
            : x;
        });
      });
      Proto.closeDialog('editDialog');
      Proto.showToast('已更新');
    });

    Proto.registerAction('teacher-delete', function (el) {
      var id = Number(el.getAttribute('data-id'));
      DS.update('teachers', function (arr) {
        return arr.filter(function (x) {
          return x.id !== id;
        });
      });
      Proto.showToast('已删除');
    });

    Proto.registerAction('teacher-save-add', function () {
      var name = (document.getElementById('addName') || {}).value || '';
      var phone = (document.getElementById('addPhone') || {}).value || '';
      if (!name || !phone) {
        Proto.showToast('请填写必填项（姓名、手机号）');
        return;
      }
      var t = {
        id: Date.now(),
        name: name,
        gender: (document.getElementById('addGender') || {}).value || '女',
        phone: phone,
        className: (document.getElementById('addClass') || {}).value || '小一班',
        hireDate: (document.getElementById('addDate') || {}).value || '2026-08-11',
        status: (document.getElementById('addStatus') || {}).value || '在职',
      };
      DS.update('teachers', function (arr) {
        return arr.concat([t]);
      });
      // 清空表单
      ['addName', 'addPhone', 'addDate'].forEach(function (id) {
        var el = document.getElementById(id);
        if (el) el.value = '';
      });
      Proto.closeDialog('addDialog');
      Proto.showToast('已新增教师');
    });

    Proto.registerAction('teacher-batch-delete', function () {
      var checks = document.querySelectorAll('.teacher-check:checked');
      if (!checks.length) {
        Proto.showToast('请先勾选要删除的行');
        return;
      }
      var ids = {};
      checks.forEach(function (c) {
        ids[Number(c.getAttribute('data-id'))] = true;
      });
      DS.update('teachers', function (arr) {
        return arr.filter(function (x) {
          return !ids[x.id];
        });
      });
      Proto.showToast('已删除所选 ' + checks.length + ' 条');
    });

    // ── PC 端：formLog 提交 ──
    Proto.registerAction('form-submit', function () {
      var name = (document.getElementById('logName') || {}).value || '';
      var phone = (document.getElementById('logPhone') || {}).value || '';
      if (!name || !phone) {
        Proto.showToast('请填写姓名和手机号');
        return;
      }
      DS.update('formLog', function (arr) {
        return (arr || []).concat([{ id: Date.now(), name: name, phone: phone, time: '刚刚' }]);
      });
      Proto.showToast('提交成功');
    });

    // ── PC 端：动态菜单 + TagsView 联动 ──
    Proto.registerAction('pc-menu-toggle', function (el) {
      // 折叠态点击父级：先展开侧栏再展开菜单
      var sidebar = document.querySelector('.pc-sidebar');
      if (sidebar && sidebar.classList.contains('is-collapsed')) {
        sidebar.classList.remove('is-collapsed');
      }
      var title = el.getAttribute('data-menu-parent');
      if (!title) return;
      var expanded = DS.get('pcExpanded') || [];
      var idx = expanded.indexOf(title);
      if (idx >= 0) {
        expanded.splice(idx, 1);
      } else {
        expanded.push(title);
      }
      DS.set('pcExpanded', expanded);
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
  }

  /* ═══════════════════════ 重新渲染当前页 ═══════════════════════ */

  function rerenderCurrentPage() {
    if (document.getElementById('heroRoot')) renderHome();
    if (document.getElementById('noticeList')) renderNoticeList();
    if (document.getElementById('mineMenu')) renderMine();
    if (document.getElementById('teacherTbody')) renderTeacherTable();
    if (document.getElementById('formLog')) renderFormLog();
    if (document.getElementById('tabbarRoot')) renderTabBar(currentTabKey());
    if (document.getElementById('pcUserName') || document.getElementById('checkAll')) renderPcHeader();
    if (document.getElementById('pcMenuRoot')) renderPcShell();
  }

  function currentTabKey() {
    var path = location.pathname;
    if (path.indexOf('mine.html') >= 0) return 'mine';
    if (path.indexOf('list.html') >= 0) return 'msg';
    return 'home';
  }

  /* ═══════════════════════ 初始化 ═══════════════════════ */

  function init() {
    DS.init();
    window.__demoRole = resolveRole();
    registerActions();
    injectRoleFab();

    // 入口页：显示当前角色 + 重置按钮
    var curRoleEl = document.getElementById('curRole');
    if (curRoleEl) {
      var r = DS.get('role');
      curRoleEl.textContent = DS.ROLES[r].name;
    }
    var entryReset = document.getElementById('entryReset');
    if (entryReset) {
      entryReset.addEventListener('click', function () {
        DS.resetAll();
        Proto.showToast('已重置演示数据');
      });
    }

    // 各页面 render + watcher
    if (document.getElementById('heroRoot')) {
      renderHome();
      DS.watch('attendance', function () {
        renderHome();
      });
    }
    if (document.getElementById('noticeList')) {
      renderNoticeList();
      DS.watch('notices', function () {
        renderNoticeList();
      });
      // 筛选 tab 变化
      document.querySelectorAll('[data-tab-group="read"]').forEach(function (tab) {
        tab.addEventListener('click', function () {
          noticeFilter = tab.getAttribute('data-tab-value') || 'all';
          renderNoticeList();
        });
      });
    }
    if (document.getElementById('mineMenu') || document.getElementById('tabbarRoot')) {
      renderMine();
      renderTabBar(currentTabKey());
    }
    if (document.getElementById('teacherTbody')) {
      renderTeacherTable();
      renderPcHeader();
      DS.watch('teachers', function () {
        renderTeacherTable();
      });
    }
    if (document.getElementById('formLog')) {
      renderFormLog();
      DS.watch('formLog', function () {
        renderFormLog();
      });
    }
    // PC 端管理台外壳：动态菜单 + TagsView 联动
    if (document.getElementById('pcMenuRoot')) {
      // 首次初始化激活项（URL ?menu= / 保存状态 / 角色默认）
      seedPcActive();
      renderPcShell();
      // 侧栏折叠/展开后重绘菜单（折叠态仅显示父级首字）
      var hamburger = document.querySelector('.nav-hamburger');
      if (hamburger) {
        hamburger.addEventListener('click', function () {
          setTimeout(renderPcMenu, 0);
        });
      }
      // 点击 TagsView 更多下拉外部关闭
      document.addEventListener('click', function (e) {
        var more = document.getElementById('pcTagsMore');
        if (!more || e.target.closest('#pcTagsMore')) return;
        var menu = document.getElementById('tagsMoreMenu');
        if (menu) menu.hidden = true;
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
