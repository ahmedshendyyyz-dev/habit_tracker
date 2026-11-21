// Connects sections to your habits: a workout ticks Gym, coding minutes add to Coding,
// pages read add to Reading, and lessons add to Course lessons.
import { COLLECTIONS, formatDate, hasVideos, todayISO } from './schema.js';
import { toast } from './ui.js';
import { loadPlaylist } from './courses.js';
import { items, updateItem } from './store.js';
import { feedHabit } from './habits.js';

const when = (day) => (day === todayISO() ? 'today' : formatDate(day));
const note = (habit, day, verb) => (habit ? `Saved. ${verb} ${habit.title} for ${when(day)}.` : '');

// Gym stays ticked for a day while any workout is logged on it.
const workoutOn = (day, exceptId) => items('workouts').some((workout) => workout.date === day && workout.id !== exceptId);

COLLECTIONS.workouts.afterSave = async (workout, before) => {
  if (before && before.date === workout.date) return '';
  if (before && before.date && !workoutOn(before.date, workout.id)) await feedHabit('gym', before.date, -1);
  return note(await feedHabit('gym', workout.date, 1), workout.date, 'Ticked');
};

// Deleting takes back what the item added to its habit.
COLLECTIONS.workouts.afterDelete = async (workout) => {
  if (workout.date && !workoutOn(workout.date, workout.id)) await feedHabit('gym', workout.date, -1);
};

COLLECTIONS.sessions.afterDelete = async (session) => {
  await feedHabit('coding', session.date, -(Number(session.minutes) || 0));
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
  // A new or changed playlist link: fetch the video names now.
  if (course.playlist && (!before || before.playlist !== course.playlist || !hasVideos(before))) {
    try {
      const playlist = await loadPlaylist(course);
      return `Saved. Found ${playlist.videos.length} videos in the playlist.`;
    } catch (error) {
      if (!course.title) await updateItem('courses', course.id, (latest) => { if (!latest.title) latest.title = 'Untitled course'; }).catch(() => {});
      toast(`Saved, but the playlist could not be read: ${error.message}`, true);
      return '';
    }
  }
  if (!before || hasVideos(before)) return '';
  const lessons = (Number(course.doneLessons) || 0) - (Number(before.doneLessons) || 0);
  return lessons > 0 ? note(await feedHabit('lessons', todayISO(), lessons), todayISO(), 'Added the lessons to') : '';
};
