/* ============================================================
   main.js —— 固定逻辑画布适配（1920×1080 等比缩放 + 居中）
   本阶段唯一的运行期逻辑：缩放引导与 resize。
   不做任何动画、点击或状态切换。
   ============================================================ */
(function (window, document) {
  'use strict';

  var Archive = window.Archive || (window.Archive = {});

  var LOGICAL_W = 1920;
  var LOGICAL_H = 1080;

  var stageEl = document.getElementById('stage');
  var fitEl = document.getElementById('world-fit');
  var view = { scale: 1, x: 0, y: 0 };

  function apply() {
    if (!fitEl) return;

    var vw = window.innerWidth;
    var vh = window.innerHeight;
    var scale = Math.min(vw / LOGICAL_W, vh / LOGICAL_H);
    var x = (vw - LOGICAL_W * scale) / 2;
    var y = (vh - LOGICAL_H * scale) / 2;

    view.scale = scale;
    view.x = x;
    view.y = y;

    fitEl.style.transform =
      'translate3d(' + x + 'px, ' + y + 'px, 0) scale(' + scale + ')';

    /* 把实测值写到属性上，方便验收时直接读取 */
    if (stageEl) {
      stageEl.setAttribute('data-scale', scale.toFixed(6));
      stageEl.setAttribute('data-offset-x', x.toFixed(2));
      stageEl.setAttribute('data-offset-y', y.toFixed(2));
      stageEl.setAttribute('data-viewport', vw + 'x' + vh);
    }
  }

  var ticking = false;
  function schedule() {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(function () {
      ticking = false;
      apply();
    });
  }

  window.addEventListener('resize', schedule, { passive: true });
  window.addEventListener('orientationchange', schedule, { passive: true });

  apply();

  Archive.main = { fit: apply, view: view, LOGICAL_W: LOGICAL_W, LOGICAL_H: LOGICAL_H };
}(window, document));
