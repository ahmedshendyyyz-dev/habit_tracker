// The two Supabase functions' logic: reminders (notify) and the calendar feed (calendar).
// Node runs the .ts files directly; neither file needs Deno for these parts.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { dueNow, prayerTimes } = await import('../supabase/functions/notify/index.ts');
const { buildCalendar } = await import('../supabase/functions/calendar/index.ts');
const appPrayer = await import('../public/js/prayer.js');

const CAIRO = { name: 'Cairo', lat: 30.0444, lng: 31.2357, timeZone: 'Africa/Cairo' };
// 06:00 UTC is 08:00 in Cairo in November.
const at = (iso) => new Date(iso);

test('prayer times for Cairo stay the same as when they were checked against Aladhan', () => {
  assert.deepEqual(prayerTimes('2026-11-18', CAIRO), { fajr: 292, sunrise: 383, dhuhr: 700, asr: 877, maghrib: 1018, isha: 1098 });
});

test('the app and the notify function work out the same prayer times', () => {
  for (const day of ['2026-01-15', '2026-04-30', '2026-07-10', '2026-11-18']) {
    assert.deepEqual(appPrayer.prayerTimes(day, CAIRO), prayerTimes(day, CAIRO), day);
  }
});

test('the morning summary is due at 08:00 and counts today\'s tasks', () => {
  const items = { tasks: [{ id: 'a', title: 'A', date: '2026-11-18' }, { id: 'b', title: 'B', date: '2026-11-18', done: true }] };
  const due = dueNow(items, { prayers: { on: false } }, at('2026-11-18T06:02:00Z'));
  const morning = due.find((entry) => entry.key === 'morning:2026-11-18');
  assert.ok(morning);
  assert.equal(morning.body, '1 task today');
  assert.equal(dueNow(items, { prayers: { on: false } }, at('2026-11-18T06:15:00Z')).length, 0, 'not again 15 minutes later');
});

test('archived habits are left out of the habit reminder', () => {
  const items = { habits: [{ id: 'h1', title: 'Gym', log: {} }, { id: 'h2', title: 'Old', log: {}, archived: true }] };
  const [nudge] = dueNow(items, { morning: { on: false }, prayers: { on: false } }, at('2026-11-18T19:01:00Z'));
  assert.equal(nudge.body, 'Gym');
});

test('calendar: timed event, all-day task, repeat rule and milestone', () => {
  const text = buildCalendar({
    tasks: [
      { id: 'e', title: 'Dentist, check-up; bring card', kind: 'Event', date: '2026-11-22', time: '23:30', repeat: 'Does not repeat' },
      { id: 'g', title: 'Gym', date: '2026-11-21', repeat: 'On certain days', days: [6, 1, 3] },
      { id: 'd', title: 'Call mom', date: '2026-11-20', done: true },
    ],
    goals: [
      { id: 'job', title: 'Job', milestones: [{ id: 'm', title: 'Apply', due: '2026-12-01' }] },
      { id: 'old', title: 'Old', archived: true, milestones: [{ id: 'x', title: 'Hidden', due: '2026-12-02' }] },
    ],
  }, 'https://example.test/');
  assert.match(text, /^BEGIN:VCALENDAR\r\n/);
  assert.match(text, /SUMMARY:Dentist\\, check-up\\; bring card/);
  assert.match(text, /DTSTART;TZID=Africa\/Cairo:20261122T233000/);
  assert.match(text, /DTEND;TZID=Africa\/Cairo:20261123T003000/, 'an event running past midnight ends the next day');
  assert.match(text, /RRULE:FREQ=WEEKLY;BYDAY=SA,MO,WE/);
  assert.match(text, /SUMMARY:✓ Call mom/);
  assert.match(text, /DTSTART;VALUE=DATE:20261201/);
  assert.doesNotMatch(text, /Hidden/, 'archived goals are left out');
  for (const line of text.split('\r\n')) assert.ok(new TextEncoder().encode(line).length <= 75, `line too long: ${line}`);
  assert.equal((text.match(/BEGIN:VEVENT/g) || []).length, 4);
});
