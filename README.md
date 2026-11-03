# 人生档案馆

16:9 大屏交互式叙事网页：一张书桌、一个牛皮纸档案袋、六份 A4 生活档案、一本布面笔记本，用纸张、镜头与翻页动画讲述「一个没有突出成就的普通人，人生是否有价值」。

## 运行

- 直接双击 `index.html`：全部为经典 `<script>`，无 ES module、无构建、无后端、无第三方依赖，`file://` 下即可运行。
- 或起静态服务：`python -m http.server 8000`，访问 http://localhost:8000 。
- 逻辑画布固定 1920×1080，按窗口统一等比缩放居中；1600×900 与 1366×768 已验证不出横向滚动。

## 目录

```
index.html                    入口：桌面 / 信封 / 档案 / 笔记本 / 查看器 / 反思层
css/  tokens.css              设计令牌（颜色、层级、时长、字号、纸张几何）
      fonts.css               @font-face 本地字体
      main.css                舞台、#world-fit 统一缩放、重置
      desk.css                桌面材质（feTurbulence 噪点）
      envelope.css            档案袋与翻盖
      archive.css             六份档案纸面版式
      notebook.css            布面笔记本与翻页
      viewer.css              图片查看器
      animation.css           镜头与过渡层
js/   state.js                全局状态、GATES 门禁表、写入入口
      animation.js            WAAPI 封装、settle 兜底、withLock 锁与看门狗
      data.js                 六份档案数据、笔记本六页文案、素材清单与 crop
      archive.js              档案渲染、纸面切换（FLIP）、提取/收纳链路
      envelope.js             信封开合与纸张提取
      notebook.js             笔记本翻页、留言页、结尾提问与结束
      viewer.js               图片查看器（读源元素 --crop-*）
      main.js                 启动与事件接线
assets/fonts/                 思源宋体 / 思源黑体可变字体（离线投影用）
assets/images/archive/        12 张示例占位素材
tests/interaction-regression.cjs  零依赖 Edge/CDP 回归测试
交付说明_六页重排.md           第二轮修订的改动、实测数据与遗留问题
```

## 技术约束

HTML5 + CSS3 + 原生 JS + Web Animations API。不引入框架、后端、Canvas 代替页面；无额外菜单、音乐、评论、登录与拖拽。

## 当前状态

- 六份档案已改为「原图即档案」：纸面只保留标题、分类、人物信息与极短收束文字，图内内容不再用 HTML 重做。
- 回归测试 `node tests/interaction-regression.cjs`（需本机装有 Edge）：12 项中 8 项通过、4 项失败，失败全部集中在结尾链——点「继续」后 3 秒静置期内 `phase` 由 `reflection` 回退为 `reading`。已确认无头/遮挡环境下页面会被置为 `hidden`，隐藏页暂停动画时间线导致站点看门狗强制回滚，测试侧已加「保持 visible」守护；回退本身写入点仍未定位。详见 `交付说明_六页重排.md`。

## 素材说明

`assets/images/archive/` 下图片为示例占位素材，非真实人物资料。替换同名文件即可换图，尺寸与裁切参数（crop = x, y, w, h）在 `js/data.js` 中配置。
