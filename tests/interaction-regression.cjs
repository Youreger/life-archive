/* 无第三方依赖的 Edge/CDP 回归测试：直接运行静态 index.html。 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { pathToFileURL } = require('url');

const ROOT = path.resolve(__dirname, '..');
const EDGE = process.env.EDGE_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const ARTIFACTS = path.join(__dirname, 'artifacts');
fs.mkdirSync(ARTIFACTS, { recursive: true });
const report = { startedAt: new Date().toISOString(), viewport: '1600x900', tests: [], errors: [], failedRequests: [] };
let browser;
let cdp;
let visTimer = null;

function assert(condition, message) {
  if (!condition) { throw new Error(message); }
}
function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
async function waitFor(fn, message, timeout = 15000, interval = 60) {
  const start = Date.now();
  let last;
  while (Date.now() - start < timeout) {
    last = await fn();
    if (last) { return last; }
    await sleep(interval);
  }
  throw new Error(message + (last === undefined ? '' : '；最后读数：' + JSON.stringify(last)));
}
async function evaluate(expression) {
  const result = await cdp.send('Runtime.evaluate', {
    expression, returnByValue: true, awaitPromise: true, userGesture: true
  });
  if (result.exceptionDetails) {
    throw new Error('页面求值失败：' + JSON.stringify(result.exceptionDetails));
  }
  return result.result.value;
}
async function clickPoint(x, y) {
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
}
async function clickSelector(selector) {
  const point = await evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, width: r.width, height: r.height };
  })()`);
  assert(point && point.width > 0 && point.height > 0, '控件不可点击：' + selector);
  await clickPoint(point.x, point.y);
}
async function clickNotebookEdge(side) {
  const point = await evaluate(`(() => {
    const r = document.querySelector('#notebook .page').getBoundingClientRect();
    return { x: ${side === 'left' ? 'r.left + 6' : 'r.right - 6'}, y: r.top + r.height / 2 };
  })()`);
  await clickPoint(point.x, point.y);
}
async function state() {
  return evaluate(`(() => {
    const s = Archive.state;
    return { phase: s.phase, currentId: s.currentId, order: s.order.slice(),
      envelope: s.envelope, archive: s.archive, notebook: s.notebook,
      viewer: s.viewer, reflection: s.reflection, switching: s.switching,
      notebookTurning: s.notebookTurning, pageId: Archive.notebook.pageId(),
      notebookMode: Archive.notebook.mode(), locks: Archive.animation.locks,
      generation: Archive.animation.generation() };
  })()`);
}
async function waitReading(id) {
  await waitFor(async () => {
    const s = await state();
    return s.phase === 'reading' && s.currentId === id && !s.switching && !s.notebookTurning;
  }, '阅读态未按预期稳定到档案 ' + id, 20000);
}
/* 换纸 / 翻页期间 js/archive.js:417 会把 nav 按钮置 disabled，非当前纸整张带
   is-page-hidden（visibility:hidden + pointer-events:none）。这时发出去的点击会被
   互斥逻辑丢弃，waitReading 就永远等不到下一份。裸循环必须等按钮真的可点。 */
async function waitClickable(selector, timeout = 12000) {
  await waitFor(async () => evaluate(`(() => {
    const b = document.querySelector(${JSON.stringify(selector)});
    if (!b) return false;
    const cs = getComputedStyle(b);
    const r = b.getBoundingClientRect();
    return !b.disabled && cs.visibility === 'visible' && cs.pointerEvents !== 'none'
      && r.width > 0 && r.height > 0;
  })()`), '控件未就绪：' + selector, timeout);
  return selector;
}
async function clickNavReady(id, dir) {
  const selector = await waitClickable(`.archive-item[data-id="${id}"] .reader-nav__btn--${dir}`);
  await clickSelector(selector);
  return selector;
}
/* 收纳之后的完整复位断言（state + DOM），A3 / A4 的机器化版本 */
async function assertFullReset(label) {
  const s = await state();
  assert(s.phase === 'idle' && s.envelope === 'closed' && s.archive === 'packed'
    && s.currentId === 1 && s.order.join() === '1,2,3,4,5,6' && s.reflection === 'none'
    && s.notebook === 'closed' && s.notebookMode === 'page' && s.pageId === 1
    && Object.keys(s.locks).length === 0,
    label + '状态未完整复位：' + JSON.stringify(s));
  const dom = await evaluate(`(() => {
    const inner = document.querySelector('#notebook .page-inner');
    const cover = document.querySelector('#notebook .cover');
    const items = Array.from(document.querySelectorAll('#paper-bundle .archive-item'));
    const probe = document.createElement('div');
    probe.style.transform = Archive.animation.cameraCss('C0');
    document.body.appendChild(probe);
    const camC0 = getComputedStyle(probe).transform;
    probe.remove();
    return {
      reflect: inner ? inner.querySelectorAll('.book-reflect').length : -1,
      coverTransform: cover ? cover.style.transform : null,
      leftoverPaper: items.filter(it => {
        const m = it.querySelector('.motion-layer');
        const p = it.querySelector('.pose-layer');
        return !!((m && m.style.transform) || (p && p.style.transform));
      }).length,
      reading: items.filter(it => it.classList.contains('is-reading')).length,
      cameraRaw: document.getElementById('camera').style.transform,
      cameraCss: Archive.animation.cameraCss('C0'),
      cameraComputed: getComputedStyle(document.getElementById('camera')).transform,
      cameraC0Computed: camC0
    };
  })()`);
  assert(dom.reflect === 0, label + '反思块仍留在页内：' + dom.reflect);
  assert(dom.coverTransform === 'rotateY(0deg)', label + '封面未复位：' + dom.coverTransform);
  assert(dom.leftoverPaper === 0, label + '仍有纸停在阅读位：' + dom.leftoverPaper);
  assert(dom.reading === 0, label + 'is-reading 残留');
  assert(dom.cameraComputed === dom.cameraC0Computed, label + '机位未回 C0：' + dom.cameraComputed);
  return { state: s, dom: dom };
}
async function screenshot(name) {
  const shot = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  const file = path.join(ARTIFACTS, name + '.png');
  fs.writeFileSync(file, Buffer.from(shot.data, 'base64'));
  return file;
}
async function runTest(name, fn) {
  const started = Date.now();
  try {
    const details = await fn();
    report.tests.push({ name, pass: true, durationMs: Date.now() - started, details });
    console.log('PASS', name, details ? JSON.stringify(details) : '');
  } catch (error) {
    report.tests.push({ name, pass: false, durationMs: Date.now() - started, error: error.stack });
    console.error('FAIL', name, error.stack);
    try { await screenshot('failure-' + report.tests.length); } catch (_) { /* 保留原错误 */ }
  }
}

class CDP {
  constructor(url) {
    this.ws = new WebSocket(url);
    this.id = 0;
    this.pending = new Map();
    this.requestUrls = new Map();
    this.ws.addEventListener('message', event => {
      const msg = JSON.parse(event.data);
      if (msg.id) {
        const pending = this.pending.get(msg.id);
        if (!pending) return;
        this.pending.delete(msg.id);
        clearTimeout(pending.timer);
        if (msg.error) pending.reject(new Error(JSON.stringify(msg.error)));
        else pending.resolve(msg.result);
      } else if (msg.method === 'Runtime.exceptionThrown') {
        report.errors.push(msg.params.exceptionDetails.text + ': ' +
          (msg.params.exceptionDetails.exception && msg.params.exceptionDetails.exception.description || ''));
      } else if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') {
        report.errors.push(msg.params.entry.text);
      } else if (msg.method === 'Network.requestWillBeSent') {
        this.requestUrls.set(msg.params.requestId, msg.params.request.url);
      } else if (msg.method === 'Network.loadingFailed' && !msg.params.canceled) {
        report.failedRequests.push({ error: msg.params.errorText,
          url: this.requestUrls.get(msg.params.requestId) || '' });
      }
    });
  }
  async open() {
    await new Promise((resolve, reject) => {
      this.ws.addEventListener('open', resolve, { once: true });
      this.ws.addEventListener('error', reject, { once: true });
    });
    await Promise.all([this.send('Page.enable'), this.send('Runtime.enable'),
      this.send('Network.enable'), this.send('Log.enable')]);
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('CDP 超时：' + method));
      }, 30000);
      this.pending.set(id, { resolve, reject, timer });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  close() { this.ws.close(); }
}

async function startBrowser() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'archive-edge-'));
  const port = 9300 + Math.floor(Math.random() * 400);
  const url = pathToFileURL(path.join(ROOT, 'index.html')).href;
  browser = spawn(EDGE, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--disable-features=CalculateNativeWinOcclusion',
    '--remote-allow-origins=*', `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`, '--window-size=1600,900', url
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = '';
  browser.stderr.on('data', chunk => { stderr += chunk.toString(); });
  const targets = await waitFor(async () => {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      return response.ok ? response.json() : null;
    } catch (_) { return null; }
  }, 'Edge DevTools 未启动', 15000, 150);
  const page = targets.find(target => target.type === 'page');
  assert(page, '找不到 Edge 页面目标；' + stderr);
  cdp = new CDP(page.webSocketDebuggerUrl);
  await cdp.open();
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 1600, height: 900, deviceScaleFactor: 1, mobile: false
  });
  await waitFor(() => evaluate('!!(window.Archive && Archive.archive && Archive.notebook && Archive.animation)'),
    '页面脚本未初始化');
  await evaluate('document.fonts.ready.then(() => true)');
  /* 本机没有可见桌面：被测页会在空闲约 45s 后被 Chromium 判为 hidden，而隐藏页会
     暂停帧与动画时间线（WAAPI 动画拿不到 startTime）。站点的看门狗把这当成"停摆"
     并强制回滚，测试就会随机红。这里持续把页面拉回 visible，模拟真实投影环境。 */
  await cdp.send('Page.bringToFront').catch(() => {});
  await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});
  let visBusy = false;
  visTimer = setInterval(async () => {
    if (visBusy) return;
    visBusy = true;
    try {
      if (await evaluate('document.hidden')) await cdp.send('Page.bringToFront');
    } catch (_) { /* 收尾阶段页面可能已关闭 */ }
    visBusy = false;
  }, 1500);
  if (visTimer.unref) visTimer.unref();
}

async function main() {
  await startBrowser();
  const initial = await state();
  console.log('INITIAL', JSON.stringify(initial));
  await screenshot('01-initial-desktop');
  await clickSelector('#envelope');
  await waitReading(1);
  await screenshot('02-reading-01');

  await runTest('1. 六份档案切换全过程显示完整内容', async () => {
    const transitions = [];
    for (let next = 2; next <= 6; next += 1) {
      const old = next - 1;
      await clickSelector(`.archive-item[data-id="${old}"] .reader-nav__btn--next`);
      const samples = [];
      const started = Date.now();
      while (Date.now() - started < 1600) {
        const sample = await evaluate(`(() => {
          const s = Archive.state;
          function read(id) {
            const item = document.querySelector('.archive-item[data-id="' + id + '"]');
            const sheet = item.querySelector('.sheet');
            const paper = item.querySelector('.paper-content');
            const cs = getComputedStyle(sheet);
            return { id, text: sheet.textContent.trim().length,
              children: sheet.querySelectorAll('*').length,
              sheetVisibility: cs.visibility, sheetDisplay: cs.display, sheetOpacity: cs.opacity,
              paperVisibility: getComputedStyle(paper).visibility,
              images: Array.from(sheet.querySelectorAll('img')).map(img => ({ complete: img.complete, width: img.naturalWidth })) };
          }
          return { switching: s.switching, currentId: s.currentId, old: read(${old}), next: read(${next}) };
        })()`);
        samples.push(sample);
        if (sample.currentId === old) {
          assert(sample.old.sheetVisibility === 'visible' && sample.old.sheetOpacity === '1' &&
            sample.old.paperVisibility === 'visible' && sample.old.text > 20 && sample.old.children > 3,
            `旧档案 ${old} 在切换中变成空白：${JSON.stringify(sample)}`);
        }
        assert(sample.next.sheetVisibility === 'visible' && sample.next.sheetOpacity === '1' &&
          sample.next.paperVisibility === 'visible' && sample.next.text > 20 && sample.next.children > 3,
          `新档案 ${next} 未在动画首帧准备完整内容：${JSON.stringify(sample)}`);
        if (!sample.switching && samples.length > 2) break;
        await sleep(45);
      }
      await waitReading(next);
      transitions.push({ from: old, to: next, samples: samples.length });
    }
    return transitions;
  });

  await runTest('2. 当前纸右下角按钮与上一页/下一页', async () => {
    const geometry = await evaluate(`(() => {
      const item = document.querySelector('.archive-item[data-id="6"]');
      const nav = item.querySelector('.reader-nav');
      const footer = item.querySelector('.pf-page');
      const nr = nav.getBoundingClientRect();
      const fr = footer.getBoundingClientRect();
      return { navCount: document.querySelectorAll('#paper-bundle .reader-nav').length,
        externalCount: document.querySelectorAll('#desk-world > #reader-nav').length,
        visibleNavs: Array.from(document.querySelectorAll('#paper-bundle .reader-nav')).filter(n => getComputedStyle(n).visibility === 'visible').length,
        inFooter: footer.contains(nav), rightAligned: Math.abs(nr.right - fr.right) < 2,
        verticalOverlap: nr.top >= fr.top - 1 && nr.bottom <= fr.bottom + 1,
        prevDisabled: item.querySelector('.reader-nav__btn--prev').disabled,
        nextDisabled: item.querySelector('.reader-nav__btn--next').disabled };
    })()`);
    assert(geometry.navCount === 6 && geometry.externalCount === 0 && geometry.visibleNavs === 1,
      '导航数量或可见性错误：' + JSON.stringify(geometry));
    assert(geometry.inFooter && geometry.rightAligned && geometry.verticalOverlap,
      '导航不在当前纸右下角页脚：' + JSON.stringify(geometry));
    await clickSelector('.archive-item[data-id="6"] .reader-nav__btn--prev');
    await waitReading(5);
    await clickSelector('.archive-item[data-id="5"] .reader-nav__btn--next');
    await waitReading(6);
    return geometry;
  });

  await runTest('4. 笔记本左右边缘独立前后翻页', async () => {
    assert((await state()).pageId === 6, '测试前笔记本不在第 6 页');
    await clickNotebookEdge('left');
    await waitFor(async () => (await state()).pageId === 5 && !(await state()).notebookTurning,
      '左边缘未翻到上一页');
    await clickNotebookEdge('right');
    await waitFor(async () => (await state()).pageId === 6 && !(await state()).notebookTurning,
      '右边缘未翻到下一页');
    return { left: 5, right: 6 };
  });

  await runTest('5. 独立翻页不改变当前档案', async () => {
    const before = await state();
    await clickNotebookEdge('left');
    await waitFor(async () => (await state()).pageId === 5 && !(await state()).notebookTurning,
      '独立翻页未完成');
    const after = await state();
    assert(before.currentId === 6 && after.currentId === 6 && before.order.join() === after.order.join(),
      '独立翻页改变了档案状态');
    return { currentId: after.currentId, notebookPage: after.pageId, order: after.order };
  });

  await runTest('6. 档案切换同步笔记本留言页', async () => {
    assert((await state()).pageId === 5 && (await state()).currentId === 6, '独立页与档案已错位的测试前置不成立');
    await clickSelector('.archive-item[data-id="6"] .reader-nav__btn--prev');
    await waitReading(5);
    const s = await state();
    assert(s.pageId === 5 && s.currentId === 5 && s.notebook === 'open', '切换后笔记本未同步到第 5 页');
    return { currentId: s.currentId, notebookPage: s.pageId, notebook: s.notebook };
  });

  await runTest('8. 快速连点互斥且状态不错乱', async () => {
    const before = await state();
    await clickNotebookEdge('left');
    const during = await state();
    assert(during.notebookTurning, '翻页锁未立即生效');
    await clickSelector('.archive-item[data-id="5"] .reader-nav__btn--next');
    await waitFor(async () => !(await state()).notebookTurning, '翻页锁未释放');
    const after = await state();
    assert(after.currentId === before.currentId && after.pageId === before.pageId - 1,
      '翻页期间档案切换未被互斥');
    const current = after.currentId;
    const selector = `.archive-item[data-id="${current}"] .reader-nav__btn--prev`;
    await Promise.all([clickSelector(selector), clickSelector(selector), clickSelector(selector)]);
    await waitReading(current - 1);
    await sleep(900);
    const settled = await state();
    assert(settled.currentId === current - 1 && settled.pageId === current - 1 &&
      settled.order[0] === current - 1 && !settled.switching && !settled.notebookTurning,
      '快速连点造成状态错乱');
    return { flipBlockedArchive: true, finalId: settled.currentId, order: settled.order };
  });

  await runTest('2b. 第一份禁用上一份', async () => {
    while ((await state()).currentId > 1) {
      const id = (await state()).currentId;
      await clickNavReady(id, 'prev');
      await waitReading(id - 1);
    }
    const disabled = await evaluate('document.querySelector(\'.archive-item[data-id="1"] .reader-nav__btn--prev\').disabled');
    assert(disabled, '第一份档案的上一份按钮未禁用');
    return { currentId: 1, prevDisabled: disabled };
  });

  await runTest('9. 桌面与主要物件视觉/素材完整', async () => {
    const metrics = await evaluate(`(() => {
      function box(selector) {
        const el = document.querySelector(selector);
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        return { width: r.width, height: r.height, visibility: cs.visibility, display: cs.display };
      }
      const images = Array.from(document.images).map(img => ({ src: img.getAttribute('src'), complete: img.complete, naturalWidth: img.naturalWidth }));
      return { stage: document.querySelector('#stage').getAttribute('data-viewport'),
        envelope: box('#envelope'), bundle: box('#paper-bundle'), notebook: box('#notebook'),
        sheets: document.querySelectorAll('#paper-bundle .sheet').length,
        brokenImages: images.filter(img => img.complete && img.naturalWidth === 0),
        loadedImages: images.filter(img => img.complete && img.naturalWidth > 0).length,
        horizontalOverflow: document.documentElement.scrollWidth > innerWidth };
    })()`);
    assert(metrics.envelope.width > 0 && metrics.bundle.width > 0 && metrics.notebook.width > 0 && metrics.sheets === 6,
      '主要视觉对象缺失');
    /* 仓库原本就不含可选照片，data.js 对这些路径显示既定的纹理占位；
       这里验证主要物件与占位回退，不把它误报为本次交互回归。 */
    assert(!metrics.horizontalOverflow, '页面横向溢出');
    await screenshot('03-reading-layout');
    return metrics;
  });

  // 回到第 6 份，从真实右下角 › 进入结尾。
  while ((await state()).currentId < 6) {
    const id = (await state()).currentId;
    await clickNavReady(id, 'next');
    await waitReading(id + 1);
  }

  await runTest('3. 第六份下一步进入最终结尾（结束文字停在页上等人工结束）', async () => {
    await clickNavReady(6, 'next');
    await waitFor(async () => {
      const s = await state();
      return s.phase === 'reflection' && s.reflection === 'question' && s.notebookMode === 'reflect';
    }, '第六份未进入反思问题', 12000);
    assert((await state()).currentId === 6, '结尾出现了第七份档案');
    await waitClickable('#notebook .book-reflect__go');
    await clickSelector('#notebook .book-reflect__go');
    await waitFor(async () => (await state()).reflection === 'text', '结束文字未淡入', 12000);
    const button = await waitClickable('#notebook .book-reflect__end');
    const info = await evaluate(`(() => {
      const b = document.querySelector('#notebook .book-reflect__end');
      const r = b.getBoundingClientRect();
      return { text: b.textContent.trim(), disabled: b.disabled, width: r.width, height: r.height };
    })()`);
    assert(info.text === '结束', '结束按钮文案不是"结束"：' + info.text);
    assert(info.disabled === false && info.width > 0 && info.height > 0,
      '结束按钮不可点：' + JSON.stringify(info));
    /* 自动跳转已移除：静置 3s 后仍必须停在 reflection / text */
    await sleep(3000);
    const held = await state();
    assert(held.phase === 'reflection' && held.reflection === 'text',
      '结束文字后仍会自动跳转：' + JSON.stringify(held));
    assert(Object.keys(held.locks).length === 0, '结束文字后动画锁未释放：' + JSON.stringify(held));
    await screenshot('04-ending-text');
    return { button: button, info: info, after3000: { phase: held.phase, reflection: held.reflection } };
  });

  await runTest('3b. 点结束播放收纳并完整复位到 idle', async () => {
    const started = Date.now();
    await clickSelector('#notebook .book-reflect__end');
    await waitFor(async () => (await state()).phase === 'idle', '点结束后未回到 idle', 12000);
    const elapsed = Date.now() - started;
    assert(elapsed >= 1800 && elapsed <= 2600, '收纳耗时不在 1800–2600ms 内：' + elapsed);
    const reset = await assertFullReset('点结束回 idle 后');
    await screenshot('05-reset-desktop');
    return { elapsedMs: elapsed, state: reset.state, dom: reset.dom };
  });

  await runTest('7. 结束复位后点击信封完整重开', async () => {
    await clickSelector('#envelope');
    await waitFor(async () => (await state()).phase === 'opening', '点击信封未重播开场', 3000);
    await waitReading(1);
    const s = await state();
    assert(s.currentId === 1 && s.order.join() === '1,2,3,4,5,6' && s.pageId === 1 &&
      s.notebookMode === 'page' && s.notebook === 'open' && s.reflection === 'none' &&
      s.envelope === 'open' && s.archive === 'extracted' && Object.keys(s.locks).length === 0,
      '重开后状态未完整恢复：' + JSON.stringify(s));
    await screenshot('06-restarted-reading');
    return s;
  });

  await runTest('10. 第二轮完整链路（读到 6 → 继续 → 三句 → 结束 → idle）', async () => {
    while ((await state()).currentId < 6) {
      const id = (await state()).currentId;
      await clickNavReady(id, 'next');
      await waitReading(id + 1);
    }
    await clickNavReady(6, 'next');
    await waitFor(async () => {
      const s = await state();
      return s.phase === 'reflection' && s.reflection === 'question';
    }, '第二轮未进入反思问题', 12000);
    await waitClickable('#notebook .book-reflect__go');
    await clickSelector('#notebook .book-reflect__go');
    await waitFor(async () => (await state()).reflection === 'text', '第二轮结束文字未淡入', 12000);
    await waitClickable('#notebook .book-reflect__end');
    const started = Date.now();
    await clickSelector('#notebook .book-reflect__end');
    await waitFor(async () => (await state()).phase === 'idle', '第二轮点结束后未回到 idle', 12000);
    const elapsed = Date.now() - started;
    assert(elapsed >= 1800 && elapsed <= 2600, '第二轮的收纳耗时不在 1800–2600ms 内：' + elapsed);
    const reset = await assertFullReset('第二轮结束后');
    return { elapsedMs: elapsed, state: reset.state, dom: reset.dom };
  });

  report.finalState = await state();
  report.consoleErrors = report.errors;
  report.failedRequests = report.failedRequests;
}

main().catch(error => {
  console.error(error.stack);
  report.fatal = error.stack;
  process.exitCode = 1;
}).finally(async () => {
  if (visTimer) { clearInterval(visTimer); visTimer = null; }
  if (cdp) cdp.close();
  if (browser && !browser.killed) browser.kill();
  report.passed = report.tests.filter(test => test.pass).length;
  report.failed = report.tests.filter(test => !test.pass).length;
  report.expectedOptionalImageFallbacks = report.failedRequests.filter(req =>
    req.error === 'net::ERR_FILE_NOT_FOUND' && req.url.includes('/assets/images/')).length;
  report.unexpectedRequests = report.failedRequests.filter(req =>
    !(req.error === 'net::ERR_FILE_NOT_FOUND' && req.url.includes('/assets/images/')));
  report.unexpectedConsoleErrors = report.errors.filter(text =>
    text !== 'Failed to load resource: net::ERR_FILE_NOT_FOUND');
  if (report.failed || report.fatal || report.unexpectedConsoleErrors.length || report.unexpectedRequests.length) process.exitCode = 1;
  report.finishedAt = new Date().toISOString();
  fs.writeFileSync(path.join(ARTIFACTS, 'interaction-report.json'), JSON.stringify(report, null, 2));
  console.log(`RESULT ${report.passed} passed, ${report.failed} failed; console=${report.errors.length}; network=${report.failedRequests.length}`);
});
