// habit_tracker: your tasks, events and goal milestones as a calendar feed (an .ics link).
// Google Calendar (or any calendar app) subscribes to the link and shows them. It is read-only:
// changes you make in Google Calendar do not come back to the app.
//
// Deploy: Edge Functions -> Deploy a new function -> Via Editor, name it "calendar", paste this file.
// Turn "Verify JWT" OFF: calendar apps cannot sign in, so the secret token in the link is the key.
// Run supabase/calendar.sql once first. The link is made in the app: Settings -> Google Calendar.

const TIME_ZONE = 'Africa/Cairo';
const WEEKDAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

/* ---------- Building the .ics text ---------- */

// Text values escape \ ; , and line breaks.
const escapeText = (text) => String(text || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

// Lines longer than 75 bytes continue on the next line after a space.
function fold(line) {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const parts = [];
  let current = '';
  let size = 0;
  for (const char of line) {
    const length = new TextEncoder().encode(char).length;
    if (size + length > (parts.length ? 74 : 75)) { parts.push(current); current = ''; size = 0; }
    current += char;
    size += length;
  }
  parts.push(current);
  return parts.join('\r\n ');
}

const compactDay = (day) => day.replace(/-/g, '');
const dayPlus = (day, n) => { const d = new Date(`${day}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const stamp = () => new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');

function localTime(day, hhmm, plusMinutes = 0) {
  const [h, m] = String(hhmm).split(':').map(Number);
  const total = (h || 0) * 60 + (m || 0) + plusMinutes;
  const nextDay = Math.floor(total / 1440);
  const minutes = ((total % 1440) + 1440) % 1440;
  const date = nextDay ? dayPlus(day, nextDay) : day;
  return `${compactDay(date)}T${String(Math.floor(minutes / 60)).padStart(2, '0')}${String(minutes % 60).padStart(2, '0')}00`;
}

function repeatRule(task) {
  switch (task.repeat) {
    case 'Every day': return 'FREQ=DAILY';
    case 'Every week': return 'FREQ=WEEKLY';
    case 'Every month': return 'FREQ=MONTHLY';
    case 'On certain days': {
      const days = (task.days || []).map(Number).filter((d) => d >= 0 && d <= 6);
      return days.length ? `FREQ=WEEKLY;BYDAY=${days.map((d) => WEEKDAYS[d]).join(',')}` : null;
    }
    default: return null;
  }
}

export function buildCalendar(items, appUrl) {
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//habit_tracker//calendar feed//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'X-WR-CALNAME:habit_tracker', `X-WR-TIMEZONE:${TIME_ZONE}`, 'REFRESH-INTERVAL;VALUE=DURATION:PT1H', 'X-PUBLISHED-TTL:PT1H',
  ];
  const now = stamp();
  const add = (fields) => {
    lines.push('BEGIN:VEVENT', ...fields.filter(Boolean), `DTSTAMP:${now}`, 'END:VEVENT');
  };

  for (const task of items.tasks || []) {
    if (!task.date || !/^\d{4}-\d{2}-\d{2}$/.test(task.date)) continue;
    const isEvent = task.kind === 'Event';
    const rule = repeatRule(task);
    const done = !rule && task.done;
    const title = `${done ? '✓ ' : ''}${task.title || (isEvent ? 'Event' : 'Task')}`;
    const timed = /^\d{1,2}:\d{2}$/.test(task.time || '');
    add([
      `UID:task-${task.id}@habit_tracker`,
      `SUMMARY:${escapeText(title)}`,
      timed ? `DTSTART;TZID=${TIME_ZONE}:${localTime(task.date, task.time)}` : `DTSTART;VALUE=DATE:${compactDay(task.date)}`,
      timed ? `DTEND;TZID=${TIME_ZONE}:${localTime(task.date, task.time, isEvent ? 60 : 30)}` : `DTEND;VALUE=DATE:${compactDay(dayPlus(task.date, 1))}`,
      rule && `RRULE:${rule}`,
      task.notes && `DESCRIPTION:${escapeText(task.notes)}`,
      appUrl && `URL:${appUrl}#/tasks/${task.id}`,
      `TRANSP:${isEvent ? 'OPAQUE' : 'TRANSPARENT'}`,
    ]);
  }

  for (const goal of items.goals || []) {
    if (goal.archived) continue;
    for (const milestone of goal.milestones || []) {
      if (!milestone.due || !/^\d{4}-\d{2}-\d{2}$/.test(milestone.due)) continue;
      add([
        `UID:milestone-${milestone.id}@habit_tracker`,
        `SUMMARY:${escapeText(`${milestone.done ? '✓ ' : ''}Milestone: ${milestone.title} (${goal.title})`)}`,
        `DTSTART;VALUE=DATE:${compactDay(milestone.due)}`,
        `DTEND;VALUE=DATE:${compactDay(dayPlus(milestone.due, 1))}`,
        appUrl && `URL:${appUrl}#/goals/${goal.id}`,
        'TRANSP:TRANSPARENT',
      ]);
    }
  }

  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}

/* ---------- Serving it ---------- */

async function rest(path) {
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const headers = { apikey: key };
  if (key.startsWith('eyJ')) headers.Authorization = `Bearer ${key}`;
  const response = await fetch(`${Deno.env.get('SUPABASE_URL')}/rest/v1/${path}`, { headers });
  if (!response.ok) throw new Error(`${path.split('?')[0]}: ${response.status}`);
  return response.json();
}

if (typeof Deno !== 'undefined') {
  Deno.serve(async (request) => {
    if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Use GET.', { status: 405 });
    const token = new URL(request.url).searchParams.get('token') || '';
    // Tokens are 43 URL-safe characters. Anything else is refused without a database call.
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return new Response('Not found.', { status: 404 });
    try {
      const feeds = await rest(`calendar_feeds?token=eq.${token}&select=user_id`);
      if (!feeds.length) return new Response('Not found.', { status: 404 });
      const rows = await rest(`life_data?user_id=eq.${feeds[0].user_id}&select=data`);
      const items = (rows[0] && rows[0].data && rows[0].data.items) || {};
      const body = buildCalendar(items, Deno.env.get('APP_URL') ?? 'https://ahmedshendyyyz-dev.github.io/habit_tracker/');
      return new Response(request.method === 'HEAD' ? null : body, {
        headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Cache-Control': 'private, max-age=300', 'Content-Disposition': 'inline; filename="habit_tracker.ics"' },
      });
    } catch (error) {
      console.error(error);
      return new Response('Something went wrong.', { status: 500 });
    }
  });
}
