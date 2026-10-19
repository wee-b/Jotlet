import { defaultPreferences, parsePreferences } from './preferences';
import type { Preferences } from './preferences';
import { scheduleColors } from './schedules';
import './settings.css';

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
  root.innerHTML = `
    <div class="settings-container"><header class="settings-heading"><div><div class="settings-eyebrow">让 Jotlet 更顺手</div><h1>设置</h1><p>按你的习惯，安排每一天。</p></div><button type="button" class="cal-secondary" id="settings-back">返回日历</button></header>
    <form id="settings-form"><section class="settings-card" aria-labelledby="settings-calendar-heading"><div class="settings-card-heading"><h2 id="settings-calendar-heading">日历偏好</h2><p>设置会保存在本机，下次打开时继续使用。</p></div>
      <div class="settings-row"><label for="settings-view">默认视图<span>打开日历时使用的视图</span></label><select id="settings-view"><option value="week">周视图</option><option value="month">月视图</option></select></div>
      <div class="settings-row"><label for="settings-duration">默认日程时长<span>用于顶部按钮和月视图新建；周视图单击仍为半小时</span></label><select id="settings-duration"><option value="30">30 分钟</option><option value="60">1 小时</option><option value="90">1 小时 30 分钟</option><option value="120">2 小时</option></select></div>
      <div class="settings-row"><label for="settings-hour">周视图起始时段<span>进入周视图时，自动滚动到这个整点</span></label><select id="settings-hour">${Array.from({ length: 24 }, (_, hour) => `<option value="${hour}">${String(hour).padStart(2, '0')}:00</option>`).join('')}</select></div>
      <div class="settings-row settings-colors-row"><div class="settings-row-label">默认日程颜色<span>每个日程都可以单独调整颜色</span></div><fieldset class="settings-colors"><legend class="sr-only">默认日程颜色</legend>${Object.entries(
        scheduleColors,
      )
        .map(
          ([key, name]) =>
            `<label class="schedule-color-option"><input type="radio" class="sr-only" name="settings-color" value="${key}"><span class="schedule-color-dot schedule-color-${key}"><svg class="cal-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg></span><span>${name}</span></label>`,
        )
        .join('')}</fieldset></div>
    </section><div class="settings-actions"><button class="cal-text-button" type="button" id="settings-reset">恢复默认</button><span id="settings-status" role="status" aria-live="polite"></span><button class="cal-primary" type="submit">保存设置</button></div></form>
    <section class="settings-card settings-data"><div class="settings-card-heading"><h2>数据与备份</h2><p>导出 .jetlet 完整备份，包含事件、记录、日程与关联关系。导入时选择新的保存文件夹，成功后自动切换。</p></div><div id="settings-transfer-actions" class="settings-data-tools"></div><div class="settings-storage"><div class="settings-row-label">文件保存位置<span>事件、日程和自动备份保存在此文件夹</span></div><code id="settings-storage-path">正在读取…</code><div class="settings-storage-actions"><p>更换文件夹时自动迁移现有数据，原位置保留副本，立即生效。</p><button type="button" class="cal-secondary" id="settings-storage-change">更改文件夹</button></div><p id="settings-storage-status" role="status" aria-live="polite"></p></div></section><footer class="settings-footer">Jotlet <span>让每件事，都有迹可循。</span></footer></div>`;
  document.body.append(root);
  // Reuse the existing controls and their import/export handlers in Settings.
  const transfer = root.querySelector('#settings-transfer-actions')!;
  for (const selector of ['.import-button', '.export-menu', '.data-info']) {
    const control = document.querySelector<HTMLElement>(selector)!;
    transfer.append(control);
  }
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
