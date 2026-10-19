import { contextBridge, ipcRenderer } from 'electron';
import type { EventsAPI } from './events';
import type { CalendarAPI } from './schedules';

contextBridge.exposeInMainWorld('jotletWindow', {
  integratedTitlebar: process.platform === 'win32',
});

const api: EventsAPI = {
  load: () => ipcRenderer.invoke('events:load'),
  save: (event) => ipcRenderer.invoke('events:save', event),
  remove: (id) => ipcRenderer.invoke('events:remove', id),
  importEvents: () => ipcRenderer.invoke('events:import'),
  exportEvents: (format) => ipcRenderer.invoke('events:export', format),
};

contextBridge.exposeInMainWorld('jotlet', api);
const calendar: CalendarAPI = {
  load: () => ipcRenderer.invoke('calendar:load'),
  save: (schedule) => ipcRenderer.invoke('calendar:save', schedule),
  remove: (id) => ipcRenderer.invoke('calendar:remove', id),
};
contextBridge.exposeInMainWorld('jotletCalendar', calendar);
