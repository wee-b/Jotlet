import { eventIcon as icon } from '../../components/icons';

export function eventsTemplate() {
  return `
    <aside class="sidebar">
      <button class="new-event primary" disabled>${icon('plus')}<span>新建事件</span><kbd>Ctrl N</kbd></button>
      <div class="nav-label">我的事件</div>
      <nav aria-label="事件分类">
        <button class="nav-item active" data-filter="all">${icon('note')}<span>所有事件</span><span class="count" id="count-all">0</span></button>
        <button class="nav-item" data-filter="active">${icon('calendar')}<span>进行中</span><span class="count" id="count-active">0</span></button>
        <button class="nav-item" data-filter="finished">${icon('check')}<span>已结束</span><span class="count" id="count-finished">0</span></button>
        <button class="nav-item" data-filter="pinned">${icon('pin')}<span>已置顶</span><span class="count" id="count-pinned">0</span></button>
      </nav>
      <div class="sidebar-spacer"></div>
      <div class="local-card">
        <span class="local-icon">${icon('leaf')}</span>
        <strong>把过程，也留在这里</strong>
        <p>从最初的念头，到后来的进展。<br>一个事件，串起一段时间。</p>
        <span class="local-badge"><i></i> 全部保存在本机</span>
      </div>
      <div class="sidebar-footer">JOTLET <span>慢慢记，看见变化。</span></div>
    </aside>
    <main>
      <section class="workspace">
        <section class="event-list-panel" aria-label="事件列表">
          <div class="list-toolbar">
            <label class="search-box">
              ${icon('search')}
              <input id="search" type="search" placeholder="搜索事件或进展…" aria-label="搜索事件">
              <kbd>Ctrl K</kbd>
            </label>
            <div class="list-caption"><span id="result-count">正在加载…</span><span>置顶优先 · 最近更新</span></div>
          </div>
          <div id="event-list" class="event-list"></div>
          <div class="list-footer">每一次进展，都是故事的一部分。</div>
        </section>
        <section class="editor-panel" aria-label="事件追踪">
          <div id="empty-state" class="empty-state">
            <div class="empty-art">${icon('calendar')}<span class="art-spark">✳</span></div>
            <div class="eyebrow">FROM A MOMENT TO A STORY</div>
            <h2>一件事，一条时间线。</h2>
            <p>给正在发生的事一个名字，<br>把每一步进展，按时间串起来。</p>
            <button class="new-event primary" disabled>${icon('plus')} 创建第一个事件 ${icon('arrow')}</button>
            <span class="empty-hint">本地保存 · 持续追加 · 随时回顾</span>
          </div>
          <div id="event-detail" hidden>
            <div class="event-heading">
              <div class="event-title-row">
                <label class="sr-only" for="event-title">事件名称</label>
                <input id="event-title" maxlength="500" placeholder="给这件事起个名字…" autocomplete="off">
                <div class="editor-actions">
                  <button id="pin-event" class="icon-button" aria-label="置顶事件" title="置顶事件">${icon('pin')}</button>
                  <span class="divider"></span>
                  <button id="delete-event" class="icon-button danger" aria-label="删除事件" title="删除事件">${icon('trash')}</button>
                </div>
              </div>
              <div class="event-meta">
                <span id="event-status" class="event-badge"></span>
                <button id="event-dates" title="修改事件起止时间"></button>
                <button id="finish-event" class="finish-button"></button>
              </div>
            </div>
            <div class="timeline-scroll">
              <div class="timeline-heading">
                <div>
                  <h2>事件追踪 <span id="entry-count">0 个节点</span></h2>
                </div>
                <button id="add-entry" class="primary">${icon('plus')} 添加记录</button>
              </div>
              <div id="timeline-empty" class="timeline-empty">
                <span>${icon('note')}</span>
                <h3>故事从第一步开始</h3>
                <p>记下此刻的进展，或者补录过去发生的事。</p>
              </div>
              <div id="timeline" class="timeline" role="list" aria-label="按发生时间排列的节点"></div>
            </div>
            <footer class="editor-footer">
              <button id="save-state" title="点击重试保存" aria-live="polite">已保存到本机</button>
              <span id="timeline-caption">从开始到现在</span>
            </footer>
          </div>
        </section>
      </section>
    </main>
    <dialog id="entry-dialog" class="entry-dialog">
      <form id="entry-form">
        <div class="dialog-eyebrow">A NEW MOMENT IN THIS STORY</div>
        <h2 id="entry-dialog-title">添加记录</h2>
        <label class="field-label" for="entry-time">发生时间</label>
        <input class="field-input" id="entry-time" type="datetime-local" step="1" required>
        <label class="field-label" for="entry-content">发生了什么</label>
        <textarea class="field-input entry-text" id="entry-content" maxlength="1000000" placeholder="记下事情的进展、决定，或是一个新的发现…" required></textarea>
        <p class="form-hint">可以补录过去的进展，保存后会自动按发生时间排序。</p>
        <p id="entry-error" class="form-error" role="alert" hidden></p>
        <div class="dialog-actions">
          <button type="button" id="cancel-entry" class="secondary">取消</button>
          <button type="submit" id="save-entry" class="primary">保存记录</button>
        </div>
      </form>
    </dialog>
    <dialog id="dates-dialog">
      <form id="dates-form">
        <h2>事件的起止时间</h2>
        <label class="field-label" for="event-start">开始时间</label>
        <input class="field-input" id="event-start" type="datetime-local" step="1" required>
        <label class="field-label" for="event-end">结束时间 <span>留空表示进行中</span></label>
        <input class="field-input" id="event-end" type="datetime-local" step="1">
        <p class="form-hint">起止时间需包含已有的全部时间节点。</p>
        <p id="dates-error" class="form-error" role="alert" hidden></p>
        <div class="dialog-actions">
          <button type="button" id="cancel-dates" class="secondary">取消</button>
          <button type="submit" id="save-dates" class="primary">保存时间</button>
        </div>
      </form>
    </dialog>
    <dialog id="delete-dialog">
      <span class="dialog-icon">${icon('trash')}</span>
      <h2 id="delete-title">删除这个事件？</h2>
      <p id="delete-description"></p>
      <div class="dialog-actions">
        <button id="cancel-delete" class="secondary">再想想</button>
        <button id="confirm-delete" class="danger-button">确认删除</button>
      </div>
    </dialog>
  `;
}
