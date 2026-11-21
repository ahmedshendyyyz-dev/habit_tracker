// Settings: your account, downloading your data, restoring a backup, and importing from the PC version.
import { confirmDialog, h, toast } from './ui.js';
import { icon } from './icons.js';
import { boxSection, counter } from './components.js';
import { backend } from './backend.js';
import { allPhotoNames, snapshot, uploadPhoto } from './store.js';
import { notifyBox } from './notifyView.js';
import { calendarBox } from './calendarView.js';

const when = (iso) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}, ${date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
};

const backupName = (entry) => (entry.kind === 'before-restore' ? 'Before a restore' : `Start of ${when(entry.created_at).split(',').slice(0, 2).join(',')}`);

const reloadSoon = (message) => { toast(message); setTimeout(() => window.location.reload(), 700); };

async function restoreData(data, label) {
  const yes = await confirmDialog({
    title: `Restore ${label}?`,
    message: 'Your data will be replaced with this one. What you have now is saved first as "Before a restore", so you can switch back.',
    confirmLabel: 'Restore',
    danger: true,
  });
  if (!yes) return;
  try {
    await backend.restore(data);
    reloadSoon('Restored. Reloading…');
  } catch (error) {
    toast(`Not restored: ${error.message}`, true);
  }
}

/* ---------- Account ---------- */

function accountBox() {
  if (backend.name === 'local') {
    return boxSection('Account', h('div', { class: 'box-body' },
      h('p', { class: 'muted' }, 'Test mode: this page uses the data on this PC, not your Supabase data.')));
  }
  return boxSection('Account', h('div', { class: 'box-body inline-form' },
    h('p', { class: 'inline-grow' }, 'Signed in as ', h('strong', {}, backend.email())),
    h('button', {
      class: 'btn', type: 'button',
      onclick: async () => { await backend.signOut(); window.location.reload(); },
    }, 'Sign out')));
}

/* ---------- Download ---------- */

function downloadBox() {
  return boxSection('Download your data', h('div', { class: 'box-body stack-sm' },
    h('p', {}, 'Saves all your entries as one file you can keep anywhere, for example on a USB stick. Photos are not in the file; they stay in your private photo storage.'),
    h('div', { class: 'btn-row' }, h('button', {
      class: 'btn', type: 'button',
      onclick: () => {
        const blob = new Blob([JSON.stringify(snapshot(), null, 2)], { type: 'application/json' });
        const link = h('a', { href: URL.createObjectURL(blob), download: `habit_tracker-${new Date().toISOString().slice(0, 10)}.json` });
        document.body.append(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(link.href), 5000);
      },
    }, icon('download'), 'Download data file'))));
}

/* ---------- Restore ---------- */

function restoreBox(backups) {
  const fileInput = h('input', {
    id: 'restore-file', type: 'file', accept: '.json,application/json',
    onchange: async () => {
      const file = fileInput.files[0];
      fileInput.value = '';
      if (!file) return;
      try {
        const data = JSON.parse(await file.text());
        if (!data || typeof data.items !== 'object') throw new Error();
        await restoreData(data, `"${file.name}"`);
      } catch {
        toast('That file could not be read. Choose a habit_tracker data file.', true);
      }
    },
  });
  return boxSection(['Restore a backup ', counter(backups.length)], [
    h('div', { class: 'box-body stack-sm' },
      h('p', {}, 'A copy of your data is kept from the start of each day (for 90 days), and before every restore.'),
      h('div', { class: 'field' }, h('label', { for: 'restore-file' }, 'Restore from a downloaded file'), fileInput)),
    backups.length > 0 && h('ul', { class: 'list list-top' }, backups.map((entry) => h('li', { class: 'list-row' },
      icon('calendar', 'icon row-icon'),
      h('div', { class: 'row-main' },
        h('div', { class: 'row-title row-title-task' }, h('span', { class: 'milestone-title' }, backupName(entry))),
        h('p', { class: 'muted small' }, `Saved ${when(entry.created_at)}`)),
      h('button', {
        class: 'btn btn-small', type: 'button',
        onclick: async () => {
          try {
            if (backend.restoreBackup) {
              const yes = await confirmDialog({ title: `Restore ${backupName(entry).toLowerCase()}?`, message: 'What you have now is saved first, so you can switch back.', confirmLabel: 'Restore', danger: true });
              if (yes) { await backend.restoreBackup(entry.id); reloadSoon('Restored. Reloading…'); }
            } else {
              await restoreData(await backend.getBackup(entry.id), backupName(entry).toLowerCase());
            }
          } catch (error) {
            toast(`Not restored: ${error.message}`, true);
          }
        },
      }, 'Restore')))),
  ]);
}

/* ---------- Import from the PC version ---------- */

function importBox() {
  if (backend.name === 'local') return null;
  const status = h('p', { class: 'muted', 'aria-live': 'polite' });
  const dataInput = h('input', { id: 'import-data', type: 'file', accept: '.json,application/json' });
  const photosInput = h('input', { id: 'import-photos', type: 'file', accept: 'image/*', multiple: true, webkitdirectory: true });
  const run = h('button', {
    class: 'btn btn-primary', type: 'button',
    onclick: async () => {
      const file = dataInput.files[0];
      if (!file) { toast('Choose your life-data.json file first.', true); return; }
      let data;
      try {
        data = JSON.parse(await file.text());
        if (!data || typeof data.items !== 'object') throw new Error();
      } catch {
        toast('That is not a habit_tracker data file.', true);
        return;
      }
      const yes = await confirmDialog({
        title: 'Import your data from the PC version?',
        message: 'Your photos are uploaded, then your entries replace what is in the app now. What is there now is kept as a backup first.',
        confirmLabel: 'Import',
      });
      if (!yes) return;
      run.disabled = true;
      try {
        // Only the photos your entries use, and only ones not uploaded already, so it is safe to run again.
        const needed = new Set(allPhotoNames(data.items));
        const already = await backend.existingPhotos();
        const files = [...photosInput.files].filter((photo) => needed.has(photo.name) && !already.has(photo.name));
        let done = 0;
        for (const photo of files) {
          status.textContent = `Uploading photo ${done + 1} of ${files.length}…`;
          await uploadPhoto(photo, photo.name);
          done++;
        }
        const missing = [...needed].filter((name) => !already.has(name) && !files.some((photo) => photo.name === name));
        status.textContent = 'Saving your entries…';
        await backend.restore(data);
        reloadSoon(missing.length
          ? `Imported. ${missing.length} ${missing.length === 1 ? 'photo was' : 'photos were'} not in the folder you chose.`
          : `Imported your entries and ${done} ${done === 1 ? 'photo' : 'photos'}. Reloading…`);
      } catch (error) {
        status.textContent = '';
        run.disabled = false;
        toast(`Import stopped: ${error.message}. You can run it again; finished photos are skipped.`, true);
      }
    },
  }, 'Import');
  return boxSection('Import from the PC version', h('div', { class: 'box-body stack-sm' },
    h('p', {}, 'Moves everything from the old version on your PC into the app. You only need to do this once.'),
    h('div', { class: 'field' },
      h('label', { for: 'import-data' }, '1. Your data file'),
      h('span', { class: 'hint' }, 'In the old habit_tracker folder on your PC: data\\life-data.json'),
      dataInput),
    h('div', { class: 'field' },
      h('label', { for: 'import-photos' }, '2. Your photos folder'),
      h('span', { class: 'hint' }, 'In the same place: choose the data\\photos folder'),
      photosInput),
    h('div', { class: 'btn-row' }, run),
    status));
}

export function settingsPage() {
  const body = h('div', { class: 'stack' }, h('p', { class: 'muted' }, 'Loading…'));
  backend.listBackups()
    .then((backups) => body.replaceChildren(accountBox(), notifyBox(), calendarBox(), importBox() || '', downloadBox(), restoreBox(backups)))
    .catch((error) => body.replaceChildren(accountBox(), h('div', { class: 'box blankslate' }, h('h3', {}, 'Settings could not load'), h('p', {}, error.message))));
  return [
    h('div', { class: 'subhead' }, h('div', { class: 'subhead-text' }, h('h1', {}, 'Settings'), h('p', {}, 'Your account, your backups, and moving your data.'))),
    body,
  ];
}
