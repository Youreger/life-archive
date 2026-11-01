/* ============================================================
   data.js —— 内容与素材配置（唯一数据源）
   全部文案逐句取自《网页开发.md》第八章（md:530-843），
   素材键名与清单取自第十六章 2（md:1413-1442）。
   不引用任何 docx 内容，不自造情节，不虚构真实姓名。

   本文件承担三件事：
     1) 六份档案的文案与版式标识（layout）；
     2) 12 个素材位：key / 文件名 / 物件名 / 固定宽高比 / alt；
     3) 素材路径解析（替换素材只需替换 assets/images/archive/ 下的文件）。
   第六份的留言用 HTML 实现，因此不需要 messages.png（md:1443）。
   ============================================================ */
(function (window) {
  'use strict';

  var Archive = window.Archive || (window.Archive = {});

  var ASSET_DIR = 'assets/images/archive/';
  var NOTEBOOK_DIR = 'assets/images/notebook/';

  /* ---------- 素材位工厂 ---------------------------------------------
     key   : 与 md:1413-1442 清单完全一致的文件名主干
     file  : key + '.png'，替换素材只改这一处
     name  : 占位层显示的物件名
     ratio : 占位容器的固定宽高比（缺图时布局不变的关键）
     ---------------------------------------------------------------- */
  function asset(key, name, ratio, alt) {
    return { key: key, file: key + '.png', name: name, ratio: ratio, alt: alt };
  }

  var A = {
    movieTicket: asset('movie-ticket', '电影票', '2 / 1', '一张普通的电影票'),
    timetable: asset('timetable', '打印课程表', '3 / 4', '打印出来的大学课程表'),
    chatChenze: asset('chat-chenze', '聊天截图', '3 / 4', '与陈泽的聊天截图（彩印件）'),
    cafeteria: asset('cafeteria-receipt', '食堂消费小票', '1 / 1.5', '食堂消费小票'),
    supermarket: asset('supermarket-receipt', '超市购物小票', '1 / 1.5', '超市购物小票'),
    bicycle: asset('bicycle-receipt', '自行车维修凭证', '1 / 1.5', '自行车维修凭证'),
    chatMother: asset('chat-mother', '聊天截图', '3 / 4', '与母亲的聊天截图（彩印件）'),
    photoPlan: asset('photography-plan', '拍摄计划', '4 / 3', '手写的校园摄影计划清单'),
    campus1: asset('campus-photo-01', '校园照片 01', '3 / 2', '校园里的一张照片'),
    campus2: asset('campus-photo-02', '校园照片 02', '3 / 2', '校园里的一张照片'),
    campus3: asset('campus-photo-03', '校园照片 03', '3 / 2', '校园里的一张照片'),
    graduation: asset('graduation-photo', '毕业合照', '3 / 2', '一张毕业合照')
  };

  /* ---------- 六份档案 -------------------------------------------------
     layout 决定 js/archive.js 用哪套骨架渲染，六份互不相同。
     ---------------------------------------------------------------- */
  var archiveData = [
    {
      id: 1,
      no: '01',
      layout: 'film',
      title: '一场普通的电影',
      theme: '个人体验与快乐',
      meta: ['《晚风过境》', '星空影城', '2026-10-12'],
      logHeading: '观影记录',
      log: [
        '一部关于青春与告别的电影。',
        '故事结束时，心里有一点惆怅，但更多的是温暖。',
        '散场后走出影院，晚风刚好。'
      ],
      note: '以上观影记录属于虚构情境文字，不代表真实观影经历。',
      assets: { main: A.movieTicket, extras: [] }
    },
    {
      id: 2,
      no: '02',
      layout: 'timetable',
      title: '课程表',
      theme: '普通的大学日常',
      meta: ['汉语言文学', '大二上学期'],
      table: {
        corner: '节次',
        cols: ['周一', '周二', '周三', '周四', '周五'],
        rows: ['上午', '下午', '晚上'],
        marked: [{ r: 0, c: 1 }, { r: 1, c: 3 }]
      },
      cap: '课程名称与时间未确认 · 示例占位',
      quotes: [
        '那时候总觉得每天都差不多。',
        '上课、吃饭、赶作业，然后在某个普通的下午，突然发现一个学期已经快结束了。'
      ],
      note: '具体课程名称、上课时间、教室等信息尚未确认；表中为明显标记的示例占位数据。',
      assets: { main: A.timetable, extras: [] }
    },
    {
      id: 3,
      no: '03',
      layout: 'chat',
      title: '有人找你帮忙',
      theme: '人与人之间的连接',
      meta: ['林予安 · 陈泽'],
      lead: '陈泽请林予安帮忙检查期中小组作业 PPT 的排版和内容。',
      stamp: '21:14',
      thread: [
        { side: 'l', who: '陈泽', face: '陈', text: '予安，在吗？' },
        { side: 'r', who: '林予安', face: '林', text: '在，怎么了？' },
        { side: 'l', who: '陈泽', face: '陈', text: '我们小组的期中作业还差个 PPT，你能帮我看看吗？就排版和内容调整一下就好……' },
        { side: 'r', who: '林予安', face: '林', text: '行啊，你把文件发我吧～' },
        { side: 'l', who: '陈泽', face: '陈', file: { name: '期中作业_终稿.docx', meta: 'docx · 示例占位' } },
        { side: 'r', who: '林予安', face: '林', text: '我看看，应该没什么问题。' },
        { side: 'l', who: '陈泽', face: '陈', text: '太好了！谢谢你～' }
      ],
      inputPlaceholder: '发消息…',
      sendLabel: '发送',
      note: '以上聊天内容属于情境重构，不是真实聊天记录。',
      assets: { main: A.chatChenze, extras: [] }
    },
    {
      id: 4,
      no: '04',
      layout: 'receipt',
      title: '家里的日常',
      theme: '家庭关系与日常责任',
      meta: ['三张生活票据', '一段家里的话'],
      receiptsHeading: '生活票据',
      stamp: '20:37',
      thread: [
        { side: 'l', who: '妈妈', face: '妈', text: '最近天气凉了，衣服带够了吗？' },
        { side: 'r', who: '林予安', face: '林', text: '够的，你放心。' },
        { side: 'l', who: '妈妈', face: '妈', text: '吃饭别总凑合。' },
        { side: 'r', who: '林予安', face: '林', text: '知道啦，今天吃食堂。' },
        { side: 'l', who: '妈妈', face: '妈', text: '那就好。' }
      ],
      note: '以上票据金额、消费明细、日期及聊天内容均属于情境重构，不应作为真实消费记录。',
      /* 三张票据的素材位（md:1427-1429），顺序即左侧叠放顺序 */
      assets: { main: A.chatMother, extras: [A.cafeteria, A.supermarket, A.bicycle] }
    },
    {
      id: 5,
      no: '05',
      layout: 'photo',
      title: '还没拍完的照片',
      theme: '愿望与遗憾',
      meta: ['相机 · 校园'],
      lead: '林予安曾经计划用相机记录大学生活。',
      planHeading: '计划拍摄',
      plan: ['教学楼', '图书馆', '校园里的树', '傍晚的天空'],
      paras: [
        '有些事情总想着以后再做。',
        '等到真正想起来的时候，才发现有些风景已经错过了。'
      ],
      note: '但这个计划最终没有真正完成。',
      assets: { main: A.photoPlan, extras: [A.campus1, A.campus2, A.campus3] }
    },
    {
      id: 6,
      no: '06',
      layout: 'farewell',
      title: '那些一起走过的人',
      theme: '普通人的记忆与影响',
      meta: ['一张毕业合照', '几条同学留下的简短留言'],
      messagesHeading: '同学留言',
      /* 留言内容尚未确定：只放明确标注的匿名示例占位（md:833-837） */
      messages: [
        { name: '同学 A', tag: '示例占位', text: '留言内容待补。' },
        { name: '同学 B', tag: '示例占位', text: '留言内容待补。' },
        { name: '同学 C', tag: '示例占位', text: '留言内容待补。' }
      ],
      note: '留言内容尚未最终确定；以上为明确标注为示例的匿名留言占位，不虚构真实同学姓名或评价。',
      assets: { main: A.graduation, extras: [] }
    }
  ];

  /* ---------- 笔记本：六组留言位（md 第十七章 / 第五阶段） ----------
     一本书里六个页面，一页对应一份档案：kicker = 页码 + 该页的短语，
     title / sub 取自档案本身（archiveData 的 title / theme），不新增情节。
     留言内容尚未确定（md:1485）：六页一律用"明确标注的示例匿名占位"，
     正文只有"留言内容待补。"，不虚构真实同学姓名或评价；
     第六页沿用 archiveData[5].messages 的同学 A/B/C 口径。
     ---------------------------------------------------------------- */
  function placeholder(i) {
    return {
      name: '同学 ' + 'ABCD'[i],
      tag: '示例占位',
      text: '留言内容待补。'
    };
  }
  function noteRow(id, kicker, title, sub) {
    return {
      id: id,
      page: id,
      no: '0' + id,
      kicker: kicker,
      title: title,
      sub: sub,
      messages: [placeholder(0), placeholder(1), placeholder(2)],
      note: '本页留言尚未确定；以上为明确标注的示例匿名占位，不虚构真实姓名或评价。'
    };
  }

  var notebookData = [
    noteRow(1, '第 01 页 · 电影', '一场普通的电影', '个人体验与快乐'),
    noteRow(2, '第 02 页 · 课表', '课程表', '普通的大学日常'),
    noteRow(3, '第 03 页 · 对话', '有人找你帮忙', '人与人之间的连接'),
    noteRow(4, '第 04 页 · 票据', '家里的日常', '家庭关系与日常责任'),
    noteRow(5, '第 05 页 · 照片', '还没拍完的照片', '愿望与遗憾'),
    noteRow(6, '第 06 页 · 留言', '那些一起走过的人', '普通人的记忆与影响')
  ];

  function assetSrc(a) {
    return ASSET_DIR + a.file;
  }

  function notebookSrc(fileName) {
    return NOTEBOOK_DIR + fileName;
  }

  /* 汇总清单：用于断言 12 个素材位全部配置到位 */
  function listAssets() {
    var list = [];
    archiveData.forEach(function (item) {
      if (item.assets.main) { list.push(item.assets.main); }
      item.assets.extras.forEach(function (extra) { list.push(extra); });
    });
    return list;
  }

  function byId(id) {
    for (var i = 0; i < archiveData.length; i += 1) {
      if (archiveData[i].id === id) { return archiveData[i]; }
    }
    return null;
  }

  Archive.data = {
    assetDir: ASSET_DIR,
    notebookDir: NOTEBOOK_DIR,
    archiveData: archiveData,
    notebookData: notebookData,
    assetSrc: assetSrc,
    notebookSrc: notebookSrc,
    listAssets: listAssets,
    byId: byId
  };
}(window));
