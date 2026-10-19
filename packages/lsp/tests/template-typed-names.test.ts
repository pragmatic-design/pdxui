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

import { describe, it, expect } from 'vitest';
import { join } from 'path';
import { pathToFileURL } from 'url';
import { parseTemplate } from '@pdxui/compiler';
import { PdxTsService } from '../src/utils/ts-service';
import { buildVirtualFile } from '../src/utils/virtual-file';
import { getTsDiagnostics } from '../src/capabilities/ts-diagnostics';
import { resolvePropType } from '../src/workspace';

const ROOT = join(__dirname, '..', '..', '..');
const URI = pathToFileURL(join(ROOT, 'x.pdx')).href;
const svc = new PdxTsService(ROOT);

type Resolve = (tag: string, attr: string) => string | null;

/** The TS diagnostics of a .pdx, each with the text of the .pdx it points at. */
function diagnose(script: string, template: string, resolveType?: Resolve): { code: string; message: string; at: string }[] {
    const source = `<template>${template}</template>\n<script>\n${script}\n</script>\n`;
    const scriptStart = source.indexOf('<script>\n') + '<script>\n'.length;
    const vf = buildVirtualFile(script, scriptStart, parseTemplate(template, 1), template, '<template>'.length, resolveType);
    const lines = source.split('\n');
    return getTsDiagnostics(svc, URI, vf, source).map((d) => {
        const line = lines[d.range.start.line];
        return { code: String(d.code), message: d.message.split('\n')[0], at: line.slice(d.range.start.character, d.range.end.character) };
    });
}

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
        // cannot state, until slots are typed with generics (#131).
        expect(diagnose('let x = $signal(1);', '<pdx-nav-menu><slot name="item" let:item><b>{{ item.label }}</b></slot></pdx-nav-menu>')).toEqual([]);
    });
});
