// Coding sessions with a timer: pick a length or Pomodoro, watch the minutes fill a commit grid,
// and save the session (and its minutes on your Coding habit) when you are done.
import { todayISO } from './schema.js';
import { h, toast } from './ui.js';
import { saveItem } from './store.js';
import { feedHabit } from './habits.js';
import { icon } from './icons.js';

const STORE_KEY = 'habit_tracker-session';
const LENGTHS = [25, 45, 60, 90];
const POMODORO = { focus: 50, break: 10 };
// Finished minutes get a scattered shade, like a real contribution graph, rather than one flat block.
// It is worked out from the minute's number, so a minute keeps its shade every second.
function shade(index) {
  let x = index + 1;
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  x ^= x >>> 16;
  const pick = (x >>> 0) % 100;
  return pick < 25 ? 2 : pick < 65 ? 3 : 4;
}
const MINUTE = 60 * 1000;

/* ---------- The session, kept in this browser so a refresh does not lose it ---------- */

let session = read();
let overlay = null;
let view = 'setup';
let ticker = null;
let audio = null;
let scheduled = null;
let bookedEnd = 0; // When the booked chime will sound, so a phase end knows whether it still needs one.
const pageTitle = document.title;
const indicators = new Set();

function read() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
    return saved && saved.v === 1 ? saved : null;
  } catch {
    return null;
  }
}

function write() {
  try {
    if (session) localStorage.setItem(STORE_KEY, JSON.stringify(session));
    else localStorage.removeItem(STORE_KEY);
  } catch { /* The session still runs; it just will not survive a refresh. */ }
}

const phaseMinutes = () => (session.mode === 'pomodoro' ? POMODORO[session.phase] : session.length);
const phaseElapsed = (now = Date.now()) => Math.max(0, (session.pausedAt || now) - session.startedAt - session.pausedMs);
const focusedMs = (now = Date.now()) => session.focusedMs
  + (session.phase === 'focus' ? Math.min(phaseElapsed(now), phaseMinutes() * MINUTE) : 0);

function clock(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = String(total % 60).padStart(2, '0');
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${seconds}` : `${minutes}:${seconds}`;
}

/* ---------- Sound: a soft two-note chime, made in the browser ---------- */

function audioContext() {
  try {
    if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') audio.resume();
    return audio;
  } catch {
    return null;
  }
}

// Plays the chime `delay` seconds from now. The audio clock keeps time even when the tab is in the background.
function chimeAt(delay) {
  const ctx = audioContext();
  if (!ctx) return [];
  const nodes = [];
  [[659.25, 0], [987.77, 0.22]].forEach(([frequency, offset]) => {
    const start = ctx.currentTime + Math.max(0, delay) + offset;
    const tone = ctx.createOscillator();
    const gain = ctx.createGain();
    tone.type = 'sine';
    tone.frequency.value = frequency;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(0.18, start + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.001, start + 1.4);
    tone.connect(gain).connect(ctx.destination);
    tone.start(start);
    tone.stop(start + 1.5);
    nodes.push(tone);
  });
  return nodes;
}

function cancelChime() {
  (scheduled || []).forEach((node) => { try { node.stop(); } catch { /* Already played. */ } });
  scheduled = null;
  bookedEnd = 0;
}

// At the end of a phase: the booked chime is already playing, so leave it. If none was booked
// (for example the page was refreshed and the browser blocked sound until a click), play one now.
function chimeForEnd(phaseEnd) {
  if (Math.abs(bookedEnd - phaseEnd) > 2000) chimeAt(0);
  scheduled = null;
  bookedEnd = 0;
}

// Books the chime for the end of the current phase. Done again after a pause, a resume or a new phase.
function bookChime() {
  cancelChime();
  if (!session || session.pausedAt) return;
  const left = phaseMinutes() * MINUTE - phaseElapsed();
  scheduled = chimeAt(left / 1000);
  if (scheduled.length) bookedEnd = Date.now() + left;
}

/* ---------- Moving the session along ---------- */

function start(topic, mode, length) {
  audioContext(); // Must start from your click, so the browser allows the sound later.
  session = {
    v: 1, topic: topic.trim(), mode, length, day: todayISO(),
    startedAt: Date.now(), pausedAt: null, pausedMs: 0, phase: 'focus', cycle: 1, focusedMs: 0, state: 'running',
  };
  write();
  bookChime();
  view = 'running';
  draw();
  run();
  window.dispatchEvent(new Event('life:rerender'));
}

function pause() {
  session.pausedAt = Date.now();
  session.state = 'paused';
  write();
  cancelChime();
  draw();
}

function resume() {
  audioContext();
  session.pausedMs += Date.now() - session.pausedAt;
  session.pausedAt = null;
  session.state = 'running';
  write();
  bookChime();
  draw();
}

function finish({ early }) {
  const now = Date.now();
  session.reviewMinutes = Math.round(focusedMs(now) / MINUTE);
  session.state = 'review';
  session.pausedAt = session.pausedAt || now;
  write();
  if (early) cancelChime();
  view = 'review';
  open();
}

// Called every second. Ends the timer, or moves Pomodoro between focus and break.
function step() {
  if (!session || session.state !== 'running') return;
  let changed = false;
  while (phaseElapsed() >= phaseMinutes() * MINUTE) {
    const length = phaseMinutes() * MINUTE;
    chimeForEnd(session.startedAt + session.pausedMs + length);
    if (session.mode !== 'pomodoro') {
      finish({ early: false });
      return;
    }
    if (session.phase === 'focus') {
      session.focusedMs += length;
      session.phase = 'break';
    } else {
      session.phase = 'focus';
      session.cycle += 1;
    }
    session.startedAt += length + session.pausedMs;
    session.pausedMs = 0;
    changed = true;
  }
  if (changed) {
    write();
    bookChime();
    toast(session.phase === 'break' ? 'Time for a 10-minute break.' : `Break over. Focus round ${session.cycle}.`);
  }
}

function run() {
  clearInterval(ticker);
  ticker = setInterval(() => { step(); draw(); }, 1000);
}

function stop() {
  clearInterval(ticker);
  ticker = null;
  cancelChime();
  session = null;
  write();
  document.title = pageTitle;
  close();
  drawIndicators();
  window.dispatchEvent(new Event('life:rerender'));
}

async function saveSession(minutes, topic, note) {
  const day = session.day || todayISO();
  try {
    await saveItem('sessions', {
      id: crypto.randomUUID(), createdAt: new Date().toISOString(), date: day, minutes, topic: topic.trim(), notes: note.trim(),
    });
    const habit = await feedHabit('coding', day, minutes);
    toast(`Saved ${minutes} minutes of coding.${habit ? ` Added to ${habit.title}.` : ''}`);
    stop();
  } catch (error) {
    toast(`Not saved: ${error.message}`, true);
  }
}

/* ---------- The screen ---------- */

function gridFor(minutes, elapsedMs, kind) {
  const done = Math.floor(elapsedMs / MINUTE);
  const part = (elapsedMs % MINUTE) / MINUTE;
  return h('div', { class: `focus-grid${kind === 'break' ? ' is-break' : ''}`, role: 'img', 'aria-label': `${done} of ${minutes} minutes done` },
    Array.from({ length: minutes }, (_, index) => {
      if (index < done) return h('span', { class: 'focus-cell', 'data-level': shade(index) });
      if (index === done && kind !== 'review') return h('span', { class: 'focus-cell is-now', style: `--fill: ${part.toFixed(3)}` });
      return h('span', { class: 'focus-cell' });
    }));
}

function setupView() {
  let mode = 'timer';
  let length = 60;
  const topic = h('input', { id: 'focus-topic', type: 'text', maxLength: 200, placeholder: 'For example Spring Boot REST APIs', class: 'focus-input' });
  const choices = h('div', { class: 'chips focus-chips', role: 'group', 'aria-label': 'Session length' });
  const drawChoices = () => choices.replaceChildren(
    ...LENGTHS.map((minutes) => h('button', {
      class: `chip${mode === 'timer' && length === minutes ? ' is-on' : ''}`, type: 'button', 'aria-pressed': String(mode === 'timer' && length === minutes),
      onclick: () => { mode = 'timer'; length = minutes; drawChoices(); },
    }, minutes === 60 ? '1 hour' : minutes === 90 ? '1.5 hours' : `${minutes} min`)),
    h('button', {
      class: `chip${mode === 'pomodoro' ? ' is-on' : ''}`, type: 'button', 'aria-pressed': String(mode === 'pomodoro'),
      onclick: () => { mode = 'pomodoro'; drawChoices(); },
    }, 'Pomodoro 50 + 10'));
  drawChoices();
  setTimeout(() => topic.focus(), 50);
  return h('form', { class: 'focus-panel is-form', onsubmit: (event) => { event.preventDefault(); start(topic.value, mode, length); } },
    h('p', { class: 'focus-eyebrow' }, 'New coding session'),
    h('label', { class: 'focus-label', for: 'focus-topic' }, 'What will you work on?'),
    topic,
    h('p', { class: 'focus-label' }, 'How long?'),
    choices,
    h('p', { class: 'focus-hint' }, 'Pomodoro repeats 50 minutes of focus and a 10-minute break until you finish.'),
    h('div', { class: 'focus-actions' },
      h('button', { class: 'btn', type: 'button', onclick: close }, 'Cancel'),
      h('button', { class: 'btn btn-primary btn-large', type: 'submit' }, 'Start session')));
}

function runningView() {
  const now = Date.now();
  const minutes = phaseMinutes();
  const elapsed = Math.min(phaseElapsed(now), minutes * MINUTE);
  const left = minutes * MINUTE - elapsed;
  const onBreak = session.phase === 'break';
  const paused = session.state === 'paused';
  const focused = Math.floor(focusedMs(now) / MINUTE);
  const status = onBreak ? 'Break' : session.mode === 'pomodoro' ? `Focus round ${session.cycle}` : 'Focus';
  return h('div', { class: `focus-panel focus-running${paused ? ' is-paused' : ''}` },
    h('p', { class: 'focus-eyebrow' }, status, paused && ' · paused'),
    h('h2', { class: 'focus-topic' }, session.topic || 'Coding'),
    h('p', { class: 'focus-clock', 'aria-live': 'off' }, clock(left)),
    h('p', { class: 'focus-sub' }, onBreak ? 'until the next focus round' : 'remaining'),
    gridFor(minutes, elapsed, session.phase),
    h('p', { class: 'focus-progress' },
      onBreak ? `${Math.floor(elapsed / MINUTE)} of ${minutes} break minutes` : `${Math.floor(elapsed / MINUTE)} of ${minutes} minutes`,
      session.mode === 'pomodoro' && ` · ${focused} minutes focused so far`),
    h('div', { class: 'focus-actions' },
      h('button', { class: 'btn btn-large', type: 'button', 'data-focus-pause': true, onclick: paused ? resume : pause }, paused ? 'Resume' : 'Pause'),
      h('button', { class: 'btn btn-large', type: 'button', onclick: () => finish({ early: true }) }, 'Finish')),
    h('button', { class: 'focus-minimize', type: 'button', onclick: close }, 'Back to the site, the timer keeps running'));
}

function reviewView() {
  const minutes = h('input', { id: 'focus-minutes', type: 'number', min: 1, step: 1, value: Math.max(1, session.reviewMinutes || 0), class: 'focus-input focus-input-short' });
  const topic = h('input', { id: 'focus-review-topic', type: 'text', maxLength: 200, value: session.topic, class: 'focus-input' });
  const note = h('textarea', { id: 'focus-note', rows: 3, maxLength: 4000, class: 'focus-input', placeholder: 'For example: finished the login endpoint and its tests' });
  setTimeout(() => note.focus(), 50);
  const short = (session.reviewMinutes || 0) < 1;
  return h('form', {
    class: 'focus-panel is-form',
    onsubmit: (event) => {
      event.preventDefault();
      const value = Math.round(Number(minutes.value));
      if (!(value > 0)) { minutes.focus(); return; }
      saveSession(value, topic.value, note.value);
    },
  },
    h('p', { class: 'focus-eyebrow' }, short ? 'Session ended' : 'Session complete'),
    h('h2', { class: 'focus-topic' }, 'How did it go?'),
    !short && gridFor(session.mode === 'pomodoro' ? Math.max(1, session.reviewMinutes) : session.length, (session.reviewMinutes || 0) * MINUTE, 'review'),
    h('div', { class: 'focus-fields' },
      h('label', { class: 'focus-label', for: 'focus-minutes' }, 'Minutes coded'), minutes,
      h('label', { class: 'focus-label', for: 'focus-review-topic' }, 'What you worked on'), topic,
      h('label', { class: 'focus-label', for: 'focus-note' }, 'What did you get done?'), note),
    h('div', { class: 'focus-actions' },
      h('button', { class: 'btn btn-danger', type: 'button', onclick: stop }, 'Discard'),
      h('button', { class: 'btn btn-primary btn-large', type: 'submit' }, 'Save session')));
}

function draw() {
  if (session && session.state !== 'review') {
    const left = phaseMinutes() * MINUTE - Math.min(phaseElapsed(), phaseMinutes() * MINUTE);
    document.title = `${clock(left)} · ${session.phase === 'break' ? 'Break' : session.topic || 'Coding'}`;
  } else if (session) {
    document.title = 'Session complete';
  }
  drawIndicators();
  if (!overlay || view !== 'running' || !session) return;
  const panel = overlay.querySelector('.focus-panel');
  const keepFocus = document.activeElement && document.activeElement.hasAttribute('data-focus-pause');
  const next = runningView();
  if (panel) panel.replaceWith(next); else overlay.querySelector('.focus-stage').append(next);
  if (keepFocus) next.querySelector('[data-focus-pause]').focus();
}

function open() {
  // Nothing running (for example it was ended in another tab): start from the setup screen.
  if (!session && view !== 'setup') view = 'setup';
  if (!overlay) {
    overlay = h('div', { class: 'focus-overlay', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Coding session' },
      h('div', { class: 'focus-stage' }));
    overlay.addEventListener('keydown', (event) => { if (event.key === 'Escape' && view !== 'review') close(); });
    document.body.append(overlay);
    document.body.classList.add('has-focus-overlay');
  }
  const stage = overlay.querySelector('.focus-stage');
  stage.replaceChildren(view === 'setup' ? setupView() : view === 'review' ? reviewView() : runningView());
  drawIndicators();
}

function close() {
  if (!overlay) return;
  overlay.remove();
  overlay = null;
  document.body.classList.remove('has-focus-overlay');
  drawIndicators();
}

/* ---------- Entry points ---------- */

// "Start session", or "Open session" when one is already running.
export function sessionButton() {
  return h('button', {
    class: 'btn btn-primary btn-small',
    type: 'button',
    onclick: () => {
      view = !session ? 'setup' : session.state === 'review' ? 'review' : 'running';
      open();
    },
  }, icon(session ? 'calendar' : 'plus'), session ? (session.state === 'review' ? 'Finish your session' : 'Open session') : 'Start session');
}

// A small running timer in the top bar while you are elsewhere in the site.
function drawIndicators() {
  for (const element of indicators) {
    // Not on the page yet (it is placed in the top bar right after it is made): draw it anyway.
    const show = Boolean(session) && !overlay;
    element.hidden = !show;
    if (!show) continue;
    const text = session.state === 'review'
      ? 'Session done'
      : clock(phaseMinutes() * MINUTE - Math.min(phaseElapsed(), phaseMinutes() * MINUTE));
    element.replaceChildren(h('span', { class: `focus-dot${session.state === 'paused' ? ' is-paused' : session.phase === 'break' ? ' is-break' : ''}` }), text);
    element.setAttribute('aria-label', `Coding session: ${text}. Open it`);
  }
}

export function sessionIndicator() {
  const element = h('button', {
    class: 'focus-pill',
    type: 'button',
    hidden: true,
    onclick: () => { view = session && session.state === 'review' ? 'review' : 'running'; open(); },
  });
  indicators.add(element);
  drawIndicators();
  return element;
}

// When the page loads: picks up a session that was running before a refresh.
export function resumeSession() {
  // Browsers keep sound off after a refresh until you click somewhere on the page.
  document.addEventListener('pointerdown', () => { if (session) audioContext(); }, { once: true });
  // Another tab of this browser started or ended a session.
  window.addEventListener('storage', (event) => {
    if (event.key !== STORE_KEY) return;
    session = read();
    if (!session) { clearInterval(ticker); ticker = null; document.title = pageTitle; close(); }
    else run();
    drawIndicators();
  });
  if (!session) return;
  if (session.state === 'running') {
    step();
    if (session && session.state === 'running') { bookChime(); run(); }
  }
  if (session && session.state === 'review') { view = 'review'; open(); }
  if (session && session.state === 'paused') run();
}
