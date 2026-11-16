// Loads and saves your data: in Supabase normally, or the local server when testing with ?local.
import { COLLECTIONS, setPhotoResolver } from './schema.js';
import { backend } from './backend.js';

const state = { rev: 0, items: {} };

// Takes in the newest saved data, for example after your phone saved something.
function adopt(data) {
  state.rev = data.rev;
  state.items = data.items || {};
  // Sections added in newer versions start out empty.
  for (const key of Object.keys(COLLECTIONS)) {
    if (!Array.isArray(state.items[key])) state.items[key] = [];
  }
  refreshPhotos();
}

export function items(key) {
  return state.items[key] || [];
}

export function findItem(key, id) {
  return items(key).find((item) => item.id === id);
}

// Everything, for downloading a copy of your data.
export function snapshot() {
  return { version: 1, rev: state.rev, items: structuredClone(state.items) };
}

export async function load() {
  adopt(await backend.fetchData());
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

// Every change is a small function applied to a fresh copy of the data. If another device saved
// first, the save is refused with 409; then the newest data is loaded and the same change is
// applied again on top of it, so neither change is lost.
export function commit(change) {
  const run = async () => {
    let pulled = false;
    for (let attempt = 0; ; attempt++) {
      const next = structuredClone(state.items);
      change(next);
      try {
        state.rev = await backend.saveData(state.rev, next);
        state.items = next;
        window.dispatchEvent(new Event('life:changed'));
        return;
      } catch (error) {
        if (error.status !== 409 || attempt >= 3) {
          if (pulled) window.dispatchEvent(new Event('life:changed'));
          throw error;
        }
        adopt(await backend.fetchData());
        pulled = true;
      }
    }
  };
  const result = queue.then(run, run);
  queue = result.catch(() => {});
  return result;
}

// Asks whether anything changed since this page loaded, and takes it in if so.
// Runs in the same queue as saves, so it never lands in the middle of one.
export function checkForChanges() {
  const run = async () => {
    const rev = await backend.fetchRev();
    if (rev === state.rev) return false;
    adopt(await backend.fetchData());
    window.dispatchEvent(new Event('life:remote'));
    return true;
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
    if (!item) throw new Error('This was deleted on another device or in another tab.');
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

/* ---------- Photos ---------- */

// Photos are private, so each one is shown through a link that is made for you when the app loads.
const photoLinks = new Map();
const TRANSPARENT = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
setPhotoResolver((name) => photoLinks.get(name) || TRANSPARENT);

const PHOTO_FIELDS = ['photos', 'beforePhotos', 'afterPhotos', 'photo'];

export function allPhotoNames(source = state.items) {
  const names = new Set();
  for (const list of Object.values(source || {})) {
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      for (const field of PHOTO_FIELDS) {
        if (Array.isArray(item && item[field])) item[field].forEach((name) => { if (typeof name === 'string' && name) names.add(name); });
      }
    }
  }
  return [...names];
}

async function refreshPhotos() {
  const missing = allPhotoNames().filter((name) => !photoLinks.has(name));
  if (!missing.length) return;
  try {
    const links = await backend.photoUrls(missing);
    let added = false;
    for (const [name, url] of Object.entries(links)) { photoLinks.set(name, url); added = true; }
    if (added) window.dispatchEvent(new Event('life:rerender'));
  } catch {
    // Photos stay blank until the next load. Everything else keeps working.
  }
}

export async function uploadPhoto(file, name) {
  const saved = await backend.uploadPhoto(file, name);
  if (!photoLinks.has(saved)) {
    // Show the photo straight away from the file you picked, until a proper link is made on the next load.
    photoLinks.set(saved, URL.createObjectURL(file));
  }
  return saved;
}

// Your profile, or a starting one until you save your own.
export function profile() {
  return items('profile')[0] || null;
}
