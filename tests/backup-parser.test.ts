import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import { errorText, unwrap } from '../src/renderer/utils/result.ts';
import type { BackupPreview } from '../src/shared/import.ts';

const source = await readFile(
  new URL('../src/renderer/pages/settings/backup-parser.ts', import.meta.url),
  'utf8',
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

function fixture() {
  // Model controls and events only; run the real parser without a desktop session.
  class Element extends EventTarget {
    textContent = '';
    innerHTML = '';
    id = '';
    hidden = false;
    disabled = false;
    open = false;
    classList = { toggle() {}, add() {}, remove() {} };
    children: Element[] = [];
    elements = new Map<string, Element>();
    querySelector(selector: string): Element {
      if (!this.elements.has(selector)) {
        const element = new Element();
        element.hidden = [
          '#backup-result',
          '#backup-replace-confirm',
          '#backup-orphans',
        ].includes(selector);
        this.elements.set(selector, element);
      }
      return this.elements.get(selector)!;
    }
    setAttribute() {}
    append(element: Element) {
      this.children.push(element);
    }
    replaceChildren(...elements: Element[]) {
      this.children = elements;
    }
    focus() {}
    scrollIntoView() {}
    showModal() {
      this.open = true;
    }
    close() {
      this.open = false;
    }
    click() {
      if (!this.disabled) this.dispatchEvent(new Event('click'));
    }
  }
  const body = new Element();
  const document = {
    body,
    createElement: () => new Element(),
    addEventListener() {},
  };
  let preview: BackupPreview = {
    token: 'recovery',
    filePath: 'backup.jotlet',
    fileName: 'backup.jotlet',
    exportedAt: '2026-10-22T01:00:00.000Z',
    events: 1,
    entries: 2,
    schedules: 3,
    orphanSchedules: 0,
    localError: '本地数据读取失败，原文件已保留。',
    currentEvents: null,
    currentSchedules: null,
    eventMerge: null,
    scheduleMerge: null,
    eventSamples: [{ title: '恢复事件', entries: 2 }],
    scheduleSamples: [],
  };
  const commits: string[][] = [];
  const discarded: string[] = [];
  let imported = 0;
  const success = { ok: true, data: undefined };
  const window = {
    jotletBackup: {
      busy: async () => success,
      ready: async () => success,
      analyze: async () => ({ ok: true, data: structuredClone(preview) }),
      discard: async (token: string) => {
        discarded.push(token);
        return success;
      },
      commit: async (token: string, mode: string) => {
        commits.push([token, mode]);
        return { ok: true, data: { events: [], schedules: [] } };
      },
    },
  };
  const module = { exports: {} as { createBackupParser: Function } };
  vm.runInNewContext(`(function(require,module,exports){${compiled}\n})`, {
    document,
    window,
  })(
    (name: string) => {
      assert.equal(name, '../../utils/result');
      return { errorText, unwrap };
    },
    module,
    module.exports,
  );
  const parser = module.exports.createBackupParser({
    flush: async () => {},
    imported: () => {
      imported++;
    },
    notify() {},
  });
  const dialog = body.children[0];
  return {
    parser,
    dialog,
    commits,
    discarded,
    imported: () => imported,
    $: (selector: string) => dialog.querySelector(selector),
    healthy() {
      preview = {
        ...preview,
        token: 'healthy',
        localError: null,
        currentEvents: 4,
        currentSchedules: 5,
        eventMerge: { added: 1, skipped: 0, conflicts: 0 },
        scheduleMerge: { added: 3, skipped: 0, conflicts: 0 },
      };
    },
  };
}

test('recovery preview shows backup contents, disables merge and requires confirmation before replacing', async () => {
  const f = fixture();
  await f.parser.open('backup.jotlet', true);
  assert.equal(f.dialog.open, true);
  assert.equal(f.$('#backup-result').hidden, false);
  assert.equal(f.$('#backup-events').textContent, '1');
  assert.equal(f.$('#backup-schedules').textContent, '3');
  assert.match(f.$('#backup-current').textContent, /本地数据无法读取/);
  assert.equal(f.$('.backup-merge-summary').hidden, true);
  assert.equal(f.$('#backup-merge').disabled, true);
  assert.equal(f.$('#backup-replace').disabled, false);
  f.$('#backup-merge').click();
  assert.deepEqual(f.commits, []);
  f.$('#backup-replace').click();
  assert.equal(f.$('#backup-replace-confirm').hidden, false);
  assert.match(
    f.$('#backup-replace-description').textContent,
    /原损坏文件会保留/,
  );
  assert.deepEqual(f.commits, []);
  f.$('#backup-replace-confirm-button').click();
  await tick();
  assert.deepEqual(f.commits, [['recovery', 'replace']]);
  assert.equal(f.imported(), 1);
  assert.equal(f.dialog.open, false);
});

test('canceling recovery never imports and a later readable preview restores normal merge controls', async () => {
  const f = fixture();
  await f.parser.open('backup.jotlet', true);
  f.$('#backup-cancel').click();
  await tick();
  assert.deepEqual(f.discarded, ['recovery']);
  assert.deepEqual(f.commits, []);
  assert.equal(f.dialog.open, false);
  f.healthy();
  await f.parser.open('healthy.jotlet', true);
  assert.equal(f.$('#backup-merge').disabled, false);
  assert.equal(f.$('.backup-merge-summary').hidden, false);
  assert.match(f.$('#backup-current').textContent, /4 个事件、5 个日程/);
  f.$('#backup-merge').click();
  await tick();
  assert.deepEqual(f.commits, [['healthy', 'merge']]);
});
