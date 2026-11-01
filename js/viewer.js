/* ============================================================
   viewer.js —— 唯一一个统一图片查看器（第六阶段，md:1170-1211）
   · #viewer-overlay 在 #world-fit 之外：本层坐标即视口坐标，
     FLIP 直接用 getBoundingClientRect（不除以 S、不除以 cameraScale）。
   · 单例：overlay 内 .viewer 恒 ≤ 1；打开瞬间置 state.viewer='open'，
     于是 can('switch-paper') 立刻为 false（md:1201-1209），不排队、不补开。
   · 12 张 png 实际不存在：查看器内容是"该素材的占位面放大"；
     <img> 叠层只在源素材位真的载入成功时挂 src，失败只隐藏自身，
     布局零变化（也避免为缺图再触发一条 404，控制台仍只有 12 条基线）。
   · 关闭即释放临时资源：动画 cancel、监听解绑、子节点清空、img src 置空。
   ============================================================ */
(function (window, document) {
  'use strict';

  var Archive = window.Archive || (window.Archive = {});

  var overlay = document.getElementById('viewer-overlay');
  var built = false;
  var els = { scrim: null, frame: null, ph: null, name: null, tag: null, img: null, close: null };

  /* current = 打开态的唯一样本；null 即关闭态（单例由此保证） */
  var current = null;
  var log = { opens: [], closes: [], lastOpen: null, lastClose: null };
  var forced = { timer: 0, clock: null, rearmed: false };
  var listeners = [];
  var resolver = null;

  function anim() { return Archive.animation || {}; }
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
  function traceErr(tag) {
    var t = anim().trace;
    if (t && t.errors) { t.errors.push(tag); }
  }
  function easeOut() { return cssVar('--ease-out-soft') || 'cubic-bezier(0.16, 0.84, 0.30, 1)'; }
  function easeIn() { return cssVar('--ease-in-soft') || 'ease-in'; }

  /* ---------- 素材元信息 ---------- */
  function assetOf(key) {
    var list = (Archive.data && Archive.data.listAssets) ? Archive.data.listAssets() : [];
    for (var i = 0; i < list.length; i += 1) {
      if (list[i].key === key) { return list[i]; }
    }
    return null;
  }
  /* 素材位用的是 CSS 的 "宽 / 高" 写法（js/data.js 的 ratio 字段） */
  function ratioOf(asset, slotEl) {
    var text = (asset && asset.ratio) ? asset.ratio : '';
    if (!text && slotEl) { text = slotEl.style.getPropertyValue('--asset-ratio') || ''; }
    var m = /^([0-9]*\.?[0-9]+)\s*\/\s*([0-9]*\.?[0-9]+)$/.exec(String(text).trim());
    if (m) {
      var r = parseFloat(m[1]) / parseFloat(m[2]);
      if (isFinite(r) && r > 0) { return r; }
    }
    return 3 / 2;
  }

  /* ---------- 目标盒：居中、保持素材 aspect-ratio、宽 ≤78%、高 ≤82% 视口 ---- */
  function targetBox(ratio) {
    var vw = document.documentElement.clientWidth || window.innerWidth;
    var vh = document.documentElement.clientHeight || window.innerHeight;
    var maxW = vw * (numTok('--viewer-max-w', 78) / 100);
    var maxH = vh * (numTok('--viewer-max-h', 82) / 100);
    var w = maxW;
    var h = w / ratio;
    if (h > maxH) { h = maxH; w = h * ratio; }
    /* 向下取整：四舍五入会越过 78% / 82% 的上限（1497.6 → 1498 就超了） */
    w = Math.floor(w);
    h = Math.floor(h);
    var left = Math.round((vw - w) / 2);
    var top = Math.round((vh - h) / 2);
    return {
      left: left, top: top, width: w, height: h,
      right: left + w, bottom: top + h, vw: vw, vh: vh
    };
  }

  /* ---------- DOM：按需建、关闭即拆（A11：关后无残留子节点） ---------- */
  function mount() {
    if (built || !overlay) { return; }
    overlay.innerHTML = ''
      + '<div class="viewer__scrim"></div>'
      + '<div class="viewer" role="group" aria-label="素材预览">'
      + '<span class="viewer__ph">'
      + '<span class="viewer__name"></span>'
      + '<span class="viewer__tag">示例占位</span>'
      + '</span>'
      + '<img class="viewer__img" alt="">'
      + '</div>'
      + '<button class="viewer__close" type="button" aria-label="关闭预览"></button>';
    els.scrim = overlay.querySelector('.viewer__scrim');
    els.frame = overlay.querySelector('.viewer');
    els.ph = overlay.querySelector('.viewer__ph');
    els.name = overlay.querySelector('.viewer__name');
    els.tag = overlay.querySelector('.viewer__tag');
    els.img = overlay.querySelector('.viewer__img');
    els.close = overlay.querySelector('.viewer__close');
    if (els.img) {
      els.img.addEventListener('error', function () { els.img.classList.add('is-missing'); });
    }
    built = true;
  }

  function unmount() {
    if (els.img) {
      els.img.removeAttribute('src');           /* A11：img src 已清 */
      els.img.classList.add('is-missing');
    }
    if (overlay) {
      if (overlay.getAnimations) {
        try {
          overlay.getAnimations({ subtree: true }).forEach(function (a) {
            try { a.cancel(); } catch (e) { /* 已结束 */ }
          });
        } catch (e) { /* 老引擎无 subtree 选项 */ }
      }
      overlay.innerHTML = '';                   /* A11：无残留子节点 */
    }
    els = { scrim: null, frame: null, ph: null, name: null, tag: null, img: null, close: null };
    built = false;
  }

  function placeClose(t) {
    var size = numTok('--viewer-close-size', 44);
    var pad = numTok('--viewer-close-margin', 14);
    if (!els.close) { return; }
    els.close.style.width = size + 'px';
    els.close.style.height = size + 'px';
    els.close.style.left = Math.round(t.left + t.width - size - pad) + 'px';
    els.close.style.top = Math.round(t.top + pad) + 'px';
  }

  /* ---------- 视觉度量：占位文案与取样框随块缩放 ----------
     绝对字号（--fs-title-sm 26px / --fs-small 13px）放进 1497×748 的放大块里会读成
     "一大片空场 + 一个字标"，所以字号与虚线框内边距都按块高换算：
       name = max(22px, 0.044 × 块高)
       tag  = max(12px, 0.020 × 块高)
       取样框内边距 = max(round(0.04 × 块高), --viewer-inset-min)
     取样框下限是独立的一条：关闭按钮占住右上角，虚线必须整条让开（否则两者
     交叠 28×28），所以 inset 有硬底、按钮外边距另有 --viewer-close-margin。
     全走 CSS 变量，几何仍由 left/top/width/height 决定（不进 transform）。 */
  function applyMetrics(t) {
    if (!els.frame) { return; }
    var h = t && t.height ? t.height : 0;
    var nameSize = Math.max(22, h * 0.044);
    var tagSize = Math.max(12, h * 0.020);
    els.frame.style.setProperty('--viewer-name-size', (Math.round(nameSize * 10) / 10) + 'px');
    els.frame.style.setProperty('--viewer-tag-size', (Math.round(tagSize * 10) / 10) + 'px');
    var inset = Math.round(h * 0.04);
    var floor = numTok('--viewer-inset-min', 76);
    els.frame.style.setProperty('--viewer-inset', Math.max(inset, floor) + 'px');
  }

  /* ---------- 监听：每次打开才绑，关闭即解 ---------- */
  function on(target, type, fn, opts) {
    target.addEventListener(type, fn, opts);
    listeners.push([target, type, fn, opts]);
  }
  function offAll() {
    listeners.forEach(function (l) { l[0].removeEventListener(l[1], l[2], l[3]); });
    listeners.length = 0;
  }
  function bindListeners() {
    on(overlay, 'click', onOverlayClick);
    on(document, 'keydown', onKeydown, true);   /* body 无焦点时 Escape 也生效 */
    on(window, 'resize', onResize, { passive: true });
  }
  function onOverlayClick(ev) {
    if (!current) { return; }
    var t = ev.target;
    if (t && t.closest && t.closest('.viewer__close')) { close('button'); return; }
    if (t === els.scrim || t === overlay) { close('scrim'); }
  }
  function onKeydown(ev) {
    if (!current) { return; }
    if (ev.key === 'Escape' || ev.key === 'Esc') {
      if (ev.preventDefault) { ev.preventDefault(); }
      close('escape');
    }
  }
  /* 视口变化：只把已打开的那一帧重新放到新的目标盒，不动状态机 */
  function onResize() {
    if (!current || current.closing) { return; }
    var t = targetBox(current.ratio);
    current.target = t;
    els.frame.style.left = t.left + 'px';
    els.frame.style.top = t.top + 'px';
    els.frame.style.width = t.width + 'px';
    els.frame.style.height = t.height + 'px';
    applyMetrics(t);
    placeClose(t);
  }

  /* ---------- 兜底：墙钟 × 停摆感知（A15） ----------
     看门狗只释放锁，不碰 UI；state.viewer 一旦卡在 'open'，换纸 gate 就永久为 false。
     所以本地自备一个 1.6× 窗口的强制复位：到点仍未收尾就拆层、恢复 state、
     解开挂起的 Promise（withLock 随之释放）。时间线停摆（截图/合成器暂停）
     只重新武装一次，判据与 js/animation.js 的看门狗一致。 */
  function clearForced() {
    if (forced.timer) { window.clearTimeout(forced.timer); forced.timer = 0; }
  }
  function armForced(windowMs) {
    var a = anim();
    forced.clock = a.armClock ? a.armClock() : null;
    forced.rearmed = false;
    clearForced();
    forced.timer = window.setTimeout(function () {
      forced.timer = 0;
      if (!current) { return; }
      var A = anim();
      if (!forced.rearmed && forced.clock && A.stalledSince && A.stalledSince(forced.clock)) {
        forced.rearmed = true;
        forced.clock = A.armClock ? A.armClock() : forced.clock;
        traceErr(current.finishedOpen ? 'viewer:close-rearm' : 'viewer:rearm');
        armForced(windowMs);
        return;
      }
      traceErr(current.finishedOpen ? 'viewer:close-forced-reset' : 'viewer:forced-reset');
      var r = resolver;
      resolver = null;
      hardReset();
      if (r) { r(false); }
    }, Math.round(windowMs * 1.6) + 30);
  }

  function resolveRun(v) {
    var r = resolver;
    resolver = null;
    if (r) { r(v); }
  }

  /* 无条件回到关闭态（成功关闭 / 强制复位共用），不改 phase、不动档案与笔记本 */
  function hardReset() {
    offAll();
    clearForced();
    unmount();
    if (overlay) {
      overlay.classList.remove('is-open');
      overlay.setAttribute('aria-hidden', 'true');
    }
    st().viewer = 'closed';
    current = null;
  }

  /* ---------- 打开 ---------- */
  function open(slotEl) {
    if (!overlay || !slotEl || current) { return Promise.resolve(false); }
    if (Archive.can && Archive.can('open-viewer') !== true) { return Promise.resolve(false); }
    var lock = anim();
    if (!lock.withLock) { return Promise.resolve(false); }
    var key = slotEl.getAttribute('data-asset-key') || '';
    var openMs = msTok('--dur-viewer-open', 340);
    return lock.withLock('viewer', function () {
      return runOpen(slotEl, key, assetOf(key), openMs);
    }, openMs);
  }

  function runOpen(slotEl, key, asset, openMs) {
    var a = anim();
    var ratio = ratioOf(asset, slotEl);
    var srcRect = slotEl.getBoundingClientRect();
    var target = targetBox(ratio);
    var startAt = window.performance.now();

    mount();
    if (!els.frame) { return Promise.resolve(false); }

    els.name.textContent = (asset && asset.name) ? asset.name : (key || '素材');
    /* 真图只在源素材位确实载入成功时才挂 src：png 到位后这里自然显示真图，
       缺图时不产生第 13 条 404（控制台保持 12 条基线）。 */
    var slotImg = slotEl.querySelector('.asset-slot__img');
    if (slotImg && slotImg.naturalWidth > 0 && slotImg.currentSrc) {
      els.img.classList.remove('is-missing');
      els.img.src = slotImg.currentSrc;
    } else {
      els.img.classList.add('is-missing');
      els.img.removeAttribute('src');
    }

    els.frame.style.left = target.left + 'px';
    els.frame.style.top = target.top + 'px';
    els.frame.style.width = target.width + 'px';
    els.frame.style.height = target.height + 'px';
    applyMetrics(target);
    var sx = target.width ? srcRect.width / target.width : 1;
    var sy = target.height ? srcRect.height / target.height : 1;
    var fromCss = 'translate(' + (srcRect.left - target.left) + 'px, '
      + (srcRect.top - target.top) + 'px) scale(' + sx + ', ' + sy + ')';
    els.frame.style.transform = fromCss;
    els.scrim.style.opacity = '0';
    placeClose(target);

    overlay.classList.add('is-open');
    overlay.setAttribute('aria-hidden', 'false');
    st().viewer = 'open';                    /* 立刻关门：换纸 gate 变 false */
    current = {
      key: key, asset: asset, ratio: ratio, srcEl: slotEl, srcRect: srcRect,
      target: target, startAt: startAt, finishedOpen: false, closing: false,
      via: ''
    };
    bindListeners();
    armForced(openMs);

    var frames = a.anim(els.frame, [
      { transform: fromCss },
      { transform: 'translate(0px, 0px) scale(1, 1)' }
    ], { duration: openMs, easing: easeOut(), label: 'viewer-open' });
    var scrims = a.anim(els.scrim, [
      { opacity: 0 },
      { opacity: 1 }
    ], { duration: openMs, easing: 'linear', label: 'viewer-scrim' });

    return new Promise(function (resolve) {
      resolver = resolve;
      Promise.all([
        a.settle(frames, els.frame, 'translate(0px, 0px) scale(1, 1)'),
        a.settle(scrims, els.scrim, null)
      ]).then(function () { finishOpen(true); }, function () { finishOpen(false); });
    });
  }

  function finishOpen(ok) {
    if (!current || current.finishedOpen) { return; }
    current.finishedOpen = true;
    clearForced();
    if (!ok) { hardReset(); resolveRun(false); return; }
    /* 动画对象收尾即 cancel，fill:forwards 的效果会一起消失 —— 遮罩必须把
       终态写回内联样式，否则打开完成后背景一丝不变暗（实测 ratio=1.000）。 */
    if (els.scrim) { els.scrim.style.opacity = '1'; }
    if (els.close) { els.close.classList.add('is-live'); }
    var ms = Math.round(window.performance.now() - current.startAt);
    log.lastOpen = { key: current.key, ms: ms };
    log.opens.push(log.lastOpen);
    resolveRun(true);
  }

  /* ---------- 关闭 ---------- */
  function close(via) {
    if (!current || !current.finishedOpen || current.closing) { return Promise.resolve(false); }
    var lock = anim();
    if (!lock.withLock) { return Promise.resolve(false); }
    var ms = msTok('--dur-viewer-close', 260);
    current.via = via || 'button';
    return lock.withLock('viewer', function () {
      return runClose(ms);
    }, ms);
  }

  function runClose(ms) {
    var a = anim();
    current.closing = true;
    current.closeStart = window.performance.now();
    offAll();                                 /* 收尾途中不再接受第二次关闭 */
    if (els.close) { els.close.classList.remove('is-live'); }

    var t = current.target;
    /* 源可能已不在（理论上不会：md:1203 说档案与笔记本仍在原位），取不到就用打开时的快照 */
    var srcRect = (current.srcEl && current.srcEl.isConnected)
      ? current.srcEl.getBoundingClientRect() : current.srcRect;
    current.landRect = { left: srcRect.left, top: srcRect.top, width: srcRect.width, height: srcRect.height };
    var sx = t.width ? srcRect.width / t.width : 1;
    var sy = t.height ? srcRect.height / t.height : 1;
    var toCss = 'translate(' + (srcRect.left - t.left) + 'px, '
      + (srcRect.top - t.top) + 'px) scale(' + sx + ', ' + sy + ')';

    armForced(ms);
    var frames = a.anim(els.frame, [
      { transform: 'translate(0px, 0px) scale(1, 1)' },
      { transform: toCss }
    ], { duration: ms, easing: easeIn(), label: 'viewer-close' });
    var scrims = a.anim(els.scrim, [
      { opacity: 1 },
      { opacity: 0 }
    ], { duration: ms, easing: 'linear', label: 'viewer-scrim-out' });

    return new Promise(function (resolve) {
      resolver = resolve;
      Promise.all([
        a.settle(frames, null, null),
        a.settle(scrims, null, null)
      ]).then(function () { finishClose(true); }, function () { finishClose(false); });
    });
  }

  function finishClose(ok) {
    if (!current || current.finishedClose) { return; }
    current.finishedClose = true;
    var ms = Math.round(window.performance.now() - current.closeStart);
    log.lastClose = { key: current.key, ms: ms, via: current.via, ok: ok === true };
    log.closes.push(log.lastClose);
    hardReset();
    resolveRun(ok === true);
  }

  /* ---------- 取证接口 ---------- */
  Archive.viewer = {
    open: open,
    close: close,
    isOpen: function () { return current !== null; },
    state: function () {
      return current ? {
        key: current.key, ratio: current.ratio,
        target: current.target, landRect: current.landRect || null,
        finishedOpen: current.finishedOpen, closing: current.closing
      } : null;
    },
    rect: function () {
      return els.frame ? els.frame.getBoundingClientRect() : null;
    },
    parts: function () {
      return {
        overlay: overlay ? overlay.getBoundingClientRect() : null,
        scrim: els.scrim ? els.scrim.getBoundingClientRect() : null,
        frame: els.frame ? els.frame.getBoundingClientRect() : null,
        close: els.close ? els.close.getBoundingClientRect() : null,
        children: overlay ? overlay.children.length : -1,
        imgSrc: els.img ? (els.img.getAttribute('src') || '') : '',
        built: built
      };
    },
    targetBox: targetBox,
    log: log
  };

}(window, document));
