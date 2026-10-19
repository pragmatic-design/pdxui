// A library component's alpha change events, read from its manifest (#478, part 1 of #125).
//
// A component that moves to its model no longer emits its alpha change event. Its manifest records
// the alpha events (`alphaEvents`) and how each alpha `detail.<field>` reads now (`alphaDetail`); the
// resolver hands them out as `alphaOf`, and the model's event as `modelEventOf`. The compiler reports
// a listener on an alpha event as PDX_REMOVED_FORM naming the model's event, the form binding listens
// to that event, and `pdx migrate` rewrites what it can (packages/cli/tests/migrate-alpha-events.test.ts).

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

describe('the form binding', () => {
    const SETUP = "<script>\n  let f = $form({ agree: false });\n</script>";
    const formCode = (modelEventOf?: (tag: string) => { model: string; event: string } | null) =>
        compile(`<template>\n<pdx-form :form="f"><pdx-checkbox name="agree"></pdx-checkbox></pdx-form>\n</template>\n${SETUP}`, 'form.pdx', [], undefined, { modelEventOf }).code;

    it('a control that lists models listens to its first model\'s event and reads detail.value', () => {
        const code = formCode((tag) => (tag === 'pdx-checkbox' ? { model: 'checked', event: 'checked-change' } : null));
        expect(code).toContain('checked-change');
        expect(code).toContain('e.detail.value');
        expect(code).not.toContain("'pdx-change'");
    });

    it('control: one that lists none keeps its hand-written alpha event', () => {
        const code = formCode();
        expect(code).toContain('pdx-change');
        expect(code).toContain('e.detail?.checked');
        expect(code).not.toContain('checked-change');
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
            exports: { './box': './src/box.js', './plain': './src/plain.js', './loose': './src/loose.js' },
        });
        write('node_modules/@acme/widgets/custom-elements.json', {
            schemaVersion: '1.0.0',
            modules: [
                { kind: 'javascript-module', path: 'src/box.js', declarations: [declaration('acme-box', {
                    models: ['checked', 'indeterminate'],
                    alphaEvents: ['pdx-change'], alphaDetail: { checked: '$event.detail.value' },
                })] },
                { kind: 'javascript-module', path: 'src/plain.js', declarations: [declaration('acme-plain', {})] },
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
});
