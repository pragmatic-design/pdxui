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
import { buildRegistry } from '../src/utils/project-registry';
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

    it('the host of a library component: its fields with their types, its methods callable (#479)', () => {
        const lib = {
            describe: (tag: string) => (tag === 'pdx-lib' ? {
                tag, description: '', filePath: '/lib/pdx-lib.ts', attributes: [], events: [], slots: [],
                members: [
                    { name: 'value', kind: 'field', type: 'number | null', description: '' },
                    { name: 'options', kind: 'field', type: 'Array<{ id: string }>', description: '' },
                    { name: 'clear', kind: 'method', type: '', description: '' },
                ],
            } : undefined),
        } as unknown as Parameters<typeof resolvePropType>[0];
        expect(resolvePropType(lib, 'pdx-lib', '$host')).toBe('HTMLElement & { value: number | null; options: any; clear(...args: any[]): any }');
        expect(resolvePropType(lib, 'pdx-unknown', '$host')).toBeNull();
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

    // A handler on a component reads the component: `@change` on `<pdx-input>` is its commit, and the
    // model is on the host, `$event.currentTarget.value` (#479). Its currentTarget is the host's type.
    const field: Resolve = (tag, attr) => (tag === 'pdx-field' && attr === '$host'
        ? 'HTMLElement & { value: string; getFormatted(...args: any[]): any }' : null);

    it('on a component, currentTarget is the component: its model and its methods read, a misspelt one is an error', () => {
        expect(diagnose("let v = $signal('');", '<pdx-field @change="e => v = e.currentTarget.value"></pdx-field>', field)).toEqual([]);
        expect(diagnose("let v = $signal('');", '<pdx-field @value-change="v = $event.currentTarget.getFormatted()"></pdx-field>', field)).toEqual([]);
        const found = diagnose("let v = $signal('');", '<pdx-field @change="e => v = e.currentTarget.vlaue"></pdx-field>', field);
        expect(found.map((f) => f.at)).toEqual(['vlaue']);
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
        // The alpha scoped slot's context: `<pdx-nav-menu>`'s manifest types its snippet `item`
        // (#595, below), not the `let:` form, which stays unchecked until #131 removes it.
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

// #595: a library component's snippet, typed from the repository's own manifest, not a stand-in.
// `pdx-nav-menu` declares `item(item, level, expanded, active)` and `itemActions(item, level, active)`.
describe("a library component's snippet, from the real manifest (#595)", () => {
    const registry = buildRegistry(ROOT);
    const fromManifest: ResolveSnippet = (tag, name) => resolveSnippetType(registry, tag, name);
    const NAV = "let nav = $signal([{ key: 'home', label: 'Home' }]);";

    it('the manifest is the one read: pdx-nav-menu records its signatures, generic in its items (#651)', () => {
        expect(fromManifest('pdx-nav-menu', 'item')?.signature).toMatch(/^\(item: Exclude<T \|/);
        expect(fromManifest('pdx-nav-menu', 'itemActions')?.signature).toMatch(/level: number, active: boolean\)$/);
        expect(fromManifest('pdx-nav-menu', 'item')?.props).toEqual([{ name: 'items', type: 'T[]' }]);
    });

    // #651: the item is the app's own, `T` inferred from `:items`. An invented member is an error; a
    // field the app's items carry reads, with the type they give it — `data` present on every item is
    // not "possibly undefined", as the library's optional `data` made it in the showcase's rail.
    it("an app's own field reads with its type, and an invented one is an error (#651)", () => {
        const ITEMS = "let nav = $signal([{ key: 'home', label: 'Home', glyph: '★', data: { pin: 'x' } }]);";
        const found = diagnose(ITEMS, '<pdx-nav-menu :items="nav">@snippet item(it) { <b>{{ it.glyph.length }} {{ it.data.pin.length }} {{ it.lable }}</b> }</pdx-nav-menu>', undefined, fromManifest);
        expect(found.map((f) => f.at)).toEqual(['lable']);
    });

    // The menu hands its snippet the children too, and draws a header itself (#651): under a header
    // the snippet's item is the child, with the child's own fields.
    it("a child's own field reads under a header, which the snippet never receives (#651)", () => {
        const TREE = "let nav = $signal([{ type: 'header' as const, key: 'g', label: 'G', children: [{ key: 'a', label: 'A', pin: 'p' }] }]);";
        const found = diagnose(TREE, '<pdx-nav-menu :items="nav">@snippet itemActions(it) { <i>{{ it.pin.length }} {{ it.pni }}</i> }</pdx-nav-menu>', undefined, fromManifest);
        expect(found.map((f) => f.at)).toEqual(['pni']);
    });

    it('a misspelt member of a typed field is an error at the member, and so is a wrong use of the level', () => {
        const found = diagnose(NAV, '<pdx-nav-menu :items="nav">@snippet item(it, level) { <b>{{ it.label.lenght }} {{ level.toUpperCase() }}</b> }</pdx-nav-menu>', undefined, fromManifest);
        expect(found.map((f) => f.at)).toEqual(['lenght', 'toUpperCase']);
    });

    it('control — the declared members read, and so does the renamed snippet', () => {
        expect(diagnose(NAV, '<pdx-nav-menu :items="nav">@snippet item(it, level, open, on) { <b>{{ it.label }} {{ level + 1 }} {{ open && on }}</b> }</pdx-nav-menu>', undefined, fromManifest)).toEqual([]);
        expect(diagnose(NAV, '<pdx-nav-menu :items="nav">@snippet itemActions(it, level, on) { <i>{{ it.key }}{{ on }}</i> }</pdx-nav-menu>', undefined, fromManifest)).toEqual([]);
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

    it('a library component whose array prop is a field, not an attribute, as an Array prop is (#651)', () => {
        const fields = {
            describe: (tag: string) => (tag === 'pdx-lib-menu' ? {
                tag, description: '', filePath: '/lib/pdx-lib-menu.ts', generics: ['T extends { key: string }'],
                attributes: [{ name: 'dense', type: 'boolean', description: '' }],
                members: [{ name: 'items', type: 'T[]', description: '', kind: 'field' }, { name: 'dense', type: 'boolean', description: '', kind: 'field' }],
                events: [], slots: [{ name: 'item', description: '', signature: '(item: T, level: number)' }],
            } : undefined),
        } as unknown as Parameters<typeof resolveSnippetType>[0];
        expect(resolveSnippetType(fields, 'pdx-lib-menu', 'item')).toEqual({
            generics: ['T extends { key: string }'], props: [{ name: 'items', type: 'T[]' }], signature: '(item: T, level: number)',
        });
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
