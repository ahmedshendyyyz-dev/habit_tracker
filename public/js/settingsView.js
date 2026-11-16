// Settings: copies of your data in another folder, downloading your data, and restoring a backup.
import { formatDate } from './schema.js';
import { confirmDialog, h, toast } from './ui.js';
import { icon } from './icons.js';
import { boxSection, counter } from './components.js';

const HEADERS = { 'X-Habit-Tracker': '1', 'Content-Type': 'application/json' };

async function call(url, options = {}) {
  let response;
  try {
    response = await fetch(url, options);
  } catch {
    throw new Error('Could not reach habit_tracker. Make sure its window is still open.');
  }
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error((body && body.error) || 'Something went wrong. Please try again.');
  return body;
}

const when = (iso) => {
  if (!iso) return '';
  const date = new Date(iso);
  return `${formatDate(iso.slice(0, 10)) || iso.slice(0, 10)}, ${date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
};
const size = (bytes) => (bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`);

function backupName(entry) {
  if (entry.latest) return 'Just before your last save';
  const day = /^(\d{4}-\d{2}-\d{2})\.json$/.exec(entry.name);
  if (day) return `Start of ${formatDate(day[1])}`;
  if (entry.name.startsWith('before-restore-')) return 'Before a restore';
  if (entry.name.startsWith('before-phase')) return `Before an update (${entry.name.replace('.json', '')})`;
  return entry.name.replace('.json', '');
}

async function restore(payload, label) {
  const yes = await confirmDialog({
    title: `Restore ${label}?`,
    message: 'Your data will be replaced with this backup. What you have now is saved first as "Before a restore", so you can switch back.',
    confirmLabel: 'Restore',
    danger: true,
  });
  if (!yes) return;
  try {
    await call('/api/restore', { method: 'POST', headers: HEADERS, body: JSON.stringify(payload) });
    toast('Restored. Reloading…');
    setTimeout(() => window.location.reload(), 600);
  } catch (error) {
    toast(`Not restored: ${error.message}`, true);
  }
}

function folderBox(status, redraw) {
  const input = h('input', {
    id: 'backup-folder', type: 'text', class: 'inline-input inline-grow', value: status.backupFolder,
    placeholder: status.suggestedFolder || 'For example D:\\habit_tracker backups', spellcheck: false,
  });
  const save = async (folder) => {
    try {
      redraw(await call('/api/backup/folder', { method: 'PUT', headers: HEADERS, body: JSON.stringify({ folder }) }));
      toast(folder ? 'Saved. A copy was made just now.' : 'Copies to another folder are off.');
    } catch (error) {
      toast(error.message, true);
    }
  };
  const state = status.lastCopyError
    ? h('p', { class: 'flash flash-attention' }, icon('close'), h('span', {}, status.lastCopyError))
    : status.backupFolder
      ? h('p', { class: 'flash flash-accent' }, icon('check'), h('span', {}, status.lastCopy ? `Last copy: ${when(status.lastCopy)}. A new one is made once a day while the site is running.` : 'No copy yet.'))
      : h('p', { class: 'muted' }, 'Off. Your data is only in this PC\'s data folder.');
  return boxSection('Copy to another folder', h('div', { class: 'box-body stack-sm' },
    h('p', {}, 'Once a day, your data and any new photos are copied to a folder you choose. Pick a OneDrive folder and the copy also reaches the cloud, so it survives if this PC breaks.'),
    state,
    h('div', { class: 'field' },
      h('label', { for: 'backup-folder' }, 'Backup folder'),
      h('form', { class: 'inline-form', onsubmit: (event) => { event.preventDefault(); save(input.value.trim()); } },
        input,
        h('button', { class: 'btn btn-primary', type: 'submit' }, 'Save')),
      status.suggestedFolder && !status.backupFolder && h('button', {
        class: 'btn btn-small', type: 'button', onclick: () => { input.value = status.suggestedFolder; save(status.suggestedFolder); },
      }, 'Use my OneDrive folder')),
    status.backupFolder && h('div', { class: 'btn-row' },
      h('button', {
        class: 'btn', type: 'button',
        onclick: async () => {
          try { redraw(await call('/api/backup/run', { method: 'POST', headers: HEADERS, body: '{}' })); toast('Copied just now'); } catch (error) { toast(error.message, true); }
        },
      }, 'Copy now'),
      h('button', { class: 'btn btn-danger', type: 'button', onclick: () => save('') }, 'Turn off'))));
}

function downloadBox() {
  return boxSection('Download your data', h('div', { class: 'box-body stack-sm' },
    h('p', {}, 'Saves all your entries as one file you can keep anywhere. Photos are not in it; they stay in the photos folder, and the folder copy above includes them.'),
    h('div', { class: 'btn-row' }, h('a', { class: 'btn', href: '/api/export', download: '' }, icon('download'), 'Download data file'))));
}

function restoreBox(status) {
  const fileInput = h('input', {
    id: 'restore-file', type: 'file', accept: '.json,application/json',
    onchange: async () => {
      const file = fileInput.files[0];
      if (!file) return;
      try {
        const data = JSON.parse(await file.text());
        await restore({ data }, `"${file.name}"`);
      } catch {
        toast('That file could not be read. Choose a habit_tracker data file.', true);
      }
      fileInput.value = '';
    },
  });
  return boxSection(['Restore a backup ', counter(status.backups.length)], [
    h('div', { class: 'box-body stack-sm' },
      h('p', {}, 'A copy is saved before your first change each day, and just before every save. Restoring replaces your data with the copy you pick.'),
      h('div', { class: 'field' }, h('label', { for: 'restore-file' }, 'Restore from a downloaded file'), fileInput)),
    h('ul', { class: 'list list-top' }, status.backups.slice(0, 30).map((entry) => h('li', { class: 'list-row' },
      icon('calendar', 'icon row-icon'),
      h('div', { class: 'row-main' },
        h('div', { class: 'row-title row-title-task' }, h('span', { class: 'milestone-title' }, backupName(entry))),
        h('p', { class: 'muted small' }, `Saved ${when(entry.modified)} · ${size(entry.size)}`)),
      h('button', { class: 'btn btn-small', type: 'button', onclick: () => restore({ name: entry.name }, backupName(entry).toLowerCase()) }, 'Restore')))),
  ]);
}

export function settingsPage() {
  const body = h('div', { class: 'stack' }, h('p', { class: 'muted' }, 'Loading…'));
  const draw = (status) => body.replaceChildren(folderBox(status, draw), downloadBox(), restoreBox(status));
  call('/api/backup').then(draw).catch((error) => body.replaceChildren(h('div', { class: 'box blankslate' }, h('h3', {}, 'Settings could not load'), h('p', {}, error.message))));
  return [
    h('div', { class: 'subhead' }, h('div', { class: 'subhead-text' }, h('h1', {}, 'Settings'), h('p', {}, 'Backups of your data, and how to get them back.'))),
    body,
  ];
}
