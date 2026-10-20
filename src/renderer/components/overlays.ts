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
      <p class="info-small">在设置中选择“解析与导入”，可选择或拖入 .jotlet 文件，查看解析结果后合并或覆盖。取消不会修改数据，覆盖前会再次确认，原数据文件会保留。备份未加密，删除事件会同时删除其中所有节点。</p>
      <p class="info-small">可在设置中更改数据保存文件夹。JSON 快照与对应的 .journal 增量日志共同保存最新数据，手动复制时请一并保留；.jotlet 导出会打包全部最新数据，JSON 与 Markdown 导出仅包含事件和记录。</p>
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
