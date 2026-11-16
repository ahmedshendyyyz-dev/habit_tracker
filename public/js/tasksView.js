// The task pieces: rows, quick add, the Today box and the week planner.
import { REPEAT, displayTitle, formatDate, todayISO } from './schema.js';
import { h, toast } from './ui.js';
import { findItem, items, saveItem, updateItem } from './store.js';
import { openForm } from './form.js';
import { icon } from './icons.js';
import { boxSection, counter, newButton, rerender, subhead, viewState } from './components.js';
import {
  addDays, formatTime, isDoneOn, isEvent, isRepeating, nextOccurrence, overdueTasks,
  parseDay, repeatLabel, setDone, tasksOn, undatedTasks, weekDays,
} from './tasks.js';

const join = (parts) => parts.filter(Boolean).flatMap((part, index) => (index ? [' · ', part] : [part]));

function linkTo(key, id) {
  const item = id && findItem(key, id);
  return item ? h('a', { href: `#/${key}/${item.id}` }, displayTitle(key, item)) : null;
}

async function toggle(task, day, checkbox) {
  try {
    await setDone(task, day, checkbox.checked);
  } catch (error) {
    checkbox.checked = !checkbox.checked;
    toast(`Not saved: ${error.message}`, true);
  }
}

function checkOrIcon(task, day, done) {
  if (isEvent(task)) return icon('calendar', 'icon row-icon');
  return h('input', {
    type: 'checkbox',
    class: 'row-check',
    checked: done,
    'data-focus': `task-${task.id}-${day}`,
    'aria-label': `Mark "${displayTitle('tasks', task)}" as done`,
    onchange: (event) => toggle(task, day, event.target),
  });
}

// One task in a list. day is the day it is shown for.
export function taskRow(task, day, { showDate = false, overdue = false } = {}) {
  const done = isDoneOn(task, day);
  const when = showDate ? nextOccurrence(task) : '';
  const meta = join([
    when && formatDate(when),
    repeatLabel(task),
    linkTo('goals', task.goalId) && ['Goal: ', linkTo('goals', task.goalId)],
    linkTo('projects', task.projectId) && ['Project: ', linkTo('projects', task.projectId)],
  ]);
  return h('li', { class: `list-row${done ? ' is-done' : ''}` },
    checkOrIcon(task, day, done),
    h('div', { class: 'row-main' },
      h('div', { class: 'row-title row-title-task' },
        task.time && h('span', { class: 'task-time' }, formatTime(task.time)),
        h('a', { href: `#/tasks/${task.id}` }, displayTitle('tasks', task)),
        overdue && h('span', { class: 'label label-danger' }, `Overdue since ${formatDate(task.date)}`)),
      meta.length > 0 && h('p', { class: 'muted small' }, meta)));
}

export function quickAdd(day, placeholder) {
  const input = h('input', {
    type: 'text',
    class: 'quick-add-input',
    placeholder,
    'aria-label': placeholder,
    maxLength: 200,
    'data-focus': `quick-${day}`,
  });
  return h('form', {
    class: 'quick-add',
    onsubmit: async (event) => {
      event.preventDefault();
      const title = input.value.trim();
      if (!title) return;
      // Read-only rather than disabled, so the cursor stays here for the next task.
      input.readOnly = true;
      try {
        await saveItem('tasks', {
          id: crypto.randomUUID(),
          createdAt: new Date().toISOString(),
          title,
          kind: 'Task',
          date: day,
          time: '',
          repeat: REPEAT.never,
          days: [],
          goalId: '',
          projectId: '',
          notes: '',
          done: false,
          doneDate: '',
          doneDates: [],
        });
      } catch (error) {
        input.readOnly = false;
        toast(`Not saved: ${error.message}`, true);
      }
    },
  }, icon('plus', 'icon muted'), input);
}

/* ---------- Today ---------- */

export function todayCounts(day = todayISO()) {
  const todo = tasksOn(day).filter((task) => !isEvent(task));
  return { done: todo.filter((task) => isDoneOn(task, day)).length, total: todo.length };
}

// For the tab counter: what is still left to do today, overdue included.
export function tasksLeftToday() {
  const { done, total } = todayCounts();
  return total - done + overdueTasks().length;
}

export function todayTasksBox() {
  const today = todayISO();
  const overdue = overdueTasks();
  const list = tasksOn(today);
  const { done, total } = todayCounts(today);
  return h('section', { class: 'box' },
    h('div', { class: 'box-header' },
      h('h2', {}, 'Today', total > 0 && h('span', { class: 'muted box-header-note' }, `${done} of ${total} done`)),
      h('a', { class: 'small', href: '#/tasks' }, 'Week planner')),
    (overdue.length || list.length)
      ? h('ul', { class: 'list' },
        overdue.map((task) => taskRow(task, task.date, { overdue: true })),
        list.map((task) => taskRow(task, today)))
      : h('p', { class: 'box-note muted' }, 'Nothing planned for today. Add something below.'),
    h('div', { class: 'box-footer' }, quickAdd(today, 'Add a task for today, then press Enter')));
}

/* ---------- Week planner ---------- */

function weekChip(task, day) {
  const done = isDoneOn(task, day);
  const movable = !isRepeating(task);
  return h('li', {
    class: `week-item${done ? ' is-done' : ''}${isEvent(task) ? ' is-event' : ''}`,
    draggable: movable ? 'true' : undefined,
    title: movable ? 'Drag to another day to move it' : repeatLabel(task),
    ondragstart: movable ? (event) => {
      event.dataTransfer.setData('text/plain', task.id);
      event.dataTransfer.effectAllowed = 'move';
    } : undefined,
  },
    checkOrIcon(task, day, done),
    h('div', { class: 'week-item-text' },
      task.time && h('span', { class: 'task-time' }, formatTime(task.time)),
      h('a', { href: `#/tasks/${task.id}` }, displayTitle('tasks', task)),
      isRepeating(task) && h('span', { class: 'week-repeat', title: repeatLabel(task) }, icon('repeat'))));
}

function weekColumn(day) {
  const today = todayISO();
  const date = parseDay(day);
  const list = tasksOn(day);
  const column = h('section', {
    class: `week-day${day === today ? ' is-today' : ''}${day < today ? ' is-past' : ''}`,
    'aria-label': date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }),
    ondragover: (event) => { event.preventDefault(); column.classList.add('is-drop'); },
    ondragleave: () => column.classList.remove('is-drop'),
    ondrop: async (event) => {
      event.preventDefault();
      column.classList.remove('is-drop');
      const id = event.dataTransfer.getData('text/plain');
      const task = id && findItem('tasks', id);
      if (!task || task.date === day) return;
      try {
        await updateItem('tasks', id, (latest) => { latest.date = day; });
        toast(`Moved to ${formatDate(day)}`);
      } catch (error) {
        toast(`Not moved: ${error.message}`, true);
      }
    },
  },
    h('div', { class: 'week-day-head' },
      h('span', { class: 'week-day-name' }, date.toLocaleDateString(undefined, { weekday: 'short' })),
      h('span', { class: 'week-day-date' }, String(date.getDate()))),
    list.length ? h('ul', { class: 'week-list' }, list.map((task) => weekChip(task, day))) : null,
    h('button', {
      class: 'btn-add-day',
      type: 'button',
      'aria-label': `Add a task on ${formatDate(day)}`,
      onclick: () => openForm('tasks', null, { date: day }),
    }, icon('plus'), h('span', {}, 'Add')));
  return column;
}

function weekView() {
  const days = weekDays(viewState.weekOffset);
  const overdue = overdueTasks();
  const step = (delta) => { viewState.weekOffset = delta === 0 ? 0 : viewState.weekOffset + delta; rerender(); };
  const range = `${formatDate(days[0])} – ${formatDate(days[6])}`;
  return [
    h('div', { class: 'week-nav' },
      h('div', { class: 'btn-group' },
        h('button', { class: 'btn btn-small', type: 'button', 'aria-label': 'Previous week', onclick: () => step(-1) }, icon('chevronLeft')),
        h('button', { class: 'btn btn-small', type: 'button', onclick: () => step(0), disabled: viewState.weekOffset === 0 }, 'This week'),
        h('button', { class: 'btn btn-small', type: 'button', 'aria-label': 'Next week', onclick: () => step(1) }, icon('chevronRight'))),
      h('h2', { class: 'week-range' }, range)),
    overdue.length > 0 && boxSection(['Overdue ', counter(overdue.length)], h('ul', { class: 'list' }, overdue.map((task) => taskRow(task, task.date, { overdue: true })))),
    h('div', { class: 'week-grid' }, days.map(weekColumn)),
    h('p', { class: 'muted small week-hint' }, 'Drag a one-off task to another day to move it. Repeating tasks show a repeat icon and stay on their schedule.'),
  ];
}

/* ---------- List view ---------- */

function listView() {
  const today = todayISO();
  const all = items('tasks');
  const sections = [];
  const add = (title, rows) => { if (rows.length) sections.push(boxSection([`${title} `, counter(rows.length)], h('ul', { class: 'list' }, rows))); };

  add('Overdue', overdueTasks().map((task) => taskRow(task, task.date, { overdue: true })));
  add('Today', tasksOn(today).map((task) => taskRow(task, today)));
  const soon = [];
  for (let offset = 1; offset <= 7; offset++) {
    const day = addDays(today, offset);
    tasksOn(day).filter((task) => !isRepeating(task)).forEach((task) => soon.push(taskRow(task, day, { showDate: true })));
  }
  add('Next 7 days', soon);
  const later = all.filter((task) => !isRepeating(task) && task.date > addDays(today, 7)).sort((a, b) => a.date.localeCompare(b.date));
  add('Later', later.map((task) => taskRow(task, task.date, { showDate: true })));
  add('Repeating', all.filter(isRepeating).map((task) => taskRow(task, nextOccurrence(task) || today, { showDate: true })));
  add('No date', undatedTasks().map((task) => taskRow(task, '')));
  const done = all.filter((task) => !isRepeating(task) && task.done && !isEvent(task))
    .sort((a, b) => (b.doneDate || '').localeCompare(a.doneDate || '')).slice(0, 20);
  add('Recently done', done.map((task) => taskRow(task, task.date || '')));
  return sections.length ? h('div', { class: 'stack' }, sections) : null;
}

export function tasksPage() {
  const view = viewState.tasksView;
  const tabButton = (name, label, iconName) => h('button', {
    class: `box-tab${view === name ? ' is-selected' : ''}`,
    type: 'button',
    'aria-pressed': String(view === name),
    onclick: () => { viewState.tasksView = name; rerender(); },
  }, icon(iconName), label);
  const hasTasks = items('tasks').length > 0;
  return [
    subhead('tasks', 0),
    h('div', { class: 'view-switch' }, tabButton('week', 'Week', 'calendar'), tabButton('list', 'List', 'list')),
    view === 'list'
      ? (hasTasks ? listView() : h('div', { class: 'box blankslate' }, icon('calendar', 'icon blankslate-icon'),
        h('h3', {}, 'No tasks yet'), h('p', {}, 'Add your first task, or switch to the week view and add one on a day.'), newButton('tasks')))
      : weekView(),
  ];
}

/* ---------- On a goal or project page ---------- */

export function linkedTasks(field, id) {
  const linked = items('tasks').filter((task) => task[field] === id);
  if (!linked.length) return null;
  const today = todayISO();
  const doneCount = linked.filter((task) => !isRepeating(task) && task.done).length;
  return boxSection(['Tasks ', counter(linked.length)],
    h('ul', { class: 'list' }, linked.map((task) => taskRow(task, isRepeating(task) ? nextOccurrence(task) || today : task.date || today, { showDate: true }))),
    h('span', { class: 'muted small' }, `${doneCount} done`));
}

export function taskDetails(task) {
  const today = todayISO();
  const rows = [
    ['Type', task.kind || 'Task'],
    ['When', task.date ? join([formatDate(task.date), task.time && formatTime(task.time)]) : 'No date'],
    isRepeating(task) && ['Repeats', repeatLabel(task)],
    isRepeating(task) && ['Next', formatDate(nextOccurrence(task)) || 'Not scheduled'],
    isRepeating(task) && !isEvent(task) && ['Done', `${(task.doneDates || []).length} times so far`],
    !isRepeating(task) && !isEvent(task) && ['Status', task.done ? `Done${task.doneDate ? ` ${formatDate(task.doneDate)}` : ''}` : task.date && task.date < today ? 'Overdue' : 'To do'],
    task.goalId && linkTo('goals', task.goalId) && ['Goal', linkTo('goals', task.goalId)],
    task.projectId && linkTo('projects', task.projectId) && ['Project', linkTo('projects', task.projectId)],
  ].filter(Boolean);
  return boxSection('Details', h('dl', { class: 'detail-list' }, rows.map(([term, value]) => [h('dt', {}, term), h('dd', {}, value)])));
}

export function taskDoneButton(task) {
  if (isEvent(task)) return null;
  const day = isRepeating(task) ? todayISO() : task.date || todayISO();
  if (isRepeating(task) && !tasksOn(day).includes(task)) return null;
  const done = isDoneOn(task, day);
  return h('button', {
    class: done ? 'btn' : 'btn btn-primary',
    type: 'button',
    onclick: async () => {
      try {
        await setDone(task, day, !done);
        toast(done ? 'Marked as not done' : 'Done. Nice work!');
      } catch (error) {
        toast(`Not saved: ${error.message}`, true);
      }
    },
  }, icon('check'), done ? (isRepeating(task) ? 'Undo today' : 'Mark as not done') : (isRepeating(task) ? 'Done today' : 'Mark as done'));
}
