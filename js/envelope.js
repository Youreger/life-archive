/* ============================================================
   envelope.js —— 信封初次展开（md:429-497）
   点击一次，串起五件事：
     段一 封盖绕上边缘 3D 翻转 155°（结束保持，不回弹）
     段二 纸叠从口袋上方缓慢露出（升起）
     段三 纸叠整体向上移动后向桌面中央偏右移动
     段四 纸叠落在桌面中央偏左
     之后 镜头推进（#camera → C1）∥ 笔记本打开，再 FLIP 最上面一张纸
   全部 element.animate(...)，段间不重叠、完成后才进下一段。
   ============================================================ */
(function (window, document) {
  'use strict';

  var Archive = window.Archive || (window.Archive = {});

  var FLAP_OPEN = 155;   /* deg：落在 md 要求的 155°~180°；155° 时盖尖不出画布 */
  var RISE = 150;        /* px：纸叠自口袋升起的高度 */
  var GAP = 24;          /* px：落点与信封右缘之间留出的桌面空隙（备用） */
  var WATCH_PAD = 600;   /* ms：看门狗预估里留给表单/合成的一点点余量 */

  var els = {};

  function boot() {
    var A = Archive.animation;
    if (!A) { return; }
    els.envelope = document.getElementById('envelope');
    els.flap = els.envelope ? els.envelope.querySelector('.front-flap') : null;
    els.bundle = document.getElementById('paper-bundle');
    els.order = els.bundle ? els.bundle.querySelector('.archive-item[data-id="1"]') : null;
    if (els.envelope && els.flap && els.bundle && els.order) {
      els.envelope.addEventListener('click', onClick);
      A.mark('boot:envelope');
    }
  }

  function onClick() {
    var A = Archive.animation;
    /* 完整结束后，信封成为重播入口：先恢复初始场景，再沿用同一条开场链。 */
    if (Archive.state && Archive.state.phase === 'ended' && Archive.state.reflection === 'done') {
      if (Archive.archive && Archive.archive.resetScene) { Archive.archive.resetScene(); }
    }
    /* 第八阶段：阅读态点信封 = 收纳（md:1131）。同一个点击处理器不新增按钮；
       两个 gate 互斥（open-envelope 要 phase=idle，close-envelope 要 phase=reading），
       其余相位（opening/landing/reflection/ended/closing）落进 click:ignored。 */
    if (Archive.can('close-envelope')) {
      if (Archive.state && Archive.state.requestClose) { Archive.state.requestClose(); }
      return;
    }
    if (!Archive.can('open-envelope')) {
      A.mark('click:ignored');
      return;
    }
    var t = A.time();
    var total = t.delTravel + t.travel + t.land;
    A.resetTrace();
    A.mark('seq:start');
    A.trace.total = total;
    A.withLock('envelope', function () { return play(t, total); }, total + t.camera + t.flip + WATCH_PAD)
      .then(function () { A.mark('seq:end'); });
  }

  function play(t, total) {
    var A = Archive.animation;
    var st = Archive.state;
    /* P9b：这条链每一步都先确认自己没被兜底接管 —— 看门狗触发强制复位时会把
       代数 +1，旧链若继续跑就会把 phase 写回 landing/reading，界面与状态又对不上。 */
    var gen = A.generation();
    function live() {
      if (A.generation() === gen) { return true; }
      A.mark('seq:aborted');
      return false;
    }

    st.phase = 'opening';
    st.envelope = 'opening';

    /* ---- 段一：封盖绕上边缘翻转，终值 155°，结束后保持 ---- */
    var flapAnim = A.anim(els.flap, [
      { transform: 'rotateX(0deg)', offset: 0 },
      { transform: 'rotateX(' + FLAP_OPEN + 'deg)', offset: 1 }
    ], { duration: t.flap, easing: t.easeFlap, label: 'flap' });
    A.stage('flap', 0, t.flap);

    /* ---- 段二三四：一个 WAAPI 序列，offset 由令牌算出 ---- */
    var bw = els.bundle.offsetWidth;
    var bx = els.bundle.offsetLeft + bw / 2;
    var box = {
      dx: Math.round((A.landX() - bx) * 100) / 100,
      rise: RISE
    };
    A.trace.stack = box;
    var stackAnim = A.anim(els.bundle, A.bundleKeys(t, box), {
      duration: total, easing: 'linear', label: 'stack'
    });
    A.stage('rise', t.delRise, t.delRise + t.rise);
    A.stage('travel', t.delTravel, t.delTravel + t.travel);
    A.stage('land', t.delTravel + t.travel, total);

    return Promise.all([
      A.settle(flapAnim, els.flap, 'rotateX(' + FLAP_OPEN + 'deg)'),
      A.settle(stackAnim, els.bundle, 'translate3d(' + box.dx + 'px, 0, 0)')
    ]).then(function () {
      if (!live()) { return false; }
      A.mark('stage:stack:end');
      /* P2 返工 R3：交界阴影由这两个 class 驱动（css/envelope.css 末尾） */
      els.envelope.classList.add('is-opened');
      els.bundle.classList.add('is-landed');
      st.envelope = 'open';
      st.archive = 'landed';
      st.phase = 'landing';

      /* ---- 镜头推进 ∥ 笔记本打开（两个独立 scope 的锁，区间相交） ---- */
      var cam = document.getElementById('camera');
      var camAnim = A.anim(cam, [
        { transform: A.cameraCss('C0'), offset: 0 },
        { transform: A.cameraCss('C1'), offset: 1 }
      ], { duration: t.camera, easing: t.easeCamera, label: 'camera' });
      A.stage('camera', 0, t.camera);
      var nb = (Archive.notebook && Archive.notebook.open)
        ? Archive.notebook.open()
        : Promise.resolve(false);
      return Promise.all([A.settle(camAnim, cam, A.cameraCss('C1')), nb]);
    }).then(function () {
      if (!live()) { return false; }
      A.mark('stage:camera:end');
      /* ---- 最上面一张纸 FLIP 进阅读位；其余五张不动 ---- */
      if (!Archive.can('extract-paper')) {
        A.mark('flip:gated');
        return false;
      }
      return A.withLock('archive', function () {
        st.archive = 'extracting';
        return A.flipTo(els.order, A.readerTargetWorld(), {
          duration: t.flip, easing: t.easeFlip, label: 'flip'
        });
      }, t.flip * 1.6);
    }).then(function () {
      if (!live()) { return false; }
      st.archive = 'extracted';
      st.phase = 'reading';
      A.mark('stage:flip:end');
      return true;
    });
  }

  /* ---------- 第八阶段：封盖合上（155° → 0°） ----------
     只做封盖这一段：整叠滑回、合本、镜头拉远都在 js/archive.js 的 runClose 里编排，
     时间点由那里传进来（duration / delay / easing 全部来自令牌或 msTok 的默认值）。 */
  function closeFlap(opts) {
    var A = Archive.animation;
    opts = opts || {};
    if (!A || !els.flap) { return Promise.resolve(false); }
    var dur = Math.round(Number(opts.duration)) || 500;
    var a = A.anim(els.flap, [
      { transform: 'rotateX(' + FLAP_OPEN + 'deg)', offset: 0, easing: opts.easing || 'linear' },
      { transform: 'rotateX(0deg)', offset: 1 }
    ], { duration: dur, delay: Math.round(Number(opts.delay)) || 0, easing: 'linear', label: 'flap-close' });
    return A.settle(a, els.flap, 'rotateX(0deg)').then(function () {
      els.envelope.classList.remove('is-opened');
      if (Archive.state) { Archive.state.envelope = 'closed'; }
      return true;
    }, function () {
      /* 被 cancel（强制复位接管）时也必须一致：类与状态由 snapFlapClosed 统一落定 */
      snapFlapClosed();
      return false;
    });
  }

  /* 兜底/复位：封盖与信封状态一次性落定，不依赖任何动画对象 */
  function snapFlapClosed() {
    if (els.flap) { els.flap.style.transform = 'rotateX(0deg)'; }
    if (els.envelope) { els.envelope.classList.remove('is-opened'); }
    if (Archive.state) { Archive.state.envelope = 'closed'; }
  }

  Archive.envelope = {
    boot: boot, FLAP_OPEN: FLAP_OPEN, RISE: RISE,
    closeFlap: closeFlap, snapFlapClosed: snapFlapClosed
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

})(window, document);
