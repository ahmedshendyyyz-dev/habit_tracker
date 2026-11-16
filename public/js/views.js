// Builds each page from your saved data.
import { COLLECTIONS, COLLECTION_KEYS, HUBS, coverPhoto, dateRange, displayTitle, formatDate, photoUrl, sortItems, todayISO } from './schema.js';
import { h, openLightbox, toast } from './ui.js';
import { findItem, items, profile, saveItem } from './store.js';
import { openForm } from './form.js';
import { icon, SECTION_ICONS } from './icons.js';
import { activityEvents, countByDay } from './activity.js';
import { contributionGrid } from './grid.js';
import { blankslate, boxSection, confirmDelete, counter, progressBar, rerender, stat, statusLabel, subhead, viewState } from './components.js';
import { linkedTasks, taskDetails, taskDoneButton, tasksPage, todayCounts, todayTasksBox } from './tasksView.js';
import { habitCounts, habitDetailPage, habitsPage, todayHabitsBox, topStreak } from './habitsView.js';
import { addDays, formatTime, repeatLabel } from './tasks.js';
import { goalProgress } from './goals.js';
import { goalDetailPage, goalStatusLabel, nextMilestoneLine } from './goalsView.js';
import { healthPage, workoutMeta, workoutTable } from './healthView.js';
import { courseDetailPage, learningPage, progressPanel } from './learningView.js';
import { currentFocus, reflectPage, reviewIsDue, reviewPage } from './reflectView.js';
import { packingBox, tripStatus } from './tripsView.js';
import { settingsPage } from './settingsView.js';
import { addItems, updateItem } from './store.js';

const DEFAULT_NAME = 'Ahmed Shendy';
const safeLink = (url) => (/^https?:\/\//i.test(url || '') ? url : '');
const lines = (text) => (text || '').split('\n').map((line) => line.trim()).filter(Boolean);
function metaLine(key, item) {
  switch (key) {
    case 'trips': return [item.place, dateRange(item.startDate, item.endDate)].filter(Boolean).join(' · ');
    case 'projects': return [item.startDate && `Started ${formatDate(item.startDate)}`, item.type === 'DIY' && item.cost].filter(Boolean).join(' · ');
    case 'journal': return [formatDate(item.date), item.mood && item.mood !== 'Not set' && item.mood].filter(Boolean).join(' · ');
    case 'weights': return item.note || '';
    case 'workouts': return workoutMeta(item);
    case 'sessions': return [formatDate(item.date), item.minutes && `${item.minutes} min`].filter(Boolean).join(' · ');
    case 'courses': return [item.platform, item.totalLessons ? `${Number(item.doneLessons) || 0} of ${item.totalLessons} lessons` : ''].filter(Boolean).join(' · ');
    case 'books': return [item.author, item.totalPages ? `Page ${Number(item.currentPage) || 0} of ${item.totalPages}` : ''].filter(Boolean).join(' · ');
    case 'wishlist': return [item.price, item.bought ? `Got it ${formatDate(item.boughtDate)}` : `${item.priority || 'Medium'} priority`].filter(Boolean).join(' · ');
    default: return '';
  }
}

/* ---------- Rows and cards ---------- */

function card(key, item) {
  const cover = coverPhoto(item);
  return h('a', { class: 'card', href: `#/${key}/${item.id}` },
    h('div', { class: 'card-media' },
      cover ? h('img', { src: photoUrl(cover), alt: '', loading: 'lazy' }) : icon(SECTION_ICONS[key], 'icon card-placeholder')),
    h('div', { class: 'card-body' },
      h('div', { class: 'card-title' }, h('h3', {}, displayTitle(key, item)),
        h('span', { class: 'card-labels' },
          key === 'projects' && item.type === 'DIY' && h('span', { class: 'label label-default' }, 'DIY'),
          statusLabel(key === 'trips' ? tripStatus(item) : item.status))),
      metaLine(key, item) && h('p', { class: 'muted' }, metaLine(key, item)),
      item.notes && h('p', { class: 'muted clamp' }, item.notes)));
}

function goalRow(goal) {
  const parent = goal.parentId && findItem('goals', goal.parentId);
  const progress = goalProgress(goal);
  const title = displayTitle('goals', goal);
  const details = [
    goal.targetDate && `Target ${formatDate(goal.targetDate)}`,
    nextMilestoneLine(goal),
    parent && `Supports ${displayTitle('goals', parent)}`,
  ].filter(Boolean).join(' · ');
  return h('li', { class: `list-row${progress >= 100 ? ' is-done' : ''}` },
    icon(progress >= 100 ? 'check' : 'target', `icon row-icon${progress >= 100 ? ' is-success' : ''}`),
    h('div', { class: 'row-main' },
      h('div', { class: 'row-title' },
        h('a', { href: `#/goals/${goal.id}` }, title),
        goalStatusLabel(goal),
        goal.area && h('span', { class: 'label label-default' }, goal.area),
        h('span', { class: 'muted row-aside' }, `${progress}%`)),
      progressBar(progress, title),
      details && h('p', { class: 'muted small' }, details)));
}

async function toggleBucket(item, checkbox) {
  try {
    const done = checkbox.checked;
    await saveItem('bucket', { ...item, done, doneDate: done ? item.doneDate || todayISO() : '', tripId: done ? item.tripId : '' });
    if (done) toast('Ticked off. Well done!');
  } catch (error) {
    checkbox.checked = !checkbox.checked;
    toast(`Not saved: ${error.message}`, true);
  }
}

function bucketRow(item) {
  const trip = item.tripId && findItem('trips', item.tripId);
  const title = displayTitle('bucket', item);
  return h('li', { class: `list-row${item.done ? ' is-done' : ''}` },
    h('input', {
      type: 'checkbox',
      class: 'row-check',
      checked: Boolean(item.done),
      'aria-label': `Mark "${title}" as done`,
      onchange: (event) => toggleBucket(item, event.target),
    }),
    h('div', { class: 'row-main' },
      h('div', { class: 'row-title' }, h('a', { href: `#/bucket/${item.id}` }, title)),
      (item.done || trip) && h('p', { class: 'muted small' },
        item.done && item.doneDate && `Done ${formatDate(item.doneDate)}`,
        item.done && item.doneDate && trip && ' · ',
        trip && ['On ', h('a', { href: `#/trips/${trip.id}` }, displayTitle('trips', trip))])));
}

function plainRow(key, item) {
  const photo = coverPhoto(item);
  const preview = key === 'journal' ? item.body : item.notes;
  return h('li', { class: 'list-row' },
    icon(SECTION_ICONS[key], 'icon row-icon'),
    h('div', { class: 'row-main' },
      h('div', { class: 'row-title' }, h('a', { href: `#/${key}/${item.id}` }, displayTitle(key, item)), statusLabel(item.status)),
      metaLine(key, item) && h('p', { class: 'muted small' }, metaLine(key, item)),
      preview && h('p', { class: 'clamp row-preview' }, preview)),
    photo && h('img', { class: 'row-thumb', src: photoUrl(photo), alt: '', loading: 'lazy' }));
}

/* ---------- Today: your profile page ---------- */

function avatar(me, size) {
  const photo = me && me.photo && me.photo[0];
  const name = (me && me.name) || DEFAULT_NAME;
  if (photo) return h('img', { class: `avatar avatar-${size}`, src: photoUrl(photo), alt: '' });
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0].toUpperCase()).join('');
  return h('span', { class: `avatar avatar-${size} avatar-initials`, 'aria-hidden': 'true' }, initials);
}

export function headerAvatar() {
  return avatar(profile(), 'small');
}

export function displayName() {
  const me = profile();
  return (me && me.name) || DEFAULT_NAME;
}

function profileCard() {
  const me = profile();
  const editProfile = () => openForm('profile', me, { name: DEFAULT_NAME });
  return h('aside', { class: 'profile' },
    h('button', { class: 'profile-photo', type: 'button', 'aria-label': 'Change your profile photo', onclick: editProfile },
      avatar(me, 'large')),
    h('div', { class: 'profile-names' },
      h('h1', {}, displayName()),
      h('p', { class: 'muted' }, new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }))),
    me && me.bio
      ? h('p', { class: 'profile-bio' }, me.bio)
      : h('p', { class: 'profile-bio muted' }, 'Add a short bio so this page feels like yours.'),
    h('button', { class: 'btn btn-block', type: 'button', 'data-edit-profile': true, onclick: editProfile }, 'Edit profile'),
    me && me.location && h('p', { class: 'profile-detail muted' }, icon('pin'), me.location));
}

function pinnedGoals() {
  const open = items('goals')
    .filter((goal) => goalProgress(goal) < 100)
    .sort((a, b) => (a.horizon === b.horizon ? (a.targetDate || '9999').localeCompare(b.targetDate || '9999') : a.horizon === 'Short term' ? -1 : 1))
    .slice(0, 6);
  const head = h('div', { class: 'section-head' }, h('h2', {}, 'Goals in progress'), h('a', { href: '#/goals' }, 'All goals'));
  if (!open.length) return h('section', { class: 'today-section' }, head, blankslate('goals', 'No goals in progress'));
  return h('section', { class: 'today-section' }, head,
    h('ol', { class: 'pinned' }, open.map((goal) => {
      const title = displayTitle('goals', goal);
      const progress = goalProgress(goal);
      return h('li', { class: 'box pinned-item' },
        h('div', { class: 'pinned-title' },
          icon('target', 'icon muted'),
          h('a', { href: `#/goals/${goal.id}` }, title),
          goalStatusLabel(goal) || h('span', { class: 'label label-default' }, goal.horizon || 'Goal')),
        h('p', { class: 'muted small' }, nextMilestoneLine(goal) || (goal.targetDate ? `Target ${formatDate(goal.targetDate)}` : 'No target date')),
        h('div', { class: 'pinned-progress' }, progressBar(progress, title), h('span', { class: 'muted small' }, `${progress}%`)));
    })));
}

function activityGrid(events) {
  const grid = contributionGrid(countByDay(events.filter((event) => event.day <= todayISO())));
  return h('section', { class: 'today-section' },
    h('div', { class: 'section-head' }, h('h2', {}, `${grid.total} ${grid.total === 1 ? 'activity' : 'activities'} in the last year`)),
    h('div', { class: 'box box-padded' }, grid.element));
}

function activityFeed(events) {
  const past = events.filter((event) => event.day <= todayISO());
  const shown = past.slice(0, viewState.feedLimit);
  const head = h('div', { class: 'section-head' }, h('h2', {}, 'Activity'));
  if (!shown.length) {
    return h('section', { class: 'today-section' }, head, h('p', { class: 'muted' }, 'What you add and do will show up here.'));
  }
  const groups = [];
  for (const event of shown) {
    const [year, month] = event.day.split('-').map(Number);
    const name = new Date(year, month - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    if (!groups.length || groups[groups.length - 1].name !== name) groups.push({ name, events: [] });
    groups[groups.length - 1].events.push(event);
  }
  return h('section', { class: 'today-section' }, head,
    groups.map((group) => h('div', { class: 'feed-month' },
      h('h3', { class: 'feed-month-name' }, h('span', {}, group.name)),
      h('ol', { class: 'feed' }, group.events.map((event) => h('li', { class: 'feed-item' },
        h('span', { class: 'feed-badge' }, icon(SECTION_ICONS[event.key])),
        h('p', {}, `${event.verb} `, event.item
          ? h('a', { href: `#/${event.key}/${event.item.id}` }, displayTitle(event.key, event.item))
          : h('a', { href: event.href }, event.text)),
        h('span', { class: 'muted small feed-date' }, formatDate(event.day))))))),
    past.length > shown.length && h('button', {
      class: 'btn btn-block',
      type: 'button',
      onclick: () => { viewState.feedLimit += 20; rerender(); },
    }, 'Show more activity'));
}

// Four numbers at the top of Today: how the day and the week are going.
function snapshot(events) {
  const tasks = todayCounts();
  const habits = habitCounts();
  const top = topStreak();
  const weekStart = addDays(todayISO(), -6);
  const doneThisWeek = events
    .filter((event) => event.day >= weekStart && event.day <= todayISO() && (event.verb === 'Completed' || (event.key === 'habits' && !event.item)))
    .reduce((sum, event) => sum + event.count, 0);
  return h('div', { class: 'stats' },
    stat('Tasks today', `${tasks.done}/${tasks.total}`, 'done'),
    stat('Habits today', `${habits.done}/${habits.total}`, 'done'),
    stat('Longest streak', top ? String(top.streak) : '0', top ? `${top.streak === 1 ? 'day' : 'days'}, ${displayTitle('habits', top.habit)}` : 'days'),
    stat('Last 7 days', String(doneThisWeek), 'check-ins and tasks'));
}

// Last week's chosen focus, and a nudge near the end of the week to write the review.
function weekNotes() {
  const focus = currentFocus();
  const due = reviewIsDue();
  if (!focus && !due) return null;
  return h('div', { class: 'stack-sm' },
    focus && h('section', { class: 'flash flash-accent' },
      icon('target'),
      h('div', {}, h('strong', {}, 'This week\'s focus'), h('p', { class: 'prose-small' }, focus.focus))),
    due && h('section', { class: 'flash flash-attention' },
      icon('calendar'),
      h('div', {}, h('strong', {}, 'Time for your weekly review. '), h('a', { href: '#/journal' }, 'Look back at your week'))));
}

function todayPage() {
  const events = activityEvents();
  return [h('div', { class: 'profile-layout' },
    profileCard(),
    h('div', { class: 'profile-main' },
      weekNotes(),
      snapshot(events),
      todayTasksBox(),
      todayHabitsBox(),
      pinnedGoals(),
      activityGrid(events),
      activityFeed(events)))];
}

/* ---------- Section pages ---------- */

function goalsPage() {
  const isFinished = (goal) => goalProgress(goal) >= 100;
  const all = sortItems('goals', items('goals')).reverse()
    .sort((a, b) => Number(isFinished(a)) - Number(isFinished(b)));
  if (!all.length) return [subhead('goals', 0), blankslate('goals')];
  const group = (horizon) => {
    const list = all.filter((goal) => (goal.horizon || 'Short term') === horizon);
    return boxSection([`${horizon} goals `, counter(list.length)], list.length
      ? h('ul', { class: 'list' }, list.map(goalRow))
      : h('div', { class: 'box-empty' },
          h('p', { class: 'muted' }, `No ${horizon.toLowerCase()} goals yet.`),
          h('button', { class: 'btn btn-small', type: 'button', onclick: () => openForm('goals', null, { horizon }) }, `New ${horizon.toLowerCase()} goal`)));
  };
  return [subhead('goals', all.length), h('div', { class: 'stack' }, group('Short term'), group('Long term'))];
}

function bucketPage() {
  const all = sortItems('bucket', items('bucket'));
  if (!all.length) return [subhead('bucket', 0), blankslate('bucket')];
  const todo = all.filter((item) => !item.done);
  const done = all.filter((item) => item.done);
  const tab = viewState.bucketTab;
  const shown = tab === 'done' ? done : todo;
  const tabButton = (name, label, count, iconName) => h('button', {
    class: `box-tab${tab === name ? ' is-selected' : ''}`,
    type: 'button',
    'aria-pressed': String(tab === name),
    onclick: () => { viewState.bucketTab = name; rerender(); },
  }, icon(iconName), `${count} ${label}`);
  return [
    subhead('bucket', all.length),
    h('section', { class: 'box' },
      h('div', { class: 'box-header box-header-tabs' },
        tabButton('open', 'To do', todo.length, 'circle'),
        tabButton('done', 'Done', done.length, 'check')),
      shown.length
        ? h('ul', { class: 'list' }, shown.map(bucketRow))
        : h('div', { class: 'box-empty' }, h('p', { class: 'muted' }, tab === 'done'
          ? 'Nothing ticked off yet. Your first one is waiting.'
          : 'You have done everything on your list. Time to dream up more.'))),
  ];
}

function wishlistPage() {
  const rank = { High: 0, Medium: 1, Low: 2 };
  const all = [...items('wishlist')].sort((a, b) => (rank[a.priority] ?? 1) - (rank[b.priority] ?? 1) || (b.createdAt || '').localeCompare(a.createdAt || ''));
  if (!all.length) return [subhead('wishlist', 0), blankslate('wishlist')];
  const want = all.filter((item) => !item.bought);
  const got = all.filter((item) => item.bought).sort((a, b) => (b.boughtDate || '').localeCompare(a.boughtDate || ''));
  const tab = viewState.wishTab || 'want';
  const shown = tab === 'got' ? got : want;
  const tabButton = (name, label, count, iconName) => h('button', {
    class: `box-tab${tab === name ? ' is-selected' : ''}`,
    type: 'button',
    'aria-pressed': String(tab === name),
    onclick: () => { viewState.wishTab = name; rerender(); },
  }, icon(iconName), `${count} ${label}`);
  return [
    subhead('wishlist', all.length),
    h('section', { class: 'box' },
      h('div', { class: 'box-header box-header-tabs' }, tabButton('want', 'Want', want.length, 'circle'), tabButton('got', 'Got', got.length, 'check')),
      shown.length
        ? h('ul', { class: 'list' }, shown.map((item) => plainRow('wishlist', item)))
        : h('div', { class: 'box-empty' }, h('p', { class: 'muted' }, tab === 'got' ? 'Nothing ticked off yet.' : 'You have everything on your list.'))),
  ];
}

function projectsPage() {
  const all = sortItems('projects', items('projects'));
  if (!all.length) return [subhead('projects', 0), blankslate('projects')];
  const filter = viewState.projectType || 'All';
  const shown = filter === 'All' ? all : all.filter((item) => (item.type || 'Project') === filter);
  const tabButton = (name, label) => h('button', {
    class: `box-tab${filter === name ? ' is-selected' : ''}`,
    type: 'button',
    'aria-pressed': String(filter === name),
    onclick: () => { viewState.projectType = name; rerender(); },
  }, label, counter(name === 'All' ? all.length : all.filter((item) => (item.type || 'Project') === name).length));
  return [
    subhead('projects', all.length),
    h('div', { class: 'view-switch' }, tabButton('All', 'All'), tabButton('Project', 'Projects'), tabButton('DIY', 'DIYs')),
    shown.length
      ? h('div', { class: 'card-grid' }, shown.map((item) => card('projects', item)))
      : h('div', { class: 'box blankslate' }, h('h3', {}, filter === 'DIY' ? 'No DIYs yet' : 'No projects yet'),
        h('button', { class: 'btn btn-primary', type: 'button', onclick: () => openForm('projects', null, { type: filter === 'DIY' ? 'DIY' : 'Project' }) }, filter === 'DIY' ? 'New DIY' : 'New project')),
  ];
}

function listPage(key) {
  const list = sortItems(key, items(key));
  if (!list.length) return [subhead(key, 0), blankslate(key)];
  const usesCards = ['trips', 'projects'].includes(key);
  return [
    subhead(key, list.length),
    usesCards
      ? h('div', { class: 'card-grid' }, list.map((item) => card(key, item)))
      : h('ul', { class: 'box list' }, list.map((item) => plainRow(key, item))),
  ];
}

// Makes a long term goal from a bucket list item, and links the two.
async function bucketToGoal(item) {
  const goal = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    title: item.title,
    horizon: 'Long term',
    area: 'Personal',
    targetDate: '',
    progress: 0,
    parentId: '',
    notes: item.notes || '',
    milestones: [],
    log: [],
    bucketId: item.id,
  };
  try {
    await addItems('goals', [goal]);
    await updateItem('bucket', item.id, (latest) => { latest.goalId = goal.id; });
    toast('Goal created. Add a target date and milestones to plan it.');
    window.location.hash = `#/goals/${goal.id}`;
  } catch (error) {
    toast(`Not created: ${error.message}`, true);
  }
}

/* ---------- Detail page ---------- */

function gallery(photos, title, label) {
  if (!photos || !photos.length) return null;
  return boxSection(label, h('div', { class: 'gallery' }, photos.map((name, index) => h('button', {
    type: 'button',
    'aria-label': `Open ${label.toLowerCase()} ${index + 1} of ${photos.length}`,
    onclick: () => openLightbox(photos, index, photoUrl, title),
  }, h('img', { src: photoUrl(name), alt: '', loading: 'lazy' })))));
}

function textPanel(label, text) {
  return text ? boxSection(label, h('div', { class: 'box-body' }, h('p', { class: 'prose' }, text))) : null;
}

function listPanel(label, text, ordered) {
  const entries = lines(text);
  if (!entries.length) return null;
  return boxSection(label, h('div', { class: 'box-body' },
    h(ordered ? 'ol' : 'ul', { class: ordered ? 'steps' : 'bullets' }, entries.map((entry) => h('li', {}, entry)))));
}

function detailBody(key, item) {
  const title = displayTitle(key, item);
  const panels = [];
  if (key === 'tasks') panels.push(taskDetails(item));
  if (key === 'workouts') panels.push(workoutTable(item));
  if (key === 'books' || key === 'courses') panels.push(progressPanel(key, item));
  if (key === 'projects') panels.push(linkedTasks('projectId', item.id));
  if (key === 'bucket') {
    const trip = item.tripId && findItem('trips', item.tripId);
    if (trip) panels.push(boxSection('Happened on', h('div', { class: 'box-body' }, h('a', { href: `#/trips/${trip.id}` }, displayTitle('trips', trip)))));
    const goal = item.goalId && findItem('goals', item.goalId);
    if (goal) {
      panels.push(boxSection('Working on it as a goal', h('div', { class: 'box-body stack-sm' },
        h('a', { href: `#/goals/${goal.id}` }, displayTitle('goals', goal)),
        progressBar(goalProgress(goal), displayTitle('goals', goal)),
        h('p', { class: 'muted small' }, nextMilestoneLine(goal) || `${goalProgress(goal)}% done`))));
    }
  }
  if (key === 'trips' && tripStatus(item) !== 'Done') panels.push(packingBox(item));
  if (key === 'trips') {
    const linked = items('bucket').filter((entry) => entry.tripId === item.id);
    if (linked.length) panels.push(boxSection('Bucket list items done here', h('ul', { class: 'list' }, linked.map(bucketRow))));
  }
  if (key === 'journal') panels.push(textPanel('Note', item.body));
  if (key === 'projects' && item.type === 'DIY') panels.push(listPanel('Materials', item.materials, false), listPanel('Steps', item.steps, true));
  panels.push(textPanel('Notes', item.notes));
  const link = safeLink(item.link);
  if (link) {
    panels.push(boxSection('Link', h('div', { class: 'box-body' },
      h('a', { class: 'with-icon', href: link, target: '_blank', rel: 'noopener noreferrer', style: 'overflow-wrap: anywhere' }, icon('link'), link))));
  }
  panels.push(gallery(item.beforePhotos, title, 'Before photos'), gallery(item.afterPhotos, title, 'After photos'), gallery(item.photos, title, 'Photos'));
  // A finished trip keeps its packing list at the bottom, for next time.
  if (key === 'trips' && tripStatus(item) === 'Done' && (item.packing || []).length) panels.push(packingBox(item));
  return panels.filter(Boolean);
}

function detailMeta(key, item) {
  if (key === 'tasks') return [formatDate(item.date), formatTime(item.time), repeatLabel(item)].filter(Boolean).join(' · ');
  if (key === 'goals') return [item.horizon, item.targetDate && `Target ${formatDate(item.targetDate)}`].filter(Boolean).join(' · ');
  if (key === 'bucket') return item.done ? `Done${item.doneDate ? ` ${formatDate(item.doneDate)}` : ''}` : 'Still to do';
  return metaLine(key, item);
}

function detailPage(key, id) {
  const item = findItem(key, id);
  const collection = COLLECTIONS[key];
  const home = collection.parent ? [`#/${collection.parent}`, `${HUBS[collection.parent].label} · ${collection.label}`] : [`#/${key}`, collection.label];
  const crumb = h('nav', { class: 'breadcrumb', 'aria-label': 'Breadcrumb' }, h('a', { href: home[0] }, home[1]), h('span', { 'aria-hidden': 'true' }, '/'));
  if (!item) {
    return [crumb, h('div', { class: 'box blankslate' }, h('h3', {}, 'This item could not be found'), h('p', {}, 'It may have been deleted.'))];
  }
  const title = displayTitle(key, item);
  const status = key === 'bucket'
    ? h('span', { class: `label label-${item.done ? 'success' : 'default'}` }, item.done ? 'Done' : 'To do')
    : key === 'tasks' ? h('span', { class: 'label label-default' }, item.kind || 'Task')
      : statusLabel(item.status);
  const meta = detailMeta(key, item);
  return [
    crumb,
    h('div', { class: 'detail-head' },
      h('div', { class: 'detail-title' },
        h('h1', {}, title),
        (status || meta) && h('p', { class: 'detail-meta' }, status, meta && h('span', { class: 'muted' }, meta))),
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn', type: 'button', 'data-edit': true, onclick: () => openForm(key, item) }, icon('pencil'), 'Edit'),
        key === 'tasks' && taskDoneButton(item),
        key === 'bucket' && !item.done && !(item.goalId && findItem('goals', item.goalId)) && h('button', {
          class: 'btn btn-primary',
          type: 'button',
          onclick: () => bucketToGoal(item),
        }, icon('target'), 'Turn into a goal'),
        h('button', { class: 'btn btn-danger', type: 'button', 'data-delete': true, onclick: () => confirmDelete(key, item) }, 'Delete'))),
    h('div', { class: 'stack' }, detailBody(key, item)),
  ];
}

/* ---------- Search ---------- */

const SEARCH_FIELDS = ['title', 'place', 'notes', 'body', 'organization', 'materials', 'steps', 'status', 'author', 'topic', 'platform', 'note'];

function searchPage(query) {
  const needle = query.trim().toLowerCase();
  const groups = COLLECTION_KEYS.map((key) => ({
    key,
    matches: needle ? sortItems(key, items(key)).filter((item) => [
      ...SEARCH_FIELDS.map((field) => item[field]),
      ...(Array.isArray(item.exercises) ? item.exercises.map((exercise) => exercise.name) : []),
    ].some((text) => String(text || '').toLowerCase().includes(needle))) : [],
  })).filter((group) => group.matches.length);
  const total = groups.reduce((sum, group) => sum + group.matches.length, 0);
  return [
    h('div', { class: 'subhead' }, h('div', { class: 'subhead-text' },
      h('h1', {}, needle ? `${total} ${total === 1 ? 'result' : 'results'} for "${query.trim()}"` : 'Search'),
      h('p', {}, 'Searches names, places, notes and journal entries across every section.'))),
    total
      ? h('div', { class: 'stack' }, groups.map((group) => boxSection([`${COLLECTIONS[group.key].label} `, counter(group.matches.length)],
        h('ul', { class: 'list' }, group.matches.map((item) => plainRow(group.key, item))))))
      : h('div', { class: 'box blankslate' }, icon('search', 'icon blankslate-icon'),
        h('h3', {}, needle ? 'Nothing matched' : 'Type in the search box above'),
        h('p', {}, needle ? 'Try a different word, or check the spelling.' : 'Find any trip, goal, project or journal entry.')),
  ];
}

/* ---------- Routing ---------- */

export function renderRoute(hash) {
  const [, key, ...rest] = (hash || '').replace(/^#/, '').split('/');
  const id = rest.join('/');
  if (!key) return { active: '', nodes: todayPage() };
  if (key === 'search') {
    let query = '';
    try { query = decodeURIComponent(id); } catch { query = id; }
    return { active: 'search', query, nodes: searchPage(query) };
  }
  if (key === 'settings') return { active: key, nodes: settingsPage() };
  if (key === 'health' || key === 'learning') return { active: key, nodes: key === 'health' ? healthPage() : learningPage() };
  // Weight, workouts, courses, books and coding sessions live on their hub page.
  const parent = COLLECTIONS[key] && COLLECTIONS[key].parent;
  if (key === 'reviews') return { active: 'journal', nodes: id ? reviewPage(id) : reflectPage() };
  if (parent && !id) return { active: parent, nodes: parent === 'health' ? healthPage() : learningPage() };
  if (parent) return { active: parent, nodes: key === 'courses' ? courseDetailPage(id) : detailPage(key, id) };
  if (key === 'journal' && !id) return { active: key, nodes: reflectPage() };
  if (key === 'projects' && !id) return { active: key, nodes: projectsPage() };
  if (!COLLECTIONS[key] || COLLECTIONS[key].hidden) {
    return { active: '', nodes: [h('div', { class: 'box blankslate' }, h('h3', {}, 'This page does not exist'), h('p', {}, h('a', { href: '#/' }, 'Go to Today')))] };
  }
  if (key === 'habits' && id) return { active: key, nodes: habitDetailPage(id) };
  if (key === 'goals' && id) return { active: key, nodes: goalDetailPage(id) };
  if (id) return { active: key, nodes: detailPage(key, id) };
  if (key === 'tasks') return { active: key, nodes: tasksPage() };
  if (key === 'habits') return { active: key, nodes: habitsPage() };
  if (key === 'goals') return { active: key, nodes: goalsPage() };
  if (key === 'bucket') return { active: key, nodes: bucketPage() };
  if (key === 'wishlist') return { active: key, nodes: wishlistPage() };
  return { active: key, nodes: listPage(key) };
}
