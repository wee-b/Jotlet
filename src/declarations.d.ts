/// <reference types="@electron-forge/plugin-vite/forge-vite-env" />
declare module '*.css';

interface Window {
  jotletStorage?: import('./data-location').StorageAPI;
  jotletWindow?: import('./window-controls').WindowAPI;
  jotlet: import('./events').EventsAPI;
  jotletCalendar: import('./schedules').CalendarAPI;
}
