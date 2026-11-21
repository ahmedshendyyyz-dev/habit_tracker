// A goal's own page: its grid, milestones, progress log and how it is tracking.
import { displayTitle, formatDate, todayISO } from './schema.js';
import { confirmDialog, h, showDialog, toast } from './ui.js';
import { findItem, items, updateItem } from './store.js';
import { openForm } from './form.js';
import { icon } from './icons.js';
import { archiveButton, boxSection, confirmDelete, counter, progressBar, stat, withUndo } from './components.js';
import { contributionGrid } from './grid.js';
import { linkedTasks } from './tasksView.js';
import {
  addMilestone, daysBetween, describeGoalDay, dueText, editMilestone, goalContributions, goalProgress, logOf,
  logProgress, milestonesOf, nextMilestone, onTrack, removeLog, removeMilestone, setMilestoneDone, sortedMilestones, usesMilestones,
} from './goals.js';

const save = (promise, message) => promise
  .then(() => { if (message) toast(message); })
  .catch((error) => toast(`Not saved: ${error.message}`, true));

export function goalStatusLabel(goal) {
  const status = onTrack(goal);
  return status ? h('span', { class: `label label-${status.tone}` }, status.text) : null;
}

// "Next: Finish the course · Due in 5 days"
export function nextMilestoneLine(goal) {
  const next = nextMilestone(goal);
  if (!next) return '';
  return `Next: ${next.title} · ${dueText(next.due)}`;
}

/* ---------- Milestones ---------- */

function milestoneDialog(goal, milestone) {
  const title = h('input', { id: 'milestone-title', type: 'text', required: true, maxLength: 200, value: milestone ? milestone.title : '' });
  const due = h('input', { id: 'milestone-due', type: 'date', value: milestone ? milestone.due : '', max: goal.targetDate || undefined });
  const error = h('p', { class: 'form-error', role: 'alert' });
  const dialog = h('dialog', { 'aria-labelledby': 'milestone-heading' });
  const form = h('form', {
    class: 'form',
    onsubmit: async (event) => {
      event.preventDefault();
      if (!title.value.trim()) return;
      try {
        if (milestone) await editMilestone(goal, milestone.id, title.value, due.value);
        else await addMilestone(goal, title.value, due.value);
        dialog.close();
        toast(milestone ? 'Milestone saved' : 'Milestone added');
      } catch (err) {
        error.textContent = `Not saved: ${err.message}`;
      }
    },
  },
    h('div', { class: 'dialog-header' },
      h('h2', { id: 'milestone-heading' }, milestone ? 'Edit milestone' : 'New milestone'),
      h('button', { class: 'btn-icon btn-invisible', type: 'button', 'aria-label': 'Close', onclick: () => dialog.close() }, icon('close'))),
    h('div', { class: 'dialog-body' },
      h('div', { class: 'field' }, h('label', { for: 'milestone-title' }, 'Milestone', h('span', { class: 'required-mark', 'aria-hidden': 'true' }, ' *')), title,
        h('span', { class: 'hint' }, 'A step on the way, for example "Finish the Spring Boot course".')),
      h('div', { class: 'field' }, h('label', { for: 'milestone-due' }, 'Due date'), due,
        goal.targetDate && h('span', { class: 'hint' }, `The goal's target date is ${formatDate(goal.targetDate)}.`)),
      error),
    h('div', { class: 'dialog-footer' },
      h('button', { class: 'btn', type: 'button', onclick: () => dialog.close() }, 'Cancel'),
      h('button', { class: 'btn btn-primary', type: 'submit' }, 'Save')));
  dialog.append(form);
  showDialog(dialog);
  title.focus();
}

function milestoneRow(goal, milestone) {
  const today = todayISO();
  const late = !milestone.done && milestone.due && milestone.due < today;
  let when;
  if (milestone.done) {
    const diff = milestone.due && milestone.doneDate ? daysBetween(milestone.due, milestone.doneDate) : 0;
    when = `Reached ${formatDate(milestone.doneDate)}${diff < 0 ? `, ${-diff} ${diff === -1 ? 'day' : 'days'} early` : diff > 0 ? `, ${diff} ${diff === 1 ? 'day' : 'days'} late` : ''}`;
  } else {
    when = milestone.due ? `${formatDate(milestone.due)} · ${dueText(milestone.due)}` : 'No due date';
  }
  return h('li', { class: `list-row${milestone.done ? ' is-done' : ''}` },
    h('input', {
      type: 'checkbox',
      class: 'row-check',
      checked: Boolean(milestone.done),
      'data-focus': `milestone-${milestone.id}`,
      'aria-label': `Mark milestone "${milestone.title}" as reached`,
      onchange: (event) => save(setMilestoneDone(goal, milestone.id, event.target.checked), event.target.checked ? 'Milestone reached. Well done!' : ''),
    }),
    h('div', { class: 'row-main' },
      h('div', { class: 'row-title row-title-task' }, h('span', { class: 'milestone-title' }, milestone.title), late && h('span', { class: 'label label-danger' }, 'Late')),
      h('p', { class: `small ${late ? 'text-danger' : 'muted'}` }, when)),
    h('div', { class: 'row-actions' },
      h('button', { class: 'btn-icon btn-invisible', type: 'button', 'aria-label': `Edit milestone "${milestone.title}"`, onclick: () => milestoneDialog(goal, milestone) }, icon('pencil')),
      h('button', {
        class: 'btn-icon btn-invisible',
        type: 'button',
        'aria-label': `Delete milestone "${milestone.title}"`,
        onclick: async () => {
          const yes = await confirmDialog({
            title: `Delete the milestone "${milestone.title}"?`,
            message: 'Progress for this goal will be worked out again from the milestones that are left.',
            confirmLabel: 'Delete',
            danger: true,
          });
          if (yes) withUndo(() => removeMilestone(goal, milestone.id), 'Milestone deleted');
        },
      }, icon('close'))));
}

function milestonesBox(goal) {
  const list = sortedMilestones(goal);
  const reached = list.filter((m) => m.done).length;
  return boxSection(['Milestones ', counter(`${reached}/${list.length}`)],
    list.length
      ? h('ul', { class: 'list' }, list.map((milestone) => milestoneRow(goal, milestone)))
      : h('div', { class: 'box-empty' }, h('p', { class: 'muted' }, 'Break this goal into steps with due dates. Progress then fills in by itself as you reach them.')),
    h('button', { class: 'btn btn-small', type: 'button', onclick: () => milestoneDialog(goal) }, icon('plus'), 'Add milestone'));
}

/* ---------- Progress log ---------- */

function logBox(goal) {
  const note = h('input', {
    type: 'text',
    class: 'quick-add-input',
    placeholder: 'What did you do for this goal today? (optional)',
    'aria-label': 'What you did for this goal today',
    maxLength: 300,
    'data-focus': `goal-log-${goal.id}`,
  });
  const recent = [...logOf(goal)].sort((a, b) => (b.at || b.day).localeCompare(a.at || a.day)).slice(0, 10);
  const todayCount = logOf(goal).filter((entry) => entry.day === todayISO()).length;
  return boxSection(['Progress log ', counter(logOf(goal).length)],
    [
      h('form', {
        class: 'log-form',
        onsubmit: (event) => {
          event.preventDefault();
          note.readOnly = true;
          save(logProgress(goal, note.value), 'Logged. Keep it going!').finally(() => { note.readOnly = false; });
        },
      },
        note,
        h('button', { class: 'btn btn-primary', type: 'submit' }, icon('plus'), 'Log progress')),
      recent.length
        ? h('ul', { class: 'list log-list' }, recent.map((entry) => h('li', { class: 'list-row' },
          icon('check', 'icon row-icon is-success'),
          h('div', { class: 'row-main' },
            h('p', {}, entry.note || h('span', { class: 'muted' }, 'Worked on it')),
            h('p', { class: 'muted small' }, formatDate(entry.day))),
          h('button', {
            class: 'btn-icon btn-invisible',
            type: 'button',
            'aria-label': `Remove the log from ${formatDate(entry.day)}`,
            onclick: () => save(removeLog(goal, entry.id), 'Removed'),
          }, icon('close')))))
        : null,
    ],
    todayCount ? h('span', { class: 'muted small' }, `${todayCount} today`) : null);
}

/* ---------- The goal page ---------- */

export function goalDetailPage(id) {
  const goal = findItem('goals', id);
  const crumb = h('nav', { class: 'breadcrumb', 'aria-label': 'Breadcrumb' }, h('a', { href: '#/goals' }, 'Goals'), h('span', { 'aria-hidden': 'true' }, '/'));
  if (!goal) {
    return [crumb, h('div', { class: 'box blankslate' }, h('h3', {}, 'This goal could not be found'), h('p', {}, 'It may have been deleted.'))];
  }
  const title = displayTitle('goals', goal);
  const progress = goalProgress(goal);
  const milestones = milestonesOf(goal);
  const reached = milestones.filter((m) => m.done).length;
  const daysLeft = goal.targetDate ? daysBetween(todayISO(), goal.targetDate) : null;
  const contributions = goalContributions(goal);
  const total = [...contributions.values()].reduce((sum, count) => sum + count, 0);
  const grid = contributionGrid(contributions, {
    noun: ['contribution', 'contributions'],
    ariaLabel: `${title}: contributions`,
    describe: (day) => `${describeGoalDay(goal, day)} on ${formatDate(day)}`,
  });
  const parent = goal.parentId && findItem('goals', goal.parentId);
  const children = items('goals').filter((other) => other.parentId === goal.id);
  const next = nextMilestoneLine(goal);

  return [
    crumb,
    h('div', { class: 'detail-head' },
      h('div', { class: 'detail-title' },
        h('h1', {}, title),
        h('p', { class: 'detail-meta' },
          goalStatusLabel(goal),
          h('span', { class: 'label label-default' }, goal.horizon || 'Goal'),
          h('span', { class: 'muted' }, goal.targetDate ? `Target ${formatDate(goal.targetDate)}` : 'No target date'))),
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn', type: 'button', 'data-edit': true, onclick: () => openForm('goals', goal) }, icon('pencil'), 'Edit'),
        archiveButton('goals', goal),
        h('button', { class: 'btn btn-danger', type: 'button', 'data-delete': true, onclick: () => confirmDelete('goals', goal, 'This removes the goal, its milestones and its progress log. A recent copy is kept in your backups.') }, 'Delete'))),
    h('div', { class: 'stack' },
      h('div', { class: 'stats' },
        stat('Progress', `${progress}%`, usesMilestones(goal) ? 'from milestones' : 'set by you'),
        stat('Milestones', `${reached}/${milestones.length}`, 'reached'),
        stat(daysLeft !== null && daysLeft < 0 ? 'Past target by' : 'Days left',
          daysLeft === null ? '–' : String(Math.abs(daysLeft)),
          daysLeft === null ? 'no target date' : Math.abs(daysLeft) === 1 ? 'day' : 'days'),
        stat('Contributions', String(total), 'all time')),
      h('section', { class: 'box box-padded goal-progress' },
        h('div', { class: 'pinned-progress' }, progressBar(progress, title), h('span', { class: 'small' }, `${progress}%`)),
        next && h('p', { class: 'muted small' }, next),
        !usesMilestones(goal) && h('p', { class: 'muted small' }, 'Progress is the slider you set. Add milestones below and it will update by itself.')),
      boxSection(`${total} ${total === 1 ? 'contribution' : 'contributions'} in ${grid.period}`, h('div', { class: 'box-body' }, grid.element)),
      logBox(goal),
      milestonesBox(goal),
      linkedTasks('goalId', goal.id),
      goal.bucketId && findItem('bucket', goal.bucketId) && boxSection('From your bucket list', h('div', { class: 'box-body inline-form' },
        h('a', { href: `#/bucket/${goal.bucketId}` }, displayTitle('bucket', findItem('bucket', goal.bucketId))),
        findItem('bucket', goal.bucketId).done
          ? h('span', { class: 'label label-success' }, 'Ticked off')
          : progress >= 100 && h('button', {
            class: 'btn btn-small btn-primary',
            type: 'button',
            onclick: () => updateItem('bucket', goal.bucketId, (item) => { item.done = true; item.doneDate = todayISO(); item.goalId = goal.id; })
              .then(() => toast('Ticked off your bucket list. Amazing!'))
              .catch((error) => toast(`Not saved: ${error.message}`, true)),
          }, icon('check'), 'Tick it off your bucket list'))),
      parent && boxSection('Supports', h('div', { class: 'box-body' }, h('a', { href: `#/goals/${parent.id}` }, displayTitle('goals', parent)))),
      children.length > 0 && boxSection('Short term goals supporting this', h('ul', { class: 'list' }, children.map((child) => h('li', { class: 'list-row' },
        icon('target', 'icon row-icon'),
        h('div', { class: 'row-main' },
          h('div', { class: 'row-title' }, h('a', { href: `#/goals/${child.id}` }, displayTitle('goals', child)), goalStatusLabel(child)),
          progressBar(goalProgress(child), displayTitle('goals', child))))))),
      goal.notes && boxSection('Notes', h('div', { class: 'box-body' }, h('p', { class: 'prose' }, goal.notes)))),
  ];
}
