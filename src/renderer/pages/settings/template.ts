import { eventIcon as icon } from '../../components/icons';
import { scheduleColors } from '../../../shared/schedules';

export function settingsTemplate() {
  return `
    <div class="settings-container">
      <header class="settings-heading">
        <div>
          <div class="settings-eyebrow">让 Jotlet 更顺手</div>
          <h1>设置</h1>
          <p>按你的习惯，安排每一天。</p>
        </div>
      </header>
      <form id="settings-form">
        <section class="settings-card" aria-labelledby="settings-calendar-heading">
          <div class="settings-card-heading">
            <h2 id="settings-calendar-heading">日历偏好</h2>
            <p>设置会保存在本机，下次打开时继续使用。</p>
          </div>
          <div class="settings-row">
            <label for="settings-view">默认视图<span>打开日历时使用的视图</span></label>
            <select id="settings-view">
              <option value="week">周视图</option>
              <option value="month">月视图</option>
            </select>
          </div>
          <div class="settings-row">
            <label for="settings-duration">默认日程时长<span>用于顶部按钮和月视图新建；周视图单击仍为半小时</span></label>
            <select id="settings-duration">
              <option value="30">30 分钟</option>
              <option value="60">1 小时</option>
              <option value="90">1 小时 30 分钟</option>
              <option value="120">2 小时</option>
            </select>
          </div>
          <div class="settings-row">
            <label for="settings-hour">周视图起始时段<span>进入周视图时，自动滚动到这个整点</span></label>
            <select id="settings-hour">${Array.from({ length: 24 }, (_, hour) => `<option value="${hour}">${String(hour).padStart(2, '0')}:00</option>`).join('')}</select>
          </div>
          <div class="settings-row settings-colors-row">
            <div class="settings-row-label">默认日程颜色<span>每个日程都可以单独调整颜色</span></div>
            <fieldset class="settings-colors">
              <legend class="sr-only">默认日程颜色</legend>
              ${Object.entries(scheduleColors)
                .map(
                  ([key, name]) =>
                    `<label class="schedule-color-option"><input type="radio" class="sr-only" name="settings-color" value="${key}"><span class="schedule-color-dot schedule-color-${key}"><svg class="cal-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg></span><span>${name}</span></label>`,
                )
                .join('')}
            </fieldset>
          </div>
        </section>
      </form>
      <section class="settings-card settings-data">
        <div class="settings-card-heading">
          <h2>数据与备份</h2>
          <p>导出 .jotlet 完整备份，包含事件、记录、日程与关联关系。导入前先解析预览，再选择合并或覆盖当前数据。</p>
        </div>
        <div id="settings-transfer-actions" class="settings-data-tools">
          <button class="import-button" disabled>${icon('import')} 解析与导入 <span>.jotlet</span></button>
          <button class="export-button" data-export disabled>${icon('export')} 导出备份 <span>.jotlet</span></button>
          <button class="data-info">${icon('note')} 数据与备份 <span>↗</span></button>
        </div>
        <div class="settings-storage">
          <div class="settings-row-label">文件保存位置<span>事件、日程和自动备份保存在此文件夹</span></div>
          <code id="settings-storage-path">正在读取…</code>
          <div class="settings-storage-actions">
            <p>更换文件夹时自动迁移现有数据，原位置保留副本，立即生效。</p>
            <button type="button" class="cal-secondary" id="settings-storage-change">更改文件夹</button>
          </div>
          <p id="settings-storage-status" role="status" aria-live="polite"></p>
        </div>
      </section>
      <div class="settings-actions">
        <button class="cal-text-button" type="button" id="settings-reset">恢复默认</button>
        <span id="settings-status" role="status" aria-live="polite"></span>
        <div class="settings-action-buttons">
          <button type="button" class="cal-secondary" id="settings-back">返回日历</button>
          <button class="cal-primary" type="submit" form="settings-form">保存设置</button>
        </div>
      </div>
      <footer class="settings-footer">Jotlet <span>让每件事，都有迹可循。</span></footer>
    </div>
  `;
}
