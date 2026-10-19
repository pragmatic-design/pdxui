// `pdx migrate [paths] [--dry]`: the registry of language changes, applied to a project (#121).
//
// It rewrites every form a registered change has a mechanical fix for, writes the files, and prints
// what it changed and what it could only flag. A second run changes nothing; `--dry` writes nothing.
// No issue has removed a form yet, so the rewrite is tested with entries put in through the
// compiler's seam; the flags are the registry's own entries.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
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

describe('pdx migrate — application tags take the app prefix (#136)', () => {
    it('renames the project tags in .pdx templates and styles, @tag, and the HTML page; flags one in a string', async () => {
        file('src/user-card.pdx', '<template><p>card</p></template>\n<script>\n</script>\n');
        file('src/badge.pdx', "<template><b>x</b></template>\n<script>\n@tag 'pdx-hot-badge';\n</script>\n");
        file('src/page.pdx', '<template>\n  <pdx-user-card></pdx-user-card><pdx-hot-badge/>\n</template>\n<style scoped>\npdx-user-card { display: block; }\n</style>\n');
        file('index.html', '<body>\n  <pdx-page></pdx-page><pdx-root-shell></pdx-root-shell>\n</body>\n');
        // A file named pdx-…, whose tag an app stylesheet also styles: still the project's.
        file('src/pdx-code.pdx', '<template><pre><slot></slot></pre></template>\n');
        file('src/styles.css', 'pdx-code { display: block; }\n');
        file('src/uses-code.pdx', '<template><pdx-code>x</pdx-code></template>\n');
        // A component outside src/ and pages/: every .pdx under what is migrated is the project's.
        file('root-shell.pdx', '<template><slot></slot></template>\n');
        file('tests/page.spec.ts', "await page.locator('pdx-user-card').click();\n");

        const report = await migrate(['.'], { cwd: root });

        expect(read('src/page.pdx')).toContain('<app-user-card></app-user-card><app-hot-badge/>');
        expect(read('src/page.pdx')).toContain('app-user-card { display: block; }');
        expect(read('src/badge.pdx')).toContain("@tag 'app-hot-badge';");
        expect(read('index.html')).toContain('<app-page></app-page><app-root-shell></app-root-shell>');
        expect(read('src/uses-code.pdx')).toContain('<app-code>x</app-code>');
        expect(read('tests/page.spec.ts'), 'a string is flagged, not rewritten').toContain("'pdx-user-card'");
        expect(report.flagged.map(f => [f.file, f.id, f.found])).toEqual([['tests/page.spec.ts', 'app-prefix-string', "'pdx-user-card'"]]);
        // Idempotent: the renamed tags are not found again.
        expect((await migrate(['.'], { cwd: root })).changed).toEqual([]);
    });
});

describe('pdx migrate — events stop bubbling, and $emit leaves (#138)', () => {
    it('keeps an alpha component bubbling, rewrites $emit, and flags the one it cannot rewrite', async () => {
        file('src/card.pdx', "<template><button @click=\"$emit('saved', 1)\">x</button></template>\n<script>\n@event closed;\nfunction go() { closed(); $emit('pdx-change', 2); }\n</script>\n");

        const report = await migrate(['.'], { cwd: root });

        const card = read('src/card.pdx');
        expect(card).toContain('<button @click="saved(1)">');
        // Declared for the $emit it replaced, and marked bubbling, as $emit bubbled.
        expect(card).toContain('@event(bubbles) saved: unknown;');
        expect(card).toContain('@event(bubbles) closed;');
        expect(card, 'a hyphenated name has no @event to call').toContain("$emit('pdx-change', 2)");
        expect(report.changed.map((c) => [c.id, c.count])).toEqual([['emit-removed', 1], ['event-bubbles', 2]]);
        expect(report.flagged.map((f) => [f.id, f.found])).toEqual([['emit-removed', "$emit('pdx-change', 2)"]]);
        // Idempotent: what is left is flagged again, nothing is rewritten again.
        const second = await migrate(['.'], { cwd: root });
        expect(second.changed).toEqual([]);
        expect(second.flagged.map((f) => f.id)).toEqual(['emit-removed']);
    });
});

describe('pdx migrate — a library tag stays the library\'s (#136)', () => {
    // A control: in the workspace the resolver also finds packages/ui by walking up from itself, so the
    // app's own package.json is not what makes this pass here — it is in an installed project run from
    // above the app, which this repository cannot reproduce.
    it('run from above the app, an app file named like a library component does not take its uses', async () => {
        file('app/package.json', JSON.stringify({ name: 'app', dependencies: { '@pdxui/ui': '*' } }));
        mkdirSync(join(root, 'app', 'node_modules', '@pdxui'), { recursive: true });
        symlinkSync(join(__dirname, '..', '..', 'ui'), join(root, 'app', 'node_modules', '@pdxui', 'ui'), 'junction');
        file('app/src/button.pdx', '<template><b>mine</b></template>\n');
        file('app/src/page.pdx', '<template>\n  <pdx-button>Save</pdx-button>\n</template>\n');

        await migrate(['app'], { cwd: root });

        expect(read('app/src/page.pdx'), 'the library\'s <pdx-button> was renamed to the app file\'s tag').toContain('<pdx-button>Save</pdx-button>');
    });
});

describe('pdx migrate — the rewrite', () => {
    it('rewrites a removed form, writes the file and says so', async () => {
        setLanguageChangesForTests([OLD_FORM]);
        file('src/a.pdx', '<template><p>x</p></template>\n<script>\n// @oldform and @oldform\n</script>\n');

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
        const source = '<template><p>x</p></template>\n<script>\nlet cb = $signal(null);\nfunction set() { cb = () => 1; }\n</script>\n';
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
        file('src/a.pdx', "<template><p>x</p></template>\n<script>\nimport { oldThing } from '@pdxui/core';\n</script>\n");
        const report = await migrate(['.'], { cwd: root });
        expect(report.flagged.map((f) => [f.file, f.line]).sort()).toEqual([['src/a.pdx', 3], ['src/util.ts', 1]]);
    });

    it('flags ::x on a prop the child does not declare @model, reading the child\'s file (#124)', async () => {
        file('src/name-field.pdx', "<template><input ::value=\"value\" /></template>\n<script>\n@model value: string = '';\n@prop label: string = '';\n</script>\n");
        file('src/page.pdx', "<template>\n  <pdx-name-field ::value=\"name\" ::label=\"title\"></pdx-name-field>\n  <input ::value=\"name\" />\n</template>\n<script>\nlet name = $signal('');\nlet title = $signal('');\n</script>\n");
        const report = await migrate(['.'], { cwd: root, dry: true });
        expect(report.flagged.map((f) => [f.file, f.line, f.id, f.found])).toEqual([['src/page.pdx', 2, 'two-way-not-model', '::label']]);
        // The registry's message is one per change; the place and the name are the finding's.
        expect(report.flagged[0].message).toContain('`@model x`');
    });

    it('flags every ::x.number binding: an empty entry now writes null, an invalid one nothing (#126)', async () => {
        file('src/age.pdx', "<template>\n  <input type=\"number\" ::value.number=\"age\" />\n  <input ::value.trim=\"name\" />\n</template>\n<script>\nlet age = $signal(0);\nlet name = $signal('');\n</script>\n");
        const report = await migrate(['.'], { cwd: root, dry: true });
        expect(report.flagged.map((f) => [f.file, f.line, f.id, f.found])).toEqual([['src/age.pdx', 2, 'two-way-number', '::value.number']]);
        expect(report.flagged[0].message).toContain('null');
    });

    it('rewrites <script setup> to <script>, the one script grammar (#158)', async () => {
        file('src/a.pdx', '<template><p>{{ n }}</p></template>\n<script setup lang="js">\nlet n = $signal(0);\n</script>\n');
        const report = await migrate(['.'], { cwd: root });
        expect(report.changed).toEqual([{ file: 'src/a.pdx', id: 'script-setup', count: 1 }]);
        expect(read('src/a.pdx')).toBe('<template><p>{{ n }}</p></template>\n<script lang="js">\nlet n = $signal(0);\n</script>\n');
        expect(await migrate(['.'], { cwd: root }), 'not idempotent').toEqual({ changed: [], flagged: [] });
    });

    it('control — a project written today has nothing to change or flag', async () => {
        file('src/a.pdx', '<template><p>{{ n }}</p></template>\n<script>\nlet n = $signal(0);\nfunction f() { n = n + 1; }\n</script>\n');
        file('vite.config.ts', "export default { plugins: [pdx()] };\n");
        const report = await migrate(['.'], { cwd: root });
        expect(report).toEqual({ changed: [], flagged: [] });
    });
});
