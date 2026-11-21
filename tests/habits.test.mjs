// Habits: one-tap complete, clearing, reorder, archive, streaks and links from other sections.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadApp, today } from './fake-app.mjs';

const habit = (id, fields) => ({ id, createdAt: `2026-01-0${id.length}T10:00:00.000Z`, title: id, type: 'Yes or no', days: [], log: {}, ...fields });

const { server, store } = await loadApp({
  habits: [
    habit('Gym', {}),
    habit('Sleep', { type: 'Number', target: 7, unit: 'hours' }),
    habit('Prayers', { type: 'Checklist', items: 'Fajr\nDhuhr\nAsr\nMaghrib\nIsha' }),
    habit('Coding', { type: 'Number', target: 60, unit: 'minutes' }),
  ],
  workouts: [],
  sessions: [],
});
const habits = await import('../public/js/habits.js');
await import('../public/js/links.js');
const { COLLECTIONS } = await import('../public/js/schema.js');
const day = await today();
const get = (id) => store.findItem('habits', id);

test('one tap completes each type of habit', async () => {
  await habits.setComplete(get('Gym'), day, true);
  await habits.setComplete(get('Sleep'), day, true);
  await habits.setComplete(get('Prayers'), day, true);
  assert.equal(get('Gym').log[day], 1);
  assert.equal(get('Sleep').log[day], 7);
  assert.deepEqual(get('Prayers').log[day], [0, 1, 2, 3, 4]);
  for (const id of ['Gym', 'Sleep', 'Prayers']) assert.ok(habits.isMetOn(get(id), day), `${id} should be done`);
});

test('completing keeps an amount that is already over the target', async () => {
  await habits.setAmount(get('Coding'), day, 75);
  await habits.setComplete(get('Coding'), day, true);
  assert.equal(get('Coding').log[day], 75);
});

test('a second tap clears the day, and Undo brings it back', async () => {
  const undo = await store.undoable(() => habits.setComplete(get('Sleep'), day, false));
  assert.equal(get('Sleep').log[day], undefined);
  await undo();
  assert.equal(get('Sleep').log[day], 7);
});

test('reorder moves a habit and the order sticks', async () => {
  const names = () => habits.sortedHabits().map((h) => h.id);
  assert.deepEqual(names(), ['Gym', 'Sleep', 'Coding', 'Prayers']);
  await habits.moveHabit('Prayers', -1);
  await habits.moveHabit('Prayers', -1);
  assert.deepEqual(names(), ['Gym', 'Prayers', 'Sleep', 'Coding']);
  await habits.moveHabit('Gym', -1); // Already first: nothing changes.
  assert.deepEqual(names(), ['Gym', 'Prayers', 'Sleep', 'Coding']);
});

test('archived habits leave the lists but keep their history', async () => {
  await store.updateItem('habits', 'Coding', (latest) => { latest.archived = true; });
  assert.ok(!habits.sortedHabits().some((h) => h.id === 'Coding'));
  assert.equal(get('Coding').log[day], 75);
  await store.updateItem('habits', 'Coding', (latest) => { delete latest.archived; });
});

test('streak counts back over finished days', async () => {
  const { addDays } = await import('../public/js/tasks.js');
  await store.updateItem('habits', 'Gym', (latest) => { latest.log = { [day]: 1, [addDays(day, -1)]: 1, [addDays(day, -2)]: 1, [addDays(day, -4)]: 1 }; });
  assert.equal(habits.currentStreak(get('Gym')), 3);
});

test('deleting a workout unticks Gym, unless another workout is on that day', async () => {
  await store.updateItem('habits', 'Gym', (latest) => { latest.log = { [day]: 1 }; });
  const a = { id: 'w1', title: 'Push', date: day };
  const b = { id: 'w2', title: 'Pull', date: day };
  await store.saveItem('workouts', a);
  await store.saveItem('workouts', b);
  await store.deleteItem('workouts', 'w1');
  await COLLECTIONS.workouts.afterDelete(a);
  assert.equal(get('Gym').log[day], 1, 'still ticked: Pull is on the same day');
  await store.deleteItem('workouts', 'w2');
  await COLLECTIONS.workouts.afterDelete(b);
  assert.equal(get('Gym').log[day], undefined, 'unticked: no workout left that day');
});

test('deleting a coding session takes its minutes off the Coding habit', async () => {
  await habits.setAmount(get('Coding'), day, 90);
  const session = { id: 's1', date: day, minutes: 30 };
  await store.saveItem('sessions', session);
  await store.deleteItem('sessions', 's1');
  await COLLECTIONS.sessions.afterDelete(session);
  assert.equal(get('Coding').log[day], 60);
});

test('every change was saved to the server', () => {
  assert.ok(server.saves > 10);
  assert.equal(server.items.habits.length, 4);
});
