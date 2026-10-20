import { createBackupParser } from './backup-parser';
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
  const parser = createBackupParser(options);
  $('.import-button').addEventListener('click', () => void parser.open());
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
  return parser;
}
