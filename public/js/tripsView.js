// Trips: where each trip stands, and its packing list.
import { displayTitle, todayISO } from './schema.js';
import { h, toast } from './ui.js';
import { items, updateItem } from './store.js';
import { icon } from './icons.js';
import { boxSection, counter } from './components.js';

// Trips saved before statuses existed count as done once they are over.
export function tripStatus(trip) {
  if (trip.status) return trip.status;
  const last = trip.endDate || trip.startDate;
  return last && last < todayISO() ? 'Done' : 'Planned';
}

const packingOf = (trip) => (Array.isArray(trip.packing) ? trip.packing : []);

const change = (trip, fn) => updateItem('trips', trip.id, (latest) => {
  latest.packing = packingOf(latest).map((entry) => ({ ...entry }));
  fn(latest);
}).catch((error) => toast(`Not saved: ${error.message}`, true));

export function packingBox(trip) {
  const list = packingOf(trip);
  const packed = list.filter((entry) => entry.packed).length;
  const others = items('trips').filter((other) => other.id !== trip.id && packingOf(other).length);
  const input = h('input', {
    type: 'text', class: 'quick-add-input', maxLength: 120, 'data-focus': `pack-${trip.id}`,
    placeholder: 'Add something to pack, then press Enter', 'aria-label': 'Add something to pack',
  });
  const copySelect = others.length > 0 && h('select', {
    class: 'inline-input',
    'aria-label': 'Copy the packing list from another trip',
    onchange: (event) => {
      const from = others.find((other) => other.id === event.target.value);
      if (!from) return;
      change(trip, (latest) => {
        const have = new Set(latest.packing.map((entry) => entry.text.toLowerCase()));
        for (const entry of packingOf(from)) {
          if (!have.has(entry.text.toLowerCase())) latest.packing.push({ id: crypto.randomUUID(), text: entry.text, packed: false });
        }
      }).then(() => toast(`Copied from ${displayTitle('trips', from)}`));
    },
  }, h('option', { value: '' }, 'Copy from another trip…'), others.map((other) => h('option', { value: other.id }, displayTitle('trips', other))));

  return boxSection(['Packing list ', counter(`${packed}/${list.length}`)], [
    list.length > 0 && h('ul', { class: 'list' }, list.map((entry) => h('li', { class: `list-row${entry.packed ? ' is-done' : ''}` },
      h('input', {
        type: 'checkbox', class: 'row-check', checked: Boolean(entry.packed), 'data-focus': `packed-${entry.id}`,
        'aria-label': `Packed ${entry.text}`,
        onchange: (event) => change(trip, (latest) => {
          const item = latest.packing.find((other) => other.id === entry.id);
          if (item) item.packed = event.target.checked;
        }),
      }),
      h('div', { class: 'row-main' }, h('span', { class: 'pack-text' }, entry.text)),
      h('button', {
        class: 'btn-icon btn-invisible', type: 'button', 'aria-label': `Remove ${entry.text}`,
        onclick: () => change(trip, (latest) => { latest.packing = latest.packing.filter((other) => other.id !== entry.id); }),
      }, icon('close'))))),
    h('form', {
      class: `quick-add${list.length ? ' box-footer' : ''}`,
      onsubmit: (event) => {
        event.preventDefault();
        const text = input.value.trim();
        if (!text) return;
        input.readOnly = true;
        change(trip, (latest) => { latest.packing.push({ id: crypto.randomUUID(), text, packed: false }); });
      },
    }, icon('plus', 'icon muted'), input),
  ], [
    list.some((entry) => entry.packed) && h('button', {
      class: 'btn btn-small', type: 'button',
      onclick: () => change(trip, (latest) => { latest.packing.forEach((entry) => { entry.packed = false; }); }),
    }, 'Unpack all'),
    copySelect,
  ]);
}
