// Settings → Notifications: turn reminders on for a device, choose which ones and when,
// see today's prayer times, and send a test.
import { h, toast } from './ui.js';
import { boxSection } from './components.js';
import { backend } from './backend.js';
import { VAPID_PUBLIC_KEY } from './config.js';
import { CAIRO, PRAYERS, PRAYER_NAMES, formatMinutes, prayerTimes } from './prayer.js';
import { todayISO } from './schema.js';

// The same defaults as the notify function (supabase/functions/notify/index.ts).
const DEFAULTS = {
  morning: { on: true, time: '08:00' },
  milestones: { on: true },
  events: { on: true, lead: 15 },
  habits: { on: true, time: '21:00' },
  review: { on: true, day: 4, time: '20:00' },
  prayers: { on: true, before: true, at: true, lead: 10, adjust: {} },
  place: CAIRO,
};
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function merge(prefs) {
  const out = structuredClone(DEFAULTS);
  for (const [key, value] of Object.entries(prefs || {})) {
    out[key] = value && typeof value === 'object' && !Array.isArray(value) ? { ...out[key], ...value } : value;
  }
  return out;
}

const supported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const keyBytes = (key) => Uint8Array.from(atob(key.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((key.length + 3) % 4)), (c) => c.charCodeAt(0));

function deviceName() {
  const ua = navigator.userAgent;
  const kind = /Android/i.test(ua) ? 'Android phone' : /iPhone|iPad/i.test(ua) ? 'iPhone' : /Windows/i.test(ua) ? 'Windows PC' : /Mac/i.test(ua) ? 'Mac' : 'Device';
  const browser = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'browser';
  return `${kind}, ${browser}`;
}

async function currentSubscription() {
  const registration = await navigator.serviceWorker.getRegistration();
  return registration ? registration.pushManager.getSubscription() : null;
}

/* ---------- This device ---------- */

function deviceBlock(state, redraw) {
  if (!supported()) {
    return h('p', { class: 'flash flash-attention' }, h('span', {}, 'This browser cannot receive notifications. On an iPhone, add the app to your Home Screen first, then open it from there.'));
  }
  if (Notification.permission === 'denied') {
    return h('p', { class: 'flash flash-attention' }, h('span', {}, 'Notifications are blocked for this app. Allow them in your browser or phone settings (Site settings → Notifications), then come back here.'));
  }
  const turnOn = async (button) => {
    button.disabled = true;
    try {
      if ((await Notification.requestPermission()) !== 'granted') { toast('Notifications were not allowed.', true); return; }
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC_KEY) });
      await backend.addDevice(subscription, deviceName());
      if (!state.saved) await backend.saveNotifySettings(true, state.prefs); // The first time: start with the defaults.
      toast('Notifications are on for this device.');
      redraw();
    } catch (error) {
      toast(`Could not turn on notifications: ${error.message}`, true);
    } finally {
      button.disabled = false;
    }
  };
  const turnOff = async (button) => {
    button.disabled = true;
    try {
      const subscription = await currentSubscription();
      if (subscription) {
        await backend.removeDevice(subscription.endpoint);
        await subscription.unsubscribe();
      }
      toast('Notifications are off for this device.');
      redraw();
    } catch (error) {
      toast(`Could not turn them off: ${error.message}`, true);
      button.disabled = false;
    }
  };
  return state.subscribed
    ? h('div', { class: 'inline-form' },
      h('p', { class: 'flash flash-accent inline-grow' }, h('span', {}, `On for this device (${deviceName()}). ${state.devices} ${state.devices === 1 ? 'device gets' : 'devices get'} your reminders.`)),
      h('button', {
        class: 'btn', type: 'button',
        onclick: async (event) => {
          const button = event.currentTarget;
          button.disabled = true;
          try {
            const result = await backend.sendTestNotification();
            toast(result.delivered ? 'Test sent. It should arrive in a few seconds.' : 'No device took the test. Try turning this device off and on again.', !result.delivered);
          } catch (error) {
            toast(error.message, true);
          } finally {
            button.disabled = false;
          }
        },
      }, 'Send a test'),
      h('button', { class: 'btn btn-danger', type: 'button', onclick: (event) => turnOff(event.currentTarget) }, 'Turn off here'))
    : h('div', { class: 'inline-form' },
      h('p', { class: 'inline-grow muted' }, 'Notifications are off on this device.'),
      h('button', { class: 'btn btn-primary', type: 'button', onclick: (event) => turnOn(event.currentTarget) }, 'Turn on for this device'));
}

/* ---------- Which reminders, and when ---------- */

function prefsForm(state) {
  const prefs = state.prefs;
  const id = (name) => `notify-${name}`;
  const check = (name, label, value) => h('label', { class: 'notify-check' }, h('input', { type: 'checkbox', id: id(name), checked: Boolean(value) }), h('span', {}, label));
  const time = (name, value) => h('input', { type: 'time', id: id(name), value, class: 'inline-input', 'aria-label': 'Time' });
  const number = (name, value, label) => h('input', { type: 'number', id: id(name), value, min: 0, max: 120, step: 1, class: 'inline-input notify-minutes', 'aria-label': label });
  const day = h('select', { id: id('review-day'), class: 'inline-input', 'aria-label': 'Day' },
    DAYS.map((name, index) => h('option', { value: index, selected: Number(prefs.review.day) === index }, name)));

  const today = todayISO();
  const times = prayerTimes(today, prefs.place, prefs.prayers.adjust || {});
  const prayerRows = PRAYERS.map((name) => h('div', { class: 'prayer-row' },
    h('span', { class: 'prayer-name' }, PRAYER_NAMES[name]),
    h('span', { class: 'prayer-time' }, formatMinutes(times[name])),
    h('label', { class: 'prayer-adjust' },
      h('span', { class: 'visually-hidden' }, `Adjust ${PRAYER_NAMES[name]} by minutes`),
      h('input', { type: 'number', id: id(`adjust-${name}`), value: Number((prefs.prayers.adjust || {})[name]) || 0, min: -30, max: 30, step: 1, class: 'inline-input notify-minutes' }),
      h('span', { class: 'muted small' }, 'min'))));

  const read = () => {
    const value = (name) => document.getElementById(id(name));
    const adjust = {};
    for (const name of PRAYERS) {
      const minutes = Math.round(Number(value(`adjust-${name}`).value) || 0);
      if (minutes) adjust[name] = Math.max(-30, Math.min(30, minutes));
    }
    return {
      morning: { on: value('morning').checked, time: value('morning-time').value || '08:00' },
      milestones: { on: value('milestones').checked },
      events: { on: value('events').checked, lead: Math.max(0, Math.min(120, Math.round(Number(value('events-lead').value) || 0))) },
      habits: { on: value('habits').checked, time: value('habits-time').value || '21:00' },
      review: { on: value('review').checked, day: Number(value('review-day').value), time: value('review-time').value || '20:00' },
      prayers: { on: value('prayers').checked, before: value('prayers-before').checked, at: value('prayers-at').checked, lead: Math.max(1, Math.min(60, Math.round(Number(value('prayers-lead').value) || 10))), adjust },
      place: prefs.place,
    };
  };

  return h('form', {
    class: 'stack-sm notify-form',
    onsubmit: async (event) => {
      event.preventDefault();
      try {
        state.prefs = read();
        await backend.saveNotifySettings(true, state.prefs);
        state.saved = true;
        toast('Reminder settings saved');
        state.redraw();
      } catch (error) {
        toast(error.message, true);
      }
    },
  },
    h('h3', { class: 'small-heading' }, 'Reminders'),
    h('div', { class: 'notify-line' }, check('morning', 'Morning summary of your day', prefs.morning.on), h('span', { class: 'muted small' }, 'at'), time('morning-time', prefs.morning.time)),
    h('div', { class: 'notify-line' }, check('milestones', 'Milestones due tomorrow, or late (with the morning summary)', prefs.milestones.on)),
    h('div', { class: 'notify-line' }, check('events', 'Events with a time', prefs.events.on), number('events-lead', prefs.events.lead, 'Minutes before'), h('span', { class: 'muted small' }, 'minutes before')),
    h('div', { class: 'notify-line' }, check('habits', 'Habits not done yet', prefs.habits.on), h('span', { class: 'muted small' }, 'at'), time('habits-time', prefs.habits.time)),
    h('div', { class: 'notify-line' }, check('review', 'Weekly review, if not written yet', prefs.review.on), h('span', { class: 'muted small' }, 'on'), day, h('span', { class: 'muted small' }, 'at'), time('review-time', prefs.review.time)),
    h('h3', { class: 'small-heading' }, `Prayers · ${prefs.place.name}`),
    h('div', { class: 'notify-line' }, check('prayers', 'Prayer reminders', prefs.prayers.on)),
    h('div', { class: 'notify-line notify-indent' },
      check('prayers-before', 'Remind me', prefs.prayers.before), number('prayers-lead', prefs.prayers.lead, 'Minutes before the prayer'), h('span', { class: 'muted small' }, 'minutes before'),
      check('prayers-at', 'and at the time', prefs.prayers.at)),
    h('p', { class: 'muted small' }, 'Times are worked out every day with the Egyptian General Authority of Survey method. If your mosque is a little different, move a prayer by a few minutes.'),
    h('div', { class: 'prayer-table' }, prayerRows),
    h('div', { class: 'btn-row' }, h('button', { class: 'btn btn-primary', type: 'submit' }, 'Save reminders')));
}

export function notifyBox() {
  const body = h('div', { class: 'box-body stack-sm' }, h('p', { class: 'muted' }, 'Loading…'));
  if (backend.name === 'local') {
    body.replaceChildren(h('p', { class: 'muted' }, 'Notifications work in the online version of the app, not in test mode.'));
    return boxSection('Notifications', body);
  }
  const state = { prefs: merge(null), saved: false, subscribed: false, devices: 0 };
  const draw = async () => {
    try {
      const [settings, subscription, devices] = await Promise.all([
        backend.getNotifySettings(),
        supported() ? currentSubscription() : null,
        backend.deviceCount(),
      ]);
      state.prefs = merge(settings && settings.prefs);
      state.saved = Boolean(settings);
      state.subscribed = Boolean(subscription);
      state.devices = devices;
      body.replaceChildren(
        h('p', {}, 'Get reminders on your phone or computer, even when the app is closed. Turn them on once on each device.'),
        deviceBlock(state, draw),
        prefsForm(state));
    } catch (error) {
      body.replaceChildren(h('p', { class: 'flash flash-attention' }, h('span', {}, `Notifications could not load: ${error.message}`)));
    }
  };
  state.redraw = draw;
  draw();
  return boxSection('Notifications', body);
}
