/* ============================================================
   state.js —— 会话状态 + 事件×前置状态表
   can(event) 是全站唯一的"这个事件现在能不能做"的判定入口。
   状态只由 js/animation.js 的序列推进，任何人不得直接改行为。
   ============================================================ */
(function (window) {
  'use strict';

  var Archive = window.Archive || (window.Archive = {});

  /* phase: idle → opening（封盖翻转/纸叠升起）→ landing（纸叠落桌）
            → reading（阅读位）→ reflection（最终反思）→ ended（静止收尾）；
            第八阶段的 closing（收纳）从 reading 一路回 idle。
     reflection: none → question（问题在页上等点击）→ ending（淡出中）
            → text（结束文字已展示）→ done（已收尾） */
  var state = {
    phase: 'idle',
    envelope: 'closed',   /* closed → opening → open */
    archive: 'packed',    /* packed → landed → extracting → extracted */
    notebook: 'closed',   /* closed → open */
    currentId: 1,
    viewer: 'closed',
    /* 第四阶段：order[0] = 纸叠最上层。换纸只改这个数组与内联 z-index，
       不重建 DOM、不改 data-id；六张纸始终是同一批 article。 */
    order: [1, 2, 3, 4, 5, 6],
    switching: false,
    notebookTurning: false,
    /* 第七阶段：最终反思的进度。与 phase 分开，是为了让"继续"这种
       "同一阶段内的下一步"也能被 can() 判定，而不是只靠锁。 */
    reflection: 'none'
  };

  /* phase 用访问器暴露：envelope.js 直接赋值 phase='reading' 时，
     第四阶段的切换控件靠 watchPhase 收到通知后显影，无需任何轮询。 */
  var phaseValue = state.phase;
  var phaseWatchers = [];
  delete state.phase;
  Object.defineProperty(state, 'phase', {
    enumerable: true,
    configurable: true,
    get: function () { return phaseValue; },
    set: function (v) {
      if (v === phaseValue) { return; }
      phaseValue = v;
      for (var i = 0; i < phaseWatchers.length; i += 1) {
        try { phaseWatchers[i](v); } catch (e) { /* 观察者不得影响状态推进 */ }
      }
    }
  });
  state.watchPhase = function (fn) {
    if (typeof fn !== 'function') { return; }
    phaseWatchers.push(fn);
    if (phaseValue !== 'idle') { try { fn(phaseValue); } catch (e) { /* 同上 */ } }
  };

  /* 事件 × 前置状态：返回 true 才允许执行 */
  var GATES = {
    'open-envelope': function (s) {
      return s.envelope === 'closed' && s.phase === 'idle';
    },
    'extract-paper': function (s) {
      return s.envelope === 'open' && s.archive === 'landed' && s.phase === 'landing';
    },
    'open-notebook': function (s) {
      return s.notebook === 'closed';
    },
    /* 以下门槛先立好，实现留给后续阶段；现在一律返回 false */
    'click-stack': function () { return false; },       /* P4 明令：纸叠不绑点击 */
    /* 第四阶段：换纸。动画面板打开、换纸进行中、非阅读态一律不许进 */
    'switch-paper': function (s) {
      return s.phase === 'reading' && s.archive === 'extracted'
        && s.viewer === 'closed' && s.switching !== true && s.notebookTurning !== true;
    },
    /* 第六份点 › 的入口（md:1062）：只在 06 上、阅读态、无查看器、无换纸时进 */
    'request-reflection': function (s) {
      return s.phase === 'reading' && s.currentId === 6 && s.reflection === 'none'
        && s.archive === 'extracted'
        && s.viewer === 'closed' && s.switching !== true && s.notebookTurning !== true;
    },
    /* 第七阶段：点「继续」。只在问题已展示、尚未淡出时可进；ended 后无效 */
    'continue-reflection': function (s) {
      return s.phase === 'reflection' && s.reflection === 'question';
    },
    /* 第七阶段结尾（人工「结束」）：结束文字已全部淡入、且尚未开始收纳时可进。
       收纳一开始 phase 变 closing，本 gate 立即为 false —— 重复点击在 gate 层返回 false。 */
    'finish-archive': function (s) {
      return s.phase === 'reflection' && s.reflection === 'text';
    },
    /* 第八阶段：收纳（md:1131）。只在阅读态、信封已开、纸已抽出、笔记本已开、
       无查看器、无换纸、不在反思时进；reflection 与 ended 一律不响应
       （md:1117 页面保持最终静止状态）。重复点击在 gate 层就返回 false。 */
    'close-envelope': function (s) {
      return s.phase === 'reading' && s.envelope === 'open' && s.archive === 'extracted'
        && s.notebook === 'open' && s.viewer === 'closed' && s.switching !== true
        && s.notebookTurning !== true && s.reflection === 'none';
    },
    /* 第六阶段：统一图片查看器（md:1170-1211）。只在阅读态可开；
       打开瞬间 state.viewer='open'，于是 switch-paper 立刻为 false
       （md:1201-1209：打开期间不许换档案、不许重开其它图片）。 */
    'open-viewer': function (s) {
      return s.phase === 'reading' && s.archive === 'extracted'
        && s.viewer === 'closed' && s.switching !== true;
    },
    'close-viewer': function (s) {
      return s.viewer === 'open';
    },
    'turn-page': function (s) {
      return s.phase === 'reading' && s.archive === 'extracted'
        && s.notebook === 'open' && s.viewer === 'closed'
        && s.switching !== true && s.notebookTurning !== true && s.reflection === 'none';
    }
  };

  /* 第七阶段：入口转交 js/archive.js 的真实实现（延迟取，避免脚本顺序耦合）。
     gate 不通过时返回 false，不改 phase、不报错、不排队。 */
  state.requestReflection = function () {
    if (Archive.can('request-reflection') !== true) { return false; }
    var impl = Archive.archive && Archive.archive.requestReflection;
    if (typeof impl !== 'function') { return false; }
    return impl();
  };

  /* 第八阶段：收纳入口（js/envelope.js 的点击处理器经 can('close-envelope') 转交）。
     与 requestReflection 相同：gate 不通过返回 false，不改 state、不报错、不排队。 */
  state.requestClose = function () {
    if (Archive.can('close-envelope') !== true) { return false; }
    var impl = Archive.archive && Archive.archive.requestClose;
    if (typeof impl !== 'function') { return false; }
    return impl();
  };

  /* 第七阶段结尾：人工「结束」入口。结束文字淡入后由 .book-reflect__end 触发，
     经 can('finish-archive') 转交给 js/archive.js 的完整收纳实现。 */
  state.requestFinish = function () {
    if (Archive.can('finish-archive') !== true) { return false; }
    var impl = Archive.archive && Archive.archive.requestFinish;
    if (typeof impl !== 'function') { return false; }
    return impl();
  };

  Archive.state = state;
  Archive.gates = GATES;

  Archive.can = function (event) {
    var gate = GATES[event];
    if (!gate) { return false; }
    try { return gate(state) === true; } catch (e) { return false; }
  };

})(window);
