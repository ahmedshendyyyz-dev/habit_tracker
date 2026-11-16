// Describes each section of the site. The forms, cards and detail pages are built from this.
const NOTES = { key: 'notes', label: 'Notes', type: 'textarea' };
const PHOTOS = { key: 'photos', label: 'Photos', type: 'photos' };

export const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const REPEAT = {
  never: 'Does not repeat',
  daily: 'Every day',
  weekly: 'Every week',
  monthly: 'Every month',
  days: 'On certain days',
};
export const HABIT_TYPES = { check: 'Yes or no', number: 'Number', list: 'Checklist' };
export const LIFE_AREAS = ['Personal', 'Career', 'Learning', 'Health', 'Deen', 'Family'];
export const MOODS = ['Not set', 'Great', 'Good', 'Okay', 'Low', 'Bad'];
const isDiy = (values) => values.type === 'DIY';
export const hasVideos = (course) => Boolean(course && Array.isArray(course.videos) && course.videos.length);

// Hub pages group several sections under one tab.
export const HUBS = {
  health: { label: 'Health', blurb: 'Your weight and your workouts, and how they change over time.' },
  learning: { label: 'Learning', blurb: 'Your roadmap, coding time, courses and books.' },
};

export const COLLECTIONS = {
  tasks: {
    label: 'Tasks',
    singular: 'task',
    blurb: 'What you need to do and where you need to be, day by day.',
    stayAfterAdd: true,
    dateKey: 'date',
    fields: [
      { key: 'title', label: 'What is it?', type: 'text', required: true },
      { key: 'kind', label: 'Type', type: 'select', options: ['Task', 'Event'], half: true, hint: 'Events are things with a time, like an appointment.' },
      { key: 'date', label: 'Date', type: 'date', half: true, defaultToday: true },
      { key: 'time', label: 'Time', type: 'time', half: true, hint: 'Optional.' },
      { key: 'repeat', label: 'Repeat', type: 'select', options: Object.values(REPEAT), half: true },
      { key: 'days', label: 'Repeat on', type: 'weekdays', showIf: (values) => values.repeat === REPEAT.days },
      { key: 'goalId', label: 'Part of this goal', type: 'ref', refTo: 'goals', half: true },
      { key: 'projectId', label: 'Part of this project', type: 'ref', refTo: 'projects', half: true },
      NOTES,
    ],
    // Repeating tasks need a start date, and events cannot be ticked off.
    normalize: (task) => {
      if (task.repeat !== REPEAT.never && !task.date) task.date = todayISO();
      if (task.repeat === REPEAT.days && !(task.days || []).length) task.repeat = REPEAT.weekly;
      if (task.repeat !== REPEAT.days) task.days = [];
      if (task.kind === 'Event') { task.done = false; task.doneDate = ''; }
      if (!Array.isArray(task.doneDates)) task.doneDates = [];
    },
  },
  habits: {
    label: 'Habits',
    singular: 'habit',
    blurb: 'The small things you do every day, with streaks to keep you going.',
    stayAfterAdd: true,
    dateKey: 'createdAt',
    fields: [
      { key: 'title', label: 'Habit', type: 'text', required: true },
      { key: 'type', label: 'How do you track it?', type: 'select', options: Object.values(HABIT_TYPES) },
      { key: 'target', label: 'Daily target', type: 'number', half: true, showIf: (values) => values.type === HABIT_TYPES.number, hint: 'For example 8.' },
      { key: 'unit', label: 'Unit', type: 'text', half: true, showIf: (values) => values.type === HABIT_TYPES.number, hint: 'For example glasses, pages or minutes.' },
      { key: 'items', label: 'Checklist', type: 'textarea', showIf: (values) => values.type === HABIT_TYPES.list, hint: 'One per line, for example Fajr, Dhuhr, Asr, Maghrib, Isha.' },
      { key: 'days', label: 'Which days?', type: 'weekdays', hint: 'Leave them all unticked for every day.' },
      NOTES,
    ],
    normalize: (habit) => {
      if (!habit.log || typeof habit.log !== 'object') habit.log = {};
      if (habit.type === HABIT_TYPES.number && !(Number(habit.target) > 0)) habit.target = 1;
    },
  },
  weights: {
    label: 'Weight',
    singular: 'weight entry',
    parent: 'health',
    stayAfterAdd: true,
    dateKey: 'date',
    fields: [
      { key: 'date', label: 'Date', type: 'date', required: true, defaultToday: true, half: true },
      { key: 'kg', label: 'Weight (kg)', type: 'number', required: true, half: true },
      { key: 'note', label: 'Note', type: 'text', hint: 'Optional, for example "after the gym".' },
    ],
  },
  workouts: {
    label: 'Workouts',
    singular: 'workout',
    parent: 'health',
    stayAfterAdd: true,
    dateKey: 'date',
    fields: [
      { key: 'title', label: 'Workout', type: 'text', required: true, hint: 'For example Push day or Legs.' },
      { key: 'date', label: 'Date', type: 'date', required: true, defaultToday: true, half: true },
      { key: 'duration', label: 'Minutes', type: 'number', half: true, hint: 'Optional.' },
      { key: 'exercises', label: 'Exercises', type: 'exercises' },
      NOTES,
    ],
  },
  courses: {
    label: 'Courses',
    singular: 'course',
    parent: 'learning',
    stayAfterAdd: true,
    dateKey: 'startDate',
    fields: [
      { key: 'playlist', label: 'YouTube playlist link', type: 'url', hint: 'Optional. Paste the playlist link and every video name is fetched when you save.' },
      { key: 'title', label: 'Course', type: 'text', hint: 'Leave empty to use the playlist\'s name.' },
      { key: 'platform', label: 'Where', type: 'text', half: true, hint: 'For example Udemy or YouTube.' },
      { key: 'status', label: 'Status', type: 'select', options: ['In progress', 'Planned', 'Paused', 'Done'], half: true },
      // A course with a playlist counts its lessons from the videos you mark as done.
      { key: 'totalLessons', label: 'Total lessons', type: 'number', half: true, showIf: (values, item) => !hasVideos(item) },
      { key: 'doneLessons', label: 'Lessons done', type: 'number', half: true, showIf: (values, item) => !hasVideos(item) },
      { key: 'startDate', label: 'Started', type: 'date', half: true },
      { key: 'link', label: 'Link', type: 'url' },
      NOTES,
    ],
    normalize: (course, before) => {
      if (!course.title && !course.playlist) course.title = 'Untitled course';
      if (!course.platform && course.playlist && /youtu/i.test(course.playlist)) course.platform = 'YouTube';
      if (hasVideos(before)) {
        course.totalLessons = before.videos.length;
        course.doneLessons = before.videos.filter((video) => video.done).length;
        return;
      }
      trackProgress(course, before, 'doneLessons', 'totalLessons');
      const total = Number(course.totalLessons) || 0;
      if (total && course.doneLessons >= total) course.status = 'Done';
    },
  },
  books: {
    label: 'Books',
    singular: 'book',
    parent: 'learning',
    stayAfterAdd: true,
    dateKey: 'startDate',
    fields: [
      { key: 'title', label: 'Book', type: 'text', required: true },
      { key: 'author', label: 'Author', type: 'text', half: true },
      { key: 'status', label: 'Status', type: 'select', options: ['Reading', 'Want to read', 'Paused', 'Finished'], half: true },
      { key: 'totalPages', label: 'Total pages', type: 'number', half: true },
      { key: 'currentPage', label: 'Current page', type: 'number', half: true },
      { key: 'startDate', label: 'Started', type: 'date', half: true },
      { key: 'finishDate', label: 'Finished', type: 'date', half: true, showIf: (values) => values.status === 'Finished' },
      NOTES,
      { key: 'photos', label: 'Cover', type: 'photos', single: true },
    ],
    normalize: (book, before) => {
      trackProgress(book, before, 'currentPage', 'totalPages');
      const total = Number(book.totalPages) || 0;
      if (total && book.currentPage >= total) book.status = 'Finished';
      if (book.status === 'Finished' && !book.finishDate) book.finishDate = todayISO();
      if (book.status === 'Reading' && !book.startDate) book.startDate = todayISO();
    },
  },
  sessions: {
    label: 'Coding sessions',
    singular: 'coding session',
    parent: 'learning',
    stayAfterAdd: true,
    dateKey: 'date',
    fields: [
      { key: 'date', label: 'Date', type: 'date', required: true, defaultToday: true, half: true },
      { key: 'minutes', label: 'Minutes', type: 'number', required: true, half: true },
      { key: 'topic', label: 'What did you work on?', type: 'text', hint: 'For example Spring Boot REST APIs.' },
      NOTES,
    ],
  },
  wishlist: {
    label: 'Wishlist',
    singular: 'wishlist item',
    blurb: 'Things you want to get one day.',
    dateKey: 'createdAt',
    fields: [
      { key: 'title', label: 'What do you want?', type: 'text', required: true },
      { key: 'priority', label: 'Priority', type: 'select', options: ['Medium', 'High', 'Low'], half: true },
      { key: 'price', label: 'Price', type: 'text', half: true, hint: 'Optional, for example 2,500 EGP.' },
      { key: 'link', label: 'Link', type: 'url' },
      { key: 'bought', label: 'I got this', type: 'checkbox' },
      { key: 'boughtDate', label: 'Date you got it', type: 'date', showIf: (values) => values.bought },
      NOTES,
      PHOTOS,
    ],
    normalize: (item) => { if (item.bought && !item.boughtDate) item.boughtDate = todayISO(); },
  },
  trips: {
    label: 'Trips',
    singular: 'trip',
    blurb: 'Places you have been and places you are going, with a packing list for each.',
    dateKey: 'startDate',
    fields: [
      { key: 'title', label: 'Trip name', type: 'text', required: true },
      { key: 'place', label: 'Place', type: 'text', half: true },
      { key: 'status', label: 'Status', type: 'select', options: ['Planned', 'Booked', 'Done'], half: true },
      { key: 'startDate', label: 'Start date', type: 'date', half: true },
      { key: 'endDate', label: 'End date', type: 'date', half: true, notBefore: 'startDate' },
      NOTES,
      PHOTOS,
    ],
    normalize: (trip) => { if (!Array.isArray(trip.packing)) trip.packing = []; },
  },
  projects: {
    label: 'Projects',
    singular: 'project',
    blurb: 'Things you are building or making yourself, from first idea to finished.',
    dateKey: 'startDate',
    fields: [
      { key: 'title', label: 'Project name', type: 'text', required: true },
      { key: 'type', label: 'Type', type: 'select', options: ['Project', 'DIY'], half: true, hint: 'DIY adds cost, materials, steps and before and after photos.' },
      { key: 'status', label: 'Status', type: 'select', options: ['Idea', 'In progress', 'Paused', 'Finished'], half: true },
      { key: 'startDate', label: 'Started', type: 'date', half: true },
      { key: 'cost', label: 'Cost', type: 'text', half: true, hint: 'For example, 350 EGP.', showIf: isDiy },
      { key: 'link', label: 'Link', type: 'url', hint: 'Optional, for example the project code or website.' },
      { key: 'materials', label: 'Materials', type: 'textarea', hint: 'One per line.', showIf: isDiy },
      { key: 'steps', label: 'Steps', type: 'textarea', hint: 'One per line.', showIf: isDiy },
      NOTES,
      { key: 'beforePhotos', label: 'Before photos', type: 'photos', showIf: isDiy },
      { key: 'afterPhotos', label: 'After photos', type: 'photos', showIf: isDiy },
      PHOTOS,
    ],
  },
  bucket: {
    label: 'Bucket list',
    singular: 'bucket list item',
    blurb: 'Everything you want to do at least once.',
    dateKey: 'doneDate',
    fields: [
      { key: 'title', label: 'What do you want to do?', type: 'text', required: true },
      NOTES,
      { key: 'done', label: 'I did this', type: 'checkbox' },
      { key: 'doneDate', label: 'Date you did it', type: 'date', showIf: (values) => values.done },
      { key: 'tripId', label: 'Happened on this trip', type: 'ref', refTo: 'trips', showIf: (values) => values.done },
      { key: 'goalId', label: 'Working on it as this goal', type: 'ref', refTo: 'goals', showIf: (values) => !values.done },
      PHOTOS,
    ],
  },
  goals: {
    label: 'Goals',
    singular: 'goal',
    blurb: 'What you are working toward now, and where it is all leading.',
    dateKey: 'targetDate',
    fields: [
      { key: 'title', label: 'Goal', type: 'text', required: true },
      { key: 'horizon', label: 'Type', type: 'select', options: ['Short term', 'Long term'], half: true },
      { key: 'area', label: 'Life area', type: 'select', options: LIFE_AREAS, half: true },
      { key: 'targetDate', label: 'Target date', type: 'date', half: true },
      {
        key: 'progress',
        label: 'Progress',
        type: 'range',
        hint: 'Or add milestones on the goal page, and progress will update by itself.',
        // Goals with milestones work out their own progress.
        showIf: (values, item) => !(item && Array.isArray(item.milestones) && item.milestones.length),
      },
      {
        key: 'parentId',
        label: 'Supports this long term goal',
        type: 'ref',
        refTo: 'goals',
        refFilter: (goal) => goal.horizon === 'Long term',
        showIf: (values) => values.horizon === 'Short term',
      },
      NOTES,
    ],
  },
  journal: {
    label: 'Reflect',
    singular: 'note',
    blurb: 'A few lines about your day, and a weekly look back at how it went.',
    dateKey: 'date',
    fields: [
      { key: 'date', label: 'Date', type: 'date', required: true, defaultToday: true, half: true },
      { key: 'mood', label: 'How was the day?', type: 'select', options: MOODS, half: true },
      { key: 'title', label: 'Title', type: 'text', hint: 'Optional.' },
      { key: 'body', label: 'What is on your mind?', type: 'textarea', required: true, tall: true },
      PHOTOS,
    ],
  },
  reviews: {
    label: 'Weekly reviews',
    singular: 'weekly review',
    parent: 'journal',
    dateKey: 'week',
    fields: [
      { key: 'week', label: 'Week starting', type: 'date', required: true },
      { key: 'rating', label: 'How was the week?', type: 'select', options: ['5 - Great', '4 - Good', '3 - Okay', '2 - Hard', '1 - Bad'] },
      { key: 'wentWell', label: 'What went well?', type: 'textarea' },
      { key: 'improve', label: 'What did not go well?', type: 'textarea' },
      { key: 'focus', label: 'Focus for next week', type: 'textarea', hint: 'It shows on your Today page all next week.' },
    ],
  },
  // Your name, photo and bio on the Today page. Only one is ever saved.
  profile: {
    label: 'Profile',
    singular: 'profile',
    hidden: true,
    single: true,
    dateKey: 'createdAt',
    fields: [
      { key: 'photo', label: 'Profile photo', type: 'photos', single: true },
      { key: 'name', label: 'Name', type: 'text', required: true },
      { key: 'bio', label: 'Bio', type: 'textarea', hint: 'A line or two about you.' },
      { key: 'location', label: 'Location', type: 'text', hint: 'Optional, for example Cairo, Egypt.' },
    ],
  },
};

// The sections that show in the menus. The profile is edited from the Today page.
export const COLLECTION_KEYS = Object.keys(COLLECTIONS).filter((key) => !COLLECTIONS[key].hidden);

// Pages read or lessons done: keeps the number in range, and records how many
// were added today so the day shows on your grids and charts.
function trackProgress(item, before, doneKey, totalKey) {
  const total = Number(item[totalKey]) || 0;
  let done = Math.max(0, Number(item[doneKey]) || 0);
  if (total) done = Math.min(done, total);
  item[doneKey] = done;
  item.log = { ...((before && before.log) || item.log || {}) };
  const added = done - (Number(before && before[doneKey]) || 0);
  // A new book or course does not count its starting page as read today.
  if (before && added > 0) {
    const today = todayISO();
    item.log[today] = (item.log[today] || 0) + added;
  }
}

// The calendar day of a date in your own time zone, as YYYY-MM-DD.
export function isoDay(date) {
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function todayISO() {
  return isoDay(new Date());
}

// Turns a saved timestamp, like createdAt, into the local day it happened.
export function dayOf(timestamp) {
  const date = new Date(timestamp || '');
  return Number.isNaN(date.getTime()) ? '' : isoDay(date);
}

export function formatDate(iso) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  if (!match) return '';
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12);
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function dateRange(start, end) {
  const first = formatDate(start);
  const last = formatDate(end);
  if (first && last && first !== last) return `${first} – ${last}`;
  return first || last;
}

export function displayTitle(key, item) {
  if (key === 'weights') return `${item.kg} kg on ${formatDate(item.date)}`;
  if (key === 'sessions') return item.topic || `${item.minutes} minutes of coding`;
  if (key === 'courses' && !item.title) return item.playlistTitle || 'Course';
  if (item.title) return item.title;
  return key === 'journal' ? formatDate(item.date) || 'Journal entry' : 'Untitled';
}

// Where a photo can be shown from. The store sets this once it knows (private links from Supabase).
let resolvePhoto = (name) => `photos/${encodeURIComponent(name)}`;
export function setPhotoResolver(resolver) { resolvePhoto = resolver; }

export function photoUrl(name) {
  return resolvePhoto(name);
}

export function coverPhoto(item) {
  const photos = [...(item.afterPhotos || []), ...(item.photos || []), ...(item.beforePhotos || [])];
  return photos[0] || '';
}

// Newest first. Undated items go last, ordered by when they were added.
export function sortItems(key, items) {
  const dateKey = COLLECTIONS[key].dateKey;
  return [...items].sort((a, b) => {
    const left = a[dateKey] || '';
    const right = b[dateKey] || '';
    if (left !== right) return left < right ? 1 : -1;
    return (b.createdAt || '').localeCompare(a.createdAt || '');
  });
}
