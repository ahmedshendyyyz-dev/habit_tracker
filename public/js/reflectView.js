// The Reflect page: quick notes about your day, and a weekly look back.
import { COLLECTIONS, MOODS, displayTitle, formatDate, todayISO } from './schema.js';
import { h, toast } from './ui.js';
import { items, saveItem } from './store.js';
import { icon } from './icons.js';
import { boxSection, counter, newButton, rerender, stat, viewState } from './components.js';
import { isEvent, isRepeating, weekDays } from './tasks.js';
import { habitStart, habitsOn, isMetOn } from './habits.js';
import { daysBetween, logOf, milestonesOf } from './goals.js';

const RATINGS = COLLECTIONS.reviews.fields.find((field) => field.key === 'rating').options;
const inRange = (day, days) => Boolean(day) && day >= days[0] && day <= days[6];
const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`;

export function reviewFor(weekStart) {
  return items('reviews').find((review) => review.week === weekStart) || null;
}

// Last week's "focus for next week", shown on Today.
export function currentFocus() {
  const lastWeek = weekDays(-1)[0];
  const review = reviewFor(lastWeek);
  return review && review.focus ? review : null;
}

// Near the end of the week, a nudge to write the review.
export function reviewIsDue() {
  const days = weekDays(0);
  return todayISO() >= days[5] && !reviewFor(days[0]);
}

/* ---------- What happened in a week ---------- */

function weekSummary(days) {
  const today = todayISO();
  let tasksDone = 0;
  for (const task of items('tasks')) {
    if (isEvent(task)) continue;
    if (isRepeating(task)) tasksDone += (task.doneDates || []).filter((day) => inRange(day, days)).length;
    else if (task.done && inRange(task.doneDate, days)) tasksDone++;
  }
  let planned = 0;
  let kept = 0;
  for (const day of days) {
    if (day > today) break;
    for (const habit of habitsOn(day)) {
      if (day < habitStart(habit)) continue;
      planned++;
      if (isMetOn(habit, day)) kept++;
    }
  }
  const workouts = items('workouts').filter((w) => inRange(w.date, days)).length;
  const minutes = items('sessions').filter((s) => inRange(s.date, days)).reduce((sum, s) => sum + (Number(s.minutes) || 0), 0);
  const pages = items('books').reduce((sum, book) => sum + Object.entries(book.log || {}).filter(([day]) => inRange(day, days)).reduce((t, [, n]) => t + (Number(n) || 0), 0), 0);
  const goalLogs = items('goals').reduce((sum, goal) => sum + logOf(goal).filter((entry) => inRange(entry.day, days)).length, 0);
  const milestones = items('goals').flatMap((goal) => milestonesOf(goal)
    .filter((m) => m.done && inRange(m.doneDate, days))
    .map((m) => ({ goal, milestone: m })));
  return { tasksDone, planned, kept, workouts, minutes, pages, goalLogs, milestones };
}

/* ---------- Quick note ---------- */

function quickNote() {
  let mood = MOODS[0];
  const text = h('textarea', { class: 'note-input', rows: 3, maxLength: 4000, placeholder: 'A few lines about today…', 'aria-label': 'Your note for today' });
  const chips = h('div', { class: 'chips chips-left', role: 'group', 'aria-label': 'How was the day?' },
    MOODS.slice(1).map((name) => {
      const chip = h('button', {
        class: 'chip',
        type: 'button',
        'aria-pressed': 'false',
        onclick: () => {
          mood = mood === name ? MOODS[0] : name;
          chips.querySelectorAll('.chip').forEach((other) => {
            const on = other.textContent === mood;
            other.classList.toggle('is-on', on);
            other.setAttribute('aria-pressed', String(on));
          });
        },
      }, name);
      return chip;
    }));
  return boxSection('Today', h('form', {
    class: 'box-body stack-sm',
    onsubmit: async (event) => {
      event.preventDefault();
      if (!text.value.trim()) { text.focus(); return; }
      try {
        await saveItem('journal', { id: crypto.randomUUID(), createdAt: new Date().toISOString(), date: todayISO(), mood, title: '', body: text.value.trim(), photos: [] });
        toast('Note saved');
      } catch (error) {
        toast(`Not saved: ${error.message}`, true);
      }
    },
  },
    h('p', { class: 'muted small' }, 'How was the day?'),
    chips,
    text,
    h('div', { class: 'btn-row' }, h('button', { class: 'btn btn-primary', type: 'submit' }, 'Save note'))));
}

/* ---------- Weekly review ---------- */

function reviewForm(days, existing) {
  let rating = existing ? existing.rating : '';
  const area = (key, label, hint) => {
    const id = `review-${key}`;
    return h('div', { class: 'field' },
      h('label', { for: id }, label),
      h('textarea', { id, 'data-key': key, rows: 3, maxLength: 4000, value: existing ? existing[key] || '' : '' }),
      hint && h('span', { class: 'hint' }, hint));
  };
  const chips = h('div', { class: 'chips chips-left', role: 'group', 'aria-label': 'How was the week?' },
    [...RATINGS].reverse().map((name) => h('button', {
      class: `chip${rating === name ? ' is-on' : ''}`,
      type: 'button',
      'aria-pressed': String(rating === name),
      onclick: (event) => {
        rating = rating === name ? '' : name;
        chips.querySelectorAll('.chip').forEach((chip) => {
          const on = chip.dataset.value === rating;
          chip.classList.toggle('is-on', on);
          chip.setAttribute('aria-pressed', String(on));
        });
        event.currentTarget.blur();
      },
      'data-value': name,
    }, name)));
  const form = h('form', {
    class: 'stack-sm',
    onsubmit: async (event) => {
      event.preventDefault();
      const value = (key) => form.querySelector(`[data-key="${key}"]`).value.trim();
      const review = {
        ...(existing || { id: crypto.randomUUID(), createdAt: new Date().toISOString() }),
        week: days[0],
        rating,
        wentWell: value('wentWell'),
        improve: value('improve'),
        focus: value('focus'),
      };
      try {
        await saveItem('reviews', review);
        toast('Weekly review saved');
      } catch (error) {
        toast(`Not saved: ${error.message}`, true);
      }
    },
  },
    h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'How was the week?'), chips),
    area('wentWell', 'What went well?'),
    area('improve', 'What did not go well?'),
    area('focus', 'Focus for next week', 'It shows on your Today page all next week.'),
    h('div', { class: 'btn-row' },
      h('button', { class: 'btn btn-primary', type: 'submit' }, existing ? 'Update review' : 'Save review'),
      existing && h('span', { class: 'muted small' }, `Saved ${formatDate((existing.updatedAt || existing.createdAt || '').slice(0, 10))}`)));
  return form;
}

function weekBox() {
  const offset = viewState.reflectWeek || 0;
  const days = weekDays(offset);
  const summary = weekSummary(days);
  const existing = reviewFor(days[0]);
  const notes = items('journal').filter((note) => inRange(note.date, days)).sort((a, b) => a.date.localeCompare(b.date));
  const step = (delta) => { viewState.reflectWeek = delta === 0 ? 0 : offset + delta; rerender(); };
  const habitRate = summary.planned ? `${Math.round((summary.kept / summary.planned) * 100)}%` : '–';
  const title = offset === 0 ? 'This week' : offset === -1 ? 'Last week' : `Week of ${formatDate(days[0])}`;

  return h('section', { class: 'box' },
    h('div', { class: 'box-header' },
      h('h2', {}, `Weekly review · ${title}`),
      h('div', { class: 'btn-group' },
        h('button', { class: 'btn btn-small', type: 'button', 'aria-label': 'Previous week', onclick: () => step(-1) }, icon('chevronLeft')),
        h('button', { class: 'btn btn-small', type: 'button', disabled: offset === 0, onclick: () => step(0) }, 'This week'),
        h('button', { class: 'btn btn-small', type: 'button', 'aria-label': 'Next week', disabled: offset >= 0, onclick: () => step(1) }, icon('chevronRight')))),
    h('div', { class: 'box-body stack' },
      h('p', { class: 'muted' }, `${formatDate(days[0])} – ${formatDate(days[6])}`),
      h('div', { class: 'stats' },
        stat('Tasks done', String(summary.tasksDone)),
        stat('Habits kept', habitRate, summary.planned ? `${summary.kept} of ${summary.planned}` : ''),
        stat('Workouts', String(summary.workouts)),
        stat('Coding', String(Math.round((summary.minutes / 60) * 10) / 10), 'hours')),
      (summary.pages || summary.goalLogs || summary.milestones.length) > 0 && h('ul', { class: 'bullets' },
        summary.pages > 0 && h('li', {}, `Read ${plural(summary.pages, 'page', 'pages')}`),
        summary.goalLogs > 0 && h('li', {}, `Logged progress on goals ${plural(summary.goalLogs, 'time', 'times')}`),
        summary.milestones.map(({ goal, milestone }) => h('li', {}, 'Reached ', h('strong', {}, milestone.title), ' for ', h('a', { href: `#/goals/${goal.id}` }, displayTitle('goals', goal))))),
      notes.length > 0 && h('div', { class: 'week-notes' },
        h('h3', { class: 'small-heading' }, `Your notes this week (${notes.length})`),
        h('ul', { class: 'list box' }, notes.map((note) => h('li', { class: 'list-row' },
          h('div', { class: 'row-main' },
            h('p', { class: 'muted small' }, [formatDate(note.date), note.mood && note.mood !== MOODS[0] ? note.mood : ''].filter(Boolean).join(' · ')),
            h('p', { class: 'clamp' }, h('a', { class: 'plain-link', href: `#/journal/${note.id}` }, note.body))))))),
      showReviewForm(offset, days, existing)
        ? reviewForm(days, existing)
        : h('div', { class: 'review-later' },
          h('button', { class: 'btn', type: 'button', onclick: () => { viewState.reviewOpen = true; rerender(); } }, icon('pencil'), 'Write this week\'s review'),
          h('p', { class: 'muted small' }, 'The form opens by itself on Thursday, when the week is nearly done.'))));
}

// Early in the week the form stays folded. It opens on Thursday, for past weeks, or once a review exists.
function showReviewForm(offset, days, existing) {
  return Boolean(existing) || offset !== 0 || todayISO() >= days[5] || viewState.reviewOpen;
}

/* ---------- The page ---------- */

function pastReviews() {
  const list = [...items('reviews')].sort((a, b) => b.week.localeCompare(a.week));
  if (!list.length) return null;
  const thisWeek = weekDays(0)[0];
  return boxSection(['Past reviews ', counter(list.length)], h('ul', { class: 'list' }, list.map((review) => h('li', { class: 'list-row' },
    icon('calendar', 'icon row-icon'),
    h('div', { class: 'row-main' },
      h('div', { class: 'row-title' },
        h('button', {
          class: 'link-button',
          type: 'button',
          onclick: () => { viewState.reflectWeek = Math.round(daysBetween(thisWeek, review.week) / 7); rerender(); window.scrollTo(0, 0); },
        }, `Week of ${formatDate(review.week)}`),
        review.rating && h('span', { class: 'label label-default' }, review.rating)),
      review.focus && h('p', { class: 'muted small clamp' }, `Focus: ${review.focus}`))))));
}

function notesList() {
  const notes = [...items('journal')].sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || '').localeCompare(a.createdAt || ''));
  if (!notes.length) return null;
  return boxSection(['All notes ', counter(notes.length)], h('ul', { class: 'list' }, notes.slice(0, viewState.notesLimit || 20).map((note) => h('li', { class: 'list-row' },
    icon('book', 'icon row-icon'),
    h('div', { class: 'row-main' },
      h('div', { class: 'row-title' }, h('a', { href: `#/journal/${note.id}` }, displayTitle('journal', note)),
        note.mood && note.mood !== MOODS[0] && h('span', { class: 'label label-default' }, note.mood)),
      note.title && h('p', { class: 'muted small' }, formatDate(note.date)),
      h('p', { class: 'row-preview clamp' }, note.body))))),
  notes.length > (viewState.notesLimit || 20) && h('button', { class: 'btn btn-small', type: 'button', onclick: () => { viewState.notesLimit = (viewState.notesLimit || 20) + 20; rerender(); } }, 'Show more'));
}

export function reflectPage() {
  return [
    h('div', { class: 'subhead' },
      h('div', { class: 'subhead-text' }, h('h1', {}, COLLECTIONS.journal.label), h('p', {}, COLLECTIONS.journal.blurb)),
      newButton('journal', undefined, 'New note')),
    h('div', { class: 'stack' }, quickNote(), weekBox(), pastReviews(), notesList()),
  ];
}

// A link to a review opens Reflect at that review's week.
export function reviewPage(id) {
  const review = items('reviews').find((entry) => entry.id === id);
  if (review) viewState.reflectWeek = Math.round(daysBetween(weekDays(0)[0], review.week) / 7);
  return reflectPage();
}
