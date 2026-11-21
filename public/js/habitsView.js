// The habit pieces: check-in controls, the Today box, the Habits page and each habit's page.
import { HABIT_TYPES, WEEKDAY_NAMES, dayOf, displayTitle, formatDate, todayISO } from './schema.js';
import { h, toast } from './ui.js';
import { addItems, findItem, items } from './store.js';
import { openForm } from './form.js';
import { icon } from './icons.js';
import { archiveButton, boxSection, confirmDelete, newButton, rerender, stat, viewState, withUndo } from './components.js';
import { contributionGrid } from './grid.js';
import { addDays, parseDay } from './tasks.js';
import {
  amountOn, bestStreak, checklistItems, currentStreak, describeDay, formatAmount, habitLevels, habitsOn,
  isMetOn, isScheduledOn, moveHabit, setAmount, setChecked, setComplete, sortedHabits, starterHabits, stepAmount, targetOf, toggleListItem,
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

// The round button before every habit: one tap marks the whole day done, a second tap clears it.
export function habitCheck(habit, day) {
  const met = isMetOn(habit, day);
  const title = displayTitle('habits', habit);
  const when = day === todayISO() ? 'today' : `on ${formatDate(day)}`;
  return h('button', {
    class: `habit-check${met ? ' is-on' : ''}`,
    type: 'button',
    'aria-pressed': String(met),
    'aria-label': met ? `${title} is done ${when}. Tap to clear it` : `Mark ${title} done ${when}`,
    title: met ? 'Done. Tap to clear' : 'Mark done',
    'data-focus': `habit-${habit.id}-${day}-done`,
    onclick: () => (met
      ? withUndo(() => setComplete(habit, day, false), `Cleared ${title} for ${when}`)
      : save(setComplete(habit, day, true))),
  }, icon('checkSmall'));
}

// Yes-or-no habits need nothing besides the round button.
const extraControl = (habit, day) => (habit.type === HABIT_TYPES.number || habit.type === HABIT_TYPES.list
  ? h('div', { class: 'habit-control' }, habitControl(habit, day))
  : null);

function habitRow(habit, day) {
  const met = isMetOn(habit, day);
  return h('li', { class: `list-row habit-row${met ? ' is-met' : ''}` },
    habitCheck(habit, day),
    h('div', { class: 'row-main' },
      h('div', { class: 'row-title' }, h('a', { href: `#/habits/${habit.id}` }, displayTitle('habits', habit))),
      h('p', { class: 'muted small' }, `${goalLabel(habit)} · ${streakText(habit)}`)),
    extraControl(habit, day));
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
    list.length ? habitList(list, today) : h('p', { class: 'box-note muted' }, 'No habits planned for today.'));
}

// What is left stays as full rows. What is done folds into one line you can open.
function habitList(list, day) {
  const left = list.filter((habit) => !isMetOn(habit, day));
  const done = list.filter((habit) => isMetOn(habit, day));
  const open = viewState.showDoneHabits || !left.length;
  const shown = open ? list : left;
  const toggle = (show, ...content) => h('li', { class: 'habits-done-row' },
    h('button', {
      class: 'habits-done-toggle',
      type: 'button',
      'aria-expanded': String(!show),
      onclick: () => { viewState.showDoneHabits = show; rerender(); },
    }, ...content));
  return h('ul', { class: 'list' },
    shown.map((habit) => habitRow(habit, day)),
    !open && done.length > 0 && toggle(true,
      icon('check', 'icon is-success'),
      h('span', { class: 'habits-done-names' }, h('strong', {}, 'Done: '), done.map((habit) => displayTitle('habits', habit)).join(', ')),
      h('span', { class: 'link small' }, 'Show')),
    open && done.length > 0 && left.length > 0 && toggle(false, h('span', { class: 'link small' }, 'Hide done habits')));
}

// The longest streak running right now, for the snapshot.
export function topStreak() {
  let best = null;
  for (const habit of sortedHabits()) {
    const streak = currentStreak(habit);
    if (streak && (!best || streak > best.streak)) best = { habit, streak };
  }
  return best;
}

/* ---------- Habits page ---------- */

// The last 7 days as small squares, today on the right. The full history is on the habit's own page.
function weekStrip(habit) {
  const today = todayISO();
  const levels = habitLevels(habit);
  const days = Array.from({ length: 7 }, (_, index) => addDays(today, index - 6));
  return h('ol', { class: 'week-strip', 'aria-label': `${displayTitle('habits', habit)}, the last 7 days` },
    days.map((day) => {
      const planned = isScheduledOn(habit, day);
      return h('li', { class: 'week-strip-day' },
        h('span', { class: 'week-strip-name', 'aria-hidden': 'true' }, WEEKDAY_NAMES[parseDay(day).getDay()].slice(0, 1)),
        h('span', {
          class: `grid-day${planned ? '' : ' is-off'}${day === today ? ' is-today' : ''}`,
          'data-level': levels.get(day) || 0,
          title: `${formatDate(day)}: ${planned ? describeDay(habit, day) : 'not planned'}`,
        }, h('span', { class: 'visually-hidden' }, `${formatDate(day)}: ${planned ? describeDay(habit, day) : 'not planned'}`)));
    }));
}

function habitListRow(habit) {
  const today = todayISO();
  const planned = isScheduledOn(habit, today);
  const met = planned && isMetOn(habit, today);
  return h('li', { class: `list-row habit-row habit-page-row${met ? ' is-met' : ''}` },
    planned ? habitCheck(habit, today) : h('span', { class: 'habit-check-spacer' }),
    h('div', { class: 'row-main' },
      h('div', { class: 'row-title' }, h('a', { href: `#/habits/${habit.id}` }, displayTitle('habits', habit))),
      h('p', { class: 'muted small' }, [goalLabel(habit), scheduleLabel(habit), streakText(habit), `best ${dayCount(bestStreak(habit))}`].join(' · '))),
    weekStrip(habit),
    planned ? (extraControl(habit, today) || h('span', { class: 'habit-control', 'aria-hidden': 'true' })) : h('span', { class: 'muted small habit-control' }, 'Not planned today'));
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
  const reordering = viewState.reorderHabits;
  const bar = h('div', { class: 'page-note habits-bar' },
    h('p', { class: 'muted' }, total ? `${done} of ${total} habits done today.` : 'No habits planned for today.'),
    list.length > 1 && h('button', {
      class: `btn btn-small${reordering ? ' btn-primary' : ''}`,
      type: 'button',
      onclick: () => { viewState.reorderHabits = !reordering; rerender(); },
    }, reordering ? 'Done' : 'Reorder'));
  if (reordering) {
    const name = (habit) => displayTitle('habits', habit);
    return [head, bar, h('section', { class: 'box' },
      h('p', { class: 'box-note muted' }, 'Habits show in this order on Today and on this page.'),
      h('ol', { class: 'list' }, list.map((habit, index) => h('li', { class: 'list-row reorder-row' },
        h('span', { class: 'reorder-name' }, name(habit)),
        h('div', { class: 'btn-row' },
          h('button', { class: 'btn btn-small', type: 'button', disabled: index === 0, 'aria-label': `Move ${name(habit)} up`, 'data-focus': `move-${habit.id}-up`, onclick: () => save(moveHabit(habit.id, -1)) }, '↑'),
          h('button', { class: 'btn btn-small', type: 'button', disabled: index === list.length - 1, 'aria-label': `Move ${name(habit)} down`, 'data-focus': `move-${habit.id}-down`, onclick: () => save(moveHabit(habit.id, 1)) }, '↓'))))))];
  }
  return [head, bar,
    h('section', { class: 'box' }, h('ul', { class: 'list' }, list.map(habitListRow))),
    h('p', { class: 'muted small page-note' }, 'Open a habit to see its full history.')];
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
  const grid = contributionGrid(habitLevels(habit), { ariaLabel: displayTitle('habits', habit), describe: (day) => `${describeDay(habit, day)} on ${formatDate(day)}` });
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
        archiveButton('habits', habit),
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
