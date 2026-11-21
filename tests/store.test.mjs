// Saving, Undo, archive lists, tasks and goals.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadApp, today } from './fake-app.mjs';

const day = await today();
const { addDays } = await import('../public/js/tasks.js');
const { server, store } = await loadApp({
  tasks: [
    { id: 't1', title: 'Update CV', kind: 'Task', date: addDays(day, -2), repeat: 'Does not repeat', done: false },
    { id: 't2', title: 'Old done', kind: 'Task', date: addDays(day, -3), repeat: 'Does not repeat', done: true },
    { id: 't3', title: 'Gym', kind: 'Task', date: addDays(day, -10), repeat: 'Every day', doneDates: [] },
  ],
  goals: [
    { id: 'g1', title: 'Quit S', horizon: 'Short term', createdAt: `${addDays(day, -30)}T10:00:00Z`, targetDate: addDays(day, 10), progress: 0 },
    { id: 'g2', title: 'Job', horizon: 'Short term', createdAt: `${addDays(day, -30)}T10:00:00Z`, targetDate: addDays(day, 60), milestones: [
      { id: 'm1', title: 'CV', due: addDays(day, -5), done: true },
      { id: 'm2', title: 'Apply', due: addDays(day, -1), done: false },
    ] },
  ],
  bucket: [{ id: 'b1', title: 'Dahab' }, { id: 'b2', title: 'Pyramids' }, { id: 'b3', title: 'Siwa' }],
});
const tasks = await import('../public/js/tasks.js');
const goals = await import('../public/js/goals.js');

test('Undo puts a deleted item back in the same place', async () => {
  const undo = await store.undoable(() => store.deleteItem('bucket', 'b2'));
  assert.deepEqual(store.items('bucket').map((b) => b.id), ['b1', 'b3']);
  await undo();
  assert.deepEqual(store.items('bucket').map((b) => b.id), ['b1', 'b2', 'b3']);
  assert.deepEqual(server.items.bucket.map((b) => b.id), ['b1', 'b2', 'b3'], 'saved, not just shown');
});

test('Undo leaves alone what changed in between', async () => {
  const undo = await store.undoable(() => store.updateItem('bucket', 'b1', (latest) => { latest.title = 'Dahab diving'; }));
  await store.updateItem('bucket', 'b3', (latest) => { latest.title = 'Siwa oasis'; });
  await undo();
  assert.equal(store.findItem('bucket', 'b1').title, 'Dahab');
  assert.equal(store.findItem('bucket', 'b3').title, 'Siwa oasis');
});

test('Undo of something that changed nothing offers no undo', async () => {
  assert.equal(await store.undoable(async () => {}), null);
});

test('archived items are left out of activeItems but still found by id', async () => {
  await store.updateItem('bucket', 'b3', (latest) => { latest.archived = true; });
  assert.deepEqual(store.activeItems('bucket').map((b) => b.id), ['b1', 'b2']);
  assert.ok(store.findItem('bucket', 'b3'));
});

test('overdue: only unfinished one-off tasks from before today', () => {
  assert.deepEqual(tasks.overdueTasks().map((t) => t.id), ['t1']);
});

test('moving an overdue task to today clears it from overdue', async () => {
  await store.updateItem('tasks', 't1', (latest) => { latest.date = day; });
  assert.equal(tasks.overdueTasks().length, 0);
  assert.ok(tasks.tasksOn(day).some((t) => t.id === 't1'));
});

test('a goal with no milestones and no progress asks for milestones, not "Behind"', () => {
  assert.deepEqual(goals.onTrack(store.findItem('goals', 'g1')), { text: 'Add milestones', tone: 'muted' });
});

test('a late milestone still shows Behind', () => {
  assert.equal(goals.onTrack(store.findItem('goals', 'g2')).tone, 'attention');
  assert.equal(goals.goalProgress(store.findItem('goals', 'g2')), 50);
});
