// Two simple charts, one series each: a line over time and a row of columns.
// They draw at the box's real width, show a tooltip on hover, and offer a table view.
import { formatDate } from './schema.js';
import { h } from './ui.js';
import { parseDay } from './tasks.js';

const NS = 'http://www.w3.org/2000/svg';
function svg(tag, attrs = {}, style = {}) {
  const element = document.createElementNS(NS, tag);
  for (const [name, value] of Object.entries(attrs)) element.setAttribute(name, value);
  Object.assign(element.style, style);
  return element;
}

// Round, evenly spaced axis values, like 70, 75, 80.
function niceTicks(min, max, count = 4) {
  if (min === max) { min -= 1; max += 1; }
  const rough = (max - min) / count;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const norm = rough / magnitude;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * magnitude;
  const ticks = [];
  for (let value = Math.floor(min / step) * step; value <= Math.ceil(max / step) * step + step / 2; value += step) {
    ticks.push(Math.round(value * 1000) / 1000);
  }
  return ticks;
}

let tooltip;
function showTip(text, x, y) {
  if (!tooltip) {
    tooltip = h('div', { class: 'grid-tooltip', role: 'tooltip' });
    document.body.append(tooltip);
  }
  tooltip.textContent = text;
  tooltip.hidden = false;
  const width = tooltip.offsetWidth;
  tooltip.style.left = `${Math.min(Math.max(8, x - width / 2), window.innerWidth - width - 8)}px`;
  tooltip.style.top = `${y - tooltip.offsetHeight - 10}px`;
}
function hideTip() {
  if (tooltip) tooltip.hidden = true;
}

function tableView(caption, headers, rows) {
  return h('details', { class: 'chart-table' },
    h('summary', {}, 'Show as a table'),
    h('table', {},
      h('caption', { class: 'visually-hidden' }, caption),
      h('thead', {}, h('tr', {}, headers.map((text) => h('th', { scope: 'col' }, text)))),
      h('tbody', {}, rows.map((cells) => h('tr', {}, cells.map((text) => h('td', {}, text)))))));
}

function frame(label, draw) {
  const box = h('div', { class: 'chart', role: 'img', 'aria-label': label });
  let lastWidth = 0;
  const observer = new ResizeObserver(() => {
    // The page redraws often. Stop watching charts that are no longer on it.
    if (!box.isConnected) { if (lastWidth) observer.disconnect(); return; }
    const width = Math.round(box.clientWidth);
    if (width && width !== lastWidth) {
      lastWidth = width;
      draw(box, width);
    }
  });
  observer.observe(box);
  return box;
}

/**
 * points: [{ day: 'YYYY-MM-DD', value }], oldest first.
 * format: turns a value into text, for example (v) => `${v} kg`.
 */
export function lineChart(points, { label, format = String, height = 200 }) {
  const box = frame(label, (target, width) => {
    const pad = { top: 16, right: 64, bottom: 28, left: 40 };
    const plotW = Math.max(40, width - pad.left - pad.right);
    const plotH = height - pad.top - pad.bottom;
    const values = points.map((point) => point.value);
    const ticks = niceTicks(Math.min(...values), Math.max(...values));
    const yMin = ticks[0];
    const yMax = ticks[ticks.length - 1];
    const times = points.map((point) => parseDay(point.day).getTime());
    const tMin = times[0];
    const tMax = times[times.length - 1];
    const x = (time) => pad.left + (tMax === tMin ? plotW / 2 : ((time - tMin) / (tMax - tMin)) * plotW);
    const y = (value) => pad.top + plotH - ((value - yMin) / (yMax - yMin)) * plotH;

    const chart = svg('svg', { width, height, viewBox: `0 0 ${width} ${height}` });
    for (const tick of ticks) {
      chart.append(svg('line', { x1: pad.left, x2: pad.left + plotW, y1: y(tick), y2: y(tick) }, { stroke: 'var(--border-muted)', strokeWidth: '1' }));
      const text = svg('text', { x: pad.left - 8, y: y(tick) + 4, 'text-anchor': 'end' }, { fill: 'var(--fg-muted)', fontSize: '12px' });
      text.textContent = String(tick);
      chart.append(text);
    }
    const coords = points.map((point, index) => [x(times[index]), y(point.value)]);
    const line = coords.map(([px, py], index) => `${index ? 'L' : 'M'}${px},${py}`).join(' ');
    if (coords.length > 1) {
      const area = `${line} L${coords[coords.length - 1][0]},${pad.top + plotH} L${coords[0][0]},${pad.top + plotH} Z`;
      chart.append(svg('path', { d: area }, { fill: 'var(--accent)', opacity: '0.1' }));
      chart.append(svg('path', { d: line, fill: 'none' }, { stroke: 'var(--accent)', strokeWidth: '2', strokeLinejoin: 'round', strokeLinecap: 'round' }));
    }
    // The latest value: a dot with a ring, labelled at the end of the line.
    const [endX, endY] = coords[coords.length - 1];
    chart.append(svg('circle', { cx: endX, cy: endY, r: 4 }, { fill: 'var(--accent)', stroke: 'var(--bg)', strokeWidth: '2' }));
    const endLabel = svg('text', { x: endX + 10, y: endY + 4 }, { fill: 'var(--fg)', fontSize: '12px', fontWeight: '600' });
    endLabel.textContent = format(points[points.length - 1].value);
    chart.append(endLabel);
    // First and last dates under the line.
    const dateLabel = (time, day, anchor) => {
      const text = svg('text', { x: x(time), y: height - 8, 'text-anchor': anchor }, { fill: 'var(--fg-muted)', fontSize: '12px' });
      text.textContent = formatDate(day);
      chart.append(text);
    };
    dateLabel(tMin, points[0].day, points.length > 1 ? 'start' : 'middle');
    if (points.length > 1) dateLabel(tMax, points[points.length - 1].day, 'end');

    // Hover: a hairline snaps to the nearest day.
    const cross = svg('line', { y1: pad.top, y2: pad.top + plotH, visibility: 'hidden' }, { stroke: 'var(--fg-muted)', strokeWidth: '1' });
    const focus = svg('circle', { r: 5, visibility: 'hidden' }, { fill: 'var(--accent)', stroke: 'var(--bg)', strokeWidth: '2' });
    const hit = svg('rect', { x: pad.left - 8, y: 0, width: plotW + 16, height }, { fill: 'transparent', cursor: 'crosshair' });
    hit.addEventListener('pointermove', (event) => {
      const bounds = chart.getBoundingClientRect();
      const px = event.clientX - bounds.left;
      let nearest = 0;
      coords.forEach(([cx], index) => { if (Math.abs(cx - px) < Math.abs(coords[nearest][0] - px)) nearest = index; });
      const [cx, cy] = coords[nearest];
      cross.setAttribute('x1', cx); cross.setAttribute('x2', cx); cross.setAttribute('visibility', 'visible');
      focus.setAttribute('cx', cx); focus.setAttribute('cy', cy); focus.setAttribute('visibility', 'visible');
      showTip(`${formatDate(points[nearest].day)}: ${format(points[nearest].value)}`, bounds.left + cx, bounds.top + cy);
    });
    hit.addEventListener('pointerleave', () => {
      cross.setAttribute('visibility', 'hidden');
      focus.setAttribute('visibility', 'hidden');
      hideTip();
    });
    chart.append(cross, focus, hit);
    target.replaceChildren(chart);
  });
  return h('div', { class: 'chart-wrap' }, box,
    tableView(label, ['Date', 'Value'], [...points].reverse().map((point) => [formatDate(point.day), format(point.value)])));
}

/**
 * bars: [{ label, value, tip }], left to right. The last bar is labelled with its value.
 */
export function columnChart(bars, { label, format = String, height = 180 }) {
  const box = frame(label, (target, width) => {
    const pad = { top: 20, right: 8, bottom: 28, left: 40 };
    const plotW = Math.max(40, width - pad.left - pad.right);
    const plotH = height - pad.top - pad.bottom;
    const ticks = niceTicks(0, Math.max(1, ...bars.map((bar) => bar.value)));
    const yMax = ticks[ticks.length - 1];
    const slot = plotW / bars.length;
    const barW = Math.min(24, slot * 0.6);
    const y = (value) => pad.top + plotH - (value / yMax) * plotH;

    const chart = svg('svg', { width, height, viewBox: `0 0 ${width} ${height}` });
    for (const tick of ticks) {
      chart.append(svg('line', { x1: pad.left, x2: pad.left + plotW, y1: y(tick), y2: y(tick) }, { stroke: 'var(--border-muted)', strokeWidth: '1' }));
      const text = svg('text', { x: pad.left - 8, y: y(tick) + 4, 'text-anchor': 'end' }, { fill: 'var(--fg-muted)', fontSize: '12px' });
      text.textContent = String(tick);
      chart.append(text);
    }
    const everyOther = slot < 48;
    bars.forEach((bar, index) => {
      const cx = pad.left + slot * index + slot / 2;
      const top = y(bar.value);
      const base = pad.top + plotH;
      const r = Math.min(4, (base - top) / 2, barW / 2);
      const left = cx - barW / 2;
      // Rounded at the top, square at the baseline.
      const path = bar.value > 0
        ? `M${left},${base} V${top + r} Q${left},${top} ${left + r},${top} H${left + barW - r} Q${left + barW},${top} ${left + barW},${top + r} V${base} Z`
        : '';
      const mark = svg('path', { d: path }, { fill: 'var(--btn-primary)', transition: 'opacity 80ms' });
      chart.append(mark);
      if (!everyOther || index % 2 === bars.length % 2 || index === bars.length - 1) {
        const text = svg('text', { x: cx, y: height - 8, 'text-anchor': 'middle' }, { fill: 'var(--fg-muted)', fontSize: '12px' });
        text.textContent = bar.label;
        chart.append(text);
      }
      if (index === bars.length - 1 && bar.value > 0) {
        const value = svg('text', { x: cx, y: top - 6, 'text-anchor': 'middle' }, { fill: 'var(--fg)', fontSize: '12px', fontWeight: '600' });
        value.textContent = format(bar.value);
        chart.append(value);
      }
      // The whole column slot is the hover target, not just the thin bar.
      const hit = svg('rect', { x: cx - slot / 2, y: pad.top, width: slot, height: plotH }, { fill: 'transparent' });
      hit.addEventListener('pointerenter', () => {
        mark.style.opacity = '0.75';
        const bounds = chart.getBoundingClientRect();
        showTip(bar.tip || `${bar.label}: ${format(bar.value)}`, bounds.left + cx, bounds.top + top);
      });
      hit.addEventListener('pointerleave', () => { mark.style.opacity = '1'; hideTip(); });
      chart.append(hit);
    });
    chart.append(svg('line', { x1: pad.left, x2: pad.left + plotW, y1: pad.top + plotH, y2: pad.top + plotH }, { stroke: 'var(--border)', strokeWidth: '1' }));
    target.replaceChildren(chart);
  });
  return h('div', { class: 'chart-wrap' }, box,
    tableView(label, ['Week', 'Value'], bars.map((bar) => [bar.tip || bar.label, format(bar.value)])));
}
