// A library component's alpha change events, read from its manifest (#478, part 1 of #125).
//
// A component that moves to its model no longer emits its alpha change event. Its manifest records
// the alpha events (`alphaEvents`) and how each alpha `detail.<field>` reads now (`alphaDetail`); the
// resolver hands them out as `alphaOf`, and the model's event as `modelEventOf`. The compiler reports
// a listener on an alpha event as PDX_REMOVED_FORM naming the model's event, and `pdx migrate`
// rewrites what it can (packages/cli/tests/migrate-alpha-events.test.ts).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { ComponentResolver } from '../src/component-resolver';
import { compile } from '../src/plugin';
import { alphaChangeEvent, alphaChangeListener, type AlphaLookup } from '../src/language/alpha-events';

/** `pdx-x` moved to its model `checked`: it emitted `pdx-change` and `change`. */
const ALPHA: AlphaLookup = (tag) => (tag === 'pdx-x' ? {
    events: ['pdx-change', 'change'],
    detail: { checked: '$event.detail.value', value: '$event.currentTarget.value' },
    modelEvent: 'checked-change',
} : null);

const page = (template: string) => `<template>\n  ${template}\n</template>\n<script>\nlet total = $signal(0);\nfunction save(v) { total = v; }\n</script>\n`;

const removed = (template: string, options: { alphaOf?: AlphaLookup } = { alphaOf: ALPHA }) =>
    compile(page(template), 'page.pdx', [], undefined, options).warnings.filter((w) => w.code === 'PDX_REMOVED_FORM');

describe('a listener on an alpha change event', () => {
    it('is PDX_REMOVED_FORM, an error at its line that names the model\'s event', () => {
        const found = removed('<pdx-x @pdx-change="e => total = e.detail.checked"></pdx-x>');
        expect(found).toHaveLength(1);
        expect(found[0]).toMatchObject({ severity: 'error', line: 2 });
        expect(found[0].message).toContain('`@pdx-change`');
        expect(found[0].message).toContain('`@checked-change`');
    });

    it('control: the same listener on a tag whose manifest records nothing', () => {
        expect(removed('<pdx-y @pdx-change="e => total = e.detail.checked"></pdx-y>')).toEqual([]);
    });

    it('control: with no alphaOf, as a compile without a component registry', () => {
        expect(removed('<pdx-x @pdx-change="e => total = 1"></pdx-x>', {})).toEqual([]);
    });

    it('@change is not an error: a native change from an inner input still reaches the host', () => {
        expect(removed('<pdx-x @change="save(1)"></pdx-x>')).toEqual([]);
        expect(alphaChangeListener.detect('<pdx-x @change="save(1)"></pdx-x>', { alphaOf: ALPHA }))
            .toEqual([{ line: 1, found: '@change', note: 'Its model\'s event is `@checked-change`.' }]);
    });
});

describe('the rewrite pdx migrate applies', () => {
    const fix = (text: string) => (alphaChangeEvent.fix as (t: string, c: object) => string)(text, { alphaOf: ALPHA });

    it('an arrow reading detail.checked and detail.value', () => {
        expect(fix('<pdx-x @pdx-change="e => total = e.detail.checked ? e.detail.value : 0"></pdx-x>'))
            .toBe('<pdx-x @checked-change="e => total = e.detail.value ? e.currentTarget.value : 0"></pdx-x>');
    });

    it('a mapping that reads the event twice, not at its start, is written with the arrow\'s parameter throughout', () => {
        const alphaOf: AlphaLookup = (tag) => (tag === 'pdx-x'
            ? { events: ['pdx-change'], detail: { state: '($event.currentTarget.indeterminate ? null : $event.detail.value)' }, modelEvent: 'checked-change' }
            : null);
        const fixed = (alphaChangeEvent.fix as (t: string, c: object) => string)('<pdx-x @pdx-change="e => save(e.detail.state)"></pdx-x>', { alphaOf });
        expect(fixed).toBe('<pdx-x @checked-change="e => save((e.currentTarget.indeterminate ? null : e.detail.value))"></pdx-x>');
    });

    it('an inline handler through $event, modifiers kept', () => {
        expect(fix('<pdx-x @pdx-change.stop="save($event.detail.checked)"></pdx-x>'))
            .toBe('<pdx-x @checked-change.stop="save($event.detail.value)"></pdx-x>');
    });

    it('leaves what a person must rewrite: a reference, the event or its detail on whole, an unmapped field', () => {
        for (const handler of ['onChange', 'save($event)', 'e => save(e.detail)', 'e => save(e.detail.indeterminate)']) {
            const text = `<pdx-x @pdx-change="${handler}"></pdx-x>`;
            expect(fix(text), handler).toBe(text);
        }
    });

    it('is idempotent: a rewritten listener is no longer found', () => {
        const once = fix('<pdx-x @pdx-change="save($event.detail.checked)"></pdx-x>');
        expect(alphaChangeEvent.detect(once, { alphaOf: ALPHA })).toEqual([]);
        expect(fix(once)).toBe(once);
    });
});

describe('a text field\'s commit event (#479)', () => {
    // `pdx-t` moved to its model `value`: `pdx-input` was live, `pdx-change` the commit, on blur or Enter.
    // The live one becomes the model's event; the commit becomes the inner input's native `change`.
    const TEXT: AlphaLookup = (tag) => (tag === 'pdx-t' ? {
        events: ['pdx-input', 'pdx-change'],
        detail: { value: '$event.currentTarget.value' },
        modelEvent: 'value-change',
        commit: 'pdx-change',
    } : null);
    const fix = (text: string) => (alphaChangeEvent.fix as (t: string, c: object) => string)(text, { alphaOf: TEXT });

    it('the commit listener becomes @change, the live one the model\'s event, each reading the host\'s value', () => {
        expect(fix('<pdx-t @pdx-change="e => save(e.detail.value)" @pdx-input="total = $event.detail.value"></pdx-t>'))
            .toBe('<pdx-t @change="e => save(e.currentTarget.value)" @value-change="total = $event.currentTarget.value"></pdx-t>');
    });

    it('PDX_REMOVED_FORM names @change for the commit, the model\'s event for the live one', () => {
        const found = compile(page('<pdx-t @pdx-change="save(1)" @pdx-input="save(2)"></pdx-t>'), 'page.pdx', [], undefined, { alphaOf: TEXT })
            .warnings.filter((w) => w.code === 'PDX_REMOVED_FORM');
        expect(found.map((w) => w.message.includes('`@change`'))).toEqual([true, false]);
        expect(found[1].message).toContain('`@value-change`');
    });

    it('a rewritten commit listener is not found again: @change on a tag that never emitted change', () => {
        const once = fix('<pdx-t @pdx-change="save($event.detail.value)"></pdx-t>');
        expect(alphaChangeEvent.detect(once, { alphaOf: TEXT })).toEqual([]);
        expect(alphaChangeListener.detect(once, { alphaOf: TEXT })).toEqual([]);
    });
});

describe('an alpha event renamed to a declared event (#481)', () => {
    // `pdx-q` moved to its model `value`, the selection: `pdx-change` was the selection, `pdx-input` the
    // query typed, which is not the value. The query is now a declared `query-change`.
    const PICK: AlphaLookup = (tag) => (tag === 'pdx-q' ? {
        events: ['pdx-input', 'pdx-change'],
        detail: { value: '$event.detail.value' },
        modelEvent: 'value-change',
        renamed: { 'pdx-input': 'query-change' },
    } : null);
    const fix = (text: string) => (alphaChangeEvent.fix as (t: string, c: object) => string)(text, { alphaOf: PICK });

    it('the renamed listener moves to its new name, the other to the model\'s event', () => {
        expect(fix('<pdx-q @pdx-input="e => load(e.detail.value)" @pdx-change="save($event.detail.value)"></pdx-q>'))
            .toBe('<pdx-q @query-change="e => load(e.detail.value)" @value-change="save($event.detail.value)"></pdx-q>');
    });

    it('PDX_REMOVED_FORM names the new event for the renamed one', () => {
        const found = compile(page('<pdx-q @pdx-input="save(1)" @pdx-change="save(2)"></pdx-q>'), 'page.pdx', [], undefined, { alphaOf: PICK })
            .warnings.filter((w) => w.code === 'PDX_REMOVED_FORM');
        expect(found[0].message).toContain('`@query-change`');
        expect(found[1].message).toContain('`@value-change`');
    });
});

describe('the resolver reads them from a manifest', () => {
    let root: string;
    const write = (rel: string, content: unknown) => {
        const full = join(root, rel);
        mkdirSync(dirname(full), { recursive: true });
        writeFileSync(full, typeof content === 'string' ? content : JSON.stringify(content, null, 2));
    };
    const declaration = (tagName: string, extra: object) => ({ kind: 'class', customElement: true, name: tagName, tagName, members: [], ...extra });

    beforeEach(() => {
        root = mkdtempSync(join(tmpdir(), 'pdx-alpha-'));
        write('package.json', { name: 'app', dependencies: { '@acme/widgets': '1.0.0' } });
        write('node_modules/@acme/widgets/package.json', {
            name: '@acme/widgets', version: '1.0.0', customElements: 'custom-elements.json',
            exports: { './box': './src/box.js', './plain': './src/plain.js', './loose': './src/loose.js', './field': './src/field.js', './pick': './src/pick.js' },
        });
        write('node_modules/@acme/widgets/custom-elements.json', {
            schemaVersion: '1.0.0',
            modules: [
                { kind: 'javascript-module', path: 'src/box.js', declarations: [declaration('acme-box', {
                    models: ['checked', 'indeterminate'],
                    alphaEvents: ['pdx-change'], alphaDetail: { checked: '$event.detail.value' },
                })] },
                { kind: 'javascript-module', path: 'src/plain.js', declarations: [declaration('acme-plain', {})] },
                { kind: 'javascript-module', path: 'src/field.js', declarations: [declaration('acme-field', {
                    models: ['value'],
                    alphaEvents: ['pdx-input', 'pdx-change'], alphaDetail: { value: '$event.currentTarget.value' }, alphaCommit: 'pdx-change',
                })] },
                { kind: 'javascript-module', path: 'src/pick.js', declarations: [declaration('acme-pick', {
                    models: ['value'],
                    alphaEvents: ['pdx-input', 'pdx-change'], alphaDetail: { value: '$event.detail.value' }, alphaRename: { 'pdx-input': 'query-change' },
                })] },
                // Alpha events with no model to name instead: nothing to point a listener at.
                { kind: 'javascript-module', path: 'src/loose.js', declarations: [declaration('acme-loose', { alphaEvents: ['pdx-change'] })] },
            ],
        });
    });
    afterEach(() => { rmSync(root, { recursive: true, force: true }); });

    it('modelEventOf is the first model and its event', () => {
        const r = new ComponentResolver();
        r.registerUiManifest(root);
        expect(r.modelEventOf('acme-box')).toEqual({ model: 'checked', event: 'checked-change' });
        expect(r.modelEventOf('acme-plain')).toBeNull();
    });

    it('alphaOf is the alpha events, the detail map and the model\'s event', () => {
        const r = new ComponentResolver();
        r.registerUiManifest(root);
        expect(r.alphaOf('acme-box')).toEqual({ events: ['pdx-change'], detail: { checked: '$event.detail.value' }, modelEvent: 'checked-change' });
        expect(r.alphaOf('acme-plain')).toBeNull();
        expect(r.alphaOf('acme-loose')).toBeNull();
    });

    it('alphaOf carries the commit event a text field records (#479)', () => {
        const r = new ComponentResolver();
        r.registerUiManifest(root);
        expect(r.alphaOf('acme-field')).toEqual({
            events: ['pdx-input', 'pdx-change'], detail: { value: '$event.currentTarget.value' }, modelEvent: 'value-change', commit: 'pdx-change',
        });
    });

    it('alphaOf carries an alpha event renamed to a declared event (#481)', () => {
        const r = new ComponentResolver();
        r.registerUiManifest(root);
        expect(r.alphaOf('acme-pick')).toEqual({
            events: ['pdx-input', 'pdx-change'], detail: { value: '$event.detail.value' }, modelEvent: 'value-change', renamed: { 'pdx-input': 'query-change' },
        });
    });
});

// The shipped manifest, as `pdx migrate` reads it in a project that depends on @pdxui/ui.
describe('the navigation components, from the shipped manifest (#289)', () => {
    const r = new ComponentResolver();
    r.registerUiManifest(process.cwd());
    const fix = (text: string): string => {
        const apply = alphaChangeEvent.fix;
        // The rule rewrites, it does not only flag: a `'flag'` here is the failure.
        if (typeof apply !== 'function') throw new Error('alpha-change-event no longer rewrites');
        return apply(text, { alphaOf: (tag: string) => r.alphaOf(tag) });
    };

    it('pdx-tabs: @pdx-change becomes @value-change', () => {
        expect(fix('<pdx-tabs @pdx-change="tab = $event.detail.value"></pdx-tabs>'))
            .toBe('<pdx-tabs @value-change="tab = $event.detail.value"></pdx-tabs>');
    });

    it('pdx-pagination: @pdx-change becomes @page-change, its page read as the value and its size off the host', () => {
        expect(fix('<pdx-pagination @pdx-change="load($event.detail.page, $event.detail.pageSize)"></pdx-pagination>'))
            .toBe('<pdx-pagination @page-change="load($event.detail.value, $event.currentTarget.pageSize)"></pdx-pagination>');
    });

    it('pdx-wizard: @pdx-change becomes @value-change; one that reads detail.previous is left for a person', () => {
        expect(fix('<pdx-wizard @pdx-change="s = $event.detail.value"></pdx-wizard>'))
            .toBe('<pdx-wizard @value-change="s = $event.detail.value"></pdx-wizard>');
        const reads = '<pdx-wizard @pdx-change="log($event.detail.previous)"></pdx-wizard>';
        expect(fix(reads)).toBe(reads);
    });

    it('pdx-scroll-spy: with no model, @pdx-change becomes the read-only @section-change, its section read as the value', () => {
        expect(fix('<pdx-scroll-spy @pdx-change="current = $event.detail.section"></pdx-scroll-spy>'))
            .toBe('<pdx-scroll-spy @section-change="current = $event.detail.value"></pdx-scroll-spy>');
    });
});

describe('the layout components, from the shipped manifest (#290)', () => {
    const r = new ComponentResolver();
    r.registerUiManifest(process.cwd());
    const fix = (text: string): string => {
        const apply = alphaChangeEvent.fix;
        if (typeof apply !== 'function') throw new Error('alpha-change-event no longer rewrites');
        return apply(text, { alphaOf: (tag: string) => r.alphaOf(tag) });
    };

    it('pdx-accordion: @pdx-change becomes @open-change; one that reads detail.open, which has no beta form, is left for a person', () => {
        expect(fix('<pdx-accordion @pdx-change="saveLayout()"></pdx-accordion>'))
            .toBe('<pdx-accordion @open-change="saveLayout()"></pdx-accordion>');
        const reads = '<pdx-accordion @pdx-change="log($event.detail.open)"></pdx-accordion>';
        expect(fix(reads)).toBe(reads);
    });
});
