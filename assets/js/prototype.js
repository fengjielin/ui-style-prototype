/**
 * ============================================================
 * 童蹊幼儿成长平台 · 原型模板 交互脚本（纯原生 JS）
 * 用途：事件委托统一处理原型常见交互，供 PC / 移动端模板共用
 * 机制：通过 data-action 属性驱动，避免在 HTML 中写内联事件
 * 支持：
 *   - data-action="open-dialog" / "close-dialog"  弹窗开合
 *   - data-action="toggle-sidebar"                 侧栏折叠
 *   - data-action="switch-tab"                     筛选 tab / tabBar 选中切换
 *   - data-action="switch-page"                    分页切换
 *   - data-action="show-toast"                     轻提示（移动端）
 * 扩展：暴露 window.Proto，业务脚本（demo.js）可通过
 *       Proto.registerAction(name, fn) 注册自定义 action，
 *       在 switch 的 default 分支统一分发，无需改本文件。
 * ============================================================
 */

(function () {
  'use strict';

  /* ────────────────────────── 轻提示（移动端） ────────────────────────── */
  function showToast(text) {
    var el = document.getElementById('mbToast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'mbToast';
      el.className = 'mb-toast';
      document.body.appendChild(el);
    }
    el.textContent = text;
    el.classList.add('is-show');
    clearTimeout(el._timer);
    el._timer = setTimeout(function () {
      el.classList.remove('is-show');
    }, 1600);
  }

  /* ────────────────────────── 弹窗开合 ────────────────────────── */
  function openDialog(dialogId) {
    var dialog = document.getElementById(dialogId);
    if (dialog) {
      dialog.hidden = false;
    }
  }

  function closeDialog(dialogId) {
    var dialog = document.getElementById(dialogId);
    if (dialog) {
      dialog.hidden = true;
    }
  }

  /* ────────────────────────── 侧栏折叠 ────────────────────────── */
  function toggleSidebar() {
    var sidebar = document.querySelector('.pc-sidebar');
    if (sidebar) {
      sidebar.classList.toggle('is-collapsed');
    }
  }

  /* ────────────────────────── tab 切换 ────────────────────────── */
  /* data-tab-group：同组互斥；data-tab-value：选中项标识 */
  function switchTab(el) {
    var group = el.getAttribute('data-tab-group');
    var value = el.getAttribute('data-tab-value');
    if (!group) return;

    var siblings = document.querySelectorAll('[data-tab-group="' + group + '"]');
    siblings.forEach(function (s) {
      s.classList.remove('is-active');
    });
    el.classList.add('is-active');

    // 同步触发同组的隐藏内容切换（可选：data-tab-panel 容器）
    var panel = document.querySelector('[data-tab-panel="' + group + '"]');
    if (panel) {
      var targets = panel.querySelectorAll('[data-tab-content]');
      targets.forEach(function (t) {
        t.hidden = t.getAttribute('data-tab-content') !== value;
      });
    }
  }

  /* ────────────────────────── 分页切换 ────────────────────────── */
  /* 数字页码切换高亮；"上一页/下一页"按钮不参与高亮（原型无真实分页） */
  function switchPage(el) {
    if (el.classList.contains('page-btn')) return;
    var group = el.getAttribute('data-page-group');
    if (!group) return;
    var siblings = document.querySelectorAll('[data-page-group="' + group + '"]');
    siblings.forEach(function (s) {
      s.classList.remove('is-active');
    });
    el.classList.add('is-active');
  }

  /* ────────────────────────── 自定义 action 注册表 ────────────────────────── */
  /* { actionName: fn(el) }，业务脚本通过 Proto.registerAction 注册 */
  var customActions = {};

  /* ────────────────────────── 事件委托 ────────────────────────── */
  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-action]');
    if (!el) return;

    var action = el.getAttribute('data-action');
    var target = el.getAttribute('data-target');

    switch (action) {
      case 'open-dialog':
        openDialog(target);
        break;
      case 'close-dialog':
        closeDialog(target);
        break;
      case 'toggle-sidebar':
        toggleSidebar();
        break;
      case 'switch-tab':
        switchTab(el);
        break;
      case 'switch-page':
        switchPage(el);
        break;
      case 'show-toast':
        showToast(el.getAttribute('data-toast') || el.textContent.trim());
        break;
      default:
        // 分发到业务脚本注册的自定义 action
        if (customActions[action]) {
          customActions[action](el);
        }
        break;
    }
  });

  // 点击遮罩空白处关闭弹窗（点击弹窗内部不关闭）
  document.addEventListener('click', function (e) {
    var mask = e.target.closest('.mask-layer');
    if (!mask) return;
    // 若点击目标在弹窗内部（.pc-dialog / .mb-sheet 等），不关闭
    if (e.target.closest('.pc-dialog, .mb-sheet')) return;
    if (mask.getAttribute('data-close-on-mask') === 'true') {
      mask.hidden = true;
    }
  });

  /* ────────────────────────── 对外暴露（供 demo.js 使用） ────────────────────────── */
  window.Proto = {
    showToast: showToast,
    openDialog: openDialog,
    closeDialog: closeDialog,
    toggleSidebar: toggleSidebar,
    registerAction: function (name, fn) {
      if (typeof name === 'string' && typeof fn === 'function') {
        customActions[name] = fn;
      }
    },
  };
})();
