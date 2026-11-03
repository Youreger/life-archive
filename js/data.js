/* ============================================================
   data.js —— 内容与素材配置（唯一数据源）
   全部文案逐句取自《网页开发.md》第八章（md:530-843），
   素材键名与清单取自第十六章 2（md:1413-1442）。
   不引用任何 docx 内容，不自造情节，不虚构真实姓名。

   本文件承担三件事：
     1) 六份档案的文案与版式标识（layout）；
     2) 6 个素材位（一页一图）：key / 文件名 / 物件名 / crop 安全框 / 宽高比 / alt；
     3) 素材路径解析（替换素材只需替换 assets/images/archive/ 下的文件）。
   第六份的留言用 HTML 实现，因此不需要 messages.png（md:1443）。
   ============================================================ */
(function (window) {
  'use strict';

  var Archive = window.Archive || (window.Archive = {});

  var ASSET_DIR = 'assets/images/archive/';
  var NOTEBOOK_DIR = 'assets/images/notebook/';

  /* ---------- 素材位工厂 ---------------------------------------------
     key   : 与 assets/images/archive/ 下的文件名主干一致（一页一图，共 6 个）
     file  : key + '.png'，替换素材只改这一处
     name  : 缺图时显示的物件名，同时用暗纹撑住版式
     nat   : 原图像素尺寸 [宽, 高]
     crop  : 归一化安全框 [x, y, w, h]（0–1，相对原图），纸面与查看器共用
     宽高比由 crop 现场算出、不手写：ratio 用 CSS 的 "宽 / 高" 写法。
     ---------------------------------------------------------------- */
  function asset(key, name, alt, nat, crop) {
    var w = nat[0] * crop[2];
    var h = nat[1] * crop[3];
    return {
      key: key,
      file: key + '.png',
      name: name,
      alt: alt,
      crop: crop,
      nat: nat,
      ratio: (Math.round(w / h * 100000) / 100000) + ' / 1'
    };
  }

  var A = {
    /* 01 电影票：切掉四周透明边（原图 1312×1199） */
    filmTicket: asset('archive_01_movie_ticket', '电影票', '一张普通的电影票',
      [1312, 1199], [0.02287, 0.22936, 0.96582, 0.51793]),
    /* 02 打印课程表（原图 1536×1024） */
    timetable: asset('archive_02_timetable', '打印课程表', '打印出来的大学课程表',
      [1536, 1024], [0.06966, 0.05859, 0.88802, 0.87402]),
    /* 03 聊天截图：整幅无安全框（原图 1024×1536） */
    chat: asset('archive_03_chat', '聊天截图', '与陈泽的聊天截图（彩印件）',
      [1024, 1536], [0, 0, 1, 1]),
    /* 04 生活票据与合影：crop 用来去掉四周黑羽化（原图 1536×1024） */
    receipts: asset('archive_04_receipts_family', '生活票据', '三张生活票据与一段家里的对话',
      [1536, 1024], [0.06055, 0.06836, 0.88932, 0.83691]),
    /* 05 校园照片（原图 1672×941） */
    campus: asset('archive_05_campus_photos', '校园照片', '校园里拍下的几张照片',
      [1672, 941], [0.08553, 0.02338, 0.86244, 0.95112]),
    /* 06 毕业合照与四张纸条：只留 alpha 内容框（原图 800×1424）
       alpha 实测内容框 x[0.0288..0.9762] y[0.2037..0.8216]；旧框 y 到 1.0，
       多含底部 18% 透明区，白白吃掉纸面高度，本次收口到内容框本身。 */
    graduation: asset('archive_06_graduation_memories', '毕业合照', '一张毕业合照与四张纸条',
      [800, 1424], [0.0288, 0.2037, 0.9474, 0.6179])
  };

  /* ---------- 六份档案 -------------------------------------------------
     layout 决定 js/archive.js 用哪套骨架渲染，六份互不相同。
     素材一页一图：assets.main 是该页唯一的图，extras 一律空数组。
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
      assets: { main: A.filmTicket, extras: [] }
    },
    {
      id: 2,
      no: '02',
      layout: 'timetable',
      title: '课程表',
      theme: '普通的大学日常',
      meta: ['汉语言文学', '大二上学期'],
      quotes: [
        '那时候总觉得每天都差不多。',
        '上课、吃饭、赶作业，然后在某个普通的下午，突然发现一个学期已经快结束了。'
      ],
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
        { side: 'l', who: '陈泽', face: '陈', file: { name: '期中作业_终稿.docx', meta: 'docx · 1.2 MB' } },
        { side: 'r', who: '林予安', face: '林', text: '我看看，应该没什么问题。' },
        { side: 'l', who: '陈泽', face: '陈', text: '太好了！谢谢你～' }
      ],
      assets: { main: A.chat, extras: [] }
    },
    {
      id: 4,
      no: '04',
      layout: 'receipt',
      title: '家里的日常',
      theme: '家庭关系与日常责任',
      meta: ['三张生活票据', '一段家里的话'],
      receiptsHeading: '生活票据',
      /* 票据明细：单店小计与总计都由 js/archive.js 现场求和，不写死合计 */
      receipts: {
        shops: [
          {
            name: '广西大学食堂',
            time: '2026-10-14 11:28',
            items: [
              { name: '番茄炒蛋', qty: 1, amount: 8 },
              { name: '米饭', qty: 1, amount: 1 },
              { name: '紫菜汤', qty: 1, amount: 1 }
            ]
          },
          {
            name: '联华超市',
            time: '2026-10-16 19:42',
            items: [
              { name: '矿泉水', qty: 1, amount: 2 },
              { name: '面包', qty: 1, amount: 3.5 },
              { name: '纸巾', qty: 1, amount: 5.9 }
            ]
          },
          {
            name: '自行车维修中心',
            time: '2026-10-17 16:20',
            items: [
              { name: '车胎更换', qty: 1, amount: 15 }
            ]
          }
        ]
      },
      stamp: '20:37',
      thread: [
        { side: 'l', who: '妈妈', face: '妈', text: '最近天气凉了，衣服带够了吗？' },
        { side: 'r', who: '林予安', face: '林', text: '够的，你放心。' },
        { side: 'l', who: '妈妈', face: '妈', text: '吃饭别总凑合。' },
        { side: 'r', who: '林予安', face: '林', text: '知道啦，今天吃食堂。' },
        { side: 'l', who: '妈妈', face: '妈', text: '那就好。' }
      ],
      assets: { main: A.receipts, extras: [] }
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
      assets: { main: A.campus, extras: [] }
    },
    {
      id: 6,
      no: '06',
      layout: 'farewell',
      title: '那些一起走过的人',
      theme: '普通人的记忆与影响',
      meta: ['一张毕业合照', '几条同学留下的简短留言'],
      messagesHeading: '同学留言',
      /* 四条留言逐字取自 archive_06_graduation_memories.png，原图没有署名，
         因此 name 一律为空字符串，只用来源标签标注出处（不编造姓名）。 */
      messages: [
        { name: '', tag: '档案摘录', text: '以后有空常联系，别毕业就失联啦！' },
        { name: '', tag: '档案摘录', text: '祝你以后也能一直做自己喜欢的事。' },
        { name: '', tag: '档案摘录', text: '谢谢大学这几年一起度过的时光。' },
        { name: '', tag: '档案摘录', text: '虽然大家要去不同的地方了，但这段回忆会一直记得。' }
      ],
      assets: { main: A.graduation, extras: [] }
    }
  ];

  /* ---------- 笔记本：六组留言位（md 第十七章 / 第五阶段） ----------
     一本书里六个页面，一页对应一份档案：kicker = 页码 + 该页的短语，
     title / sub 取自档案本身（archiveData 的 title / theme），不新增情节。
     留言正文逐字取自对应档案的既有字段（见每行末尾注释），不另写句子；
     note 一律留空——页脚注记要等正文定稿后再落。
     ---------------------------------------------------------------- */
  function noteRow(id, kicker, title, sub, text) {
    return {
      id: id,
      page: id,
      no: '0' + id,
      kicker: kicker,
      title: title,
      sub: sub,
      messages: text ? [{ name: '', tag: '档案摘录', text: text }] : [],
      note: ''
    };
  }

  var notebookData = [
    /* 正文出处逐条对应：archiveData[1].log[2] / [2].quotes[1] / [3].thread[3].text
       / [4].thread[2].text / [5].note / 06 的四条毕业留言 */
    noteRow(1, '第 01 页 · 电影', '一场普通的电影', '个人体验与快乐',
      '散场后走出影院，晚风刚好。'),
    noteRow(2, '第 02 页 · 课表', '课程表', '普通的大学日常',
      '上课、吃饭、赶作业，然后在某个普通的下午，突然发现一个学期已经快结束了。'),
    noteRow(3, '第 03 页 · 对话', '有人找你帮忙', '人与人之间的连接',
      '行啊，你把文件发我吧～'),
    noteRow(4, '第 04 页 · 票据', '家里的日常', '家庭关系与日常责任',
      '吃饭别总凑合。'),
    noteRow(5, '第 05 页 · 照片', '还没拍完的照片', '愿望与遗憾',
      '但这个计划最终没有真正完成。')
  ];

  /* 06 页：四条毕业留言全上，顺序与原图一致 */
  var nbFarewell = noteRow(6, '第 06 页 · 留言', '那些一起走过的人', '普通人的记忆与影响');
  nbFarewell.messages = archiveData[5].messages.map(function (m) {
    return { name: '', tag: '档案摘录', text: m.text };
  });
  notebookData.push(nbFarewell);

  function assetSrc(a) {
    return ASSET_DIR + a.file;
  }

  function notebookSrc(fileName) {
    return NOTEBOOK_DIR + fileName;
  }

  /* 汇总清单：用于断言 6 个素材位全部配置到位 */
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
