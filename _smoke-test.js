/**
 * 奖金梯度配置原型 · 冒烟测试（Node 环境，无浏览器）
 * 用最小 DOM 模拟驱动 medal.js 的 init()，覆盖「奖金梯度配置」页渲染与交互，验证无运行时错误。
 * 运行：node _smoke-test.js
 */
'use strict';

/* ────────── 最小 DOM 模拟 ────────── */
function makeClassList() {
  var set = {};
  return {
    add: function (c) { set[c] = true; },
    remove: function (c) { delete set[c]; },
    toggle: function (c, force) {
      var on = force !== undefined ? force : !set[c];
      if (on) set[c] = true; else delete set[c];
      return on;
    },
    contains: function (c) { return !!set[c]; },
  };
}

function makeElement(tag) {
  return {
    tagName: (tag || 'div').toUpperCase(),
    id: '',
    innerHTML: '',
    textContent: '',
    value: '',
    checked: false,
    hidden: false,
    className: '',
    style: {},
    dataset: {},
    attrs: {},
    children: [],
    parentNode: null,
    classList: makeClassList(),
    setAttribute: function (k, v) { this.attrs[k] = String(v); if (k === 'class') this.className = String(v); },
    getAttribute: function (k) { return this.attrs[k] !== undefined ? this.attrs[k] : null; },
    removeAttribute: function (k) { delete this.attrs[k]; },
    addEventListener: function () {},
    removeEventListener: function () {},
    querySelector: function () { return null; },
    querySelectorAll: function () { return []; },
    closest: function () { return null; },
    insertAdjacentHTML: function () {},
    appendChild: function (c) { if (c) this.children.push(c); return c; },
    remove: function () {},
  };
}

var elCache = {};
var docClickHandlers = [];
/* 可被查询并支持触发 click 的 tab 元素（模拟 init 中 querySelectorAll 绑定的 tab） */
var tabCache = {};
function makeTab(value) {
  var handlers = [];
  var el = makeElement('span');
  el.dataset['tabGroup'] = 'bonusGradTabs';
  el.dataset['tabValue'] = value;
  el.getAttribute = function (k) {
    if (k === 'data-tab-value') return value;
    if (k === 'data-tab-group') return 'bonusGradTabs';
    return this.attrs[k] !== undefined ? this.attrs[k] : null;
  };
  el.addEventListener = function (ev, fn) { if (ev === 'click') handlers.push(fn); };
  el.click = function () { handlers.forEach(function (fn) { fn(el); }); };
  el.handlers = handlers;
  return el;
}
function makeDocument() {
  return {
    readyState: 'loading',
    body: makeElement('body'),
    getElementById: function (id) {
      if (!elCache[id]) { var el = makeElement('div'); el.id = id; elCache[id] = el; }
      return elCache[id];
    },
    querySelector: function (sel) {
      if (sel === '#pcPage') return makeElement('div');
      return null;
    },
    querySelectorAll: function (sel) {
      if (sel === '[data-tab-group="bonusGradTabs"]') {
        if (!tabCache.tabs) {
          tabCache.tabs = [makeTab('monthly'), makeTab('activity')];
          tabCache.tabs[0].classList.add('is-active');
        }
        return tabCache.tabs;
      }
      return [];
    },
    createElement: function (tag) { return makeElement(tag); },
    createTextNode: function (t) { return { textContent: t }; },
    addEventListener: function (ev, fn) { if (ev === 'click') docClickHandlers.push(fn); },
    /* 模拟原型的事件委托：以 target 触发全部 click 监听（prototype.js 委托分发 data-action） */
    dispatchClick: function (target) {
      docClickHandlers.forEach(function (fn) {
        fn({ target: target, preventDefault: function () {} });
      });
    },
  };
}

/* 构造带 data-action 的动作元素（closest 命中自身，供事件委托分发） */
function actionEl(action, attrs) {
  var el = makeElement('button');
  el.setAttribute('data-action', action);
  (attrs || []).forEach(function (pair) { el.setAttribute(pair[0], pair[1]); });
  el.closest = function (sel) { return sel === '[data-action]' ? el : null; };
  return el;
}

function makeLocalStorage() {
  var store = {};
  return {
    getItem: function (k) { return store[k] !== undefined ? store[k] : null; },
    setItem: function (k, v) { store[k] = String(v); },
    removeItem: function (k) { delete store[k]; },
    clear: function () { store = {}; },
  };
}

global.window = global;
global.document = makeDocument();
global.localStorage = makeLocalStorage();
global.location = { search: '', pathname: 'pc/admin.html', href: '' };
global.confirm = function () { return true; };
global.__elCache = elCache;

/* 用 setTimeout 拦截 toast 弹层副作用（showToast 内部会 appendChild + setTimeout 消失） */

/* ────────── 按顺序加载三个脚本 ────────── */
require('./assets/js/prototype.js');
require('./medal-system/assets/js/medal-data.js');
require('./medal-system/assets/js/medal.js');

console.log('Proto / MDS / MedalDemo 加载成功');

/* ────────── 运行 init，覆盖全部 PC 渲染（含奖金梯度配置页） ────────── */
MedalDemo.init();
console.log('init() 执行成功，无运行时错误');

/* ────────── 验证奖金梯度配置页渲染产物 ────────── */
var monthlyGrid = document.getElementById('bonusGradMonthlyGrid');
var flow = document.getElementById('bonusBindFlow');
var summary = document.getElementById('bonusBindSummary');
var actList = document.getElementById('bonusGradActList');
var actCount = document.getElementById('bonusGradActCount');
var note = document.getElementById('bonusGradActivityNote');

function assert(cond, msg) {
  if (cond) console.log('  ✔ ' + msg);
  else { console.error('  ✘ ' + msg); process.exitCode = 1; }
}

console.log('— 月度勋章奖金区 —');
assert(monthlyGrid.innerHTML.indexOf('bonus-grad-card bg-gold') >= 0, '金牌梯度卡片渲染');
assert(monthlyGrid.innerHTML.indexOf('bonus-grad-card bg-silver') >= 0, '银牌梯度卡片渲染');
assert(monthlyGrid.innerHTML.indexOf('bonus-grad-card bg-bronze') >= 0, '铜牌梯度卡片渲染');
assert(monthlyGrid.innerHTML.indexOf('>800<') >= 0, '金牌金额 800 渲染');
assert(monthlyGrid.innerHTML.indexOf('>500<') >= 0, '银牌金额 500 渲染');
assert(monthlyGrid.innerHTML.indexOf('>300<') >= 0, '铜牌金额 300 渲染');
assert(flow.innerHTML.indexOf('自动绑定奖金') >= 0, '自动绑定流程步骤渲染');
assert(summary.textContent.indexOf('预计发放') >= 0, '月度预计发放摘要渲染：' + summary.textContent);

console.log('— 专项活动奖金区（切换 tab 后渲染） —');
/* 切到「专项活动奖金」tab，触发 init 绑定的 click 监听 */
document.querySelectorAll('[data-tab-group="bonusGradTabs"]')[1].click();
assert(actCount.textContent.indexOf('共 2 条') >= 0, '活动奖金方案数量 = 2：' + actCount.textContent);
assert(actList.innerHTML.indexOf('act-bonus-tag tag-gold') >= 0, '活动金 chip 渲染');
assert(actList.innerHTML.indexOf('¥ 600') >= 0, '秋季方案活动金 ¥600');
assert(actList.innerHTML.indexOf('¥ 500') >= 0, '亲子方案活动金 ¥500（独立配置）');
assert(actList.innerHTML.indexOf('配置奖金') >= 0, '「配置奖金」按钮渲染');
assert(note.innerHTML.indexOf('分开核算') >= 0, '独立核算说明渲染');

console.log('— 月度清单联动 —');
/* 直接调用生成的 action 逻辑：模拟点击 bonus-generate，验证 monthlyBonus 按勋章等级重算 */
var genBtn = makeElement('button');
genBtn.setAttribute('data-action', 'bonus-generate');
// 重新读取 medal.js 内部不可达，改为断言 generate 所需数据源一致：
// 2026-07 月度勋章 5 条（金1/银3/铜1），对应梯度 800/500/300 → 预计发放 800+500*3+300 = 2600
var medals = MDS.get('medals').filter(function (m) { return m.type === '月度常规' && m.period === '2026-07'; });
var gold = medals.filter(function (m) { return m.level === '金'; }).length;
var silver = medals.filter(function (m) { return m.level === '银'; }).length;
var bronze = medals.filter(function (m) { return m.level === '铜'; }).length;
assert(medals.length === 5, '2026-07 月度勋章共 5 条，实际 ' + medals.length);
assert(gold === 1 && silver === 2 && bronze === 2, '金1/银2/铜2，实际 金' + gold + '/银' + silver + '/铜' + bronze);

console.log('— 弹窗回填（月度 + 专项活动） —');
/* 月度弹窗回填：直接设置后验证输入框 value */
var bg = MDS.get('bonusGradients');
assert(bg.length === 3 && bg[0].amount === 800 && bg[1].amount === 500 && bg[2].amount === 300, 'bonusGradients 为月度三项 800/500/300');
var as = MDS.get('activitySchemes');
assert(as.length === 2 && as[0].bonusRules.length === 3 && as[0].bonusRules[0].level === '活动金', 'activitySchemes 含 bonusRules');

console.log('— 交互动作（事件委托驱动） —');

/* tab 工具：切到指定 tab（index 0=月度 / 1=专项活动） */
var gradTabs = document.querySelectorAll('[data-tab-group="bonusGradTabs"]');
function switchGradTab(i) { gradTabs[i].click(); }

/* 1. 月度奖金编辑弹窗回填（先切回月度 tab） */
switchGradTab(0);
document.dispatchClick(actionEl('bonus-grad-edit'));
assert(String(document.getElementById('bgGold').value) === '800', '月度弹窗金牌回填 800，实际 ' + document.getElementById('bgGold').value);
assert(String(document.getElementById('bgSilver').value) === '500', '月度弹窗银牌回填 500');
assert(String(document.getElementById('bgBronze').value) === '300', '月度弹窗铜牌回填 300');

/* 2. 修改月度奖金并保存联动（应重渲染月度区，预计发放随梯度联动） */
document.getElementById('bgGold').value = '900';
document.getElementById('bgSilver').value = '600';
document.getElementById('bgBronze').value = '400';
document.dispatchClick(actionEl('bonus-grad-save'));
var bgAfter = MDS.get('bonusGradients');
assert(bgAfter[0].amount === 900 && bgAfter[1].amount === 600 && bgAfter[2].amount === 400,
  '月度奖金保存生效 900/600/400，实际 ' + bgAfter[0].amount + '/' + bgAfter[1].amount + '/' + bgAfter[2].amount);
assert(document.getElementById('bonusBindSummary').textContent.indexOf('¥ 2900') >= 0,
  '保存后预计发放随梯度联动（900+600×2+400×2=2900）：' + document.getElementById('bonusBindSummary').textContent);

/* 3. 一键生成当月发放清单（按勋章等级自动绑定奖金，剔除离职教师） */
document.dispatchClick(actionEl('bonus-generate'));
var mb = MDS.get('monthlyBonus');
assert(mb.length === 5, '生成清单共 5 条，实际 ' + mb.length);
var sun = mb.filter(function (b) { return b.teacher === '孙悦'; })[0];
assert(sun && sun.status === '已剔除', '离职教师孙悦被自动剔除');
var zhang = mb.filter(function (b) { return b.teacher === '张慧'; })[0];
assert(zhang && zhang.bonus === 900, '张慧金牌自动绑定新梯度 900，实际 ' + (zhang && zhang.bonus));
var zhao = mb.filter(function (b) { return b.teacher === '赵敏'; })[0];
assert(zhao && zhao.bonus === 600, '赵敏银牌自动绑定 600，实际 ' + (zhao && zhao.bonus));
/* toast 轻提示应被创建并处于显示态（CSS 可见性由 medal.css .mb-toast 补丁保证） */
var toast = document.getElementById('mbToast');
assert(!!toast, '生成后创建 #mbToast 元素');
assert(toast && toast.textContent.indexOf('自动生成发放清单') >= 0, 'toast 文案：' + (toast ? toast.textContent : ''));
assert(toast && toast.classList.contains('is-show'), 'toast 处于 is-show 显示态（CSS opacity 规则生效即可见）');
/* PC 端 toast 可见性依赖 medal.css 中补的 .mb-toast 样式（静态校验） */
var fs = require('fs');
var css = fs.readFileSync(__dirname + '/medal-system/assets/css/medal.css', 'utf8');
assert(css.indexOf('.mb-toast {') >= 0 && css.indexOf('.mb-toast.is-show') >= 0, 'medal.css 已补 .mb-toast 样式（PC 端可见性修复）');

/* 4. 专项活动奖金编辑回填 + 保存（切到专项活动 tab） */
switchGradTab(1);
document.dispatchClick(actionEl('act-bonus-edit', [['data-id', '1']]));
assert(document.getElementById('actBonusTitle').textContent.indexOf('秋季家园共育案例评选') >= 0, '活动弹窗标题带方案名');
assert(String(document.getElementById('abGold').value) === '600', '活动金回填 600，实际 ' + document.getElementById('abGold').value);
assert(String(document.getElementById('abSilver').value) === '400', '活动银回填 400');
assert(String(document.getElementById('abBronze').value) === '200', '活动铜回填 200');
document.getElementById('abGold').value = '700';
document.dispatchClick(actionEl('act-bonus-save'));
var asAfter = MDS.get('activitySchemes');
assert(asAfter[0].bonusRules[0].amount === 700, '专项活动奖金保存生效 700，实际 ' + asAfter[0].bonusRules[0].amount);
assert(asAfter[1].bonusRules[0].amount === 500, '亲子方案独立奖金不受影响（500），实际 ' + asAfter[1].bonusRules[0].amount);

console.log('— 期末汇总清单（月度+专项合并统计 + 离职剔除） —');
/* 重置梯度/方案/勋章数据，保证期末汇总结果可预期（此前测试已修改梯度与活动方案） */
MDS.reset('bonusGradients');
MDS.reset('activitySchemes');
MDS.reset('medals');
/* 点击「自动汇总期末清单」：按勋章档案累计等级/数量，合并月度+专项奖金 */
document.dispatchClick(actionEl('semester-generate'));
var sb = MDS.get('semesterBonus');
assert(sb.length === 7, '期末汇总共 7 位教师，实际 ' + sb.length);
var zhang = sb.filter(function (b) { return b.teacher === '张慧'; })[0];
assert(zhang && zhang.medals.indexOf('金×4') >= 0, '张慧累计勋章 金×4：' + (zhang && zhang.medals));
assert(zhang && zhang.monthBonus === 1600, '张慧月度常规奖金 1600（金×2×800），实际 ' + (zhang && zhang.monthBonus));
assert(zhang && zhang.activityBonus === 500, '张慧专项活动奖励 500（亲子活动金）合并统计，实际 ' + (zhang && zhang.activityBonus));
assert(zhang && zhang.total === 2100, '张慧合计 2100（月度+专项合并），实际 ' + (zhang && zhang.total));
var sun = sb.filter(function (b) { return b.teacher === '孙悦'; })[0];
assert(sun && sun.status === '已剔除', '离职教师孙悦自动剔除');
assert(sun && (sun.remark || '').indexOf('6 月离职') >= 0, '剔除原因标注「6 月离职，放弃评比资格」：' + (sun && sun.remark));
assert(sun && sun.monthBonus === 300, '孙悦保留历史月度奖金 300（不影响历史数据），实际 ' + (sun && sun.monthBonus));
/* 汇总统计卡渲染（基于全量清单） */
var semSummary = document.getElementById('semesterSummaryRoot');
assert(semSummary && semSummary.innerHTML.indexOf('¥ 4850') >= 0, '汇总奖金总额 ¥ 4850（正常发放教师合计）');
assert(semSummary && semSummary.innerHTML.indexOf('金4 · 银6 · 铜3') >= 0, '汇总累计勋章 金4·银6·铜3');
var semPeriod = document.getElementById('semesterPeriod');
assert(semPeriod && semPeriod.textContent.indexOf('2025-2026 第二学期') >= 0, '学期信息展示：' + (semPeriod && semPeriod.textContent));
/* 清单表格渲染（含剔除标注） */
var semTbody = document.getElementById('semesterTbody');
assert(semTbody && semTbody.innerHTML.indexOf('row-excluded') >= 0, '剔除行应用灰色弱化样式');
assert(semTbody && semTbody.innerHTML.indexOf('6 月离职，放弃评比资格') >= 0, '清单中标注剔除原因');
assert(semTbody && semTbody.innerHTML.indexOf('sem-medal-item') >= 0, '累计勋章 chip 渲染');
var semCount = document.getElementById('semesterCount');
assert(semCount && semCount.textContent.indexOf('共 7 条') >= 0, '清单计数 7 条：' + (semCount && semCount.textContent));

console.log('冒烟测试完成');
