import { chronological } from '../../../shared/events';
import type { EventRecord } from '../../../shared/events';
import { eventIcon as icon } from '../../components/icons';

interface TimelineOptions {
  add(): void;
  edit(id: string): void;
  remove(id: string): void;
  formatDate(value: string): string;
}

export function createTimeline(root: HTMLElement, options: TimelineOptions) {
  const $ = (selector: string) => root.querySelector<HTMLElement>(selector)!;
  const longDate = options.formatDate;
  function layoutTimeline() {
    const timeline = $('#timeline');
    const width = timeline.clientWidth;
    const columns = Math.max(1, Math.min(4, Math.floor((width + 28) / 216)));
    timeline.style.setProperty('--timeline-columns', String(columns));
    timeline.dataset.columns = String(columns);
    const nodes = [...timeline.querySelectorAll<HTMLElement>('.timeline-node')];
    nodes.forEach((node, index) => {
      node.classList.toggle('row-end', (index + 1) % columns === 0);
      node.classList.toggle('last-node', index === nodes.length - 1);
    });
  }
  function render(event: EventRecord) {
    const entries = chronological(event.entries);
    const timeline = $('#timeline');
    timeline.replaceChildren();
    $('#entry-count').textContent = `${entries.length} 个节点`;
    $('#timeline-empty').hidden = !!entries.length;
    for (const [index, entry] of entries.entries()) {
      const node = document.createElement('article');
      node.className = 'timeline-node';
      node.setAttribute('role', 'listitem');
      const step = document.createElement('div');
      step.className = 'timeline-step';
      const number = document.createElement('span');
      number.textContent = String(index + 1).padStart(2, '0');
      const time = document.createElement('time');
      time.dateTime = entry.occurredAt;
      time.textContent = longDate(entry.occurredAt);
      step.append(number, time);
      const body = document.createElement('div');
      body.className = 'timeline-card';
      const content = document.createElement('p');
      content.className = 'timeline-content';
      content.textContent = entry.content || '（原始空白记录）';
      const footer = document.createElement('div');
      footer.className = 'timeline-card-footer';
      const label = document.createElement('span');
      label.textContent = index === 0 ? '最初的进展' : '事件进展';
      const actions = document.createElement('div');
      const edit = document.createElement('button');
      edit.className = 'entry-edit';
      edit.textContent = '编辑';
      edit.setAttribute('aria-label', `编辑第 ${index + 1} 个节点`);
      edit.addEventListener('click', () => options.edit(entry.id));
      const remove = document.createElement('button');
      remove.className = 'entry-delete icon-button danger';
      remove.innerHTML = icon('trash');
      remove.setAttribute('aria-label', `删除第 ${index + 1} 个节点`);
      remove.title = '删除节点';
      remove.addEventListener('click', () => options.remove(entry.id));
      actions.append(edit, remove);
      footer.append(label, actions);
      body.append(content, footer);
      node.append(step, body);
      timeline.append(node);
    }
    if (!event.endedAt) {
      const add = document.createElement('button');
      add.className = 'add-timeline';
      add.innerHTML = `${icon('plus')}<strong>接下来，发生了什么？</strong><span>追加一个新的时间节点</span>`;
      add.addEventListener('click', () => options.add());
      timeline.append(add);
    }
    layoutTimeline();
  }

  new ResizeObserver(layoutTimeline).observe(root);
  return { render };
}
