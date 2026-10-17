// `pdx migrate [paths] [--dry]`: the registry of language changes, applied to a project (#121).
//
// It rewrites every form a registered change has a mechanical fix for, writes the files, and prints
// what it changed and what it could only flag. A second run changes nothing; `--dry` writes nothing.
// No issue has removed a form yet, so the rewrite is tested with entries put in through the
// compiler's seam; the flags are the registry's own entries.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setLanguageChangesForTests, LANGUAGE_CHANGES, removedExport, type LanguageChange } from '@pdxui/compiler';
import { migrate } from '../src/commands/migrate';
import { removeTree } from './remove-tree';

/** A removed form with a mechanical rewrite: `@oldform` → `@newform`. */
const OLD_FORM: LanguageChange = {
    id: 'test-old-form', kind: 'removed', scope: 'pdx', issue: 0,
    message: 'write `@newform` instead.',
    detect: (text) => [...text.matchAll(/@oldform\b/g)].map((m) => ({ line: text.slice(0, m.index).split('\n').length, found: m[0] })),
    fix: (text) => text.replace(/@oldform\b/g, '@newform'),
};

/** A changed form: still valid, its meaning kept by rewriting `@keep` to `@keep(old)`. */
const CHANGED: LanguageChange = {
    id: 'test-changed', kind: 'changed', scope: 'pdx', issue: 0,
    message: '`@keep` changed meaning; `@keep(old)` keeps the old one.',
    detect: (text) => [...text.matchAll(/@keep\b(?!\()/g)].map((m) => ({ line: text.slice(0, m.index).split('\n').length, found: m[0] })),
    fix: (text) => text.replace(/@keep\b(?!\()/g, '@keep(old)'),
};

let root: string;
const file = (rel: string, text: string) => {
    const path = join(root, rel);
    mkdirSync(join(path, '..'), { recursive: true });
    writeFileSync(path, text, 'utf-8');
    return path;
};
const read = (rel: string) => readFileSync(join(root, rel), 'utf-8');

beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'pdx-migrate-')); });
afterEach(() => {
    setLanguageChangesForTests(null);
    removeTree(root);
});

describe('pdx migrate — the rewrite', () => {
    it('rewrites a removed form, writes the file and says so', async () => {
        setLanguageChangesForTests([OLD_FORM]);
        file('src/a.pdx', '<template><p>x</p></template>\n<script setup>\n// @oldform and @oldform\n</script>\n');

        const report = await migrate(['.'], { cwd: root });

        expect(read('src/a.pdx')).toContain('// @newform and @newform');
        expect(report.changed).toEqual([{ file: 'src/a.pdx', id: 'test-old-form', count: 2 }]);
        expect(report.flagged).toEqual([]);
    });

    it('is idempotent: a second run changes nothing', async () => {
        setLanguageChangesForTests([OLD_FORM]);
        file('src/a.pdx', '<template><p>@oldform</p></template>\n');
        await migrate(['.'], { cwd: root });
        const after = read('src/a.pdx');

        const second = await migrate(['.'], { cwd: root });
        expect(second.changed).toEqual([]);
        expect(read('src/a.pdx')).toBe(after);
    });

    it('--dry reports and writes nothing', async () => {
        setLanguageChangesForTests([OLD_FORM]);
        const before = '<template><p>@oldform</p></template>\n';
        file('src/a.pdx', before);

        const report = await migrate(['.'], { cwd: root, dry: true });
        expect(report.changed).toEqual([{ file: 'src/a.pdx', id: 'test-old-form', count: 1 }]);
        expect(read('src/a.pdx')).toBe(before);
    });

    it('rewrites a changed form, which the compiler accepts in silence', async () => {
        setLanguageChangesForTests([CHANGED]);
        file('src/a.pdx', '<template><p>@keep</p></template>\n');
        await migrate(['.'], { cwd: root });
        expect(read('src/a.pdx')).toContain('@keep(old)');
    });

    it('a fix is only ever reported, even one that carries a rewrite', async () => {
        // A fix is valid source whose behaviour changed: there is nothing to rewrite back to.
        setLanguageChangesForTests([{ ...OLD_FORM, id: 'test-fix', kind: 'fix' }]);
        const source = '<template><p>@oldform</p></template>\n';
        file('src/a.pdx', source);
        const report = await migrate(['.'], { cwd: root });
        expect(report.changed).toEqual([]);
        expect(report.flagged.map((f) => f.id)).toEqual(['test-fix']);
        expect(read('src/a.pdx')).toBe(source);
    });

    it('takes a single file as a path, and leaves the rest alone', async () => {
        setLanguageChangesForTests([OLD_FORM]);
        file('src/a.pdx', '<template><p>@oldform</p></template>\n');
        file('src/b.pdx', '<template><p>@oldform</p></template>\n');
        await migrate(['src/a.pdx'], { cwd: root });
        expect(read('src/a.pdx')).toContain('@newform');
        expect(read('src/b.pdx')).toContain('@oldform');
    });

    it('does not walk node_modules or dist', async () => {
        setLanguageChangesForTests([OLD_FORM]);
        file('node_modules/lib/x.pdx', '<template><p>@oldform</p></template>\n');
        file('dist/x.pdx', '<template><p>@oldform</p></template>\n');
        const report = await migrate(['.'], { cwd: root });
        expect(report.changed).toEqual([]);
    });
});

describe('pdx migrate — what it flags (the registry\'s entries)', () => {
    it('is the registry when nothing replaced it', () => {
        expect(LANGUAGE_CHANGES.length).toBeGreaterThanOrEqual(4);
    });

    it('reports an arrow function assigned to a $signal (#187), and leaves the file as it is', async () => {
        const source = '<template><p>x</p></template>\n<script setup>\nlet cb = $signal(null);\nfunction set() { cb = () => 1; }\n</script>\n';
        file('src/a.pdx', source);
        const report = await migrate(['.'], { cwd: root });
        expect(report.flagged.map((f) => [f.file, f.line, f.id])).toEqual([['src/a.pdx', 4, 'signal-arrow-assignment']]);
        expect(report.changed).toEqual([]);
        expect(read('src/a.pdx')).toBe(source);
    });

    it('flags pdx({ inlineBindings }) in vite.config.ts, with its message', async () => {
        file('vite.config.ts', "import { pdx } from '@pdxui/compiler';\nexport default { plugins: [pdx({ inlineBindings: false })] };\n");
        const report = await migrate(['.'], { cwd: root });
        const [f] = report.flagged;
        expect([f?.file, f?.line, f?.id]).toEqual(['vite.config.ts', 2, 'inline-bindings-option']);
        expect(f?.message).toContain('there is one render path');
    });

    it('flags an unknown @defer trigger, suggesting immediate', async () => {
        file('src/a.pdx', '<template>\n  @defer (viewprt) { <p>x</p> }\n</template>\n');
        const report = await migrate(['.'], { cwd: root });
        const [f] = report.flagged;
        expect([f?.file, f?.line, f?.id]).toEqual(['src/a.pdx', 2, 'defer-unknown-trigger']);
        expect(f?.message).toContain('immediate');
    });

    it('flags an import of a removed export in a .ts file and in a .pdx script', async () => {
        setLanguageChangesForTests([removedExport('@pdxui/core', 'oldThing', '`newThing()`', 0)]);
        file('src/util.ts', "import { signal, oldThing } from '@pdxui/core';\n");
        file('src/a.pdx', "<template><p>x</p></template>\n<script setup>\nimport { oldThing } from '@pdxui/core';\n</script>\n");
        const report = await migrate(['.'], { cwd: root });
        expect(report.flagged.map((f) => [f.file, f.line]).sort()).toEqual([['src/a.pdx', 3], ['src/util.ts', 1]]);
    });

    it('flags ::x on a prop the child does not declare @model, reading the child\'s file (#124)', async () => {
        file('src/name-field.pdx', "<template><input ::value=\"value\" /></template>\n<script setup>\n@model value: string = '';\n@prop label: string = '';\n</script>\n");
        file('src/page.pdx', "<template>\n  <pdx-name-field ::value=\"name\" ::label=\"title\"></pdx-name-field>\n  <input ::value=\"name\" />\n</template>\n<script setup>\nlet name = $signal('');\nlet title = $signal('');\n</script>\n");
        const report = await migrate(['.'], { cwd: root, dry: true });
        expect(report.flagged.map((f) => [f.file, f.line, f.id, f.found])).toEqual([['src/page.pdx', 2, 'two-way-not-model', '::label']]);
        // The registry's message is one per change; the place and the name are the finding's.
        expect(report.flagged[0].message).toContain('`@model x`');
    });

    it('control — a project written today has nothing to change or flag', async () => {
        file('src/a.pdx', '<template><p>{{ n }}</p></template>\n<script setup>\nlet n = $signal(0);\nfunction f() { n = n + 1; }\n</script>\n');
        file('vite.config.ts', "export default { plugins: [pdx()] };\n");
        const report = await migrate(['.'], { cwd: root });
        expect(report).toEqual({ changed: [], flagged: [] });
    });
});
