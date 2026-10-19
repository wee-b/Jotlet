import { calendarIcon as svg } from '../../components/icons';
import { scheduleColors } from '../../../shared/schedules';

export function calendarTemplate() {
  return `
    <aside class="cal-sidebar">
      <section class="mini-calendar" aria-label="迷你月历">
        <div class="mini-toolbar">
          <h2 id="mini-title"></h2>
          <div>
            <button class="cal-icon-button" id="mini-prev" aria-label="迷你月历上个月">${svg('arrow')}</button>
            <button class="cal-icon-button" id="mini-next" aria-label="迷你月历下个月">${svg('arrow', 'flipped')}</button>
          </div>
        </div>
        <div class="mini-weekdays">${['日', '一', '二', '三', '四', '五', '六'].map((day) => `<span>${day}</span>`).join('')}</div>
        <div id="mini-days" class="mini-days"></div>
      </section>
      <section class="day-agenda">
        <div class="sidebar-section-title">
          <h2 id="agenda-heading">当天日程</h2>
          <span id="agenda-count"></span>
        </div>
        <p id="agenda-date"></p>
        <div id="agenda-list"></div>
      </section>
      <div class="sidebar-bottom">
        <div class="calendar-note">
          ${svg('leaf')}
          <p>把时间，留给重要的事。<span>也给自己留一点空白。</span></p>
        </div>
        <span class="calendar-storage"><i></i>离线可用 · 数据只在本机</span>
      </div>
    </aside>
    <main class="calendar-main">
      <div class="calendar-toolbar">
        <div class="calendar-title-group">
          <h1>
            <label class="calendar-date-picker">
              <span id="calendar-title"></span>
              ${svg('down')}
              <input type="date" id="calendar-jump" aria-label="跳转到日期">
            </label>
          </h1>
        </div>
        <div class="calendar-navigation">
          <button class="cal-secondary" id="calendar-event-filter" aria-pressed="false">只显示事件</button>
          <button class="cal-secondary" id="calendar-today">今天</button>
          <div class="calendar-arrows">
            <button class="cal-icon-button" id="calendar-prev" aria-label="上一周">${svg('arrow')}</button>
            <button class="cal-icon-button" id="calendar-next" aria-label="下一周">${svg('arrow', 'flipped')}</button>
          </div>
          <span class="toolbar-divider"></span>
          <div class="calendar-view-switch" role="group" aria-label="日历视图">
            <button data-calendar-view="week" class="active" aria-pressed="true">${svg('week')}周</button>
            <button data-calendar-view="month" aria-pressed="false">${svg('grid')}月</button>
          </div>
        </div>
        <div class="calendar-page-actions">
          <button class="cal-primary" id="create-schedule" disabled>${svg('plus')}创建日程</button>
        </div>
      </div>
      <div id="calendar-error" role="alert" hidden></div>
      <section id="calendar-content" aria-label="周视图"></section>
      <footer class="calendar-footer"><span>${svg('plus')}点击空白处创建日程</span><span id="visible-schedule-count">0 个日程</span></footer>
    </main>
  `;
}

export function scheduleDialogTemplate() {
  return `
    <form id="schedule-form">
      <div class="schedule-dialog-header">
        <span class="schedule-dialog-tag">${svg('calendar')}<span id="schedule-dialog-title">新建日程</span></span>
        <button type="button" class="cal-icon-button" id="close-schedule" aria-label="关闭日程编辑">${svg('close')}</button>
      </div>
      <input id="schedule-title" class="schedule-title-input" aria-label="日程主题" maxlength="500" placeholder="为这段时间起个名字" required>
      <div class="schedule-form-row time-row">
        ${svg('clock')}
        <div class="schedule-fields">
          <div class="all-day-field">
            <label>
              <input type="checkbox" id="schedule-all-day">
              全天日程
            </label>
            <span>本地时间</span>
          </div>
          <div class="schedule-time-range">
            <label>
              <span>开始</span>
              <input id="schedule-start" type="datetime-local" required>
            </label>
            <span class="range-dash">—</span>
            <label>
              <span>结束</span>
              <input id="schedule-end" type="datetime-local" required>
            </label>
          </div>
        </div>
      </div>
      <div class="schedule-form-row">
        ${svg('link')}
        <div class="schedule-fields">
          <label class="schedule-field-label" for="schedule-event">绑定事件 <span>可选</span></label>
          <select id="schedule-event">
            <option value="">不绑定事件（独立日程）</option>
          </select>
          <div id="schedule-new-event" hidden>
            <label class="schedule-field-label" for="schedule-new-event-title">新事件名称</label>
            <div class="schedule-new-event-controls">
              <input id="schedule-new-event-title" type="text" maxlength="500" placeholder="给新事件起个名字">
              <button type="button" class="cal-secondary" id="schedule-create-event">创建并绑定</button>
            </div>
          </div>
          <p id="schedule-event-hint">直接保存即可创建独立日程，无需创建事件。</p>
          <button type="button" id="open-linked-event" class="cal-text-button" hidden>查看事件追踪 ↗</button>
        </div>
      </div>
      <div class="schedule-form-row">
        ${svg('text')}
        <div class="schedule-fields">
          <label class="schedule-field-label" for="schedule-description">描述 <span>可选</span></label>
          <textarea id="schedule-description" maxlength="100000" placeholder="添加一些备注、想法或准备事项…" rows="3"></textarea>
        </div>
      </div>
      <div class="schedule-form-row">
        ${svg('palette')}
        <fieldset class="schedule-fields schedule-color-picker">
          <legend class="schedule-field-label">日程颜色</legend>
          <div class="schedule-color-options">${Object.entries(scheduleColors)
            .map(
              ([key, name]) =>
                `<label class="schedule-color-option"><input class="sr-only" type="radio" name="schedule-color" value="${key}" ${key === 'sage' ? 'checked' : ''}><span class="schedule-color-dot schedule-color-${key}">${svg('check')}</span><span>${name}</span></label>`,
            )
            .join('')}</div>
        </fieldset>
      </div>
      <p id="schedule-form-error" class="schedule-form-error" role="alert" hidden></p>
      <div class="schedule-dialog-footer">
        <button type="button" id="remove-schedule" class="cal-text-button cal-danger" hidden>删除日程</button>
        <span class="schedule-save-hint">${svg('check')}保存到本机</span>
        <div>
          <button type="button" id="cancel-schedule" class="cal-secondary">取消</button>
          <button type="submit" id="save-schedule" class="cal-primary">保存日程</button>
        </div>
      </div>
    </form>
  `;
}

export function deleteScheduleTemplate() {
  return `
    <h2 id="schedule-delete-title">删除这个日程？</h2>
    <p>此操作无法撤销，关联的事件和时间线会保留。</p>
    <p class="schedule-form-error" id="schedule-delete-error" role="alert" hidden></p>
    <div>
      <button class="cal-secondary" id="cancel-schedule-delete">取消</button>
      <button class="cal-primary cal-delete-button" id="confirm-schedule-delete">删除日程</button>
    </div>
  `;
}
