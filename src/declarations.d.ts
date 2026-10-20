/// <reference types="@electron-forge/plugin-vite/forge-vite-env" />
declare module '*.css';

interface Window {
  jotletBackup: import('./shared/api').BackupAPI;
  jotletStorage?: import('./shared/api').StorageAPI;
  jotletWindow?: import('./shared/api').WindowAPI;
  jotlet: import('./shared/api').EventsAPI;
  jotletCalendar: import('./shared/api').CalendarAPI;
}
