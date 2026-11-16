// Works out what you did on each day from your saved data. It feeds the grid and the activity feed.
import { COLLECTIONS, COLLECTION_KEYS, dayOf } from './schema.js';
import { items } from './store.js';

const VALID_DAY = /^\d{4}-\d{2}-\d{2}$/;

// Habits and repeating tasks change every day, so edits to them are not listed.
const NO_UPDATE_EVENTS = new Set(['tasks', 'habits', 'goals', 'reviews', 'weights', 'workouts', 'sessions', 'books', 'courses']);

// Each event is { day, at, key, verb, count, item } or, for a group, { ..., text, href }. Newest first.
export function activityEvents() {
  const events = [];
  const add = (day, at, key, item, verb, extra) => {
    if (VALID_DAY.test(day || '')) events.push({ day, at: at || `${day}T12:00:00`, key, item, verb, count: 1, ...extra });
  };

  for (const key of COLLECTION_KEYS) {
    const { singular } = COLLECTIONS[key];
    for (const item of items(key)) {
      const created = dayOf(item.createdAt);
      const seen = new Set();
      const once = (day, at, verb) => {
        if (!day || seen.has(day)) return;
        seen.add(day);
        add(day, at, key, item, verb);
      };

      if (key === 'tasks') {
        // Each completed day counts, so a daily task done 10 times is 10 activities.
        if (item.kind !== 'Event') {
          const doneDays = item.repeat && item.repeat !== 'Does not repeat' ? item.doneDates || [] : item.done ? [item.doneDate] : [];
          doneDays.forEach((day) => add(day, `${day}T23:00:00`, key, item, 'Completed'));
        }
        once(created, item.createdAt, 'Added a task');
        continue;
      }
      if (key === 'habits') {
        once(created, item.createdAt, 'Started a habit');
        continue;
      }
      // These happen on a day you choose, so that day counts, not the day you typed them in.
      if (key === 'weights') { once(item.date, item.createdAt, 'Logged your weight:'); continue; }
      if (key === 'workouts') { once(item.date, item.createdAt, 'Worked out:'); continue; }
      if (key === 'sessions') { add(item.date, item.createdAt, key, item, `Coded ${item.minutes} min:`); continue; }
      if (key === 'books' || key === 'courses') {
        const unit = key === 'books' ? ['page', 'pages', 'Read'] : ['lesson', 'lessons', 'Did'];
        for (const [day, amount] of Object.entries(item.log || {})) {
          const n = Number(amount) || 0;
          if (n > 0) add(day, `${day}T21:00:00`, key, item, `${unit[2]} ${n} ${n === 1 ? unit[0] : unit[1]} of`);
        }
        if (key === 'books' && item.status === 'Finished') once(item.finishDate, item.updatedAt, 'Finished reading');
        if (key === 'courses' && item.status === 'Done') once(dayOf(item.updatedAt), item.updatedAt, 'Finished the course');
        once(created, item.createdAt, `Added a ${singular}`);
        continue;
      }
      if (key === 'wishlist' && item.bought) once(item.boughtDate, item.updatedAt, 'Got');
      if (key === 'goals') {
        // One line per goal per day for check-ins, and one for each milestone reached.
        const perDay = new Map();
        for (const entry of Array.isArray(item.log) ? item.log : []) perDay.set(entry.day, (perDay.get(entry.day) || 0) + 1);
        for (const [day, count] of perDay) add(day, `${day}T22:00:00`, key, item, count === 1 ? 'Worked on' : `Worked ${count} times on`, { count });
        for (const milestone of Array.isArray(item.milestones) ? item.milestones : []) {
          if (milestone.done) add(milestone.doneDate, `${milestone.doneDate}T22:30:00`, key, item, `Reached "${milestone.title}" for`, { count: 3 });
        }
      }
      if (key === 'bucket' && item.done) once(item.doneDate, item.updatedAt, 'Ticked off');
      if (key === 'trips') once(item.startDate, item.createdAt, 'Went on a trip');
      if (key === 'journal') { once(item.date, item.createdAt, 'Wrote a note:'); continue; }
      if (key === 'reviews') { once(dayOf(item.createdAt), item.createdAt, 'Wrote the weekly review for'); continue; }
      once(created, item.createdAt, `Added a ${singular}`);
      if (!NO_UPDATE_EVENTS.has(key)) once(dayOf(item.updatedAt), item.updatedAt, `Updated a ${singular}`);
    }
  }

  // Habit check-ins are grouped into one line per day: "Checked in on 5 habits".
  const perDay = new Map();
  for (const habit of items('habits')) {
    for (const [day, value] of Object.entries(habit.log || {})) {
      const amount = Array.isArray(value) ? value.length : Number(value) || 0;
      if (amount > 0) perDay.set(day, (perDay.get(day) || 0) + 1);
    }
  }
  for (const [day, count] of perDay) {
    add(day, `${day}T23:30:00`, 'habits', null, 'Checked in on', { count, text: `${count} ${count === 1 ? 'habit' : 'habits'}`, href: '#/habits' });
  }
  return events.sort((a, b) => (a.day === b.day ? String(b.at).localeCompare(String(a.at)) : a.day < b.day ? 1 : -1));
}

// How many things happened on each day, as a Map of YYYY-MM-DD to a count.
export function countByDay(events) {
  const counts = new Map();
  for (const event of events) counts.set(event.day, (counts.get(event.day) || 0) + (event.count || 1));
  return counts;
}
