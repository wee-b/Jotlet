import type { Result } from './events';

export interface WindowState {
  maximized: boolean;
}
export interface WindowAPI {
  readonly integratedTitlebar: boolean;
  command(action: 'minimize' | 'maximize' | 'close'): Promise<Result<void>>;
  getState(): Promise<Result<WindowState>>;
  onStateChange(listener: (state: WindowState) => void): () => void;
}

export function createWindowControls(
  header: HTMLElement,
  notify: (text: string, error?: boolean) => void,
) {
  const api = window.jotletWindow;
  if (!api?.integratedTitlebar || !api.onStateChange) return;
  const group = document.createElement('div');
  group.className = 'window-controls';
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', '窗口控制');
  const paths = {
    minimize: '<path d="M2 6h8"/>',
    maximize: '<rect x="2" y="2" width="8" height="8" rx=".5"/>',
    restore:
      '<path d="M4 3V1.5h6.5V8H9"/><rect x="1.5" y="4" width="6.5" height="6.5" rx=".5"/>',
    close: '<path d="m2 2 8 8M10 2l-8 8"/>',
  };
  const icon = (name: keyof typeof paths) =>
    `<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1" aria-hidden="true">${paths[name]}</svg>`;
  let maximizeButton: HTMLButtonElement;
  for (const [action, label] of [
    ['minimize', '最小化'],
    ['maximize', '最大化'],
    ['close', '关闭窗口'],
  ] as const) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `window-control window-${action}`;
    button.title = label;
    button.setAttribute('aria-label', label);
    button.innerHTML = icon(action);
    button.addEventListener('click', () => {
      void api
        .command(action)
        .then((result) => {
          if (!result.ok) notify(result.error, true);
        })
        .catch(() => notify('窗口操作失败，请重试。', true));
    });
    if (action === 'maximize') maximizeButton = button;
    group.append(button);
  }
  header.append(group);
  const update = (state: WindowState) => {
    const label = state.maximized ? '还原窗口' : '最大化';
    maximizeButton.title = label;
    maximizeButton.setAttribute('aria-label', label);
    maximizeButton.innerHTML = icon(state.maximized ? 'restore' : 'maximize');
  };
  const unsubscribe = api.onStateChange(update);
  window.addEventListener('unload', unsubscribe, { once: true });
  void api
    .getState()
    .then((result) => {
      if (result.ok) update(result.data);
    })
    .catch(() => {});
}
