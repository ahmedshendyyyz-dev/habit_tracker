// Where your data is kept: Supabase (normally), or the local server (when testing with ?local).
// Both offer the same small set of actions, so the rest of the app does not care which one it uses.
import { LOCAL_MODE, SUPABASE_KEY, SUPABASE_URL } from './config.js';

const SIGNED_URL_SECONDS = 7 * 24 * 60 * 60;

function failure(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

/* ---------- Supabase ---------- */

let client = null;
let user = null;

async function supabase() {
  if (!client) {
    const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.1/+esm');
    client = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true } });
  }
  return client;
}

// Turns Supabase's errors into plain messages. A save that lost a race comes back as status 409.
function plain(error, fallback) {
  if (!error) return null;
  if (error.code === '40001' || /conflict/i.test(error.message || '')) return failure('Changed on another device.', 409);
  if (error.code === 'PGRST301' || /jwt|not signed in/i.test(error.message || '')) return failure('You were signed out. Reload the page and sign in again.', 401);
  if (/fetch|network/i.test(error.message || '')) return failure('No internet connection. Check it and try again.', 0);
  return failure(error.message || fallback, error.status || 500);
}

const cloud = {
  name: 'supabase',

  async currentUser() {
    const sb = await supabase();
    const { data } = await sb.auth.getSession();
    user = data.session ? data.session.user : null;
    return user;
  },

  async signIn(email, password) {
    const sb = await supabase();
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw failure(/invalid/i.test(error.message) ? 'That email or password is not right.' : error.message, 401);
    user = data.user;
    return user;
  },

  async signOut() {
    const sb = await supabase();
    await sb.auth.signOut();
    user = null;
  },

  email: () => (user ? user.email : ''),

  async fetchData() {
    const sb = await supabase();
    const { data, error } = await sb.from('life_data').select('rev, data').maybeSingle();
    if (error) throw plain(error, 'Your data could not be loaded.');
    if (!data) return { rev: 0, items: {} };
    return { rev: data.rev, items: (data.data && data.data.items) || {} };
  },

  async fetchRev() {
    const sb = await supabase();
    const { data, error } = await sb.from('life_data').select('rev').maybeSingle();
    if (error) throw plain(error, 'Could not check for changes.');
    return data ? data.rev : 0;
  },

  async saveData(rev, items) {
    const sb = await supabase();
    const { data, error } = await sb.rpc('save_life_data', { expected_rev: rev, new_data: { version: 1, items } });
    if (error) throw plain(error, 'Not saved. Please try again.');
    return data;
  },

  async restore(data) {
    const sb = await supabase();
    const { data: rev, error } = await sb.rpc('restore_life_data', { new_data: { version: 1, items: data.items } });
    if (error) throw plain(error, 'Not restored.');
    return rev;
  },

  async listBackups() {
    const sb = await supabase();
    const { data, error } = await sb.from('life_data_backups').select('id, kind, rev, created_at').order('created_at', { ascending: false }).limit(60);
    if (error) throw plain(error, 'Backups could not be loaded.');
    return data;
  },

  async getBackup(id) {
    const sb = await supabase();
    const { data, error } = await sb.from('life_data_backups').select('data').eq('id', id).single();
    if (error) throw plain(error, 'That backup could not be loaded.');
    return data.data;
  },

  // Photos live in a private folder named after your user id. The data only keeps the file name.
  async uploadPhoto(file, name) {
    const sb = await supabase();
    const ext = (/\.[A-Za-z0-9]+$/.exec(file.name || '') || ['.jpg'])[0].toLowerCase();
    const finalName = name || `${crypto.randomUUID()}${ext}`;
    const { error } = await sb.storage.from('photos').upload(`${user.id}/${finalName}`, file, {
      contentType: file.type || undefined,
      upsert: Boolean(name),
    });
    if (error && !/exists|duplicate/i.test(error.message || '')) throw plain(error, 'The photo could not be uploaded.');
    return finalName;
  },

  // Private photos are shown through links that work for a week. New ones are made on every load.
  async photoUrls(names) {
    if (!names.length) return {};
    const sb = await supabase();
    const result = {};
    for (let start = 0; start < names.length; start += 100) {
      const batch = names.slice(start, start + 100);
      const { data, error } = await sb.storage.from('photos').createSignedUrls(batch.map((name) => `${user.id}/${name}`), SIGNED_URL_SECONDS);
      if (error) continue;
      data.forEach((entry, index) => { if (entry.signedUrl) result[batch[index]] = entry.signedUrl; });
    }
    return result;
  },

  async existingPhotos() {
    const sb = await supabase();
    const names = new Set();
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await sb.storage.from('photos').list(user.id, { limit: 1000, offset });
      if (error || !data || !data.length) break;
      data.forEach((entry) => names.add(entry.name));
      if (data.length < 1000) break;
    }
    return names;
  },

  /* Notifications */

  async getNotifySettings() {
    const sb = await supabase();
    const { data, error } = await sb.from('notify_settings').select('enabled, prefs').maybeSingle();
    if (error) throw plain(error, 'Notification settings could not be loaded.');
    return data;
  },

  async saveNotifySettings(enabled, prefs) {
    const sb = await supabase();
    const { error } = await sb.from('notify_settings').upsert({ user_id: user.id, enabled, prefs, updated_at: new Date().toISOString() });
    if (error) throw plain(error, 'Notification settings were not saved.');
  },

  async addDevice(subscription, device) {
    const sb = await supabase();
    const json = subscription.toJSON();
    const { error } = await sb.from('push_subscriptions').upsert(
      { user_id: user.id, endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth, device },
      { onConflict: 'endpoint' },
    );
    if (error) throw plain(error, 'This device could not be added.');
  },

  async removeDevice(endpoint) {
    const sb = await supabase();
    const { error } = await sb.from('push_subscriptions').delete().eq('endpoint', endpoint);
    if (error) throw plain(error, 'This device could not be removed.');
  },

  async deviceCount() {
    const sb = await supabase();
    const { count, error } = await sb.from('push_subscriptions').select('id', { count: 'exact', head: true });
    if (error) throw plain(error, 'Devices could not be counted.');
    return count || 0;
  },

  async sendTestNotification() {
    const sb = await supabase();
    const { data, error } = await sb.functions.invoke('notify', { body: { test: true } });
    if (error) {
      let message = 'The test notification was not sent.';
      try { message = (await error.context.json()).error || message; } catch { /* Keep the general message. */ }
      throw failure(message, 400);
    }
    return data;
  },

  /* Calendar feed */

  async getCalendarToken() {
    const sb = await supabase();
    const { data, error } = await sb.from('calendar_feeds').select('token').maybeSingle();
    if (error) throw plain(error, 'The calendar link could not be loaded.');
    return data ? data.token : null;
  },

  // A new secret link. Any older link stops working.
  async makeCalendarToken() {
    const sb = await supabase();
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    const token = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const { error } = await sb.from('calendar_feeds').upsert({ user_id: user.id, token, created_at: new Date().toISOString() });
    if (error) throw plain(error, 'The calendar link was not made.');
    return token;
  },

  async removeCalendarToken() {
    const sb = await supabase();
    const { error } = await sb.from('calendar_feeds').delete().eq('user_id', user.id);
    if (error) throw plain(error, 'The calendar link was not turned off.');
  },

  calendarUrl(token) {
    return `${SUPABASE_URL}/functions/v1/calendar?token=${token}`;
  },

  async readPlaylist(url) {
    const sb = await supabase();
    const { data, error } = await sb.functions.invoke('playlist', { body: { url } });
    if (error) {
      let message = 'The playlist could not be read.';
      try { message = (await error.context.json()).error || message; } catch { /* Keep the general message. */ }
      throw failure(message, 400);
    }
    return data;
  },
};

/* ---------- The local server (testing with ?local) ---------- */

const HEADERS = { 'X-Habit-Tracker': '1' };

async function request(url, options) {
  let response;
  try {
    response = await fetch(url, options);
  } catch {
    throw failure('Could not reach habit_tracker. Make sure the "habit_tracker" window is still open.', 0);
  }
  const body = await response.json().catch(() => null);
  if (!response.ok) throw failure((body && body.error) || 'Something went wrong. Please try again.', response.status);
  return body;
}

const local = {
  name: 'local',
  currentUser: async () => ({ email: 'this PC' }),
  signIn: async () => ({}),
  signOut: async () => {},
  email: () => 'this PC (test mode)',
  async fetchData() {
    const data = await request('api/data');
    return { rev: data.rev, items: data.items || {} };
  },
  async fetchRev() {
    return (await request('api/rev')).rev;
  },
  async saveData(rev, items) {
    const result = await request('api/data', {
      method: 'PUT',
      headers: { ...HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ rev, items }),
    });
    return result.rev;
  },
  async restore(data) {
    return (await request('api/restore', { method: 'POST', headers: { ...HEADERS, 'Content-Type': 'application/json' }, body: JSON.stringify({ data }) })).rev;
  },
  async listBackups() {
    const status = await request('api/backup');
    return status.backups.map((entry) => ({ id: entry.name, kind: entry.name.startsWith('before-restore') ? 'before-restore' : 'daily', created_at: entry.modified }));
  },
  async uploadPhoto(file) {
    const ext = (/\.[A-Za-z0-9]+$/.exec(file.name || '') || [''])[0].toLowerCase();
    const result = await request(`api/photos?ext=${encodeURIComponent(ext)}`, {
      method: 'POST',
      headers: { ...HEADERS, 'Content-Type': 'application/octet-stream' },
      body: file,
    });
    return result.name;
  },
  async photoUrls(names) {
    return Object.fromEntries(names.map((name) => [name, `photos/${encodeURIComponent(name)}`]));
  },
  existingPhotos: async () => new Set(),
  notificationsOnline: false,
  async readPlaylist(url) {
    return request('api/playlist', { method: 'POST', headers: { ...HEADERS, 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) });
  },
};

// Restoring a local backup by name goes straight to the local server.
local.restoreBackup = (name) => request('api/restore', { method: 'POST', headers: { ...HEADERS, 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });

export const backend = LOCAL_MODE ? local : cloud;
