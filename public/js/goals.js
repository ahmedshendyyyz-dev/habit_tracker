// How close a goal is: milestones, progress logs, and whether it is on track.
import { dayOf, todayISO } from './schema.js';
import { updateItem } from './store.js';
import { parseDay } from './tasks.js';

// Reaching a milestone counts as much as several check-ins on the grid.
const MILESTONE_WEIGHT = 3;

export const milestonesOf = (goal) => (Array.isArray(goal.milestones) ? goal.milestones : []);
export const logOf = (goal) => (Array.isArray(goal.log) ? goal.log : []);
export const usesMilestones = (goal) => milestonesOf(goal).length > 0;

// With milestones: the share reached. Without: the slider you set yourself.
export function goalProgress(goal) {
  const milestones = milestonesOf(goal);
  if (milestones.length) return Math.round((milestones.filter((m) => m.done).length / milestones.length) * 100);
  return Math.max(0, Math.min(100, Number(goal.progress) || 0));
}

export const isGoalDone = (goal) => goalProgress(goal) >= 100;

// Soonest due first. Milestones without a date go last.
export function sortedMilestones(goal) {
  return [...milestonesOf(goal)].sort((a, b) => {
    const left = a.due || '9999-99-99';
    const right = b.due || '9999-99-99';
    return left === right ? (a.createdAt || '').localeCompare(b.createdAt || '') : left.localeCompare(right);
  });
}

export const nextMilestone = (goal) => sortedMilestones(goal).find((m) => !m.done) || null;

export function daysBetween(from, to) {
  return Math.round((parseDay(to) - parseDay(from)) / 86400000);
}

// "Due in 5 days", "Due today", "3 days late".
export function dueText(day) {
  if (!day) return 'No due date';
  const diff = daysBetween(todayISO(), day);
  if (diff === 0) return 'Due today';
  if (diff === 1) return 'Due tomorrow';
  if (diff > 1) return `Due in ${diff} days`;
  return diff === -1 ? '1 day late' : `${-diff} days late`;
}

/**
 * Compares progress with the dates you set.
 * Returns { text, tone } for a label, or null when there are no dates to compare with.
 */
export function onTrack(goal) {
  const today = todayISO();
  const progress = goalProgress(goal);
  if (progress >= 100) return { text: 'Done', tone: 'success' };
  if (goal.targetDate && goal.targetDate < today) return { text: 'Overdue', tone: 'danger' };
  const late = milestonesOf(goal).filter((m) => !m.done && m.due && m.due < today).length;
  if (late) return { text: late === 1 ? 'Behind: 1 milestone late' : `Behind: ${late} milestones late`, tone: 'attention' };
  if (goal.targetDate) {
    // Progress should roughly keep up with the time that has passed.
    const start = dayOf(goal.createdAt) || today;
    const total = daysBetween(start, goal.targetDate);
    if (total > 0) {
      const expected = (daysBetween(start, today) / total) * 100;
      if (progress + 10 < expected) return { text: 'Behind', tone: 'attention' };
    }
  }
  if (goal.targetDate || milestonesOf(goal).some((m) => m.due)) return { text: 'On track', tone: 'accent' };
  return null;
}

/* ---------- Contributions ---------- */

export function goalContributions(goal) {
  const counts = new Map();
  for (const entry of logOf(goal)) counts.set(entry.day, (counts.get(entry.day) || 0) + 1);
  for (const milestone of milestonesOf(goal)) {
    if (milestone.done && milestone.doneDate) counts.set(milestone.doneDate, (counts.get(milestone.doneDate) || 0) + MILESTONE_WEIGHT);
  }
  return counts;
}

export function describeGoalDay(goal, day) {
  const logs = logOf(goal).filter((entry) => entry.day === day).length;
  const reached = milestonesOf(goal).filter((m) => m.done && m.doneDate === day).map((m) => `"${m.title}"`);
  const parts = [];
  if (logs) parts.push(`${logs} ${logs === 1 ? 'check-in' : 'check-ins'}`);
  if (reached.length) parts.push(`reached ${reached.join(', ')}`);
  return parts.length ? parts.join(', ') : 'No progress logged';
}

/* ---------- Changes ---------- */

const change = (goal, fn) => updateItem('goals', goal.id, (latest) => {
  latest.milestones = milestonesOf(latest).map((m) => ({ ...m }));
  latest.log = [...logOf(latest)];
  fn(latest);
});

export const logProgress = (goal, note, day = todayISO()) => change(goal, (latest) => {
  latest.log.push({ id: crypto.randomUUID(), day, note: note.trim(), at: new Date().toISOString() });
});

export const removeLog = (goal, id) => change(goal, (latest) => {
  latest.log = latest.log.filter((entry) => entry.id !== id);
});

export const addMilestone = (goal, title, due) => change(goal, (latest) => {
  latest.milestones.push({ id: crypto.randomUUID(), createdAt: new Date().toISOString(), title: title.trim(), due: due || '', done: false, doneDate: '' });
});

export const editMilestone = (goal, id, title, due) => change(goal, (latest) => {
  const milestone = latest.milestones.find((m) => m.id === id);
  if (milestone) Object.assign(milestone, { title: title.trim(), due: due || '' });
});

export const setMilestoneDone = (goal, id, done) => change(goal, (latest) => {
  const milestone = latest.milestones.find((m) => m.id === id);
  if (milestone) Object.assign(milestone, { done, doneDate: done ? todayISO() : '' });
});

export const removeMilestone = (goal, id) => change(goal, (latest) => {
  latest.milestones = latest.milestones.filter((m) => m.id !== id);
});
