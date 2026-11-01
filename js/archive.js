/* ============================================================
   archive.js —— 六份档案的正文版式渲染（第三阶段）
   · 每份一套独立骨架（film / timetable / chat / receipt / photo / farewell），
     不是同一套模板换文字；
   · 内容全部来自 js/data.js（唯一数据源），本文件不写任何文案；
   · 只在 .paper-content 内注入 .sheet，不改 index.html 的 DOM 层级；
   · 素材位缺失时布局零变化：占位容器有固定 aspect-ratio，img 绝对定位铺满；
   · .is-zoomable + data-asset-key 为第六阶段图片查看器预留，本阶段点击不响应且不报错。
   ============================================================ */
(function (window, document) {
  'use strict';

  var Archive = window.Archive || (window.Archive = {});

  var report = { rendered: 0, slots: 0, missing: 0, zoomClicks: 0, lastZoomKey: '', at: 0 };

  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* ---------- 素材位（md 十六.1 占位规则） ---------------------------- */
  function slot(a, extraClass) {
    if (!a) { return ''; }
    return '<div class="asset-slot is-zoomable' + (extraClass ? ' ' + extraClass : '') + '"'
      + ' data-asset-key="' + esc(a.key) + '"'
      + ' style="--asset-ratio: ' + esc(a.ratio) + '">'
      + '<span class="asset-slot__ph">'
      + '<span class="asset-slot__name">' + esc(a.name) + '</span>'
      + '<span class="asset-slot__tag">示例占位</span>'
      + '</span>'
      + '<img class="asset-slot__img" src="' + esc(Archive.data.assetSrc(a)) + '"'
      + ' alt="' + esc(a.alt) + '">'
      + '</div>';
  }

  /* ---------- 页头 / 页脚（页脚在六份之间几何完全一致） --------------- */
  function head(d) {
    var meta = (d.meta && d.meta.length)
      ? '<p class="pf-meta">' + d.meta.map(esc).join('<span class="pf-dot">·</span>') + '</p>'
      : '';
    return '<header class="pf-head">'
      + '<p class="pf-kicker">' + esc(d.theme) + '</p>'
      + '<h2 class="pf-title">' + esc(d.title) + '</h2>'
      + meta
      + '</header>';
  }

  function foot(d) {
    return '<footer class="pf-page">'
      + '<span class="pf-page__no">' + esc(d.no) + ' / 06</span>'
      + '<span class="pf-page__mark">林予安 · 个人档案</span>'
      + '</footer>';
  }

  function shell(d, flow) {
    return '<div class="sheet archive-sheet archive-sheet--' + esc(d.no) + '">'
      + head(d)
      + '<div class="pf-flow">' + flow + '</div>'
      + (d.note ? '<p class="pf-note">' + esc(d.note) + '</p>' : '')
      + foot(d)
      + '</div>';
  }

  /* ---------- 01 票根 + 短评 ----------------------------------------- */
  function buildFilm(d) {
    return '<figure class="pf-ticket">'
        + '<span class="pf-tape" aria-hidden="true"></span>'
        + slot(d.assets.main)
      + '</figure>'
      + '<section class="pf-log">'
        + '<h3 class="pf-h3">' + esc(d.logHeading) + '</h3>'
        + d.log.map(function (p) { return '<p class="pf-p">' + esc(p) + '</p>'; }).join('')
      + '</section>';
  }

  /* ---------- 02 课程表（表格） -------------------------------------- */
  function buildTimetable(d) {
    var t = d.table;
    var headRow = '<tr><th class="pf-tt__corner" scope="col">' + esc(t.corner) + '</th>'
      + t.cols.map(function (c) { return '<th scope="col">' + esc(c) + '</th>'; }).join('')
      + '</tr>';
    var body = t.rows.map(function (name, r) {
      var cells = t.cols.map(function (c, ci) {
        var marked = false;
        for (var i = 0; i < t.marked.length; i += 1) {
          if (t.marked[i].r === r && t.marked[i].c === ci) { marked = true; }
        }
        return '<td class="pf-tt__cell' + (marked ? ' is-marked' : '') + '">'
          + (marked ? '<span class="pf-tt__chip">示例</span>' : '')
          + '</td>';
      }).join('');
      return '<tr><th class="pf-tt__row" scope="row">' + esc(name) + '</th>' + cells + '</tr>';
    }).join('');
    return '<section class="pf-block pf-block--print">'
        + '<table class="pf-tt" aria-label="打印课程表（示例占位）">'
        + '<thead>' + headRow + '</thead><tbody>' + body + '</tbody></table>'
        + '<p class="pf-cap">' + esc(d.cap) + '</p>'
      + '</section>'
      + '<section class="pf-quotes">'
        + d.quotes.map(function (q) { return '<p class="pf-p">' + esc(q) + '</p>'; }).join('')
      + '</section>'
      + '<figure class="pf-orig">' + slot(d.assets.main) + '</figure>';
  }

  /* ---------- 03 聊天气泡 -------------------------------------------- */
  function bubbleRow(m) {
    var inner = m.file
      ? '<div class="im-bubble im-bubble--file">'
          + '<span class="im-file__name">' + esc(m.file.name) + '</span>'
          + '<span class="im-file__meta">' + esc(m.file.meta) + '</span>'
        + '</div>'
      : '<div class="im-bubble">' + esc(m.text) + '</div>';
    return '<div class="im-row im-row--' + esc(m.side) + '">'
      + '<span class="im-face" aria-label="' + esc(m.who) + '">' + esc(m.face) + '</span>'
      + inner
      + '</div>';
  }

  function panel(d) {
    return '<section class="im-panel">'
      + '<div class="im-stamp">' + esc(d.stamp) + '</div>'
      + d.thread.map(bubbleRow).join('')
      + '<div class="im-input">'
        + '<span class="im-input__ph">' + esc(d.inputPlaceholder) + '</span>'
        + '<span class="im-input__send">' + esc(d.sendLabel) + '</span>'
      + '</div>'
      + '</section>';
  }

  function buildChat(d) {
    return panel(d)
      + '<figure class="pf-slip">' + slot(d.assets.main) + '</figure>';
  }

  /* ---------- 04 票据叠放 + 母亲对话 --------------------------------- */
  function buildReceipt(d) {
    var slips = d.assets.extras.map(function (a, i) {
      return '<figure class="pf-receipt pf-receipt--' + (i + 1) + '">'
        + slot(a) + '</figure>';
    }).join('');
    return '<div class="pf-cols">'
        + '<div class="pf-col pf-col--slips">'
          + '<p class="pf-col__tag">' + esc(d.receiptsHeading) + '</p>'
          + '<div class="pf-stack">' + slips + '</div>'
        + '</div>'
        + '<div class="pf-col pf-col--talk">'
          + panel({ stamp: d.stamp, thread: d.thread, inputPlaceholder: '发消息…', sendLabel: '发送' })
          + '<figure class="pf-slip pf-slip--talk">' + slot(d.assets.main) + '</figure>'
        + '</div>'
      + '</div>';
  }

  /* ---------- 05 摄影计划 + 照片三联 -------------------------------- */
  function buildPhoto(d) {
    var plan = d.plan.map(function (p) {
      return '<li class="pf-plan__item">' + esc(p) + '</li>';
    }).join('');
    var trio = d.assets.extras.map(function (a, i) {
      return '<figure class="pf-trio__item pf-trio__item--' + (i + 1) + '">' + slot(a) + '</figure>';
    }).join('');
    return '<p class="pf-lead">' + esc(d.lead) + '</p>'
      + '<div class="pf-plan">'
        + '<figure class="pf-plan__paper">' + slot(d.assets.main) + '</figure>'
        + '<div class="pf-plan__side">'
          + '<p class="pf-plan__tag">' + esc(d.planHeading) + '</p>'
          + '<ol class="pf-plan__list">' + plan + '</ol>'
        + '</div>'
      + '</div>'
      + '<div class="pf-trio">' + trio + '</div>'
      + '<div class="pf-paras">'
        + d.paras.map(function (p) { return '<p class="pf-p">' + esc(p) + '</p>'; }).join('')
      + '</div>';
  }

  /* ---------- 06 毕业合照 + 留言条 ---------------------------------- */
  function buildFarewell(d) {
    var msgs = d.messages.map(function (m, i) {
      return '<li class="pf-msg pf-msg--' + (i + 1) + '">'
        + '<span class="pf-msg__name">' + esc(m.name) + '</span>'
        + '<span class="pf-msg__tag">' + esc(m.tag) + '</span>'
        + '<span class="pf-msg__text">' + esc(m.text) + '</span>'
        + '</li>';
    }).join('');
    return '<figure class="pf-hero">' + slot(d.assets.main) + '</figure>'
      + '<p class="pf-col__tag pf-col__tag--left">' + esc(d.messagesHeading) + '</p>'
      + '<ul class="pf-msgs">' + msgs + '</ul>';
  }

  var BUILDERS = {
    film: buildFilm,
    timetable: buildTimetable,
    chat: buildChat,
    receipt: buildReceipt,
    photo: buildPhoto,
    farewell: buildFarewell
  };

  /* ---------- 渲染 ---------------------------------------------------- */
  function render() {
    var t0 = window.performance.now();
    var D = Archive.data;
    if (!D) { return report; }
    var items = document.querySelectorAll('#paper-bundle .archive-item');
    Array.prototype.forEach.call(items, function (item) {
      var id = Number(item.getAttribute('data-id'));
      var d = D.byId(id);
      var pc = item.querySelector('.paper-content');
      if (!d || !pc) { return; }
      var build = BUILDERS[d.layout];
      if (!build) { return; }
      pc.innerHTML = shell(d, build(d));
    });
    report.rendered = document.querySelectorAll('#paper-bundle .archive-sheet').length;
    report.slots = document.querySelectorAll('#paper-bundle .asset-slot').length;
    report.at = Math.round((window.performance.now() - t0) * 10) / 10;
    bindImages();
    bindZoom();
    captureHome();                 /* 第四阶段：记下六张纸在纸叠里的原始 world rect */
    applyZ();
    hideOthers(st().currentId);
    initNav();
    return report;
  }

  /* 缺图：只隐藏 img，不碰容器尺寸（布局零变化） */
  function markMissing(img) {
    if (img.classList.contains('is-missing')) { return; }
    img.classList.add('is-missing');
    report.missing += 1;
  }

  function bindImages() {
    Array.prototype.forEach.call(document.querySelectorAll('#paper-bundle .asset-slot__img'), function (img) {
      img.addEventListener('error', function () { markMissing(img); });
      img.addEventListener('load', function () {
        if (img.naturalWidth > 0) { img.classList.remove('is-missing'); }
      });
      if (img.complete && img.naturalWidth === 0) { markMissing(img); }
    });
  }

  /* 第六阶段图片查看器：素材位点击 → 唯一查看器（js/viewer.js）打开。
     can('open-viewer') 由查看器内部判定（它还要置 state.viewer），这里只转发。 */
  function bindZoom() {
    var bundle = document.getElementById('paper-bundle');
    if (!bundle) { return; }
    bundle.addEventListener('click', function (ev) {
      var el = ev.target;
      while (el && el !== bundle) {
        if (el.classList && el.classList.contains('is-zoomable')) {
          report.zoomClicks += 1;
          report.lastZoomKey = el.getAttribute('data-asset-key') || '';
          if (Archive.viewer && Archive.viewer.open) { Archive.viewer.open(el); }
          return;
        }
        el = el.parentNode;
      }
    });
  }

  function boot() {
    render();
  }

  /* ============================================================
     第四阶段：档案切换（md:847-944）
     · 只用既有 Archive.animation.flipTo 做位移换算，不另写第二套 FLIP；
     · 两张纸交错：旧纸 0→560ms 退回纸叠，新纸 240→880ms 抽出到阅读位；
     · 动画期间 currentId / order 不变，落定后一次性提交（不排队、不重播）；
     · 全程只有一张 .paper-content 可读（其余 visibility:hidden，几何不变）。
     ============================================================ */

  var nav = { el: null, prev: null, next: null, page: null };
  var home = {};                        /* 纸叠里的原始 world rect（回退目标位） */
  var switchLog = { switches: 0, last: null };

  function st() { return Archive.state || {}; }

  function cssVar(name) {
    return (window.getComputedStyle(document.documentElement).getPropertyValue(name) || '').trim();
  }
  function msTok(name, fallback) {
    var m = /^(-?[0-9]*\.?[0-9]+)(ms|s)$/.exec(cssVar(name));
    if (!m) { return fallback; }
    return m[2] === 's' ? parseFloat(m[1]) * 1000 : parseFloat(m[1]);
  }
  function numTok(name, fallback) {
    var m = /^(-?[0-9]*\.?[0-9]+)/.exec(cssVar(name));
    return m ? parseFloat(m[1]) : fallback;
  }
  function switchTime() {
    return {
      returnDur: msTok('--dur-switch-return', 560),
      pullDur: msTok('--dur-switch-pull', 640),
      pullDelay: msTok('--del-switch-pull', 240),
      liftDur: msTok('--dur-switch-lift', 140),
      tilt: numTok('--switch-tilt', 3.2),
      lift: numTok('--switch-lift', 1.015),
      easeOut: cssVar('--ease-switch-out') || 'ease-out',
      easeIn: cssVar('--ease-switch-in') || 'ease-in'
    };
  }

  function items() {
    return Array.prototype.slice.call(document.querySelectorAll('#paper-bundle .archive-item'));
  }
  function itemOf(id) {
    return document.querySelector('#paper-bundle .archive-item[data-id="' + id + '"]');
  }
  function poseOf(it) { return it ? it.querySelector('.pose-layer') : null; }

  /* 每张纸在纸叠里的"家"。article 是纯布局盒（不受 motion/pose 的 transform 影响），
     加上它在纸叠里的自然错位（motion 层基态 translate）就是纸叠中的真实位置。
     不能在 render() 时把 world rect 存死：P2 落地后 #paper-bundle 还带着 +372 的位移，
     存死会得到 306 而不是 678，退回的纸就会飞到画面左外（实测 -212.9 而非 279.85）。 */
  var baseOffset = {};
  function captureHome() {
    items().forEach(function (it) {
      var id = Number(it.getAttribute('data-id'));
      var m = it.querySelector('.motion-layer');
      if (!m) { return; }
      var t = window.getComputedStyle(m).transform;
      var d = t === 'none' ? new DOMMatrix() : new DOMMatrix(t);
      baseOffset[id] = { x: d.e || 0, y: d.f || 0 };
      home[id] = Archive.animation.rectToWorld(m.getBoundingClientRect());
    });
  }

  /* 此刻纸叠里第 id 张纸该落的位置（world，含落地后的整叠位移） */
  function homeNow(id) {
    var it = itemOf(id);
    if (!it) { return null; }
    var r = Archive.animation.rectToWorld(it.getBoundingClientRect());
    var off = baseOffset[id] || { x: 0, y: 0 };
    var left = r.left + off.x;
    var top = r.top + off.y;
    return {
      left: left, top: top, width: r.width, height: r.height,
      right: left + r.width, bottom: top + r.height
    };
  }

  /* z 序由 order 推导（内联 z-index）：order[0] 最上，逐层递减；
     当前阅读的那张用 --z-reader。CSS 里的 --z-paper-6..1 只作 JS 前兜底。 */
  function applyZ() {
    var s = st();
    var order = s.order || [1, 2, 3, 4, 5, 6];
    var base = numTok('--z-paper-1', 46);
    var reader = numTok('--z-reader', 60);
    order.forEach(function (id, i) {
      var it = itemOf(id);
      if (!it) { return; }
      it.style.zIndex = String(id === s.currentId ? reader : base - i);
    });
  }

  function hideOthers(keepId) {
    items().forEach(function (it) {
      if (Number(it.getAttribute('data-id')) === keepId) {
        it.classList.remove('is-page-hidden');
      } else {
        it.classList.add('is-page-hidden');
      }
    });
  }

  function refreshNav() {
    var s = st();
    if (!nav.el) { return; }
    var n = s.currentId || 1;
    if (nav.page) { nav.page.textContent = (n < 10 ? '0' + n : String(n)); }
    if (nav.prev) { nav.prev.disabled = (s.switching === true) || n <= 1; }
    if (nav.next) { nav.next.disabled = (s.switching === true); }
  }

  function setBusy(on) {
    var s = st();
    s.switching = on === true;
    var bundle = document.getElementById('paper-bundle');
    if (bundle) {
      if (on) { bundle.classList.add('is-switching'); }
      else { bundle.classList.remove('is-switching'); }
    }
    refreshNav();
  }

  function step(dir) {
    var s = st();
    var target = (s.currentId || 1) + dir;
    if (target < 1) { return; }                       /* 第一份：‹ 无效 */
    if (target > 6) {                                  /* 第六份：第七阶段入口 */
      if (Archive.can('request-reflection') && s.requestReflection) { s.requestReflection(); }
      return;
    }
    switchTo(target);
  }

  function switchTo(nextId) {
    var anim = Archive.animation;
    var s = st();
    if (!anim || !s.order) { return Promise.resolve(false); }
    if (Archive.can('switch-paper') !== true) { return Promise.resolve(false); }
    if (!(nextId >= 1 && nextId <= 6) || nextId === s.currentId) { return Promise.resolve(false); }
    var oldItem = itemOf(s.currentId);
    var newItem = itemOf(nextId);
    if (!oldItem || !newItem || !homeNow(s.currentId)) { return Promise.resolve(false); }
    var t = switchTime();
    var total = Math.max(t.returnDur, t.pullDelay + t.pullDur);
    /* 看门狗 = 预估时长 × 1.6（js/animation.js:115-122 内建） */
    return anim.withLock('archive', function () { return runSwitch(oldItem, newItem, t, total); }, total);
  }

  function runSwitch(oldItem, newItem, t, total) {
    var anim = Archive.animation;
    var s = st();
    var oldId = s.currentId;
    var nextId = Number(newItem.getAttribute('data-id'));
    var readerTarget = anim.readerTargetWorld();
    var oldHome = homeNow(oldId);
    var startedAt = window.performance.now();

    var oldMotion = oldItem.querySelector('.motion-layer');
    var oldPose = poseOf(oldItem);
    var newMotion = newItem.querySelector('.motion-layer');
    var newPose = poseOf(newItem);

    setBusy(true);
    /* 旧纸的内容立刻不可读（之后是白纸背面退回，不让文字跟着缩小） */
    oldItem.classList.add('is-page-hidden');
    oldItem.classList.add('is-returning');
    /* 动画期间的临时 z：新纸在阅读层、旧纸在第二层，其余按 order */
    oldItem.style.zIndex = String(numTok('--z-paper-1', 46) - 1);
    newItem.style.zIndex = String(numTok('--z-reader', 60));

    /* 旧纸退回不能二次缩水：flipTo 的 kx 是"目标盒 ÷ 源渲染盒"的绝对值，而它写回的
       transform 以布局盒为基准，阅读态基态却是 scale 1.149×1.096。
       解法 = 移交给 pose 层 + 给 flipTo 一个"虚拟目标"：
       ① 同一帧把 motion 的放大搬到 pose（translate 保留在 motion，视觉不动）；
       ② 目标盒 = 家 ÷ 移交比例，于是 kx 恰好抵消移交，落定后 motion×pose 仍等于家的尺寸；
       ③ 落定后再反向移交，把比例乘回 motion、pose 归 1（视觉仍不动）。
       全程一条 WAAPI 动画、零 CSS transition，getAnimations 峰值不因退回而增加。 */
    var savedMotionCss = oldMotion ? oldMotion.style.transform : '';
    var savedPoseCss = oldPose ? oldPose.style.transform : '';
    var m0 = oldMotion ? window.getComputedStyle(oldMotion).transform : 'none';
    var base = m0 === 'none' ? new DOMMatrix() : new DOMMatrix(m0);
    var sx = base.a || 1;
    var sy = base.d || 1;

    /* ---- 失败路径的收尾保障（P4 返工第 2 轮）----
       animation.js 的看门狗只释放锁、不碰 UI；而 once switching 为 true，can('switch-paper')
       就永久为 false。所以这里自带一个 total×1.6 的兜底定时器：到点仍未收尾就强制恢复，
       并把这次收尾记进 trace.errors。done 标志位（finished）保证三条路径只走一次。 */
    var savedNewMotionCss = newMotion ? newMotion.style.transform : '';
    var savedNewPoseCss = newPose ? newPose.style.transform : '';
    var finished = false;
    var pullTimer = null;
    /* 停摆感知（P5 第 3 轮）：截图 / 合成器停顿会让文档时间线停摆而墙钟照走，
       只按墙钟收尾会把"其实已经成功"的切换误判成卡死并 forceReset。
       判据与 withLock 看门狗一致：Δ时间线 < 0.75×Δ墙钟 ⇒ 只重新武装一次。 */
    var forcedTimer = 0;   /* cleanup() 会 clearTimeout 它，必须先声明 */
    var switchTrace = Archive.animation && Archive.animation.trace;
    var forcedClock = (Archive.animation && Archive.animation.armClock)
      ? Archive.animation.armClock() : null;
    var forcedRearmed = false;
    function armForced() {
      forcedTimer = window.setTimeout(function () {
        forcedTimer = 0;
        if (finished) { return; }
        var A = Archive.animation;
        if (!forcedRearmed && forcedClock && A && A.stalledSince && A.stalledSince(forcedClock)) {
          forcedRearmed = true;
          forcedClock = A.armClock();
          if (switchTrace) { switchTrace.errors.push('switch:rearm'); }
          armForced();
          return;
        }
        if (switchTrace) { switchTrace.errors.push('switch:forced-reset'); }
        forceReset();
      }, Math.round(total * 1.6));
    }
    armForced();
    if (oldMotion) {
      oldMotion.style.transform = 'translate3d(' + base.e + 'px, ' + base.f + 'px, 0) scale(1, 1)';
      void oldMotion.getBoundingClientRect();   /* 强制回流：移交先落到渲染，再让 flipTo 量源盒 */
    }
    if (oldPose) {
      oldPose.style.transition = 'none';
      oldPose.style.transform = 'rotate(0deg) scale(' + sx + ', ' + sy + ')';
    }
    var vw = oldHome.width / sx;
    var vh = oldHome.height / sy;
    var virtualTarget = {
      left: (oldHome.left + oldHome.width / 2) - vw / 2,
      top: (oldHome.top + oldHome.height / 2) - vh / 2,
      width: vw, height: vh
    };

    var pOld;
    try {
      pOld = anim.flipTo(oldItem, virtualTarget, {
        duration: t.returnDur, easing: t.easeOut, label: 'switch-out'
      });
    } catch (err) {
      pOld = Promise.reject(err);   /* 同步抛错也要走 rollback，不能停在 pending */
    }
    /* flipTo 会给旧纸补 is-reading 类；旧纸已不是当前档案，立刻摘掉
       （z 由内联值决定，摘类不影响动画） */
    oldItem.classList.remove('is-reading');

    var revealTimer = window.setTimeout(function () {
      newItem.classList.remove('is-page-hidden');
    }, Math.max(0, total - 120));

    /* 新纸：抓起瞬间把倾角设成 --switch-tilt（2°–4°，md:900-915），
       再由 flipTo 内建的"摆正"动画在同一个 pullDur 里收回 0。
       倾斜与摆正只有这一个来源，不再叠加 CSS transition —— 否则两条动画会
       同时改 pose 的 transform 互相打架。 */
    var pNew = new Promise(function (resolve, reject) {
      pullTimer = window.setTimeout(function () {
        /* 回调体必须自带 try/catch：这里同步抛错时 pNew 会永远 pending，
           Promise.all 永不 settle，commit / rollback / cleanup 全部不执行。 */
        try {
          if (finished) { resolve(false); return; }
          if (newPose) {
            newPose.style.transition = 'none';
            newPose.style.transform = 'rotate(' + t.tilt + 'deg)';
            void newPose.getBoundingClientRect();   /* 让倾斜先落到渲染，flipTo 才量得到 */
            newPose.style.transition = '';
          }
          resolve(anim.flipTo(newItem, readerTarget, {
            duration: t.pullDur, easing: t.easeIn, label: 'switch-in'
          }));
        } catch (err) {
          reject(err);
        }
      }, t.pullDelay);
    });

    function cleanup() {
      finished = true;
      window.clearTimeout(revealTimer);
      window.clearTimeout(pullTimer);
      window.clearTimeout(forcedTimer);
      oldItem.classList.remove('is-returning');
      setBusy(false);
      refreshNav();
    }

    /* 把两张纸的内联样式/类名/z 序复原到切换前（rollback 与兜底收尾共用这一套，不写第二份） */
    function restoreScene() {
      /* 先停掉可能还在跑的动画：动画会盖住内联样式，不停就恢复不回去 */
      [oldMotion, oldPose, newMotion, newPose].forEach(function (el) {
        if (!el) { return; }
        el.getAnimations().forEach(function (a) {
          try { a.cancel(); } catch (e) { /* 已结束的动画忽略 */ }
        });
      });
      if (oldMotion) { oldMotion.style.transform = savedMotionCss; }
      if (oldPose) { oldPose.style.transition = ''; oldPose.style.transform = savedPoseCss; }
      if (newMotion) { newMotion.style.transform = savedNewMotionCss; }
      if (newPose) { newPose.style.transition = ''; newPose.style.transform = savedNewPoseCss; }
      oldItem.classList.remove('is-returning');
      oldItem.classList.add('is-reading');
      newItem.classList.remove('is-reading');
      hideOthers(oldId);
      applyZ();
    }

    /* 兜底收尾：界面必须能在 1.6×total 内回到"可继续切换" */
    function forceReset() {
      restoreScene();
      cleanup();
      /* settle 在动画被取消后还会再写一次最终样式（两个微任务之后），
         这里用微任务链把恢复值压回去：中间不产生绘制，也插不进新的点击。 */
      Promise.resolve().then(restoreScene).then(restoreScene).then(restoreScene);
    }

    function commit() {
      if (finished) { return false; }   /* 已被 rollback / 兜底收尾接管，不再提交 */
      /* 落定后才提交顺序与 currentId：new 到最上层、old 回第二层，
         其余四张保持原有相对顺序（md:917-930） */
      var rest = (s.order || []).filter(function (id) {
        return id !== nextId && id !== oldId;
      });
      s.order = [nextId, oldId].concat(rest);
      s.currentId = nextId;
      /* 第五阶段：笔记本留言页同步（全站唯一调用点，落在 commit 成功之后）。
         fire-and-forget：翻页动画不 await、不进 Promise.all，纸面 FLIP 的总时长不变；
         笔记本还合着时它只换内容、不打开、也不产生动画（md:1041-1054）。 */
      if (Archive.notebook && Archive.notebook.setPage) {
        try { Archive.notebook.setPage(nextId); } catch (e) { /* 翻页失败不得影响换纸提交 */ }
      }
      /* 反向移交：把 pose 上的放大乘回 motion，视觉不动；旧纸从此在纸叠里是 scale 1 */
      if (oldMotion && oldPose) {
        var mm = window.getComputedStyle(oldMotion).transform;
        var d2 = mm === 'none' ? new DOMMatrix() : new DOMMatrix(mm);
        /* 这两笔必须在同一帧落地：motion 的 scale 乘回比例的动作，与 pose 回 1 的动作，
           中间若被 CSS transition 补间，旧纸会瞬间胀大 15% 再缩回（实测 636→553.5）。 */
        oldPose.style.transition = 'none';
        oldMotion.style.transform = 'translate3d(' + d2.e + 'px, ' + d2.f + 'px, 0) scale(' +
          (d2.a * sx) + ', ' + (d2.d * sy) + ')';
        oldPose.style.transform = 'rotate(0deg)';
        void oldMotion.getBoundingClientRect();
        oldPose.style.transition = '';
      }
      newItem.classList.remove('is-page-hidden');
      newItem.classList.add('is-reading');
      oldItem.classList.remove('is-reading');
      hideOthers(nextId);
      applyZ();
      switchLog.switches += 1;
      switchLog.last = {
        from: oldId,
        to: nextId,
        total: Math.round(window.performance.now() - startedAt),
        order: s.order.slice()
      };
      report.switches = switchLog.switches;
      report.lastSwitch = switchLog.last;
      cleanup();
      return true;
    }

    function rollback(reason) {
      if (finished) { return false; }
      var tr = Archive.animation && Archive.animation.trace;
      if (tr) { tr.errors.push('switch:' + reason); }
      restoreScene();   /* 回到切换前的可读态（旧纸的阅读位放大在 motion 层） */
      cleanup();
      return false;
    }

    return Promise.all([pOld, pNew]).then(commit, rollback);
  }

  /* ============================================================
     第七阶段：最终反思与结尾（md 十一 / md:1632-1646）
     · 入口：06 上点 › → step(1) 的 target>6 分支 → requestReflection()
     · 三段各自带锁（reflect / ending / finale），每段一个本地 1.6× 兜底，
       判据与 js/animation.js 的停摆感知看门狗一致（armClock/stalledSince），
       兜底留在本文件各自的序列里，不塞进通用层。
     · 镜头只写 A.cameraCss('C2'|'C1'|'C0')，机位数值不落在这里。
     · 页码永远由 currentId 决定（06），不会出现 07 / 06。
     ============================================================ */
  var reflectLog = { entries: 0, lastEntry: null, continues: 0, lastContinue: null, finale: null };
  var dwellTimer = 0;

  /* 反思位暗角：见 css/notebook.css 的 .reflect-veil 说明（取景把世界右缘推进画面）。
     只建一个节点、只动 opacity，结束时整块移除，不参与任何几何测量。 */
  function veil(on, ms) {
    var wf = document.getElementById('world-fit');
    if (!wf) { return null; }
    var A = Archive.animation;
    var v = document.getElementById('reflect-veil');
    if (on) {
      if (!v) {
        v = document.createElement('div');
        v.id = 'reflect-veil';
        v.className = 'reflect-veil';
        wf.appendChild(v);
      }
      v.style.opacity = '1';
      if (A) { A.settle(A.anim(v, [{ opacity: 0 }, { opacity: 1 }], {
        duration: Math.round(ms) || 900, easing: 'linear', label: 'reflect-veil'
      }), v, null); }
      return v;
    }
    if (!v) { return null; }
    v.style.opacity = '0';
    var drop = function () { if (v && v.parentNode) { v.parentNode.removeChild(v); } };
    if (A) {
      A.settle(A.anim(v, [{ opacity: 1 }, { opacity: 0 }], {
        duration: Math.round(ms) || 420, easing: 'linear', label: 'reflect-veil-out'
      }), v, null).then(drop, drop);
    } else { drop(); }
    return v;
  }

  function reflectTime() {
    return {
      cam: msTok('--dur-reflect', 1000),
      qtext: msTok('--dur-reflect-text', 320),
      fade: msTok('--dur-reflect-fade', 360),
      endIn: msTok('--dur-reflect-in', 420),
      coverClose: msTok('--dur-reflect-cover', 520),
      camBack: msTok('--dur-reflect-camera', 1200),
      camDelay: msTok('--dur-reflect-delay', 120),
      finale: msTok('--dur-finale', 1320),
      dwell: msTok('--del-finale', 1200),
      easeReflect: cssVar('--ease-reflect') || 'cubic-bezier(0.42,0,0.35,1)'
    };
  }

  /* 本地兜底：到 1.6× 仍未收尾就强制复位。时间线停摆（截图/后台节流）
     只重新武装一次并记 <tag>:rearm，真卡死记 <tag>:forced-reset 后回调。 */
  function guard(total, onForced, tag) {
    var A = Archive.animation;
    var st2 = { timer: 0, clock: A.armClock ? A.armClock() : null, rearmed: false, stopped: false };
    function arm() {
      st2.timer = window.setTimeout(function () {
        st2.timer = 0;
        if (st2.stopped) { return; }
        if (!st2.rearmed && st2.clock && A.stalledSince && A.stalledSince(st2.clock)) {
          st2.rearmed = true;
          st2.clock = A.armClock();
          A.trace.errors.push(tag + ':rearm');
          arm();
          return;
        }
        A.trace.errors.push(tag + ':forced-reset');
        onForced();
      }, Math.round(total * 1.6));
    }
    arm();
    return {
      stop: function () {
        st2.stopped = true;
        if (st2.timer) { window.clearTimeout(st2.timer); st2.timer = 0; }
      }
    };
  }

  /* ---------- 进入反思：镜头移到笔记本，页上显示问题 ---------- */
  function requestReflection() {
    var A = Archive.animation;
    if (!A) { return Promise.resolve(false); }
    if (Archive.can('request-reflection') !== true) { return Promise.resolve(false); }
    var t = reflectTime();
    var total = Math.max(t.cam, t.qtext);
    return A.withLock('reflect', function () { return runReflection(t, total); }, total);
  }

  function runReflection(t, total) {
    var A = Archive.animation;
    var s = st();
    var nb = Archive.notebook;
    var cam = document.getElementById('camera');
    var startedAt = window.performance.now();
    var camAnim = null;
    var finished = false;
    var g = null;

    /* 立刻关门：phase 一变，换纸 / 查看器 / 素材点击全部失效（B8 的基础） */
    s.phase = 'reflection';
    s.reflection = 'question';

    function restore() {
      try { if (camAnim) { camAnim.cancel(); } } catch (e) { /* 已取消 */ }
      veil(false, 300);
      if (cam) { cam.style.transform = A.cameraCss('C1'); }
      if (nb && nb.restorePage) { try { nb.restorePage(); } catch (e) { /* 复位不得再抛 */ } }
      s.reflection = 'none';
      s.phase = 'reading';
    }
    function done(ok) {
      if (finished) { return ok; }
      finished = true;
      if (g) { g.stop(); }
      if (!ok) { restore(); }
      if (ok) { reflectLog.entries += 1; }
      reflectLog.lastEntry = {
        ok: !!ok, total: Math.round(window.performance.now() - startedAt),
        cam: A.cameraCss('C2'), phase: s.phase
      };
      return ok;
    }
    g = guard(total, function () { done(false); }, 'reflect');

    try {
      camAnim = A.anim(cam, [
        { transform: A.cameraCss('C1'), offset: 0 },
        { transform: A.cameraCss('C2'), offset: 1 }
      ], { duration: t.cam, easing: t.easeReflect, label: 'camera-reflect' });
      A.stage('reflect-camera', 0, t.cam);
      veil(true, t.cam);
      var pageP = (nb && nb.showQuestion) ? nb.showQuestion() : Promise.resolve(false);
      return Promise.all([A.settle(camAnim, cam, A.cameraCss('C2')), pageP]).then(function () {
        A.mark('stage:reflect:end');
        return done(true);
      }, function (e) {
        A.trace.errors.push('reflect:' + e);
        return done(false);
      });
    } catch (e) {
      A.trace.errors.push('reflect:' + e);
      return done(false);
    }
  }

  /* ---------- 点「继续」：问题淡出 → 结束文字淡入 ---------- */
  function requestContinue(via) {
    var A = Archive.animation;
    if (!A) { return Promise.resolve(false); }
    if (Archive.can('continue-reflection') !== true) { return Promise.resolve(false); }
    var t = reflectTime();
    var total = t.fade + t.endIn;
    reflectLog.continues += 1;
    reflectLog.lastContinue = { via: via || 'api', ok: false, total: 0 };
    return A.withLock('ending', function () { return runContinue(t, total); }, total);
  }

  function runContinue(t, total) {
    var A = Archive.animation;
    var s = st();
    var nb = Archive.notebook;
    var startedAt = window.performance.now();
    var finished = false;
    var g = null;
    s.reflection = 'ending';

    /* 只在结束块还不存在时补建（兜底路径）。正常路径下 showEnding 已经在上一句
       跑过，这里再建一次会把刚淡入的文字推回 opacity 0 重来一遍（实测双峰：1→0→1）。 */
    function revealText() {
      var blk = document.querySelector('#notebook .page-inner .book-reflect--end');
      if (!blk) {
        try { if (nb && nb.showEnding) { nb.showEnding(); } } catch (e) { /* 兜底不抛 */ }
      }
      s.reflection = 'text';
      A.mark('stage:ending:text');
    }
    function done(ok) {
      if (finished) { return ok; }
      finished = true;
      if (g) { g.stop(); }
      reflectLog.lastContinue.ok = !!ok;
      reflectLog.lastContinue.total = Math.round(window.performance.now() - startedAt);
      if (ok) {
        if (dwellTimer) { window.clearTimeout(dwellTimer); }
        dwellTimer = window.setTimeout(runFinale, t.dwell);
      }
      return ok;
    }
    g = guard(total, function () {
      /* 兜底：结束文字直接落到页上，最终动画仍可走完 */
      revealText();
      A.trace.errors.push('ending:forced-reset');
      done(true);
    }, 'ending');

    var outP = (nb && nb.questionOut) ? nb.questionOut() : Promise.resolve(false);
    return Promise.resolve(outP).then(function () {
      return (nb && nb.showEnding) ? nb.showEnding() : Promise.resolve(false);
    }).then(function (r) {
      revealText();
      return done(r !== false);
    }, function (e) {
      A.trace.errors.push('ending:' + e);
      return done(false);
    });
  }

  /* ---------- 最终动画：封面合上 + 镜头拉回完整桌面 ---------- */
  function runFinale() {
    var A = Archive.animation;
    var s = st();
    var nb = Archive.notebook;
    if (!A) { return Promise.resolve(false); }
    if (dwellTimer) { window.clearTimeout(dwellTimer); dwellTimer = 0; }
    if (!(s.phase === 'reflection' && (s.reflection === 'ending' || s.reflection === 'text'))) {
      return Promise.resolve(false);
    }
    var t = reflectTime();
    var cam = document.getElementById('camera');
    var startedAt = window.performance.now();
    var finished = false;
    var camAnim = null;
    var g = null;

    function snapEnd() {
      try { if (camAnim) { camAnim.cancel(); } } catch (e) { /* 已取消 */ }
      if (cam) { cam.style.transform = A.cameraCss('C0'); }
      if (nb && nb.snapCoverClosed) { try { nb.snapCoverClosed(); } catch (e) { /* 兜底不抛 */ } }
    }
    function done(ok) {
      if (finished) { return ok; }
      finished = true;
      if (g) { g.stop(); }
      if (!ok) { snapEnd(); }
      s.reflection = 'done';
      s.phase = 'ended';
      A.mark('stage:finale:end');
      reflectLog.finale = {
        ok: !!ok, forced: !ok,
        total: Math.round(window.performance.now() - startedAt),
        cam: A.cameraCss('C0')
      };
      return ok;
    }
    g = guard(t.finale, function () { done(false); }, 'finale');

    return A.withLock('finale', function () {
      try {
        veil(false, t.coverClose);
        camAnim = A.anim(cam, [
          { transform: A.cameraCss('C2'), offset: 0 },
          { transform: A.cameraCss('C0'), offset: 1 }
        ], {
          duration: t.camBack, delay: t.camDelay, easing: t.easeReflect,
          fill: 'both', label: 'camera-back'
        });
        A.stage('finale-camera', t.camDelay, t.camDelay + t.camBack);
        var coverP = (nb && nb.closeCover) ? nb.closeCover(t.coverClose) : Promise.resolve(false);
        return Promise.all([A.settle(camAnim, cam, A.cameraCss('C0')), coverP]).then(function () {
          return done(true);
        }, function (e) {
          A.trace.errors.push('finale:' + e);
          return done(false);
        });
      } catch (e) {
        A.trace.errors.push('finale:' + e);
        return done(false);
      }
    }, t.finale);
  }

  /* ============================================================
     第八阶段：收纳与重置（md:1127-1166）
     阅读态点左侧露出的信封 → 按 md:1137-1143 的七步顺序回 idle：
       ① 笔记本合上（封面 152° → 0°）           0        –480ms
       ② 当前纸从阅读位缩回（轻抬 1.5% → 落回） 200      –880ms
       ③ 回到纸叠（② 的终点即纸叠里的家）        880
       ④ 六张纸聚成完整纸叠（整叠已是完整叠）    880
       ⑤ 整叠滑回信封（六张纸同源位移）          880      –1480ms
       ⑥ 封盖翻转关闭（155° → 0°）               1400     –1900ms
       ⑦ 镜头拉远回 C0（最后收尾）               1700     –2160ms
     整体 2160ms（md:1151 要求 1.8–2.2s）。除当前纸之外的五张纸全程只受
     #paper-bundle 的父级位移影响，因此『整叠滑回』阶段六张纸同向同速。
     锁：单一 scope 'close'（withLock）+ 本地 guard（1.6× 兜底 + 停摆感知）。
     ============================================================ */
  var closeLog = { entries: 0, last: null, resets: 0 };

  /* 时长全部经 msTok 读，令牌缺省时用括号里的默认值：
     css/tokens.css 不在本阶段的改动清单里，新增令牌只需在这里补 fallback 即可。 */
  function closeTime() {
    return {
      cover: msTok('--dur-close-cover', 480),
      delPaper: msTok('--del-close-paper', 200),
      paper: msTok('--dur-close-paper', 680),
      delStack: msTok('--del-close-stack', 880),
      stack: msTok('--dur-close-stack', 600),
      delFlap: msTok('--del-close-flap', 1400),
      flap: msTok('--dur-close-flap', 500),
      delCam: msTok('--del-close-camera', 1580),
      cam: msTok('--dur-close-camera', 420),
      easeSettle: cssVar('--ease-settle') || 'cubic-bezier(0.20,0.70,0.22,1)',
      easeFlip: cssVar('--ease-flip') || 'cubic-bezier(0.28,0.10,0.16,1)',
      easeCamera: cssVar('--ease-camera') || 'cubic-bezier(0.30,0.02,0.18,1)'
    };
  }
  function closeTotal(t) {
    return Math.max(
      t.delCam + t.cam, t.delFlap + t.flap, t.delStack + t.stack,
      t.cover, t.delPaper + t.paper
    );
  }

  function requestClose() {
    var A = Archive.animation;
    if (!A) { return Promise.resolve(false); }
    if (Archive.can('close-envelope') !== true) { return Promise.resolve(false); }
    var t = closeTime();
    var total = closeTotal(t);
    A.resetTrace();
    A.mark('close:start');
    A.trace.total = total;
    return A.withLock('close', function () { return runClose(t, total); }, total);
  }

  /* 复位：把六个变换层、纸叠、信封、封面、机位与 state 一次性落回初值。
     不依赖任何动画对象 —— 强制复位时先 cancel 再写内联样式，避免 settle 的
     then 分支在稍后再把终值写回来。 */
  function resetScene() {
    var A = Archive.animation;
    var cam = document.getElementById('camera');
    var bundle = document.getElementById('paper-bundle');
    var env = document.getElementById('envelope');
    var nb = document.getElementById('notebook');
    var s = st();
    var kill = function (el) {
      if (!el || !el.getAnimations) { return; }
      var list = [];
      try { list = el.getAnimations({ subtree: true }); } catch (e) { list = el.getAnimations(); }
      list.forEach(function (a) { try { a.cancel(); } catch (e2) { /* 已取消 */ } });
    };

    kill(nb);
    kill(bundle);
    kill(cam);
    kill(env);

    items().forEach(function (it) {
      kill(it);
      it.classList.remove('is-reading', 'is-page-hidden', 'is-returning', 'is-switching');
      it.style.zIndex = '';
      /* 内联清空 = 回到 css/archive.css:51-64 的纸叠基态（位移 ±4px、倾角 ±1.9°） */
      var m = it.querySelector('.motion-layer');
      var p = it.querySelector('.pose-layer');
      if (m) { m.style.transform = ''; }
      if (p) { p.style.transform = ''; }
    });

    if (bundle) {
      bundle.classList.remove('is-landed', 'is-switching');
      bundle.style.transform = '';
    }
    if (env) {
      env.classList.remove('is-opened');
      var flap = env.querySelector('.front-flap');
      if (flap) { flap.style.transform = ''; }
    }
    if (nb) {
      var cover = nb.querySelector('.cover');
      if (cover) { cover.style.transform = ''; }
    }
    if (cam) { cam.style.transform = A ? A.cameraCss('C0') : ''; }

    if (Archive.notebook && Archive.notebook.render) {
      try { Archive.notebook.render(1); } catch (e3) { /* 复位不得再抛 */ }
    }

    s.order = [1, 2, 3, 4, 5, 6];
    s.currentId = 1;
    s.envelope = 'closed';
    s.archive = 'packed';
    s.notebook = 'closed';
    s.viewer = 'closed';
    s.reflection = 'none';
    s.switching = false;
    applyZ();
    refreshNav();
    /* phase 最后改：watchPhase 的观察者在这之后收到的就是 idle */
    s.phase = 'idle';
  }

  /* ---------- 看门狗的相位兜底（P9b / md:944） ----------
     放锁只解除互斥，不等于恢复状态：卡在 opening/landing/closing 时所有 gate 都要求
     idle 或 reading，页面就永久不可操作（父代理复现的正是这一条）。这里先把在途的链
     "换代数"作废 —— js/envelope.js 展开链的每一步都比较代数自检 —— 再走一次
     resetScene 把五个状态复位到初值，下一次点信封可以完整重放。 */
  var recoverLog = { count: 0, last: null };
  function recover(scope) {
    var A = Archive.animation;
    var s = st();
    if (!A || !s) { return false; }
    /* 只接这三把锁：notebook / viewer 的锁由各自的 owner 自己收尾 */
    if (scope !== 'envelope' && scope !== 'close' && scope !== 'archive') { return false; }
    /* 已经是初值就什么都不用做（正常路径永远走这条 return） */
    if (s.phase === 'idle' && s.envelope === 'closed' && s.archive === 'packed'
      && s.notebook === 'closed' && s.switching !== true) {
      return false;
    }
    recoverLog.count += 1;
    recoverLog.last = {
      scope: scope, phase: s.phase, envelope: s.envelope,
      archive: s.archive, notebook: s.notebook
    };
    A.bumpGeneration();
    A.mark('recover:' + scope);
    resetScene();
    return true;
  }

  function runClose(t, total) {
    var A = Archive.animation;
    var s = st();
    var nb = Archive.notebook;
    var envApi = Archive.envelope;
    var cam = document.getElementById('camera');
    var bundle = document.getElementById('paper-bundle');
    var readerId = s.currentId || 1;
    var reader = itemOf(readerId);
    var motion = reader ? reader.querySelector('.motion-layer') : null;
    var startedAt = window.performance.now();
    var finished = false;
    var g = null;

    /* 立刻关门：phase 一变，换纸 / 查看器 / 再次点击信封全部失效（C1/C6 的基础） */
    s.phase = 'closing';

    function finish(ok, forced) {
      if (finished) { return ok; }
      finished = true;
      if (g) { g.stop(); }
      resetScene();
      if (!forced && ok) { closeLog.entries += 1; } else { closeLog.resets += 1; }
      closeLog.last = {
        ok: !!ok, forced: !!forced,
        total: Math.round(window.performance.now() - startedAt),
        phase: s.phase
      };
      A.mark('close:end');
      return ok;
    }
    /* 1.6× 兜底：真卡死也把界面落回 idle，紧接着点信封能完整重开（C7） */
    g = guard(total, function () { finish(false, true); }, 'close');

    try {
      /* ---- ① 笔记本合上（第一步） ---- */
      var coverP = (nb && nb.closeCover) ? nb.closeCover(t.cover) : Promise.resolve(false);
      A.stage('close-notebook', 0, t.cover);

      /* ---- ② 当前纸从阅读位缩回（第二步） ---- */
      var paperP = Promise.resolve(false);
      if (motion) {
        var m0 = window.getComputedStyle(motion).transform;
        var b0 = m0 === 'none' ? new DOMMatrix() : new DOMMatrix(m0);
        var base = baseOffset[readerId] || { x: 0, y: 0 };
        var r4 = function (v) { return Math.round(v * 10000) / 10000; };
        var fromCss = 'translate3d(' + r4(b0.e) + 'px, ' + r4(b0.f) + 'px, 0) scale(' + r4(b0.a) + ', ' + r4(b0.d) + ')';
        var toCss = 'translate3d(' + r4(base.x) + 'px, ' + r4(base.y) + 'px, 0) scale(1, 1)';
        var liftCss = 'translate3d(' + r4(b0.e + (base.x - b0.e) * 0.12) + 'px, '
          + r4(b0.f + (base.y - b0.f) * 0.12) + 'px, 0) scale(' + r4(b0.a * 1.015) + ', ' + r4(b0.d * 1.015) + ')';
        var paperAnim = A.anim(motion, [
          { transform: fromCss, offset: 0, easing: t.easeFlip },
          { transform: liftCss, offset: 0.18, easing: t.easeSettle },
          { transform: toCss, offset: 1 }
        ], { duration: t.paper, delay: t.delPaper, easing: 'linear', label: 'close-paper' });
        A.stage('close-paper', t.delPaper, t.delPaper + t.paper);
        paperP = A.settle(paperAnim, motion, toCss);
      } else {
        A.trace.errors.push('close:no-reader-motion');
      }

      /* ---- ⑤ 整叠滑回信封（六张纸同源位移，父级一个动画） ---- */
      var stackP = Promise.resolve(false);
      if (bundle) {
        var bm = window.getComputedStyle(bundle).transform;
        var bd = bm === 'none' ? new DOMMatrix() : new DOMMatrix(bm);
        var stackKeys = [
          { transform: 'translate3d(' + r4(bd.e) + 'px, ' + r4(bd.f) + 'px, 0)', offset: 0, easing: t.easeSettle },
          { transform: 'translate3d(' + r4(bd.e * 0.55) + 'px, -34px, 0)', offset: 0.5, easing: t.easeSettle },
          { transform: 'translate3d(0px, 0px, 0)', offset: 1 }
        ];
        var stackAnim = A.anim(bundle, stackKeys, {
          duration: t.stack, delay: t.delStack, easing: 'linear', label: 'close-stack'
        });
        A.stage('close-stack', t.delStack, t.delStack + t.stack);
        stackP = A.settle(stackAnim, bundle, 'translate3d(0px, 0px, 0)');
      }

      /* ---- ⑥ 封盖翻转关闭（信封自己的那一段） ---- */
      var flapP = (envApi && envApi.closeFlap)
        ? envApi.closeFlap({ duration: t.flap, delay: t.delFlap, easing: t.easeSettle })
        : Promise.resolve(false);
      A.stage('close-flap', t.delFlap, t.delFlap + t.flap);

      /* ---- ⑦ 镜头拉远回 C0（最后一件事） ---- */
      var camP = Promise.resolve(false);
      if (cam) {
        var camAnim = A.anim(cam, [
          { transform: A.cameraCss('C1'), offset: 0 },
          { transform: A.cameraCss('C0'), offset: 1 }
        ], { duration: t.cam, delay: t.delCam, easing: t.easeCamera, label: 'camera-close' });
        A.stage('close-camera', t.delCam, t.delCam + t.cam);
        camP = A.settle(camAnim, cam, A.cameraCss('C0'));
      }

      return Promise.all([coverP, paperP, stackP, flapP, camP]).then(function () {
        /* ③④ 此刻当前纸已回到纸叠、整叠已滑进信封 —— 纸叠是完整的一叠 */
        A.mark('stage:close:end');
        return finish(true, false);
      }, function (e) {
        A.trace.errors.push('close:' + e);
        return finish(false, false);
      });
    } catch (e) {
      A.trace.errors.push('close:' + e);
      return finish(false, false);
    }
  }

  function initNav() {
    nav.el = document.getElementById('reader-nav');
    if (!nav.el) { return; }
    nav.prev = nav.el.querySelector('.reader-nav__btn--prev');
    nav.next = nav.el.querySelector('.reader-nav__btn--next');
    nav.page = nav.el.querySelector('.reader-nav__now');
    if (nav.prev) { nav.prev.addEventListener('click', function () { step(-1); }); }
    if (nav.next) { nav.next.addEventListener('click', function () { step(1); }); }
    refreshNav();
    if (Archive.state && Archive.state.watchPhase) {
      Archive.state.watchPhase(function (p) {
        if (!nav.el) { return; }
        /* 控件只在阅读态存在：进入反思（第七阶段）或收尾（ended）时必须收回，
           否则一枚已禁用的 › 会留在画面上读作"没做完"。其余相位（idle/opening/
           reading/switching）一个字节都不动 —— 换纸时 phase 仍是 reading，
           所以 ‹ › 照旧可见、只是 disabled（P4 的行为不受影响）。 */
        if (p === 'reading') {
          nav.el.classList.add('is-live');
          return;
        }
        /* 第八阶段：收纳（closing）也属于"控件不该在"的相位 —— 一旦离开 reading
           就收回，回到 reading 才显影；idle 之后保持 hidden。 */
        if (p === 'reflection' || p === 'ending' || p === 'ended' || p === 'closing') {
          nav.el.classList.remove('is-live');
        }
      });
    }
  }

  Archive.archive = {
    render: render,
    report: report,
    switchTo: switchTo,
    step: step,
    home: home,
    switchLog: switchLog,
    /* 第七阶段入口（js/state.js 的 requestReflection 转交到这里） */
    requestReflection: requestReflection,
    requestContinue: requestContinue,
    runFinale: runFinale,
    reflectLog: reflectLog,
    /* 第八阶段：收纳入口（js/state.js 的 requestClose 转交到这里）+ 只读取证面 */
    requestClose: requestClose,
    closeLog: closeLog,
    closeTime: closeTime,
    closeTotal: closeTotal,
    resetScene: resetScene,
    /* 第九阶段 P9b：看门狗放锁之后的相位兜底（js/animation.js 的 recoverFrom 调这里） */
    recover: recover,
    recoverLog: recoverLog
  };

  /* js/animation.js 直接取 Archive.recover（不在上面的取证面上） */
  Archive.recover = recover;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

}(window, document));
