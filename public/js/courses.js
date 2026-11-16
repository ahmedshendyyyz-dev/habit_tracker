// Courses built from a YouTube playlist: loading the videos, and marking them as done.
import { todayISO } from './schema.js';
import { updateItem } from './store.js';
import { feedHabit } from './habits.js';

// The playlist link: the one given for it, or a playlist pasted into the course's Link field.
export function playlistLink(course) {
  if (course.playlist) return course.playlist;
  return /youtu.*[?&]list=/i.test(course.link || '') ? course.link : '';
}

export const watchUrl = (course, video) =>
  `https://www.youtube.com/watch?v=${encodeURIComponent(video.id)}${course.playlistId ? `&list=${encodeURIComponent(course.playlistId)}` : ''}`;

async function readPlaylist(url) {
  let response;
  try {
    response = await fetch('/api/playlist', {
      method: 'POST',
      headers: { 'X-Habit-Tracker': '1', 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
  } catch {
    throw new Error('Could not reach habit_tracker. Make sure its window is still open.');
  }
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error((body && body.error) || 'The playlist could not be read.');
  return body;
}

// Fetches the playlist and stores its videos on the course. Ticks you already made are kept.
export async function loadPlaylist(course) {
  const playlist = await readPlaylist(playlistLink(course));
  await updateItem('courses', course.id, (latest) => {
    const before = new Map((latest.videos || []).map((video) => [video.id, video]));
    // A course that counted lessons by hand: that many videos from the top count as done.
    const doneByHand = before.size ? 0 : Math.max(0, Number(latest.doneLessons) || 0);
    latest.videos = playlist.videos.map((video, index) => ({
      id: video.id,
      title: video.title,
      done: Boolean(before.get(video.id) && before.get(video.id).done) || index < doneByHand,
      doneDate: (before.get(video.id) && before.get(video.id).doneDate) || '',
    }));
    if (!latest.playlist) latest.playlist = playlistLink(latest);
    latest.playlistId = playlist.id;
    latest.playlistTitle = playlist.title || '';
    if (!latest.title) latest.title = playlist.title || 'Course';
    latest.totalLessons = latest.videos.length;
    latest.doneLessons = latest.videos.filter((video) => video.done).length;
  });
  return playlist;
}

// Ticks or unticks one video. The day's lesson count and the Course lessons habit follow.
export async function setVideoDone(course, videoId, done) {
  const today = todayISO();
  let day = today;
  let changed = false;
  await updateItem('courses', course.id, (latest) => {
    const video = (latest.videos || []).find((entry) => entry.id === videoId);
    if (!video || Boolean(video.done) === done) return;
    changed = true;
    // Unticking takes the lesson off the day it was ticked.
    day = done ? today : video.doneDate || today;
    video.done = done;
    video.doneDate = done ? today : '';
    const log = { ...(latest.log || {}) };
    log[day] = Math.max(0, (Number(log[day]) || 0) + (done ? 1 : -1));
    if (!log[day]) delete log[day];
    latest.log = log;
    latest.totalLessons = latest.videos.length;
    latest.doneLessons = latest.videos.filter((entry) => entry.done).length;
    if (latest.doneLessons >= latest.totalLessons) latest.status = 'Done';
    else if (latest.status === 'Done' || latest.status === 'Planned') latest.status = 'In progress';
  });
  return changed ? feedHabit('lessons', day, done ? 1 : -1) : null;
}
