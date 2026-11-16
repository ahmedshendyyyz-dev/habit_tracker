// The habit pieces: check-in controls, the Today box, the Habits page and each habit's page.
import { HABIT_TYPES, WEEKDAY_NAMES, dayOf, displayTitle, formatDate, todayISO } from './schema.js';
import { h, toast } from './ui.js';
import { addItems, findItem, items } from './store.js';
import { openForm } from './form.js';
import { icon } from './icons.js';
import { boxSection, confirmDelete, newButton, rerender, stat, viewState } from './components.js';
import { contributionGrid } from './grid.js';
import { addDays, parseDay } from './tasks.js';
import {
  amountOn, bestStreak, checklistItems, currentStreak, describeDay, formatAmount, habitLevels, habitsOn,
  isMetOn, isScheduledOn, setAmount, setChecked, sortedHabits, starterHabits, stepAmount, targetOf, toggleListItem,
} from './habits.js';

const dayCount = (count) => `${count} ${count === 1 ? 'day' : 'days'}`;

const save = (promise) => promise.catch((error) => toast(`Not saved: ${error.message}`, true));

function scheduleLabel(habit) {
  const days = (habit.days || []).map(Number).sort();
  return !days.length || days.length === 7 ? 'Every day' : days.map((day) => WEEKDAY_NAMES[day]).join(', ');
}

function goalLabel(habit) {
  if (habit.type === HABIT_TYPES.number) return `${formatAmount(targetOf(habit))} ${habit.unit || ''} a day`.trim();
  if (habit.type === HABIT_TYPES.list) return `${targetOf(habit)} things a day`;
  return 'Yes or no';
}

function streakText(habit) {
  const streak = currentStreak(habit);
  return streak ? `${streak} day streak` : 'No streak yet';
}

/* ---------- The check-in control ---------- */

export function habitControl(habit, day) {
  const title = displayTitle('habits', habit);
  const focus = (part) => `habit-${habit.id}-${day}-${part}`;
  const when = day === todayISO() ? 'today' : `on ${formatDate(day)}`;

  if (habit.type === HABIT_TYPES.number) {
    const amount = amountOn(habit, day);
    const target = targetOf(habit);
    const step = target >= 30 ? 15 : 1;
    return h('div', { class: `stepper${amount >= target ? ' is-met' : ''}` },
      h('button', {
        class: 'btn-icon stepper-btn',
        type: 'button',
        'data-focus': focus('minus'),
        'aria-label': `Take ${step} off ${title} ${when}`,
        disabled: amount <= 0,
        onclick: () => save(stepAmount(habit, day, -step)),
      }, icon('minus')),
      h('label', { class: 'stepper-value' },
        h('span', { class: 'visually-hidden' }, `${title} ${when}, in ${habit.unit || 'units'}`),
        h('input', {
          type: 'number',
          min: 0,
          step: 'any',
          inputMode: 'decimal',
          value: formatAmount(amount),
          'data-focus': focus('value'),
          onchange: (event) => save(setAmount(habit, day, event.target.value)),
          onfocus: (event) => event.target.select(),
        }),
        h('span', { class: 'stepper-target', 'aria-hidden': 'true' }, `/ ${formatAmount(target)}`)),
      h('button', {
        class: 'btn-icon stepper-btn',
        type: 'button',
        'data-focus': focus('plus'),
        'aria-label': `Add ${step} to ${title} ${when}`,
        onclick: () => save(stepAmount(habit, day, step)),
      }, icon('plus')));
  }

  if (habit.type === HABIT_TYPES.list) {
    const done = new Set((habit.log || {})[day] || []);
    return h('div', { class: 'chips', role: 'group', 'aria-label': `${title} ${when}` },
      checklistItems(habit).map((name, index) => h('button', {
        class: `chip${done.has(index) ? ' is-on' : ''}`,
        type: 'button',
        'aria-pressed': String(done.has(index)),
        'data-focus': focus(index),
        onclick: () => save(toggleListItem(habit, day, index)),
      }, done.has(index) && icon('checkSmall'), name)));
  }

  const done = isMetOn(habit, day);
  return h('button', {
    class: `check-button${done ? ' is-on' : ''}`,
    type: 'button',
    'aria-pressed': String(done),
    'aria-label': `${title} done ${when}`,
    'data-focus': focus('check'),
    onclick: () => save(setChecked(habit, day, !done)),
  }, icon('checkSmall'), done ? 'Done' : 'Mark done');
}

function habitRow(habit, day) {
  const met = isMetOn(habit, day);
  return h('li', { class: `list-row habit-row${met ? ' is-met' : ''}` },
    icon(met ? 'check' : 'circle', `icon row-icon${met ? ' is-success' : ''}`),
    h('div', { class: 'row-main' },
      h('div', { class: 'row-title' }, h('a', { href: `#/habits/${habit.id}` }, displayTitle('habits', habit))),
      h('p', { class: 'muted small' }, `${goalLabel(habit)} · ${streakText(habit)}`)),
    h('div', { class: 'habit-control' }, habitControl(habit, day)));
}

/* ---------- Today ---------- */

export function habitCounts(day = todayISO()) {
  const list = habitsOn(day);
  return { done: list.filter((habit) => isMetOn(habit, day)).length, total: list.length };
}

function starterButton() {
  return h('button', {
    class: 'btn btn-primary',
    type: 'button',
    onclick: async () => {
      try {
        await addItems('habits', starterHabits());
        toast('Added 8 starter habits. Edit any of them to fit you.');
      } catch (error) {
        toast(`Not added: ${error.message}`, true);
      }
    },
  }, 'Add starter habits');
}

const STARTER_NOTE = 'Starter habits are Prayers, Gym, Quran, Reading, Coding, Course lessons, Sleep and Water. You can edit or delete any of them.';

export function todayHabitsBox() {
  const today = todayISO();
  const list = habitsOn(today);
  const { done, total } = habitCounts(today);
  if (!items('habits').length) {
    return h('section', { class: 'box' },
      h('div', { class: 'box-header' }, h('h2', {}, 'Habits')),
      h('div', { class: 'box-empty' }, h('p', { class: 'muted' }, STARTER_NOTE),
        h('div', { class: 'btn-row' }, starterButton(), newButton('habits', undefined, 'New habit'))));
  }
  return h('section', { class: 'box' },
    h('div', { class: 'box-header' },
      h('h2', {}, 'Habits', h('span', { class: 'muted box-header-note' }, `${done} of ${total} done`)),
      h('a', { class: 'small', href: '#/habits' }, 'All habits')),
    list.length
      ? h('ul', { class: 'list' }, list.map((habit) => habitRow(habit, today)))
      : h('p', { class: 'box-note muted' }, 'No habits planned for today.'));
}

// The longest streak running right now, for the snapshot.
export function topStreak() {
  let best = null;
  for (const habit of items('habits')) {
    const streak = currentStreak(habit);
    if (streak && (!best || streak > best.streak)) best = { habit, streak };
  }
  return best;
}

/* ---------- Habits page ---------- */

function habitCard(habit) {
  const today = todayISO();
  const grid = contributionGrid(habitLevels(habit), {
    small: true,
    weeks: 26,
    ariaLabel: `${displayTitle('habits', habit)}, the last 26 weeks`,
    describe: (day) => `${describeDay(habit, day)} on ${formatDate(day)}`,
  });
  return h('section', { class: 'box habit-card' },
    h('div', { class: 'habit-card-head' },
      h('div', { class: 'habit-card-title' },
        h('h2', {}, h('a', { href: `#/habits/${habit.id}` }, displayTitle('habits', habit))),
        h('p', { class: 'muted small' }, `${goalLabel(habit)} · ${scheduleLabel(habit)}`),
        h('p', { class: 'habit-streaks small' },
          h('span', { class: 'label label-success' }, streakText(habit)),
          h('span', { class: 'muted' }, `Best ${dayCount(bestStreak(habit))}`))),
      isScheduledOn(habit, today)
        ? h('div', { class: 'habit-control' }, habitControl(habit, today))
        : h('span', { class: 'muted small' }, 'Not planned today')),
    h('div', { class: 'habit-card-grid' }, grid.element));
}

export function habitsPage() {
  const list = sortedHabits();
  const head = h('div', { class: 'subhead' },
    h('div', { class: 'subhead-text' },
      h('h1', {}, 'Habits'),
      h('p', {}, 'The small things you do every day, with streaks to keep you going.')),
    newButton('habits'));
  if (!list.length) {
    return [head, h('div', { class: 'box blankslate' },
      icon('check', 'icon blankslate-icon'),
      h('h3', {}, 'No habits yet'),
      h('p', {}, STARTER_NOTE),
      h('div', { class: 'btn-row' }, starterButton(), newButton('habits', undefined, 'New habit')))];
  }
  const { done, total } = habitCounts();
  return [head,
    h('p', { class: 'muted page-note' }, total ? `${done} of ${total} habits done today.` : 'No habits planned for today.'),
    h('div', { class: 'stack' }, list.map(habitCard))];
}

/* ---------- One habit ---------- */

// Days done this month, counted from the day the habit started if that is later.
function monthScore(habit) {
  const today = todayISO();
  const firstLog = Object.keys(habit.log || {}).sort()[0];
  const started = [dayOf(habit.createdAt) || today, firstLog].filter(Boolean).sort()[0];
  const monthStart = `${today.slice(0, 8)}01`;
  let scheduled = 0;
  let met = 0;
  for (let day = started > monthStart ? started : monthStart; day <= today; day = addDays(day, 1)) {
    if (!isScheduledOn(habit, day)) continue;
    scheduled++;
    if (isMetOn(habit, day)) met++;
  }
  return { met, scheduled };
}

export function habitDetailPage(id) {
  const habit = findItem('habits', id);
  const crumb = h('nav', { class: 'breadcrumb', 'aria-label': 'Breadcrumb' }, h('a', { href: '#/habits' }, 'Habits'), h('span', { 'aria-hidden': 'true' }, '/'));
  if (!habit) {
    return [crumb, h('div', { class: 'box blankslate' }, h('h3', {}, 'This habit could not be found'), h('p', {}, 'It may have been deleted.'))];
  }
  const today = todayISO();
  const logDay = viewState.habitLogDay[id] || today;
  const month = monthScore(habit);
  const daysDone = Object.keys(habit.log || {}).filter((day) => isMetOn(habit, day)).length;
  const grid = contributionGrid(habitLevels(habit), { ariaLabel: `${displayTitle('habits', habit)}, the last year`, describe: (day) => `${describeDay(habit, day)} on ${formatDate(day)}` });
  const picker = h('input', {
    type: 'date',
    class: 'date-input',
    value: logDay,
    max: today,
    'aria-label': 'Day to log',
    onchange: (event) => {
      if (!event.target.value) return;
      viewState.habitLogDay[id] = event.target.value > today ? today : event.target.value;
      rerender();
    },
  });
  return [
    crumb,
    h('div', { class: 'detail-head' },
      h('div', { class: 'detail-title' },
        h('h1', {}, displayTitle('habits', habit)),
        h('p', { class: 'detail-meta muted' }, `${goalLabel(habit)} · ${scheduleLabel(habit)}`)),
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn', type: 'button', 'data-edit': true, onclick: () => openForm('habits', habit) }, icon('pencil'), 'Edit'),
        h('button', { class: 'btn btn-danger', type: 'button', onclick: () => confirmDelete('habits', habit, 'This removes the habit and its whole history from your site. A recent copy is kept in your backups.') }, 'Delete'))),
    h('div', { class: 'stack' },
      h('div', { class: 'stats' },
        stat('Current streak', `${currentStreak(habit)}`, currentStreak(habit) === 1 ? 'day' : 'days'),
        stat('Best streak', `${bestStreak(habit)}`, bestStreak(habit) === 1 ? 'day' : 'days'),
        stat('This month', `${month.met}/${month.scheduled}`, 'days done'),
        stat('All time', `${daysDone}`, daysDone === 1 ? 'day done' : 'days done')),
      boxSection('History', h('div', { class: 'box-body' }, grid.element)),
      boxSection('Log a day', h('div', { class: 'box-body log-day' },
        h('div', { class: 'log-day-pick' },
          picker,
          logDay !== today && h('button', { class: 'btn btn-small', type: 'button', onclick: () => { delete viewState.habitLogDay[id]; rerender(); } }, 'Back to today')),
        isScheduledOn(habit, logDay)
          ? habitControl(habit, logDay)
          : h('p', { class: 'muted' }, `${displayTitle('habits', habit)} is not planned for ${WEEKDAY_NAMES[parseDay(logDay).getDay()]}s. Change "Which days?" if you want to log it.`))),
      habit.notes && boxSection('Notes', h('div', { class: 'box-body' }, h('p', { class: 'prose' }, habit.notes)))),
  ];
}
