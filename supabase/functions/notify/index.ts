// habit_tracker: sends your reminders as phone notifications.
// Supabase Cron calls this every 5 minutes. It looks at your data and settings, sends what is due,
// and remembers what it sent so nothing arrives twice. It uses only the standard Web Crypto API.
//
// Deploy: Edge Functions -> Deploy a new function -> Via Editor, name it "notify", paste this file.
// Turn "Verify JWT" OFF for this function: it checks the caller itself (the cron secret, or your login).
// Secrets it needs (Edge Functions -> Secrets): VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, CRON_SECRET.

/* ---------- Small helpers ---------- */

const enc = new TextEncoder();
const b64url = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64url = (text) => {
  const base = text.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((text.length + 3) % 4);
  return Uint8Array.from(atob(base), (c) => c.charCodeAt(0));
};
const concat = (...parts) => {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) { out.set(part, offset); offset += part.length; }
  return out;
};
async function hmac(key, data) {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, data));
}

/* ---------- Web Push (RFC 8291 encryption, RFC 8292 VAPID) ---------- */

// vapid: { publicKey: base64url of the 65-byte point, privateKey: base64url of the 32-byte scalar, subject }
async function vapidHeader(endpoint, vapid) {
  const pub = fromB64url(vapid.publicKey);
  const jwk = { kty: 'EC', crv: 'P-256', d: vapid.privateKey, x: b64url(pub.slice(1, 33)), y: b64url(pub.slice(33, 65)), ext: true };
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const header = b64url(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64url(enc.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: vapid.subject })));
  const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(`${header}.${claims}`));
  return `vapid t=${header}.${claims}.${b64url(signature)}, k=${vapid.publicKey}`;
}

async function encrypt(payload, p256dh, authSecret) {
  const userPublic = fromB64url(p256dh);
  const auth = fromB64url(authSecret);
  const ours = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const ourPublic = new Uint8Array(await crypto.subtle.exportKey('raw', ours.publicKey));
  const theirKey = await crypto.subtle.importKey('raw', userPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: theirKey }, ours.privateKey, 256));
  const salt = crypto.getRandomValues(new Uint8Array(16));

  const prkKey = await hmac(auth, shared);
  const ikm = (await hmac(prkKey, concat(enc.encode('WebPush: info\0'), userPublic, ourPublic, new Uint8Array([1])))).slice(0, 32);
  const prk = await hmac(salt, ikm);
  const cek = (await hmac(prk, concat(enc.encode('Content-Encoding: aes128gcm\0'), new Uint8Array([1])))).slice(0, 16);
  const nonce = (await hmac(prk, concat(enc.encode('Content-Encoding: nonce\0'), new Uint8Array([1])))).slice(0, 12);

  const aes = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const plain = concat(enc.encode(payload), new Uint8Array([2]));
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aes, plain));
  const header = concat(salt, new Uint8Array([0, 0, 16, 0]), new Uint8Array([ourPublic.length]), ourPublic);
  return concat(header, cipher);
}

// Returns the push service's status: 201 means delivered to the service; 404 or 410 means the device is gone.
export async function sendPush(subscription, message, vapid) {
  const body = await encrypt(JSON.stringify(message), subscription.p256dh, subscription.auth);
  const response = await fetch(subscription.endpoint, {
    method: 'POST',
    headers: {
      Authorization: await vapidHeader(subscription.endpoint, vapid),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: '3600',
      Urgency: 'high',
    },
    body,
  });
  return response.status;
}

/* ---------- Prayer times (same as public/js/prayer.js) ---------- */

const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;
const fixAngle = (a) => a - 360 * Math.floor(a / 360);
const fixHour = (h) => h - 24 * Math.floor(h / 24);

function sunAt(jd) {
  const d = jd - 2451545.0;
  const g = fixAngle(357.529 + 0.98560028 * d);
  const q = fixAngle(280.459 + 0.98564736 * d);
  const l = fixAngle(q + 1.915 * Math.sin(rad(g)) + 0.020 * Math.sin(rad(2 * g)));
  const e = 23.439 - 0.00000036 * d;
  const ra = deg(Math.atan2(Math.cos(rad(e)) * Math.sin(rad(l)), Math.cos(rad(l)))) / 15;
  return { declination: deg(Math.asin(Math.sin(rad(e)) * Math.sin(rad(l)))), equation: q / 15 - fixHour(ra) };
}

function julian(year, month, day) {
  if (month <= 2) { year -= 1; month += 12; }
  const a = Math.floor(year / 100);
  return Math.floor(365.25 * (year + 4716)) + Math.floor(30.6001 * (month + 1)) + day + (2 - a + Math.floor(a / 4)) - 1524.5;
}

function zoneOffsetMinutes(timeZone, year, month, day) {
  const noonUtc = Date.UTC(year, month - 1, day, 12);
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).formatToParts(new Date(noonUtc)).map((part) => [part.type, part.value]));
  return Math.round((Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute) - noonUtc) / 60000);
}

export function prayerTimes(day, place, adjust = {}) {
  const [year, month, date] = day.split('-').map(Number);
  const zone = zoneOffsetMinutes(place.timeZone, year, month, date) / 60;
  const jd = julian(year, month, date) - place.lng / (15 * 24);
  const noonAt = (f) => fixHour(12 - sunAt(jd + f).equation);
  const angleTime = (angle, f, before) => {
    const { declination } = sunAt(jd + f);
    const cos = (-Math.sin(rad(angle)) - Math.sin(rad(declination)) * Math.sin(rad(place.lat))) / (Math.cos(rad(declination)) * Math.cos(rad(place.lat)));
    const t = deg(Math.acos(Math.max(-1, Math.min(1, cos)))) / 15;
    return noonAt(f) + (before ? -t : t);
  };
  const asrTime = (f) => {
    const { declination } = sunAt(jd + f);
    return angleTime(-deg(Math.atan(1 / (1 + Math.tan(rad(Math.abs(place.lat - declination)))))), f, false);
  };
  let times = { fajr: 5, sunrise: 6, dhuhr: 12, asr: 13, maghrib: 18, isha: 18 };
  for (let round = 0; round < 2; round++) {
    const f = Object.fromEntries(Object.entries(times).map(([k, h]) => [k, h / 24]));
    times = {
      fajr: angleTime(19.5, f.fajr, true), sunrise: angleTime(0.833, f.sunrise, true), dhuhr: noonAt(f.dhuhr),
      asr: asrTime(f.asr), maghrib: angleTime(0.833, f.maghrib, false), isha: angleTime(17.5, f.isha, false),
    };
  }
  const result = {};
  for (const [name, hour] of Object.entries(times)) result[name] = Math.round(fixHour(hour + zone - place.lng / 15) * 60) + (Number(adjust[name]) || 0);
  return result;
}

/* ---------- Your data: what is due ---------- */

export const DEFAULT_PREFS = {
  morning: { on: true, time: '08:00' },
  milestones: { on: true },
  events: { on: true, lead: 15 },
  habits: { on: true, time: '21:00' },
  review: { on: true, day: 4, time: '20:00' },
  prayers: { on: true, before: true, at: true, lead: 10, adjust: {} },
  place: { name: 'Cairo', lat: 30.0444, lng: 31.2357, timeZone: 'Africa/Cairo' },
};

export function mergePrefs(prefs) {
  const out = structuredClone(DEFAULT_PREFS);
  for (const [key, value] of Object.entries(prefs || {})) {
    out[key] = value && typeof value === 'object' && !Array.isArray(value) ? { ...out[key], ...value } : value;
  }
  return out;
}

const PRAYER_NAMES = { fajr: 'Fajr', dhuhr: 'Dhuhr', asr: 'Asr', maghrib: 'Maghrib', isha: 'Isha' };
const toMinutes = (hhmm) => { const [h, m] = String(hhmm || '').split(':').map(Number); return (h || 0) * 60 + (m || 0); };
const clock = (minutes) => `${String(Math.floor(minutes / 60) % 24).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
const dayPlus = (day, n) => { const d = new Date(`${day}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const weekdayOf = (day) => new Date(`${day}T12:00:00Z`).getUTCDay();

export function localNow(timeZone, now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).formatToParts(now).map((part) => [part.type, part.value]));
  return { day: `${parts.year}-${parts.month}-${parts.day}`, minutes: Number(parts.hour) * 60 + Number(parts.minute) };
}

// The same rules as the app (public/js/tasks.js and habits.js), kept short.
function occursOn(task, day) {
  if (!task.date) return false;
  const repeat = task.repeat || 'Does not repeat';
  if (repeat === 'Does not repeat') return task.date === day;
  if (day < task.date) return false;
  if (repeat === 'Every day') return true;
  if (repeat === 'Every week') return weekdayOf(day) === weekdayOf(task.date);
  if (repeat === 'Every month') {
    const date = new Date(`${day}T12:00:00Z`);
    const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
    return date.getUTCDate() === Math.min(Number(task.date.slice(8, 10)), last);
  }
  if (repeat === 'On certain days') return (task.days || []).map(Number).includes(weekdayOf(day));
  return false;
}
const isRepeating = (task) => Boolean(task.repeat) && task.repeat !== 'Does not repeat';
const isDoneOn = (task, day) => (isRepeating(task) ? (task.doneDates || []).includes(day) : Boolean(task.done));

function habitTarget(habit) {
  if (habit.type === 'Number') return Number(habit.target) > 0 ? Number(habit.target) : 1;
  if (habit.type === 'Checklist') return Math.max(String(habit.items || '').split('\n').filter((line) => line.trim()).length, 1);
  return 1;
}
function habitAmount(habit, day) {
  const value = (habit.log || {})[day];
  if (habit.type === 'Checklist') return Array.isArray(value) ? value.length : 0;
  return Number(value) || 0;
}
const habitPlanned = (habit, day) => !(habit.days || []).length || habit.days.map(Number).includes(weekdayOf(day));
const fmt = (n) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10));

// Every notification due in this run: [{ key, at (minutes), title, body, url }].
export function dueNow(items, prefsRaw, now = new Date()) {
  const prefs = mergePrefs(prefsRaw);
  const { day, minutes } = localNow(prefs.place.timeZone, now);
  const all = [];
  const tasks = items.tasks || [];

  if (prefs.morning.on) {
    const todays = tasks.filter((task) => task.kind !== 'Event' && occursOn(task, day));
    const left = todays.filter((task) => !isDoneOn(task, day)).length;
    const overdue = tasks.filter((task) => task.kind !== 'Event' && !isRepeating(task) && task.date && task.date < day && !task.done).length;
    const events = tasks.filter((task) => task.kind === 'Event' && occursOn(task, day)).length;
    const parts = [`${left} ${left === 1 ? 'task' : 'tasks'} today`];
    if (overdue) parts.push(`${overdue} overdue`);
    if (events) parts.push(`${events} ${events === 1 ? 'event' : 'events'}`);
    all.push({ key: `morning:${day}`, at: toMinutes(prefs.morning.time), title: 'Good morning', body: parts.join(', '), url: '#/' });
  }

  if (prefs.milestones.on) {
    const lines = [];
    for (const goal of (items.goals || []).filter((goal) => !goal.archived)) {
      for (const m of goal.milestones || []) {
        if (m.done || !m.due) continue;
        if (m.due === dayPlus(day, 1)) lines.push(`Due tomorrow: ${m.title} (${goal.title})`);
        else if (m.due === day) lines.push(`Due today: ${m.title} (${goal.title})`);
        else if (m.due < day) lines.push(`Late: ${m.title} (${goal.title})`);
      }
    }
    if (lines.length) all.push({ key: `milestones:${day}`, at: toMinutes(prefs.morning.time), title: 'Milestones', body: lines.slice(0, 4).join('\n') + (lines.length > 4 ? `\n+${lines.length - 4} more` : ''), url: '#/goals' });
  }

  if (prefs.events.on) {
    for (const task of tasks) {
      if (task.kind !== 'Event' || !task.time || !occursOn(task, day)) continue;
      const lead = Number(prefs.events.lead) || 0;
      all.push({ key: `event:${task.id}:${day}`, at: toMinutes(task.time) - lead, title: task.title || 'Event', body: lead ? `In ${lead} minutes, at ${task.time}` : `Now, at ${task.time}`, url: `#/tasks/${task.id}` });
    }
  }

  if (prefs.habits.on) {
    const left = (items.habits || []).filter((habit) => !habit.archived && habitPlanned(habit, day) && habitAmount(habit, day) < habitTarget(habit));
    if (left.length) {
      const body = left.map((habit) => (habit.type === 'Yes or no' || !habit.type ? habit.title : `${habit.title} ${fmt(habitAmount(habit, day))}/${fmt(habitTarget(habit))}`)).join(', ');
      all.push({ key: `habits:${day}`, at: toMinutes(prefs.habits.time), title: 'Habits not done yet', body, url: '#/habits' });
    }
  }

  if (prefs.review.on && weekdayOf(day) === Number(prefs.review.day)) {
    const weekStart = dayPlus(day, -((weekdayOf(day) + 1) % 7)); // Weeks start on Saturday.
    const done = (items.reviews || []).some((review) => review.week === weekStart);
    if (!done) all.push({ key: `review:${weekStart}`, at: toMinutes(prefs.review.time), title: 'Weekly review', body: 'Take five minutes to look back at your week.', url: '#/journal' });
  }

  if (prefs.prayers.on) {
    const times = prayerTimes(day, prefs.place, prefs.prayers.adjust || {});
    const lead = Number(prefs.prayers.lead) || 10;
    for (const name of Object.keys(PRAYER_NAMES)) {
      if (prefs.prayers.before) all.push({ key: `prayer-before:${name}:${day}`, at: times[name] - lead, title: `${PRAYER_NAMES[name]} in ${lead} minutes`, body: `At ${clock(times[name])}`, url: '#/', prayer: true });
      if (prefs.prayers.at) all.push({ key: `prayer:${name}:${day}`, at: times[name], title: `It's time for ${PRAYER_NAMES[name]}`, body: clock(times[name]), url: '#/', prayer: true });
    }
  }

  // Due now: its time has come, and it is at most 10 minutes late (the job runs every 5 minutes).
  return all.filter((entry) => minutes >= entry.at && minutes < entry.at + 10);
}

/* ---------- Talking to your Supabase project ---------- */

function db() {
  const base = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const headers = { apikey: key, 'Content-Type': 'application/json' };
  if (key.startsWith('eyJ')) headers.Authorization = `Bearer ${key}`;
  const call = async (path, options = {}) => {
    const response = await fetch(`${base}/rest/v1/${path}`, { ...options, headers: { ...headers, ...(options.headers || {}) } });
    if (!response.ok) throw new Error(`${path.split('?')[0]}: ${response.status} ${await response.text()}`);
    return response.status === 204 ? null : response.json();
  };
  return call;
}

function vapidKeys() {
  return {
    publicKey: Deno.env.get('VAPID_PUBLIC_KEY') ?? '',
    privateKey: Deno.env.get('VAPID_PRIVATE_KEY') ?? '',
    subject: Deno.env.get('VAPID_SUBJECT') ?? 'https://github.com/ahmedshendyyyz-dev/habit_tracker',
  };
}

async function sendToUser(call, userId, message) {
  const devices = await call(`push_subscriptions?user_id=eq.${userId}&select=id,endpoint,p256dh,auth`);
  let delivered = 0;
  for (const device of devices) {
    const status = await sendPush(device, message, vapidKeys()).catch(() => 0);
    if (status === 404 || status === 410) await call(`push_subscriptions?id=eq.${device.id}`, { method: 'DELETE' });
    if (status >= 200 && status < 300) delivered++;
  }
  return { devices: devices.length, delivered };
}

async function runSchedule() {
  const call = db();
  const users = await call('notify_settings?enabled=is.true&select=user_id,prefs');
  const report = [];
  for (const { user_id: userId, prefs } of users) {
    const rows = await call(`life_data?user_id=eq.${userId}&select=data`);
    const items = (rows[0] && rows[0].data && rows[0].data.items) || {};
    for (const entry of dueNow(items, prefs)) {
      // Claim it first; if it was already claimed by an earlier run, skip it.
      const claimed = await call('notify_sent', {
        method: 'POST',
        headers: { Prefer: 'resolution=ignore-duplicates,return=representation' },
        body: JSON.stringify({ user_id: userId, key: entry.key }),
      });
      if (!claimed || !claimed.length) continue;
      const result = await sendToUser(call, userId, { title: entry.title, body: entry.body, url: entry.url, tag: entry.key });
      report.push({ key: entry.key, ...result });
    }
  }
  // Forget what was sent more than a week ago.
  await call(`notify_sent?sent_at=lt.${new Date(Date.now() - 7 * 86400000).toISOString()}`, { method: 'DELETE' });
  return report;
}

async function signedInUser(request) {
  const auth = request.headers.get('Authorization') ?? '';
  const apikey = request.headers.get('apikey') ?? '';
  if (!auth.startsWith('Bearer ') || !apikey) return null;
  const response = await fetch(`${Deno.env.get('SUPABASE_URL')}/auth/v1/user`, { headers: { Authorization: auth, apikey } });
  if (!response.ok) return null;
  const user = await response.json();
  return user && user.id ? user : null;
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const reply = (status, body) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

if (typeof Deno !== 'undefined') {
  Deno.serve(async (request) => {
    if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS });
    if (request.method !== 'POST') return reply(405, { error: 'Use POST.' });
    try {
      // The schedule: called by Supabase Cron with the shared secret.
      const secret = Deno.env.get('CRON_SECRET');
      if (secret && request.headers.get('x-cron-secret') === secret) return reply(200, { sent: await runSchedule() });
      // "Send a test notification" from Settings: only for the signed-in user, only to their own devices.
      const user = await signedInUser(request);
      if (!user) return reply(401, { error: 'Not allowed.' });
      const result = await sendToUser(db(), user.id, { title: 'Notifications are on', body: 'This is how your reminders will look.', url: '#/settings', tag: 'test' });
      return reply(200, result);
    } catch (error) {
      console.error(error);
      return reply(500, { error: 'Something went wrong while sending.' });
    }
  });
}
