import { eventIcon as icon } from './icons';

export function mountOverlays() {
  const fragment = document.createElement('template');
  fragment.innerHTML = `
    <div id="toast" role="status" hidden></div>
    <dialog id="info-dialog">
      <span class="dialog-icon green">${icon('leaf')}</span>
      <h2>每件事的经过，都留在本机。</h2>
      <p>事件包含起止时间和多个进展节点，无需账号或云服务。换设备或重装前，请在设置中导出 .jotlet 完整备份。</p>
      <label class="path-label">当前数据文件</label>
      <code id="data-path"></code>
      <p class="info-small">.jotlet 完整保留事件、记录、日程、颜色与关联关系；仅支持导入 .jotlet 文件。导入后选择一个没有 Jotlet 数据的文件夹作为新的保存位置。</p>
      <p class="info-small">导入成功后使用备份中的数据，原文件夹中的数据保留；取消或导入失败时继续使用原位置。备份未加密，删除事件会同时删除其中所有节点。</p>
      <p class="info-small">可在设置中更改数据保存文件夹。日程单独存于 calendar.json，.jotlet 导出会一并打包；兼容 JSON 与 Markdown 导出仅包含事件和记录。</p>
      <button id="close-info" class="primary">知道了</button>
    </dialog>
  `;
  document.body.append(fragment.content);
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;
export function notify(text: string, error = false) {
  const toast = document.querySelector<HTMLElement>('#toast')!;
  toast.textContent = text;
  toast.classList.toggle('error', error);
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(
    () => {
      toast.hidden = true;
    },
    error ? 9000 : 4500,
  );
}
