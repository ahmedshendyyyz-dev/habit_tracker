// Small building blocks shared by every page.
import { confirmDialog, h, toast } from './ui.js';
import { deleteItem, items, undoable, updateItem } from './store.js';
import { COLLECTIONS, displayTitle, formatDate } from './schema.js';
import { openForm } from './form.js';
import { icon, SECTION_ICONS } from './icons.js';

export const rerender = () => window.dispatchEvent(new Event('life:rerender'));

// Runs a change, then shows a message with an Undo button that puts everything back.
export async function withUndo(run, message) {
  try {
    const undo = await undoable(run);
    toast(message, false, undo && {
      label: 'Undo',
      onClick: async () => {
        try { await undo(); toast('Undone'); } catch (error) { toast(`Not undone: ${error.message}`, true); }
      },
    });
    return true;
  } catch (error) {
    toast(`Not saved: ${error.message}`, true);
    return false;
  }
}

// Remembers small view choices, like the open or done tab, until the page reloads.
export const viewState = { bucketTab: 'open', showActivity: false, showDoneHabits: false, reorderHabits: false, tasksView: 'week', weekOffset: 0, habitLogDay: {}, archived: {} };

export function newButton(key, defaults, label) {
  return h('button', {
    class: 'btn btn-primary',
    type: 'button',
    'data-add': key,
    onclick: () => openForm(key, null, defaults),
  }, label || `New ${COLLECTIONS[key].singular}`);
}

export function counter(value) {
  return h('span', { class: 'counter' }, String(value));
}

const STATUS_TONES = {
  'In progress': 'accent',
  Interviewing: 'accent',
  Current: 'success',
  Done: 'success',
  Finished: 'success',
  Offer: 'success',
  Paused: 'attention',
  Reading: 'accent',
  Booked: 'accent',
  'Want to read': 'default',
  Planned: 'default',
  Closed: 'muted',
  Past: 'muted',
};

export function statusLabel(status) {
  if (!status) return null;
  return h('span', { class: `label label-${STATUS_TONES[status] || 'default'}` }, status);
}

export function progressBar(value, name) {
  const progress = Math.max(0, Math.min(Number(value) || 0, 100));
  return h('div', {
    class: 'progress',
    role: 'progressbar',
    'aria-valuemin': 0,
    'aria-valuemax': 100,
    'aria-valuenow': progress,
    'aria-label': `Progress on ${name}`,
  }, h('span', { style: `width: ${progress}%` }));
}

export function blankslate(key, message, defaults, buttonLabel) {
  return h('div', { class: 'box blankslate' },
    icon(SECTION_ICONS[key], 'icon blankslate-icon'),
    h('h3', {}, message || `No ${COLLECTIONS[key].label.toLowerCase()} yet`),
    h('p', {}, COLLECTIONS[key].blurb),
    newButton(key, defaults, buttonLabel));
}

export function subhead(key, count) {
  const collection = COLLECTIONS[key];
  return h('div', { class: 'subhead' },
    h('div', { class: 'subhead-text' },
      h('h1', {}, collection.label, count > 0 && counter(count)),
      h('p', {}, collection.blurb)),
    newButton(key));
}

export function boxSection(title, content, extra) {
  return h('section', { class: 'box' },
    h('div', { class: 'box-header' }, h('h2', {}, title), extra),
    content);
}

// A small number tile, for example "12 days".
export function stat(label, value, unit) {
  return h('div', { class: 'stat box' },
    h('span', { class: 'stat-label' }, label),
    h('span', { class: 'stat-value' }, value, unit && h('span', { class: 'stat-unit' }, ` ${unit}`)));
}

export async function confirmDelete(key, item, message) {
  const back = COLLECTIONS[key].parent || key;
  const title = displayTitle(key, item);
  const yes = await confirmDialog({
    title: `Delete "${title}"?`,
    message: message || 'This removes it from your site. Its photos stay in your photos folder, and a recent copy is kept in your backups.',
    confirmLabel: 'Delete',
    danger: true,
  });
  if (!yes) return;
  const run = async () => {
    await deleteItem(key, item.id);
    if (COLLECTIONS[key].afterDelete) await COLLECTIONS[key].afterDelete(item);
  };
  if (await withUndo(run, `Deleted "${title}"`)) window.location.hash = `#/${back}`;
}

/* ---------- Archive ---------- */

// Archive hides something finished from its lists without deleting it. Undo puts it back.
export function archiveButton(key, item) {
  const title = displayTitle(key, item);
  const back = COLLECTIONS[key].parent || key;
  return h('button', {
    class: 'btn',
    type: 'button',
    'data-archive': true,
    onclick: async () => {
      const archiving = !item.archived;
      const done = await withUndo(() => updateItem(key, item.id, (latest) => {
        if (archiving) { latest.archived = true; latest.archivedDate = new Date().toISOString().slice(0, 10); }
        else { delete latest.archived; delete latest.archivedDate; }
      }), archiving ? `Archived "${title}"` : `"${title}" is back in your list`);
      if (done && archiving) window.location.hash = `#/${back}`;
    },
  }, icon('box'), item.archived ? 'Unarchive' : 'Archive');
}

// "Show archived (3)" at the bottom of a list, opening a plain list of links.
export function archivedSection(key) {
  const archived = items(key).filter((item) => item.archived)
    .sort((a, b) => (b.archivedDate || '').localeCompare(a.archivedDate || ''));
  if (!archived.length) return null;
  const open = viewState.archived[key];
  return h('section', { class: 'archived' },
    h('button', {
      class: 'btn btn-small btn-invisible',
      type: 'button',
      'aria-expanded': String(Boolean(open)),
      onclick: () => { viewState.archived[key] = !open; rerender(); },
    }, icon('box'), open ? 'Hide archived' : `Show archived (${archived.length})`),
    open && h('ul', { class: 'box list' }, archived.map((item) => h('li', { class: 'list-row' },
      h('div', { class: 'row-main' },
        h('div', { class: 'row-title' }, h('a', { href: `#/${key}/${item.id}` }, displayTitle(key, item))),
        item.archivedDate && h('p', { class: 'muted small' }, `Archived ${formatDate(item.archivedDate)}`))))));
}
