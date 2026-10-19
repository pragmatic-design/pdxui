// The names a template reads that the projection used to type `any` (#122): a handler's `$event`,
// the error of `@catch` and `@await … @error`, and a scoped slot's context. Each is typed now, so a
// misspelt member is an error where it is written — in the editor and in `pdx check --types`.
//
// The projection is checked under `strict`, in a program of its own (#468; template-strict.test.ts):
// on `unknown`, TypeScript then reports the value read (`'err' is of type 'unknown'`, 18046), where
// without strict mode it named the member (2339). Either way the read is an error where it is written.
//
// `unknown` where the declaring component could have said and did not — a .pdx's `@event x;`, its
// slot with no context. A library component's manifest types neither, and an unknown tag says
// nothing: those stay unchecked, because a template has no cast to answer a false error with.

import { describe, it, expect, beforeAll } from 'vitest';
import { join } from 'path';
import { pathToFileURL } from 'url';
import { parseTemplate } from '@pdxui/compiler';
import { PdxTsService } from '../src/utils/ts-service';
import { buildVirtualFile } from '../src/utils/virtual-file';
import { getTsDiagnostics } from '../src/capabilities/ts-diagnostics';
import { resolvePropType, resolveSnippetType } from '../src/workspace';
import type { ResolveSnippet } from '../src/utils/template-projection';
import { describeProjectComponent } from '../src/utils/project-components';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';

const ROOT = join(__dirname, '..', '..', '..');
const URI = pathToFileURL(join(ROOT, 'x.pdx')).href;
const svc = new PdxTsService(ROOT);

type Resolve = (tag: string, attr: string) => string | null;

/** The TS diagnostics of a .pdx, each with the text of the .pdx it points at. */
function diagnose(script: string, template: string, resolveType?: Resolve, resolveSnippet?: ResolveSnippet): { code: string; message: string; at: string }[] {
    const source = `<template>${template}</template>\n<script>\n${script}\n</script>\n`;
    const scriptStart = source.indexOf('<script>\n') + '<script>\n'.length;
    const vf = buildVirtualFile(script, scriptStart, parseTemplate(template, 1), template, '<template>'.length, resolveType, undefined, resolveSnippet);
    const lines = source.split('\n');
    return getTsDiagnostics(svc, URI, vf, source).map((d) => {
        const line = lines[d.range.start.line];
        return { code: String(d.code), message: d.message.split('\n')[0], at: line.slice(d.range.start.character, d.range.end.character) };
    });
}

// The language service's cold start — the lenient program and the strict one that checks the template
// (#468) — paid here with a timeout of its own, not by the first `it` against vitest's 5s.
beforeAll(() => { diagnose('let x = $signal(1);', '<p>{{ x }}</p>'); }, 60_000);

describe('what the workspace answers for an event and a slot', () => {
    const registry = {
        describe: (tag: string) => {
            if (tag === 'app-card') {
                return {
                    tag, description: '', filePath: '/app/src/card.pdx', attributes: [],
                    events: [{ name: 'picked', type: '{ id: number }', description: '' }, { name: 'closed', type: undefined, description: '' }],
                    slots: [{ name: 'row', description: '', scopeType: '{ item: { name: string } }' }, { name: 'footer', description: '' }],
                };
            }
            if (tag === 'pdx-lib') {
                return {
                    tag, description: '', filePath: '/lib/pdx-lib.ts', attributes: [],
                    events: [{ name: 'pdx-change', type: 'CustomEvent', description: '' }],
                    slots: [{ name: 'item', description: '' }],
                };
            }
            return undefined;
        },
    } as unknown as Parameters<typeof resolvePropType>[0];

    it('a .pdx component: its declared types, and unknown for what it leaves out', () => {
        expect(resolvePropType(registry, 'app-card', '@picked')).toBe('CustomEvent<{ id: number }>');
        expect(resolvePropType(registry, 'app-card', '@closed')).toBe('CustomEvent<unknown>');
        expect(resolvePropType(registry, 'app-card', '#row')).toBe('{ item: { name: string } }');
        expect(resolvePropType(registry, 'app-card', '#footer')).toBe('unknown');
    });

    it('a library component, whose manifest types neither: nothing to check against', () => {
        expect(resolvePropType(registry, 'pdx-lib', '@pdx-change')).toBeNull();
        expect(resolvePropType(registry, 'pdx-lib', '#item')).toBeNull();
        expect(resolvePropType(registry, 'pdx-unknown', '#item')).toBeNull();
    });
});

describe("a handler's $event", () => {
    const picker: Resolve = (tag, attr) => (tag === 'pdx-picker' && attr === '@picked' ? 'CustomEvent<{ value: number }>' : null);

    it('is the declared event: a misspelt member of its detail is an error at the member', () => {
        const found = diagnose('let v = $signal(0);', '<pdx-picker @picked="v = $event.detail.vlaue"></pdx-picker>', picker);
        expect(found.map((f) => f.at)).toEqual(['vlaue']);
    });

    it('of an event a .pdx component declares with no payload is CustomEvent<unknown>, not any', () => {
        // What the workspace answers for `@event changed;` in a project component.
        const bare: Resolve = (tag, attr) => (tag === 'app-other' && attr === '@changed' ? 'CustomEvent<unknown>' : null);
        // Under strict mode TypeScript names the `unknown` value read, not the member.
        const found = diagnose('let v = $signal(0);', '<app-other @changed="v = $event.detail.value"></app-other>', bare);
        expect(found.map((f) => [f.code, f.at])).toEqual([['ts(18046)', '$event.detail']]);
    });

    it('control — the event of a component nothing types (a library one) is left unchecked', () => {
        // A library manifest describes an event's detail in prose: reporting every read of it would
        // flag correct code that no cast can fix, since a template cannot write one.
        expect(diagnose('let v = $signal(0);', '<pdx-form @pdx-submit="v = $event.detail.values"></pdx-form>')).toEqual([]);
    });

    it('of a native event is its DOM event, whose target is the element it is written on', () => {
        expect(diagnose("let name = $signal('');", '<input @input="name = $event.target.value">')).toEqual([]);
        expect(diagnose('let k = $signal(\'\');', '<input @keydown.enter="k = $event.key">')).toEqual([]);
        const found = diagnose("let name = $signal('');", '<input @input="name = $event.target.vlaue">');
        expect(found.map((f) => f.at)).toEqual(['vlaue']);
    });
});

describe('the error of @catch and @await … @error', () => {
    it('is unknown: reading a member of it unchecked is an error', () => {
        const found = diagnose('let x = $signal(1);', '@try { <p>{{ x }}</p> } @catch (err) { <p>{{ err.mesage }}</p> }');
        expect(found.map((f) => [f.code, f.at])).toEqual([['ts(18046)', 'err']]);
    });

    it('narrowed, it reads as what it was narrowed to', () => {
        const ok = diagnose('let x = $signal(1);', '@try { <p>{{ x }}</p> } @catch (err) { <p>{{ err instanceof Error ? err.message : String(err) }}</p> }');
        expect(ok).toEqual([]);
    });

    it('of @await … @error too', () => {
        const found = diagnose('let ready = $signal(false);', '@await (ready) { <p>ok</p> } @error (e) { <p>{{ e.mesage }}</p> }');
        expect(found.map((f) => [f.code, f.at])).toEqual([['ts(18046)', 'e']]);
    });
});

describe("a scoped slot's context", () => {
    const list: Resolve = (tag, attr) => (tag === 'pdx-list' && attr === '#item' ? '{ row: { name: string } }' : null);

    it('is what the component declares: a misspelt member is an error at the member', () => {
        const found = diagnose('let x = $signal(1);', '<pdx-list>@slot (item, { row }) { <p>{{ row.nmae }}</p> }</pdx-list>', list);
        expect(found.map((f) => f.at)).toEqual(['nmae']);
    });

    it('control — the declared member reads', () => {
        expect(diagnose('let x = $signal(1);', '<pdx-list>@slot (item, { row }) { <p>{{ row.name }}</p> }</pdx-list>', list)).toEqual([]);
    });

    it('is unknown when a .pdx component declares no context for it', () => {
        // What the workspace answers for a project component's slot with no `@slot name: { … }`.
        const bare: Resolve = (tag, attr) => (tag === 'app-bare' && attr === '#item' ? 'unknown' : null);
        const found = diagnose('let x = $signal(1);', '<app-bare>@slot (item, { row }) { <p>{{ row.name }}</p> }</app-bare>', bare);
        expect(found.map((f) => [f.code, f.at])).toEqual([['ts(18046)', 'row']]);
    });

    it('control — the slot of a component that cannot type it (a library one) is left unchecked', () => {
        // `<pdx-nav-menu>`'s item is whatever the app passed in `:items`: a generic its manifest
        // cannot state until the component declares its slot's signature (#491).
        expect(diagnose('let x = $signal(1);', '<pdx-nav-menu><slot name="item" let:item><b>{{ item.label }}</b></slot></pdx-nav-menu>')).toEqual([]);
    });
});

// #490: a `@snippet`'s parameters are typed from the child's `@slot` signature, with its `@generic`s
// resolved — inferred from the props that use them, or set on the tag with `T="User"`.
describe("a snippet's parameters", () => {
    const USER = 'type User = { id: string; name: string };\nlet users = $signal<User[]>([]);';
    // What the workspace answers for `@generic T extends { id: string }; @prop items: T[];
    // @slot row: (item: T, index: number);` in `<app-list>`, and a plain signature in `<app-pane>`.
    const snippets: ResolveSnippet = (tag, name) => {
        if (tag === 'app-list' && name === 'row') {
            return { generics: ['T extends { id: string }'], props: [{ name: 'items', type: 'T[]' }], signature: '(item: T, index: number)' };
        }
        if (tag === 'app-pane' && name === 'body') return { generics: [], props: [], signature: '(title: string)' };
        return null;
    };

    it('are typed from the signature, with T inferred from the prop that uses it: a misspelt member is an error', () => {
        const found = diagnose(USER, '<app-list :items="users">@snippet row(u, i) { <p>{{ i + 1 }}. {{ u.nmae }}</p> }</app-list>', undefined, snippets);
        expect(found.map((f) => f.at)).toEqual(['nmae']);
    });

    it('control — the members the inferred type has read', () => {
        expect(diagnose(USER, '<app-list :items="users">@snippet row(u, i) { <p>{{ i + 1 }}. {{ u.name }}</p> }</app-list>', undefined, snippets)).toEqual([]);
    });

    it('take T from the tag when it is set there, `T="User"`', () => {
        const found = diagnose(USER, '<app-list T="User">@snippet row(u) { <p>{{ u.nmae }}</p> }</app-list>', undefined, snippets);
        expect(found.map((f) => f.at)).toEqual(['nmae']);
    });

    it('of a signature with no generic are its types', () => {
        const found = diagnose(USER, '<app-pane>@snippet body(t) { <p>{{ t.toFixed(2) }}</p> }</app-pane>', undefined, snippets);
        expect(found.map((f) => f.at)).toEqual(['toFixed']);
    });

    it('control — of a component whose signature is not known, they are left unchecked', () => {
        expect(diagnose(USER, '<app-other>@snippet row(u) { <p>{{ u.anything }}</p> }</app-other>', undefined, snippets)).toEqual([]);
    });
});

describe('a type parameter inside the component that declares it', () => {
    const SCRIPT = '@generic T extends { id: string };\n@prop items: T[] = [];\n@slot row: (item: T);\n';
    it('reads as its constraint: what it promises reads, the rest is an error', () => {
        const found = diagnose(SCRIPT + 'function ids() { return items.map((it) => it.id + it.nmae); }', '<p>x</p>');
        expect(found.map((f) => f.at)).toEqual(['nmae']);
    });
    it('control — the constraint\'s member alone reads', () => {
        expect(diagnose(SCRIPT + 'function ids() { return items.map((it) => it.id); }', '<p>x</p>')).toEqual([]);
    });
});

describe('what the workspace answers for a snippet', () => {
    const registry = {
        describe: (tag: string) => {
            if (tag === 'app-list') {
                return {
                    tag, description: '', filePath: '/app/src/list.pdx', generics: ['T extends { id: string }'],
                    attributes: [{ name: 'items', type: 'T[]', description: '' }, { name: 'dense', type: 'boolean', description: '' }],
                    events: [], slots: [{ name: 'row', description: '', signature: '(item: T, index: number)' }, { name: 'footer', description: '' }],
                };
            }
            if (tag === 'pdx-lib-list') {
                // A library component whose manifest records its slot's signature (#491 fills these).
                return {
                    tag, description: '', filePath: '/lib/pdx-lib-list.ts', generics: ['T'],
                    attributes: [{ name: 'items', type: 'T[]', description: '' }],
                    events: [], slots: [{ name: 'item', description: '', signature: '(item: T)' }],
                };
            }
            return undefined;
        },
    } as unknown as Parameters<typeof resolveSnippetType>[0];

    it('a .pdx component: its generics, the props that use them, and the signature', () => {
        expect(resolveSnippetType(registry, 'app-list', 'row')).toEqual({
            generics: ['T extends { id: string }'], props: [{ name: 'items', type: 'T[]' }], signature: '(item: T, index: number)',
        });
    });

    it('a library component, from what its manifest records', () => {
        expect(resolveSnippetType(registry, 'pdx-lib-list', 'item')).toEqual({ generics: ['T'], props: [{ name: 'items', type: 'T[]' }], signature: '(item: T)' });
    });

    it('nothing for a slot with no signature, or a tag it does not know', () => {
        expect(resolveSnippetType(registry, 'app-list', 'footer')).toBeNull();
        expect(resolveSnippetType(registry, 'app-nope', 'row')).toBeNull();
    });

    it("read from a project .pdx: its @generic, its props that use it, its @slot's signature", () => {
        const dir = mkdtempSync(join(tmpdir(), 'pdx-snippet-type-'));
        try {
            const file = join(dir, 'user-list.pdx');
            writeFileSync(file, '<template><ul></ul></template>\n<script>\n@generic T extends { id: string };\n'
                + '@prop items: T[] = [];\n@prop dense: boolean = false;\n@slot row: (item: T, index: number);\n</script>\n');
            const described = describeProjectComponent('app-user-list', file);
            const fromFile = { describe: (tag: string) => (tag === 'app-user-list' ? described ?? undefined : undefined) } as Parameters<typeof resolveSnippetType>[0];
            expect(resolveSnippetType(fromFile, 'app-user-list', 'row')).toEqual({
                generics: ['T extends { id: string }'], props: [{ name: 'items', type: 'T[]' }], signature: '(item: T, index: number)',
            });
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });
});
