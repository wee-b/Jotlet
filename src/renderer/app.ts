import { createEventsPage } from './pages/events/page';
import { createCalendar } from './pages/calendar/page';
import { createSettings } from './pages/settings/page';
import { bindDataActions } from './pages/settings/data-actions';
import { createNavigation } from './components/navigation';
import { mountOverlays, notify } from './components/overlays';
import { calendarIcon } from './components/icons';
import { errorText } from './utils/result';

type Page = 'calendar' | 'events' | 'settings';

export function startApp() {
  mountOverlays();
  const navigation = createNavigation(notify);
  let calendar: ReturnType<typeof createCalendar>;
  const events = createEventsPage({ changed: () => calendar?.refresh() });
  calendar = createCalendar({
    getEvents: events.getEvents,
    createEvent: events.createLinkedEvent,
    openEvent: events.openEvent,
    navigate,
    notify,
  });
  const settings = createSettings({
    getPreferences: calendar.getPreferences,
    save: calendar.savePreferences,
    back: () => {
      void navigate('calendar');
    },
    beforeDataChange: events.flush,
  });
  const parser = bindDataActions({
    run: events.run,
    flush: events.flush,
    notify,
    imported(summary) {
      document
        .querySelectorAll<HTMLDialogElement>('dialog[open]')
        .forEach((dialog) => {
          if (dialog.id !== 'backup-parser') dialog.close();
        });
      events.replaceEvents(summary.events, summary.dataPath);
      if (summary.schedules) calendar.replaceSchedules(summary.schedules);
      settings.refresh();
    },
  });
  window.jotletBackup?.onOpenFile(
    (filePath) => void parser.open(filePath, true),
  );
  void Promise.all([events.initialized, calendar.initialized]).then(() =>
    window.jotletBackup?.ready(),
  );

  for (const selector of ['.calendar-storage', '.sidebar-footer']) {
    const button = document.createElement('button');
    button.className = 'settings-entry';
    button.innerHTML = `${calendarIcon('settings')}<span>设置</span><span>›</span>`;
    button.addEventListener('click', () => {
      void navigate('settings');
    });
    document.querySelector(selector)!.before(button);
  }
  navigation
    .querySelectorAll<HTMLButtonElement>('[data-page]')
    .forEach((button) => {
      button.addEventListener('click', () => {
        void navigate(button.dataset.page as Page);
      });
    });
  navigation.querySelector('.cal-brand')!.addEventListener('click', (event) => {
    event.preventDefault();
    void navigate('calendar');
  });

  events.root.hidden = true;
  document.body.classList.add('calendar-active');

  async function navigate(page: Page) {
    try {
      await events.flush();
      calendar.cancelSelection();
      events.root.hidden = page !== 'events';
      calendar.root.hidden = page !== 'calendar';
      settings.root.hidden = page !== 'settings';
      document.body.classList.toggle('calendar-active', page === 'calendar');
      navigation
        .querySelectorAll<HTMLButtonElement>('[data-page]')
        .forEach((button) => {
          button.classList.toggle('active', button.dataset.page === page);
          button.setAttribute(
            'aria-current',
            button.dataset.page === page ? 'page' : 'false',
          );
        });
      if (page === 'settings') settings.refresh();
      if (page === 'calendar') calendar.refresh();
    } catch (error) {
      notify(errorText(error), true);
    }
  }
}
