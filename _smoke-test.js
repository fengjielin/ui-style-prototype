/**
 * 积分体系重构原型 · 冒烟测试（Node 环境，无浏览器）
 * 用最小 DOM 模拟驱动 medal.js 的 init()，覆盖「积分获得情况」页渲染、排位分计算（含并列）、发布公告，
 * 并验证勋章体系/奖金管理相关数据与菜单已完全移除。
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
var docHandlers = { click: [], change: [] };
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
    querySelectorAll: function () { return []; },
    createElement: function (tag) { return makeElement(tag); },
    createTextNode: function (t) { return { textContent: t }; },
    addEventListener: function (ev, fn) { if (docHandlers[ev]) docHandlers[ev].push(fn); },
    /* 模拟原型事件委托：以 target 触发 click / change 监听 */
    dispatchClick: function (target) {
      docHandlers.click.forEach(function (fn) { fn({ target: target, preventDefault: function () {} }); });
    },
    dispatchChange: function (target) {
      docHandlers.change.forEach(function (fn) { fn({ target: target, preventDefault: function () {} }); });
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

/* ────────── 按顺序加载三个脚本 ────────── */
require('./assets/js/prototype.js');
require('./medal-system/assets/js/medal-data.js');
require('./medal-system/assets/js/medal.js');

console.log('Proto / MDS / MedalDemo 加载成功');

function assert(cond, msg) {
  if (cond) console.log('  ✔ ' + msg);
  else { console.error('  ✘ ' + msg); process.exitCode = 1; }
}

function countOccur(str, sub) { return str.split(sub).length - 1; }

/* ────────── 1. 运行 init：初始化数据缓存 + PC 渲染（含积分获得情况）无运行时错误 ────────── */
MedalDemo.init();
console.log('init() 执行成功，无运行时错误');

/* ────────── 2. 数据层：勋章/奖金键已移除，schemeScores 已就绪 ────────── */
console.log('— 数据层（移除与新增） —');
assert(MDS.get('monthlyScheme') === undefined, 'monthlyScheme（月度常规勋章积分方案）已移除');
assert(MDS.get('medals') === undefined, 'medals（教师勋章档案）已移除');
assert(MDS.get('medalThresholds') === undefined, 'medalThresholds（勋章门槛）已移除');
assert(MDS.get('bonusGradients') === undefined, 'bonusGradients（月度奖金梯度）已移除');
assert(MDS.get('monthlyBonus') === undefined, 'monthlyBonus（月度发放清单）已移除');
assert(MDS.get('semesterBonus') === undefined, 'semesterBonus（期末汇总清单）已移除');

var schemes = MDS.get('activitySchemes');
assert(schemes && schemes.length === 2, '活动积分方案保留 2 套，实际 ' + (schemes && schemes.length));
assert(schemes && !schemes[0].bonusRules && !schemes[1].bonusRules, 'activitySchemes 已移除 bonusRules 字段');

var scores = MDS.get('schemeScores') || {};
assert(scores[1] && scores[1].length === 6 && scores[2] && scores[2].length === 6, 'schemeScores 提供 2 套方案 × 6 名参与对象');

/* ────────── 3. 菜单：积分规则新增「积分获得情况」，勋章/奖金菜单组已移除 ────────── */
console.log('— 菜单结构 —');
var menus = MDS.get('pcMenus');
var groupTitles = menus.map(function (g) { return g.title; });
assert(groupTitles.indexOf('勋章体系') < 0, '「勋章体系」菜单组已移除');
assert(groupTitles.indexOf('奖金管理') < 0, '「奖金管理」菜单组已移除');
assert(groupTitles.indexOf('积分规则') >= 0, '「积分规则」菜单组保留');
var scoreGroup = menus.filter(function (g) { return g.title === '积分规则'; })[0] || { children: [] };
var scoreKeys = scoreGroup.children.map(function (c) { return c.key; });
assert(scoreKeys.indexOf('score-scheme') >= 0 && scoreKeys.indexOf('score-obtained') >= 0,
  '「积分规则」下含「积分方案管理」「积分获得情况」，实际 ' + scoreKeys.join(' / '));
assert(scoreKeys.indexOf('medal-threshold') < 0 && scoreKeys.indexOf('bonus-gradient') < 0, '积分规则下无勋章/奖金子菜单');

/* ────────── 4. 积分获得情况页渲染（默认方案 1） ────────── */
console.log('— 积分获得情况页渲染（方案 1） —');
var rootEl = document.getElementById('scoreObtainedRoot');
var html = rootEl.innerHTML;
assert(html.indexOf('平台使用') >= 0 && html.indexOf('家园互动') >= 0 && html.indexOf('外部推广') >= 0 && html.indexOf('会员转化') >= 0,
  '表格含四维度列（平台使用/家园互动/外部推广/会员转化）');
assert(html.indexOf('总积分') >= 0 && html.indexOf('排位分') >= 0 && html.indexOf('奖金（元）') >= 0, '表格含总积分/排位分/奖金列');
assert(html.indexOf('发布公告') >= 0, '表格左上角含「发布公告」按钮');
assert(html.indexOf('soSchemeSelect') >= 0, '顶部含活动积分方案下拉');
['张慧', '李娜', '王强', '赵敏', '陈晨', '刘洋'].forEach(function (n) {
  assert(html.indexOf(n) >= 0, '参与对象 ' + n + ' 渲染');
});
/* 方案 1 总积分 1160/1060/970/910/900/880 → 名次 1-6、排位分 6/5/4/3/2/1（无并列） */
assert(html.indexOf('第 1 名') >= 0 && html.indexOf('第 6 名') >= 0, '名次 1~6 渲染');
assert(countOccur(html, '>第 1 名</span>') === 1, '名次无并列（第 1 名仅 1 条）');
assert(html.indexOf('>6</span> 分') >= 0 && html.indexOf('>1</span> 分') >= 0, '排位分 6（第1名）与 1（第6名）渲染');

/* ────────── 5. 切换方案 2：出现并列排位分 ────────── */
console.log('— 切换方案 2：并列排位分（总分 760/730/670/650/650/590） —');
document.dispatchChange({ id: 'soSchemeSelect', value: '2' });
var html2 = document.getElementById('scoreObtainedRoot').innerHTML;
/* 名次 1,2,3,4,4,6 → 第 4 名出现 2 次；排位分 6,5,4,3,3,1 → 并列各 3 分 */
assert(countOccur(html2, '第 4 名') === 2, '方案 2 第 4 名并列（出现 2 次），实际 ' + countOccur(html2, '第 4 名'));
assert(countOccur(html2, '>3</span> 分') >= 2, '并列名次得相同排位分 3，出现 ≥2 次，实际 ' + countOccur(html2, '>3</span> 分'));

/* ────────── 6. 发布公告 → 写入 activityNotices（参与对象接收） ────────── */
console.log('— 发布公告（方案 2 · activityId=5） —');
document.dispatchClick(actionEl('score-obtained-announce-open'));
document.getElementById('soAnnounceTitle').value = '【积分公告】亲子阅读打卡积分结果公示';
document.getElementById('soAnnounceContent').value = '各位老师：本活动积分结果已核定，请查阅。';
document.dispatchClick(actionEl('score-obtained-announce-publish'));
var an = MDS.get('activityNotices') || {};
var list = an['5'] || [];
assert(list.length >= 1, '公告已写入 activityNotices[活动 5]，共 ' + list.length + ' 条');
var rec = list[0];
assert(rec && rec.title.indexOf('积分公告') >= 0, '公告标题写入：' + (rec && rec.title));
assert(rec && rec.content.indexOf('积分获得情况汇总') >= 0, '公告内容自动附带积分汇总');
assert(rec && rec.content.indexOf('━━━━━━━━━━━━') >= 0, '公告含分隔线（正文与汇总区隔）');
assert(rec && rec.content.indexOf('🥇') >= 0, '积分汇总含前三名奖牌标记');
assert(rec && rec.content.indexOf('排位分') >= 0, '积分汇总含排位分字段');
assert(rec && rec.scoreSummary && rec.scoreSummary.schemeName === '亲子阅读打卡专项积分方案', '公告存储结构化 scoreSummary（方案名）');
assert(rec && rec.scoreSummary && rec.scoreSummary.rows.length === 6, 'scoreSummary 含 6 条参与对象明细');
assert(rec && rec.scoreSummary && rec.scoreSummary.rows[0].totalRank === 1 && rec.scoreSummary.rows[0].rankPoints === 6,
  'scoreSummary 首条名次/排位分正确（第1名 · 排位分6）');
assert(rec && rec.recipients && rec.recipients.length === 6, '公告接收对象为 6 名参与对象，实际 ' + (rec && rec.recipients && rec.recipients.length));
assert(rec && rec.recipients.every(function (r) { return r.read === false; }), '参与对象回执均为未读');

/* 点击公告 → 跳转独立「积分公告详情页」 */
console.log('— 公告详情页跳转与渲染 —');
global.location.href = 'notice.html';
document.dispatchClick(actionEl('open-announce-detail', [['data-activity', '5'], ['data-notice', String(rec.id)]]));
assert(global.location.href.indexOf('announce-detail.html?activityId=5&noticeId=') >= 0,
  '点击公告跳转独立详情页：' + global.location.href);
/* 模拟公告详情页 URL → 重新 init 渲染详情页 */
global.location = { search: '?activityId=5&noticeId=' + encodeURIComponent(rec.id), pathname: 'mobile/announce-detail.html', href: '' };
MedalDemo.init();
var detailHtml = document.getElementById('announceDetailRoot').innerHTML;
assert(detailHtml.indexOf('积分获得情况汇总') >= 0, '公告详情页渲染「积分获得情况汇总」区');
assert(detailHtml.indexOf('🥇') >= 0, '公告详情页汇总含奖牌标记');
assert(detailHtml.indexOf('排位分') >= 0, '公告详情页汇总含排位分');
assert(detailHtml.indexOf(rec.title) >= 0, '公告详情页展示公告标题');
assert(detailHtml.indexOf('活动周期') >= 0, '公告详情页展示活动周期');

/* 切回方案 1（activityId=8）再发一条，验证多方案可独立发布 */
console.log('— 发布公告（方案 1 · activityId=8） —');
document.dispatchChange({ id: 'soSchemeSelect', value: '1' });
document.dispatchClick(actionEl('score-obtained-announce-open'));
document.getElementById('soAnnounceTitle').value = '【积分公告】秋季家园共育案例评选积分结果公示';
document.getElementById('soAnnounceContent').value = '请查看您的积分获得情况。';
document.dispatchClick(actionEl('score-obtained-announce-publish'));
var an2 = MDS.get('activityNotices') || {};
assert((an2['8'] || []).length >= 1, '公告已写入 activityNotices[活动 8]');

console.log('冒烟测试完成');
