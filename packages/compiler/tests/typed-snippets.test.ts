// Typed snippets (#489, part 1 of #131), as the compiler reads them: `@slot row: (item, i);` in a
// child's script, `@render row(it, i)` in its template, `@snippet row(u, i) { … }` inside its tag in
// the parent's. What they render is held by `packages/core/tests/typed-snippets.test.ts`.

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';
import { parseTemplate } from '../src/parser/template';
import { analyzeScript } from '../src/compiler/script-analyzer';
import { generateDts } from '../src/compiler/dts-generator';
import { ComponentResolver } from '../src/component-resolver';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const child = (script: string, template = '<p>x</p>') => `<template>${template}</template>\n<script>\n${script}\n</script>\n`;

describe('the template parser', () => {
    it('reads `@render name(args)`', () => {
        const [node] = parseTemplate('@render row(it, i + 1)');
        expect(node).toMatchObject({ type: 'render', name: 'row', args: ['it', 'i + 1'], optional: false });
    });

    it('reads `@render name?.(args) @else { … }`: optional, with its fallback', () => {
        const [node] = parseTemplate('@render row?.(it) @else { <i>none</i> }');
        expect(node).toMatchObject({ type: 'render', name: 'row', args: ['it'], optional: true });
        expect(node.type === 'render' && node.fallback?.length).toBeGreaterThan(0);
    });

    it('leaves the text after a `@render` with no @else where it was', () => {
        const nodes = parseTemplate('<p>@render row() after</p>');
        expect(nodes.map((n) => n.type)).toEqual(['html', 'render', 'html']);
        expect(nodes[2]).toMatchObject({ type: 'html', content: ' after</p>' });
    });

    it('reads `@snippet name(params) { … }` with named parameters', () => {
        const [, node] = parseTemplate('<app-list>@snippet row(u, i) { <span>{{ u.name }}</span> }</app-list>');
        expect(node).toMatchObject({ type: 'snippet', name: 'row', params: ['u', 'i'] });
        expect(node.type === 'snippet' && node.body.some((n) => n.type === 'interpolation')).toBe(true);
    });
});

describe('@slot with a signature', () => {
    it('is a slot with its signature, required without `?` and optional with it', () => {
        const { slots } = analyzeScript('@slot row: (item: T, index: number);\n@slot empty?: ();', 'list.pdx');
        expect(slots).toEqual([
            { name: 'row', signature: '(item: T, index: number)', required: true },
            { name: 'empty', signature: '()', required: false },
        ]);
    });

    it('keeps the object form compiling, and it requires nothing', () => {
        const { slots, warnings } = analyzeScript('@slot cell: { row: Item };', 'grid.pdx');
        expect(slots).toEqual([{ name: 'cell', scopeType: '{ row: Item }' }]);
        expect((warnings ?? []).filter((w) => w.code === 'PDX_UNKNOWN_DECLARATION')).toEqual([]);
    });

    it('a malformed signature is PDX_UNKNOWN_DECLARATION, with the form as its hint', () => {
        const { slots, warnings } = analyzeScript('@slot row: (item', 'list.pdx');
        const [w] = (warnings ?? []).filter((x) => x.code === 'PDX_UNKNOWN_DECLARATION');
        expect(w, 'no PDX_UNKNOWN_DECLARATION').toBeDefined();
        expect(w.hint).toContain('@slot row: (item: T, index: number);');
        expect(slots).toEqual([]);
    });

    it('is typed in the .d.ts as the function the parent provides', () => {
        const { slots } = analyzeScript('@slot row: (item: string, index: number);\n@slot empty?: ();', 'list.pdx');
        const dts = generateDts({ tag: 'app-list', props: [], events: [], slots });
        expect(dts).toContain('  row: (item: string, index: number) => Node;');
        expect(dts).toContain('  empty?: () => Node;');
    });

    it('is declared in the descriptor: `slots: { row: slot() }`', () => {
        const { code } = compile(child('@slot row: (item: string);\n@slot empty?: ();', '<p>@render row(\'a\')</p>'), 'list.pdx');
        expect(code).toMatch(/slots: \{ row: slot\(\), empty: slot\(\) \}/);
        expect(code).toMatch(/import \{[^}]*\bslot\b[^}]*\} from '@pdxui\/core'/);
    });
});

describe('@snippet in the script', () => {
    it('with a template body is compiled with the template, and `@render` calls it', () => {
        const { code } = compile(child("let who = $signal('Ann');\n@snippet greet(name: string) {\n  <em>{{ name }}</em>\n}", '<p>@render greet(who)</p>'), 'card.pdx');
        expect(code).toContain('function greet(name)');
        expect(code).toContain('renderSnippet(()=>greet,()=>[ctx.who()])');
        expect(code).not.toMatch(/\bhtml`/);
    });

    it('with a `${arg}` body is still the alpha html`` function, until #131 migrates it', () => {
        const { code } = compile(child('@snippet greet(name) {\n  <em>${name}</em>\n}', '<p>@render greet(\'x\')</p>'), 'card.pdx');
        expect(code).toContain('function greet(name) { return html`');
        expect(code).toContain("renderSnippet(()=>ctx.greet,()=>['x'])");
    });
});

describe('PDX_SLOT_REQUIRED', () => {
    const required = (tag: string) => (tag === 'app-list' ? new Set(['row']) : null);
    const findings = (template: string) => compile(
        `<template>\n${template}\n</template>\n<script>\nlet users = $signal([]);\n</script>\n`,
        'page.pdx', [], undefined, { requiredSlotsOf: required },
    ).warnings.filter((w) => w.code === 'PDX_SLOT_REQUIRED');

    it('a use that does not fill a required slot is an error naming it, at the tag', () => {
        const [w, ...rest] = findings('<div>\n  <app-list :items="users"></app-list>\n</div>');
        expect(rest).toEqual([]);
        expect(w).toMatchObject({ severity: 'error', line: 3, column: 3 });
        expect(w.message).toContain("'row'");
        expect(w.message).toContain('<app-list>');
    });

    it('a @snippet of that name inside the tag fills it', () => {
        expect(findings('<app-list :items="users">@snippet row(u) { <b>{{ u }}</b> }</app-list>')).toEqual([]);
    });

    it('a @snippet of another name, or one inside a nested component, does not', () => {
        expect(findings('<app-list>@snippet other(u) { <b>{{ u }}</b> }</app-list>')).toHaveLength(1);
        expect(findings('<app-list><app-card>@snippet row(u) { <b>{{ u }}</b> }</app-card></app-list>')).toHaveLength(1);
    });

    it('a component whose slots are not known raises nothing', () => {
        expect(findings('<other-list></other-list>')).toEqual([]);
    });
});

describe('the resolver knows the required slots', () => {
    it("of a project .pdx, read from its @slot lines, again when the file changes", () => {
        const root = mkdtempSync(join(tmpdir(), 'pdx-slots-'));
        try {
            const file = join(root, 'src', 'user-list.pdx');
            mkdirSync(join(root, 'src'), { recursive: true });
            writeFileSync(file, child('@slot row: (item: string);\n@slot empty?: ();'));
            const r = new ComponentResolver();
            r.registerProjectComponents(root);
            expect([...r.requiredSlotsOf('app-user-list')!]).toEqual(['row']);
            writeFileSync(file, child('@slot row?: (item: string);'));
            utimesSync(file, new Date(), new Date(Date.now() + 5000));
            expect([...r.requiredSlotsOf('app-user-list')!]).toEqual([]);
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    });
});
