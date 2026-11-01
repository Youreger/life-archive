/* ============================================================
   animation.js —— WAAPI / 机位 / 世界坐标换算 / FLIP / 点击锁
   · 本阶段所有动画都是 element.animate(...)，不使用 @keyframes；
   · 时长与缓动全部从 css/tokens.css 读，本文件不写裸时长；
   · 镜头只改 #camera 的 translate3d + scale，机位集中在 CINEMA；
   · 屏幕 rect → world 坐标的唯一入口：flipTo(el, targetWorldRect)。
   ============================================================ */
(function (window, document) {
  'use strict';

  var Archive = window.Archive || (window.Archive = {});

  /* ---------- 机位：全站唯一一处 ---------- */
  /* #camera 的 transform-origin 是 50% 50%，即 world (960,540)。
     C1 的目标：信封左移出画（可见宽 ≤ 60%）、档案纸落在
     --reader-anchor 上、笔记本完整留在画内。 */
  var CINEMA = {
    C0: { x: 0, y: 0, s: 1 },
    C1: { x: -290, y: 0, s: 1.35 },
    /* 第七阶段 C2（反思位）：不写死平移量，只声明"把哪个 world 点放到画面中心"。
       书写页中心的 world 坐标 (1615,540) 由 css/notebook.css 的布局决定，
       平移量由 cameraOf() 从 at + s 反算，机位数值仍然只在这一个对象里。 */
    C2: { at: { x: 1615, y: 540 }, s: 1.5 }
  };
  var ORIGIN = { x: 960, y: 540 };
  var READ_CAM = 'C1';
  var REFLECT_CAM = 'C2';

  /* 机位解析：at 形式（"把某 world 点摆到中心"）→ 平移量 + scale */
  function cameraOf(preset) {
    var p = typeof preset === 'string' ? CINEMA[preset] : preset;
    if (!p) { return CINEMA.C0; }
    if (p.at) {
      return {
        x: Math.round(-p.s * (p.at.x - ORIGIN.x) * 100) / 100,
        y: Math.round(-p.s * (p.at.y - ORIGIN.y) * 100) / 100,
        s: p.s
      };
    }
    return p;
  }

  /* ---------- 令牌读取 ---------- */
  var root = document.documentElement;
  function cssVar(name) {
    return (window.getComputedStyle(root).getPropertyValue(name) || '').trim();
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
  function readTime() {
    return {
      flap: msTok('--dur-flap', 640),
      delRise: msTok('--del-rise', 280),
      rise: msTok('--dur-rise', 515),
      delTravel: msTok('--del-travel', 995),
      travel: msTok('--dur-travel', 415),
      land: msTok('--dur-land', 250),
      camera: msTok('--dur-camera', 900),
      notebook: msTok('--dur-notebook', 730),
      flip: msTok('--dur-flip', 660),
      easeFlap: cssVar('--ease-flap') || 'cubic-bezier(0.32,0.06,0.22,1)',
      easeCamera: cssVar('--ease-camera') || 'cubic-bezier(0.30,0.02,0.18,1)',
      easeCover: cssVar('--ease-cover') || 'cubic-bezier(0.34,0.02,0.16,1)',
      easeFlip: cssVar('--ease-flip') || 'cubic-bezier(0.28,0.10,0.16,1)',
      easeSettle: cssVar('--ease-settle') || 'cubic-bezier(0.20,0.70,0.22,1)'
    };
  }

  /* ---------- 取证记录 ---------- */
  var trace = { t0: 0, marks: [], stages: [], locks: [], instances: 0, errors: [], timeouts: [], flip: null };
  function mark(label) {
    var at = window.performance.now();
    trace.marks.push({ label: label, at: at });
    return at;
  }
  function stage(name, fromMs, toMs) {
    trace.stages.push({ name: name, from: fromMs, to: toMs, at: window.performance.now() - trace.t0 });
  }

  /* ---------- WAAPI 封装 ---------- */
  function anim(el, keys, opts) {
    opts = opts || {};
    var cfg = {
      duration: opts.duration || 300,
      easing: opts.easing || 'linear',
      fill: opts.fill || 'forwards'
    };
    if (opts.delay) { cfg.delay = opts.delay; }
    var a = el.animate(keys, cfg);
    trace.instances += 1;
    if (opts.label) { mark('anim:' + opts.label); }
    return a;
  }

  /* 动画结束 → 提交最终样式 → 撤掉可取消的动画对象。
     P9b：finished 只是"大概率"会落地 —— 它要求动画拿到 startTime 并走到终点；
     合成器/时间线异常、被同属性动画取代、目标不在渲染树时它可能一直 pending，
     现场表现就是"动画起了、Promise 链不再推进、看门狗放锁也救不回相位"。
     所以每个 settle 自带一个只属于自己的截止时刻（延迟 + 时长×迭代 + 余量）：
       · 到点仍在跑或是 idle（从未拿到起点）→ 认作卡死，提交终值并 resolve；
       · 到点是被显式 pause、或时间线停摆（截图/后台节流）→ 重新武装，最多 3 次。
     正常路径 finished 一定先到，时长与顺序一个字节都不变。 */
  var SETTLE_PAD = 700;
  var SETTLE_REARM_MAX = 3;
  function settle(a, el, finalCss) {
    return new Promise(function (resolve) {
      var settled = false;
      var timer = null;
      var rearm = 0;
      var clock = armClock();
      function finish(why) {
        if (settled) { return; }
        settled = true;
        if (timer) { window.clearTimeout(timer); timer = null; }
        if (finalCss && el) { el.style.transform = finalCss; }
        try { a.cancel(); } catch (e) { /* 已取消 */ }
        if (why !== 'finished' && why !== 'canceled') {
          trace.timeouts.push(why);
          mark('settle:' + why);
        }
        resolve(true);
      }
      a.finished.then(
        function () { finish('finished'); },
        function () { finish('canceled'); }
      );
      var timing = null;
      try { timing = a.effect ? a.effect.getTiming() : null; } catch (e2) { timing = null; }
      if (!timing) { return; }
      var dur = Number(timing.duration);
      var del = Number(timing.delay) || 0;
      var it = timing.iterations === undefined ? 1 : Number(timing.iterations);
      if (!isFinite(dur) || dur <= 0 || !isFinite(it) || it <= 0) { return; }
      var limit = Math.round(del + dur * it + SETTLE_PAD);
      function arm() {
        timer = window.setTimeout(function () {
          timer = null;
          if (settled) { return; }
          var ps = null;
          try { ps = a.playState; } catch (e3) { ps = null; }
          var paused = ps === 'paused';
          if ((paused || stalledSince(clock)) && rearm < SETTLE_REARM_MAX) {
            rearm += 1;
            clock = armClock();
            mark('settle:rearm');
            arm();
            return;
          }
          finish(paused ? 'deadline-paused' : 'deadline');
        }, limit);
      }
      arm();
    });
  }

  /* ---------- 点击锁：三个独立 scope ---------- */
  var locks = {};
  function release(token, reason) {
    if (token.watchdog) { window.clearTimeout(token.watchdog); token.watchdog = null; }
    if (locks[token.scope] !== token) { return; }
    delete locks[token.scope];
    trace.locks.push({
      scope: token.scope,
      reason: reason || token.why || 'finally',
      at: Math.round((window.performance.now() - token.at) * 10) / 10,
      estimate: token.estimate
    });
    mark('lock:release:' + token.scope);
  }
  /* ---------- 停摆感知：看门狗不能只看墙钟 ----------
     动画跑在文档时间线上，合成器停顿 / 后台节流 / 截图都会让时间线停摆，
     墙钟却照走。此时若按墙钟收尾，就会把"成功路径"误判成"动画卡死"。
     判据：触发时刻比较 document.timeline.currentTime 的推进量 Δt 与墙钟
     流逝 Δw —— Δt < 0.75×Δw 视为时间线停摆，只重新武装一次（记录
     rearm），不动 UI；Δt ≥ 0.75×Δw 才认定真卡死。 */
  function armClock() {
    var tl = document.timeline && document.timeline.currentTime;
    return { tl: typeof tl === 'number' ? tl : 0, wall: window.performance.now() };
  }
  function stalledSince(c) {
    var tl = document.timeline && document.timeline.currentTime;
    var now = typeof tl === 'number' ? tl : 0;
    var dw = window.performance.now() - c.wall;
    return dw > 0 && (now - c.tl) < 0.75 * dw;
  }

  /* md:944：放锁只解除互斥，不等于恢复状态。卡在中途相位时所有 gate 都要求
     idle，页面就永久不可操作 —— 所以看门狗放锁之后必须再问一次"谁能把状态复原"。
     真正的复位逻辑在 js/archive.js（它掌握纸叠/信封/机位），这里只负责回调。 */
  function recoverFrom(scope) {
    if (typeof Archive.recover !== 'function') { return false; }
    try {
      var done = Archive.recover(scope) === true;
      if (done) { mark('lock:recovered:' + scope); }
      return done;
    } catch (e) {
      trace.errors.push('recover:' + String(e));
      return false;
    }
  }

  /* 代数：每次强制复位 +1。进行中的链在每一步比较自己捕获的代数，
     不相等就作废（否则复位之后旧链会继续把 phase 写回 landing/reading）。 */
  var epoch = 0;
  function generation() { return epoch; }
  function bumpGeneration() { epoch += 1; return epoch; }

  function withLock(scope, fn, estimateMs) {
    if (locks[scope]) {
      mark('lock:busy:' + scope);
      return Promise.resolve(false);
    }
    var token = {
      scope: scope, at: window.performance.now(), estimate: estimateMs || 0,
      watchdog: null, why: null, clock: armClock(), rearmed: false
    };
    locks[scope] = token;
    mark('lock:enter:' + scope);
    function armWatchdog() {
      token.watchdog = window.setTimeout(function () {
        token.watchdog = null;
        if (locks[token.scope] !== token) { return; }   /* 已正常释放，收尾与看门狗无关 */
        if (!token.rearmed && stalledSince(token.clock)) {
          token.rearmed = true;                          /* 只重新武装一次，不无限重排 */
          token.clock = armClock();
          trace.errors.push('watchdog:rearm:' + token.scope);
          mark('lock:rearm:' + token.scope);
          armWatchdog();
          return;
        }
        token.why = 'watchdog';
        trace.errors.push('watchdog:' + scope);
        mark('lock:watchdog:' + scope);
        release(token);
        recoverFrom(scope);
      }, Math.round(token.estimate * 1.6));
    }
    if (token.estimate > 0) { armWatchdog(); }
    var p;
    try {
      p = fn();
    } catch (e) {
      trace.errors.push(String(e));
      release(token);
      return Promise.resolve(false);
    }
    return Promise.resolve(p).then(
      function (v) { release(token); return v; },
      function (e) { trace.errors.push(String(e)); release(token); return false; }
    );
  }

  /* ---------- 镜头 ---------- */
  function cameraCss(preset) {
    var p = cameraOf(preset);
    return 'translate3d(' + p.x + 'px, ' + p.y + 'px, 0) scale(' + p.s + ')';
  }
  function cameraMatrix() {
    var el = document.getElementById('camera');
    if (!el) { return new DOMMatrix(); }
    var t = window.getComputedStyle(el).transform;
    return t === 'none' ? new DOMMatrix() : new DOMMatrix(t);
  }
  function cameraScale() { return cameraMatrix().a; }

  /* ---------- 坐标换算 ---------- */
  /* #world-fit 的 S 由 main.js 写进 style（left/top/scale），这里读回来 */
  function fitView() {
    var el = document.getElementById('world-fit');
    if (!el) { return { scale: 1, x: 0, y: 0 }; }
    var t = window.getComputedStyle(el).transform;
    if (!t || t === 'none') { return { scale: 1, x: 0, y: 0 }; }
    var m = new DOMMatrix(t);
    return { scale: m.a, x: m.e, y: m.f };
  }
  /* 屏幕(client) → #camera 坐标系（canvas） */
  function screenToCanvas(x, y) {
    var v = fitView();
    return { x: (x - v.x) / v.scale, y: (y - v.y) / v.scale };
  }
  /* canvas → world：反解 #camera 的 matrix4（含 rotate/scale，不假设只有 scale） */
  function canvasToWorld(p) {
    var inv = cameraMatrix().inverse();
    var q = new DOMPoint(p.x - ORIGIN.x, p.y - ORIGIN.y).matrixTransform(inv);
    return { x: q.x + ORIGIN.x, y: q.y + ORIGIN.y };
  }
  function worldToCanvas(p) {
    var q = new DOMPoint(p.x - ORIGIN.x, p.y - ORIGIN.y).matrixTransform(cameraMatrix());
    return { x: q.x + ORIGIN.x, y: q.y + ORIGIN.y };
  }
  /* 屏幕 rect → world rect（两层缩放都反解掉） */
  function rectToWorld(r) {
    var a = canvasToWorld(screenToCanvas(r.left, r.top));
    var b = canvasToWorld(screenToCanvas(r.right, r.bottom));
    return { left: a.x, top: a.y, width: b.x - a.x, height: b.y - a.y, right: b.x, bottom: b.y };
  }
  /* 仅用于取证对照：task 里 T1 字面所说的"rect 除以 (S × cameraScale)" */
  function naiveRectToWorld(r) {
    var v = fitView();
    var k = v.scale * cameraScale();
    return {
      left: (r.left - v.x) / k, top: (r.top - v.y) / k,
      width: r.width / k, height: r.height / k
    };
  }
  function rectOfWorld(w) {
    var a = worldToCanvas({ x: w.left, y: w.top });
    var b = worldToCanvas({ x: w.right, y: w.bottom });
    return { left: a.x, top: a.y, width: b.x - a.x, height: b.y - a.y };
  }
  /* 给定画布点求 world 点（可指定机位，用于"落点由布局决定"的反推） */
  function worldAtCanvas(p, preset) {
    var c = cameraOf(preset || CINEMA.C0);
    return {
      x: ORIGIN.x + (p.x - ORIGIN.x - c.x) / c.s,
      y: ORIGIN.y + (p.y - ORIGIN.y - c.y) / c.s
    };
  }

  /* 纸叠落点（world x）：由 css 令牌给出，属桌面布局而非机位 */
  function landX() { return numTok('--bundle-land-x', 880); }

  /* 阅读位目标 rect（world）：在阅读机位下正好是 --reader-anchor 处
     --reader-paper-w × --reader-paper-h 的 A4 框 */
  function readerTargetWorld() {
    var w = numTok('--reader-paper-w', 636);
    var h = numTok('--reader-paper-h', 900);
    var ax = numTok('--reader-anchor-x', 900);
    var ay = numTok('--reader-anchor-y', 540);
    var c = CINEMA[READ_CAM];
    var s = c.s;
    var center = worldAtCanvas({ x: ax, y: ay }, READ_CAM);
    var ww = w / s;
    var hh = h / s;
    return {
      left: center.x - ww / 2, top: center.y - hh / 2,
      width: ww, height: hh, right: center.x + ww / 2, bottom: center.y + hh / 2
    };
  }

  /* ---------- FLIP ---------- */
  /* 记录当前位置尺寸 → 求目标 → 算逆向变换 → 动画到目标 → 提交最终样式。
     位移写在 .motion-layer（translate+scale），旋转写在 .pose-layer，
     三层属性不混用。必须传同一个 DOM 元素。 */
  function flipTo(item, target, opts) {
    opts = opts || {};
    var t = readTime();
    if (!item) { return Promise.resolve(false); }
    var motion = item.querySelector('.motion-layer');
    var pose = item.querySelector('.pose-layer');
    if (!motion) { return Promise.resolve(false); }

    /* 源矩形必须取「承载 transform 的那一层」的渲染盒，不能取 .archive-item：
       item 是布局盒，getBoundingClientRect 不含子层 transform，而纸被 motion-layer
       的基准位移（自然错位 ±4px）偏着；用 item 量会让落点整体偏掉那几个像素。 */
    var raw = motion.getBoundingClientRect();
    var from = rectToWorld(raw);
    var naive = naiveRectToWorld(raw);

    var kx = target.width / from.width;
    var ky = target.height / from.height;
    var dx = (target.left + target.width / 2) - (from.left + from.width / 2);
    var dy = (target.top + target.height / 2) - (from.top + from.height / 2);

    var m0 = window.getComputedStyle(motion).transform;
    var base = m0 === 'none' ? new DOMMatrix() : new DOMMatrix(m0);
    var fromCss = 'translate3d(' + base.e + 'px, ' + base.f + 'px, 0) scale(1, 1)';
    var toCss = 'translate3d(' + (base.e + dx) + 'px, ' + (base.f + dy) + 'px, 0) scale(' + kx + ', ' + ky + ')';

    trace.flip = {
      rectClient: { left: raw.left, top: raw.top, width: raw.width, height: raw.height },
      fromWorld: from, naiveWorld: naive, target: target,
      dx: dx, dy: dy, kx: kx, ky: ky,
      naiveDx: (target.left + target.width / 2) - (naive.left + naive.width / 2),
      naiveDy: (target.top + target.height / 2) - (naive.top + naive.height / 2)
    };

    item.classList.add('is-reading');
    var a = anim(motion, [{ transform: fromCss }, { transform: toCss }], {
      duration: opts.duration || t.flip,
      easing: opts.easing || t.easeFlip,
      label: opts.label || 'flip'
    });
    var b = null;
    if (pose) {
      var p0 = window.getComputedStyle(pose).transform;
      var pm = p0 === 'none' ? new DOMMatrix() : new DOMMatrix(p0);
      var deg = Math.round(Math.atan2(pm.b, pm.a) * 180 / Math.PI * 100) / 100;
      if (deg !== 0) {
        b = anim(pose, [{ transform: 'rotate(' + deg + 'deg)' }, { transform: 'rotate(0deg)' }], {
          duration: opts.duration || t.flip, easing: t.easeSettle, label: 'deskew'
        });
      }
    }
    return Promise.all([
      settle(a, motion, toCss),
      b ? settle(b, pose, 'rotate(0deg)') : Promise.resolve(true)
    ]).then(function () { return true; });
  }

  /* ---------- 纸叠四段的 keyframe 序列 ---------- */
  function bundleKeys(t, box) {
    var total = t.delTravel + t.travel + t.land;
    var riseEnd = t.delRise + t.rise;
    var travelEnd = t.delTravel + t.travel;
    function off(ms) { return Math.min(1, Math.max(0, ms / total)); }
    var up = -Math.abs(box.rise);
    return [
      { transform: 'translate3d(0, 0, 0)', offset: 0, easing: 'linear' },
      { transform: 'translate3d(0, 0, 0)', offset: off(t.delRise), easing: t.easeSettle },
      { transform: 'translate3d(0, ' + up + 'px, 0)', offset: off(riseEnd), easing: 'linear' },
      { transform: 'translate3d(0, ' + up + 'px, 0)', offset: off(t.delTravel), easing: t.easeSettle },
      { transform: 'translate3d(' + box.dx + 'px, ' + Math.round(up * 0.64) + 'px, 0)', offset: off(travelEnd), easing: t.easeSettle },
      { transform: 'translate3d(' + box.dx + 'px, 0, 0)', offset: 1 }
    ];
  }

  Archive.animation = {
    CINEMA: CINEMA,
    READ_CAM: READ_CAM,
    REFLECT_CAM: REFLECT_CAM,
    cameraOf: cameraOf,
    trace: trace,
    mark: mark,
    stage: stage,
    time: readTime,
    anim: anim,
    settle: settle,
    withLock: withLock,
    locks: locks,
    generation: generation,
    bumpGeneration: bumpGeneration,
    armClock: armClock,
    stalledSince: stalledSince,
    cameraCss: cameraCss,
    cameraMatrix: cameraMatrix,
    cameraScale: cameraScale,
    fitView: fitView,
    screenToCanvas: screenToCanvas,
    canvasToWorld: canvasToWorld,
    worldToCanvas: worldToCanvas,
    rectToWorld: rectToWorld,
    naiveRectToWorld: naiveRectToWorld,
    rectOfWorld: rectOfWorld,
    worldAtCanvas: worldAtCanvas,
    landX: landX,
    readerTargetWorld: readerTargetWorld,
    flipTo: flipTo,
    bundleKeys: bundleKeys,
    resetTrace: function () { trace.marks.length = 0; trace.stages.length = 0; trace.locks.length = 0; trace.timeouts.length = 0; trace.instances = 0; trace.flip = null; trace.t0 = window.performance.now(); }
  };

})(window, document);
