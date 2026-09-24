'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  formatDayLabel,
  groupCompletedByDay,
  parseDuration,
  formatDuration,
  startOfDay,
  addDays,
  toDateInputValue,
  parseDateInputValue,
  moveToDay,
  formatClock,
  UNDATED_KEY,
} = require('./history');

// Thursday 2026-09-24, 15:00 local time.
const NOW = new Date(2026, 8, 24, 15, 0).getTime();
const at = (day, hour = 12, minute = 0, month = 8, year = 2026) =>
  new Date(year, month, day, hour, minute).getTime();

test('the last three days are named, older days show the date and weekday', () => {
  assert.equal(formatDayLabel(startOfDay(at(24)), NOW), '今天');
  assert.equal(formatDayLabel(startOfDay(at(23)), NOW), '昨天');
  assert.equal(formatDayLabel(startOfDay(at(22)), NOW), '前天');
  assert.equal(formatDayLabel(startOfDay(at(21)), NOW), '9月21日 星期一');
  assert.equal(formatDayLabel(startOfDay(at(20)), NOW), '9月20日 星期日');
});

test('days from another year include the year', () => {
  assert.equal(formatDayLabel(startOfDay(at(31, 12, 0, 11, 2025)), NOW), '2025年12月31日 星期三');
});

test('"today" is the calendar day, not the last 24 hours', () => {
  const justAfterMidnight = new Date(2026, 8, 24, 0, 5).getTime();
  assert.equal(formatDayLabel(startOfDay(at(23, 23, 55)), justAfterMidnight), '昨天');
});

test('completed tasks are grouped by day, newest first, with daily totals', () => {
  const tasks = [
    { id: 1, text: 'open', done: false },
    { id: 2, text: 'yesterday', done: true, doneAt: at(23, 9), duration: 30 },
    { id: 3, text: 'today early', done: true, doneAt: at(24, 9), duration: 45 },
    { id: 4, text: 'today late', done: true, doneAt: at(24, 14), duration: 90 },
    { id: 5, text: 'no time', done: true, doneAt: at(24, 10) },
    { id: 6, text: 'legacy', done: true },
  ];
  const groups = groupCompletedByDay(tasks);
  assert.deepEqual(groups.map((g) => g.key), [String(startOfDay(at(24))), String(startOfDay(at(23))), UNDATED_KEY]);
  assert.deepEqual(groups[0].tasks.map((t) => t.id), [4, 5, 3]);
  assert.equal(groups[0].total, 135);
  assert.equal(groups[1].total, 30);
  assert.equal(groups[2].total, 0);
  assert.equal(groups[2].dayStart, null);
});

test('durations accept minutes, hours and mixed forms', () => {
  const cases = {
    '': 0,
    '0': 0,
    '45': 45,
    '45m': 45,
    '45 min': 45,
    '45分钟': 45,
    '45分': 45,
    '1h': 60,
    '1小时': 60,
    '1h30m': 90,
    '1h30': 90,
    '1小时30分': 90,
    '1小时30分钟': 90,
    '1.5h': 90,
    '1.5小时': 90,
    '1:30': 90,
    '１：３０': 90,
    '１h': 60,
    ' 2 H 5 M ': 125,
  };
  for (const [input, minutes] of Object.entries(cases)) {
    assert.equal(parseDuration(input), minutes, JSON.stringify(input));
  }
});

test('non-durations are rejected', () => {
  for (const input of ['abc', 'h', '1.5', '1:75', '-5', '1h1h', '99999']) {
    assert.equal(parseDuration(input), null, JSON.stringify(input));
  }
});

test('durations are formatted in hours and minutes', () => {
  assert.equal(formatDuration(0), '0分钟');
  assert.equal(formatDuration(undefined), '0分钟');
  assert.equal(formatDuration(45), '45分钟');
  assert.equal(formatDuration(60), '1小时');
  assert.equal(formatDuration(135), '2小时15分');
});

test('a formatted duration parses back to the same minutes', () => {
  for (const minutes of [0, 5, 59, 60, 61, 135, 600]) {
    assert.equal(parseDuration(formatDuration(minutes)), minutes);
  }
});

test('date input values convert to and from local days', () => {
  assert.equal(toDateInputValue(at(4, 23, 59)), '2026-09-04');
  assert.equal(parseDateInputValue('2026-09-04'), startOfDay(at(4)));
  for (const value of ['', '2026-9-4', '2026-02-30', '2026-13-01', 'yesterday']) {
    assert.equal(parseDateInputValue(value), null, JSON.stringify(value));
  }
});

test('adding days lands on local midnight', () => {
  assert.equal(addDays(startOfDay(at(24)), -2), startOfDay(at(22)));
  assert.equal(addDays(startOfDay(at(30)), 1), startOfDay(at(1, 12, 0, 9)));
});

test('moving a task to another day keeps its time of day', () => {
  assert.equal(moveToDay(at(24, 9, 30), startOfDay(at(20)), NOW), at(20, 9, 30));
  // Undated tasks land at noon.
  assert.equal(moveToDay(undefined, startOfDay(at(20)), NOW), at(20, 12));
  // Never later than now.
  assert.equal(moveToDay(at(20, 18), startOfDay(at(24)), NOW), NOW);
});

test('completion times are shown as HH:MM', () => {
  assert.equal(formatClock(at(24, 9, 5)), '09:05');
});
