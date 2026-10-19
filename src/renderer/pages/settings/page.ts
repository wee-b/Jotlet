import { settingsTemplate } from './template';
import { defaultPreferences, parsePreferences } from './preferences';
import type { Preferences } from './preferences';

interface SettingsOptions {
  getPreferences(): Preferences;
  save(preferences: Preferences): void;
  back(): void;
  beforeDataChange(): Promise<void>;
}

export function createSettings(options: SettingsOptions) {
  const root = document.createElement('main');
  root.id = 'settings-app';
  root.hidden = true;
  root.innerHTML = settingsTemplate();
  document.body.append(root);
  const $ = <T extends HTMLElement = HTMLElement>(selector: string) =>
    root.querySelector<T>(selector)!;
  function fill(preferences: Preferences) {
    $<HTMLSelectElement>('#settings-view').value = preferences.defaultView;
    $<HTMLSelectElement>('#settings-duration').value = String(
      preferences.defaultDuration,
    );
    $<HTMLSelectElement>('#settings-hour').value = String(
      preferences.weekStartHour,
    );
    $<HTMLInputElement>(
      `input[name="settings-color"][value="${preferences.defaultColor}"]`,
    ).checked = true;
  }
  function status(message: string, error = false) {
    $('#settings-status').textContent = message;
    $('#settings-status').classList.toggle('error', error);
  }
  $('#settings-form').addEventListener('submit', (event) => {
    event.preventDefault();
    try {
      options.save(
        parsePreferences({
          defaultView: $<HTMLSelectElement>('#settings-view').value,
          defaultDuration: Number(
            $<HTMLSelectElement>('#settings-duration').value,
          ),
          weekStartHour: Number($<HTMLSelectElement>('#settings-hour').value),
          defaultColor: $<HTMLInputElement>(
            'input[name="settings-color"]:checked',
          ).value,
        }),
      );
      status('设置已保存');
    } catch {
      status('设置保存失败，请重试。', true);
    }
  });
  $('#settings-form').addEventListener('change', () =>
    status('有未保存的修改'),
  );
  $('#settings-reset').addEventListener('click', () => {
    fill({ ...defaultPreferences });
    status('已恢复默认，点击“保存设置”后生效');
  });
  $('#settings-back').addEventListener('click', options.back);
  let changingLocation = false;
  function storageStatus(text: string, error = false) {
    $('#settings-storage-status').textContent = text;
    $('#settings-storage-status').classList.toggle('error', error);
  }
  async function loadLocation() {
    const api = window.jotletStorage;
    $<HTMLButtonElement>('#settings-storage-change').disabled =
      !api || changingLocation;
    if (!api) {
      $('#settings-storage-path').textContent =
        '请通过 Jotlet 桌面应用设置保存位置';
      return;
    }
    try {
      const result = await api.getLocation();
      if (!result.ok) throw new Error(result.error);
      $('#settings-storage-path').textContent = result.data.directory;
      document.querySelector('#data-path')!.textContent =
        result.data.eventsPath;
    } catch (error) {
      storageStatus(
        error instanceof Error ? error.message : '无法读取保存位置。',
        true,
      );
    }
  }
  $('#settings-storage-change').addEventListener('click', () => {
    if (changingLocation || !window.jotletStorage) return;
    changingLocation = true;
    $<HTMLButtonElement>('#settings-storage-change').disabled = true;
    storageStatus('请选择文件夹，完成迁移前请保持应用打开。');
    void (async () => {
      try {
        await options.beforeDataChange();
        const result = await window.jotletStorage!.chooseLocation();
        if (!result.ok) throw new Error(result.error);
        if (!result.data) {
          storageStatus('');
          return;
        }
        $('#settings-storage-path').textContent = result.data.directory;
        document.querySelector('#data-path')!.textContent =
          result.data.eventsPath;
        storageStatus('保存位置已更新，后续修改将保存在此文件夹。');
      } catch (error) {
        storageStatus(
          error instanceof Error
            ? error.message
            : '更换保存位置失败，仍使用原位置。',
          true,
        );
      } finally {
        changingLocation = false;
        $<HTMLButtonElement>('#settings-storage-change').disabled = false;
      }
    })();
  });
  return {
    root,
    refresh() {
      fill(options.getPreferences());
      status('');
      void loadLocation();
    },
  };
}
