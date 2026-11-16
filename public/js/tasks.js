// When tasks happen, whether they are done, and how to tick them off.
import { REPEAT, WEEKDAY_NAMES, isoDay, todayISO } from './schema.js';
import { items, updateItem } from './store.js';

// The planner week starts on Saturday, as in Egypt. 0 is Sunday, 6 is Saturday.
export const WEEK_START = 6;

// Noon, so a clock change at midnight never moves it to another day.
export function parseDay(day) {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(year, month - 1, date, 12);
}

export function addDays(day, count) {
  const date = parseDay(day);
  date.setDate(date.getDate() + count);
  return isoDay(date);
}

export const isRepeating = (task) => Boolean(task.repeat) && task.repeat !== REPEAT.never;
export const isEvent = (task) => task.kind === 'Event';

export function occursOn(task, day) {
  if (!task.date) return false;
  if (!isRepeating(task)) return task.date === day;
  if (day < task.date) return false;
  const date = parseDay(day);
  const start = parseDay(task.date);
  switch (task.repeat) {
    case REPEAT.daily: return true;
    case REPEAT.weekly: return date.getDay() === start.getDay();
    case REPEAT.monthly: {
      // A task on the 31st happens on the last day of shorter months.
      const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
      return date.getDate() === Math.min(start.getDate(), lastDay);
    }
    case REPEAT.days: return (task.days || []).map(Number).includes(date.getDay());
    default: return false;
  }
}

export function isDoneOn(task, day) {
  return isRepeating(task) ? (task.doneDates || []).includes(day) : Boolean(task.done);
}

export function setDone(task, day, done) {
  return updateItem('tasks', task.id, (latest) => {
    if (isRepeating(latest)) {
      const dates = new Set(latest.doneDates || []);
      if (done) dates.add(day); else dates.delete(day);
      latest.doneDates = [...dates].sort();
    } else {
      latest.done = done;
      latest.doneDate = done ? todayISO() : '';
    }
  });
}

// Events with a time come first, in time order, then everything else.
function byTime(a, b) {
  const left = a.time || '99:99';
  const right = b.time || '99:99';
  if (left !== right) return left < right ? -1 : 1;
  return (a.createdAt || '').localeCompare(b.createdAt || '');
}

export function tasksOn(day) {
  return items('tasks').filter((task) => occursOn(task, day)).sort(byTime);
}

// One-off tasks from earlier days that are still not done.
export function overdueTasks() {
  const today = todayISO();
  return items('tasks')
    .filter((task) => !isEvent(task) && !isRepeating(task) && task.date && task.date < today && !task.done)
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function undatedTasks() {
  return items('tasks').filter((task) => !task.date && !task.done && !isEvent(task));
}

// The 7 days of a week, offset weeks from this one.
export function weekDays(offset = 0) {
  const today = parseDay(todayISO());
  const back = (today.getDay() - WEEK_START + 7) % 7;
  const first = isoDay(new Date(today.getFullYear(), today.getMonth(), today.getDate() - back + offset * 7, 12));
  return Array.from({ length: 7 }, (_, index) => addDays(first, index));
}

// The next day, from today on, that a task happens. Used in lists.
export function nextOccurrence(task, from = todayISO()) {
  if (!task.date) return '';
  if (!isRepeating(task)) return task.date;
  let day = task.date > from ? task.date : from;
  for (let i = 0; i < 400; i++, day = addDays(day, 1)) {
    if (occursOn(task, day)) return day;
  }
  return '';
}

export function repeatLabel(task) {
  if (!isRepeating(task)) return '';
  if (task.repeat === REPEAT.days) {
    return `Every ${(task.days || []).map(Number).sort().map((day) => WEEKDAY_NAMES[day]).join(', ')}`;
  }
  return task.repeat;
}

export function formatTime(time) {
  const match = /^(\d{2}):(\d{2})$/.exec(time || '');
  if (!match) return '';
  return new Date(2000, 0, 1, Number(match[1]), Number(match[2]))
    .toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}
