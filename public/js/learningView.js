// The Learning page: your roadmap, coding time, courses and books.
import { HUBS, displayTitle, formatDate, todayISO } from './schema.js';
import { h, toast } from './ui.js';
import { items, saveItem, updateItem } from './store.js';
import { openForm } from './form.js';
import { icon } from './icons.js';
import { boxSection, counter, progressBar, stat, statusLabel } from './components.js';
import { columnChart } from './charts.js';
import { parseDay, weekDays } from './tasks.js';
import { feedHabit } from './habits.js';
import { goalProgress } from './goals.js';
import { goalStatusLabel, nextMilestoneLine } from './goalsView.js';

const hours = (minutes) => {
  const value = Math.round((minutes / 60) * 10) / 10;
  return `${value} h`;
};
const sumLog = (list, from, to) => list.reduce((total, item) => total + Object.entries(item.log || {})
  .filter(([day]) => day >= from && day <= to)
  .reduce((sum, [, value]) => sum + (Number(value) || 0), 0), 0);
const shortDate = (day) => parseDay(day).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

const habitNote = (habit) => (habit ? ` Added to ${habit.title}.` : '');

/* ---------- Roadmap ---------- */

function roadmapBox() {
  const goals = items('goals').filter((goal) => goal.area === 'Learning')
    .sort((a, b) => (a.targetDate || '9999').localeCompare(b.targetDate || '9999'));
  return boxSection(['Roadmap ', counter(goals.length)],
    goals.length
      ? h('ul', { class: 'list' }, goals.map((goal) => {
        const title = displayTitle('goals', goal);
        return h('li', { class: 'list-row' },
          icon('target', 'icon row-icon'),
          h('div', { class: 'row-main' },
            h('div', { class: 'row-title' }, h('a', { href: `#/goals/${goal.id}` }, title), goalStatusLabel(goal),
              h('span', { class: 'muted row-aside' }, `${goalProgress(goal)}%`)),
            progressBar(goalProgress(goal), title),
            h('p', { class: 'muted small' }, nextMilestoneLine(goal) || (goal.targetDate ? `Target ${formatDate(goal.targetDate)}` : 'Add milestones to plan the steps'))));
      }))
      : h('div', { class: 'box-empty' }, h('p', { class: 'muted' },
        'Learning goals show here. Your 10-week Java plan fits well: make it a goal with one milestone per week, each with its due date.')),
    h('button', { class: 'btn btn-small', type: 'button', onclick: () => openForm('goals', null, { area: 'Learning' }) }, icon('plus'), 'New learning goal'));
}

/* ---------- Coding ---------- */

function codingForm() {
  const minutes = h('input', { type: 'number', min: 1, step: 1, inputMode: 'numeric', required: true, placeholder: 'Minutes', 'aria-label': 'Minutes of coding', class: 'inline-input inline-number' });
  const topic = h('input', { type: 'text', maxLength: 200, placeholder: 'What did you work on?', 'aria-label': 'What you worked on', class: 'inline-input inline-grow' });
  return h('form', {
    class: 'inline-form',
    onsubmit: async (event) => {
      event.preventDefault();
      const value = Number(minutes.value);
      if (!(value > 0)) return;
      const today = todayISO();
      try {
        await saveItem('sessions', { id: crypto.randomUUID(), createdAt: new Date().toISOString(), date: today, minutes: value, topic: topic.value.trim(), notes: '' });
        const habit = await feedHabit('coding', today, value);
        toast(`Logged ${value} minutes.${habitNote(habit)}`);
      } catch (error) {
        toast(`Not saved: ${error.message}`, true);
      }
    },
  }, minutes, topic, h('button', { class: 'btn btn-primary', type: 'submit' }, 'Log session'));
}

function codingBox() {
  const sessions = items('sessions');
  const bars = [];
  for (let offset = -7; offset <= 0; offset++) {
    const days = weekDays(offset);
    const total = sessions.filter((s) => s.date >= days[0] && s.date <= days[6]).reduce((sum, s) => sum + (Number(s.minutes) || 0), 0);
    bars.push({ label: shortDate(days[0]), value: Math.round((total / 60) * 10) / 10, tip: `Week of ${formatDate(days[0])}: ${hours(total)}` });
  }
  const recent = [...sessions].sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || '').localeCompare(a.createdAt || '')).slice(0, 5);
  return boxSection(['Coding ', counter(sessions.length)], [
    h('div', { class: 'box-body stack-sm' },
      codingForm(),
      sessions.length
        ? columnChart(bars, { label: 'Hours of coding per week, last 8 weeks', format: (value) => `${value} h` })
        : h('p', { class: 'muted' }, 'Log a session above when you finish coding. It also adds the minutes to your Coding habit.')),
    recent.length > 0 && h('ul', { class: 'list list-top' }, recent.map((session) => h('li', { class: 'list-row' },
      icon('box', 'icon row-icon'),
      h('div', { class: 'row-main' },
        h('div', { class: 'row-title row-title-task' }, h('a', { href: `#/sessions/${session.id}` }, displayTitle('sessions', session))),
        h('p', { class: 'muted small' }, `${formatDate(session.date)} · ${session.minutes} min`))))),
  ], h('button', { class: 'btn btn-small', type: 'button', onclick: () => openForm('sessions') }, icon('plus'), 'Log an earlier session'));
}

/* ---------- Courses ---------- */

async function addLesson(course) {
  const today = todayISO();
  try {
    await updateItem('courses', course.id, (latest) => {
      const total = Number(latest.totalLessons) || 0;
      const done = (Number(latest.doneLessons) || 0) + 1;
      latest.doneLessons = total ? Math.min(done, total) : done;
      latest.log = { ...(latest.log || {}), [today]: ((latest.log || {})[today] || 0) + 1 };
      if (total && latest.doneLessons >= total) latest.status = 'Done';
      if (latest.status === 'Planned') latest.status = 'In progress';
    });
    const habit = await feedHabit('lessons', today, 1);
    toast(`One more lesson done.${habitNote(habit)}`);
  } catch (error) {
    toast(`Not saved: ${error.message}`, true);
  }
}

function courseRow(course) {
  const total = Number(course.totalLessons) || 0;
  const done = Number(course.doneLessons) || 0;
  const title = displayTitle('courses', course);
  const active = course.status === 'In progress' || course.status === 'Planned';
  return h('li', { class: 'list-row' },
    icon('book', 'icon row-icon'),
    h('div', { class: 'row-main' },
      h('div', { class: 'row-title' }, h('a', { href: `#/courses/${course.id}` }, title), statusLabel(course.status)),
      total > 0 && progressBar((done / total) * 100, title),
      h('p', { class: 'muted small' }, [course.platform, total ? `${done} of ${total} lessons` : `${done} lessons done`].filter(Boolean).join(' · '))),
    active && (!total || done < total) && h('button', {
      class: 'btn btn-small',
      type: 'button',
      'data-focus': `lesson-${course.id}`,
      onclick: () => addLesson(course),
    }, icon('plus'), '1 lesson'));
}

function coursesBox() {
  const order = { 'In progress': 0, Planned: 1, Paused: 2, Done: 3 };
  const courses = [...items('courses')].sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9));
  return boxSection(['Courses ', counter(courses.length)],
    courses.length
      ? h('ul', { class: 'list' }, courses.map(courseRow))
      : h('div', { class: 'box-empty' }, h('p', { class: 'muted' }, 'Add a course with its number of lessons. Then press "+ 1 lesson" each time you finish one.')),
    h('button', { class: 'btn btn-small', type: 'button', onclick: () => openForm('courses') }, icon('plus'), 'New course'));
}

/* ---------- Books ---------- */

async function setPage(book, page) {
  const today = todayISO();
  let added = 0;
  try {
    await updateItem('books', book.id, (latest) => {
      const total = Number(latest.totalPages) || 0;
      const next = Math.max(0, total ? Math.min(page, total) : page);
      added = next - (Number(latest.currentPage) || 0);
      latest.currentPage = next;
      if (added > 0) latest.log = { ...(latest.log || {}), [today]: ((latest.log || {})[today] || 0) + added };
      if (latest.status === 'Want to read' || latest.status === 'Paused') latest.status = 'Reading';
      if (!latest.startDate) latest.startDate = today;
      if (total && next >= total) { latest.status = 'Finished'; latest.finishDate = latest.finishDate || today; }
    });
    const habit = added > 0 ? await feedHabit('reading', today, added) : null;
    toast(added > 0 ? `${added} ${added === 1 ? 'page' : 'pages'} read.${habitNote(habit)}` : 'Page saved');
  } catch (error) {
    toast(`Not saved: ${error.message}`, true);
  }
}

function bookRow(book) {
  const total = Number(book.totalPages) || 0;
  const page = Number(book.currentPage) || 0;
  const title = displayTitle('books', book);
  const reading = book.status === 'Reading';
  const input = h('input', {
    type: 'number', min: 0, max: total || undefined, step: 1, inputMode: 'numeric', value: page || '',
    placeholder: 'Page', 'aria-label': `Page you are on in ${title}`, class: 'inline-input inline-number', 'data-focus': `page-${book.id}`,
  });
  const meta = [
    book.author,
    book.status === 'Finished' ? `Finished ${formatDate(book.finishDate)}` : total ? `Page ${page} of ${total}` : page ? `Page ${page}` : '',
  ].filter(Boolean).join(' · ');
  return h('li', { class: 'list-row' },
    icon('book', 'icon row-icon'),
    h('div', { class: 'row-main' },
      h('div', { class: 'row-title' }, h('a', { href: `#/books/${book.id}` }, title), statusLabel(book.status)),
      reading && total > 0 && progressBar((page / total) * 100, title),
      meta && h('p', { class: 'muted small' }, meta)),
    reading && h('form', {
      class: 'inline-form',
      onsubmit: (event) => {
        event.preventDefault();
        if (input.value !== '') setPage(book, Number(input.value));
      },
    }, input, h('button', { class: 'btn btn-small', type: 'submit' }, 'Update')));
}

function booksBox() {
  const order = { Reading: 0, 'Want to read': 1, Paused: 2, Finished: 3 };
  const books = [...items('books')].sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9)
    || (b.finishDate || '').localeCompare(a.finishDate || ''));
  return boxSection(['Books ', counter(books.length)],
    books.length
      ? h('ul', { class: 'list' }, books.map(bookRow))
      : h('div', { class: 'box-empty' }, h('p', { class: 'muted' }, 'Add the book you are reading with its page count. Type the page you reach each time, and the pages count toward your Reading habit.')),
    h('button', { class: 'btn btn-small', type: 'button', onclick: () => openForm('books') }, icon('plus'), 'New book'));
}

/* ---------- The page ---------- */

export function learningPage() {
  const week = weekDays(0);
  const minutes = items('sessions').filter((s) => s.date >= week[0] && s.date <= week[6]).reduce((sum, s) => sum + (Number(s.minutes) || 0), 0);
  const pages = sumLog(items('books'), week[0], week[6]);
  const lessons = sumLog(items('courses'), week[0], week[6]);
  const year = todayISO().slice(0, 4);
  const finished = items('books').filter((book) => book.status === 'Finished' && (book.finishDate || '').startsWith(year)).length;
  return [
    h('div', { class: 'subhead' },
      h('div', { class: 'subhead-text' }, h('h1', {}, HUBS.learning.label), h('p', {}, HUBS.learning.blurb))),
    h('div', { class: 'stack' },
      h('div', { class: 'stats' },
        stat('Coding this week', hours(minutes).replace(' h', ''), 'hours'),
        stat('Pages this week', String(pages), 'read'),
        stat('Lessons this week', String(lessons), 'done'),
        stat(`Books in ${year}`, String(finished), 'finished')),
      roadmapBox(),
      codingBox(),
      coursesBox(),
      booksBox()),
  ];
}

// On a book's or course's own page.
export function progressPanel(key, item) {
  const total = Number(key === 'books' ? item.totalPages : item.totalLessons) || 0;
  const done = Number(key === 'books' ? item.currentPage : item.doneLessons) || 0;
  if (!total) return null;
  const unit = key === 'books' ? 'pages' : 'lessons';
  return boxSection(`${Math.round((done / total) * 100)}% done`, h('div', { class: 'box-body stack-sm' },
    progressBar((done / total) * 100, displayTitle(key, item)),
    h('p', { class: 'muted small' }, `${done} of ${total} ${unit}`)));
}
