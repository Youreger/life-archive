/* ============================================================
   notebook.js —— 笔记本：打开 + 书写页（md 第五阶段 / 第十七章）
   · 打开：封面绕书脊 rotateY 0° → 158°（过冲）→ 152° 回弹停住，
     时长 --dur-notebook(730ms)，落在 md 的 650~800ms。
     .cover 本身是透明卡片、不挂 backface-visibility；正面写在
     .cover::before、内衬面写在 .cover::after（rotateY(180deg)），
     两个面各自挂 hidden，过 90° 正面整片退场、内衬面接手。
     终值 152°：同时满足验收 #7（≥150°）与返工单的 100°~166°；
     透视把它压成向后收窄的梯形内衬面（不是竖直板块）。
   · 书写页：只有一个 .page（md:992-994 不做左右对开）。内容由
     js/data.js 的 notebookData 渲染，六份档案各一页；
     本文件不含任何留言正文字面量（A1 的要求）。
   · 翻页：唯一入口 setPage(id)。
       - 笔记本已打开 → 560ms 叶片绕书脊翻过去（md:1041-1054）；
       - 笔记本还合着 → 只换内容、不打开、不产生动画（只更新目标页）；
       - 同一目标页（md:1278）→ 直接返回，不重复翻页；
       - 与换纸并行：由 js/archive.js 在 commit() 里 fire-and-forget 调用，
         不 await，纸面 FLIP 的总时长不受翻页影响。
     · 新页的出现方式（返工 R1 方案 a）：.page-inner 恒 opacity 1，叶片
       正面贴旧页副本、盖在新页之上；叶片转开多少，不透明的新页就露出
       多少。全程没有整页淡入，所以不会出现"幽灵字"。
     · 兜底（md:944，返工 R2）：叶片动画若永不 settle，1.6×--dur-page 后
       强制 cancel 叶片、摘 .is-turning、复位 flipping，并记
       trace.errors('page:forced-reset')，后续 setPage 仍能正常翻页。
     ============================================================ */
(function (window, document) {
  'use strict';

  var Archive = window.Archive || (window.Archive = {});

  var COVER_OPEN = 152;      /* deg：终值，同时满足 ≥150°（验收 #7）与 100°~166°（返工单） */
  var COVER_OVERSHOOT = 158; /* deg：打开途中轻微过冲，随后回落 6° */

  var PAGE_MIN = 1;
  var PAGE_MAX = 6;

  var els = { notebook: null, cover: null, page: null, inner: null, leaf: null, leafFace: null };
  var rendered = 0;   /* 书写页上现在是哪一页：setPage 去重与 A4 的唯一依据 */
  var flipping = false;
  var cancelActiveFlip = null;
  var flipLog = { flips: 0, last: null };
  /* 第七阶段：书写页当前显示什么 —— page = 某份档案的留言页；
     reflect = 最终反思的问题；ending = 结束文字。反思页不走 flip()。 */
  var mode = 'page';

  function cssVar(name) {
    return (window.getComputedStyle(document.documentElement).getPropertyValue(name) || '').trim();
  }
  function msTok(name, fallback) {
    var m = /^(-?[0-9]*\.?[0-9]+)(ms|s)$/.exec(cssVar(name));
    if (!m) { return fallback; }
    return m[2] === 's' ? parseFloat(m[1]) * 1000 : parseFloat(m[1]);
  }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* ---------- 页面内容 ---------- */
  function pageOf(id) {
    var D = Archive.data;
    if (!D || !D.notebookData) { return null; }
    for (var i = 0; i < D.notebookData.length; i += 1) {
      if (D.notebookData[i].id === id) { return D.notebookData[i]; }
    }
    return null;
  }

  function buildPage(d) {
    /* 来源标签整页只出现一次（放在列表上方）：06 页有四条留言，
       每条都带一行标签会多占四行、把 398px 高的内页撑破；name 为空表示
       原文无署名，此时绝不渲染空姓名 span。 */
    var src = (d.messages && d.messages.length && d.messages[0].tag) ? d.messages[0].tag : '';
    var msgs = (d.messages || []).map(function (m) {
      var name = m.name ? '<span class="book-page__name">' + esc(m.name) + '</span>' : '';
      return '<li class="book-page__msg">'
        + name
        + '<span class="book-page__text">' + esc(m.text) + '</span>'
        + '</li>';
    }).join('');
    return '<div class="book-page" data-page="' + esc(d.id) + '">'
      + '<p class="book-page__kicker">' + esc(d.kicker) + '</p>'
      + '<p class="book-page__title">' + esc(d.title) + '</p>'
      + '<p class="book-page__sub">' + esc(d.sub) + '</p>'
      + (src ? '<p class="book-page__src">' + esc(src) + '</p>' : '')
      + '<ul class="book-page__list">' + msgs + '</ul>'
      + '<p class="book-page__note">' + esc(d.note) + '</p>'
      + '</div>';
  }

  function render(id) {
    var d = pageOf(id);
    if (!d || !els.inner) { return false; }
    els.inner.innerHTML = buildPage(d);
    rendered = id;
    return true;
  }

  /* ---------- 翻页 ---------- */
  function syncTurning(on) {
    if (Archive.state) { Archive.state.notebookTurning = on === true; }
    if (Archive.archive && Archive.archive.refreshNav) { Archive.archive.refreshNav(); }
  }

  function resetLeaf() {
    if (!els.leaf) { return; }
    els.leaf.getAnimations().forEach(function (a) {
      try { a.cancel(); } catch (e) { /* 已取消 */ }
    });
    els.leaf.classList.remove('is-turning');
    els.leaf.style.transform = '';
    els.leaf.style.filter = '';
    if (els.leafFace) { els.leafFace.innerHTML = ''; }
    if (els.inner) { els.inner.style.opacity = ''; }
  }

  function flip(id) {
    var A = Archive.animation;
    var dur = msTok('--dur-page', 560);
    var ease = cssVar('--ease-page') || 'cubic-bezier(0.34,0.06,0.20,1)';
    var startedAt = window.performance.now();
    var oldHtml = els.inner.innerHTML;
    render(id);
    if (!A) { return false; }
    var tr = A.trace;
    var leafAnim = null;
    var forcedTimer = 0;
    var forcedClock = null;
    var forcedRearmed = false;
    /* 停摆感知（P5 第 3 轮）：时间线因截图/合成器停顿而没推进时只重新武装
       一次（记 'page:rearm'），不把成功翻页误判成卡死。 */
    function armForced() {
      forcedTimer = window.setTimeout(function () {
        forcedTimer = 0;
        if (finished) { return; }
        if (!forcedRearmed && forcedClock && A.stalledSince && A.stalledSince(forcedClock)) {
          forcedRearmed = true;
          forcedClock = A.armClock();
          if (tr) { tr.errors.push('page:rearm'); }
          armForced();
          return;
        }
        if (tr) { tr.errors.push('page:forced-reset'); }
        finish(false, true);
      }, Math.round(dur * 1.6));
    }
    var finished = false;   /* 正常结束 / 兜底 / 同步异常：三条路径只生效一次 */
    var resolveFlip = null;
    var done = new Promise(function (resolve) { resolveFlip = resolve; });

    function finish(ok, forced) {
      if (finished) { return ok; }
      finished = true;
      if (forcedTimer) { window.clearTimeout(forcedTimer); forcedTimer = 0; }
      if (forced && leafAnim) { try { leafAnim.cancel(); } catch (e) { /* 已取消 */ } }
      resetLeaf();
      rendered = id;
      flipping = false;
      cancelActiveFlip = null;
      syncTurning(false);
      if (ok) {
        flipLog.flips += 1;
        flipLog.last = { to: id, total: Math.round(window.performance.now() - startedAt), dur: dur };
      }
      resolveFlip(ok);
      return ok;
    }

    flipping = true;
    syncTurning(true);
    cancelActiveFlip = function () { return finish(false, true); };
    try {
      /* 叶片正面贴的是"刚翻过去那一页"的副本：翻起来的必须是旧页，
         否则用户看到的是一张空白纸飞过去。新页恒 1.0 不透明躺在叶片
         下面，叶片转开多少就露出多少——没有整页淡入（R1 方案 a）。 */
      els.leafFace.innerHTML = oldHtml;
      els.leaf.classList.add('is-turning');
      leafAnim = A.anim(els.leaf, [
        { transform: 'rotateY(0deg)', filter: 'brightness(1)', offset: 0 },
        { transform: 'rotateY(-7deg)', filter: 'brightness(1.05)', offset: 0.16 },
        { transform: 'rotateY(-96deg)', filter: 'brightness(0.90)', offset: 0.82 },
        { transform: 'rotateY(-104deg)', filter: 'brightness(0.86)', offset: 1 }
      ], { duration: dur, easing: ease, label: 'page-leaf' });
      A.stage('page', 0, dur);
      /* md:944：叶片动画若永不 settle，1.6×--dur-page 后强制收尾。
         js/animation.js 的看门狗只 release 锁、不碰 UI，UI 兜底留在这里。 */
      forcedClock = A.armClock ? A.armClock() : null;
      armForced();
      A.settle(leafAnim, null, null).then(function () {
        finish(true, false);
      }, function () {
        finish(false, false);
      });
    } catch (e) {
      if (tr) { tr.errors.push('page:' + e); }
      finish(false, false);
    }
    return done;
  }

  /* ---------- 唯一同步入口 ---------- */
  function setPage(id) {
    var target = Math.round(Number(id));
    if (!isFinite(target) || !els.inner) { return false; }
    if (target < PAGE_MIN) { target = PAGE_MIN; }
    if (target > PAGE_MAX) { target = PAGE_MAX; }
    if (mode !== 'page') { return false; }                /* 反思/结束页在页上时不许被换纸覆盖 */
    if (flipping) { return false; }                       /* 翻页途中不排队，也不偷偷换目标页 */
    if (target === rendered) { return false; }            /* md:1278 同一目标页不重复翻页 */
    var open = !!Archive.state && Archive.state.notebook === 'open';
    if (!open) {                                          /* 合着：只更新，不打开、不加动画 */
      render(target);
      return false;
    }
    return flip(target);
  }

  /* 笔记本左右边缘只翻自己的书写页，不改 Archive.state.currentId。 */
  function turnPage(dir) {
    if (!Archive.can('turn-page') || mode !== 'page' || flipping) { return false; }
    var target = rendered + (dir < 0 ? -1 : 1);
    if (target < PAGE_MIN || target > PAGE_MAX) { return false; }
    return setPage(target);
  }

  function reset() {
    if (cancelActiveFlip) { cancelActiveFlip(); }
    resetLeaf();
    flipping = false;
    cancelActiveFlip = null;
    mode = 'page';
    syncTurning(false);
    return render(1);
  }

  /* ---------- 第七阶段：最终反思页（md 十一） ----------
     文案逐字照 md:1085 与 md:1104-1108，不由本文件改写；
     本页不是第七份档案：页码仍由 js/archive.js 写成 06 / 06。 */
  var TEXT = {
    question: '如果你的生活也被整理成一份档案，你希望留下什么？',
    go: '继续',
    /* 第七阶段结尾的人工触发（用户决策 m01847）：结束文字停住，点它才走完整收纳 */
    end: '结束',
    ending: [
      '档案整理完毕。',
      '每个人的人生都由许多普通的瞬间组成。',
      '它们或许不够耀眼，却依然值得被记录。'
    ]
  };

  function reflectNode(kind, html) {
    var d = document.createElement('div');
    d.className = 'book-reflect' + (kind ? ' book-reflect--' + kind : '');
    d.innerHTML = html;
    return d;
  }

  /* 只淡入整块（不动 .page-inner 的 opacity）：R1 的教训是整页淡入会出幽灵字 */
  function fadeIn(block, durTok, fallback) {
    var A = Archive.animation;
    if (!A || !block) { return Promise.resolve(false); }
    block.style.opacity = '0';
    var a = A.anim(block, [{ opacity: 0 }, { opacity: 1 }], {
      duration: msTok(durTok, fallback),
      easing: 'cubic-bezier(0.25,0.02,0.15,1)',
      label: 'reflect-in'
    });
    return A.settle(a, block, null).then(function () {
      block.style.opacity = '';
      return true;
    }, function () {
      block.style.opacity = '';
      return false;
    });
  }

  function showQuestion() {
    if (!els.inner) { return Promise.resolve(false); }
    mode = 'reflect';
    els.inner.innerHTML = '';
    var block = reflectNode('question',
      '<p class="book-reflect__q">' + esc(TEXT.question) + '</p>'
      + '<button type="button" class="book-reflect__go">' + esc(TEXT.go) + '</button>');
    els.inner.appendChild(block);
    return fadeIn(block, '--dur-reflect-text', 320);
  }

  function questionOut() {
    var A = Archive.animation;
    var block = els.inner ? els.inner.querySelector('.book-reflect') : null;
    if (!A || !block) { return Promise.resolve(false); }
    var a = A.anim(block, [{ opacity: 1 }, { opacity: 0 }], {
      duration: msTok('--dur-reflect-fade', 360), easing: 'linear', label: 'reflect-out'
    });
    /* settle 只写 transform，所以 opacity 终值自己落成内联值：
       动画被 cancel 后仍停在 0（B6 的 ≤0.05 不能靠 fill:forwards 残留） */
    return A.settle(a, block, null).then(function () {
      block.style.opacity = '0';
      return true;
    }, function () {
      block.style.opacity = '0';
      return true;
    });
  }

  function showEnding() {
    if (!els.inner) { return Promise.resolve(false); }
    mode = 'ending';
    els.inner.innerHTML = '';
    var block = reflectNode('end', TEXT.ending.map(function (line) {
      return '<p class="book-reflect__line">' + esc(line) + '</p>';
    }).join('') + '<button type="button" class="book-reflect__end">' + esc(TEXT.end) + '</button>');
    els.inner.appendChild(block);
    return fadeIn(block, '--dur-reflect-in', 420);
  }

  /* 最终动画里的"笔记本直接合上"（md:1114）：封面 152° → 0° */
  function closeCover(durationMs) {
    var A = Archive.animation;
    if (!A || !els.cover) { return Promise.resolve(false); }
    var dur = Math.round(Number(durationMs)) || 520;
    var a = A.anim(els.cover, [
      { transform: 'rotateY(' + COVER_OPEN + 'deg)' },
      { transform: 'rotateY(0deg)' }
    ], { duration: dur, easing: cssVar('--ease-cover') || 'cubic-bezier(0.34,0.02,0.16,1)', label: 'cover-close' });
    return A.settle(a, els.cover, 'rotateY(0deg)').then(function () { return true; });
  }
  function snapCoverClosed() {
    if (els.cover) { els.cover.style.transform = 'rotateY(0deg)'; }
  }

  /* 兜底复位：把留言页放回去、退出反思模式 */
  function restorePage() {
    mode = 'page';
    var id = (Archive.state && Archive.state.currentId) || rendered || 1;
    return render(id);
  }

  function onInnerClick(ev) {
    var t = ev.target;
    if (!t || !t.closest) { return; }
    /* 问题页的「继续」 */
    if (t.closest('.book-reflect__go')) {
      var fn = Archive.archive && Archive.archive.requestContinue;
      if (typeof fn === 'function') { fn('button'); }
      return;
    }
    /* 结束页的「结束」：直接进第八阶段的完整收纳（js/state.js 的 finish-archive gate） */
    if (t.closest('.book-reflect__end')) {
      var st = Archive.state;
      var fin = (st && typeof st.requestFinish === 'function')
        ? st.requestFinish
        : (Archive.archive && Archive.archive.requestFinish);
      if (typeof fin === 'function') { fin(); }
    }
  }

  function onPageClick(ev) {
    if (!els.page || (ev.target.closest && ev.target.closest('button'))) { return; }
    var rect = els.page.getBoundingClientRect();
    if (!rect.width) { return; }
    var x = (ev.clientX - rect.left) * els.page.offsetWidth / rect.width;
    if (x <= 30) { turnPage(-1); }
    else if (x >= els.page.offsetWidth - 30) { turnPage(1); }
  }

  /* ---------- 打开 ---------- */
  function open() {
    var A = Archive.animation;
    var st = Archive.state;
    if (!A || !els.cover) { return Promise.resolve(false); }
    if (!Archive.can('open-notebook')) { return Promise.resolve(false); }
    render(st.currentId || 1);
    var t = A.time();
    return A.withLock('notebook', function () {
      var a = A.anim(els.cover, [
        { transform: 'rotateY(0deg)', offset: 0, easing: t.easeCover },
        { transform: 'rotateY(' + COVER_OVERSHOOT + 'deg)', offset: 0.74, easing: t.easeSettle },
        { transform: 'rotateY(' + COVER_OPEN + 'deg)', offset: 1 }
      ], { duration: t.notebook, easing: 'linear', label: 'cover' });
      A.stage('notebook', 0, t.notebook);
      return A.settle(a, els.cover, 'rotateY(' + COVER_OPEN + 'deg)').then(function () {
        st.notebook = 'open';
        A.mark('stage:notebook:end');
        return true;
      });
    }, t.notebook * 1.6);
  }

  function mount() {
    els.notebook = document.getElementById('notebook');
    els.cover = els.notebook ? els.notebook.querySelector('.cover') : null;
    els.page = els.notebook ? els.notebook.querySelector('.page') : null;
    if (!els.page) { return false; }
    els.inner = els.page.querySelector('.page-inner');
    if (!els.inner) {
      els.inner = document.createElement('div');
      els.inner.className = 'page-inner';
      els.page.appendChild(els.inner);
    }
    els.leaf = els.page.querySelector('.page-leaf');
    if (!els.leaf) {
      els.leaf = document.createElement('div');
      els.leaf.className = 'page-leaf';
      els.leaf.innerHTML = '<div class="page-leaf__face"><div class="page-leaf__copy"></div></div>'
        + '<div class="page-leaf__back"></div>';
      els.page.appendChild(els.leaf);
    }
    els.leafFace = els.leaf.querySelector('.page-leaf__copy');
    els.inner.addEventListener('click', onInnerClick);
    /* 左缘的书脊覆盖在 .page 之上；在笔记本容器接收点击，
       仍按 .page 的实际边缘判定，避免左 30px 被书脊吃掉。 */
    els.notebook.addEventListener('click', onPageClick);
    return true;
  }

  function boot() {
    var A = Archive.animation;
    if (!mount()) { return; }
    if (A) { A.mark('boot:notebook'); }
    /* 初始页 = 当前档案（P4 的 currentId），关闭态也先把内容渲染好 */
    var id = (Archive.state && Archive.state.currentId) || 1;
    render(id);
  }

  Archive.notebook = {
    boot: boot,
    open: open,
    setPage: setPage,
    turnPage: turnPage,
    reset: reset,
    isTurning: function () { return flipping; },
    render: render,
    pageId: function () { return rendered; },
    flipLog: flipLog,
    COVER_OPEN: COVER_OPEN,
    /* 第七阶段接口：反思页与结束文字（渲染 + 淡入淡出），封面合上，兜底复位 */
    showQuestion: showQuestion,
    questionOut: questionOut,
    showEnding: showEnding,
    closeCover: closeCover,
    snapCoverClosed: snapCoverClosed,
    restorePage: restorePage,
    mode: function () { return mode; },
    text: TEXT
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

}(window, document));
