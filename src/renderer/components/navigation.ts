import { calendarIcon as svg } from './icons';
import { createWindowControls } from './window-controls';
export function createNavigation(
  notify: (text: string, error?: boolean) => void,
) {
  document.documentElement.classList.toggle(
    'integrated-titlebar',
    !!window.jotletWindow?.integratedTitlebar,
  );
  const header = document.createElement('header');
  header.className = 'app-topbar';
  header.innerHTML = `
    <a class="cal-brand" href="#" aria-label="Jotlet 日历首页"><span class="cal-brand-mark">${svg('leaf')}</span>Jotlet<span class="cal-brand-period">.</span></a>
    <nav class="app-pages" aria-label="页面导航">
      <button data-page="calendar" class="active">${svg('calendar')}日历</button>
      <button data-page="events">${svg('timeline')}事件</button>
    </nav>
  `;
  document.body.prepend(header);
  createWindowControls(header, notify);
  return header;
}
