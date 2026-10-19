import type { ImportSummary } from '../../../shared/events';
import { unwrap } from '../../utils/result';

interface DataActions {
  run(operation: () => Promise<void>): Promise<void>;
  flush(): Promise<void>;
  imported(summary: ImportSummary): void;
  notify(text: string, error?: boolean): void;
}
export function bindDataActions(options: DataActions) {
  const api = window.jotlet;
  const $ = <T extends HTMLElement = HTMLElement>(selector: string) =>
    document.querySelector<T>(selector)!;
  $('.import-button').addEventListener('click', () => {
    void options.run(async () => {
      await options.flush();
      const summary = unwrap(await api.importEvents());
      if (!summary) return;
      options.imported(summary);
      options.notify(
        summary.directory
          ? `已导入 ${summary.events.length} 个事件、${summary.schedules?.length ?? 0} 个日程，保存位置已切换到 ${summary.directory}`
          : `导入完成：新增 ${summary.added} 个事件，跳过 ${summary.skipped} 个重复事件`,
      );
    });
  });
  document.querySelectorAll<HTMLElement>('[data-export]').forEach((button) =>
    button.addEventListener('click', () => {
      $<HTMLDetailsElement>('.export-menu').open = false;
      void options.run(async () => {
        await options.flush();
        const output = unwrap(
          await api.exportEvents(
            button.dataset.export as 'jotlet' | 'json' | 'markdown',
          ),
        );
        if (output) options.notify(`已导出到 ${output}`);
      });
    }),
  );
  $('.data-info').addEventListener('click', () =>
    $<HTMLDialogElement>('#info-dialog').showModal(),
  );
  $('#close-info').addEventListener('click', () =>
    $<HTMLDialogElement>('#info-dialog').close(),
  );
  document.addEventListener('click', (event) => {
    if (!(event.target as Element).closest('.export-menu'))
      $<HTMLDetailsElement>('.export-menu').open = false;
  });
}
