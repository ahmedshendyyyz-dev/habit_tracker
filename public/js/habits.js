// How habits are scored, logged and turned into streaks.
import { HABIT_TYPES, dayOf, todayISO } from './schema.js';
import { commit, items, updateItem } from './store.js';
import { addDays, parseDay } from './tasks.js';

export const checklistItems = (habit) => (habit.items || '').split('\n').map((line) => line.trim()).filter(Boolean);

// What counts as fully done for one day.
export function targetOf(habit) {
  if (habit.type === HABIT_TYPES.number) return Number(habit.target) > 0 ? Number(habit.target) : 1;
  if (habit.type === HABIT_TYPES.list) return Math.max(checklistItems(habit).length, 1);
  return 1;
}

export function amountOn(habit, day) {
  const value = (habit.log || {})[day];
  if (habit.type === HABIT_TYPES.list) return Array.isArray(value) ? value.length : 0;
  return Number(value) || 0;
}

export const isMetOn = (habit, day) => amountOn(habit, day) >= targetOf(habit);

export function isScheduledOn(habit, day) {
  const days = (habit.days || []).map(Number);
  return !days.length || days.includes(parseDay(day).getDay());
}

// Your own order first (set with Reorder on the Habits page), then the order you made them in.
const orderOf = (habit) => (habit.order === undefined || habit.order === '' || !Number.isFinite(Number(habit.order)) ? Infinity : Number(habit.order));
export function sortedHabits() {
  return [...items('habits')].sort((a, b) => (orderOf(a) - orderOf(b)) || (a.createdAt || '').localeCompare(b.createdAt || ''));
}

// Moves a habit up (-1) or down (+1) and saves the new order of every habit at once.
export function moveHabit(id, direction) {
  const ids = sortedHabits().map((habit) => habit.id);
  const from = ids.indexOf(id);
  const to = from + direction;
  if (from === -1 || to < 0 || to >= ids.length) return Promise.resolve();
  [ids[from], ids[to]] = [ids[to], ids[from]];
  return commit((next) => {
    for (const habit of next.habits) {
      const index = ids.indexOf(habit.id);
      if (index !== -1) habit.order = index;
    }
  });
}

export function habitsOn(day) {
  return sortedHabits().filter((habit) => isScheduledOn(habit, day));
}

// The first day a habit counts from: the day you made it, or an earlier day you logged.
export function habitStart(habit) {
  const firstLog = Object.keys(habit.log || {}).sort()[0];
  return [dayOf(habit.createdAt) || todayISO(), firstLog].filter(Boolean).sort()[0];
}

// Days in a row the habit was done. Days it is not planned for do not break it,
// and today only counts once it is done.
export function currentStreak(habit) {
  const today = todayISO();
  const firstLog = Object.keys(habit.log || {}).sort()[0];
  const start = [dayOf(habit.createdAt) || today, firstLog].filter(Boolean).sort()[0];
  let streak = 0;
  for (let day = today, i = 0; i < 3660 && day >= start; i++, day = addDays(day, -1)) {
    if (!isScheduledOn(habit, day)) continue;
    if (isMetOn(habit, day)) streak++;
    else if (day !== today) break;
  }
  return streak;
}

export function bestStreak(habit) {
  const logged = Object.keys(habit.log || {}).sort();
  if (!logged.length) return 0;
  const today = todayISO();
  let best = 0;
  let run = 0;
  for (let day = logged[0], i = 0; i < 3660 && day <= today; i++, day = addDays(day, 1)) {
    if (!isScheduledOn(habit, day)) continue;
    if (isMetOn(habit, day)) best = Math.max(best, ++run);
    else if (day !== today) run = 0;
  }
  return best;
}

// For the grid: 0 is nothing, 4 is fully done.
export function habitLevels(habit) {
  const levels = new Map();
  const target = targetOf(habit);
  for (const day of Object.keys(habit.log || {})) {
    const amount = amountOn(habit, day);
    if (amount > 0) levels.set(day, Math.max(1, Math.min(4, Math.ceil((amount / target) * 4))));
  }
  return levels;
}

export function describeDay(habit, day) {
  const amount = amountOn(habit, day);
  if (habit.type === HABIT_TYPES.number) return `${formatAmount(amount)} of ${formatAmount(targetOf(habit))} ${habit.unit || ''}`.trim();
  if (habit.type === HABIT_TYPES.list) {
    const names = checklistItems(habit);
    const done = ((habit.log || {})[day] || []).map((index) => names[index]).filter(Boolean);
    return done.length ? done.join(', ') : 'Nothing ticked';
  }
  return amount ? 'Done' : 'Not done';
}

export function formatAmount(value) {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 10) / 10);
}

/* ---------- Logging ---------- */

function writeLog(habit, day, change) {
  return updateItem('habits', habit.id, (latest) => {
    latest.log = { ...(latest.log || {}) };
    const next = change(latest.log[day], latest);
    const empty = next === undefined || next === 0 || (Array.isArray(next) && !next.length);
    if (empty) delete latest.log[day];
    else latest.log[day] = next;
  });
}

export const setChecked = (habit, day, done) => writeLog(habit, day, () => (done ? 1 : 0));

// One tap to finish a habit for the day, whatever its type; tapping again clears the day.
export const setComplete = (habit, day, done) => writeLog(habit, day, (value, latest) => {
  if (!done) return 0;
  if (latest.type === HABIT_TYPES.list) return checklistItems(latest).map((_, index) => index);
  if (latest.type === HABIT_TYPES.number) return Math.max(Number(value) || 0, targetOf(latest));
  return 1;
});

export const setAmount = (habit, day, amount) => writeLog(habit, day, () => Math.max(0, Math.round((Number(amount) || 0) * 100) / 100));

export const stepAmount = (habit, day, delta) => writeLog(habit, day, (value) => Math.max(0, Math.round(((Number(value) || 0) + delta) * 100) / 100));

export const toggleListItem = (habit, day, index) => writeLog(habit, day, (value) => {
  const done = new Set(Array.isArray(value) ? value : []);
  if (done.has(index)) done.delete(index); else done.add(index);
  return [...done].sort((a, b) => a - b);
});

/* ---------- Starter habits ---------- */

export function starterHabits() {
  const base = Date.now();
  const make = (index, fields) => ({
    id: crypto.randomUUID(),
    createdAt: new Date(base + index).toISOString(),
    type: HABIT_TYPES.check,
    target: '',
    unit: '',
    items: '',
    days: [],
    notes: '',
    log: {},
    ...fields,
  });
  return [
    make(0, { title: 'Prayers', type: HABIT_TYPES.list, items: 'Fajr\nDhuhr\nAsr\nMaghrib\nIsha' }),
    make(1, { title: 'Gym' }),
    make(2, { title: 'Quran', type: HABIT_TYPES.number, target: 5, unit: 'pages' }),
    make(3, { title: 'Reading', type: HABIT_TYPES.number, target: 10, unit: 'pages' }),
    make(4, { title: 'Coding', type: HABIT_TYPES.number, target: 60, unit: 'minutes' }),
    make(5, { title: 'Course lessons', type: HABIT_TYPES.number, target: 1, unit: 'lessons' }),
    make(6, { title: 'Sleep', type: HABIT_TYPES.number, target: 7, unit: 'hours' }),
    make(7, { title: 'Water', type: HABIT_TYPES.number, target: 8, unit: 'glasses' }),
  ];
}

/* ---------- Links from other sections ---------- */

// Which habit each section feeds, found by its name. Rename a habit and the link follows the name.
const HABIT_LINKS = {
  gym: /\b(gym|workouts?|exercise|training)\b/i,
  coding: /\b(cod(e|ing)|programming)\b/i,
  reading: /\b(read(ing)?|books?)\b/i,
  lessons: /\b(courses?|lessons?)\b/i,
};

export function linkedHabit(kind) {
  return sortedHabits().find((habit) => HABIT_LINKS[kind].test(habit.title || '')) || null;
}

// Adds to, or ticks, the matching habit for that day. Does nothing if there is none.
export async function feedHabit(kind, day, amount = 1) {
  const habit = linkedHabit(kind);
  if (!habit || !day || !amount) return null;
  if (habit.type === HABIT_TYPES.number) await stepAmount(habit, day, amount);
  else if (habit.type === HABIT_TYPES.list) return null;
  else if (amount > 0) await setChecked(habit, day, true);
  return habit;
}
