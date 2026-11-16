// A GitHub-style contribution grid: one square per day, darker green on busier days.
import { isoDay } from './schema.js';
import { h } from './ui.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function levelFor(count, max) {
  if (!count) return 0;
  if (max <= 4) return Math.min(count, 4);
  const share = count / max;
  if (share <= 0.25) return 1;
  if (share <= 0.5) return 2;
  if (share <= 0.75) return 3;
  return 4;
}

let tooltip;
function showTip(cell) {
  if (!tooltip) {
    tooltip = h('div', { class: 'grid-tooltip', role: 'tooltip' });
    document.body.append(tooltip);
  }
  tooltip.textContent = cell.dataset.tip;
  tooltip.hidden = false;
  const box = cell.getBoundingClientRect();
  const width = tooltip.offsetWidth;
  const left = Math.min(Math.max(8, box.left + box.width / 2 - width / 2), window.innerWidth - width - 8);
  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${box.top - tooltip.offsetHeight - 6}px`;
}
function hideTip() {
  if (tooltip) tooltip.hidden = true;
}

/**
 * counts: Map of YYYY-MM-DD to a number.
 * noun: what a square counts, for example ['activity', 'activities'].
 * weeks: how many weeks to show, 53 is one full year.
 */
export function contributionGrid(counts, { noun = ['activity', 'activities'], weeks = 53, small = false, describe, ariaLabel } = {}) {
  // Dates are built at noon: in Egypt the clocks change at midnight,
  // and stepping from midnight would skip or repeat a day.
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
  const todayKey = isoDay(today);
  const firstOffset = (weeks - 1) * 7 + today.getDay();

  const days = [];
  for (let index = 0; index <= firstOffset; index++) {
    const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() - firstOffset + index, 12);
    const day = isoDay(date);
    days.push({ day, date, count: counts.get(day) || 0 });
  }
  const max = Math.max(0, ...days.map((entry) => entry.count));
  const total = days.reduce((sum, entry) => sum + entry.count, 0);
  const label = (count) => `${count === 0 ? 'No' : count} ${count === 1 ? noun[0] : noun[1]}`;

  // Month names sit above the first week that starts in that month.
  const monthCells = [];
  let lastMonth = -1;
  for (let week = 0; week < weeks; week++) {
    const first = days[week * 7];
    if (!first) break;
    const month = first.date.getMonth();
    if (month !== lastMonth && (week > 0 || first.date.getDate() <= 7)) {
      monthCells.push(h('span', { style: `grid-column: ${week + 1} / span 3` }, MONTHS[month]));
    }
    lastMonth = month;
  }

  const cells = days.map((entry) => {
    const when = entry.date.toLocaleDateString(undefined, { month: 'long', day: 'numeric' });
    return h('span', {
      class: 'grid-day',
      'data-level': levelFor(entry.count, max),
      'data-tip': `${describe ? describe(entry.day) : `${label(entry.count)} on ${when}`}${entry.day === todayKey ? ' (today)' : ''}`,
    });
  });

  const board = h('div', {
    class: 'grid-days',
    onmouseover: (event) => { if (event.target.dataset.tip) showTip(event.target); },
    onmouseout: hideTip,
  }, cells);

  const levels = [0, 1, 2, 3, 4].map((level) => h('span', { class: 'grid-day', 'data-level': level }));

  const scroller = h('div', { class: 'grid-scroll' },
    h('div', { class: 'grid-canvas', style: `--weeks: ${weeks}` },
      h('div', { class: 'grid-months', 'aria-hidden': 'true' }, monthCells),
      h('div', { class: 'grid-weekdays', 'aria-hidden': 'true' }, h('span', {}, 'Mon'), h('span', {}, 'Wed'), h('span', {}, 'Fri')),
      board));

  // Show the most recent weeks first on narrow screens.
  requestAnimationFrame(() => { scroller.scrollLeft = scroller.scrollWidth; });

  return {
    total,
    element: h('div', {
      class: `contrib${small ? ' contrib-small' : ''}`,
      role: 'img',
      'aria-label': ariaLabel || `${label(total)} in the last year`,
    },
      scroller,
      h('div', { class: 'grid-legend', 'aria-hidden': 'true' }, h('span', {}, 'Less'), levels, h('span', {}, 'More'))),
  };
}
