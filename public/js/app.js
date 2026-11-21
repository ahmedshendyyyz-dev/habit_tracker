import { COLLECTIONS, COLLECTION_KEYS, HUBS, todayISO } from './schema.js';
import './links.js';
import { h, showDialog } from './ui.js';
import { checkForChanges, items, load } from './store.js';
import { displayName, headerAvatar, renderRoute } from './views.js';
import { counter, viewState } from './components.js';
import { tasksLeftToday } from './tasksView.js';
import { openForm } from './form.js';
import { icon } from './icons.js';
import { resumeSession, sessionIndicator } from './focusSession.js';
import { backend } from './backend.js';

const app = document.getElementById('app');
const brand = document.getElementById('brand');
const nav = document.getElementById('nav');
const actions = document.getElementById('actions');
const searchForm = document.getElementById('search');
const searchInput = searchForm.querySelector('input');

// The tabs shown in the row. Everything else sits under "More".
const PRIMARY_TABS = ['tasks', 'habits', 'goals', 'health', 'learning', 'journal', 'bucket', 'trips'];
const MORE_TABS = [...COLLECTION_KEYS.filter((key) => !PRIMARY_TABS.includes(key) && !COLLECTIONS[key].parent), 'settings'];
const tabLabel = (key) => (key === 'settings' ? 'Settings' : HUBS[key] ? HUBS[key].label : COLLECTIONS[key].label);

// On phones, a bar at the bottom holds the pages you use every day. The rest open from More.
const BOTTOM_TABS = [['', 'Today', 'home'], ['tasks', 'Tasks', 'calendar'], ['habits', 'Habits', 'check'], ['goals', 'Goals', 'target']];
const SHEET_TABS = ['health', 'learning', 'journal', 'bucket', 'trips', ...MORE_TABS];
const SHEET_ICONS = { journal: 'book', goals: 'target', health: 'tool', learning: 'box', bucket: 'check', trips: 'pin', projects: 'box', wishlist: 'list', settings: 'gear' };
const bottomNav = document.getElementById('bottom-nav');

/* ---------- Light and dark mode ---------- */

const THEME_KEY = 'life-theme';
function currentTheme() {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}
const themeButton = h('button', { class: 'btn-icon', type: 'button', 'data-theme-toggle': true });
function drawThemeButton() {
  const dark = currentTheme() === 'dark';
  themeButton.replaceChildren(icon(dark ? 'sun' : 'moon'));
  themeButton.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
  themeButton.title = dark ? 'Light mode' : 'Dark mode';
}
themeButton.addEventListener('click', () => {
  const next = currentTheme() === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem(THEME_KEY, next); } catch { /* The choice just will not be remembered. */ }
  drawThemeButton();
});
drawThemeButton();

/* ---------- Drop-down menus ---------- */

function menu({ summaryClass, summary, label, entries, align = 'right' }) {
  const details = h('details', { class: 'menu' });
  details.append(
    h('summary', { class: summaryClass, 'aria-label': label, title: label }, summary),
    h('div', { class: `menu-list menu-${align}`, role: 'menu' }, entries.map((entry) => {
      const attrs = { class: 'menu-item', role: 'menuitem', onclick: () => { details.open = false; } };
      return entry.href
        ? h('a', { ...attrs, href: entry.href, 'aria-current': entry.current ? 'page' : undefined }, entry.icon && icon(entry.icon), entry.label)
        : h('button', { ...attrs, type: 'button', onclick: () => { details.open = false; entry.onClick(); } }, entry.icon && icon(entry.icon), entry.label);
    })));
  return details;
}

document.addEventListener('click', (event) => {
  document.querySelectorAll('details.menu[open]').forEach((details) => {
    if (!details.contains(event.target)) details.open = false;
  });
});
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  document.querySelectorAll('details.menu[open]').forEach((details) => {
    details.open = false;
    details.querySelector('summary').focus();
  });
});

const addMenu = menu({
  summaryClass: 'btn-icon btn-split',
  summary: [icon('plus'), icon('chevron', 'icon icon-chevron')],
  label: 'Add something new',
  entries: COLLECTION_KEYS.filter((key) => key !== 'reviews').map((key) => ({ label: `New ${COLLECTIONS[key].singular}`, onClick: () => openForm(key) })),
});
actions.append(sessionIndicator(), addMenu, themeButton);

/* ---------- Search ---------- */

searchForm.addEventListener('submit', (event) => {
  event.preventDefault();
  window.location.hash = `#/search/${encodeURIComponent(searchInput.value.trim())}`;
});
document.addEventListener('keydown', (event) => {
  // Press / anywhere to jump to search, like on GitHub.
  const typing = event.target.closest('input, textarea, select, [contenteditable]');
  if (event.key === '/' && !typing && !document.querySelector('dialog[open]')) {
    event.preventDefault();
    searchInput.focus();
  }
});

/* ---------- Header and tabs ---------- */

// Tasks show what is left today. Habits show no number. The rest show how many there are.
const TAB_COUNTS = { '': () => 0, tasks: tasksLeftToday, habits: () => 0, health: () => 0, learning: () => 0, journal: () => 0 };

function tab(key, label, active) {
  const count = TAB_COUNTS[key] ? TAB_COUNTS[key]() : items(key).length;
  return h('li', {}, h('a', {
    class: 'tab',
    href: `#/${key}`,
    'aria-current': active === key ? 'page' : undefined,
  }, label, count > 0 && counter(count)));
}

function drawHeader(active) {
  brand.replaceChildren(headerAvatar(), h('span', {}, displayName()));
  const moreActive = MORE_TABS.includes(active);
  nav.replaceChildren(
    tab('', 'Today', active),
    ...PRIMARY_TABS.map((key) => tab(key, tabLabel(key), active)),
    MORE_TABS.length > 0 && h('li', {}, menu({
      summaryClass: `tab${moreActive ? ' is-current' : ''}`,
      summary: ['More', icon('chevron', 'icon icon-chevron')],
      label: 'More sections',
      align: 'left',
      entries: MORE_TABS.map((key) => ({ label: tabLabel(key), href: `#/${key}`, current: active === key })),
    })),
  );
  drawBottomNav(active);
}

function openSheet(active) {
  const dialog = h('dialog', { class: 'sheet', 'aria-label': 'All sections', onclick: (event) => { if (event.target === dialog) dialog.close(); } },
    h('div', { class: 'sheet-inner' },
      h('div', { class: 'dialog-header' }, h('h2', {}, 'All sections'),
        h('button', { class: 'btn-icon btn-invisible', type: 'button', 'aria-label': 'Close', onclick: () => dialog.close() }, icon('close'))),
      h('nav', { class: 'sheet-list' }, SHEET_TABS.map((key) => h('a', {
        class: 'sheet-item',
        href: `#/${key}`,
        'aria-current': active === key ? 'page' : undefined,
        onclick: () => dialog.close(),
      }, icon(SHEET_ICONS[key] || 'circle'), tabLabel(key))))));
  showDialog(dialog);
}

function drawBottomNav(active) {
  const inSheet = SHEET_TABS.includes(active);
  bottomNav.replaceChildren(
    ...BOTTOM_TABS.map(([key, label, iconName]) => {
      const count = key === 'tasks' ? tasksLeftToday() : 0;
      return h('a', { class: 'bottom-item', href: `#/${key}`, 'aria-current': active === key ? 'page' : undefined },
        h('span', { class: 'bottom-icon' }, icon(iconName), count > 0 && h('span', { class: 'bottom-badge' }, String(count))),
        h('span', {}, label));
    }),
    h('button', { class: `bottom-item${inSheet ? ' is-current' : ''}`, type: 'button', onclick: () => openSheet(active) },
      h('span', { class: 'bottom-icon' }, icon('more')), h('span', {}, 'More')));
}

/* ---------- Page drawing ---------- */

function render({ fresh }) {
  const route = renderRoute(window.location.hash);
  const scroll = window.scrollY;
  // Keep the keyboard on the same button after a quick tap redraws the page.
  const focusKey = !fresh && document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.focus : '';
  drawHeader(route.active);
  if (route.active === 'search') searchInput.value = route.query;
  else if (fresh) searchInput.value = '';
  app.replaceChildren(...route.nodes.flat(Infinity).filter(Boolean));
  window.scrollTo(0, fresh ? 0 : scroll);
  if (focusKey) {
    const again = app.querySelector(`[data-focus="${CSS.escape(focusKey)}"]`);
    if (again && !again.disabled) again.focus({ preventScroll: true });
  }
}

/* ---------- Signing in ---------- */

function showSignIn(message) {
  document.body.classList.add('signed-out');
  const email = h('input', { id: 'signin-email', type: 'email', autocomplete: 'username', required: true, class: 'focus-input' });
  const password = h('input', { id: 'signin-password', type: 'password', autocomplete: 'current-password', required: true, class: 'focus-input' });
  const error = h('p', { class: 'form-error', role: 'alert' }, message || '');
  const button = h('button', { class: 'btn btn-primary btn-large', type: 'submit' }, 'Sign in');
  app.replaceChildren(h('form', {
    class: 'signin box',
    onsubmit: async (event) => {
      event.preventDefault();
      error.textContent = '';
      button.disabled = true;
      button.textContent = 'Signing in…';
      try {
        await backend.signIn(email.value.trim(), password.value);
        window.location.reload();
      } catch (problem) {
        error.textContent = problem.message;
        button.disabled = false;
        button.textContent = 'Sign in';
      }
    },
  },
    h('div', { class: 'signin-mark', 'aria-hidden': 'true' }, [3, 1, 4, 2, 4, 3, 0, 2, 4].map((level) => h('span', { class: 'grid-day', 'data-level': level }))),
    h('h1', {}, 'Sign in to habit_tracker'),
    h('p', { class: 'muted' }, 'Your data is private to your account.'),
    h('label', { class: 'focus-label', for: 'signin-email' }, 'Email'), email,
    h('label', { class: 'focus-label', for: 'signin-password' }, 'Password'), password,
    error,
    button));
  setTimeout(() => email.focus(), 50);
}

// Makes the app installable on your phone and PC, and lets it open even with a weak connection.
function registerAppInstall() {
  if (!('serviceWorker' in navigator) || backend.name === 'local') return;
  navigator.serviceWorker.register('sw.js').catch(() => { /* The app still works; it just will not be installable. */ });
}

async function start() {
  registerAppInstall();
  try {
    if (!(await backend.currentUser())) { showSignIn(); return; }
    await load();
  } catch (error) {
    if (error.status === 401) { showSignIn(error.message); return; }
    app.replaceChildren(h('div', { class: 'box blankslate' }, h('h3', {}, 'habit_tracker could not load'), h('p', {}, error.message),
      h('button', { class: 'btn', type: 'button', onclick: () => window.location.reload() }, 'Try again')));
    return;
  }
  document.body.classList.remove('signed-out');
  render({ fresh: true });
  resumeSession();
  window.addEventListener('hashchange', () => {
    render({ fresh: true });
    app.focus({ preventScroll: true });
  });
  // After a save or a small view change, redraw in place.
  window.addEventListener('life:changed', () => render({ fresh: false }));
  window.addEventListener('life:rerender', () => render({ fresh: false }));
  watchForChanges();
}

/* ---------- Other devices and midnight ---------- */

// True while you are typing in a box on the page. A redraw then would wipe what you typed.
function isTyping() {
  const element = document.activeElement;
  if (!element || !app.contains(element)) return false;
  if (element.matches('textarea')) return true;
  return element.matches('input:not([type="checkbox"]):not([type="radio"]):not([type="button"])') && element.value !== '';
}

let waiting = false;
function redrawSoon() {
  if (isTyping()) { waiting = true; return; }
  waiting = false;
  render({ fresh: false });
}

let shownDay = todayISO();
function checkDay() {
  if (todayISO() === shownDay) return;
  // A new day: "today" moves on, and the planner goes back to this week.
  shownDay = todayISO();
  viewState.weekOffset = 0;
  viewState.reflectWeek = 0;
  redrawSoon();
}

function sync() {
  checkDay();
  if (document.visibilityState === 'visible') checkForChanges().catch(() => { /* Tried again in 30 seconds. */ });
}

function watchForChanges() {
  // Changes saved on your phone or in another tab show up here within half a minute,
  // and straight away when you come back to this tab.
  window.addEventListener('life:remote', redrawSoon);
  app.addEventListener('focusout', () => { if (waiting) setTimeout(redrawSoon, 0); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') sync(); });
  window.addEventListener('focus', sync);
  setInterval(sync, 30 * 1000);
}

start();
