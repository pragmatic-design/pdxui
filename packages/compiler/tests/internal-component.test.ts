// `@internal` components (#1102): a component only the components of its own folder render. Its folder is
// its scope, from both sides — the script that imports it and the template that names its tag — and the
// resolver never imports one by itself: the component that renders it does.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compile } from '../src/plugin';
import { analyzeScript } from '../src/compiler/script-analyzer';
import { ComponentResolver } from '../src/component-resolver';
import { injectComponentImports } from '../src/plugin-utils';
import { importedInternals } from '../src/internal-components';

let root: string;

function file(rel: string, content: string): string {
    const full = join(root, rel);
    mkdirSync(join(full, '..'), { recursive: true });
    writeFileSync(full, content);
    return full.replace(/\\/g, '/');
}

const read = (f: string) => { try { return readFileSync(f, 'utf-8'); } catch { return null; } };
const codes = (ws: { code: string }[]) => ws.map((w) => w.code);

const INNER = '<template><p>{{ label }}</p></template>\n<script>\n@internal;\n@prop label: string = \'\';\n</script>\n';
const user = (spec: string, tag = 'app-inner') => `<template><${tag} label="x"></${tag}></template>\n<script>\nimport '${spec}';\n</script>\n`;

beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'pdx-internal-')); });
afterEach(() => { vi.restoreAllMocks(); rmSync(root, { recursive: true, force: true }); });

describe('the @internal rune', () => {
    it('marks the component internal, and is no unknown declaration', () => {
        const a = analyzeScript('@internal;\n@prop label: string = \'\';', 'src/a/inner.pdx');
        expect(a.internal).toBe(true);
        expect(codes(a.warnings)).toEqual([]);
        expect(analyzeScript('@prop label: string = \'\';', 'src/a/inner.pdx').internal).toBeUndefined();
    });

    it('changes nothing in the module: an internal component renders like any other, in dev and in a build', () => {
        const without = INNER.replace('@internal;\n', '');
        for (const production of [false, true]) {
            const a = compile(INNER, 'src/a/inner.pdx', [], undefined, { production });
            const b = compile(without, 'src/a/inner.pdx', [], undefined, { production });
            expect(a.code, production ? 'build' : 'dev').toBe(b.code);
        }
    });

    it('in a file named pdx-… is PDX_INTERNAL_NAMED_PUBLIC: the name makes a library component public', () => {
        const a = analyzeScript('@internal;', 'packages/ui/src/x/pdx-x.pdx');
        const w = a.warnings.find((x) => x.code === 'PDX_INTERNAL_NAMED_PUBLIC');
        expect(w?.severity).toBe('error');
        expect(w?.message).toContain('pdx-x.pdx');
        expect(w?.hint).toContain('x.pdx');
    });
});

describe('the script that imports an internal component', () => {
    it('in its own folder: no diagnostic, and the tag is reported as registered by that import', () => {
        file('src/a/inner.pdx', INNER);
        const outer = file('src/a/outer.pdx', user('./inner.pdx'));
        const r = compile(readFileSync(outer, 'utf-8'), outer, [], undefined, { readComponent: read });
        expect(codes(r.warnings)).not.toContain('PDX_INTERNAL_COMPONENT');
        expect(r.internalTags).toEqual(['app-inner']);
    });

    it('from another folder: PDX_INTERNAL_COMPONENT, naming both files', () => {
        file('src/a/inner.pdx', INNER);
        const other = file('src/b/other.pdx', user('../a/inner.pdx'));
        const r = compile(readFileSync(other, 'utf-8'), other, [], undefined, { readComponent: read });
        const w = r.warnings.find((x) => x.code === 'PDX_INTERNAL_COMPONENT');
        expect(w?.severity).toBe('error');
        expect(w?.message).toContain('b/other.pdx');
        expect(w?.message).toContain('a/inner.pdx');
    });

    it('reads every static form of the import, and not a dynamic import()', () => {
        file('src/a/inner.pdx', INNER);
        const forms = [
            "import './inner.pdx';",
            'import "./inner.pdx"',
            "import Inner from './inner.pdx';",
            "import {\n  type X,\n} from './inner.pdx';",
            "import {X}from './inner.pdx';",
            "  import * as I from '../a/inner.pdx';",
        ];
        const outer = join(root, 'src/a/outer.pdx').replace(/\\/g, '/');
        const tags = (script: string) => importedInternals(script, outer, read, 'app').internals.map((x) => x.tag);
        for (const form of forms) expect(tags(form), form).toEqual(['app-inner']);
        for (const form of ["const m = import('./inner.pdx');", "import x; const s = './inner.pdx';", "// import './inner.pdx';"]) {
            expect(tags(form), form).toEqual([]);
        }
    });

    it('a public component imported from another folder is not internal — the control', () => {
        file('src/a/inner.pdx', INNER.replace('@internal;\n', ''));
        const other = file('src/b/other.pdx', user('../a/inner.pdx'));
        const r = compile(readFileSync(other, 'utf-8'), other, [], undefined, { readComponent: read });
        expect(codes(r.warnings)).not.toContain('PDX_INTERNAL_COMPONENT');
        expect(r.internalTags).toBeUndefined();
    });
});

describe('the template that renders an internal tag of the project', () => {
    function resolver(): ComponentResolver {
        const r = new ComponentResolver();
        r.registerProjectComponents(root);
        return r;
    }

    it('from another folder, without importing it: PDX_INTERNAL_COMPONENT', () => {
        file('src/a/inner.pdx', INNER);
        const other = file('src/b/other.pdx', '<template><app-inner label="x"></app-inner></template>');
        const r = resolver();
        const out = compile(readFileSync(other, 'utf-8'), other, [], undefined, { internalFileOf: (t) => r.internalFileOf(t) });
        expect(codes(out.warnings)).toContain('PDX_INTERNAL_COMPONENT');
    });

    it('from its own folder: no diagnostic', () => {
        file('src/a/inner.pdx', INNER);
        const outer = file('src/a/outer.pdx', '<template><app-inner label="x"></app-inner></template>');
        const r = resolver();
        const out = compile(readFileSync(outer, 'utf-8'), outer, [], undefined, { internalFileOf: (t) => r.internalFileOf(t) });
        expect(codes(out.warnings)).not.toContain('PDX_INTERNAL_COMPONENT');
    });

    it('is never auto-imported, while a public sibling is', () => {
        file('src/a/inner.pdx', INNER);
        file('src/a/shown.pdx', '<template><p></p></template>');
        const outer = file('src/a/outer.pdx', '<template><app-inner></app-inner><app-shown></app-shown></template>');
        const r = resolver();
        expect(r.internalFileOf('app-inner')).toContain('a/inner.pdx');
        expect(r.internalFileOf('app-shown')).toBeNull();
        const code = injectComponentImports('import x from "y";\n', outer, readFileSync(outer, 'utf-8'), r);
        expect(code).toContain("import './shown.pdx';");
        expect(code).not.toContain('inner.pdx');
    });
});

describe('the parts an internal view draws are its owner\'s (#1110)', () => {
    const VIEW = '<template><div data-part="grid"><span data-part="cell"></span></div></template>\n<script>\n@internal;\n</script>\n';
    const owner = (parts: string, extra = '') => `<template><app-view></app-view></template>\n<script>\nimport './view.pdx';\n${parts}\n${extra}\n</script>\n`;
    const compileOwner = (source: string) => {
        const f = file('src/a/owner.pdx', source);
        return compile(source, f, [], undefined, { readComponent: read }).warnings;
    };

    it('a part the owner declares and only its view draws is not missing, and the view raises nothing', () => {
        file('src/a/view.pdx', VIEW);
        expect(codes(compileOwner(owner('@part grid, cell;')))).not.toContain('PDX_PART_MISSING');
        const view = file('src/a/view.pdx', VIEW);
        expect(codes(compile(VIEW, view, [], undefined, { readComponent: read }).warnings)).not.toContain('PDX_PART_UNDECLARED');
    });

    it('a part the view draws and the owner does not declare is PDX_PART_UNDECLARED on the owner, naming the view', () => {
        file('src/a/view.pdx', VIEW);
        const w = compileOwner(owner('@part grid;')).filter((x) => x.code === 'PDX_PART_UNDECLARED');
        expect(w).toHaveLength(1);
        expect(w[0].message).toContain("'cell'");
        expect(w[0].message).toContain('view.pdx');
    });

    it('the control: a part drawn by nobody is still PDX_PART_MISSING', () => {
        file('src/a/view.pdx', VIEW);
        const w = compileOwner(owner('@part grid, cell, toolbar;')).filter((x) => x.code === 'PDX_PART_MISSING');
        expect(w.map((x) => x.message)).toEqual([expect.stringContaining("'toolbar'")]);
    });

    it('a view of a view draws parts of the same owner', () => {
        file('src/a/view.pdx', '<template><div data-part="grid"><app-inner></app-inner></div></template>\n<script>\n@internal;\nimport \'./inner.pdx\';\n</script>\n');
        file('src/a/inner.pdx', '<template><span data-part="cell"></span></template>\n<script>\n@internal;\n</script>\n');
        expect(codes(compileOwner(owner('@part grid, cell;')))).toEqual([]);
    });

    it('the owner\'s script reading a part only its view draws is told it never holds the element', () => {
        file('src/a/view.pdx', VIEW);
        const w = compileOwner(owner('@part grid, cell;', 'function width() { return grid?.offsetWidth ?? 0; }')).find((x) => x.code === 'PDX_PART_IN_VIEW');
        expect(w?.message).toContain("'grid'");
        expect(w?.message).toContain('view.pdx');
        // At the @part that names it: line 4 of the owner (template, <script>, the import, then @part).
        expect(w?.line).toBe(4);
        // Not read: nothing to say.
        expect(codes(compileOwner(owner('@part grid, cell;')))).not.toContain('PDX_PART_IN_VIEW');
    });
});

describe('a library component that imports its internal view', () => {
    it('is not told the tag is unresolved: its own import registers it', () => {
        // A consuming app knows the library by its exports, where an internal component is not.
        const outer = file('src/a/outer.pdx', '<template><pdx-inner></pdx-inner></template>');
        const r = new ComponentResolver();
        r.registerUiManifest();
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        injectComponentImports('import "./inner.pdx";\n', outer, readFileSync(outer, 'utf-8'), r, undefined, undefined, ['pdx-inner']);
        expect(warn.mock.calls.map((c) => String(c[0])).filter((m) => m.includes('PDX_UNRESOLVED_COMPONENT'))).toEqual([]);
        // Without it, the same template is one the warning is for — the control.
        injectComponentImports('import "./inner.pdx";\n', outer, readFileSync(outer, 'utf-8'), r);
        expect(warn.mock.calls.map((c) => String(c[0])).some((m) => m.includes('PDX_UNRESOLVED_COMPONENT') && m.includes('pdx-inner'))).toBe(true);
        // `pdx-inner` is a pdx- tag, so the control pays the resolver's walk of the sibling packages
        // (knownWithoutImport, #771): 1.3–1.7 s alone, over 5 s under the gate's load (#991). The
        // timeout is the one resolver-no-import-scan.test.ts gives the same walk.
    }, 60_000);
});
