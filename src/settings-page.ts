import { defaultPreferences, parsePreferences } from './preferences';
import type { Preferences } from './preferences';
import { scheduleColors } from './schedules';
import './settings.css';

interface SettingsOptions {
  getPreferences(): Preferences;
  save(preferences: Preferences): void;
  back(): void;
  openData(): void;
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
    <section class="settings-card settings-data"><div><h2>数据与备份</h2><p>日程与事件保存在本机，离线也可使用。</p></div><button class="cal-secondary" id="settings-data">查看数据说明</button></section><footer class="settings-footer">Jotlet <span>让每件事，都有迹可循。</span></footer></div>`;
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
  $('#settings-data').addEventListener('click', options.openData);
  return {
    root,
    refresh() {
      fill(options.getPreferences());
      status('');
    },
  };
}
