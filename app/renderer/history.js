// Completed-task history: grouping by completion day and task durations.
// Shared by the renderer (<script>) and tests / the main process (require).
(function exposeWidgetHistory(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.WidgetHistory = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createWidgetHistory() {
  const DAY_MS = 24 * 60 * 60 * 1000;
  const WEEKDAYS = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
  const RELATIVE_DAYS = ['今天', '昨天', '前天'];
  // A single task longer than this is almost certainly a typo.
  const MAX_DURATION_MINUTES = 100 * 60;
  // Completed before completion times were recorded.
  const UNDATED_KEY = 'undated';

  function startOfDay(timestamp) {
    const date = new Date(timestamp);
    date.setHours(0, 0, 0, 0);
    return date.getTime();
  }

  function formatDayLabel(dayStart, now = Date.now()) {
    // Rounding absorbs the 23/25-hour days around daylight-saving changes.
    const daysAgo = Math.round((startOfDay(now) - dayStart) / DAY_MS);
    if (daysAgo >= 0 && daysAgo < RELATIVE_DAYS.length) return RELATIVE_DAYS[daysAgo];

    const date = new Date(dayStart);
    const monthDay = `${date.getMonth() + 1}月${date.getDate()}日`;
    const prefix = date.getFullYear() === new Date(now).getFullYear() ? '' : `${date.getFullYear()}年`;
    return `${prefix}${monthDay} ${WEEKDAYS[date.getDay()]}`;
  }

  function taskDuration(task) {
    return Number.isFinite(task.duration) && task.duration > 0 ? task.duration : 0;
  }

  // Completed tasks grouped by local calendar day, newest day and newest task
  // first; tasks without a completion time come last under UNDATED_KEY.
  function groupCompletedByDay(tasks) {
    const groups = new Map();
    const undated = [];
    for (const task of tasks) {
      if (!task.done) continue;
      if (!Number.isFinite(task.doneAt)) {
        undated.push(task);
        continue;
      }
      const dayStart = startOfDay(task.doneAt);
      if (!groups.has(dayStart)) groups.set(dayStart, []);
      groups.get(dayStart).push(task);
    }

    const result = [...groups.entries()]
      .sort(([a], [b]) => b - a)
      .map(([dayStart, dayTasks]) => ({
        key: String(dayStart),
        dayStart,
        tasks: dayTasks.sort((a, b) => b.doneAt - a.doneAt),
      }));
    if (undated.length) result.push({ key: UNDATED_KEY, dayStart: null, tasks: undated });
    for (const group of result) {
      group.total = group.tasks.reduce((sum, task) => sum + taskDuration(task), 0);
    }
    return result;
  }

  function normalizeDurationText(input) {
    return String(input)
      // Full-width digits, colon and period typed through a Chinese IME.
      .replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
      .replace(/：/g, ':')
      .replace(/[．。]/g, '.')
      .replace(/\s+/g, '')
      .toLowerCase();
  }

  // Minutes for inputs like "45", "45m", "45分钟", "1h30m", "1小时30分", "1:30"
  // or "1.5h"; 0 for an empty input; null when the input is not a duration.
  function parseDuration(input) {
    const text = normalizeDurationText(input);
    if (!text) return 0;

    let minutes = null;
    let match;
    if ((match = text.match(/^(\d+):([0-5]?\d)$/))) {
      minutes = Number(match[1]) * 60 + Number(match[2]);
    } else if (/^\d+$/.test(text)) {
      minutes = Number(text);
    } else if (
      (match = text.match(/^(?:(\d+(?:\.\d+)?)(?:h|hr|hrs|小时|时))?(?:(\d+)(?:m|min|mins|分钟|分)?)?$/)) &&
      (match[1] !== undefined || match[2] !== undefined)
    ) {
      minutes = Number(match[1] || 0) * 60 + Number(match[2] || 0);
    }

    if (minutes === null || !Number.isFinite(minutes) || minutes > MAX_DURATION_MINUTES) return null;
    return Math.round(minutes);
  }

  function formatDuration(minutes) {
    const total = Math.max(0, Math.round(minutes || 0));
    const hours = Math.floor(total / 60);
    const rest = total % 60;
    if (hours === 0) return `${rest}分钟`;
    if (rest === 0) return `${hours}小时`;
    return `${hours}小时${rest}分`;
  }

  return {
    MAX_DURATION_MINUTES,
    UNDATED_KEY,
    startOfDay,
    formatDayLabel,
    groupCompletedByDay,
    parseDuration,
    formatDuration,
    taskDuration,
  };
});
