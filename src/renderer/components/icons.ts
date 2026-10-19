const icons: Record<string, string> = {
  note: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/>',
  pin: '<path d="m16 3 5 5-4 1-3 5v3l-3-3-5 3 3-5-3-3h3l5-3zM8 16l-5 5"/>',
  calendar:
    '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M16 3v4M8 3v4M3 11h18M8 15h2M14 15h2"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  import:
    '<path d="M12 3v12m-4-4 4 4 4-4M4 16v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4"/>',
  export:
    '<path d="M12 15V3m-4 4 4-4 4 4M4 16v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4"/>',
  trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  leaf: '<path d="M20 4C8 2 3 8 5 14s13 6 15-10ZM5 20l9-10"/>',
  arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
};
export const eventIcon = (name: string, className = '') =>
  `<svg class="icon ${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] ?? icons.note}</svg>`;

const paths: Record<string, string> = {
  calendar:
    '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 3v4m8-4v4M3 11h18M8 15h2m4 0h2"/>',
  grid: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M3 9h18M9 9v12m6-12v12"/>',
  week: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M9 3v18m6-18v18"/>',
  arrow: '<path d="m14 6-6 6 6 6"/>',
  down: '<path d="m7 10 5 5 5-5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  link: '<path d="m10 14 4-4m-6 6-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m2 2 1-1a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0" transform="translate(1 -1)"/>',
  text: '<path d="M4 6h16M4 12h16M4 18h10"/>',
  settings:
    '<path d="m9 3-.5 2-2 1-2-.5-2 3 1.5 1.5v3L2.5 15l2 3 2-.5 2 1L9 21h4l.5-2.5 2-1 2 .5 2-3-1.5-2v-3L19.5 8l-2-3-2 .5-2-1L13 3Z"/><circle cx="11" cy="12" r="3"/>',
  palette:
    '<path d="M12 3a9 9 0 1 0 0 18h1a2 2 0 0 0 1-3.7 1.5 1.5 0 0 1 1-2.8h2a4 4 0 0 0 4-4C21 6.4 17 3 12 3Z"/><circle cx="7.5" cy="10" r=".7"/><circle cx="10.5" cy="7" r=".7"/><circle cx="15" cy="7.5" r=".7"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  leaf: '<path d="M20 4C8 2 3 8 5 14s13 6 15-10ZM5 20l9-10"/>',
  timeline:
    '<path d="M5 4v16M5 7h5m-5 10h5"/><rect x="10" y="4" width="10" height="6" rx="2"/><rect x="10" y="14" width="10" height="6" rx="2"/>',
};
export const calendarIcon = (name: string, extra = '') =>
  `<svg class="cal-icon ${extra}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.calendar}</svg>`;
