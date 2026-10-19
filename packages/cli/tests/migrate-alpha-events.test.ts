// `pdx migrate` and a library component's alpha change events (#478, part 1 of #125).
//
// A component that moved to its model no longer emits its alpha change event. The migration rewrites
// an inline handler to the model's event, each alpha `detail.<field>` read through the manifest's
// `alphaDetail`, and flags what a person must rewrite. No shipped manifest records alpha events yet,
// so the component's are given through the context, as the resolver would give them.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AlphaLookup } from '@pdxui/compiler';
import { migrate } from '../src/commands/migrate';
import { removeTree } from './remove-tree';

/** `pdx-x` moved to its model `checked`: it emitted `pdx-change` and `change`. */
const alphaOf: AlphaLookup = (tag) => (tag === 'pdx-x' ? {
    events: ['pdx-change', 'change'],
    detail: { checked: '$event.detail.value', value: '$event.currentTarget.value' },
    modelEvent: 'checked-change',
} : null);

let root: string;
const file = (rel: string, text: string) => {
    const path = join(root, rel);
    mkdirSync(join(path, '..'), { recursive: true });
    writeFileSync(path, text, 'utf-8');
};
const read = (rel: string) => readFileSync(join(root, rel), 'utf-8');

beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'pdx-migrate-alpha-')); });
afterEach(() => { removeTree(root); });

const PAGE = [
    '<template>',
    '  <pdx-x @pdx-change="total = $event.detail.checked ? $event.detail.value : 0"></pdx-x>',
    '  <pdx-x @pdx-change="onChange"></pdx-x>',
    '  <pdx-x @pdx-change="e => save(e.detail.indeterminate)"></pdx-x>',
    '  <pdx-x @change="save(1)"></pdx-x>',
    '  <pdx-y @pdx-change="save($event.detail.checked)"></pdx-y>',
    '</template>',
    '<script>',
    'let total = $signal(0);',
    'function onChange() {}',
    'function save(v) { total = v; }',
    '</script>',
    '',
].join('\n');

describe('pdx migrate — alpha change events (#478)', () => {
    it('rewrites an inline handler to the model\'s event, its detail reads through the manifest', async () => {
        file('src/page.pdx', PAGE);
        const report = await migrate(['.'], { cwd: root, context: { alphaOf } });
        expect(read('src/page.pdx')).toContain('<pdx-x @checked-change="total = $event.detail.value ? $event.currentTarget.value : 0"></pdx-x>');
        expect(report.changed).toEqual([{ file: 'src/page.pdx', id: 'alpha-change-event', count: 1 }]);
    });

    it('flags a handler reference and an unmapped field, and @change, each at its line', async () => {
        file('src/page.pdx', PAGE);
        const report = await migrate(['.'], { cwd: root, context: { alphaOf } });
        expect(report.flagged.map((f) => [f.line, f.id, f.found])).toEqual([
            [3, 'alpha-change-event', '@pdx-change'],
            [4, 'alpha-change-event', '@pdx-change'],
            [5, 'alpha-change-listener', '@change'],
        ]);
        expect(report.flagged[0].message).toContain('`@checked-change`');
        // What a person must rewrite is left as written.
        expect(read('src/page.pdx')).toContain('<pdx-x @pdx-change="onChange"></pdx-x>');
        expect(read('src/page.pdx')).toContain('<pdx-x @change="save(1)"></pdx-x>');
    });

    it('control: a tag whose manifest records nothing is left alone', async () => {
        file('src/page.pdx', PAGE);
        await migrate(['.'], { cwd: root, context: { alphaOf } });
        expect(read('src/page.pdx')).toContain('<pdx-y @pdx-change="save($event.detail.checked)"></pdx-y>');
    });

    it('a second run changes nothing', async () => {
        file('src/page.pdx', PAGE);
        await migrate(['.'], { cwd: root, context: { alphaOf } });
        const once = read('src/page.pdx');
        const second = await migrate(['.'], { cwd: root, context: { alphaOf } });
        expect(read('src/page.pdx')).toBe(once);
        expect(second.changed).toEqual([]);
    });
});
