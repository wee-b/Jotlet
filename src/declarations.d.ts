/// <reference types="@electron-forge/plugin-vite/forge-vite-env" />
declare module '*.css';

interface Window {
  jotletWindow?: { readonly integratedTitlebar: boolean };
  jotlet: import('./events').EventsAPI;
  jotletCalendar: import('./schedules').CalendarAPI;
}
