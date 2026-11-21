// Settings -> Google Calendar: a private link that shows your tasks, events and milestones in Google Calendar.
import { h, confirmDialog, toast } from './ui.js';
import { backend } from './backend.js';
import { boxSection } from './components.js';
import { icon } from './icons.js';

const STEPS = [
  'Copy the link below.',
  'On a computer, open Google Calendar. Next to "Other calendars" press +, then "From URL".',
  'Paste the link and press "Add calendar". It then shows on your phone too.',
];

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast('Link copied');
  } catch {
    toast('Could not copy. Select the link and copy it yourself.', true);
  }
}

export function calendarBox() {
  const body = h('div', { class: 'box-body stack-sm' }, h('p', { class: 'muted' }, 'Loading…'));
  if (backend.name === 'local' || !backend.getCalendarToken) {
    body.replaceChildren(h('p', { class: 'muted' }, 'The calendar link works in the online version of the app, not in test mode.'));
    return boxSection('Google Calendar', body);
  }
  const run = async (action, failMessage) => {
    try { await action(); } catch (error) { toast(`${failMessage}: ${error.message}`, true); }
    draw();
  };
  const draw = async () => {
    let token;
    try {
      token = await backend.getCalendarToken();
    } catch (error) {
      body.replaceChildren(h('p', { class: 'flash flash-attention' }, h('span', {}, `The calendar link could not load: ${error.message}`)));
      return;
    }
    const intro = h('p', {}, 'See your tasks, events and goal milestones in Google Calendar. It is one-way: change things here, not in Google Calendar. Google checks for changes every few hours.');
    if (!token) {
      body.replaceChildren(intro,
        h('div', { class: 'btn-row' }, h('button', {
          class: 'btn btn-primary',
          type: 'button',
          onclick: () => run(() => backend.makeCalendarToken(), 'Not made'),
        }, icon('calendar'), 'Make my calendar link')));
      return;
    }
    const url = backend.calendarUrl(token);
    const field = h('input', { type: 'text', class: 'inline-input calendar-link', value: url, readOnly: true, 'aria-label': 'Your private calendar link', onfocus: (event) => event.target.select() });
    body.replaceChildren(intro,
      h('ol', { class: 'steps' }, STEPS.map((step) => h('li', {}, step))),
      h('div', { class: 'calendar-link-row' }, field, h('button', { class: 'btn', type: 'button', onclick: () => copy(url) }, 'Copy')),
      h('p', { class: 'muted small' }, 'Keep this link private: anyone who has it can see your tasks. If it leaks, make a new one.'),
      h('div', { class: 'btn-row' },
        h('button', {
          class: 'btn btn-small',
          type: 'button',
          onclick: async () => {
            const yes = await confirmDialog({ title: 'Make a new link?', message: 'The old link stops working. Add the new one to Google Calendar again.', confirmLabel: 'Make a new link' });
            if (yes) run(() => backend.makeCalendarToken(), 'Not made');
          },
        }, 'Make a new link'),
        h('button', {
          class: 'btn btn-small btn-danger',
          type: 'button',
          onclick: async () => {
            const yes = await confirmDialog({ title: 'Turn the calendar link off?', message: 'Google Calendar stops getting updates. Remove the calendar there too.', confirmLabel: 'Turn off', danger: true });
            if (yes) run(() => backend.removeCalendarToken(), 'Not turned off');
          },
        }, 'Turn off')));
  };
  draw();
  return boxSection('Google Calendar', body);
}
