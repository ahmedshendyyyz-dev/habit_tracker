// Loads and saves your data through the local server.
import { COLLECTIONS } from './schema.js';

const state = { rev: 0, items: {} };

const HEADERS = { 'X-Habit-Tracker': '1' };

async function request(url, options) {
  let response;
  try {
    response = await fetch(url, options);
  } catch {
    throw new Error('Could not reach habit_tracker. Make sure the "habit_tracker" window is still open.');
  }
  let body = null;
  try {
    body = await response.json();
  } catch {
    // Handled by the status check below.
  }
  if (!response.ok) throw new Error((body && body.error) || 'Something went wrong. Please try again.');
  return body;
}

export function items(key) {
  return state.items[key] || [];
}

export function findItem(key, id) {
  return items(key).find((item) => item.id === id);
}

export async function load() {
  const data = await request('/api/data');
  state.rev = data.rev;
  state.items = data.items;
  // Sections added in newer versions start out empty.
  for (const key of Object.keys(COLLECTIONS)) {
    if (!Array.isArray(state.items[key])) state.items[key] = [];
  }
  await moveOldSections();
}

// DIYs became a type of project. Moves any old DIYs over once, keeping everything about them.
async function moveOldSections() {
  const diys = Array.isArray(state.items.diys) ? state.items.diys : [];
  if (!diys.length) return;
  const STATUS = { Planned: 'Idea', 'In progress': 'In progress', Done: 'Finished' };
  await commit((next) => {
    for (const diy of next.diys) {
      const { date, ...rest } = diy;
      next.projects.push({ ...rest, type: 'DIY', status: STATUS[diy.status] || 'Idea', startDate: date || '', link: '', photos: [] });
    }
    next.diys = [];
  });
}

// One save at a time, so quick actions cannot overwrite each other.
let queue = Promise.resolve();

export function commit(change) {
  const run = async () => {
    const next = structuredClone(state.items);
    change(next);
    const result = await request('/api/data', {
      method: 'PUT',
      headers: { ...HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ rev: state.rev, items: next }),
    });
    state.items = next;
    state.rev = result.rev;
    window.dispatchEvent(new Event('life:changed'));
  };
  const result = queue.then(run, run);
  queue = result.catch(() => {});
  return result;
}

export function saveItem(key, item) {
  const stamped = { ...item, updatedAt: new Date().toISOString() };
  return commit((next) => {
    const index = next[key].findIndex((existing) => existing.id === stamped.id);
    if (index === -1) next[key].push(stamped);
    else next[key][index] = stamped;
  });
}

// Changes the latest saved copy of an item. Use this for quick taps,
// so two taps in a row both count.
export function updateItem(key, id, change) {
  return commit((next) => {
    const item = next[key].find((entry) => entry.id === id);
    if (!item) throw new Error('This was deleted in another tab. Reload the page.');
    change(item);
    item.updatedAt = new Date().toISOString();
  });
}

export function addItems(key, list) {
  const now = new Date().toISOString();
  return commit((next) => { next[key].push(...list.map((item) => ({ ...item, updatedAt: now }))); });
}

export function deleteItem(key, id) {
  return commit((next) => {
    next[key] = next[key].filter((item) => item.id !== id);
    // Remove links that pointed at the deleted item.
    if (key === 'trips') next.bucket.forEach((item) => { if (item.tripId === id) item.tripId = ''; });
    if (key === 'goals') next.goals.forEach((item) => { if (item.parentId === id) item.parentId = ''; });
    if (key === 'goals') next.tasks.forEach((item) => { if (item.goalId === id) item.goalId = ''; });
    if (key === 'goals') next.bucket.forEach((item) => { if (item.goalId === id) item.goalId = ''; });
    if (key === 'projects') next.tasks.forEach((item) => { if (item.projectId === id) item.projectId = ''; });
  });
}

export async function uploadPhoto(file) {
  const match = /\.[A-Za-z0-9]+$/.exec(file.name);
  const ext = match ? match[0].toLowerCase() : '';
  const result = await request(`/api/photos?ext=${encodeURIComponent(ext)}`, {
    method: 'POST',
    headers: { ...HEADERS, 'Content-Type': 'application/octet-stream' },
    body: file,
  });
  return result.name;
}

// Your profile, or a starting one until you save your own.
export function profile() {
  return items('profile')[0] || null;
}
