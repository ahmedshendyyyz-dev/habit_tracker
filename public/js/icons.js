// Small 16px line icons, drawn in the current text colour.
const PATHS = {
  search: '<circle cx="7" cy="7" r="4.75"/><path d="M10.5 10.5 14 14"/>',
  plus: '<path d="M8 2.75v10.5M2.75 8h10.5"/>',
  chevron: '<path d="m4.5 6.25 3.5 3.5 3.5-3.5"/>',
  sun: '<circle cx="8" cy="8" r="2.75"/><path d="M8 1v1.5M8 13.5V15M1 8h1.5M13.5 8H15M3.05 3.05l1.06 1.06M11.89 11.89l1.06 1.06M3.05 12.95l1.06-1.06M11.89 4.11l1.06-1.06"/>',
  moon: '<path d="M13.25 9.6A5.75 5.75 0 0 1 6.4 2.75a5.75 5.75 0 1 0 6.85 6.85Z"/>',
  close: '<path d="m4 4 8 8M12 4l-8 8"/>',
  pin: '<path d="M8 14.25s4.75-4.1 4.75-7.75a4.75 4.75 0 0 0-9.5 0c0 3.65 4.75 7.75 4.75 7.75Z"/><circle cx="8" cy="6.5" r="1.6"/>',
  target: '<circle cx="8" cy="8" r="6.25"/><circle cx="8" cy="8" r="3.5"/><circle cx="8" cy="8" r=".9"/>',
  check: '<circle cx="8" cy="8" r="6.25"/><path d="m5.4 8.2 1.8 1.8 3.5-3.7"/>',
  circle: '<circle cx="8" cy="8" r="6.25"/>',
  book: '<path d="M2.75 3.25h3.5A1.75 1.75 0 0 1 8 5v8.25a1.5 1.5 0 0 0-1.5-1.5H2.75ZM13.25 3.25h-3.5A1.75 1.75 0 0 0 8 5v8.25a1.5 1.5 0 0 1 1.5-1.5h3.75Z"/>',
  box: '<path d="M2.75 4.75 8 2l5.25 2.75v6.5L8 14l-5.25-2.75Z"/><path d="M2.75 4.75 8 7.5l5.25-2.75M8 7.5V14"/>',
  tool: '<path d="M9.75 2.4a3.25 3.25 0 0 0 3.85 3.85L7.1 12.75a1.6 1.6 0 1 1-2.25-2.25l6.5-6.5a3.2 3.2 0 0 1-1.6-1.6Z"/>',
  briefcase: '<rect x="1.75" y="4.75" width="12.5" height="8.5" rx="1.25"/><path d="M5.75 4.75v-1.5a1 1 0 0 1 1-1h2.5a1 1 0 0 1 1 1v1.5M1.75 8.5h12.5"/>',
  pencil: '<path d="M11.1 2.4a1.4 1.4 0 0 1 2 2L5.5 12l-2.75.75L3.5 10Z"/>',
  link: '<path d="M6.75 9.25a2.5 2.5 0 0 0 3.55 0l2.2-2.2a2.5 2.5 0 0 0-3.55-3.55l-.7.7M9.25 6.75a2.5 2.5 0 0 0-3.55 0l-2.2 2.2a2.5 2.5 0 0 0 3.55 3.55l.7-.7"/>',
  minus: '<path d="M2.75 8h10.5"/>',
  checkSmall: '<path d="m3.5 8.5 3 3 6-7"/>',
  repeat: '<path d="M2.75 7.25v-1a2.5 2.5 0 0 1 2.5-2.5h7.5M10.5 1.5l2.25 2.25-2.25 2.25M13.25 8.75v1a2.5 2.5 0 0 1-2.5 2.5h-7.5M5.5 14.5l-2.25-2.25L5.5 10"/>',
  list: '<path d="M5.75 3.75h7.5M5.75 8h7.5M5.75 12.25h7.5M2.75 3.75h.01M2.75 8h.01M2.75 12.25h.01"/>',
  chevronLeft: '<path d="M9.75 4.5 6.25 8l3.5 3.5"/>',
  chevronRight: '<path d="m6.25 4.5 3.5 3.5-3.5 3.5"/>',
  home: '<path d="M2.75 7.25 8 2.75l5.25 4.5v6a1 1 0 0 1-1 1h-2.5v-4h-3.5v4h-2.5a1 1 0 0 1-1-1Z"/>',
  more: '<circle cx="3.5" cy="8" r=".9"/><circle cx="8" cy="8" r=".9"/><circle cx="12.5" cy="8" r=".9"/>',
  gear: '<circle cx="8" cy="8" r="2.25"/><path d="M8 1.75v1.5M8 12.75v1.5M1.75 8h1.5M12.75 8h1.5M3.6 3.6l1.05 1.05M11.35 11.35l1.05 1.05M3.6 12.4l1.05-1.05M11.35 4.65l1.05-1.05"/>',
  move: '<path d="M2.75 8h9.5M9 4.75 12.25 8 9 11.25"/>',
  download: '<path d="M8 2.75v7.5M4.75 7 8 10.25 11.25 7M2.75 13.25h10.5"/>',
  calendar: '<rect x="2.25" y="3.25" width="11.5" height="10.5" rx="1.25"/><path d="M2.25 6.5h11.5M5.5 1.75v3M10.5 1.75v3"/>',
};

export function icon(name, className = 'icon') {
  const span = document.createElement('span');
  span.className = className;
  span.setAttribute('aria-hidden', 'true');
  span.innerHTML = `<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${PATHS[name] || PATHS.circle}</svg>`;
  return span;
}

export const SECTION_ICONS = {
  tasks: 'calendar',
  habits: 'check',
  trips: 'pin',
  projects: 'box',
  bucket: 'check',
  goals: 'target',
  journal: 'book',
  reviews: 'calendar',
  profile: 'pencil',
};
