// The Add and Edit form, built from the section's description in schema.js.
import { COLLECTIONS, WEEKDAY_NAMES, displayTitle, photoUrl, sortItems, todayISO } from './schema.js';
import { confirmDialog, h, showDialog, toast } from './ui.js';
import { icon } from './icons.js';
import { items, saveItem, updateItem, uploadPhoto } from './store.js';

function photoField(field, existing, markDirty) {
  // Each entry is { name } for a saved photo, or { file, url } for a new one.
  const entries = (existing || []).map((name) => ({ name }));
  const grid = h('div', { class: 'photo-grid' });

  const draw = () => {
    grid.replaceChildren(...entries.map((entry) => h('div', { class: 'photo-tile' },
      h('img', { src: entry.url || photoUrl(entry.name), alt: '' }),
      h('button', {
        type: 'button',
        class: 'btn btn-small',
        'aria-label': 'Remove this photo',
        onclick: () => {
          entries.splice(entries.indexOf(entry), 1);
          if (entry.url) URL.revokeObjectURL(entry.url);
          markDirty();
          draw();
        },
      }, 'Remove'))));
  };

  const inputId = `field-${field.key}`;
  const input = h('input', {
    id: inputId,
    type: 'file',
    accept: 'image/*',
    multiple: !field.single,
    'data-photos': field.key,
    onchange: () => {
      if (field.single && input.files.length) {
        entries.splice(0).forEach((entry) => { if (entry.url) URL.revokeObjectURL(entry.url); });
      }
      for (const file of input.files) entries.push({ file, url: URL.createObjectURL(file) });
      input.value = '';
      markDirty();
      draw();
    },
  });
  draw();

  return {
    element: h('div', { class: 'field' }, h('label', { for: inputId }, field.label), input, grid),
    // Keeps finished uploads, so retrying after an error will not copy them twice.
    upload: async () => {
      for (const entry of entries) {
        if (!entry.name) entry.name = await uploadPhoto(entry.file);
      }
      return entries.map((entry) => entry.name);
    },
    release: () => entries.forEach((entry) => { if (entry.url) URL.revokeObjectURL(entry.url); }),
  };
}

// A small table of exercises: name, sets, reps and weight. Its value is a list.
function exercisesControl(field, value, id, onInput) {
  const known = [...new Set(items('workouts').flatMap((workout) => (workout.exercises || []).map((ex) => ex.name)).filter(Boolean))].sort();
  const listId = `${id}-names`;
  const rows = h('div', { class: 'exercise-rows' });
  const number = (name, label, val, step) => h('input', {
    type: 'number', min: 0, step, inputMode: 'decimal', 'data-part': name, 'aria-label': label, value: val ?? '',
  });
  const addRow = (exercise = {}) => {
    const row = h('div', { class: 'exercise-row' },
      h('input', { type: 'text', 'data-part': 'name', list: listId, 'aria-label': 'Exercise', placeholder: 'Exercise, for example Bench press', value: exercise.name || '', maxLength: 80 }),
      number('sets', 'Sets', exercise.sets, 1),
      number('reps', 'Reps', exercise.reps, 1),
      number('kg', 'kg', exercise.kg, 'any'),
      h('button', {
        class: 'btn-icon btn-invisible',
        type: 'button',
        'aria-label': 'Remove this exercise',
        onclick: () => { row.remove(); onInput(); },
      }, icon('close')));
    rows.append(row);
    return row;
  };
  (value && value.length ? value : [{}]).forEach(addRow);
  const group = h('div', { id, class: 'exercises', role: 'group', 'aria-labelledby': `${id}-label`, oninput: onInput },
    h('div', { class: 'exercise-row exercise-head', 'aria-hidden': 'true' }, h('span', {}, 'Exercise'), h('span', {}, 'Sets'), h('span', {}, 'Reps'), h('span', {}, 'kg'), h('span', {})),
    rows,
    h('datalist', { id: listId }, known.map((name) => h('option', { value: name }))),
    h('button', {
      class: 'btn btn-small',
      type: 'button',
      onclick: () => { addRow().querySelector('input').focus(); onInput(); },
    }, icon('plus'), 'Add exercise'));
  Object.defineProperty(group, 'value', {
    get: () => [...rows.children].map((row) => {
      const part = (name) => row.querySelector(`[data-part="${name}"]`).value;
      const num = (name) => (part(name) === '' ? '' : Number(part(name)));
      return { name: part('name').trim(), sets: num('sets'), reps: num('reps'), kg: num('kg') };
    }).filter((exercise) => exercise.name),
  });
  return group;
}

// Seven day toggles. Its value is a list of day numbers, 0 for Sunday.
function weekdayControl(field, value, id, onInput) {
  const chosen = new Set((value || []).map(Number));
  const boxes = WEEKDAY_NAMES.map((name, day) => h('label', { class: 'day-toggle' },
    h('input', { type: 'checkbox', value: String(day), checked: chosen.has(day) }),
    h('span', {}, name)));
  const group = h('div', { id, class: 'day-toggles', role: 'group', 'aria-labelledby': `${id}-label`, oninput: onInput }, boxes);
  Object.defineProperty(group, 'value', {
    get: () => boxes.map((box) => box.querySelector('input')).filter((input) => input.checked).map((input) => Number(input.value)),
  });
  return group;
}

function controlFor(field, value, id, onInput, currentId) {
  const common = { id, name: field.key, required: field.required, oninput: onInput };
  switch (field.type) {
    case 'weekdays':
      return weekdayControl(field, value, id, onInput);
    case 'exercises':
      return exercisesControl(field, value, id, onInput);
    case 'number':
      return h('input', { ...common, type: 'number', min: 0, step: 'any', inputMode: 'decimal', value: value ?? '' });
    case 'textarea':
      return h('textarea', { ...common, value: value || '', style: field.tall ? 'min-height: 14rem' : undefined });
    case 'select':
      return h('select', common, field.options.map((option) => h('option', { value: option, selected: option === value }, option)));
    case 'ref': {
      const choices = sortItems(field.refTo, items(field.refTo))
        .filter((item) => item.id !== currentId && (!field.refFilter || field.refFilter(item)));
      return h('select', common,
        h('option', { value: '' }, 'None'),
        choices.map((item) => h('option', { value: item.id, selected: item.id === value }, displayTitle(field.refTo, item))));
    }
    case 'range':
      return h('input', { ...common, type: 'range', min: 0, max: 100, step: 5, value: value || 0 });
    default:
      return h('input', { ...common, type: field.type, value: value || '', maxLength: field.type === 'text' ? 200 : undefined });
  }
}

export function openForm(key, existing, defaults = {}) {
  const collection = COLLECTIONS[key];
  const isNew = !existing;
  const item = existing || { id: crypto.randomUUID(), createdAt: new Date().toISOString(), ...defaults };
  let dirty = false;
  let forceClose = false;
  const markDirty = () => { dirty = true; };

  const errorBox = h('p', { class: 'form-error', role: 'alert' });
  const form = h('form', { class: 'form' });
  const controls = {};
  const photoFields = {};
  const fieldBoxes = {};

  const values = () => {
    const result = {};
    for (const [fieldKey, control] of Object.entries(controls)) {
      result[fieldKey] = control.type === 'checkbox' ? control.checked : control.value;
    }
    return result;
  };

  const refresh = () => {
    const current = values();
    for (const field of collection.fields) {
      if (field.showIf) fieldBoxes[field.key].hidden = !field.showIf(current, item);
      if (field.notBefore) {
        const start = current[field.notBefore];
        const end = current[field.key];
        controls[field.key].setCustomValidity(start && end && end < start ? 'This date cannot be before the start date.' : '');
      }
    }
  };

  const onInput = () => {
    markDirty();
    refresh();
  };

  const body = [];
  let halfRow = null;
  for (const field of collection.fields) {
    const id = `field-${field.key}`;
    let box;
    if (field.type === 'photos') {
      const photos = photoField(field, item[field.key], markDirty);
      photoFields[field.key] = photos;
      box = photos.element;
    } else if (field.type === 'checkbox') {
      const control = h('input', { id, type: 'checkbox', name: field.key, checked: Boolean(item[field.key]), oninput: onInput });
      controls[field.key] = control;
      box = h('div', { class: 'field field-check' }, h('label', { for: id }, control, field.label));
    } else {
      let value = item[field.key];
      if (!value && isNew && field.defaultToday) value = todayISO();
      if (!value && field.type === 'select') value = field.options[0];
      const control = controlFor(field, value, id, onInput, item.id);
      controls[field.key] = control;
      let inner = control;
      if (field.type === 'range') {
        const output = h('output', { for: id }, `${control.value}%`);
        control.addEventListener('input', () => { output.textContent = `${control.value}%`; });
        inner = h('div', { class: 'range-row' }, control, output);
      }
      box = h('div', { class: 'field' },
        h('label', { for: id, id: `${id}-label` }, field.label, field.required && h('span', { class: 'required-mark', 'aria-hidden': 'true' }, ' *')),
        inner,
        field.hint && h('span', { class: 'hint' }, field.hint));
    }
    fieldBoxes[field.key] = box;

    if (field.half) {
      if (!halfRow) {
        halfRow = h('div', { class: 'field-row' });
        body.push(halfRow);
      }
      halfRow.append(box);
    } else {
      halfRow = null;
      body.push(box);
    }
  }

  const heading = isNew && !collection.single ? `New ${collection.singular}` : `Edit ${collection.singular}`;
  const titleId = `form-title-${key}`;
  const saveButton = h('button', { class: 'btn btn-primary', type: 'submit', 'data-save': true }, 'Save');
  const cancelButton = h('button', { class: 'btn', type: 'button', onclick: () => requestClose() }, 'Cancel');
  form.append(
    h('div', { class: 'dialog-header' },
      h('h2', { id: titleId }, heading[0].toUpperCase() + heading.slice(1)),
      h('button', { class: 'btn-icon btn-invisible', type: 'button', 'aria-label': 'Close', onclick: () => requestClose() }, icon('close'))),
    h('div', { class: 'dialog-body' }, ...body, errorBox),
    h('div', { class: 'dialog-footer' }, cancelButton, saveButton));

  const dialog = h('dialog', {
    class: 'form-dialog',
    'data-form': key,
    'aria-labelledby': titleId,
    oncancel: (event) => {
      if (forceClose) return;
      event.preventDefault();
      requestClose();
    },
    onclose: () => Object.values(photoFields).forEach((photos) => photos.release()),
  }, form);

  async function requestClose() {
    if (dirty) {
      const discard = await confirmDialog({
        title: 'Discard your changes?',
        message: 'What you entered in this form will not be saved.',
        confirmLabel: 'Discard',
        danger: true,
      });
      if (!discard) return;
    }
    forceClose = true;
    dialog.close();
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    errorBox.textContent = '';
    saveButton.disabled = true;
    cancelButton.disabled = true;
    saveButton.textContent = 'Saving…';
    try {
      const next = { ...item };
      const current = values();
      for (const field of collection.fields) {
        if (field.type === 'photos') {
          next[field.key] = await photoFields[field.key].upload();
          continue;
        }
        let value = current[field.key];
        if (field.showIf && !field.showIf(current, item)) value = field.type === 'checkbox' ? false : ['weekdays', 'exercises'].includes(field.type) ? [] : '';
        if (typeof value === 'string' && field.type !== 'textarea') value = value.trim();
        if (field.type === 'range') value = Number(value);
        if (field.type === 'number') value = value === '' ? '' : Number(value);
        next[field.key] = value;
      }
      if (collection.normalize) collection.normalize(next, isNew ? null : existing);
      if (isNew) {
        await saveItem(key, next);
      } else {
        // Save only what this form changed, on top of the newest copy. A habit check-in your
        // phone made while this form was open is kept.
        const changed = {};
        for (const [field, value] of Object.entries(next)) {
          if (JSON.stringify(value) !== JSON.stringify(existing[field])) changed[field] = value;
        }
        await updateItem(key, next.id, (latest) => Object.assign(latest, changed));
      }
      forceClose = true;
      dialog.close();
      toast('Saved');
      if (isNew && !collection.single && !collection.stayAfterAdd) window.location.hash = `#/${key}/${next.id}`;
      // For example, a new workout ticks your Gym habit. A problem here never undoes the save.
      if (collection.afterSave) {
        try {
          const message = await collection.afterSave(next, isNew ? null : existing);
          if (message) toast(message);
        } catch (error) {
          toast(`Saved, but your habit was not updated: ${error.message}`, true);
        }
      }
    } catch (error) {
      errorBox.textContent = `Not saved: ${error.message}`;
      saveButton.disabled = false;
      cancelButton.disabled = false;
      saveButton.textContent = 'Save';
    }
  });

  refresh();
  showDialog(dialog);
}
