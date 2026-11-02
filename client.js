// @local/dsh-task-board — browser half.
//
// A full central page (main slot key "task-board") plus a sidebar panel icon:
//   * top AI extraction bar -> POST /task-board/extract -> editable task draft;
//   * two-month calendar where long-term projects are colored connected lines;
//   * daily recurring tasks in Markdown checklist style;
//   * a daily-work area with two views: a 7-column week overview and a
//     24-hour day timeline whose blocks move and resize by dragging.
//
// Data lives in the Host half (JSON file); this module only renders and posts.
window.__ModuleLoader__.load({
  id: '@local/dsh-task-board',
  factory: (require) => {
    const React = require('react')
    const h = React.createElement

    const NS = 'task-board'
    const ROUTE = '/task-board'
    const PANEL_ID = 'task-board'
    const SNAP = 15
    const MAX_END = 1439
    const LAST_SNAP = Math.floor(MAX_END / SNAP) * SNAP
    const HOUR_H = 40
    const TL_H = HOUR_H * 24
    const MAX_WEEK_LANES = 5

    const PALETTE = [
      '#4C8DFF', '#F2994A', '#27AE60', '#9B51E0', '#EB5757',
      '#2D9CDB', '#F2C94C', '#6FCF97', '#BB6BD9', '#56CCF2',
    ]

    const WEEKDAYS_ZH = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
    const WEEKDAYS_EN = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
    const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

    // --- dictionaries ---------------------------------------------------------

    const zh = {
      panel: '任务',
      panelHistory: '进展',
      historyTitle: '长期任务进展',
      historyHint: '左侧选择周期任务或长期任务，右侧按日期查看完成标记与记录的结果',
      historyEntry: '长期任务进展',
      backToTasks: '← 返回任务',
      historyRecurring: '周期任务',
      historyProjects: '长期任务',
      historyNoRecord: '—',
      historyRecorded: (count) => `已记录 ${count} 天`,
      histJoin: '、',
      historyEmpty: '还没有记录：在「具体当天」给任务添加结果（子任务）后，这里会按天汇总',
      historyPick: '先从左侧选择一个任务',
      historyLoading: '正在读取任务…',
      reminderTitle: '邮件提醒（任意邮箱）',
      reminderHint: '每天定时把「今日任务摘要」发到你的邮箱；微信绑定邮箱提醒后也能收到。',
      reminderEnable: '启用每日提醒',
      reminderProvider: '邮箱服务商',
      reminderHost: 'SMTP 服务器',
      reminderPort: '端口',
      reminderSecure: '加密方式',
      reminderSecureTls: 'SSL/TLS（465）',
      reminderSecureStarttls: 'STARTTLS（587）',
      reminderCustom: '自定义',
      reminderUser: '发件邮箱地址',
      reminderTo: '收件邮箱（留空=同上）',
      reminderPass: '邮箱密码 / 授权码',
      reminderPassSaved: '已保存，留空则不修改',
      reminderTime: '发送时间',
      reminderSave: '保存设置',
      reminderTest: '发送测试',
      reminderSaved: '已保存',
      reminderTesting: '发送中…',
      reminderTestOk: '测试邮件已发送，请检查收件箱（可能进垃圾箱）',
      reminderTestFail: '发送失败',
      reminderAuthHint: '先在邮箱设置里开启 SMTP 服务：QQ/163/126 用「授权码」，Gmail 用「应用专用密码」，Outlook 可能需应用密码；不要填网页登录密码。',
      reminderLastSent: (day) => (day ? `上次发送：${day}` : '还没发送过'),
      reminderOn: '已开启',
      reminderOff: '未开启',
      reminderStatusOn: (time, to) => (to ? `已开启 · 每天 ${time} → ${to}` : `已开启 · 每天 ${time}`),
      reminderExpand: '展开设置',
      reminderCollapse: '收起设置',
      title: '任务',
      subtitle: '日历 · 日常 · 每天工作',
      loading: '正在读取任务…',
      loadFailed: '读取任务失败：',
      dataBlocked: '任务数据读取异常：为避免覆盖原文件，自动保存已暂停。',
      overwriteSave: '仍要保存（覆盖原文件）',
      retryDiscardConfirm: '重新读取会丢弃当前未保存的修改，继续？',
      hostMissing: '页面里的插件版本比宿主旧（HTTP 40x）：先刷新页面；若仍旧，确认插件已启用或重启 DSH。',
      saveFailed: '保存失败：',
      saved: '已保存',
      saving: '保存中…',
      retry: '重试',
      today: '今天',
      weekPrev: '上一周',
      weekNext: '下一周',
      monthPrev: '上一月',
      monthNext: '下一月',
      calendar: '日历',
      calendarHint: '每条彩色直线是一个长期任务；双击任务线进入拖动，双击空白处退出',
      daily: '日常任务',
      dailyHint: '每天重复，勾选只作用于今天',
      dailyEdit: '编辑',
      dailyDone: '完成',
      dailyAddPlaceholder: '新的日常任务，例如：锻炼 30 分钟',
      dailyAdd: '添加',
      dailyEmpty: '还没有日常任务：点「编辑」或下方「＋ 日常任务」添加。',
      dailyDelete: '删除',
      dailyTodayCheck: '今天完成',
      work: '每天工作',
      workWeek: '任务列表',
      workDay: '具体当天',
      workEdit: '编辑',
      weekEmpty: '本周没有安排',
      workEmpty: '当天没有安排',
      dayAdd: '＋ 添加任务',
      addWeekly: '周期任务',
      dialogAddWeekly: '新增周期任务',
      dialogEditWeekly: '编辑周期任务',
      fieldWeekdays: '每周几触发',
      fieldWeeks: '持续几周',
      weeklyTag: '周期',
      weeklySummary: (days, weeks) => `${days} · 共 ${weeks} 周`,
      weeklyOccurrences: (count) => `共 ${count} 次`,
      modeWeekly: '按周几',
      modeInterval: '每几天',
      fieldIntervalDays: '每隔几天',
      intervalSummary: (days, weeks) => `每 ${days} 天 · 共 ${weeks} 周`,
      errorIntervalDays: '间隔天数需在 1–365 之间',
      joinWeekdays: (labels) => labels.join('、'),
      errorWeekdays: '请至少选择一个周几',
      errorWeeks: '持续周数需在 1–52 之间',
      dayPrev: '前一天',
      dayNext: '后一天',
      dayDailies: '当天日常',
      dayTasks: '当天任务',
      noDayTasks: '当天没有任务',
      dayTimeline: '24 小时安排',
      timelineHint: '拖动方块移动时间，拖动上下边缘改变起止',
      slotDone: '标记完成',
      noDaily: '（没有日常任务）',
      extractTitle: 'AI 任务提取',
      extractPlaceholder: '用一句话描述任务，例如：下周一至周五完成结题报告；每天锻炼 30 分钟；今天 14:00-15:30 开组会',
      extractRun: 'AI 提取',
      extractBusy: 'AI 识别中…',
      extractClear: '清空',
      extractHint: '识别后先确认，再写入对应区域',
      extractEmpty: '没有识别到任务，换个说法再试一次。',
      extractFound: (count) => `识别到 ${count} 个任务，可先修改再添加`,
      extractConfirm: '确定添加',
      extractCancel: '取消',
      extractAdded: (count) => `已添加 ${count} 个任务`,
      extractFallback: 'AI 不可用，已用本地规则识别：',
      addProject: '＋ 长期任务（日历）',
      addDaily: '＋ 日常任务',
      addSlot: '＋ 当天任务',
      kindProject: '长期任务',
      kindDaily: '日常任务',
      kindSlot: '当天任务',
      quickTaskTitle: '新任务',
      fieldTitle: '标题',
      fieldStart: '开始日期',
      fieldEnd: '结束日期',
      fieldDate: '日期',
      fieldStartTime: '开始时间',
      fieldEndTime: '结束时间',
      fieldColor: '颜色',
      fieldNote: '备注',
      dialogAddProject: '新增长期任务',
      dialogEditProject: '编辑长期任务',
      dialogAddDaily: '新增日常任务',
      dialogAddSlot: '新增当天任务',
      dialogEditSlot: '编辑当天任务',
      save: '保存',
      cancel: '取消',
      delete: '删除',
      close: '关闭',
      editDone: '完成',
      confirmDelete: '确定删除这个任务？',
      projectSelected: '已选长期任务：',
      projectEdit: '编辑',
      projectDelete: '删除',
      projectCancel: '取消选择',
      projectDragDone: '完成拖动',
      dragModeHint: '拖动线身移动日期，拖动左右两端调整长度；双击空白处退出',
      slotsToday: '当天',
      errorTitle: '标题不能为空',
      errorDates: '结束日期不能早于开始日期',
      errorTime: '结束时间必须晚于开始时间',
      formInvalid: '有任务信息不完整，请补全红色标注的条目',
      projectDrag: '拖动调整长度',
      emptyWeekCol: '—',
      noTasksToday: '今天没有定时任务，双击时间轴空白处可快速添加',
      projectCount: (count) => `${count} 个长期任务`,
      dailyCount: (count) => `${count} 项`,
      weekRange: (a, b) => `${a} – ${b}`,
      monthRange: (a, b) => `${a} – ${b}`,
      moreTasks: (count) => `还有 ${count} 项`,
      lessTasks: '收起',
      dailyToggle: (done) => (done ? '今天已完成，点击取消' : '标记今天完成'),
      subtasksLabel: '子任务：',
      subtasksEditHint: '（在「具体当天」页修改）',
      addSubtask: '添加子任务',
      newSubtaskPlaceholder: '输入子任务，回车添加',
      subtaskCount: (count) => `${count} 个子任务`,
      slotSelected: '已选当天任务：',
      weekDragHint: '拖动任务可改期，点击任务可查看子任务',
      movedTo: (day) => `已移动到 ${day}`,
      projectDoneOnDay: (done) => (done ? '取消标记这一天' : '只标记这一天做过相关工作'),
      clickToViewSubtasks: '点击查看子任务',
    }

    const en = {
      panel: 'Tasks',
      panelHistory: 'Progress',
      historyTitle: 'Long-term progress',
      historyHint: 'Pick a recurring or long-term task on the left; the right side lists each date with its completion mark and recorded results',
      historyEntry: 'Long-term progress',
      backToTasks: '← Back to tasks',
      historyRecurring: 'Recurring tasks',
      historyProjects: 'Long-term tasks',
      historyNoRecord: '—',
      historyRecorded: (count) => `${count} recorded day(s)`,
      histJoin: ', ',
      historyEmpty: 'No records yet: add a result (subtask) to the task on the specific-day page and it will show up here, grouped by date',
      historyPick: 'Pick a task on the left first',
      historyLoading: 'Loading tasks…',
      reminderTitle: 'Email reminder (any mailbox)',
      reminderHint: 'Sends a daily summary of today\'s tasks to your mailbox; with mailbox notifications enabled in WeChat you will see it there too.',
      reminderEnable: 'Enable daily reminder',
      reminderProvider: 'Mail provider',
      reminderHost: 'SMTP server',
      reminderPort: 'Port',
      reminderSecure: 'Encryption',
      reminderSecureTls: 'SSL/TLS (465)',
      reminderSecureStarttls: 'STARTTLS (587)',
      reminderCustom: 'Custom',
      reminderUser: 'Sender mailbox',
      reminderTo: 'Recipient (empty = same)',
      reminderPass: 'Mailbox password / auth code',
      reminderPassSaved: 'Saved; leave empty to keep it',
      reminderTime: 'Send at',
      reminderSave: 'Save settings',
      reminderTest: 'Send test',
      reminderSaved: 'Saved',
      reminderTesting: 'Sending…',
      reminderTestOk: 'Test email sent; check the inbox (and spam)',
      reminderTestFail: 'Send failed',
      reminderAuthHint: 'Enable SMTP in your mailbox first: QQ/163/126 use an authorization code, Gmail uses an app password, Outlook may need an app password. Do not enter the web login password.',
      reminderLastSent: (day) => (day ? `Last sent: ${day}` : 'Not sent yet'),
      reminderOn: 'On',
      reminderOff: 'Off',
      reminderStatusOn: (time, to) => (to ? `On · daily ${time} → ${to}` : `On · daily ${time}`),
      reminderExpand: 'Expand settings',
      reminderCollapse: 'Collapse settings',
      title: 'Tasks',
      subtitle: 'Calendar · Daily · Weekly work',
      loading: 'Loading tasks…',
      loadFailed: 'Could not load tasks: ',
      dataBlocked: 'Task data could not be read cleanly; autosave is paused to avoid overwriting the original file.',
      overwriteSave: 'Save anyway (overwrite original)',
      retryDiscardConfirm: 'Reloading discards unsaved changes. Continue?',
      hostMissing: 'The page plugin is older than the host (HTTP 40x): refresh the page, then confirm the plugin is enabled or restart DSH.',
      saveFailed: 'Could not save: ',
      saved: 'Saved',
      saving: 'Saving…',
      retry: 'Retry',
      today: 'Today',
      weekPrev: 'Previous week',
      weekNext: 'Next week',
      monthPrev: 'Previous month',
      monthNext: 'Next month',
      calendar: 'Calendar',
      calendarHint: 'Each colored line is a long-term task; double-click a line to drag it, double-click empty space to exit',
      daily: 'Daily tasks',
      dailyHint: 'Repeats every day; checking applies to today only',
      dailyEdit: 'Edit',
      dailyDone: 'Done',
      dailyAddPlaceholder: 'New daily task, e.g. exercise 30 minutes',
      dailyAdd: 'Add',
      dailyEmpty: 'No daily tasks yet: use Edit or “+ Daily task” below.',
      dailyDelete: 'Delete',
      dailyTodayCheck: 'Done today',
      work: 'Daily work',
      workWeek: 'Task list',
      workDay: 'This day',
      workEdit: 'Edit',
      weekEmpty: 'Nothing planned this week',
      workEmpty: 'Nothing planned this day',
      dayAdd: '+ Add task',
      addWeekly: 'Weekly task',
      dialogAddWeekly: 'New weekly task',
      dialogEditWeekly: 'Edit weekly task',
      fieldWeekdays: 'Repeats on',
      fieldWeeks: 'Weeks',
      weeklyTag: 'Weekly',
      weeklySummary: (days, weeks) => `${days} · ${weeks} week(s)`,
      weeklyOccurrences: (count) => `${count} occurrence(s)`,
      modeWeekly: 'Weekdays',
      modeInterval: 'Every N days',
      fieldIntervalDays: 'Every N days',
      intervalSummary: (days, weeks) => `Every ${days} day(s) · ${weeks} week(s)`,
      errorIntervalDays: 'Interval must be between 1 and 365 days',
      joinWeekdays: (labels) => labels.join(', '),
      errorWeekdays: 'Pick at least one weekday',
      errorWeeks: 'Weeks must be between 1 and 52',
      dayPrev: 'Previous day',
      dayNext: 'Next day',
      dayDailies: 'Daily tasks',
      dayTasks: 'Tasks of the day',
      noDayTasks: 'No tasks for this day',
      dayTimeline: '24-hour schedule',
      timelineHint: 'Drag a block to move it, drag its top or bottom edge to resize',
      slotDone: 'Mark done',
      noDaily: '(no daily tasks)',
      extractTitle: 'AI task extraction',
      extractPlaceholder: 'Describe tasks in one sentence, e.g. “next Monday to Friday finish the report; exercise 30 minutes every day; meeting today 14:00-15:30”',
      extractRun: 'Extract',
      extractBusy: 'Extracting…',
      extractClear: 'Clear',
      extractHint: 'Review the result, then write it into the matching area',
      extractEmpty: 'No task recognized. Try rephrasing.',
      extractFound: (count) => `Recognized ${count} task(s); adjust before adding`,
      extractConfirm: 'Add',
      extractCancel: 'Cancel',
      extractAdded: (count) => `Added ${count} task(s)`,
      extractFallback: 'AI unavailable, local rules were used: ',
      addProject: '+ Long-term task (calendar)',
      addDaily: '+ Daily task',
      addSlot: '+ Task for the day',
      kindProject: 'Long-term',
      kindDaily: 'Daily',
      kindSlot: 'Scheduled',
      quickTaskTitle: 'New task',
      fieldTitle: 'Title',
      fieldStart: 'Start date',
      fieldEnd: 'End date',
      fieldDate: 'Date',
      fieldStartTime: 'Start time',
      fieldEndTime: 'End time',
      fieldColor: 'Color',
      fieldNote: 'Note',
      dialogAddProject: 'New long-term task',
      dialogEditProject: 'Edit long-term task',
      dialogAddDaily: 'New daily task',
      dialogAddSlot: 'New task for the day',
      dialogEditSlot: 'Edit scheduled task',
      save: 'Save',
      cancel: 'Cancel',
      delete: 'Delete',
      close: 'Close',
      editDone: 'Done',
      confirmDelete: 'Delete this task?',
      projectSelected: 'Selected: ',
      projectEdit: 'Edit',
      projectDelete: 'Delete',
      projectCancel: 'Clear selection',
      projectDragDone: 'Done',
      dragModeHint: 'Drag the body to move dates, drag either end to resize; double-click empty space to exit',
      slotsToday: 'day',
      errorTitle: 'A title is required',
      errorDates: 'End date cannot be before start date',
      errorTime: 'End time must be after start time',
      formInvalid: 'Some tasks are incomplete; fix the highlighted rows',
      projectDrag: 'Drag to resize',
      emptyWeekCol: '—',
      noTasksToday: 'No timed tasks today; double-click an empty spot on the timeline to add one',
      projectCount: (count) => `${count} long-term task(s)`,
      dailyCount: (count) => `${count} item(s)`,
      weekRange: (a, b) => `${a} – ${b}`,
      monthRange: (a, b) => `${a} – ${b}`,
      moreTasks: (count) => `${count} more`,
      lessTasks: 'Collapse',
      dailyToggle: (done) => (done ? 'Done today; click to undo' : 'Mark done today'),
      subtasksLabel: 'Subtasks: ',
      subtasksEditHint: '(edit on the day view)',
      addSubtask: 'Add subtask',
      newSubtaskPlaceholder: 'Type a subtask, Enter to add',
      subtaskCount: (count) => `${count} subtask(s)`,
      slotSelected: 'Selected day task: ',
      weekDragHint: 'Drag a task to reschedule; click a task to view its subtasks',
      movedTo: (day) => `Moved to ${day}`,
      projectDoneOnDay: (done) => (done ? 'Unmark this day' : 'Mark this day only'),
      clickToViewSubtasks: 'Click to view subtasks',
    }

    // --- styles ---------------------------------------------------------------

    const CSS = [
      '.tb-page{display:flex;flex-direction:column;width:100%;height:100%;min-width:0;min-height:0;overflow:auto;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-size:14px;line-height:1.5}',
      '.tb-shell{display:flex;flex-direction:column;gap:16px;width:100%;max-width:1720px;margin:0 auto;box-sizing:border-box;padding:0 clamp(14px,2.6vw,30px) 44px}',
      '.tb-head{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;padding:20px 0 0;flex-wrap:wrap}',
      '.tb-title{margin:0;font-size:19px;font-weight:600;line-height:28px}',
      '.tb-sub{font-size:12px;color:var(--dsw-alias-label-secondary)}',
      '.tb-save{font-size:12px;color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums}',
      '.tb-save[data-error]{color:var(--dsw-alias-state-error-primary)}',
      '.tb-banner{display:flex;align-items:center;gap:8px;padding:8px 12px;border:1px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-sm,6px);background:var(--dsw-alias-bg-layer-2);font-size:12px;color:var(--dsw-alias-label-secondary)}',
      '.tb-banner[data-error]{border-color:var(--dsw-alias-state-error-primary);color:var(--dsw-alias-state-error-primary)}',
      '.tb-card{border:1px solid var(--dsw-alias-border-l1,rgba(128,128,128,.18));border-radius:var(--dsw-radius-md,10px);background:var(--dsw-alias-bg-layer-1);overflow:hidden}',
      '.tb-card-head{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:11px 14px;border-bottom:1px solid var(--dsw-alias-border-l1,rgba(128,128,128,.18))}',
      '.tb-card-title{display:flex;align-items:center;gap:6px;font-size:14px;font-weight:600}',
      '.tb-card-sub{font-size:12px;color:var(--dsw-alias-label-tertiary)}',
      '.tb-card-actions{margin-left:auto;display:flex;align-items:center;gap:6px;flex-wrap:wrap}',
      '.tb-btn{appearance:none;display:inline-flex;align-items:center;justify-content:center;gap:5px;height:28px;padding:0 11px;border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.4));border-radius:var(--dsw-radius-sm,6px);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;line-height:1;white-space:nowrap;cursor:pointer}',
      '.tb-btn:hover{background:var(--dsw-alias-bg-layer-2)}',
      '.tb-btn:disabled{opacity:.5;cursor:default}',
      '.tb-btn:disabled:hover{background:var(--dsw-alias-bg-layer-1)}',
      '.tb-btn-primary{border-color:transparent;background:var(--dsw-alias-brand-primary);color:#fff}',
      '.tb-btn-primary:hover{background:var(--dsw-alias-brand-primary);opacity:.88}',
      '.tb-btn-quiet{border-color:transparent;background:transparent;color:var(--dsw-alias-label-secondary);padding:0 8px}',
      '.tb-btn-quiet:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}',
      '.tb-btn-danger{border-color:transparent;background:transparent;color:var(--dsw-alias-state-error-primary)}',
      '.tb-btn-danger:hover{background:var(--dsw-alias-bg-layer-2)}',
      '.tb-btn-icon{width:26px;height:26px;padding:0;border-color:transparent;background:transparent;color:var(--dsw-alias-label-secondary)}',
      '.tb-btn-icon:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}',
      '.tb-extract{display:flex;flex-direction:column;gap:9px;padding:13px 14px;border:1px solid var(--dsw-alias-border-l1,rgba(128,128,128,.18));border-radius:var(--dsw-radius-md,10px);background:var(--dsw-alias-bg-layer-1)}',
      '.tb-extract-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap}',
      '.tb-extract-label{display:inline-flex;align-items:center;gap:6px;font-size:13px;font-weight:600}',
      '.tb-textarea{display:block;width:100%;box-sizing:border-box;min-height:54px;max-height:180px;resize:vertical;padding:8px 10px;border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.4));border-radius:var(--dsw-radius-sm,6px);background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;line-height:1.55}',
      '.tb-textarea:focus,.tb-input:focus,.tb-select:focus{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-1px}',
      '.tb-extract-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}',
      '.tb-hint{font-size:12px;color:var(--dsw-alias-label-tertiary)}',
      '.tb-hint-warn{font-size:12px;color:var(--dsw-alias-state-warn-primary,#c98a1b)}',
      '.tb-hint-error{font-size:12px;color:var(--dsw-alias-state-error-primary)}',
      '.tb-addrow{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding-top:9px;border-top:1px dashed var(--dsw-alias-border-l1,rgba(128,128,128,.18))}',
      '.tb-extract-result{display:flex;flex-direction:column;gap:8px;padding:10px;border:1px solid var(--dsw-alias-border-l1,rgba(128,128,128,.18));border-radius:var(--dsw-radius-sm,6px);background:var(--dsw-alias-bg-layer-2)}',
      '.tb-extract-result-head{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--dsw-alias-label-secondary);flex-wrap:wrap}',
      '.tb-erow{display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:8px;border:1px solid var(--dsw-alias-border-l1,rgba(128,128,128,.18));border-radius:var(--dsw-radius-sm,6px);background:var(--dsw-alias-bg-base)}',
      '.tb-erow-main{display:flex;align-items:center;gap:6px;flex:1 1 220px;min-width:0}',
      '.tb-erow-fields{display:flex;align-items:center;gap:6px;flex-wrap:wrap}',
      '.tb-input,.tb-select{height:26px;box-sizing:border-box;padding:0 7px;border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.4));border-radius:var(--dsw-radius-sm,6px);background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;min-width:0}',
      '.tb-input-title{flex:1 1 160px}',
      '.tb-input-date{width:128px}',
      '.tb-input-time{width:86px}',
      '.tb-color{appearance:none;flex:none;width:26px;height:26px;padding:0;border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.4));border-radius:var(--dsw-radius-sm,6px);background:transparent;cursor:pointer}',
      '.tb-kind{display:inline-flex;flex:none;align-items:center;height:20px;padding:0 7px;border-radius:10px;font-size:11px;line-height:20px;color:#fff;white-space:nowrap}',
      '.tb-kind[data-kind="project"]{background:#4C8DFF}',
      '.tb-kind[data-kind="daily"]{background:#27AE60}',
      '.tb-kind[data-kind="slot"]{background:#F2994A}',
      '.tb-cal{padding:8px 12px 12px}',
      '.tb-cal-weekhead{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:0;padding:0 0 5px;font-size:11px;color:var(--dsw-alias-label-tertiary);text-align:center}',
      '.tb-week{display:flex;flex-direction:column;padding:5px 5px 4px;margin-top:5px;border-radius:var(--dsw-radius-sm,6px);border-top:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.35))}',
      '.tb-cal-weekhead + .tb-week{margin-top:0;padding-top:2px;border-top:none}',
      '.tb-week[data-even]{background:linear-gradient(rgba(128,128,128,.09),rgba(128,128,128,.09)),var(--dsw-alias-bg-layer-1)}',
      '.tb-week[data-month-start]{border-top:2px solid var(--dsw-alias-border-l2,rgba(128,128,128,.5))}',
      '.tb-week:hover{box-shadow:inset 0 0 0 1px var(--dsw-alias-border-l1,rgba(128,128,128,.28))}',
      '.tb-week-days{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:0}',
      '.tb-day{appearance:none;display:flex;flex-direction:column;align-items:flex-start;gap:1px;min-height:32px;padding:3px 6px;border:1px solid transparent;border-radius:var(--dsw-radius-sm,6px);background:transparent;color:var(--dsw-alias-label-primary);font:inherit;text-align:left;cursor:pointer;position:relative}',
      '.tb-day:hover{background:rgba(128,128,128,.16)}',
      '.tb-day[data-outside]{color:var(--dsw-alias-label-tertiary)}',
      '.tb-day[data-today]{border-color:var(--dsw-alias-brand-primary)}',
      '.tb-day[data-selected]{box-shadow:inset 0 0 0 1.5px var(--dsw-alias-brand-primary)}',
      '.tb-day-num{font-size:12px;line-height:16px;font-variant-numeric:tabular-nums}',
      '.tb-day-today-mark{position:absolute;top:5px;right:6px;width:5px;height:5px;border-radius:50%;background:var(--dsw-alias-brand-primary)}',
      '.tb-lanes{position:relative;margin-top:2px}',
      '.tb-bar{position:absolute;left:0;display:flex;align-items:center;gap:4px;height:15px;box-sizing:border-box;padding:0 8px;border-radius:8px;color:#fff;font-size:11px;line-height:15px;white-space:nowrap;overflow:hidden;cursor:pointer;box-shadow:0 0 0 1px rgba(0,0,0,.06);user-select:none}',
      '.tb-bar[data-selected]{box-shadow:0 0 0 2px var(--dsw-alias-label-primary)}',
      '.tb-bar[data-editing]{cursor:grab;box-shadow:0 0 0 2px var(--dsw-alias-brand-primary)}',
      '.tb-bar-title{position:relative;z-index:1;min-width:0;overflow:hidden;text-overflow:ellipsis;font-weight:700;color:#fff;text-shadow:0 1px 2px rgba(0,0,0,.5)}',
      '.tb-bar-past{position:absolute;left:0;top:0;bottom:0;box-sizing:border-box;border-radius:6px;pointer-events:none;border-top:2px solid rgba(255,255,255,.72);border-bottom:2px solid rgba(255,255,255,.72);border-left:0;border-right:0;background-color:rgba(184,184,184,.40);background-image:repeating-linear-gradient(45deg,rgba(232,232,232,.62) 0 1.5px,rgba(232,232,232,0) 1.5px 5px);box-shadow:inset 0 0 7px rgba(255,255,255,.30),0 0 3px rgba(255,255,255,.22)}',
      '.tb-bar-handle{position:absolute;z-index:2;top:1px;bottom:1px;width:9px;border-radius:5px;background:rgba(255,255,255,.55);cursor:ew-resize;display:none}',
      '.tb-bar[data-editing] .tb-bar-handle{display:block}',
      '.tb-bar-handle-start{left:2px}',
      '.tb-bar-handle-end{right:2px}',
      '.tb-bar[data-editing] .tb-bar-title{padding:0 10px}',
      '.tb-more{appearance:none;align-self:flex-start;margin:3px 0 0 3px;padding:1px 9px;border:1px dashed var(--dsw-alias-border-l2,rgba(128,128,128,.4));border-radius:10px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:11px;line-height:17px;cursor:pointer}',
      '.tb-more:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}',
      '.tb-nav{display:flex;align-items:center;gap:6px}',
      '.tb-nav-label{font-size:13px;font-weight:600;font-variant-numeric:tabular-nums;white-space:nowrap}',
      '.tb-weekgrid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:8px;padding:12px 14px;min-height:200px;overflow-x:auto}',
      '.tb-wcol{display:flex;flex-direction:column;min-width:0;border:1px solid var(--dsw-alias-border-l1,rgba(128,128,128,.18));border-radius:var(--dsw-radius-sm,6px);overflow:hidden;background:var(--dsw-alias-bg-base)}',
      '.tb-wcol[data-today]{border-color:var(--dsw-alias-brand-primary)}',
      '.tb-wcol[data-past]{background:#E5ECFD;border-color:#D5DEEE;color:#1F2329}',
      '.tb-wcol-head{appearance:none;display:flex;align-items:center;justify-content:space-between;gap:4px;padding:6px 8px;border:none;border-bottom:1px solid var(--dsw-alias-border-l1,rgba(128,128,128,.18));background:transparent;color:inherit;font:inherit;font-size:12px;line-height:18px;text-align:left;cursor:pointer}',
      '.tb-wcol-head:hover{background:rgba(128,128,128,.1)}',
      '.tb-wcol[data-past] .tb-wcol-head{border-bottom-color:#D5DEEE}',
      '.tb-wcol-head-date{font-size:11px;color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums}',
      '.tb-wcol[data-past] .tb-wcol-head-date{color:#5A6472}',
      '.tb-wcol-body{flex:1;display:flex;flex-direction:column;gap:4px;padding:6px;min-height:130px}',
      '.tb-wcol-add{appearance:none;width:100%;margin-top:auto;padding:2px 4px;border:1px dashed var(--dsw-alias-border-l2,rgba(128,128,128,.3));border-radius:6px;background:transparent;color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px;cursor:pointer}',
      '.tb-wcol-add:hover{border-color:var(--dsw-alias-brand-primary,#4C8DFF);color:var(--dsw-alias-label-primary)}',
      '.tb-addtask{appearance:none;display:flex;align-items:center;justify-content:center;gap:4px;width:100%;margin-top:2px;padding:3px 6px;border:1px dashed var(--dsw-alias-border-l2,rgba(128,128,128,.35));border-radius:6px;background:transparent;color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px;cursor:pointer}',
      '.tb-addtask:hover{border-color:var(--dsw-alias-brand-primary,#4C8DFF);color:var(--dsw-alias-label-primary)}',
      '.tb-wtask{display:flex;align-items:center;gap:5px;font-size:12px;line-height:18px;min-width:0}',
      '.tb-checkbox-sm{width:16px;height:16px;border-radius:5px}',
      '.tb-checkbox-sm svg{width:10px;height:10px;stroke-width:2.6}',
      '.tb-daypanels{flex:none;width:236px;max-width:100%;display:flex;flex-direction:column;gap:10px}',
      '.tb-daypanels .tb-dailypanel{width:100%}',
      '.tb-daytask-list{display:flex;flex-direction:column;gap:2px}',
      '.tb-daytask{display:flex;align-items:center;gap:6px;min-width:0;padding:1px 2px;border-radius:4px;font-size:12px;line-height:20px;cursor:pointer}',
      '.tb-daytask:hover{background:rgba(128,128,128,.12)}',
      '.tb-daytask-block{display:flex;flex-direction:column;gap:1px;padding:1px 0}',
      '.tb-checkbox-xs{width:14px;height:14px;border-radius:4px}',
      '.tb-checkbox-xs svg{width:9px;height:9px;stroke-width:2.6}',
      '.tb-subtask{display:flex;align-items:center;gap:4px;min-width:0;padding:1px 2px 1px 24px;font-size:11px;line-height:18px}',
      '.tb-subtask-title{flex:0 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:text}',
      '.tb-subtask[data-done] .tb-subtask-title{color:var(--dsw-alias-label-tertiary);text-decoration:line-through}',
      '.tb-subtask-act{appearance:none;flex:none;padding:0 3px;border:none;border-radius:3px;background:transparent;color:var(--dsw-alias-label-tertiary);font-size:10px;line-height:16px;cursor:pointer}',
      '.tb-subtask-act:hover{background:rgba(128,128,128,.14);color:var(--dsw-alias-label-primary)}',
      '.tb-subtask-input{flex:1 1 auto;min-width:40px;height:18px;box-sizing:border-box;padding:0 4px;font-size:11px}',
      '.tb-subtask-addbtn{appearance:none;flex:none;margin-left:auto;width:16px;height:16px;padding:0;border:none;border-radius:4px;background:transparent;color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:16px;cursor:pointer}',
      '.tb-subtask-addbtn:hover{background:rgba(128,128,128,.16);color:var(--dsw-alias-label-primary)}',
      '.tb-subtask-mark{flex:none;width:14px;text-align:center;color:var(--dsw-alias-label-tertiary);font-size:11px}',
      '.tb-subitem{font-size:11px;line-height:16px;padding:1px 7px;border-radius:8px;background:var(--dsw-alias-bg-layer-2)}',
      '.tb-subitem[data-done]{color:var(--dsw-alias-label-tertiary);text-decoration:line-through}',
      '.tb-bar-sub{flex:none;margin-left:auto;padding:0 4px;border-radius:6px;background:rgba(255,255,255,.28);color:#fff;font-size:9px;line-height:12px}',
      '.tb-slot-subs{position:absolute;left:3px;bottom:1px;padding:0 3px;border-radius:4px;background:rgba(255,255,255,.28);color:#fff;font-size:9px;line-height:11px;pointer-events:none}',
      '.tb-wsub{flex:none;margin-left:2px;padding:0 4px;border-radius:6px;background:rgba(128,128,128,.16);color:var(--dsw-alias-label-secondary);font-size:9px;line-height:12px}',
      '.tb-wtag{flex:none;padding:0 4px;border-radius:6px;background:rgba(128,128,128,.16);color:var(--dsw-alias-label-secondary);font-size:9px;line-height:12px}',
      '.tb-weekdays{display:flex;flex-wrap:wrap;gap:4px}',
      '.tb-weekday{appearance:none;padding:3px 7px;border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.35));border-radius:999px;background:transparent;color:var(--dsw-alias-label-secondary);font-size:11px;line-height:16px;cursor:pointer}',
      '.tb-weekday[data-active]{border-color:var(--dsw-alias-brand-primary,#4C8DFF);background:var(--dsw-alias-brand-primary,#4C8DFF);color:#fff}',
      '.tb-wcaret{flex:none;width:10px;font-size:9px;line-height:18px;text-align:center;color:var(--dsw-alias-label-tertiary)}',
      '.tb-wsubitem{display:flex;align-items:center;gap:4px;min-width:0;padding:0 2px 1px 20px;font-size:11px;line-height:16px}',
      '.tb-wsubcheck{flex:none;display:inline-flex;align-items:center;justify-content:center;width:12px;height:12px;border-radius:3px;border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.45));font-size:8px;line-height:1;color:#fff}',
      '.tb-wsubcheck[data-done]{background:#27AE60;border-color:#27AE60}',
      '.tb-wsubtitle{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-secondary)}',
      '.tb-wsubitem[data-done] .tb-wsubtitle{color:var(--dsw-alias-label-tertiary);text-decoration:line-through}',
      '.tb-daytask[data-done] .tb-wtask-title{text-decoration:line-through;color:var(--dsw-alias-label-tertiary)}',
      '.tb-wtask-time{flex:none;font-size:10px;color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums}',
      '.tb-wcol[data-past] .tb-wtask-time{color:#5A6472}',
      '.tb-wdot{flex:none;width:8px;height:8px;border-radius:50%}',
      '.tb-wtask[data-draggable]{cursor:grab;touch-action:none;user-select:none}',
      '.tb-wtask[data-draggable]:active{cursor:grabbing}',
      '.tb-wcol[data-drag-over]{outline:2px dashed rgba(76,141,255,.75);outline-offset:-2px;background:rgba(76,141,255,.10)}',
      '.tb-dragghost{position:fixed;z-index:9999;max-width:220px;padding:3px 9px;border-radius:8px;background:rgba(22,22,26,.88);color:#fff;font-size:12px;line-height:16px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;box-shadow:0 6px 18px rgba(0,0,0,.28);pointer-events:none}',
      '.tb-wtask-title{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.tb-wempty{font-size:11px;color:var(--dsw-alias-label-tertiary)}',
      '.tb-dayview{display:flex;flex-direction:column;gap:10px;padding:12px 14px}',
      '.tb-daybar{display:flex;align-items:center;gap:8px;flex-wrap:wrap}',
      '.tb-daybody{display:flex;align-items:flex-start;gap:14px;flex-wrap:wrap}',
      '.tb-dailypanel{flex:none;width:236px;max-width:100%;display:flex;flex-direction:column;gap:5px;padding:10px 12px;border:1px solid var(--dsw-alias-border-l1,rgba(128,128,128,.18));border-radius:var(--dsw-radius-sm,6px);background:var(--dsw-alias-bg-layer-2)}',
      '.tb-panel-title{font-size:12px;font-weight:600;color:var(--dsw-alias-label-secondary)}',
      '.tb-panel-hint{font-size:11px;color:var(--dsw-alias-label-tertiary)}',
      '.tb-mdlist{list-style:none;display:flex;flex-direction:column;gap:3px;margin:0;padding:0}',
      '.tb-mditem{display:flex;align-items:center;gap:8px;min-width:0;font-size:13px;line-height:20px}',
      '.tb-checkbox{appearance:none;flex:none;display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;padding:0;box-sizing:border-box;border:1.5px solid var(--dsw-alias-border-l2,rgba(128,128,128,.45));border-radius:6px;background:transparent;color:#fff;cursor:pointer;transition:background .12s,border-color .12s}',
      '.tb-checkbox:hover{border-color:var(--dsw-alias-state-success-primary,#2FBF71)}',
      '.tb-checkbox[data-checked]{border-color:transparent;background:var(--dsw-alias-state-success-primary,#2FBF71)}',
      '.tb-checkbox svg{width:13px;height:13px;stroke-width:2.4}',
      '.tb-mdcheck{appearance:none;flex:none;padding:0;border:none;background:transparent;color:var(--dsw-alias-label-tertiary);font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px;line-height:20px;cursor:pointer}',
      '.tb-mdcheck:hover{color:var(--dsw-alias-brand-primary)}',
      '.tb-mdcheck[data-done]{color:var(--dsw-alias-state-success-primary)}',
      '.tb-mdtitle{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.tb-md-edit{appearance:none;flex:none;margin-left:auto;padding:0 4px;border:none;border-radius:4px;background:transparent;color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:18px;cursor:pointer}',
      '.tb-md-edit:hover{background:rgba(128,128,128,.14);color:var(--dsw-alias-state-error-primary)}',
      '.tb-daily-body{padding:10px 14px 14px;display:flex;flex-direction:column;gap:8px}',
      '.tb-daily-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:2px 18px}',
      '.tb-daily-add{display:flex;align-items:center;gap:6px;flex-wrap:wrap}',
      '.tb-timeline{flex:1;min-width:280px;display:flex;border:1px solid var(--dsw-alias-border-l1,rgba(128,128,128,.18));border-radius:var(--dsw-radius-sm,6px);background:var(--dsw-alias-bg-base);overflow:hidden}',
      '.tb-tl-hours{flex:none;width:52px;border-right:1px solid var(--dsw-alias-border-l1,rgba(128,128,128,.18));background:var(--dsw-alias-bg-layer-2)}',
      '.tb-tl-hour{position:relative;box-sizing:border-box;border-bottom:1px solid transparent;font-size:10px;color:var(--dsw-alias-label-tertiary);text-align:right;padding-right:7px;font-variant-numeric:tabular-nums}',
      '.tb-tl-hour-label{position:absolute;right:7px;top:-7px;padding:0 2px;background:var(--dsw-alias-bg-layer-2)}',
      '.tb-tl-content{position:relative;flex:1;min-width:0;cursor:crosshair}',
      '.tb-tl-lines{position:absolute;inset:0;pointer-events:none}',
      '.tb-tl-line{box-sizing:border-box;border-bottom:1px solid var(--dsw-alias-border-l1,rgba(128,128,128,.18))}',
      '.tb-slot{position:absolute;box-sizing:border-box;display:flex;flex-direction:column;gap:0;padding:3px 6px;border-radius:6px;color:#fff;font-size:11px;line-height:14px;overflow:hidden;cursor:grab;box-shadow:0 1px 2px rgba(0,0,0,.16);user-select:none;min-height:15px}',
      '.tb-slot[data-drag]{cursor:grabbing;z-index:4;opacity:.9;box-shadow:0 6px 16px rgba(0,0,0,.32)}',
      '.tb-slot-title{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-shadow:0 1px 1px rgba(0,0,0,.22)}',
      '.tb-slot-time{font-size:10px;opacity:.92;font-variant-numeric:tabular-nums;white-space:nowrap}',
      '.tb-slot[data-done] .tb-slot-title{text-decoration:line-through;opacity:.78}',
      '.tb-slot-handle{position:absolute;left:2px;right:2px;height:7px;border-radius:4px;background:rgba(255,255,255,.45);cursor:ns-resize;display:none;z-index:2}',
      '.tb-slot-handle-top{top:1px}',
      '.tb-slot-handle-bottom{bottom:1px}',
      '.tb-slot:hover .tb-slot-handle,.tb-slot[data-drag] .tb-slot-handle{display:block}',
      '.tb-slot-done{appearance:none;position:absolute;top:2px;right:3px;z-index:3;width:14px;height:14px;padding:0;border:1px solid currentColor;border-radius:4px;background:rgba(0,0,0,.12);color:inherit;font-size:10px;line-height:12px;text-align:center;cursor:pointer}',
      '.tb-tl-now{position:absolute;left:0;right:0;height:0;border-top:2px solid var(--dsw-alias-state-error-primary,#e5484d);z-index:3;pointer-events:none}',
      '.tb-tl-now::before{content:"";position:absolute;left:-4px;top:-4px;width:6px;height:6px;border-radius:50%;background:var(--dsw-alias-state-error-primary,#e5484d)}',
      '.tb-dragtip{position:fixed;z-index:70;padding:3px 8px;border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.4));border-radius:var(--dsw-radius-sm,6px);background:var(--dsw-alias-bg-overlay,#fff);color:var(--dsw-alias-label-primary);font-size:11px;line-height:16px;font-variant-numeric:tabular-nums;pointer-events:none;box-shadow:0 6px 16px rgba(0,0,0,.2)}',
      '.tb-overlay{position:fixed;inset:0;z-index:60;display:flex;align-items:center;justify-content:center;padding:24px;background:rgba(0,0,0,.38)}',
      '.tb-modal{width:min(440px,100%);max-height:86vh;display:flex;flex-direction:column;border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.4));border-radius:var(--dsw-radius-md,10px);background:var(--dsw-alias-bg-overlay,#fff);color:var(--dsw-alias-label-primary);box-shadow:0 18px 48px rgba(0,0,0,.3)}',
      '.tb-modal-head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 16px;border-bottom:1px solid var(--dsw-alias-border-l1,rgba(128,128,128,.18))}',
      '.tb-modal-title{margin:0;font-size:15px;font-weight:600}',
      '.tb-modal-body{display:flex;flex-direction:column;gap:12px;padding:14px 16px;overflow:auto}',
      '.tb-modal-foot{display:flex;align-items:center;justify-content:flex-end;gap:8px;padding:12px 16px;border-top:1px solid var(--dsw-alias-border-l1,rgba(128,128,128,.18))}',
      '.tb-field{display:flex;flex-direction:column;gap:5px;min-width:0}',
      '.tb-field-label{font-size:12px;color:var(--dsw-alias-label-secondary)}',
      '.tb-field-row{display:flex;gap:10px}',
      '.tb-field-row .tb-field{flex:1}',
      '.tb-swatches{display:flex;flex-wrap:wrap;gap:6px}',
      '.tb-swatch{appearance:none;width:20px;height:20px;padding:0;border:2px solid transparent;border-radius:50%;cursor:pointer}',
      '.tb-swatch[data-on]{border-color:var(--dsw-alias-label-primary)}',
      '.tb-form-error{font-size:12px;color:var(--dsw-alias-state-error-primary)}',
      '.tb-flash{font-size:12px;color:var(--dsw-alias-state-success-primary)}',
      '.tb-empty{font-size:12px;color:var(--dsw-alias-label-tertiary)}',
      '.tb-loading{padding:48px 0;text-align:center;font-size:13px;color:var(--dsw-alias-label-secondary)}',
      '.tb-crash{padding:24px;display:flex;flex-direction:column;gap:8px}',
      '.tb-hidden{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}',
    ].join('')

    // --- date and value helpers ----------------------------------------------

    function pad2(value) {
      return String(value).padStart(2, '0')
    }

    function dateKey(date) {
      return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
    }

    function parseKey(key) {
      const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(key === undefined || key === null ? '' : key))
      if (match === null) return null
      const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
      if (Number.isNaN(date.getTime())) return null
      if (date.getMonth() !== Number(match[2]) - 1 || date.getDate() !== Number(match[3])) return null
      return date
    }

    function isDateKey(value) {
      return typeof value === 'string' && parseKey(value) !== null
    }

    function todayKey() {
      return dateKey(new Date())
    }

    function addDays(key, amount) {
      const date = parseKey(key) || new Date()
      date.setDate(date.getDate() + amount)
      return dateKey(date)
    }

    function startOfWeek(key) {
      const date = parseKey(key) || new Date()
      const offset = (date.getDay() + 6) % 7
      date.setDate(date.getDate() - offset)
      return dateKey(date)
    }

    function startOfMonth(key) {
      const date = parseKey(key) || new Date()
      return dateKey(new Date(date.getFullYear(), date.getMonth(), 1))
    }

    function addMonths(key, amount) {
      const date = parseKey(key) || new Date()
      return dateKey(new Date(date.getFullYear(), date.getMonth() + amount, 1))
    }

    function endOfMonth(key) {
      const date = parseKey(key) || new Date()
      return dateKey(new Date(date.getFullYear(), date.getMonth() + 1, 0))
    }

    function daysBetween(from, to) {
      const a = parseKey(from)
      const b = parseKey(to)
      if (a === null || b === null) return 0
      return Math.round((b.getTime() - a.getTime()) / 86400000)
    }

    function weekdayIndex(key) {
      const date = parseKey(key)
      return date === null ? 0 : (date.getDay() + 6) % 7
    }

    function weekdayZh(key) {
      return WEEKDAYS_ZH[weekdayIndex(key)]
    }

    function weekdayEn(key) {
      return WEEKDAYS_EN[weekdayIndex(key)]
    }

    function monthText(key) {
      const date = parseKey(key)
      if (date === null) return String(key || '')
      if (activeLanguage().toLowerCase().startsWith('zh')) return `${date.getFullYear()}年${date.getMonth() + 1}月`
      return `${MONTHS_EN[date.getMonth()]} ${date.getFullYear()}`
    }

    function monthShort(key) {
      const date = parseKey(key)
      if (date === null) return ''
      if (activeLanguage().toLowerCase().startsWith('zh')) return `${date.getMonth() + 1}月`
      return MONTHS_EN[date.getMonth()]
    }

    function monthTextShort(key) {
      const date = parseKey(key)
      return date === null ? String(key || '') : `${date.getFullYear()}·${date.getMonth() + 1}月`
    }

    function dayText(key) {
      const date = parseKey(key)
      return date === null ? String(key || '') : `${date.getMonth() + 1}月${date.getDate()}日`
    }

    function dayTextEn(key) {
      const date = parseKey(key)
      if (date === null) return String(key || '')
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
      return `${months[date.getMonth()]} ${date.getDate()}`
    }

    function minutesText(minutes) {
      const rounded = Math.round(minutes)
      // 1440 is a legal end-of-day boundary (24:00); wrapping it to 00:00 would
      // make an existing block uneditable in a <input type="time">.
      if (rounded >= 1440) return '24:00'
      const value = ((rounded % 1440) + 1440) % 1440
      return `${pad2(Math.floor(value / 60))}:${pad2(value % 60)}`
    }

    function minutesFromText(text) {
      const match = /^(\d{1,2}):(\d{2})$/.exec(String(text === undefined || text === null ? '' : text).trim())
      if (match === null) return null
      const hours = Number(match[1])
      const mins = Number(match[2])
      if (hours > 23 || mins > 59) return null
      return hours * 60 + mins
    }

    function rangeKeys(start, end) {
      const keys = []
      const last = parseKey(end)
      if (last === null) return keys
      let cursor = parseKey(start)
      if (cursor === null) return keys
      while (cursor.getTime() <= last.getTime() && keys.length <= 800) {
        keys.push(dateKey(cursor))
        cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1)
      }
      return keys
    }

    function clamp(value, low, high) {
      return Math.min(high, Math.max(low, value))
    }

    function uid(prefix) {
      return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
    }

    function isColor(value) {
      return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value)
    }

    function pickColor(list) {
      return PALETTE[list.length % PALETTE.length]
    }

    /** Pick near-black or white text for a known fill color by WCAG luminance. */
    function readableOn(color) {
      if (!isColor(color)) return '#FFFFFF'
      const raw = color.slice(1)
      const channels = [0, 2, 4].map((offset) => {
        const part = parseInt(raw.slice(offset, offset + 2), 16) / 255
        return part <= 0.04045 ? part / 12.92 : ((part + 0.055) / 1.055) ** 2.4
      })
      const luminance = 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
      const white = 1.05 / (luminance + 0.05)
      const dark = (luminance + 0.05) / 0.063
      return white >= dark ? '#FFFFFF' : '#1F2329'
    }

    // --- HTTP -----------------------------------------------------------------

    async function post(routePath, body) {
      const response = await fetch(`${ROUTE}${routePath}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body === undefined ? {} : body),
      })
      let data = {}
      try {
        data = await response.json()
      } catch {
        data = {}
      }
      if (!response.ok || !data || data.ok !== true) {
        const detail = data && data.error ? data.error : response.ok ? 'unexpected response' : `HTTP ${response.status}`
        const error = new Error(detail)
        error.status = response.status
        throw error
      }
      return data
    }

    // --- store shape ----------------------------------------------------------

    function emptyStore() {
      return { version: 1, projects: [], dailyTasks: [], dayPlans: {}, recurringTasks: [] }
    }

    /** Canonicalize one task's ordered subtask list (order is never reorderable). */
    function normalizeSubtasks(raw) {
      if (!Array.isArray(raw)) return []
      const list = []
      for (const entry of raw.slice(0, 50)) {
        const title = typeof entry === 'string'
          ? entry.trim()
          : (entry && typeof entry.title === 'string' ? entry.title.trim() : '')
        if (title === '') continue
        list.push({
          id: entry && typeof entry === 'object' && typeof entry.id === 'string' && entry.id !== '' ? entry.id : uid('st'),
          title: title.slice(0, 200),
          done: Boolean(entry && typeof entry === 'object' && entry.done === true),
        })
      }
      return list
    }

    /** Long-term tasks scope every subtask to one date (the day it was added on);
     *  legacy entries without a date fall back to the project start date. */
    function normalizeProjectSubtasks(raw, fallbackDate) {
      if (!Array.isArray(raw)) return []
      const list = []
      for (const entry of raw.slice(0, 50)) {
        const title = typeof entry === 'string'
          ? entry.trim()
          : (entry && typeof entry.title === 'string' ? entry.title.trim() : '')
        if (title === '') continue
        const date = entry && typeof entry === 'object' && isDateKey(entry.date) ? entry.date : fallbackDate
        list.push({
          id: entry && typeof entry === 'object' && typeof entry.id === 'string' && entry.id !== '' ? entry.id : uid('st'),
          title: title.slice(0, 200),
          done: Boolean(entry && typeof entry === 'object' && entry.done === true),
          date,
        })
      }
      return list
    }

    function normalizeStore(raw) {
      const store = emptyStore()
      if (raw === null || typeof raw !== 'object') return store
      if (Array.isArray(raw.projects)) {
        for (const entry of raw.projects.slice(0, 2000)) {
          if (!entry || typeof entry !== 'object') continue
          const title = typeof entry.title === 'string' ? entry.title.trim() : ''
          if (title === '' || !isDateKey(entry.start)) continue
          const end = isDateKey(entry.end) && daysBetween(entry.start, entry.end) >= 0 ? entry.end : entry.start
          store.projects.push({
            id: typeof entry.id === 'string' && entry.id !== '' ? entry.id : uid('p'),
            title: title.slice(0, 200),
            color: isColor(entry.color) ? entry.color : pickColor(store.projects),
            start: entry.start,
            end,
            note: typeof entry.note === 'string' ? entry.note.slice(0, 500) : '',
            done: entry.done === true,
            doneDates: Array.isArray(entry.doneDates) ? entry.doneDates.filter(isDateKey).slice(-3660) : [],
            subtasks: normalizeProjectSubtasks(entry.subtasks, entry.start),
          })
        }
      }
      if (Array.isArray(raw.dailyTasks)) {
        for (const entry of raw.dailyTasks.slice(0, 2000)) {
          if (!entry || typeof entry !== 'object') continue
          const title = typeof entry.title === 'string' ? entry.title.trim() : ''
          if (title === '') continue
          const doneDates = Array.isArray(entry.doneDates)
            ? entry.doneDates.filter(isDateKey).slice(-3660)
            : []
          store.dailyTasks.push({
            id: typeof entry.id === 'string' && entry.id !== '' ? entry.id : uid('d'),
            title: title.slice(0, 200),
            doneDates,
          })
        }
      }
      if (Array.isArray(raw.recurringTasks)) {
        for (const entry of raw.recurringTasks.slice(0, 500)) {
          if (!entry || typeof entry !== 'object') continue
          const title = typeof entry.title === 'string' ? entry.title.trim() : ''
          if (title === '') continue
          const startDate = isDateKey(entry.startDate) ? entry.startDate : todayKey()
          const mode = entry.mode === 'interval' ? 'interval' : 'weekly'
          const weekdays = Array.isArray(entry.weekdays)
            ? Array.from(new Set(entry.weekdays.filter((value) => Number.isInteger(value) && value >= 1 && value <= 7))).sort((left, right) => left - right)
            : []
          if (mode === 'weekly' && weekdays.length === 0) continue
          store.recurringTasks.push({
            id: typeof entry.id === 'string' && entry.id !== '' ? entry.id : uid('r'),
            title: title.slice(0, 200),
            color: isColor(entry.color) ? entry.color : pickColor(store.recurringTasks),
            mode,
            startDate,
            weekdays,
            intervalDays: clamp(Math.round(Number(entry.intervalDays) || 1), 1, 365),
            weeks: clamp(Math.round(Number(entry.weeks) || 1), 1, 52),
            note: typeof entry.note === 'string' ? entry.note.slice(0, 500) : '',
            doneDates: Array.isArray(entry.doneDates) ? entry.doneDates.filter(isDateKey).slice(-3660) : [],
            subtasks: normalizeProjectSubtasks(entry.subtasks, startDate),
          })
        }
      }
      if (raw.dayPlans && typeof raw.dayPlans === 'object') {        let days = 0
        for (const key of Object.keys(raw.dayPlans)) {
          if (!isDateKey(key) || days >= 3660) continue
          const list = raw.dayPlans[key]
          if (!Array.isArray(list)) continue
          const slots = []
          for (const entry of list.slice(0, 500)) {
            if (!entry || typeof entry !== 'object') continue
            const title = typeof entry.title === 'string' ? entry.title.trim() : ''
            if (title === '') continue
            const start = Number.isFinite(entry.start) ? clamp(Math.round(entry.start), 0, 1440) : NaN
            const end = Number.isFinite(entry.end) ? clamp(Math.round(entry.end), 0, 1440) : NaN
            if (!(end > start)) continue
            slots.push({
              id: typeof entry.id === 'string' && entry.id !== '' ? entry.id : uid('s'),
              title: title.slice(0, 200),
              start,
              end,
              color: isColor(entry.color) ? entry.color : pickColor(slots),
              done: entry.done === true,
              subtasks: normalizeSubtasks(entry.subtasks),
            })
          }
          if (slots.length > 0) {
            slots.sort((a, b) => a.start - b.start || a.end - b.end)
            store.dayPlans[key] = slots
            days += 1
          }
        }
      }
      // React keys and patch-by-id assume uniqueness; the host only guarantees a
      // non-empty string id, so duplicates are repaired here.
      const seenIds = new Set()
      const repairId = (item, prefix) => {
        if (seenIds.has(item.id)) item.id = uid(prefix)
        seenIds.add(item.id)
      }
      for (const project of store.projects) {
        repairId(project, 'p')
        for (const sub of project.subtasks) repairId(sub, 'st')
      }
      for (const task of store.dailyTasks) repairId(task, 'd')
      for (const task of store.recurringTasks) repairId(task, 'r')
      for (const key of Object.keys(store.dayPlans)) {
        for (const slot of store.dayPlans[key]) {
          repairId(slot, 's')
          for (const sub of slot.subtasks) repairId(sub, 'st')
        }
      }
      return store
    }

    function slotsOn(store, key) {
      const list = store.dayPlans[key]
      if (!Array.isArray(list)) return []
      return list.slice().sort((a, b) => a.start - b.start || a.end - b.end)
    }

    function projectsOn(store, key) {
      return store.projects.filter((project) => project.start <= key && key <= project.end)
    }

    function withProject(store, project) {
      return { ...store, projects: [...store.projects, project] }
    }

    function patchProject(store, id, patch) {
      return { ...store, projects: store.projects.map((project) => (project.id === id ? { ...project, ...patch } : project)) }
    }

    /** Move a project (and its per-day subtask dates) by `delta` days. */
    function shiftProjectDays(store, id, delta) {
      if (delta === 0) return store
      return {
        ...store,
        projects: store.projects.map((project) => {
          if (project.id !== id) return project
          const subtasks = (Array.isArray(project.subtasks) ? project.subtasks : []).map((sub) => (
            isDateKey(sub.date) ? { ...sub, date: addDays(sub.date, delta) } : sub
          ))
          return {
            ...project,
            start: addDays(project.start, delta),
            end: addDays(project.end, delta),
            subtasks,
          }
        }),
      }
    }

    function toggleProjectDoneOn(store, id, key) {
      return {
        ...store,
        projects: store.projects.map((project) => {
          if (project.id !== id) return project
          const doneDates = Array.isArray(project.doneDates) ? project.doneDates : []
          const has = doneDates.includes(key)
          return {
            ...project,
            doneDates: has ? doneDates.filter((date) => date !== key) : doneDates.concat([key]).slice(-3660),
          }
        }),
      }
    }

    function withoutProject(store, id) {
      return { ...store, projects: store.projects.filter((project) => project.id !== id) }
    }

    function withDailyTask(store, title) {
      return { ...store, dailyTasks: [...store.dailyTasks, { id: uid('d'), title, doneDates: [] }] }
    }

    function withoutDailyTask(store, id) {
      return { ...store, dailyTasks: store.dailyTasks.filter((task) => task.id !== id) }
    }

    function renameDailyTask(store, id, title) {
      return {
        ...store,
        dailyTasks: store.dailyTasks.map((task) => (task.id === id ? { ...task, title } : task)),
      }
    }

    function toggleDailyDone(store, id, key) {
      return {
        ...store,
        dailyTasks: store.dailyTasks.map((task) => {
          if (task.id !== id) return task
          const has = task.doneDates.includes(key)
          return {
            ...task,
            doneDates: has ? task.doneDates.filter((value) => value !== key) : task.doneDates.concat([key]).slice(-3660),
          }
        }),
      }
    }

    // --- weekly recurring tasks ----------------------------------------------

    function withRecurringTask(store, task) {
      return { ...store, recurringTasks: [...store.recurringTasks, task] }
    }

    function patchRecurringTask(store, id, patch) {
      return {
        ...store,
        recurringTasks: store.recurringTasks.map((task) => (task.id === id ? { ...task, ...patch } : task)),
      }
    }

    function withoutRecurringTask(store, id) {
      return { ...store, recurringTasks: store.recurringTasks.filter((task) => task.id !== id) }
    }

    function toggleRecurringDoneOn(store, id, key) {
      return {
        ...store,
        recurringTasks: store.recurringTasks.map((task) => {
          if (task.id !== id) return task
          const doneDates = Array.isArray(task.doneDates) ? task.doneDates : []
          const has = doneDates.includes(key)
          return {
            ...task,
            doneDates: has ? doneDates.filter((date) => date !== key) : doneDates.concat([key]).slice(-3660),
          }
        }),
      }
    }

    /** All occurrence dates of a recurring task, in order.
     *  Weekly mode: `weekdays` use 1 = Monday ... 7 = Sunday. Interval mode:
     *  every `intervalDays` days starting at `startDate`. Both stop at the end
     *  of the N calendar weeks counted from the week that contains `startDate`. */
    function recurringDates(task) {
      const dates = []
      if (!task || !isDateKey(task.startDate)) return dates
      const weeks = clamp(Math.round(Number(task.weeks) || 1), 1, 52)
      const windowEnd = addDays(startOfWeek(task.startDate), weeks * 7)
      if (task.mode === 'interval') {
        const step = clamp(Math.round(Number(task.intervalDays) || 1), 1, 365)
        let date = task.startDate
        let guard = 0
        while (date < windowEnd && guard < 400) {
          dates.push(date)
          date = addDays(date, step)
          guard += 1
        }
        return dates
      }
      if (!Array.isArray(task.weekdays) || task.weekdays.length === 0) return dates
      for (let index = 0; index < weeks; index += 1) {
        const weekStart = addDays(startOfWeek(task.startDate), index * 7)
        for (const weekday of task.weekdays) {
          const date = addDays(weekStart, weekday - 1)
          if (date >= task.startDate) dates.push(date)
        }
      }
      return dates.sort()
    }

    /** Recurring tasks occurring on `key`, with their per-date completion. */
    function recurringOn(store, key) {
      const tasks = Array.isArray(store.recurringTasks) ? store.recurringTasks : []
      return tasks
        .filter((task) => recurringDates(task).includes(key))
        .map((task) => ({ task, done: Array.isArray(task.doneDates) && task.doneDates.includes(key) }))
    }

    /** Human summary of a recurring task, e.g. "周一、周三 · 共 4 周". */
    function recurringSummaryText(t, task) {
      const weeks = clamp(Math.round(Number(task.weeks) || 1), 1, 52)
      if (task.mode === 'interval') {
        return t('intervalSummary', clamp(Math.round(Number(task.intervalDays) || 1), 1, 365), weeks)
      }
      const weekdays = Array.isArray(task.weekdays) ? task.weekdays : []
      const weekStart = startOfWeek(isDateKey(task.startDate) ? task.startDate : todayKey())
      const labels = weekdays.map((weekday) => formatWeekday(addDays(weekStart, weekday - 1)))
      return t('weeklySummary', t('joinWeekdays', labels), weeks)
    }

    function withSlot(store, key, slot) {
      const list = slotsOn(store, key).concat([slot]).sort((a, b) => a.start - b.start || a.end - b.end)
      return { ...store, dayPlans: { ...store.dayPlans, [key]: list } }
    }

    function patchSlot(store, key, id, patch) {
      const list = slotsOn(store, key)
        .map((slot) => (slot.id === id ? { ...slot, ...patch } : slot))
        .sort((a, b) => a.start - b.start || a.end - b.end)
      return { ...store, dayPlans: { ...store.dayPlans, [key]: list } }
    }

    function withoutSlot(store, key, id) {
      const list = slotsOn(store, key).filter((slot) => slot.id !== id)
      const dayPlans = { ...store.dayPlans }
      if (list.length > 0) dayPlans[key] = list
      else delete dayPlans[key]
      return { ...store, dayPlans }
    }

    // --- subtasks -------------------------------------------------------------

    /** Apply `mutator` to one project's ordered subtask list. */
    function mutateProjectSubtasks(store, projectId, mutator) {
      return {
        ...store,
        projects: store.projects.map((project) => (
          project.id === projectId
            ? { ...project, subtasks: mutator(Array.isArray(project.subtasks) ? project.subtasks : []) }
            : project
        )),
      }
    }

    /** Apply `mutator` to one day task's ordered subtask list. */
    function mutateSlotSubtasks(store, key, slotId, mutator) {
      const slot = slotsOn(store, key).find((entry) => entry.id === slotId)
      if (slot === undefined) return store
      return patchSlot(store, key, slotId, {
        subtasks: mutator(Array.isArray(slot.subtasks) ? slot.subtasks : []),
      })
    }

    /** Apply `mutator` to one recurring task's per-date subtask list. */
    function mutateRecurringSubtasks(store, id, mutator) {
      return {
        ...store,
        recurringTasks: store.recurringTasks.map((task) => (
          task.id === id
            ? { ...task, subtasks: mutator(Array.isArray(task.subtasks) ? task.subtasks : []) }
            : task
        )),
      }
    }

    /** Add one subtask to a project or day task; order is append-only. */
    function addSubtaskTo(store, owner, ownerId, key, title) {
      const clean = String(title === undefined || title === null ? '' : title).trim().slice(0, 200)
      if (clean === '') return store
      const subtask = { id: uid('st'), title: clean, done: false }
      if (owner === 'project') {
        return mutateProjectSubtasks(store, ownerId, (list) => list.concat([subtask]))
      }
      return mutateSlotSubtasks(store, key, ownerId, (list) => list.concat([subtask]))
    }

    function patchSubtaskIn(store, owner, ownerId, key, subtaskId, patch) {
      const apply = (list) => list.map((subtask) => (subtask.id === subtaskId ? { ...subtask, ...patch } : subtask))
      return owner === 'project'
        ? mutateProjectSubtasks(store, ownerId, apply)
        : mutateSlotSubtasks(store, key, ownerId, apply)
    }

    function removeSubtaskFrom(store, owner, ownerId, key, subtaskId) {
      const apply = (list) => list.filter((subtask) => subtask.id !== subtaskId)
      return owner === 'project'
        ? mutateProjectSubtasks(store, ownerId, apply)
        : mutateSlotSubtasks(store, key, ownerId, apply)
    }

    // --- locale ---------------------------------------------------------------

    let localeService = null

    function activeLanguage() {
      try {
        if (localeService && typeof localeService.getSnapshot === 'function') {
          const snapshot = localeService.getSnapshot()
          if (snapshot && typeof snapshot.active === 'string' && snapshot.active !== '') return snapshot.active
        }
      } catch {
        // fall through to the browser language
      }
      if (typeof navigator !== 'undefined') return String(navigator.language || '')
      return 'zh'
    }

    function currentDict() {
      return activeLanguage().toLowerCase().startsWith('zh') ? zh : en
    }

    function formatDay(key) {
      return activeLanguage().toLowerCase().startsWith('zh') ? dayText(key) : dayTextEn(key)
    }

    function formatWeekday(key) {
      return activeLanguage().toLowerCase().startsWith('zh') ? weekdayZh(key) : weekdayEn(key)
    }

    function useDict() {
      const [revision, setRevision] = React.useState(0)
      React.useEffect(() => {
        if (!localeService || typeof localeService.subscribe !== 'function') return undefined
        return localeService.subscribe(() => setRevision((value) => value + 1))
      }, [])
      return React.useMemo(() => {
        const table = currentDict()
        return (key, ...args) => {
          let value = table[key]
          if (typeof value === 'function') value = value(...args)
          if (typeof value === 'string') return value
          const other = table === zh ? en : zh
          let fallback = other[key]
          if (typeof fallback === 'function') fallback = fallback(...args)
          return typeof fallback === 'string' ? fallback : key
        }
      }, [revision])
    }

    // --- data loading and autosave -------------------------------------------

    function useTaskBoard() {
      const [state, setState] = React.useState({ status: 'loading', data: null, error: null, warning: null, blocked: false })
      const loadedRef = React.useRef(false)
      const savedRef = React.useRef(null)
      const timerRef = React.useRef(null)
      const queueRef = React.useRef(Promise.resolve())
      const dataRef = React.useRef(null)
      const pendingSavesRef = React.useRef(0)
      const [savedAt, setSavedAt] = React.useState(null)
      const [saveError, setSaveError] = React.useState(null)
      const [saving, setSaving] = React.useState(false)
      const [flash, setFlash] = React.useState(null)
      const flashTimer = React.useRef(null)

      const showFlash = React.useCallback((message) => {
        setFlash(message)
        if (flashTimer.current !== null) clearTimeout(flashTimer.current)
        flashTimer.current = setTimeout(() => setFlash(null), 2600)
      }, [])

      React.useEffect(() => () => {
        if (flashTimer.current !== null) clearTimeout(flashTimer.current)
        if (timerRef.current !== null) clearTimeout(timerRef.current)
      }, [])

      /**
       * Commit one load result. `blocked` protects a file the host refused to
       * parse (or could not read): the empty fallback store must not overwrite it
       * until the user explicitly allows that.
       */
      const applyLoaded = React.useCallback((store, error, warning) => {
        loadedRef.current = true
        savedRef.current = JSON.stringify(store)
        dataRef.current = store
        setState({
          status: 'ready',
          data: store,
          error,
          warning,
          blocked: error !== null || warning !== null,
        })
      }, [])

      React.useEffect(() => {
        let alive = true
        post('/load', {}).then((data) => {
          if (!alive) return
          applyLoaded(normalizeStore(data.data), null, typeof data.warning === 'string' ? data.warning : null)
        }).catch((error) => {
          if (!alive) return
          const message = String((error && error.message) || error)
          applyLoaded(emptyStore(), /HTTP 40[45]/.test(message) ? 'host-missing' : message, null)
        })
        return () => {
          alive = false
        }
      }, [applyLoaded])

      React.useEffect(() => {
        if (!loadedRef.current || state.data === null || state.blocked) return undefined
        const serialized = JSON.stringify(state.data)
        if (serialized === savedRef.current) {
          setSaving(false)
          return undefined
        }
        if (timerRef.current !== null) clearTimeout(timerRef.current)
        const payload = state.data
        setSaving(true)
        timerRef.current = setTimeout(() => {
          timerRef.current = null
          pendingSavesRef.current += 1
          // Saves are serialized through one queue so an older payload can never
          // land after a newer one and leave the file stale.
          const run = queueRef.current
            .then(() => post('/save', { data: payload }))
            .then((data) => {
              savedRef.current = serialized
              setSavedAt(typeof data.savedAt === 'string' ? data.savedAt : new Date().toISOString())
              setSaveError(null)
            })
            .catch((error) => {
              setSaveError(String((error && error.message) || error))
            })
            .then(() => {
              pendingSavesRef.current = Math.max(0, pendingSavesRef.current - 1)
              if (pendingSavesRef.current === 0) setSaving(false)
            })
          queueRef.current = run
        }, 320)
        return () => {
          if (timerRef.current !== null) {
            clearTimeout(timerRef.current)
            timerRef.current = null
          }
        }
      }, [state.data, state.blocked])

      const update = React.useCallback((mutator) => {
        setState((previous) => {
          if (previous.data === null) return previous
          return { ...previous, data: mutator(previous.data) }
        })
      }, [])

      React.useEffect(() => {
        dataRef.current = state.data
      }, [state.data])

      const retry = React.useCallback(() => {
        setState((previous) => ({ ...previous, status: 'loading', error: null }))
        loadedRef.current = false
        post('/load', {}).then((data) => {
          applyLoaded(normalizeStore(data.data), null, typeof data.warning === 'string' ? data.warning : null)
        }).catch((error) => {
          const message = String((error && error.message) || error)
          applyLoaded(emptyStore(), /HTTP 40[45]/.test(message) ? 'host-missing' : message, null)
        })
      }, [applyLoaded])

      /** Let autosave overwrite a file the host reported as unreadable. */
      const allowSave = React.useCallback(() => {
        setState((previous) => ({ ...previous, blocked: false }))
        const payload = dataRef.current
        if (payload === null || payload === undefined) return
        const serialized = JSON.stringify(payload)
        // The click means "write this state to the file", so force one save even
        // when nothing changed since the blocked load.
        pendingSavesRef.current += 1
        setSaving(true)
        const run = queueRef.current
          .then(() => post('/save', { data: payload }))
          .then((data) => {
            savedRef.current = serialized
            setSavedAt(typeof data.savedAt === 'string' ? data.savedAt : new Date().toISOString())
            setSaveError(null)
          })
          .catch((error) => {
            setSaveError(String((error && error.message) || error))
          })
          .then(() => {
            pendingSavesRef.current = Math.max(0, pendingSavesRef.current - 1)
            if (pendingSavesRef.current === 0) setSaving(false)
          })
        queueRef.current = run
      }, [])

      const dirty = state.data !== null && savedRef.current !== null && JSON.stringify(state.data) !== savedRef.current

      return { ...state, update, retry, allowSave, dirty, savedAt, saveError, saving, flash, showFlash }
    }

    // --- icons ----------------------------------------------------------------

    function svgProps(size) {
      return {
        viewBox: '0 0 24 24',
        width: size === undefined ? 15 : size,
        height: size === undefined ? 15 : size,
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.7,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        'aria-hidden': 'true',
        focusable: 'false',
        style: { display: 'block', flex: 'none' },
      }
    }

    function IconCalendar(props) {
      return h('svg', svgProps(props && props.size), [
        h('rect', { key: 'r', x: 3, y: 4.5, width: 18, height: 16, rx: 2.5 }),
        h('path', { key: 'l1', d: 'M3 9.5h18' }),
        h('path', { key: 'l2', d: 'M8 2.8v3.4M16 2.8v3.4' }),
        h('path', { key: 'd', d: 'M8.5 14.2l2.2 2.2 4.4-4.6' }),
      ])
    }

    function IconList(props) {
      return h('svg', svgProps(props && props.size), [
        h('path', { key: 'a', d: 'M9 6h11M9 12h11M9 18h11' }),
        h('path', { key: 'b', d: 'M4.5 6h.01M4.5 12h.01M4.5 18h.01' }),
      ])
    }

    function IconClock(props) {
      return h('svg', svgProps(props && props.size), [
        h('circle', { key: 'c', cx: 12, cy: 12, r: 8.6 }),
        h('path', { key: 'h', d: 'M12 7.4v5.2l3.2 1.9' }),
      ])
    }

    function IconSpark(props) {
      return h('svg', svgProps(props && props.size), [
        h('path', { key: 'a', d: 'M12 3.2l1.9 4.9 4.9 1.9-4.9 1.9-1.9 4.9-1.9-4.9L5.2 10l4.9-1.9z' }),
        h('path', { key: 'b', d: 'M18.6 15.4l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z' }),
      ])
    }

    function IconPlus(props) {
      return h('svg', svgProps(props && props.size), [h('path', { key: 'p', d: 'M12 5.5v13M5.5 12h13' })])
    }

    function IconChevron(props) {
      const direction = props && props.dir ? props.dir : 'right'
      const rotation = direction === 'left' ? 180 : direction === 'up' ? 270 : direction === 'down' ? 90 : 0
      return h('svg', {
        ...svgProps(props && props.size),
        style: { display: 'block', flex: 'none', transform: `rotate(${rotation}deg)`, transition: 'transform .15s' },
      }, [h('path', { key: 'c', d: 'M9.5 5.5l6.5 6.5-6.5 6.5' })])
    }

    function IconClose(props) {
      return h('svg', svgProps(props && props.size), [h('path', { key: 'x', d: 'M6.5 6.5l11 11M17.5 6.5l-11 11' })])
    }

    function IconTrash(props) {
      return h('svg', svgProps(props && props.size), [
        h('path', { key: 'a', d: 'M4.5 6.8h15' }),
        h('path', { key: 'b', d: 'M9.4 6.8V4.9h5.2v1.9' }),
        h('path', { key: 'c', d: 'M6.4 6.8l.8 12.1a1.6 1.6 0 001.6 1.5h6.4a1.6 1.6 0 001.6-1.5l.8-12.1' }),
        h('path', { key: 'd', d: 'M10.2 10.4v6.4M13.8 10.4v6.4' }),
      ])
    }

    function IconCheck(props) {
      return h('svg', svgProps(props && props.size), [h('path', { key: 'c', d: 'M5 12.6l4.4 4.4L19 7.4' })])
    }

    function IconEdit(props) {
      return h('svg', svgProps(props && props.size), [
        h('path', { key: 'a', d: 'M14.4 5.2l4.4 4.4' }),
        h('path', { key: 'b', d: 'M4.5 19.5l1.2-5.1L15.9 4.2a1.7 1.7 0 012.4 0l1.5 1.5a1.7 1.7 0 010 2.4L9.6 18.3z' }),
      ])
    }

    function IconTarget(props) {
      return h('svg', svgProps(props && props.size), [
        h('circle', { key: 'a', cx: 12, cy: 12, r: 8.4 }),
        h('circle', { key: 'b', cx: 12, cy: 12, r: 3.4 }),
      ])
    }

    // --- small controls -------------------------------------------------------

    function Btn(props) {
      const variant = props.variant ? ` tb-btn-${props.variant}` : ''
      return h('button', {
        type: 'button',
        className: `tb-btn${variant}${props.className ? ` ${props.className}` : ''}`,
        title: props.title,
        'aria-label': props['aria-label'],
        disabled: props.disabled === true,
        onClick: props.onClick,
      }, props.icon === undefined ? null : props.icon, props.children)
    }

    function IconBtn(props) {
      return h('button', {
        type: 'button',
        className: 'tb-btn tb-btn-icon',
        title: props.title,
        'aria-label': props['aria-label'] || props.title,
        disabled: props.disabled === true,
        onClick: props.onClick,
      }, props.children)
    }

    function Field(props) {
      return h('label', { className: 'tb-field' }, [
        h('span', { key: 'l', className: 'tb-field-label' }, props.label),
        h(React.Fragment, { key: 'c' }, props.children),
      ])
    }

    function Modal(props) {
      const onClose = props.onClose
      React.useEffect(() => {
        const onKey = (event) => {
          if (event.key === 'Escape') onClose()
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
      }, [onClose])
      return h('div', {
        className: 'tb-overlay',
        onMouseDown: (event) => {
          if (event.target === event.currentTarget) onClose()
        },
      }, h('div', { className: 'tb-modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': props.title }, [
        h('div', { key: 'head', className: 'tb-modal-head' }, [
          h('h3', { key: 'title', className: 'tb-modal-title' }, props.title),
          h(IconBtn, { key: 'close', title: props.closeLabel || 'Close', onClick: onClose }, h(IconClose)),
        ]),
        h('div', { key: 'body', className: 'tb-modal-body' }, props.children),
        props.footer === undefined ? null : h('div', { key: 'foot', className: 'tb-modal-foot' }, props.footer),
      ]))
    }

    /** A form field set for project / daily / slot, shared by all dialogs. */
    function ProjectForm(props) {
      const t = props.t
      const value = props.value
      const patch = props.patch
      return h(React.Fragment, null, [
        h(Field, { key: 'title', label: t('fieldTitle') },
          h('input', {
            className: 'tb-input',
            type: 'text',
            value: value.title,
            maxLength: 200,
            autoFocus: true,
            onChange: (event) => patch({ title: event.target.value }),
          })),
        h('div', { key: 'dates', className: 'tb-field-row' }, [
          h(Field, { key: 'start', label: t('fieldStart') },
            h('input', {
              className: 'tb-input',
              type: 'date',
              value: value.start,
              onChange: (event) => patch({ start: event.target.value }),
            })),
          h(Field, { key: 'end', label: t('fieldEnd') },
            h('input', {
              className: 'tb-input',
              type: 'date',
              value: value.end,
              onChange: (event) => patch({ end: event.target.value }),
            })),
        ]),
        h(Field, { key: 'color', label: t('fieldColor') }, h('div', { className: 'tb-swatches' },
          PALETTE.map((color) => h('button', {
            key: color,
            type: 'button',
            className: 'tb-swatch',
            'aria-label': color,
            'data-on': value.color === color ? '1' : undefined,
            style: { background: color },
            onClick: () => patch({ color }),
          })))),
        h(Field, { key: 'note', label: t('fieldNote') },
          h('textarea', {
            className: 'tb-textarea',
            rows: 2,
            value: value.note,
            maxLength: 500,
            onChange: (event) => patch({ note: event.target.value }),
          })),
      ])
    }

    function SlotForm(props) {
      const t = props.t
      const value = props.value
      const patch = props.patch
      return h(React.Fragment, null, [
        h(Field, { key: 'title', label: t('fieldTitle') },
          h('input', {
            className: 'tb-input',
            type: 'text',
            value: value.title,
            maxLength: 200,
            autoFocus: true,
            onChange: (event) => patch({ title: event.target.value }),
          })),
        h(Field, { key: 'date', label: t('fieldDate') },
          h('input', {
            className: 'tb-input',
            type: 'date',
            value: value.date,
            onChange: (event) => patch({ date: event.target.value }),
          })),
        h('div', { key: 'times', className: 'tb-field-row' }, [
          h(Field, { key: 'start', label: t('fieldStartTime') },
            h('input', {
              className: 'tb-input',
              type: 'time',
              step: 300,
              value: value.startTime,
              onChange: (event) => patch({ startTime: event.target.value }),
            })),
          h(Field, { key: 'end', label: t('fieldEndTime') },
            h('input', {
              className: 'tb-input',
              type: 'time',
              step: 300,
              value: value.endTime,
              onChange: (event) => patch({ endTime: event.target.value }),
            })),
        ]),
        h(Field, { key: 'color', label: t('fieldColor') }, h('div', { className: 'tb-swatches' },
          PALETTE.map((color) => h('button', {
            key: color,
            type: 'button',
            className: 'tb-swatch',
            'aria-label': color,
            'data-on': value.color === color ? '1' : undefined,
            style: { background: color },
            onClick: () => patch({ color }),
          })))),
      ])
    }

    // --- dialog: long-term project -------------------------------------------

    function ProjectDialog(props) {
      const t = props.t
      const [value, setValue] = React.useState(props.initial)
      const [error, setError] = React.useState(null)
      const patch = React.useCallback((part) => {
        setValue((previous) => ({ ...previous, ...part }))
      }, [])
      const submit = () => {
        const title = String(value.title || '').trim()
        if (title === '') {
          setError(t('errorTitle'))
          return
        }
        if (!isDateKey(value.start) || !isDateKey(value.end)) {
          setError(t('errorDates'))
          return
        }
        if (daysBetween(value.start, value.end) < 0) {
          setError(t('errorDates'))
          return
        }
        props.onSave({
          id: value.id,
          title,
          start: value.start,
          end: value.end,
          color: isColor(value.color) ? value.color : PALETTE[0],
          note: typeof value.note === 'string' ? value.note.trim().slice(0, 500) : '',
        })
      }
      const footer = [
        props.mode === 'edit'
          ? h(Btn, { key: 'del', variant: 'danger', onClick: () => props.onDelete(value.id) }, t('delete'))
          : null,
        h('span', { key: 'spacer', style: { flex: 1 } }),
        h(Btn, { key: 'cancel', variant: 'quiet', onClick: props.onCancel }, t('cancel')),
        h(Btn, { key: 'save', variant: 'primary', onClick: submit }, t('save')),
      ].filter(Boolean)
      // Enter anywhere in the dialog saves; IME composition and textareas are
      // left alone.
      const handleKeyDown = (event) => {
        if (event.key !== 'Enter') return
        const composing = event.nativeEvent ? event.nativeEvent.isComposing : event.isComposing
        if (composing) return
        if (event.target && event.target.tagName === 'TEXTAREA') return
        if (event.target && event.target.closest && event.target.closest('button')) return
        event.preventDefault()
        submit()
      }
      return h(Modal, {
        title: props.mode === 'edit' ? t('dialogEditProject') : t('dialogAddProject'),
        closeLabel: t('close'),
        onClose: props.onCancel,
        footer,
      }, [
        error === null ? null : h('div', { key: 'err', className: 'tb-form-error', role: 'alert' }, error),
        h('div', { key: 'form-wrap', onKeyDown: handleKeyDown }, h(ProjectForm, { key: 'form', t, value, patch })),
      ])
    }

    // --- dialog: daily task ---------------------------------------------------

    function DailyDialog(props) {
      const t = props.t
      const [title, setTitle] = React.useState(props.initialTitle || '')
      const [error, setError] = React.useState(null)
      const submit = () => {
        const clean = title.trim()
        if (clean === '') {
          setError(t('errorTitle'))
          return
        }
        props.onSave(clean)
      }
      return h(Modal, {
        title: props.mode === 'edit' ? t('dailyEdit') : t('dialogAddDaily'),
        closeLabel: t('close'),
        onClose: props.onCancel,
        footer: [
          h('span', { key: 'spacer', style: { flex: 1 } }),
          h(Btn, { key: 'cancel', variant: 'quiet', onClick: props.onCancel }, t('cancel')),
          h(Btn, { key: 'save', variant: 'primary', onClick: submit }, t('save')),
        ],
      }, [
        error === null ? null : h('div', { key: 'err', className: 'tb-form-error', role: 'alert' }, error),
        h(Field, { key: 'title', label: t('fieldTitle') }, h('input', {
          className: 'tb-input',
          type: 'text',
          autoFocus: true,
          maxLength: 200,
          value: title,
          placeholder: t('dailyAddPlaceholder'),
          onChange: (event) => setTitle(event.target.value),
          onKeyDown: (event) => {
            if (event.key !== 'Enter') return
            const composing = event.nativeEvent ? event.nativeEvent.isComposing : event.isComposing
            if (composing) return
            event.preventDefault()
            submit()
          },
        })),
      ])
    }

    // --- dialog: timed task ---------------------------------------------------

    function SlotDialog(props) {
      const t = props.t
      const [value, setValue] = React.useState(props.initial)
      const [error, setError] = React.useState(null)
      const patch = React.useCallback((part) => {
        setValue((previous) => ({ ...previous, ...part }))
      }, [])
      const submit = () => {
        const title = String(value.title || '').trim()
        if (title === '') {
          setError(t('errorTitle'))
          return
        }
        const start = minutesFromText(value.startTime)
        const end = minutesFromText(value.endTime)
        if (start === null || end === null || end <= start) {
          setError(t('errorTime'))
          return
        }
        if (!isDateKey(value.date)) {
          setError(t('errorDates'))
          return
        }
        props.onSave({
          id: value.id,
          title,
          date: value.date,
          start,
          end,
          color: isColor(value.color) ? value.color : PALETTE[0],
        })
      }
      const footer = [
        props.mode === 'edit'
          ? h(Btn, {
            key: 'del',
            variant: 'danger',
            onClick: () => props.onDelete(isDateKey(value.originDate) ? value.originDate : value.date, value.id),
          }, t('delete'))
          : null,
        h('span', { key: 'spacer', style: { flex: 1 } }),
        h(Btn, { key: 'cancel', variant: 'quiet', onClick: props.onCancel }, t('cancel')),
        h(Btn, { key: 'save', variant: 'primary', onClick: submit }, t('save')),
      ].filter(Boolean)
      // Pressing Enter while typing saves right away; IME composition stays safe.
      const handleKeyDown = (event) => {
        if (event.key !== 'Enter') return
        const composing = event.nativeEvent ? event.nativeEvent.isComposing : event.isComposing
        if (composing) return
        if (event.target && event.target.tagName === 'TEXTAREA') return
        if (event.target && event.target.closest && event.target.closest('button')) return
        event.preventDefault()
        submit()
      }
      return h(Modal, {
        title: props.mode === 'edit' ? t('dialogEditSlot') : t('dialogAddSlot'),
        closeLabel: t('close'),
        onClose: props.onCancel,
        footer,
      }, [
        error === null ? null : h('div', { key: 'err', className: 'tb-form-error', role: 'alert' }, error),
        h('div', { key: 'form-wrap', onKeyDown: handleKeyDown }, h(SlotForm, { key: 'form', t, value, patch })),
      ])
    }

    // --- dialog: weekly recurring task ----------------------------------------

    function WeeklyDialog(props) {
      const t = props.t
      const [value, setValue] = React.useState(props.initial)
      const [error, setError] = React.useState(null)
      const patch = React.useCallback((part) => {
        setValue((previous) => ({ ...previous, ...part }))
      }, [])
      const toggleWeekday = (weekday) => {
        setValue((previous) => {
          const weekdays = Array.isArray(previous.weekdays) ? previous.weekdays : []
          const has = weekdays.includes(weekday)
          return {
            ...previous,
            weekdays: has
              ? weekdays.filter((item) => item !== weekday)
              : weekdays.concat([weekday]).sort((left, right) => left - right),
          }
        })
      }
      const submit = () => {
        const title = String(value.title || '').trim()
        if (title === '') {
          setError(t('errorTitle'))
          return
        }
        if (!isDateKey(value.startDate)) {
          setError(t('errorDates'))
          return
        }
        const mode = value.mode === 'interval' ? 'interval' : 'weekly'
        const weeks = Math.round(Number(value.weeks))
        if (!Number.isInteger(weeks) || weeks < 1 || weeks > 52) {
          setError(t('errorWeeks'))
          return
        }
        const weekdays = Array.isArray(value.weekdays)
          ? value.weekdays.slice().sort((left, right) => left - right)
          : []
        if (mode === 'weekly' && weekdays.length === 0) {
          setError(t('errorWeekdays'))
          return
        }
        const intervalDays = Math.round(Number(value.intervalDays) || 2)
        if (mode === 'interval' && (!Number.isInteger(intervalDays) || intervalDays < 1 || intervalDays > 365)) {
          setError(t('errorIntervalDays'))
          return
        }
        props.onSave({
          id: value.id,
          title,
          color: isColor(value.color) ? value.color : PALETTE[2],
          mode,
          startDate: value.startDate,
          weekdays,
          intervalDays: clamp(intervalDays, 1, 365),
          weeks,
        })
      }
      const footer = [
        props.mode === 'edit' ? h(Btn, { key: 'del', variant: 'danger', onClick: () => props.onDelete(value.id) }, t('delete')) : null,
        h('span', { key: 'spacer', style: { flex: 1 } }),
        h(Btn, { key: 'cancel', variant: 'quiet', onClick: props.onCancel }, t('cancel')),
        h(Btn, { key: 'save', variant: 'primary', onClick: submit }, t('save')),
      ].filter(Boolean)
      const handleKeyDown = (event) => {
        if (event.key !== 'Enter') return
        const composing = event.nativeEvent ? event.nativeEvent.isComposing : event.isComposing
        if (composing) return
        if (event.target && event.target.tagName === 'TEXTAREA') return
        if (event.target && event.target.closest && event.target.closest('button')) return
        event.preventDefault()
        submit()
      }
      const weekStart = startOfWeek(isDateKey(value.startDate) ? value.startDate : todayKey())
      const weekdayButtons = [1, 2, 3, 4, 5, 6, 7].map((weekday) => {
        const active = Array.isArray(value.weekdays) && value.weekdays.includes(weekday)
        const label = formatWeekday(addDays(weekStart, weekday - 1))
        return h('button', {
          key: weekday,
          type: 'button',
          className: 'tb-weekday',
          'data-active': active ? '1' : undefined,
          'aria-pressed': active ? 'true' : 'false',
          'aria-label': label,
          onClick: () => toggleWeekday(weekday),
        }, label)
      })
      const preview = recurringDates({
        mode: value.mode === 'interval' ? 'interval' : 'weekly',
        startDate: value.startDate,
        weekdays: Array.isArray(value.weekdays) ? value.weekdays : [],
        intervalDays: Number(value.intervalDays) || 2,
        weeks: Number(value.weeks),
      })
      return h(Modal, {
        title: props.mode === 'edit' ? t('dialogEditWeekly') : t('dialogAddWeekly'),
        closeLabel: t('close'),
        onClose: props.onCancel,
        footer,
      }, [
        error === null ? null : h('div', { key: 'err', className: 'tb-form-error', role: 'alert' }, error),
        h('div', { key: 'form-wrap', onKeyDown: handleKeyDown }, [
          h(Field, { key: 'title', label: t('fieldTitle') },
            h('input', {
              className: 'tb-input',
              type: 'text',
              value: value.title,
              maxLength: 200,
              autoFocus: true,
              onChange: (event) => patch({ title: event.target.value }),
            })),
          h('div', { key: 'mode', className: 'tb-weekdays' }, [
            h('button', {
              key: 'weekly',
              type: 'button',
              className: 'tb-weekday',
              'data-active': value.mode === 'interval' ? undefined : '1',
              onClick: () => setValue((previous) => ({
                ...previous,
                mode: 'weekly',
                weekdays: Array.isArray(previous.weekdays) && previous.weekdays.length > 0
                  ? previous.weekdays
                  : [weekdayIndex(isDateKey(previous.startDate) ? previous.startDate : todayKey()) + 1],
              })),
            }, t('modeWeekly')),
            h('button', {
              key: 'interval',
              type: 'button',
              className: 'tb-weekday',
              'data-active': value.mode === 'interval' ? '1' : undefined,
              onClick: () => patch({ mode: 'interval' }),
            }, t('modeInterval')),
          ]),
          h('div', { key: 'row', className: 'tb-field-row' }, [
            h(Field, { key: 'start', label: t('fieldStart') },
              h('input', {
                className: 'tb-input',
                type: 'date',
                value: value.startDate,
                onChange: (event) => patch({ startDate: event.target.value }),
              })),
            h(Field, { key: 'weeks', label: t('fieldWeeks') },
              h('input', {
                className: 'tb-input',
                type: 'number',
                min: 1,
                max: 52,
                step: 1,
                value: value.weeks,
                onChange: (event) => patch({ weeks: event.target.value }),
              })),
          ]),
          value.mode === 'interval'
            ? h(Field, { key: 'interval', label: t('fieldIntervalDays') },
              h('input', {
                className: 'tb-input',
                type: 'number',
                min: 1,
                max: 365,
                step: 1,
                value: value.intervalDays,
                onChange: (event) => patch({ intervalDays: event.target.value }),
              }))
            : h(Field, { key: 'weekdays', label: t('fieldWeekdays') },
              h('div', { key: 'chips', className: 'tb-weekdays' }, weekdayButtons)),
          h('div', { key: 'preview', className: 'tb-hint' }, preview.length === 0
            ? (value.mode === 'interval' ? t('errorIntervalDays') : t('errorWeekdays'))
            : t('weeklyOccurrences', preview.length)),
          h(Field, { key: 'color', label: t('fieldColor') }, h('div', { className: 'tb-swatches' },
            PALETTE.map((color) => h('button', {
              key: color,
              type: 'button',
              className: 'tb-swatch',
              'aria-label': color,
              'data-on': value.color === color ? '1' : undefined,
              style: { background: color },
              onClick: () => patch({ color }),
            })))),
        ]),
      ])
    }

    // --- AI extraction bar ----------------------------------------------------

    function kindLabel(t, kind) {
      if (kind === 'project') return t('kindProject')
      if (kind === 'daily') return t('kindDaily')
      return t('kindSlot')
    }

    function defaultTimeRange(startText) {
      const start = minutesFromText(startText)
      if (start === null) return { startTime: '09:00', endTime: '10:00' }
      const end = clamp(start + 60, 0, 1439)
      return { startTime: minutesText(start), endTime: minutesText(end) }
    }

    function draftFromTask(rawTask, index, today) {
      const task = rawTask && typeof rawTask === 'object' ? rawTask : {}
      const kind = task.kind === 'daily' || task.kind === 'slot' ? task.kind : 'project'
      const title = typeof task.title === 'string' ? task.title : ''
      const color = isColor(task.color) ? task.color : PALETTE[index % PALETTE.length]
      const draft = {
        key: uid('e'),
        include: true,
        kind,
        title,
        note: typeof task.note === 'string' ? task.note : '',
        subtasks: Array.isArray(task.subtasks)
          ? task.subtasks
            .map((sub) => {
              const subTitle = typeof sub === 'string'
                ? sub.trim()
                : (sub && typeof sub.title === 'string' ? sub.title.trim() : '')
              if (subTitle === '') return null
              return { title: subTitle.slice(0, 200), done: Boolean(sub && typeof sub === 'object' && sub.done === true) }
            })
            .filter(Boolean)
            .slice(0, 50)
          : [],
        startDate: today,
        endDate: today,
        date: today,
        startTime: '09:00',
        endTime: '10:00',
        color,
        invalid: false,
      }
      if (kind === 'project') {
        draft.startDate = isDateKey(task.startDate) ? task.startDate : today
        draft.endDate = isDateKey(task.endDate) && daysBetween(draft.startDate, task.endDate) >= 0 ? task.endDate : draft.startDate
      }
      if (kind === 'slot') {
        draft.date = isDateKey(task.date) ? task.date : today
        const times = defaultTimeRange(task.startTime)
        draft.startTime = minutesFromText(task.startTime) === null ? times.startTime : task.startTime
        draft.endTime = minutesFromText(task.endTime) === null ? times.endTime : task.endTime
        if (minutesFromText(draft.endTime) <= minutesFromText(draft.startTime)) draft.endTime = times.endTime
      }
      return draft
    }

    function ExtractionBar(props) {
      const t = props.t
      const [text, setText] = React.useState('')
      const [busy, setBusy] = React.useState(false)
      const [state, setState] = React.useState({ status: 'idle', items: [], source: null, warning: null, error: null })
      const runExtract = () => {
        const clean = text.trim()
        if (busy || clean === '') return
        setBusy(true)
        setState({ status: 'idle', items: [], source: null, warning: null, error: null })
        post('/extract', { text: clean, today: props.today }).then((data) => {
          const tasks = Array.isArray(data.tasks) ? data.tasks : []
          const items = tasks.slice(0, 20).map((task, index) => draftFromTask(task, index, props.today))
          if (items.length === 0) {
            setState({ status: 'empty', items: [], source: data.source || null, warning: data.warning || null, error: null })
            return
          }
          setState({ status: 'ready', items, source: data.source || null, warning: data.warning || null, error: null })
        }).catch((error) => {
          const message = String((error && error.message) || error)
          setState({
            status: 'error',
            items: [],
            source: null,
            warning: null,
            error: /HTTP 40[45]/.test(message) ? t('hostMissing') : message,
          })
        }).then(() => {
          setBusy(false)
        })
      }
      const patchItem = React.useCallback((key, part) => {
        setState((previous) => ({
          ...previous,
          items: previous.items.map((item) => (item.key === key ? { ...item, ...part } : item)),
        }))
      }, [])
      const removeItem = React.useCallback((key) => {
        setState((previous) => ({ ...previous, items: previous.items.filter((item) => item.key !== key) }))
      }, [])
      const discard = () => {
        setState({ status: 'idle', items: [], source: null, warning: null, error: null })
        setText('')
      }
      const confirm = () => {
        const included = state.items.filter((item) => item.include)
        if (included.length === 0) {
          discard()
          return
        }
        let invalid = false
        const marked = state.items.map((item) => {
          let bad = false
          if (item.include) {
            if (item.title.trim() === '') bad = true
            if (item.kind === 'project' && (!isDateKey(item.startDate) || !isDateKey(item.endDate) || daysBetween(item.startDate, item.endDate) < 0)) bad = true
            if (item.kind === 'slot') {
              if (!isDateKey(item.date)) bad = true
              const start = minutesFromText(item.startTime)
              const end = minutesFromText(item.endTime)
              if (start === null || end === null || end <= start) bad = true
            }
          }
          if (bad) invalid = true
          return { ...item, invalid: bad }
        })
        if (invalid) {
          setState((previous) => ({ ...previous, items: marked, error: t('formInvalid') }))
          return
        }
        const count = props.onApply(included)
        discard()
        props.onToast(t('extractAdded', count))
      }
      const renderRow = (item) => {
        const fields = []
        if (item.kind === 'project') {
          fields.push(h('input', {
            key: 'start',
            className: 'tb-input tb-input-date',
            type: 'date',
            value: item.startDate,
            'aria-label': t('fieldStart'),
            onChange: (event) => patchItem(item.key, { startDate: event.target.value }),
          }))
          fields.push(h('span', { key: 'arrow', className: 'tb-hint' }, '→'))
          fields.push(h('input', {
            key: 'end',
            className: 'tb-input tb-input-date',
            type: 'date',
            value: item.endDate,
            'aria-label': t('fieldEnd'),
            onChange: (event) => patchItem(item.key, { endDate: event.target.value }),
          }))
        }
        if (item.kind === 'slot') {
          fields.push(h('input', {
            key: 'date',
            className: 'tb-input tb-input-date',
            type: 'date',
            value: item.date,
            'aria-label': t('fieldDate'),
            onChange: (event) => patchItem(item.key, { date: event.target.value }),
          }))
          fields.push(h('input', {
            key: 'start',
            className: 'tb-input tb-input-time',
            type: 'time',
            step: 300,
            value: item.startTime,
            'aria-label': t('fieldStartTime'),
            onChange: (event) => patchItem(item.key, { startTime: event.target.value }),
          }))
          fields.push(h('span', { key: 'arrow', className: 'tb-hint' }, '→'))
          fields.push(h('input', {
            key: 'end',
            className: 'tb-input tb-input-time',
            type: 'time',
            step: 300,
            value: item.endTime,
            'aria-label': t('fieldEndTime'),
            onChange: (event) => patchItem(item.key, { endTime: event.target.value }),
          }))
        }
        if (item.kind === 'project' || item.kind === 'slot') {
          fields.push(h('input', {
            key: 'color',
            className: 'tb-color',
            type: 'color',
            value: item.color,
            'aria-label': t('fieldColor'),
            onChange: (event) => patchItem(item.key, { color: event.target.value }),
          }))
        }
        return h('div', {
          key: item.key,
          className: 'tb-erow',
          'data-invalid': item.invalid ? '1' : undefined,
        }, [
          h('input', {
            key: 'include',
            className: 'tb-include',
            type: 'checkbox',
            checked: item.include,
            'aria-label': t('save'),
            onChange: (event) => patchItem(item.key, { include: event.target.checked }),
          }),
          h('select', {
            key: 'kind',
            className: 'tb-select',
            value: item.kind,
            'aria-label': t('extractTitle'),
            onChange: (event) => patchItem(item.key, { kind: event.target.value }),
          }, [
            h('option', { key: 'project', value: 'project' }, t('kindProject')),
            h('option', { key: 'daily', value: 'daily' }, t('kindDaily')),
            h('option', { key: 'slot', value: 'slot' }, t('kindSlot')),
          ]),
          h('div', { key: 'main', className: 'tb-erow-main' }, [
            h('input', {
              key: 'title',
              className: 'tb-input tb-input-title',
              type: 'text',
              value: item.title,
              maxLength: 200,
              'aria-label': t('fieldTitle'),
              onChange: (event) => patchItem(item.key, { title: event.target.value }),
            }),
            Array.isArray(item.subtasks) && item.subtasks.length > 0
              ? h('span', { key: 'subs', className: 'tb-hint' }, t('subtaskCount', item.subtasks.length))
              : null,
          ]),
          h('div', { key: 'fields', className: 'tb-erow-fields' }, fields),
          h(IconBtn, { key: 'remove', title: t('delete'), onClick: () => removeItem(item.key) }, h(IconClose)),
        ])
      }
      const result = state.status === 'ready'
        ? h('div', { className: 'tb-extract-result' }, [
          h('div', { key: 'head', className: 'tb-extract-result-head' }, [
            h('span', { key: 'text' }, t('extractFound', state.items.length)),
            state.source === 'fallback'
              ? h('span', { key: 'warn', className: 'tb-hint-warn' }, state.warning !== null ? state.warning : t('extractFallback'))
              : state.warning !== null
                ? h('span', { key: 'warn', className: 'tb-hint-warn' }, state.warning)
                : null,
          ]),
          h('div', { key: 'rows', style: { display: 'flex', flexDirection: 'column', gap: 8 } }, state.items.map(renderRow)),
          h('div', { key: 'actions', className: 'tb-extract-actions' }, [
            h(Btn, { key: 'ok', variant: 'primary', icon: h(IconCheck), onClick: confirm }, t('extractConfirm')),
            h(Btn, { key: 'no', variant: 'quiet', onClick: discard }, t('extractCancel')),
          ]),
        ])
        : null
      return h('div', { className: 'tb-extract' }, [
        h('div', { key: 'head', className: 'tb-extract-head' }, [
          h('span', { key: 'label', className: 'tb-extract-label' }, [h(IconSpark, { key: 'i' }), h('span', { key: 't' }, t('extractTitle'))]),
          h('span', { key: 'hint', className: 'tb-hint' }, t('extractHint')),
        ]),
        h('textarea', {
          key: 'input',
          className: 'tb-textarea',
          rows: 2,
          maxLength: 4000,
          value: text,
          placeholder: t('extractPlaceholder'),
          onChange: (event) => setText(event.target.value),
          onKeyDown: (event) => {
            if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) runExtract()
          },
        }),
        h('div', { key: 'actions', className: 'tb-extract-actions' }, [
          h(Btn, { key: 'run', variant: 'primary', disabled: busy || text.trim() === '', onClick: runExtract, icon: h(IconSpark) }, busy ? t('extractBusy') : t('extractRun')),
          h(Btn, { key: 'clear', variant: 'quiet', disabled: busy, onClick: () => { setText(''); setState({ status: 'idle', items: [], source: null, warning: null, error: null }) } }, t('extractClear')),
          busy ? h('span', { key: 'hint', className: 'tb-hint' }, t('extractHint')) : null,
        ]),
        state.status === 'empty' ? h('div', { key: 'empty', className: 'tb-hint' }, [
          t('extractEmpty'),
          state.warning !== null ? ` ${state.warning}` : '',
        ]) : null,
        state.error !== null && state.status !== 'ready' ? h('div', { key: 'error', className: 'tb-hint-error', role: 'alert' }, state.error) : null,
        state.status === 'ready' && state.error !== null ? h('div', { key: 'rowerr', className: 'tb-hint-error', role: 'alert' }, state.error) : null,
        result,
        h('div', { key: 'add', className: 'tb-addrow' }, [
          h(Btn, { key: 'p', icon: h(IconCalendar), onClick: () => props.onOpenAdd('project') }, t('addProject')),
          h(Btn, { key: 'd', icon: h(IconTarget), onClick: () => props.onOpenAdd('daily') }, t('addDaily')),
          h(Btn, { key: 's', icon: h(IconClock), onClick: () => props.onOpenAdd('slot') }, t('addSlot')),
          h(Btn, { key: 'w', icon: h(IconList), onClick: () => props.onOpenAdd('weekly') }, t('addWeekly')),
        ]),
      ])
    }

    // --- calendar -------------------------------------------------------------

    const LANE_H = 17

    function MonthWeeks(props) {
      const t = props.t
      const week = props.week
      const weekIndex = props.weekIndex
      const data = props.data
      const today = props.today
      const selectedDate = props.selectedDate
      const selectedId = props.selectedId
      const setSelectedId = props.setSelectedId
      const selectedKind = props.selectedKind
      const selectedSlotDate = props.selectedSlotDate
      const selectProject = props.selectProject
      const selectSlot = props.selectSlot
      const onEditSlot = props.onEditSlot
      const editingId = props.editingId
      const setEditingId = props.setEditingId
      const beginDrag = props.beginDrag
      const onOpenDay = props.onOpenDay
      const expanded = props.expanded
      const onToggleExpanded = props.onToggleExpanded

      const weekStart = week[0]
      const weekEnd = week[6]
      const segments = []
      for (const project of data.projects) {
        if (project.end < weekStart || project.start > weekEnd) continue
        segments.push({
          type: 'project',
          project,
          startOffset: clamp(daysBetween(weekStart, project.start), 0, 6),
          endOffset: clamp(daysBetween(weekStart, project.end), 0, 6),
        })
      }
      // Timed day tasks render on their own date as single-column bars. They pack
      // after long-term projects (priority: project > day task) and follow the
      // same five-lane cap with the expand button. Recurring daily tasks never
      // appear on the calendar.
      for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
        const dateKey = week[dayIndex]
        for (const slot of slotsOn(data, dateKey)) {
          segments.push({
            type: 'slot',
            slot,
            dateKey,
            startOffset: dayIndex,
            endOffset: dayIndex,
          })
        }
      }
      segments.sort((a, b) => {
        if (a.type !== b.type) return a.type === 'project' ? -1 : 1
        return a.startOffset - b.startOffset || a.endOffset - b.endOffset
      })
      const laneEnds = []
      for (const segment of segments) {
        let lane = -1
        for (let index = 0; index < laneEnds.length; index += 1) {
          if (laneEnds[index] < segment.startOffset) {
            lane = index
            break
          }
        }
        if (lane === -1) {
          lane = laneEnds.length
          laneEnds.push(segment.endOffset)
        } else {
          laneEnds[lane] = segment.endOffset
        }
        segment.lane = lane
      }
      const laneCount = laneEnds.length
      const collapsed = !expanded && laneCount > MAX_WEEK_LANES
      const visibleLanes = collapsed ? MAX_WEEK_LANES : laneCount
      const hiddenCount = collapsed ? segments.filter((segment) => segment.lane >= MAX_WEEK_LANES).length : 0

      const dayCells = week.map((key, index) => {
        const date = parseKey(key)
        const isToday = key === today
        const isSelected = key === selectedDate
        const outside = date.getDate() === 1
        const daySlotCount = slotsOn(data, key).length
        return h('button', {
          key,
          type: 'button',
          className: 'tb-day',
          'data-today': isToday ? '1' : undefined,
          'data-selected': isSelected ? '1' : undefined,
          'data-outside': outside ? '1' : undefined,
          title: `${key} · ${formatWeekday(key)}${daySlotCount > 0 ? ` · ${daySlotCount}` : ''}`,
          onClick: () => props.setSelectedDate(key),
          onDoubleClick: () => {
            if (props.hasActive) props.onExitActive()
            else onOpenDay(key)
          },
        }, [
          h('span', { key: 'num', className: 'tb-day-num' }, String(date.getDate())),
          outside ? h('span', { key: 'month', className: 'tb-day-month' }, monthShort(key)) : null,
          isToday ? h('span', { key: 'dot', className: 'tb-day-today-mark', 'aria-hidden': 'true' }) : null,
          daySlotCount > 0 ? h('span', { key: 'count', className: 'tb-day-count' }, `•${daySlotCount}`) : null,
        ])
      })

      const bars = []
      for (const segment of segments) {
        if (collapsed && segment.lane >= MAX_WEEK_LANES) continue
        if (segment.type === 'slot') {
          const slot = segment.slot
          const dateKey = segment.dateKey
          const slotSelected = selectedKind === 'slot' && selectedSlotDate === dateKey && selectedId === slot.id
          const slotSubtaskTotal = Array.isArray(slot.subtasks) ? slot.subtasks.length : 0
          bars.push(h('div', {
            key: `slot-${dateKey}-${slot.id}`,
            className: 'tb-bar tb-bar-slot',
            'data-kind': 'slot',
            'data-selected': slotSelected ? '1' : undefined,
            role: 'button',
            tabIndex: 0,
            title: `${minutesText(slot.start)}–${minutesText(slot.end)} ${slot.title} · ${dateKey}${slotSubtaskTotal > 0 ? ` · ${t('subtaskCount', slotSubtaskTotal)}` : ''}`,
            style: {
              left: `calc(${(segment.startOffset / 7) * 100}% + 1px)`,
              width: `calc(${(1 / 7) * 100}% - 2px)`,
              top: `${segment.lane * LANE_H}px`,
              background: slot.color,
              color: '#FFFFFF',
              borderRadius: '8px',
            },
            onClick: (event) => {
              event.stopPropagation()
              setEditingId(null)
              selectSlot(dateKey, slot.id)
            },
            onDoubleClick: (event) => {
              event.stopPropagation()
              onEditSlot(dateKey, slot)
            },
          }, [
            h('span', { key: 'title', className: 'tb-bar-title' }, `${minutesText(slot.start)} ${slot.title}`),
            slotSubtaskTotal > 0 ? h('span', { key: 'subs', className: 'tb-bar-sub' }, String(slotSubtaskTotal)) : null,
          ]))
          continue
        }
        const project = segment.project
        const projectSelected = selectedKind === 'project' && selectedId === project.id
        const projectSubtaskTotal = Array.isArray(project.subtasks) ? project.subtasks.length : 0
        const continuesLeft = project.start < weekStart
        const continuesRight = project.end > weekEnd
        const editing = editingId === project.id
        // Elapsed part of this segment: every day before today, clipped to the
        // columns this bar actually covers in this week.
        const spanColumns = segment.endOffset - segment.startOffset + 1
        const todayIndex = daysBetween(weekStart, today)
        const pastEnd = clamp(
          Math.min(segment.endOffset + 1, Math.max(0, Math.min(7, todayIndex))),
          segment.startOffset,
          segment.endOffset + 1,
        )
        const pastColumns = Math.max(0, pastEnd - segment.startOffset)
        // The elapsed band's own head and tail get round caps where they really
        // are visible: the project's start, and yesterday (or the project's end
        // when it already finished). Fully elapsed weeks in between stay square so
        // the band reads as one continuous strip, not a row of pills.
        const elapsedTail = addDays(today, -1)
        const tailKey = project.end < elapsedTail ? project.end : elapsedTail
        const headRounded = pastColumns > 0 && project.start >= weekStart
        const tailRounded = pastColumns > 0 && tailKey >= weekStart && tailKey <= weekEnd
        bars.push(h('div', {
          key: project.id,
          className: 'tb-bar',
          'data-kind': 'project',
          'data-selected': projectSelected ? '1' : undefined,
          'data-editing': editing ? '1' : undefined,
          role: 'button',
          tabIndex: 0,
          title: `${project.title} · ${project.start} → ${project.end}${projectSubtaskTotal > 0 ? ` · ${t('subtaskCount', projectSubtaskTotal)}` : ''}`,
          style: {
            left: `calc(${(segment.startOffset / 7) * 100}% + 1px)`,
            width: `calc(${((segment.endOffset - segment.startOffset + 1) / 7) * 100}% - 2px)`,
            top: `${segment.lane * LANE_H}px`,
            background: project.color,
            color: '#FFFFFF',
            borderRadius: `${continuesLeft ? 0 : 8}px ${continuesRight ? 0 : 8}px ${continuesRight ? 0 : 8}px ${continuesLeft ? 0 : 8}px`,
          },
          onClick: (event) => {
            event.stopPropagation()
            if (editingId !== null && editingId !== project.id) setEditingId(null)
            selectProject(project.id)
          },
          onDoubleClick: (event) => {
            event.stopPropagation()
            selectProject(project.id)
            setEditingId(editing ? null : project.id)
          },
          onKeyDown: (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              selectProject(project.id)
            }
          },
          onPointerDown: (event) => {
            if (editingId !== project.id) return
            beginDrag(event, project, 'move')
          },
        }, [
          pastColumns > 0 ? h('span', {
            key: 'past',
            className: 'tb-bar-past',
            style: {
              width: `${(pastColumns / spanColumns) * 100}%`,
              borderRadius: `${headRounded ? 8 : 0}px ${tailRounded ? 8 : 0}px ${tailRounded ? 8 : 0}px ${headRounded ? 8 : 0}px`,
              // Bold outline: the band's long edges are always stroked; end caps
              // are stroked only where the elapsed band really starts/ends, so a
              // middle week does not get a fake vertical seam.
              borderLeft: headRounded ? '2px solid rgba(255,255,255,.72)' : '0',
              borderRight: tailRounded ? '2px solid rgba(255,255,255,.72)' : '0',
            },
            'aria-hidden': 'true',
          }) : null,
          h('span', { key: 'title', className: 'tb-bar-title' }, project.title),
          projectSubtaskTotal > 0 ? h('span', { key: 'subs', className: 'tb-bar-sub' }, String(projectSubtaskTotal)) : null,
          editing ? h('span', {
            key: 'start',
            className: 'tb-bar-handle tb-bar-handle-start',
            'aria-hidden': 'true',
            onPointerDown: (event) => beginDrag(event, project, 'start'),
          }) : null,
          editing ? h('span', {
            key: 'end',
            className: 'tb-bar-handle tb-bar-handle-end',
            'aria-hidden': 'true',
            onPointerDown: (event) => beginDrag(event, project, 'end'),
          }) : null,
        ]))
      }

      const row = h('div', {
        className: 'tb-week',
        'data-even': props.even ? '1' : undefined,
        'data-month-start': props.monthStart ? '1' : undefined,
      }, [
        h('div', { key: 'days', className: 'tb-week-days' }, dayCells),
        h('div', { key: 'lanes', className: 'tb-lanes', style: { height: `${visibleLanes * LANE_H}px` } }, bars),
        hiddenCount > 0 ? h('button', {
          key: 'more',
          type: 'button',
          className: 'tb-more',
          onClick: onToggleExpanded,
        }, t('moreTasks', hiddenCount)) : null,
        !collapsed && laneCount > MAX_WEEK_LANES ? h('button', {
          key: 'less',
          type: 'button',
          className: 'tb-more',
          onClick: onToggleExpanded,
        }, t('lessTasks')) : null,
      ])
      return row
    }

    function CalendarSection(props) {
      const t = props.t
      const data = props.data
      const update = props.update
      const today = props.today
      const selectedDate = props.selectedDate
      const setSelectedDate = props.setSelectedDate
      const onOpenDay = props.onOpenDay
      const onOpenHistory = props.onOpenHistory
      const onEditProject = props.onEditProject
      const onEditSlot = props.onEditSlot
      const showToast = props.showToast

      const [selectedId, setSelectedId] = React.useState(null)
      const [selectedKind, setSelectedKind] = React.useState('project')
      const [selectedSlotDate, setSelectedSlotDate] = React.useState(null)
      const [editingId, setEditingId] = React.useState(null)
      const [expandedWeeks, setExpandedWeeks] = React.useState(() => new Set())
      const [drag, setDrag] = React.useState(null)
      const dragRef = React.useRef(null)

      // One complete calendar month (all weeks that contain this month's days).
      const firstMonth = startOfMonth(props.cursor)
      const rangeStart = startOfWeek(firstMonth)
      const rangeEnd = addDays(startOfWeek(endOfMonth(firstMonth)), 6)
      const weeks = []
      let cursor = rangeStart
      while (daysBetween(cursor, rangeEnd) >= 0 && weeks.length < 6) {
        weeks.push(Array.from({ length: 7 }, (unused, index) => addDays(cursor, index)))
        cursor = addDays(cursor, 7)
      }

      React.useEffect(() => {
        if (drag === null) return undefined
        const move = (event) => {
          const current = dragRef.current
          if (current === null) return
          let delta = Math.round((event.clientX - current.startX) / current.dayWidth)
          if (current.mode === 'move') {
            // Keep at least part of the bar inside the rendered month range;
            // a task dragged completely off the grid would look deleted.
            const minDelta = daysBetween(current.origEnd, rangeStart)
            const maxDelta = daysBetween(current.origStart, rangeEnd)
            delta = minDelta > maxDelta ? 0 : clamp(delta, minDelta, maxDelta)
          } else if (current.mode === 'start') {
            delta = Math.min(delta, daysBetween(current.origStart, rangeEnd))
          } else {
            delta = Math.max(delta, daysBetween(current.origEnd, rangeStart))
          }
          if (delta === current.lastDelta) return
          current.lastDelta = delta
          if (current.mode === 'move') {
            update((store) => shiftProjectDays(store, current.id, delta))
            return
          }
          if (current.mode === 'start') {
            const next = daysBetween(addDays(current.origStart, delta), current.origEnd) < 0
              ? current.origEnd
              : addDays(current.origStart, delta)
            update((store) => patchProject(store, current.id, { start: next }))
            return
          }
          const next = daysBetween(current.origStart, addDays(current.origEnd, delta)) < 0
            ? current.origStart
            : addDays(current.origEnd, delta)
          update((store) => patchProject(store, current.id, { end: next }))
        }
        const finish = () => {
          dragRef.current = null
          setDrag(null)
        }
        window.addEventListener('pointermove', move)
        window.addEventListener('pointerup', finish)
        window.addEventListener('pointercancel', finish)
        return () => {
          window.removeEventListener('pointermove', move)
          window.removeEventListener('pointerup', finish)
          window.removeEventListener('pointercancel', finish)
        }
      }, [drag, update])

      React.useEffect(() => {
        if (selectedId === null && editingId === null) return undefined
        // Leave the selected / drag state on a double-click on any empty area of
        // the page (task lines, the action bar and dialogs keep their own
        // behavior), or on Escape.
        const exit = (event) => {
          const target = event.target
          if (target && target.closest) {
            if (target.closest('.tb-bar') || target.closest('.tb-modal') || target.closest('.tb-overlay')) return
          }
          setSelectedId(null)
          setSelectedKind('project')
          setSelectedSlotDate(null)
          setEditingId(null)
        }
        const onKey = (event) => {
          if (event.key === 'Escape') {
            setSelectedId(null)
            setSelectedKind('project')
            setSelectedSlotDate(null)
            setEditingId(null)
          }
        }
        window.addEventListener('dblclick', exit)
        window.addEventListener('keydown', onKey)
        return () => {
          window.removeEventListener('dblclick', exit)
          window.removeEventListener('keydown', onKey)
        }
      }, [selectedId, editingId])

      const beginDrag = React.useCallback((event, project, mode) => {
        if (typeof event.button === 'number' && event.button !== 0) return
        event.preventDefault()
        event.stopPropagation()
        const row = event.currentTarget && event.currentTarget.closest ? event.currentTarget.closest('.tb-week') : null
        const rect = row ? row.getBoundingClientRect() : null
        const dayWidth = rect && rect.width > 0 ? rect.width / 7 : 120
        const current = {
          id: project.id,
          mode,
          startX: event.clientX,
          origStart: project.start,
          origEnd: project.end,
          dayWidth,
          lastDelta: 0,
        }
        dragRef.current = current
        setDrag(current)
      }, [])

      const selectProject = React.useCallback((id) => {
        setSelectedKind('project')
        setSelectedId(id)
      }, [])
      const selectSlot = React.useCallback((dateKey, id) => {
        setSelectedKind('slot')
        setSelectedSlotDate(dateKey)
        setSelectedId(id)
      }, [])
      const selected = selectedKind === 'project'
        ? data.projects.find((project) => project.id === selectedId) || null
        : null
      const slotSelected = selectedKind === 'slot' && selectedSlotDate !== null
        ? slotsOn(data, selectedSlotDate).find((slot) => slot.id === selectedId) || null
        : null
      const isEditing = selected !== null && editingId === selected.id
      // Long-term task subtasks are scoped to the day they were added on, so the
      // read-only calendar list shows each entry with that date.
      const activeSubtasks = selected !== null && Array.isArray(selected.subtasks)
        ? selected.subtasks.slice().sort((left, right) => String(left.date || '').localeCompare(String(right.date || '')))
        : (slotSelected !== null && Array.isArray(slotSelected.subtasks) ? slotSelected.subtasks : [])
      const activeSubtaskLabel = (sub) => {
        const prefix = sub.date ? `[${formatDay(sub.date)}] ` : ''
        return `${sub.done ? '☑' : '☐'} ${prefix}${sub.title}`
      }
      /** Leave the selected/drag state entirely (double-click on empty space). */
      const clearActive = React.useCallback(() => {
        setSelectedId(null)
        setSelectedKind('project')
        setSelectedSlotDate(null)
        setEditingId(null)
      }, [])
      const actionBar = selected === null ? null : h('div', { className: 'tb-card-actions' }, [
        h('span', { key: 'info', className: 'tb-card-sub' }, `${t('projectSelected')}${selected.title} · ${selected.start} → ${selected.end}`),
        isEditing
          ? h(Btn, { key: 'done', variant: 'primary', onClick: () => setEditingId(null) }, t('projectDragDone'))
          : h(Btn, { key: 'drag', onClick: () => setEditingId(selected.id) }, t('projectDrag')),
        h(Btn, { key: 'edit', onClick: () => onEditProject(selected) }, t('projectEdit')),
        h(Btn, {
          key: 'delete',
          variant: 'danger',
          onClick: () => {
            if (typeof window !== 'undefined' && typeof window.confirm === 'function' && !window.confirm(t('confirmDelete'))) return
            update((store) => withoutProject(store, selected.id))
            clearActive()
            showToast(t('saved'))
          },
        }, t('projectDelete')),
        h(Btn, { key: 'clear', variant: 'quiet', onClick: clearActive }, t('projectCancel')),
      ])
      const slotActionBar = slotSelected === null ? null : h('div', { className: 'tb-card-actions' }, [
        h('span', { key: 'info', className: 'tb-card-sub' }, `${t('slotSelected')}${slotSelected.title} · ${selectedSlotDate} · ${minutesText(slotSelected.start)}–${minutesText(slotSelected.end)}`),
        h(Btn, { key: 'edit', onClick: () => onEditSlot(selectedSlotDate, slotSelected) }, t('projectEdit')),
        h(Btn, {
          key: 'delete',
          variant: 'danger',
          onClick: () => {
            if (typeof window !== 'undefined' && typeof window.confirm === 'function' && !window.confirm(t('confirmDelete'))) return
            update((store) => withoutSlot(store, selectedSlotDate, slotSelected.id))
            clearActive()
            showToast(t('saved'))
          },
        }, t('delete')),
        h(Btn, { key: 'clear', variant: 'quiet', onClick: clearActive }, t('projectCancel')),
      ])
      const activeBar = actionBar !== null ? actionBar : slotActionBar

      return h('section', { className: 'tb-card' }, [
        h('div', { key: 'head', className: 'tb-card-head' }, [
          h('span', { key: 'title', className: 'tb-card-title' }, [h(IconCalendar, { key: 'i' }), h('span', { key: 't' }, t('calendar'))]),
          h('span', { key: 'sub', className: 'tb-card-sub' }, t('calendarHint')),
          h('div', { key: 'nav', className: 'tb-card-actions' }, [
            h(Btn, { key: 'history', variant: 'quiet', onClick: () => onOpenHistory() }, t('historyEntry')),
            h('span', { key: 'label', className: 'tb-nav-label' }, monthText(firstMonth)),
            h(IconBtn, { key: 'prev', title: t('monthPrev'), onClick: () => props.setCursor(addMonths(firstMonth, -1)) }, h(IconChevron, { dir: 'left' })),
            h(Btn, { key: 'today', variant: 'quiet', onClick: () => props.setCursor(today) }, t('today')),
            h(IconBtn, { key: 'next', title: t('monthNext'), onClick: () => props.setCursor(addMonths(firstMonth, 1)) }, h(IconChevron, { dir: 'right' })),
          ]),
        ]),
        activeBar === null ? null : h('div', {
          key: 'selbar',
          style: {
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            flexWrap: 'wrap',
            padding: '6px 14px',
            borderBottom: '1px solid var(--dsw-alias-border-l1, rgba(128,128,128,.18))',
            background: 'var(--dsw-alias-bg-layer-2)',
          },
        }, activeBar),
        activeSubtasks.length === 0 ? null : h('div', {
          key: 'subsbar',
          style: {
            display: 'flex',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '6px 10px',
            padding: '5px 14px',
            borderBottom: '1px solid var(--dsw-alias-border-l1, rgba(128,128,128,.18))',
            fontSize: 12,
          },
        }, [
          h('span', { key: 'label', className: 'tb-hint' }, t('subtasksLabel')),
          ...activeSubtasks.map((sub) => h('span', {
            key: sub.id,
            className: 'tb-subitem',
            'data-done': sub.done ? '1' : undefined,
            title: sub.title,
          }, activeSubtaskLabel(sub))),
          h('span', { key: 'hint', className: 'tb-hint' }, t('subtasksEditHint')),
        ]),
        isEditing ? h('div', { key: 'draghint', className: 'tb-hint', style: { padding: '6px 14px 0' } }, t('dragModeHint')) : null,
        h('div', { key: 'cal', className: 'tb-cal' }, [
          h('div', { key: 'weekhead', className: 'tb-cal-weekhead' },
            [0, 1, 2, 3, 4, 5, 6].map((index) => h('span', { key: index }, formatWeekday(addDays(rangeStart, index))))),
          weeks.map((week, weekIndex) => h(MonthWeeks, {
            key: week[0],
            t,
            week,
            weekIndex,
            data,
            today,
            selectedDate,
            setSelectedDate,
            selectedId,
            setSelectedId,
            selectedKind,
            selectedSlotDate,
            selectProject,
            selectSlot,
            onEditSlot: props.onEditSlot,
            editingId,
            setEditingId,
            beginDrag,
            onOpenDay,
            hasActive: selectedId !== null || editingId !== null,
            onExitActive: clearActive,
            even: weekIndex % 2 === 1,
            monthStart: weekIndex > 0 && week.some((key) => parseKey(key).getDate() === 1),
            expanded: expandedWeeks.has(week[0]),
            onToggleExpanded: () => setExpandedWeeks((previous) => {
              const next = new Set(previous)
              if (next.has(week[0])) next.delete(week[0])
              else next.add(week[0])
              return next
            }),
          })),
        ]),
      ])
    }

    // --- daily recurring tasks ------------------------------------------------

    function DailySection(props) {
      const t = props.t
      const data = props.data
      const update = props.update
      const showToast = props.showToast
      const today = props.today
      const [editing, setEditing] = React.useState(false)
      const [draft, setDraft] = React.useState('')

      const addTask = () => {
        const title = draft.trim()
        if (title === '') return
        update((store) => withDailyTask(store, title))
        setDraft('')
        showToast(t('saved'))
      }

      const rows = data.dailyTasks.map((task) => {
        const done = task.doneDates.includes(today)
        return h('li', { key: task.id, className: 'tb-mditem', 'data-done': done ? '1' : undefined }, [
          h('button', {
            key: 'check',
            type: 'button',
            className: 'tb-checkbox',
            'data-checked': done ? '1' : undefined,
            title: t('dailyToggle', done),
            'aria-label': t('dailyToggle', done),
            'aria-pressed': done ? 'true' : 'false',
            onClick: () => update((store) => toggleDailyDone(store, task.id, today)),
          }, done ? h(IconCheck, { key: 'icon', size: 13 }) : null),
          h('span', { key: 'title', className: 'tb-mdtitle' }, task.title),
          editing ? h('button', {
            key: 'rename',
            type: 'button',
            className: 'tb-md-edit',
            title: t('projectEdit'),
            'aria-label': t('projectEdit'),
            onClick: () => props.onEditDaily(task),
          }, '✎') : null,
          editing ? h('button', {
            key: 'del',
            type: 'button',
            className: 'tb-md-edit',
            title: t('dailyDelete'),
            'aria-label': t('dailyDelete'),
            onClick: () => update((store) => withoutDailyTask(store, task.id)),
          }, '✕') : null,
        ])
      })

      return h('section', { className: 'tb-card' }, [
        h('div', { key: 'head', className: 'tb-card-head' }, [
          h('span', { key: 'title', className: 'tb-card-title' }, [h(IconTarget, { key: 'i' }), h('span', { key: 't' }, t('daily'))]),
          h('span', { key: 'count', className: 'tb-card-sub' }, t('dailyCount', data.dailyTasks.length)),
          h('span', { key: 'hint', className: 'tb-hint' }, t('dailyHint')),
          h('div', { key: 'actions', className: 'tb-card-actions' }, [
            h(Btn, { key: 'edit', onClick: () => setEditing((value) => !value) }, editing ? t('editDone') : t('dailyEdit')),
          ]),
        ]),
        h('div', { key: 'body', className: 'tb-daily-body' }, [
          data.dailyTasks.length === 0
            ? h('div', { key: 'empty', className: 'tb-empty' }, t('dailyEmpty'))
            : h('ul', { key: 'list', className: 'tb-mdlist tb-daily-grid' }, rows),
          editing ? h('div', { key: 'add', className: 'tb-daily-add' }, [
            h('input', {
              key: 'input',
              className: 'tb-input',
              type: 'text',
              maxLength: 200,
              value: draft,
              placeholder: t('dailyAddPlaceholder'),
              onChange: (event) => setDraft(event.target.value),
              onKeyDown: (event) => {
                if (event.key === 'Enter') addTask()
              },
            }),
            h(Btn, { key: 'btn', variant: 'primary', onClick: addTask, icon: h(IconPlus) }, t('dailyAdd')),
          ]) : null,
        ]),
      ])
    }

    // --- weekly task list (7 columns) ----------------------------------------

    function WeekView(props) {
      const t = props.t
      const data = props.data
      const update = props.update
      const today = props.today
      const weekStart = props.weekStart
      const setWeekStart = props.setWeekStart
      const setSelectedDate = props.setSelectedDate
      const onOpenDay = props.onOpenDay
      const onAddSlot = props.onAddSlot
      const showToast = props.showToast
      const end = addDays(weekStart, 6)

      // Drag a task row onto another day column to reschedule it. Only timed day
      // tasks and single-day projects are draggable; a multi-day project keeps
      // its range and is edited from the calendar.
      const [taskDrag, setTaskDrag] = React.useState(null)
      const suppressClickRef = React.useRef(false)
      // Clicking a task row in the week list expands its subtasks inline
      // (read-only; editing stays on the specific-day page).
      const [openSubtasks, setOpenSubtasks] = React.useState(() => new Set())
      const subtaskKey = (kind, id) => `${kind}:${id}`
      const toggleSubtaskView = (kind, id) => {
        setOpenSubtasks((previous) => {
          const next = new Set(previous)
          const key = subtaskKey(kind, id)
          if (next.has(key)) next.delete(key)
          else next.add(key)
          return next
        })
      }
      const subtaskRowsFor = (kind, id, list) => (Array.isArray(list) ? list : []).map((sub) => h('div', {
        key: `sub-${kind}-${id}-${sub.id}`,
        className: 'tb-wsubitem',
        'data-done': sub.done ? '1' : undefined,
        title: t('subtasksEditHint'),
      }, [
        h('span', {
          key: 'mark',
          className: 'tb-wsubcheck',
          'data-done': sub.done ? '1' : undefined,
          'aria-hidden': 'true',
        }, sub.done ? '✓' : ''),
        h('span', { key: 'title', className: 'tb-wsubtitle' }, sub.title),
      ]))

      const moveSlotTo = (fromKey, id, toKey) => {
        if (fromKey === toKey) return
        update((store) => {
          const slot = slotsOn(store, fromKey).find((entry) => entry.id === id)
          if (slot === undefined) return store
          let next = withoutSlot(store, fromKey, id)
          next = withSlot(next, toKey, {
            ...slot,
            subtasks: Array.isArray(slot.subtasks) ? slot.subtasks : [],
          })
          return next
        })
      }
      const moveProjectTo = (id, toKey) => {
        update((store) => {
          const project = store.projects.find((entry) => entry.id === id)
          if (project === undefined) return store
          const subtasks = (Array.isArray(project.subtasks) ? project.subtasks : []).map((sub) => ({
            ...sub,
            date: toKey,
          }))
          return patchProject(store, id, { start: toKey, end: toKey, subtasks })
        })
      }
      const beginTaskDrag = (event, kind, fromKey, item) => {
        if (typeof event.button === 'number' && event.button !== 0) return
        if (event.target && event.target.closest && event.target.closest('button')) return
        const startX = event.clientX
        const startY = event.clientY
        const pointerId = event.pointerId
        let active = false
        let target = null
        const move = (moveEvent) => {
          if (pointerId !== undefined && moveEvent.pointerId !== undefined && moveEvent.pointerId !== pointerId) return
          if (!active && Math.abs(moveEvent.clientX - startX) + Math.abs(moveEvent.clientY - startY) < 6) return
          active = true
          if (moveEvent.cancelable) moveEvent.preventDefault()
          const node = typeof document !== 'undefined' ? document.elementFromPoint(moveEvent.clientX, moveEvent.clientY) : null
          const column = node && node.closest ? node.closest('[data-drop-day]') : null
          const nextTarget = column ? column.getAttribute('data-drop-day') : null
          target = nextTarget
          setTaskDrag({ kind, title: item.title, x: moveEvent.clientX, y: moveEvent.clientY, target })
          if (typeof document !== 'undefined' && document.body) document.body.style.cursor = 'grabbing'
        }
        const finish = (upEvent) => {
          window.removeEventListener('pointermove', move)
          window.removeEventListener('pointerup', finish)
          window.removeEventListener('pointercancel', finish)
          if (typeof document !== 'undefined' && document.body) document.body.style.cursor = ''
          setTaskDrag(null)
          if (!active) return
          suppressClickRef.current = true
          setTimeout(() => { suppressClickRef.current = false }, 300)
          if (upEvent && upEvent.cancelable) upEvent.preventDefault()
          if (target === null || target === fromKey) return
          if (kind === 'slot') moveSlotTo(fromKey, item.id, target)
          else moveProjectTo(item.id, target)
          if (typeof showToast === 'function') showToast(t('movedTo', formatDay(target)))
        }
        window.addEventListener('pointermove', move)
        window.addEventListener('pointerup', finish)
        window.addEventListener('pointercancel', finish)
      }

      const doneCheck = (checked, label, onToggle) => h('button', {
        key: 'check',
        type: 'button',
        className: 'tb-checkbox tb-checkbox-sm',
        'data-checked': checked ? '1' : undefined,
        title: label,
        'aria-label': label,
        'aria-pressed': checked ? 'true' : 'false',
        onPointerDown: (event) => event.stopPropagation(),
        onClick: (event) => {
          event.stopPropagation()
          onToggle()
        },
      }, checked ? h(IconCheck, { key: 'icon', size: 10 }) : null)

      const columns = Array.from({ length: 7 }, (unused, index) => addDays(weekStart, index)).map((key) => {
        const isPast = key < today
        const isToday = key === today
        const slots = slotsOn(data, key)
        const projects = projectsOn(data, key)
        const rows = []
        for (const slot of slots) {
          const slotSubtasks = Array.isArray(slot.subtasks) ? slot.subtasks : []
          const hasSubtasks = slotSubtasks.length > 0
          const open = openSubtasks.has(subtaskKey('slot', slot.id))
          rows.push(h('div', {
            key: `s-${slot.id}`,
            className: 'tb-wtask',
            'data-done': slot.done ? '1' : undefined,
            'data-draggable': '1',
            'data-has-subs': hasSubtasks ? '1' : undefined,
            title: hasSubtasks ? t('clickToViewSubtasks') : undefined,
            onClick: () => {
              if (suppressClickRef.current) {
                suppressClickRef.current = false
                return
              }
              setSelectedDate(key)
              if (hasSubtasks) toggleSubtaskView('slot', slot.id)
            },
            onPointerDown: (event) => beginTaskDrag(event, 'slot', key, slot),
          }, [
            h('span', {
              key: 'caret',
              className: 'tb-wcaret',
              'aria-hidden': 'true',
            }, hasSubtasks ? (open ? '▾' : '▸') : ''),
            doneCheck(slot.done === true, t('slotDone'), () => {
              update((store) => patchSlot(store, key, slot.id, { done: slot.done !== true }))
            }),
            h('span', { key: 'time', className: 'tb-wtask-time' }, minutesText(slot.start)),
            h('span', { key: 'title', className: 'tb-wtask-title', title: `${minutesText(slot.start)}–${minutesText(slot.end)} ${slot.title}` }, slot.title),
            hasSubtasks
              ? h('span', { key: 'subs', className: 'tb-wsub', title: t('subtaskCount', slotSubtasks.length) }, String(slotSubtasks.length))
              : null,
          ]))
          if (open) rows.push(...subtaskRowsFor('slot', slot.id, slotSubtasks))
        }
        for (const project of projects) {
          const projectDoneHere = Array.isArray(project.doneDates) && project.doneDates.includes(key)
          const projectSubtasks = Array.isArray(project.subtasks)
            ? project.subtasks.filter((sub) => sub.date === key)
            : []
          const hasSubtasks = projectSubtasks.length > 0
          const open = openSubtasks.has(subtaskKey('project', project.id))
          rows.push(h('div', {
            key: `p-${project.id}`,
            className: 'tb-wtask',
            'data-done': projectDoneHere ? '1' : undefined,
            'data-draggable': project.start === project.end ? '1' : undefined,
            'data-has-subs': hasSubtasks ? '1' : undefined,
            title: hasSubtasks ? t('clickToViewSubtasks') : undefined,
            onClick: () => {
              if (suppressClickRef.current) {
                suppressClickRef.current = false
                return
              }
              setSelectedDate(key)
              if (hasSubtasks) toggleSubtaskView('project', project.id)
            },
            onPointerDown: project.start === project.end
              ? (event) => beginTaskDrag(event, 'project', key, project)
              : undefined,
          }, [
            h('span', {
              key: 'caret',
              className: 'tb-wcaret',
              'aria-hidden': 'true',
            }, hasSubtasks ? (open ? '▾' : '▸') : ''),
            doneCheck(projectDoneHere, t('projectDoneOnDay', projectDoneHere), () => {
              update((store) => toggleProjectDoneOn(store, project.id, key))
            }),
            h('span', { key: 'dot', className: 'tb-wdot', style: { background: project.color } }),
            h('span', { key: 'title', className: 'tb-wtask-title', title: `${project.title} · ${project.start} → ${project.end}` }, project.title),
            hasSubtasks
              ? h('span', { key: 'subs', className: 'tb-wsub', title: t('subtaskCount', projectSubtasks.length) }, String(projectSubtasks.length))
              : null,
          ]))
          if (open) rows.push(...subtaskRowsFor('project', project.id, projectSubtasks))
        }
        for (const entry of recurringOn(data, key)) {
          const task = entry.task
          const daySubtasks = Array.isArray(task.subtasks) ? task.subtasks.filter((sub) => sub.date === key) : []
          rows.push(h('div', {
            key: `r-${task.id}`,
            className: 'tb-wtask tb-wtask-recurring',
            'data-done': entry.done ? '1' : undefined,
            title: recurringSummaryText(t, task),
            onClick: () => {
              if (suppressClickRef.current) {
                suppressClickRef.current = false
                return
              }
              setSelectedDate(key)
            },
          }, [
            doneCheck(entry.done, t('slotDone'), () => {
              update((store) => toggleRecurringDoneOn(store, task.id, key))
            }),
            h('span', { key: 'dot', className: 'tb-wdot', style: { background: task.color } }),
            h('span', { key: 'title', className: 'tb-wtask-title' }, task.title),
            h('span', { key: 'tag', className: 'tb-wtag' }, t('weeklyTag')),
            daySubtasks.length > 0
              ? h('span', { key: 'subs', className: 'tb-wsub', title: t('subtaskCount', daySubtasks.length) }, String(daySubtasks.length))
              : null,
          ]))
        }
        return h('div', {
          key,
          className: 'tb-wcol',
          'data-past': isPast ? '1' : undefined,
          'data-today': isToday ? '1' : undefined,
          'data-drop-day': key,
          'data-drag-over': taskDrag !== null && taskDrag.target === key ? '1' : undefined,
        }, [
          h('button', {
            key: 'head',
            type: 'button',
            className: 'tb-wcol-head',
            title: `${formatDay(key)} ${formatWeekday(key)}`,
            onClick: () => {
              setSelectedDate(key)
              onOpenDay(key)
            },
          }, [
            h('span', { key: 'w', className: 'tb-wcol-head-date' }, formatWeekday(key)),
            h('span', { key: 'd', className: 'tb-wcol-head-date' }, formatDay(key)),
          ]),
          h('div', { key: 'body', className: 'tb-wcol-body' }, [
            rows.length === 0
              ? h('span', { key: 'empty', className: 'tb-wempty' }, t('emptyWeekCol'))
              : rows,
            h('button', {
              key: 'add',
              type: 'button',
              className: 'tb-wcol-add',
              title: t('dayAdd'),
              onClick: () => onAddSlot(key),
            }, t('dayAdd')),
          ]),
        ])
      })

      return h(React.Fragment, null, [
        h('div', { key: 'nav', className: 'tb-daybar' }, [
          h('span', { key: 'title', className: 'tb-card-title' }, [h(IconList, { key: 'i' }), h('span', { key: 't' }, t('workWeek'))]),
          h('div', { key: 'pager', className: 'tb-nav' }, [
            h(IconBtn, { key: 'prev', title: t('weekPrev'), onClick: () => setWeekStart(addDays(weekStart, -7)) }, h(IconChevron, { dir: 'left' })),
            h('span', { key: 'label', className: 'tb-nav-label' }, t('weekRange', formatDay(weekStart), formatDay(end))),
            h(IconBtn, { key: 'next', title: t('weekNext'), onClick: () => setWeekStart(addDays(weekStart, 7)) }, h(IconChevron, { dir: 'right' })),
            h(Btn, { key: 'today', variant: 'quiet', onClick: () => setWeekStart(startOfWeek(today)) }, t('today')),
          ]),
          h('span', { key: 'hint', className: 'tb-hint' }, t('weekDragHint')),
        ]),
        h('div', { key: 'grid', className: 'tb-weekgrid' }, columns),
        taskDrag === null ? null : h('div', {
          key: 'dragghost',
          className: 'tb-dragghost',
          style: { left: `${taskDrag.x + 12}px`, top: `${taskDrag.y - 12}px` },
        }, taskDrag.title),
      ])
    }

    // --- 24-hour timeline -----------------------------------------------------

    function layoutSlots(slots) {
      const sorted = slots.slice().sort((a, b) => a.start - b.start || a.end - b.end)
      const items = []
      let cluster = []
      let laneEnds = []
      let clusterEnd = 0
      const flush = () => {
        const laneCount = cluster.reduce((max, item) => Math.max(max, item.lane + 1), 0)
        for (const item of cluster) item.lanes = Math.max(1, laneCount)
        cluster = []
        laneEnds = []
        clusterEnd = 0
      }
      for (const slot of sorted) {
        if (cluster.length > 0 && slot.start >= clusterEnd) flush()
        let lane = -1
        for (let index = 0; index < laneEnds.length; index += 1) {
          if (laneEnds[index] <= slot.start) {
            lane = index
            break
          }
        }
        if (lane === -1) {
          lane = laneEnds.length
          laneEnds.push(slot.end)
        } else {
          laneEnds[lane] = slot.end
        }
        const item = { slot, lane, lanes: 1 }
        cluster.push(item)
        items.push(item)
        clusterEnd = Math.max(clusterEnd, slot.end)
      }
      flush()
      return items
    }

    function DayTimeline(props) {
      const t = props.t
      const slots = props.slots
      const date = props.date
      const today = props.today
      const [drag, setDrag] = React.useState(null)
      const [tip, setTip] = React.useState(null)
      const dragRef = React.useRef(null)
      const suppressClickRef = React.useRef(false)
      const suppressTimerRef = React.useRef(null)
      const contentRef = React.useRef(null)
      const handlersRef = React.useRef(props)
      handlersRef.current = props

      const startDrag = (event, slot, mode) => {
        if (typeof event.button === 'number' && event.button !== 0) return
        event.preventDefault()
        event.stopPropagation()
        const rect = contentRef.current ? contentRef.current.getBoundingClientRect() : null
        const height = rect && rect.height > 0 ? rect.height : TL_H
        const current = {
          id: slot.id,
          mode,
          startY: event.clientY,
          origStart: slot.start,
          origEnd: slot.end,
          pxPerMin: height / 1440,
          preview: { start: slot.start, end: slot.end },
        }
        dragRef.current = current
        setDrag({ ...current, x: event.clientX, y: event.clientY })
        setTip({ x: event.clientX, y: event.clientY, text: `${minutesText(slot.start)} – ${minutesText(slot.end)}` })
      }

      const dragging = drag !== null
      React.useEffect(() => {
        if (!dragging) return undefined
        const move = (event) => {
          const current = dragRef.current
          if (current === null) return
          const delta = Math.round((event.clientY - current.startY) / current.pxPerMin / SNAP) * SNAP
          let start = current.origStart
          let end = current.origEnd
          if (current.mode === 'move') {
            const duration = current.origEnd - current.origStart
            // 1440 is a legal stored end; clamping to MAX_END here would shrink a
            // legacy 23:59–24:00 block on the first delta-0 drag.
            start = clamp(current.origStart + delta, 0, Math.max(0, 1440 - duration))
            end = start + duration
          } else if (current.mode === 'start') {
            // A slot shorter than one snap unit must not produce a negative bound
            // (`clamp` returns its high bound), which the host sanitizer would drop.
            start = clamp(current.origStart + delta, 0, Math.max(0, current.origEnd - SNAP))
          } else {
            end = clamp(current.origEnd + delta, current.origStart + SNAP, MAX_END)
          }
          if (!(end > start)) return
          if (start === current.preview.start && end === current.preview.end) {
            setTip({ x: event.clientX, y: event.clientY, text: `${minutesText(start)} – ${minutesText(end)}` })
            return
          }
          current.preview = { start, end }
          setDrag({ ...current, x: event.clientX, y: event.clientY })
          setTip({ x: event.clientX, y: event.clientY, text: `${minutesText(start)} – ${minutesText(end)}` })
        }
        const finish = () => {
          const current = dragRef.current
          dragRef.current = null
          setDrag(null)
          setTip(null)
          if (current !== null && current.preview.end > current.preview.start && (current.preview.start !== current.origStart || current.preview.end !== current.origEnd)) {
            suppressClickRef.current = true
            if (suppressTimerRef.current !== null) clearTimeout(suppressTimerRef.current)
            suppressTimerRef.current = setTimeout(() => {
              suppressClickRef.current = false
              suppressTimerRef.current = null
            }, 150)
            handlersRef.current.onChangeSlot(current.id, current.preview)
          }
        }
        window.addEventListener('pointermove', move)
        window.addEventListener('pointerup', finish)
        window.addEventListener('pointercancel', finish)
        return () => {
          window.removeEventListener('pointermove', move)
          window.removeEventListener('pointerup', finish)
          window.removeEventListener('pointercancel', finish)
        }
      }, [dragging])

      const addAt = (event) => {
        if (event.target !== event.currentTarget) return
        const rect = contentRef.current ? contentRef.current.getBoundingClientRect() : null
        if (rect === null || rect.height <= 0) return
        const raw = ((event.clientY - rect.top) / rect.height) * 1440
        const start = clamp(Math.floor(raw / SNAP) * SNAP, 0, LAST_SNAP)
        const end = Math.min(start + 60, MAX_END)
        props.onCreateSlot(start, end)
      }

      const hourCells = []
      for (let hour = 0; hour < 24; hour += 1) {
        hourCells.push(h('div', {
          key: hour,
          className: 'tb-tl-hour',
          style: { height: `${HOUR_H}px` },
        }, hour === 0 ? null : h('span', { key: 'label', className: 'tb-tl-hour-label' }, `${pad2(hour)}:00`)))
      }
      const gridLines = []
      for (let hour = 0; hour < 24; hour += 1) {
        gridLines.push(h('div', { key: hour, className: 'tb-tl-line', style: { height: `${HOUR_H}px` } }))
      }

      const laidOut = layoutSlots(slots)
      const blocks = laidOut.map((item) => {
        const slot = item.slot
        const active = drag !== null && drag.id === slot.id
        const start = active ? drag.preview.start : slot.start
        const end = active ? drag.preview.end : slot.end
        const top = (start / 1440) * TL_H
        const natural = Math.max(15, ((end - start) / 1440) * TL_H - 2)
        const height = Math.max(4, Math.min(natural, TL_H - top - 1))
        const width = 100 / item.lanes
        return h('div', {
          key: slot.id,
          className: 'tb-slot',
          'data-drag': active ? '1' : undefined,
          'data-done': slot.done ? '1' : undefined,
          style: {
            top: `${top}px`,
            height: `${height}px`,
            left: `calc(${item.lane * width}% + 2px)`,
            width: `calc(${width}% - 4px)`,
            background: slot.color,
            color: readableOn(slot.color),
          },
          title: `${slot.title} · ${minutesText(start)} – ${minutesText(end)}${Array.isArray(slot.subtasks) && slot.subtasks.length > 0 ? ` · ${t('subtaskCount', slot.subtasks.length)}` : ''}`,
          onPointerDown: (event) => startDrag(event, slot, 'move'),
          onClick: (event) => {
            if (suppressClickRef.current) {
              suppressClickRef.current = false
              return
            }
            props.onOpenSlot(slot)
          },
        }, [
          h('span', {
            key: 'start',
            className: 'tb-slot-handle tb-slot-handle-top',
            'aria-hidden': 'true',
            onPointerDown: (event) => startDrag(event, slot, 'start'),
          }),
          h('span', { key: 'title', className: 'tb-slot-title' }, slot.title),
          height >= 32 ? h('span', { key: 'time', className: 'tb-slot-time' }, `${minutesText(start)} – ${minutesText(end)}`) : null,
          Array.isArray(slot.subtasks) && slot.subtasks.length > 0
            ? h('span', { key: 'subs', className: 'tb-slot-subs' }, String(slot.subtasks.length))
            : null,
          h('button', {
            key: 'done',
            type: 'button',
            className: 'tb-slot-done',
            title: t('slotDone'),
            'aria-label': t('slotDone'),
            'aria-pressed': slot.done ? 'true' : 'false',
            onClick: (event) => {
              event.stopPropagation()
              props.onToggleSlot(slot)
            },
            onPointerDown: (event) => {
              event.stopPropagation()
            },
          }, slot.done ? '✓' : ''),
          h('span', {
            key: 'end',
            className: 'tb-slot-handle tb-slot-handle-bottom',
            'aria-hidden': 'true',
            onPointerDown: (event) => startDrag(event, slot, 'end'),
          }),
        ])
      })

      const now = new Date()
      const nowMinutes = now.getHours() * 60 + now.getMinutes()
      const showNow = date === today

      return h('div', { className: 'tb-timeline' }, [
        h('div', { key: 'hours', className: 'tb-tl-hours' }, hourCells),
        h('div', {
          key: 'content',
          className: 'tb-tl-content',
          ref: contentRef,
          style: { height: `${TL_H}px` },
          onDoubleClick: addAt,
        }, [
          h('div', { key: 'lines', className: 'tb-tl-lines' }, gridLines),
          blocks,
          showNow ? h('div', { key: 'now', className: 'tb-tl-now', style: { top: `${(nowMinutes / 1440) * TL_H}px` } }) : null,
        ]),
        tip === null ? null : h('div', {
          key: 'tip',
          className: 'tb-dragtip',
          style: { left: `${tip.x + 14}px`, top: `${tip.y - 26}px` },
        }, tip.text),
      ])
    }

    // --- day view -------------------------------------------------------------

    function DayView(props) {
      const t = props.t
      const data = props.data
      const update = props.update
      const date = props.date
      const setDate = props.setDate
      const today = props.today
      const showToast = props.showToast
      const slots = slotsOn(data, date)

      const dailyRows = data.dailyTasks.map((task) => {
        const done = task.doneDates.includes(date)
        return h('li', { key: task.id, className: 'tb-mditem', 'data-done': done ? '1' : undefined }, [
          h('button', {
            key: 'check',
            type: 'button',
            className: 'tb-checkbox',
            'data-checked': done ? '1' : undefined,
            title: t('dailyToggle', done),
            'aria-label': t('dailyToggle', done),
            'aria-pressed': done ? 'true' : 'false',
            onClick: () => update((store) => toggleDailyDone(store, task.id, date)),
          }, done ? h(IconCheck, { key: 'icon', size: 13 }) : null),
          h('span', { key: 'title', className: 'tb-mdtitle' }, task.title),
        ])
      })

      const changeSlot = (id, preview) => {
        if (!(preview.end > preview.start)) return
        update((store) => patchSlot(store, date, id, { start: preview.start, end: preview.end }))
      }
      const toggleSlot = (slot) => {
        update((store) => patchSlot(store, date, slot.id, { done: !slot.done }))
      }

      const dayProjects = projectsOn(data, date)
      const taskDoneCheck = (checked, onToggle, label) => h('button', {
        key: 'check',
        type: 'button',
        className: 'tb-checkbox tb-checkbox-sm',
        'data-checked': checked ? '1' : undefined,
        title: label === undefined ? t('slotDone') : label,
        'aria-label': label === undefined ? t('slotDone') : label,
        'aria-pressed': checked ? 'true' : 'false',
        onPointerDown: (event) => event.stopPropagation(),
        onClick: (event) => {
          event.stopPropagation()
          onToggle()
        },
      }, checked ? h(IconCheck, { key: 'icon', size: 10 }) : null)

      // Subtasks are edited only here (the "specific day" page); their order is
      // the stored order and is never drag-reorderable.
      const [subtaskDraft, setSubtaskDraft] = React.useState(null) // { owner, ownerId, title }
      const [subtaskEdit, setSubtaskEdit] = React.useState(null) // { owner, ownerId, subtaskId, title }
      const mutateSubtasks = (owner, ownerId, mutator) => {
        update((store) => {
          if (owner === 'project') return mutateProjectSubtasks(store, ownerId, mutator)
          if (owner === 'recurring') return mutateRecurringSubtasks(store, ownerId, mutator)
          return mutateSlotSubtasks(store, date, ownerId, mutator)
        })
      }
      const changeSubtask = (owner, ownerId, subtaskId, patch) => {
        mutateSubtasks(owner, ownerId, (list) => list.map((sub) => (sub.id === subtaskId ? { ...sub, ...patch } : sub)))
      }
      const addSubtask = (owner, ownerId, rawTitle) => {
        const clean = String(rawTitle === undefined || rawTitle === null ? '' : rawTitle).trim().slice(0, 200)
        if (clean === '') return
        const subtask = owner === 'slot'
          ? { id: uid('st'), title: clean, done: false }
          : { id: uid('st'), title: clean, done: false, date }
        mutateSubtasks(owner, ownerId, (list) => list.concat([subtask]))
      }
      const removeSubtask = (owner, ownerId, subtaskId) => {
        mutateSubtasks(owner, ownerId, (list) => list.filter((sub) => sub.id !== subtaskId))
      }
      const renderSubtasks = (owner, ownerId, task) => {
        // A long-term task keeps one subtask list for the whole project, but each
        // entry belongs to the date it was added on; only this day's entries show.
        const list = Array.isArray(task.subtasks)
          ? (owner === 'slot' ? task.subtasks : task.subtasks.filter((sub) => sub.date === date))
          : []
        const rows = list.map((sub) => {
          const editingThis = subtaskEdit !== null
            && subtaskEdit.owner === owner
            && subtaskEdit.ownerId === ownerId
            && subtaskEdit.subtaskId === sub.id
          return h('div', { key: sub.id, className: 'tb-subtask', 'data-done': sub.done ? '1' : undefined }, [
            h('button', {
              key: 'check',
              type: 'button',
              className: 'tb-checkbox tb-checkbox-xs',
              'data-checked': sub.done ? '1' : undefined,
              title: t('dailyToggle', sub.done),
              'aria-label': t('dailyToggle', sub.done),
              'aria-pressed': sub.done ? 'true' : 'false',
              onClick: () => changeSubtask(owner, ownerId, sub.id, { done: !sub.done }),
            }, sub.done ? h(IconCheck, { key: 'icon', size: 9 }) : null),
            editingThis
              ? h('input', {
                key: 'input',
                className: 'tb-input tb-subtask-input',
                autoFocus: true,
                value: subtaskEdit.title,
                onChange: (event) => setSubtaskEdit({ ...subtaskEdit, title: event.target.value }),
                onKeyDown: (event) => {
                  if (event.key === 'Enter') {
                    const next = subtaskEdit.title.trim().slice(0, 200)
                    if (next !== '') changeSubtask(owner, ownerId, sub.id, { title: next })
                    setSubtaskEdit(null)
                  } else if (event.key === 'Escape') {
                    setSubtaskEdit(null)
                  }
                },
                onBlur: () => {
                  const next = subtaskEdit.title.trim().slice(0, 200)
                  if (next !== '') changeSubtask(owner, ownerId, sub.id, { title: next })
                  setSubtaskEdit(null)
                },
              })
              : h('span', {
                key: 'title',
                className: 'tb-subtask-title',
                title: t('projectEdit'),
                onClick: () => setSubtaskEdit({ owner, ownerId, subtaskId: sub.id, title: sub.title }),
              }, sub.title),
            h('button', {
              key: 'rename',
              type: 'button',
              className: 'tb-subtask-act',
              title: t('projectEdit'),
              onClick: () => setSubtaskEdit({ owner, ownerId, subtaskId: sub.id, title: sub.title }),
            }, '✎'),
            h('button', {
              key: 'del',
              type: 'button',
              className: 'tb-subtask-act',
              title: t('dailyDelete'),
              onClick: () => removeSubtask(owner, ownerId, sub.id),
            }, '✕'),
          ])
        })
        const adding = subtaskDraft !== null && subtaskDraft.owner === owner && subtaskDraft.ownerId === ownerId
        if (adding) {
          rows.push(h('div', { key: '__add', className: 'tb-subtask tb-subtask-add' }, [
            h('span', { key: 'mark', className: 'tb-subtask-mark', 'aria-hidden': 'true' }, '+'),
            h('input', {
              key: 'input',
              className: 'tb-input tb-subtask-input',
              autoFocus: true,
              placeholder: t('newSubtaskPlaceholder'),
              value: subtaskDraft.title,
              onChange: (event) => setSubtaskDraft({ ...subtaskDraft, title: event.target.value }),
              onKeyDown: (event) => {
                if (event.key === 'Enter') {
                  addSubtask(owner, ownerId, subtaskDraft.title)
                  setSubtaskDraft({ owner, ownerId, title: '' })
                } else if (event.key === 'Escape') {
                  setSubtaskDraft(null)
                }
              },
              onBlur: () => setSubtaskDraft(null),
            }),
          ]))
        }
        return rows
      }
      const subtaskAddButton = (owner, ownerId) => h('button', {
        key: 'addsub',
        type: 'button',
        className: 'tb-subtask-addbtn',
        title: t('addSubtask'),
        'aria-label': t('addSubtask'),
        onPointerDown: (event) => event.stopPropagation(),
        onClick: (event) => {
          event.stopPropagation()
          setSubtaskEdit(null)
          setSubtaskDraft({ owner, ownerId, title: '' })
        },
      }, '+')

      const taskBlocks = []
      for (const slot of slots) {
        const main = h('div', {
          key: `s-${slot.id}`,
          className: 'tb-daytask',
          'data-done': slot.done ? '1' : undefined,
          title: `${minutesText(slot.start)}–${minutesText(slot.end)} ${slot.title}`,
          onClick: () => props.onEditSlot(date, slot),
        }, [
          taskDoneCheck(slot.done === true, () => toggleSlot(slot)),
          h('span', { key: 'time', className: 'tb-wtask-time' }, minutesText(slot.start)),
          h('span', { key: 'title', className: 'tb-wtask-title' }, slot.title),
          subtaskAddButton('slot', slot.id),
        ])
        taskBlocks.push(h('div', { key: `s-${slot.id}-block`, className: 'tb-daytask-block' },
          [main].concat(renderSubtasks('slot', slot.id, slot))))
      }
      for (const project of dayProjects) {
        const projectDoneToday = Array.isArray(project.doneDates) && project.doneDates.includes(date)
        const main = h('div', {
          key: `p-${project.id}`,
          className: 'tb-daytask',
          'data-done': projectDoneToday ? '1' : undefined,
          title: `${project.title} · ${project.start} → ${project.end}`,
        }, [
          taskDoneCheck(
            projectDoneToday,
            () => update((store) => toggleProjectDoneOn(store, project.id, date)),
            t('projectDoneOnDay', projectDoneToday),
          ),
          h('span', { key: 'dot', className: 'tb-wdot', style: { background: project.color } }),
          h('span', { key: 'title', className: 'tb-wtask-title' }, project.title),
          subtaskAddButton('project', project.id),
        ])
        taskBlocks.push(h('div', { key: `p-${project.id}-block`, className: 'tb-daytask-block' },
          [main].concat(renderSubtasks('project', project.id, project))))
      }
      for (const entry of recurringOn(data, date)) {
        const task = entry.task
        const summary = recurringSummaryText(t, task)
        const main = h('div', {
          key: `r-${task.id}`,
          className: 'tb-daytask tb-daytask-recurring',
          'data-done': entry.done ? '1' : undefined,
          title: `${task.title} · ${summary}`,
          onClick: () => props.onEditRecurring(task),
        }, [
          taskDoneCheck(entry.done, () => update((store) => toggleRecurringDoneOn(store, task.id, date)), t('slotDone')),
          h('span', { key: 'dot', className: 'tb-wdot', style: { background: task.color } }),
          h('span', { key: 'title', className: 'tb-wtask-title' }, task.title),
          h('span', { key: 'tag', className: 'tb-wtag' }, t('weeklyTag')),
          subtaskAddButton('recurring', task.id),
        ])
        taskBlocks.push(h('div', { key: `r-${task.id}-block`, className: 'tb-daytask-block' },
          [main].concat(renderSubtasks('recurring', task.id, task))))
      }

      return h(React.Fragment, null, [
        h('div', { key: 'bar', className: 'tb-daybar' }, [
          h('span', { key: 'title', className: 'tb-card-title' }, [h(IconClock, { key: 'i' }), h('span', { key: 't' }, t('workDay'))]),
          h('div', { key: 'pager', className: 'tb-nav' }, [
            h(IconBtn, { key: 'prev', title: t('dayPrev'), onClick: () => setDate(addDays(date, -1)) }, h(IconChevron, { dir: 'left' })),
            h('span', { key: 'label', className: 'tb-nav-label' }, `${formatDay(date)} · ${formatWeekday(date)}`),
            h(IconBtn, { key: 'next', title: t('dayNext'), onClick: () => setDate(addDays(date, 1)) }, h(IconChevron, { dir: 'right' })),
            h(Btn, { key: 'today', variant: 'quiet', onClick: () => setDate(today) }, t('today')),
            h('input', {
              key: 'picker',
              className: 'tb-input tb-input-date',
              type: 'date',
              value: date,
              'aria-label': t('fieldDate'),
              onChange: (event) => {
                if (isDateKey(event.target.value)) setDate(event.target.value)
              },
            }),
          ]),
        ]),
        h('div', { key: 'body', className: 'tb-daybody' }, [
          h('div', { key: 'panels', className: 'tb-daypanels' }, [
            h('div', { key: 'daily', className: 'tb-dailypanel' }, [
              h('div', { key: 'title', className: 'tb-panel-title' }, t('dayDailies')),
              data.dailyTasks.length === 0
                ? h('div', { key: 'empty', className: 'tb-empty' }, t('noDaily'))
                : h('ul', { key: 'list', className: 'tb-mdlist' }, dailyRows),
              h('button', {
                key: 'add',
                type: 'button',
                className: 'tb-addtask',
                onClick: () => props.onAddDaily(),
              }, t('dayAdd')),
            ]),
            h('div', { key: 'tasks', className: 'tb-dailypanel' }, [
              h('div', { key: 'title', className: 'tb-panel-title' }, t('dayTasks')),
              taskBlocks.length === 0
                ? h('div', { key: 'empty', className: 'tb-empty' }, t('noDayTasks'))
                : h('div', { key: 'list', className: 'tb-daytask-list' }, taskBlocks),
              h('button', {
                key: 'add',
                type: 'button',
                className: 'tb-addtask',
                onClick: () => props.onAddSlot(date),
              }, t('dayAdd')),
            ]),
          ]),
          h('div', { key: 'timeline', style: { flex: '1 1 320px', minWidth: 0 } }, [
            h('div', { key: 'hint', className: 'tb-hint', style: { padding: '0 0 4px' } }, t('timelineHint')),
            h(DayTimeline, {
              key: 'tl',
              t,
              slots,
              date,
              today,
              onChangeSlot: changeSlot,
              onToggleSlot: toggleSlot,
              onOpenSlot: (slot) => props.onEditSlot(date, slot),
              onCreateSlot: (start, end) => {
                props.onCreateSlot(date, start, end)
                showToast(t('saved'))
              },
            }),
          ]),
        ]),
      ])
    }

    // --- daily work section (two views) --------------------------------------

    function WorkSection(props) {
      const t = props.t
      const view = props.view
      const setView = props.setView
      return h('section', { className: 'tb-card' }, [
        h('div', { key: 'head', className: 'tb-card-head' }, [
          h('span', { key: 'title', className: 'tb-card-title' }, [h(IconList, { key: 'i' }), h('span', { key: 't' }, t('work'))]),
          h('div', { key: 'switch', className: 'tb-nav' }, [
            h(Btn, {
              key: 'week',
              variant: view === 'week' ? 'primary' : undefined,
              onClick: () => setView('week'),
            }, t('workWeek')),
            h(Btn, {
              key: 'day',
              variant: view === 'day' ? 'primary' : undefined,
              onClick: () => setView('day'),
            }, t('workDay')),
          ]),
        ]),
        h('div', { key: 'body' }, view === 'week'
          ? h(WeekView, {
            key: 'week',
            t,
            data: props.data,
            update: props.update,
            today: props.today,
            weekStart: props.weekStart,
            setWeekStart: props.setWeekStart,
            setSelectedDate: props.setSelectedDate,
            onOpenDay: (key) => {
              props.setSelectedDate(key)
              setView('day')
            },
            onAddSlot: (key) => props.onOpenAdd('slot', key),
            showToast: props.showToast,
          })
          : h(DayView, {
            key: 'day',
            t,
            data: props.data,
            update: props.update,
            date: props.date,
            setDate: props.setSelectedDate,
            today: props.today,
            showToast: props.showToast,
            onAddSlot: (key) => props.onOpenAdd('slot', key),
            onAddDaily: () => props.onOpenAdd('daily'),
            onEditSlot: (key, slot) => props.onOpenEditSlot(key, slot),
            onEditRecurring: (task) => props.onOpenEditWeekly(task),
            onCreateSlot: (key, start, end) => props.onCreateSlot(key, start, end),
          })),
      ])
    }

    // --- page -----------------------------------------------------------------

    function TaskBoardPage() {
      const t = useDict()
      const store = useTaskBoard()
      const today = todayKey()
      const [calendarCursor, setCalendarCursor] = React.useState(today)
      const [weekStart, setWeekStart] = React.useState(() => startOfWeek(today))
      const [selectedDate, setSelectedDate] = React.useState(today)
      const [workView, setWorkView] = React.useState('week')
      const [pageView, setPageView] = React.useState('tasks')
      const [dialog, setDialog] = React.useState(null)

      const openAddProject = () => {
        setDialog({
          kind: 'project',
          mode: 'add',
          value: { title: '', color: PALETTE[0], start: selectedDate, end: selectedDate, note: '' },
        })
      }
      const openAddDaily = () => setDialog({ kind: 'daily', mode: 'add', initialTitle: '' })
      const openEditDaily = (task) => setDialog({ kind: 'daily', mode: 'edit', initialTitle: task.title, id: task.id })
      const openAddSlot = (dateKeyValue) => {
        const key = isDateKey(dateKeyValue) ? dateKeyValue : selectedDate
        setDialog({
          kind: 'slot',
          mode: 'add',
          value: { title: '', date: key, originDate: key, startTime: '09:00', endTime: '10:00', color: PALETTE[1] },
        })
      }
      const openEditProject = (project) => {
        setDialog({ kind: 'project', mode: 'edit', value: { ...project } })
      }
      const openEditSlot = (key, slot) => {
        setDialog({
          kind: 'slot',
          mode: 'edit',
          value: {
            id: slot.id,
            title: slot.title,
            date: key,
            originDate: key,
            startTime: minutesText(slot.start),
            endTime: slot.end >= 1440 ? '23:59' : minutesText(slot.end),
            color: slot.color,
            done: slot.done === true,
            subtasks: Array.isArray(slot.subtasks) ? slot.subtasks.map((sub) => ({ ...sub })) : [],
          },
        })
      }
      const openAddByKind = (kind) => {
        if (kind === 'project') openAddProject()
        else if (kind === 'daily') openAddDaily()
        else if (kind === 'weekly') openAddWeekly()
        else openAddSlot(selectedDate)
      }

      const openAddWeekly = () => {
        const startDate = isDateKey(selectedDate) ? selectedDate : today
        setDialog({
          kind: 'weekly',
          mode: 'add',
          value: {
            title: '',
            color: PALETTE[2],
            mode: 'weekly',
            startDate,
            weekdays: [weekdayIndex(startDate) + 1],
            intervalDays: 2,
            weeks: 4,
          },
        })
      }
      const openEditWeekly = (task) => {
        setDialog({
          kind: 'weekly',
          mode: 'edit',
          value: {
            id: task.id,
            title: task.title,
            color: task.color,
            mode: task.mode === 'interval' ? 'interval' : 'weekly',
            startDate: task.startDate,
            weekdays: Array.isArray(task.weekdays) ? task.weekdays.slice() : [],
            intervalDays: task.intervalDays || 2,
            weeks: task.weeks,
          },
        })
      }
      const saveWeekly = (form) => {
        const editing = dialog !== null && dialog.mode === 'edit'
        const fields = {
          title: form.title,
          color: form.color,
          mode: form.mode === 'interval' ? 'interval' : 'weekly',
          startDate: form.startDate,
          weekdays: form.weekdays,
          intervalDays: form.intervalDays,
          weeks: form.weeks,
        }
        store.update((data) => (editing
          ? patchRecurringTask(data, form.id, fields)
          : withRecurringTask(data, {
            id: uid('r'),
            ...fields,
            note: '',
            doneDates: [],
          })))
        setDialog(null)
        store.showFlash(t('saved'))
      }
      const deleteWeekly = (id) => {
        store.update((data) => withoutRecurringTask(data, id))
        setDialog(null)
        store.showFlash(t('saved'))
      }

      const saveProject = (form) => {
        if (dialog !== null && dialog.mode === 'edit') {
          updateProject(form)
        } else {
          store.update((data) => withProject(data, {
            id: uid('p'),
            title: form.title,
            color: form.color,
            start: form.start,
            end: form.end,
            note: form.note,
            done: false,
            doneDates: [],
            subtasks: [],
          }))
          store.showFlash(t('saved'))
        }
        setDialog(null)
      }
      function updateProject(form) {
        store.update((data) => patchProject(data, form.id, {
          title: form.title,
          color: form.color,
          start: form.start,
          end: form.end,
          note: form.note,
        }))
        store.showFlash(t('saved'))
      }
      const deleteProject = (id) => {
        store.update((data) => withoutProject(data, id))
        setDialog(null)
        store.showFlash(t('saved'))
      }
      const saveDaily = (title) => {
        const editing = dialog !== null && dialog.mode === 'edit' && typeof dialog.id === 'string'
        store.update((data) => (editing ? renameDailyTask(data, dialog.id, title) : withDailyTask(data, title)))
        setDialog(null)
        store.showFlash(t('saved'))
      }
      const saveSlot = (form) => {
        const editing = dialog !== null && dialog.mode === 'edit'
        const patch = { title: form.title, start: form.start, end: form.end, color: form.color }
        store.update((data) => {
          if (!editing) {
            return withSlot(data, form.date, {
              id: uid('s'),
              title: form.title,
              start: form.start,
              end: form.end,
              color: form.color,
              done: false,
              subtasks: [],
            })
          }
          const origin = dialog.value.originDate
          if (origin === form.date) return patchSlot(data, form.date, form.id, patch)
          let next = withoutSlot(data, origin, form.id)
          next = withSlot(next, form.date, {
            id: form.id,
            title: form.title,
            start: form.start,
            end: form.end,
            color: form.color,
            done: dialog.value.done === true,
            subtasks: Array.isArray(dialog.value.subtasks) ? dialog.value.subtasks : [],
          })
          return next
        })
        setDialog(null)
        store.showFlash(t('saved'))
      }
      const deleteSlot = (date, id) => {
        store.update((data) => withoutSlot(data, date, id))
        setDialog(null)
        store.showFlash(t('saved'))
      }
      const createSlotAt = (key, start, end) => {
        store.update((data) => withSlot(data, key, {
          id: uid('s'),
          title: t('quickTaskTitle'),
          start,
          end,
          color: PALETTE[1],
          done: false,
          subtasks: [],
        }))
      }
      const extractedSubtasks = (item) => (Array.isArray(item.subtasks)
        ? item.subtasks.map((sub) => ({ id: uid('st'), title: sub.title, done: sub.done === true }))
        : [])
      // Project subtasks are per-day; extracted outlines attach them to the
      // project's first day so they show exactly once, not on every day of a range.
      const extractedProjectSubtasks = (item) => (Array.isArray(item.subtasks)
        ? item.subtasks.map((sub) => ({
          id: uid('st'),
          title: sub.title,
          done: sub.done === true,
          date: isDateKey(item.startDate) ? item.startDate : null,
        }))
        : [])
      const applyExtracted = (items) => {
        store.update((data) => {
          let next = data
          for (const item of items) {
            const title = String(item.title || '').trim()
            if (title === '') continue
            if (item.kind === 'project') {
              next = withProject(next, {
                id: uid('p'),
                title,
                color: isColor(item.color) ? item.color : PALETTE[0],
                start: item.startDate,
                end: item.endDate,
                note: typeof item.note === 'string' ? item.note.slice(0, 500) : '',
                done: false,
                doneDates: [],
                subtasks: extractedProjectSubtasks(item),
              })
            } else if (item.kind === 'daily') {
              next = withDailyTask(next, title)
            } else {
              const start = minutesFromText(item.startTime)
              const end = minutesFromText(item.endTime)
              if (start === null || end === null || end <= start || !isDateKey(item.date)) continue
              next = withSlot(next, item.date, {
                id: uid('s'),
                title,
                start,
                end,
                color: isColor(item.color) ? item.color : PALETTE[1],
                done: false,
                subtasks: extractedSubtasks(item),
              })
            }
          }
          return next
        })
        return items.length
      }

      if (store.status === 'loading' || store.data === null) {
        return h('div', { className: 'tb-page' }, h('div', { className: 'tb-loading' }, t('loading')))
      }

      const header = h('div', { key: 'head', className: 'tb-head' }, [
        h('div', { key: 'left' }, [
          h('h1', { key: 'title', className: 'tb-title' }, t('title')),
          h('div', { key: 'sub', className: 'tb-sub' }, t('subtitle')),
        ]),
        h('div', { key: 'status', className: 'tb-save', 'data-error': store.saveError === null ? undefined : '1' }, store.saveError !== null
          ? `${t('saveFailed')}${store.saveError}`
          : store.saving
            ? t('saving')
            : store.flash !== null
              ? store.flash
              : store.savedAt !== null
                ? t('saved')
                : ''),
      ])

      const banners = []
      if (store.error !== null) {
        const message = store.error === 'host-missing' ? t('hostMissing') : `${t('loadFailed')}${store.error}`
        banners.push(h('div', { key: 'load-error', className: 'tb-banner', 'data-error': '1', role: 'alert' }, [
          h('span', { key: 'text' }, message),
          h(Btn, {
            key: 'retry',
            variant: 'quiet',
            onClick: () => {
              if (store.blocked && store.dirty && typeof window !== 'undefined' && typeof window.confirm === 'function' && !window.confirm(t('retryDiscardConfirm'))) return
              store.retry()
            },
          }, t('retry')),
        ]))
      } else if (store.warning !== null) {
        banners.push(h('div', { key: 'load-warning', className: 'tb-banner' }, store.warning))
      }
      if (store.blocked) {
        banners.push(h('div', { key: 'blocked', className: 'tb-banner', 'data-error': '1', role: 'alert' }, [
          h('span', { key: 'text' }, t('dataBlocked')),
          h(Btn, { key: 'allow', variant: 'quiet', onClick: store.allowSave }, t('overwriteSave')),
        ]))
      }

      const dialogNode = dialog === null ? null : dialog.kind === 'project'
        ? h(ProjectDialog, {
          key: 'project-dialog',
          t,
          mode: dialog.mode,
          initial: dialog.value,
          onSave: saveProject,
          onDelete: deleteProject,
          onCancel: () => setDialog(null),
        })
        : dialog.kind === 'daily'
          ? h(DailyDialog, {
            key: 'daily-dialog',
            t,
            mode: dialog.mode,
            initialTitle: dialog.initialTitle,
            onSave: saveDaily,
            onCancel: () => setDialog(null),
          })
          : dialog.kind === 'weekly'
            ? h(WeeklyDialog, {
              key: 'weekly-dialog',
              t,
              mode: dialog.mode,
              initial: dialog.value,
              onSave: saveWeekly,
              onDelete: deleteWeekly,
              onCancel: () => setDialog(null),
            })
            : h(SlotDialog, {
              key: 'slot-dialog',
              t,
              mode: dialog.mode,
              initial: dialog.value,
              onSave: saveSlot,
              onDelete: deleteSlot,
              onCancel: () => setDialog(null),
            })

      if (pageView === 'history') {
        return h('div', { className: 'tb-page' }, h('div', { className: 'tb-shell' }, [
          header,
          h('div', { key: 'tabs', className: 'tb-pagetabs' }, [
            h(Btn, { key: 'back', onClick: () => setPageView('tasks') }, t('backToTasks')),
          ]),
          h(HistoryContent, { key: 'history', t, store }),
        ]))
      }

      return h('div', { className: 'tb-page' }, h('div', { className: 'tb-shell' }, [
        header,
        ...banners,
        h(ExtractionBar, {
          key: 'extraction',
          t,
          today,
          onApply: applyExtracted,
          onOpenAdd: openAddByKind,
          onToast: store.showFlash,
        }),
        h(CalendarSection, {
          key: 'calendar',
          t,
          data: store.data,
          update: store.update,
          today,
          cursor: calendarCursor,
          setCursor: setCalendarCursor,
          selectedDate,
          setSelectedDate,
          onOpenDay: (key) => {
            setSelectedDate(key)
            setWorkView('day')
          },
          onOpenHistory: () => setPageView('history'),
          onEditProject: openEditProject,
          onEditSlot: openEditSlot,
          showToast: store.showFlash,
        }),
        h(DailySection, {
          key: 'daily',
          t,
          data: store.data,
          update: store.update,
          today,
          showToast: store.showFlash,
          onEditDaily: openEditDaily,
        }),
        h(WorkSection, {
          key: 'work',
          t,
          data: store.data,
          update: store.update,
          today,
          view: workView,
          setView: setWorkView,
          weekStart,
          setWeekStart,
          setSelectedDate,
          date: selectedDate,
          showToast: store.showFlash,
          onOpenAdd: (kind, key) => {
            if (kind === 'slot') openAddSlot(key)
            else openAddByKind(kind)
          },
          onOpenEditSlot: openEditSlot,
          onOpenEditWeekly: openEditWeekly,
          onCreateSlot: createSlotAt,
          onEditArea: () => {
            openAddSlot(selectedDate)
          },
        }),
        h(ReminderSection, {
          key: 'reminder',
          t,
          onToast: store.showFlash,
        }),
        dialogNode,
      ]))
    }

    // --- email reminder settings ---------------------------------------------

    const MAIL_PRESETS = [
      { id: 'qq', label: 'QQ 邮箱', host: 'smtp.qq.com', port: 465, secure: 'tls' },
      { id: '163', label: '163 邮箱', host: 'smtp.163.com', port: 465, secure: 'tls' },
      { id: '126', label: '126 邮箱', host: 'smtp.126.com', port: 465, secure: 'tls' },
      { id: 'gmail', label: 'Gmail', host: 'smtp.gmail.com', port: 465, secure: 'tls' },
      { id: 'outlook', label: 'Outlook', host: 'smtp.office365.com', port: 587, secure: 'starttls' },
      { id: 'custom', label: '', host: '', port: 465, secure: 'tls' },
    ]

    function reminderPresetFor(host) {
      const found = MAIL_PRESETS.find((preset) => preset.host !== '' && preset.host === host)
      return found === undefined ? 'custom' : found.id
    }

    function ReminderSection(props) {
      const t = props.t
      const [form, setForm] = React.useState(null)
      const [status, setStatus] = React.useState(null)
      const [busy, setBusy] = React.useState(false)
      const [expanded, setExpanded] = React.useState(true)

      React.useEffect(() => {
        let alive = true
        post('/reminder/load', {}).then((data) => {
          if (!alive) return
          const settings = data.settings || {}
          setForm({
            enabled: settings.enabled === true,
            provider: reminderPresetFor(settings.smtpHost || 'smtp.qq.com'),
            user: settings.user || '',
            to: settings.to || '',
            pass: '',
            hasPass: settings.hasPass === true,
            smtpHost: settings.smtpHost || 'smtp.qq.com',
            smtpPort: settings.smtpPort || 465,
            secure: settings.secure === 'starttls' ? 'starttls' : 'tls',
            time: settings.time || '08:00',
            lastSentDate: settings.lastSentDate || '',
          })
          setExpanded(settings.enabled !== true)
        }).catch(() => {
          if (!alive) return
          setForm({
            enabled: false,
            provider: 'qq',
            user: '',
            to: '',
            pass: '',
            hasPass: false,
            smtpHost: 'smtp.qq.com',
            smtpPort: 465,
            secure: 'tls',
            time: '08:00',
            lastSentDate: '',
          })
        })
        return () => { alive = false }
      }, [])

      if (form === null) return null
      const patch = (part) => setForm((previous) => ({ ...previous, ...part }))
      const applyPreset = (id) => {
        const preset = MAIL_PRESETS.find((item) => item.id === id) || MAIL_PRESETS[MAIL_PRESETS.length - 1]
        setForm((previous) => ({
          ...previous,
          provider: id,
          smtpHost: preset.host === '' ? previous.smtpHost : preset.host,
          smtpPort: preset.host === '' ? previous.smtpPort : preset.port,
          secure: preset.host === '' ? previous.secure : preset.secure,
        }))
      }
      const save = () => {
        setBusy(true)
        setStatus(null)
        post('/reminder/save', {
          settings: {
            enabled: form.enabled,
            user: form.user.trim(),
            to: (form.to || form.user).trim(),
            pass: form.pass,
            smtpHost: form.smtpHost.trim(),
            smtpPort: Math.round(Number(form.smtpPort)),
            secure: form.secure,
            time: form.time,
          },
        }).then((data) => {
          const settings = data.settings || {}
          setForm((previous) => ({
            ...previous,
            enabled: settings.enabled === true,
            user: settings.user || '',
            to: settings.to || '',
            pass: '',
            hasPass: settings.hasPass === true,
            smtpHost: settings.smtpHost || previous.smtpHost,
            smtpPort: settings.smtpPort || previous.smtpPort,
            secure: settings.secure === 'starttls' ? 'starttls' : 'tls',
            time: settings.time || previous.time,
            lastSentDate: settings.lastSentDate || '',
          }))
          setStatus({ kind: 'ok', text: t('reminderSaved') })
          if (settings.enabled === true) setExpanded(false)
          if (typeof props.onToast === 'function') props.onToast(t('reminderSaved'))
        }).catch((error) => {
          setStatus({ kind: 'error', text: String((error && error.message) || error) })
        }).then(() => setBusy(false))
      }
      const test = () => {
        setBusy(true)
        setStatus({ kind: 'info', text: t('reminderTesting') })
        post('/reminder/test', {}).then(() => {
          setStatus({ kind: 'ok', text: t('reminderTestOk') })
        }).catch((error) => {
          setStatus({ kind: 'error', text: `${t('reminderTestFail')}：${String((error && error.message) || error)}` })
        }).then(() => setBusy(false))
      }
      return h('section', { className: 'tb-card' }, [
        h('div', {
          key: 'head',
          className: 'tb-card-head tb-reminder-head',
          role: 'button',
          tabIndex: 0,
          title: expanded ? t('reminderCollapse') : t('reminderExpand'),
          onClick: () => setExpanded((value) => !value),
          onKeyDown: (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              setExpanded((value) => !value)
            }
          },
        }, [
          h('span', { key: 'title', className: 'tb-card-title' }, '✉️ ' + t('reminderTitle')),
          h('span', {
            key: 'status',
            className: 'tb-reminder-status',
            'data-on': form.enabled ? '1' : undefined,
          }, form.enabled
            ? t('reminderStatusOn', form.time, (form.to || form.user))
            : t('reminderOff')),
          expanded ? h('span', { key: 'sub', className: 'tb-card-sub' }, t('reminderHint')) : null,
          h('button', {
            key: 'toggle',
            type: 'button',
            className: 'tb-reminder-chevron',
            'aria-label': expanded ? t('reminderCollapse') : t('reminderExpand'),
            'aria-expanded': expanded ? 'true' : 'false',
            onClick: (event) => {
              event.stopPropagation()
              setExpanded((value) => !value)
            },
          }, expanded ? '▾' : '▸'),
        ]),
        expanded ? h('div', { key: 'body', className: 'tb-reminder' }, [
          h('label', { key: 'enable', className: 'tb-reminder-toggle' }, [
            h('input', {
              key: 'checkbox',
              type: 'checkbox',
              checked: form.enabled,
              onChange: (event) => patch({ enabled: event.target.checked }),
            }),
            h('span', { key: 'text' }, t('reminderEnable')),
          ]),
          h('div', { key: 'row1', className: 'tb-field-row' }, [
            h(Field, { key: 'provider', label: t('reminderProvider') },
              h('select', {
                className: 'tb-input',
                value: form.provider,
                onChange: (event) => applyPreset(event.target.value),
              }, MAIL_PRESETS.map((preset) => h('option', { key: preset.id, value: preset.id }, preset.id === 'custom' ? t('reminderCustom') : preset.label)))),
            h(Field, { key: 'user', label: t('reminderUser') },
              h('input', {
                className: 'tb-input',
                type: 'email',
                placeholder: 'name@example.com',
                value: form.user,
                onChange: (event) => patch({ user: event.target.value }),
              })),
          ]),
          h('div', { key: 'row2', className: 'tb-field-row' }, [
            h(Field, { key: 'host', label: t('reminderHost') },
              h('input', {
                className: 'tb-input',
                value: form.smtpHost,
                onChange: (event) => patch({ smtpHost: event.target.value, provider: reminderPresetFor(event.target.value) }),
              })),
            h(Field, { key: 'port', label: t('reminderPort') },
              h('input', {
                className: 'tb-input',
                type: 'number',
                min: 1,
                max: 65535,
                value: form.smtpPort,
                onChange: (event) => patch({ smtpPort: event.target.value }),
              })),
            h(Field, { key: 'secure', label: t('reminderSecure') },
              h('select', {
                className: 'tb-input',
                value: form.secure,
                onChange: (event) => patch({ secure: event.target.value }),
              }, [
                h('option', { key: 'tls', value: 'tls' }, t('reminderSecureTls')),
                h('option', { key: 'starttls', value: 'starttls' }, t('reminderSecureStarttls')),
              ])),
          ]),
          h('div', { key: 'row3', className: 'tb-field-row' }, [
            h(Field, { key: 'pass', label: t('reminderPass') },
              h('input', {
                className: 'tb-input',
                type: 'password',
                value: form.pass,
                autoComplete: 'new-password',
                placeholder: form.hasPass ? t('reminderPassSaved') : '',
                onChange: (event) => patch({ pass: event.target.value }),
              })),
            h(Field, { key: 'to', label: t('reminderTo') },
              h('input', {
                className: 'tb-input',
                type: 'email',
                placeholder: 'name@example.com',
                value: form.to,
                onChange: (event) => patch({ to: event.target.value }),
              })),
            h(Field, { key: 'time', label: t('reminderTime') },
              h('input', {
                className: 'tb-input',
                type: 'time',
                value: form.time,
                onChange: (event) => patch({ time: event.target.value }),
              })),
          ]),
          h('div', { key: 'hint', className: 'tb-hint' }, t('reminderAuthHint')),
          h('div', { key: 'actions', className: 'tb-card-actions' }, [
            h('span', { key: 'last', className: 'tb-card-sub' }, t('reminderLastSent', form.lastSentDate)),
            h(Btn, { key: 'save', variant: 'primary', onClick: save, disabled: busy }, t('reminderSave')),
            h(Btn, { key: 'test', onClick: test, disabled: busy }, t('reminderTest')),
          ]),
          status === null ? null : h('div', {
            key: 'status',
            className: status.kind === 'error' ? 'tb-hint-error' : 'tb-hint',
            role: status.kind === 'error' ? 'alert' : undefined,
          }, status.text),
        ]) : null,
      ])
    }

    // --- history page ---------------------------------------------------------

    function HistoryContent(props) {
      const t = props.t
      const store = props.store
      const data = store.data
      const [selected, setSelected] = React.useState(null)

      React.useEffect(() => {
        if (selected !== null || data === null) return
        if (data.recurringTasks.length > 0) setSelected({ kind: 'recurring', id: data.recurringTasks[0].id })
        else if (data.projects.length > 0) setSelected({ kind: 'project', id: data.projects[0].id })
      }, [selected, data])

      const recordedDates = (task) => {
        const dates = new Set(Array.isArray(task.doneDates) ? task.doneDates : [])
        for (const sub of (Array.isArray(task.subtasks) ? task.subtasks : [])) {
          if (isDateKey(sub.date)) dates.add(sub.date)
        }
        return dates
      }
      const resultsOn = (task, key) => (Array.isArray(task.subtasks) ? task.subtasks.filter((sub) => sub.date === key) : [])
      const taskName = (task) => (task.title || '')

      if (store.status === 'loading') {
        return h('section', { className: 'tb-card' }, h('div', { className: 'tb-panel-title' }, t('historyLoading')))
      }
      if (data === null) return null

      const task = selected === null ? null : (selected.kind === 'recurring'
        ? data.recurringTasks.find((item) => item.id === selected.id) || null
        : data.projects.find((item) => item.id === selected.id) || null)

      const items = (list, kind) => list.map((item) => {
        const active = selected !== null && selected.kind === kind && selected.id === item.id
        return h('button', {
          key: `${kind}-${item.id}`,
          type: 'button',
          className: 'tb-hist-item',
          'data-active': active ? '1' : undefined,
          onClick: () => setSelected({ kind, id: item.id }),
        }, [
          h('span', { key: 'dot', className: 'tb-wdot', style: { background: item.color } }),
          h('span', { key: 'title', className: 'tb-hist-item-title' }, taskName(item)),
          h('span', { key: 'count', className: 'tb-hist-item-count' }, t('historyRecorded', recordedDates(item).size)),
        ])
      })

      const row = (key, done, results) => h('div', { key, className: 'tb-hist-row', 'data-done': done ? '1' : undefined }, [
        h('span', { key: 'date', className: 'tb-hist-date' }, `${formatDay(key)} ${formatWeekday(key)}`),
        h('span', { key: 'mark', className: 'tb-hist-mark', 'aria-hidden': 'true' }, done ? '✓' : ''),
        h('span', { key: 'results', className: 'tb-hist-results' }, results.length === 0
          ? (done ? '' : t('historyNoRecord'))
          : results.map((sub) => sub.title).join(t('histJoin'))),
      ])

      let rows = []
      if (task !== null) {
        const doneDates = new Set(Array.isArray(task.doneDates) ? task.doneDates : [])
        if (selected.kind === 'recurring') {
          const dates = recurringDates(task).slice().sort().reverse()
          rows = dates.map((key) => row(key, doneDates.has(key), resultsOn(task, key)))
        } else {
          const dates = []
          let cursor = task.start
          let guard = 0
          while (cursor <= task.end && guard < 400) {
            dates.push(cursor)
            cursor = addDays(cursor, 1)
            guard += 1
          }
          const relevant = recordedDates(task)
          rows = dates
            .filter((key) => relevant.has(key))
            .sort()
            .reverse()
            .map((key) => row(key, doneDates.has(key), resultsOn(task, key)))
        }
      }

      return h('section', { key: 'hist', className: 'tb-card' }, [
        h('div', { key: 'head', className: 'tb-card-head' }, [
          h('span', { key: 'title', className: 'tb-card-title' }, [h(IconList, { key: 'i' }), h('span', { key: 't' }, t('historyTitle'))]),
          h('span', { key: 'sub', className: 'tb-card-sub' }, t('historyHint')),
        ]),
        h('div', { key: 'body', className: 'tb-history' }, [
          h('div', { key: 'side', className: 'tb-hist-side' }, [
            data.recurringTasks.length === 0 ? null : h('div', { key: 'rec-title', className: 'tb-hist-group' }, t('historyRecurring')),
            ...items(data.recurringTasks, 'recurring'),
            data.projects.length === 0 ? null : h('div', { key: 'proj-title', className: 'tb-hist-group' }, t('historyProjects')),
            ...items(data.projects, 'project'),
          ]),
          h('div', { key: 'main', className: 'tb-hist-main' }, [
            task === null
              ? h('div', { key: 'pick', className: 'tb-empty' }, t('historyPick'))
              : h('div', { key: 'task-head', className: 'tb-hist-task' }, [
                h('span', { key: 'dot', className: 'tb-wdot', style: { background: task.color } }),
                h('span', { key: 'title', className: 'tb-hist-task-title' }, task.title),
                h('span', { key: 'sub', className: 'tb-card-sub' }, selected.kind === 'recurring'
                  ? recurringSummaryText(t, task)
                  : `${task.start} → ${task.end}`),
              ]),
            task === null || rows.length > 0 ? null : h('div', { key: 'empty', className: 'tb-empty' }, t('historyEmpty')),
            task === null ? null : h('div', { key: 'rows', className: 'tb-hist-rows' }, rows),
          ]),
        ]),
      ])
    }

    class TaskBoardBoundary extends React.Component {
      constructor(props) {
        super(props)
        this.state = { error: null }
      }

      static getDerivedStateFromError(error) {
        return { error: String((error && error.message) || error) }
      }

      componentDidCatch(error) {
        if (typeof console !== 'undefined' && typeof console.error === 'function') {
          console.error('dsh-task-board: page error', error)
        }
      }

      render() {
        if (this.state.error === null) return h(TaskBoardPage, this.props)
        return h('div', { className: 'tb-page' }, h('div', { className: 'tb-crash' }, [
          h('div', { key: 'title', className: 'tb-title' }, '任务面板出错 / Task board error'),
          h('div', { key: 'detail', className: 'tb-hint-error' }, this.state.error),
          h(Btn, { key: 'retry', onClick: () => this.setState({ error: null }) }, '重试 / Retry'),
        ]))
      }
    }

    function PanelIcon(props) {
      const size = props && typeof props.size === 'number' ? props.size : 18
      const active = props && props.active === true
      return h('svg', {
        ...svgProps(size),
        style: {
          display: 'block',
          flex: 'none',
          color: active ? 'var(--dsw-alias-brand-primary)' : 'currentColor',
        },
      }, [
        h('rect', { key: 'r', x: 3, y: 4.5, width: 18, height: 16, rx: 2.5 }),
        h('path', { key: 'l1', d: 'M3 9.5h18' }),
        h('path', { key: 'l2', d: 'M8 2.8v3.4M16 2.8v3.4' }),
        h('path', { key: 'check', d: 'M8.2 14.4l2.3 2.3 5-5.2' }),
      ])
    }

    const EXTRA_CSS = [
      '.tb-include{flex:none;width:14px;height:14px;margin:0;accent-color:var(--dsw-alias-brand-primary,#4C8DFF);cursor:pointer}',
      '.tb-erow[data-invalid]{border-color:var(--dsw-alias-state-error-primary,#e5484d)}',
      '.tb-md-bullet{flex:none;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px;color:var(--dsw-alias-label-tertiary)}',
      '.tb-wcol[data-past] .tb-wempty{color:#5A6472}',
      '.tb-wcol[data-past] .tb-wtask[data-done] .tb-wtask-title{color:#5A6472}',
      '.tb-day-count{position:absolute;right:5px;bottom:1px;font-size:9px;line-height:11px;color:var(--dsw-alias-brand-primary)}',
      '.tb-day-month{font-size:9px;line-height:11px;color:var(--dsw-alias-label-secondary);opacity:.9}',
      '.tb-wtask[data-done] .tb-wtask-title{text-decoration:line-through;color:var(--dsw-alias-label-tertiary)}',
      '.tb-tl-hours{box-sizing:border-box}',
      '.tb-timeline{max-height:760px;overflow:auto}',
      '.tb-history{display:flex;gap:14px;align-items:flex-start;padding:12px 14px}',
      '.tb-hist-side{flex:none;width:238px;display:flex;flex-direction:column;gap:4px;max-height:70vh;overflow:auto;padding-right:6px;border-right:1px solid var(--dsw-alias-border-l1,rgba(128,128,128,.18))}',
      '.tb-hist-group{margin:8px 0 2px;font-size:11px;color:var(--dsw-alias-label-tertiary)}',
      '.tb-hist-item{display:flex;align-items:center;gap:6px;padding:4px 6px;border:1px solid transparent;border-radius:6px;background:transparent;color:var(--dsw-alias-label-primary);font-size:12px;line-height:18px;text-align:left;cursor:pointer}',
      '.tb-hist-item:hover{background:rgba(128,128,128,.10)}',
      '.tb-hist-item[data-active]{border-color:var(--dsw-alias-border-l2,rgba(128,128,128,.35));background:var(--dsw-alias-bg-layer-2)}',
      '.tb-hist-item-title{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.tb-hist-item-count{flex:none;font-size:10px;color:var(--dsw-alias-label-tertiary)}',
      '.tb-hist-main{flex:1;min-width:0}',
      '.tb-hist-task{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:2px 0 8px;border-bottom:1px solid var(--dsw-alias-border-l1,rgba(128,128,128,.18));margin-bottom:8px}',
      '.tb-hist-task-title{font-weight:600;font-size:14px}',
      '.tb-hist-rows{display:flex;flex-direction:column;max-height:68vh;overflow:auto}',
      '.tb-hist-row{display:flex;align-items:baseline;gap:8px;padding:5px 4px;border-bottom:1px solid var(--dsw-alias-border-l1,rgba(128,128,128,.12));font-size:12px;line-height:18px}',
      '.tb-hist-date{flex:none;width:104px;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums}',
      '.tb-hist-mark{flex:none;width:16px;color:#27AE60;font-weight:700}',
      '.tb-hist-results{min-width:0;white-space:pre-wrap;overflow-wrap:anywhere;color:var(--dsw-alias-label-primary)}',
      '.tb-hist-row[data-done] .tb-hist-results{color:var(--dsw-alias-label-secondary)}',
      '.tb-reminder{display:flex;flex-direction:column;gap:8px;padding:10px 14px}',
      '.tb-reminder-head{cursor:pointer;user-select:none}',
      '.tb-reminder-status{margin-left:auto;padding:1px 7px;border-radius:8px;background:rgba(128,128,128,.14);color:var(--dsw-alias-label-secondary);font-size:11px;line-height:16px;white-space:nowrap}',
      '.tb-reminder-status[data-on]{background:rgba(39,174,96,.16);color:#27AE60}',
      '.tb-reminder-chevron{appearance:none;flex:none;margin-left:6px;width:22px;height:22px;padding:0;border:none;border-radius:6px;background:transparent;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:22px;cursor:pointer}',
      '.tb-reminder-chevron:hover{background:rgba(128,128,128,.16);color:var(--dsw-alias-label-primary)}',
      '.tb-reminder-toggle{display:flex;align-items:center;gap:6px;font-size:12px;cursor:pointer}',
      '.tb-reminder .tb-field-row{display:flex;gap:10px;flex-wrap:wrap}',
      '.tb-reminder .tb-field{flex:1 1 180px;min-width:170px}',
      '.tb-pagetabs{display:flex;gap:6px;padding:0 2px 6px}',
    ].join('')
    // --- plugin registration --------------------------------------------------

    const inject = ['slots', 'locale']

    function apply(ctx) {
      localeService = ctx.get('locale') || null
      const style = document.createElement('style')
      style.dataset.dshTaskBoard = '1'
      style.textContent = CSS + EXTRA_CSS
      document.head.appendChild(style)
      ctx.effect(() => () => style.remove(), 'dsh-task-board: styles')

      if (localeService && typeof localeService.register === 'function') {
        ctx.effect(() => {
          try {
            return localeService.register(NS, { zh, en })
          } catch (error) {
            if (typeof console !== 'undefined') console.error('dsh-task-board: locale registration failed', error)
            return () => {}
          }
        }, 'dsh-task-board: dictionaries')
      }

      const panelLabel = () => currentDict().panel
      ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
        name: 'sidebar.panellist',
        id: PANEL_ID,
        order: 20,
        locale: NS,
        label: panelLabel,
      }, PanelIcon))
      ctx.slots.inject('main', () => ctx.slots.register({
        name: 'main',
        key: PANEL_ID,
        locale: NS,
        label: panelLabel,
      }, TaskBoardBoundary))
    }

    return { name: '@local/dsh-task-board', inject, apply }
  },
})
