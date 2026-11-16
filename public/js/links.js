// Connects sections to your habits: a workout ticks Gym, coding minutes add to Coding,
// pages read add to Reading, and lessons add to Course lessons.
import { COLLECTIONS, formatDate, todayISO } from './schema.js';
import { feedHabit } from './habits.js';

const when = (day) => (day === todayISO() ? 'today' : formatDate(day));
const note = (habit, day, verb) => (habit ? `Saved. ${verb} ${habit.title} for ${when(day)}.` : '');

COLLECTIONS.workouts.afterSave = async (workout, before) => {
  if (before && before.date === workout.date) return '';
  return note(await feedHabit('gym', workout.date, 1), workout.date, 'Ticked');
};

COLLECTIONS.sessions.afterSave = async (session, before) => {
  const minutes = Number(session.minutes) || 0;
  if (before && before.date !== session.date) await feedHabit('coding', before.date, -(Number(before.minutes) || 0));
  const added = before && before.date === session.date ? minutes - (Number(before.minutes) || 0) : minutes;
  return note(await feedHabit('coding', session.date, added), session.date, 'Added the minutes to');
};

COLLECTIONS.books.afterSave = async (book, before) => {
  if (!before) return '';
  const pages = (Number(book.currentPage) || 0) - (Number(before.currentPage) || 0);
  return pages > 0 ? note(await feedHabit('reading', todayISO(), pages), todayISO(), 'Added the pages to') : '';
};

COLLECTIONS.courses.afterSave = async (course, before) => {
  if (!before) return '';
  const lessons = (Number(course.doneLessons) || 0) - (Number(before.doneLessons) || 0);
  return lessons > 0 ? note(await feedHabit('lessons', todayISO(), lessons), todayISO(), 'Added the lessons to') : '';
};
