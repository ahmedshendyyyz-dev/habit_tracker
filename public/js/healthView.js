// The Health page: weight over time, workouts, and how each exercise is going.
import { HUBS, displayTitle, formatDate, todayISO } from './schema.js';
import { h, toast } from './ui.js';
import { items, saveItem } from './store.js';
import { openForm } from './form.js';
import { icon } from './icons.js';
import { boxSection, counter, rerender, stat, viewState } from './components.js';
import { contributionGrid } from './grid.js';
import { lineChart } from './charts.js';
import { addDays } from './tasks.js';
import { daysBetween } from './goals.js';

const kg = (value) => `${Math.round(value * 10) / 10} kg`;
const byDate = (a, b) => (a.date === b.date ? (a.createdAt || '').localeCompare(b.createdAt || '') : a.date.localeCompare(b.date));

// One reading per day: the last one you entered that day.
export function weightSeries() {
  const perDay = new Map();
  for (const entry of [...items('weights')].sort(byDate)) {
    if (entry.date && Number(entry.kg) > 0) perDay.set(entry.date, Number(entry.kg));
  }
  return [...perDay].map(([day, value]) => ({ day, value }));
}

export function exerciseSummary(exercise) {
  const parts = [];
  if (exercise.sets && exercise.reps) parts.push(`${exercise.sets}×${exercise.reps}`);
  else if (exercise.sets) parts.push(`${exercise.sets} sets`);
  else if (exercise.reps) parts.push(`${exercise.reps} reps`);
  if (exercise.kg) parts.push(`@ ${kg(exercise.kg)}`);
  return [exercise.name, parts.join(' ')].filter(Boolean).join(' ');
}

export function workoutMeta(workout) {
  const count = (workout.exercises || []).length;
  return [
    formatDate(workout.date),
    count && `${count} ${count === 1 ? 'exercise' : 'exercises'}`,
    workout.duration && `${workout.duration} min`,
  ].filter(Boolean).join(' · ');
}

/* ---------- Weight ---------- */

function weightForm() {
  const value = h('input', { type: 'number', min: 20, max: 400, step: 'any', inputMode: 'decimal', required: true, placeholder: 'kg', 'aria-label': 'Weight in kg', class: 'inline-input inline-number' });
  const date = h('input', { type: 'date', value: todayISO(), max: todayISO(), 'aria-label': 'Date', class: 'inline-input' });
  return h('form', {
    class: 'inline-form',
    onsubmit: async (event) => {
      event.preventDefault();
      const number = Number(value.value);
      if (!(number > 0)) return;
      try {
        await saveItem('weights', { id: crypto.randomUUID(), createdAt: new Date().toISOString(), date: date.value || todayISO(), kg: number, note: '' });
        toast('Weight logged');
      } catch (error) {
        toast(`Not saved: ${error.message}`, true);
      }
    },
  }, value, date, h('button', { class: 'btn btn-primary', type: 'submit' }, 'Log weight'));
}

// "Show all 12 weights" under a short list, and "Show fewer" once it is open.
function showAllButton(flag, total, shown, noun) {
  if (total <= shown) return null;
  return h('div', { class: 'box-footer show-all' }, h('button', {
    class: 'btn btn-small btn-invisible',
    type: 'button',
    onclick: () => { viewState[flag] = !viewState[flag]; rerender(); },
  }, viewState[flag] ? 'Show fewer' : `Show all ${total} ${noun}`));
}

function weightBox(series) {
  const all = [...items('weights')].sort(byDate).reverse();
  const recent = viewState.allWeights ? all : all.slice(0, 3);
  return boxSection(['Weight ', counter(items('weights').length)], [
    h('div', { class: 'box-body stack-sm' },
      weightForm(),
      series.length
        ? lineChart(series, { label: 'Your weight over time, in kg', format: kg })
        : h('p', { class: 'muted' }, 'Log your weight above. Once a week, at the same time of day, gives the clearest trend.')),
    recent.length > 0 && h('ul', { class: 'list list-top' }, recent.map((entry) => h('li', { class: 'list-row' },
      h('div', { class: 'row-main' },
        h('div', { class: 'row-title row-title-task' }, h('a', { href: `#/weights/${entry.id}` }, kg(Number(entry.kg)))),
        h('p', { class: 'muted small' }, [formatDate(entry.date), entry.note].filter(Boolean).join(' · ')))))),
    showAllButton('allWeights', all.length, 3, 'weights'),
  ]);
}

/* ---------- Workouts ---------- */

function workoutsBox() {
  const workouts = [...items('workouts')].sort(byDate).reverse();
  const counts = new Map();
  for (const workout of workouts) if (workout.date) counts.set(workout.date, (counts.get(workout.date) || 0) + 1);
  const grid = contributionGrid(counts, { noun: ['workout', 'workouts'], ariaLabel: 'Your workouts' });
  return boxSection(['Workouts ', counter(workouts.length)], [
    h('div', { class: 'box-body' }, grid.element),
    workouts.length
      ? h('ul', { class: 'list list-top' }, (viewState.allWorkouts ? workouts : workouts.slice(0, 5)).map((workout) => h('li', { class: 'list-row' },
        icon('tool', 'icon row-icon'),
        h('div', { class: 'row-main' },
          h('div', { class: 'row-title row-title-task' }, h('a', { href: `#/workouts/${workout.id}` }, displayTitle('workouts', workout))),
          h('p', { class: 'muted small' }, workoutMeta(workout)),
          (workout.exercises || []).length > 0 && h('p', { class: 'row-preview clamp' }, workout.exercises.map(exerciseSummary).join(', '))))))
      : h('p', { class: 'box-note muted list-top' }, 'No workouts yet. Each one you log also ticks your Gym habit for that day.'),
    showAllButton('allWorkouts', workouts.length, 5, 'workouts'),
  ], h('button', { class: 'btn btn-small', type: 'button', onclick: () => openForm('workouts') }, icon('plus'), 'New workout'));
}

function exerciseBox() {
  // The heaviest weight for each exercise, per day.
  const history = new Map();
  for (const workout of [...items('workouts')].sort(byDate)) {
    for (const exercise of workout.exercises || []) {
      const name = (exercise.name || '').trim();
      const weight = Number(exercise.kg) || 0;
      if (!name || !weight || !workout.date) continue;
      const key = name.toLowerCase();
      if (!history.has(key)) history.set(key, { name, days: new Map() });
      const days = history.get(key).days;
      days.set(workout.date, Math.max(days.get(workout.date) || 0, weight));
    }
  }
  if (!history.size) return null;
  const names = [...history.values()].sort((a, b) => b.days.size - a.days.size);
  const chosen = history.get(viewState.exercise) || names[0];
  const points = [...chosen.days].map(([day, value]) => ({ day, value }));
  const best = Math.max(...points.map((point) => point.value));
  const select = h('select', {
    class: 'inline-input',
    'aria-label': 'Exercise',
    onchange: (event) => { viewState.exercise = event.target.value; rerender(); },
  }, names.map((entry) => h('option', { value: entry.name.toLowerCase(), selected: entry === chosen }, entry.name)));
  return boxSection('Exercise progress', h('div', { class: 'box-body stack-sm' },
    h('div', { class: 'inline-form' }, select, h('span', { class: 'muted small' }, `Best ${kg(best)} · ${points.length} ${points.length === 1 ? 'session' : 'sessions'}`)),
    lineChart(points, { label: `Heaviest ${chosen.name} per session, in kg`, format: kg })));
}

/* ---------- The page ---------- */

export function healthPage() {
  const series = weightSeries();
  const latest = series[series.length - 1];
  const monthAgo = addDays(todayISO(), -30);
  const before = [...series].reverse().find((point) => point.day <= monthAgo) || series[0];
  const change = latest && before && before !== latest ? latest.value - before.value : null;
  const workouts = items('workouts');
  const thisWeek = workouts.filter((w) => w.date && w.date >= addDays(todayISO(), -6) && w.date <= todayISO()).length;
  const thisMonth = workouts.filter((w) => w.date && w.date.slice(0, 7) === todayISO().slice(0, 7)).length;
  const last = [...workouts].filter((w) => w.date && w.date <= todayISO()).sort(byDate).pop();
  const sinceLast = last ? daysBetween(last.date, todayISO()) : null;

  return [
    h('div', { class: 'subhead' },
      h('div', { class: 'subhead-text' }, h('h1', {}, HUBS.health.label), h('p', {}, HUBS.health.blurb)),
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn btn-primary', type: 'button', 'data-add': 'workouts', onclick: () => openForm('workouts') }, 'New workout'))),
    h('div', { class: 'stack' },
      h('div', { class: 'stats' },
        stat('Weight', latest ? String(Math.round(latest.value * 10) / 10) : '–',
          latest ? `kg${change !== null ? ` · ${change > 0 ? '+' : change < 0 ? '−' : '±'}${Math.abs(Math.round(change * 10) / 10)} since ${formatDate(before.day)}` : ''}` : 'not logged yet'),
        stat('Workouts', String(thisWeek), 'in the last 7 days'),
        stat('This month', String(thisMonth), thisMonth === 1 ? 'workout' : 'workouts'),
        stat('Last workout', sinceLast === null ? '–' : sinceLast === 0 ? 'Today' : String(sinceLast),
          sinceLast === null ? 'none yet' : sinceLast === 0 ? (last.title || '') : `${sinceLast === 1 ? 'day' : 'days'} ago`)),
      weightBox(series),
      workoutsBox(),
      exerciseBox()),
  ];
}

// On a workout's own page: the exercises as a table.
export function workoutTable(workout) {
  const list = workout.exercises || [];
  if (!list.length) return null;
  return boxSection(['Exercises ', counter(list.length)], h('div', { class: 'table-scroll' },
    h('table', { class: 'data-table' },
      h('thead', {}, h('tr', {}, ['Exercise', 'Sets', 'Reps', 'Weight'].map((text) => h('th', { scope: 'col' }, text)))),
      h('tbody', {}, list.map((exercise) => h('tr', {},
        h('td', {}, exercise.name),
        h('td', {}, exercise.sets === '' ? '–' : String(exercise.sets)),
        h('td', {}, exercise.reps === '' ? '–' : String(exercise.reps)),
        h('td', {}, exercise.kg ? kg(exercise.kg) : '–')))))));
}
