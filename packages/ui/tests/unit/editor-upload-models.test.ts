// The editors and the upload declare their model (#482, part 5 of #125).
//
// Each announces a change with `value-change` carrying `{ value }`, and none of the alpha names
// (`pdx-change`, `change`, `pdx-input`). The manifest lists the model, and a parent's `::value` binds it
// both ways: the signal sets the component, the component's own interaction sets the signal.

import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import * as core from '@pdxui/core';
import { compile } from '../../../compiler/src/plugin';
import { tick, cleanup } from './helpers';
import '../../src/rich-text/pdx-rich-text';
import '../../src/json-editor/pdx-json-editor';
import '../../src/input/pdx-input';
import '../../src/file-upload/pdx-file-upload';
import '../../src/inline-edit/pdx-inline-edit';

const TAGS = ['pdx-rich-text', 'pdx-json-editor', 'pdx-file-upload', 'pdx-inline-edit'];
const ALPHA = ['pdx-change', 'change', 'pdx-input'];
/** The ones that had an alpha change event, which `pdx migrate` must know of. pdx-file-upload had none. */
const HAD_ALPHA = ['pdx-rich-text', 'pdx-json-editor', 'pdx-inline-edit'];

afterEach(() => cleanup());

describe('the manifest', () => {
    const manifest = JSON.parse(readFileSync(join(__dirname, '..', '..', 'custom-elements.json'), 'utf8')) as {
        modules: { declarations: { tagName?: string; models?: string[]; events?: { name: string }[]; alphaEvents?: string[] }[] }[];
    };
    const decl = (tag: string) => manifest.modules.flatMap((m) => m.declarations).find((d) => d.tagName === tag);

    for (const tag of TAGS) {
        it(`${tag} lists its model, value-change, and no alpha event`, () => {
            const d = decl(tag);
            expect(d?.models).toEqual(['value']);
            const events = (d?.events ?? []).map((e) => e.name);
            expect(events).toContain('value-change');
            expect(events.filter((e) => ALPHA.includes(e))).toEqual([]);
            if (HAD_ALPHA.includes(tag)) expect(d?.alphaEvents, `${tag} records no alpha event`).toEqual(['pdx-change']);
        });
    }
});

/** Every CustomEvent the component dispatches among the alpha names and value-change, in order. */
function record(el: Element): [string, unknown][] {
    const seen: [string, unknown][] = [];
    for (const name of [...ALPHA, 'value-change']) {
        el.addEventListener(name, (e) => { if (e instanceof CustomEvent && e.target === el) seen.push([name, e.detail]); });
    }
    return seen;
}

const file = (name: string) => new File(['x'], name, { type: 'text/plain' });
const key = (el: Element, k: string) => el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
const type = (field: HTMLInputElement, text: string) => { field.value = text; field.dispatchEvent(new Event('input', { bubbles: true })); };

async function mount<T extends HTMLElement>(markup: string, setup?: (el: T) => void): Promise<T> {
    document.body.innerHTML = markup;
    const el = document.body.firstElementChild as T;
    setup?.(el);
    await tick(150);
    return el;
}

describe('an edit announces value-change, and no alpha event', () => {
    it('pdx-rich-text', async () => {
        const el = await mount<HTMLElement & { setHTML(h: string): void }>('<pdx-rich-text output="html"></pdx-rich-text>');
        const seen = record(el);
        el.setHTML('<p>scritto</p>');
        await tick();
        expect(seen).toEqual([['value-change', { value: '<p>scritto</p>' }]]);
    });

    it('pdx-json-editor', async () => {
        const el = await mount<HTMLElement & { schema: unknown; value: unknown }>('<pdx-json-editor></pdx-json-editor>', (e) => {
            e.schema = { label: 'Profile', fields: [{ k: 'name', label: 'Name' }] };
            e.value = { name: 'Grace' };
        });
        const seen = record(el);
        type(el.querySelector('input')!, 'Ada');
        await tick();
        expect(seen).toEqual([['value-change', { value: { name: 'Ada' } }]]);
    });

    it('pdx-file-upload: adding and removing a file', async () => {
        const el = await mount<HTMLElement & { addFiles(f: File[]): void; removeFile(i: number): void }>('<pdx-file-upload multiple></pdx-file-upload>');
        const seen = record(el);
        const a = file('a.txt');
        el.addFiles([a]);
        el.removeFile(0);
        expect(seen).toEqual([['value-change', { value: [a] }], ['value-change', { value: [] }]]);
    });

    it('pdx-inline-edit: a commit', async () => {
        const el = await mount<HTMLElement & { value: unknown }>('<pdx-inline-edit></pdx-inline-edit>', (e) => { e.value = 'John'; });
        const seen = record(el);
        const display = el.querySelector('.pdx-inline-edit-display') as HTMLElement;
        display.focus();
        key(display, 'Enter');
        const inp = el.querySelector('input.pdx-inline-edit-input') as HTMLInputElement;
        type(inp, 'Jane');
        key(inp, 'Enter');
        await tick(20);
        expect(seen).toEqual([['value-change', { value: 'Jane' }]]);
    });
});

describe('::value binds each both ways', () => {
    function load(filename: string, source: string): void {
        const { code } = compile(source, filename, [], undefined, {});
        const body = code.replace(/import\s*\{([^}]*)\}\s*from\s*'@pdxui\/core';?/, 'const {$1} = __core;');
        new Function('__core', body)(core);
    }

    beforeAll(() => {
        load('editor-parent.pdx', `<template>
<pdx-rich-text class="rt" output="html" ::value="doc"></pdx-rich-text>
<pdx-json-editor class="je" :schema="schema" ::value="profile"></pdx-json-editor>
<pdx-file-upload class="fu" multiple ::value="files"></pdx-file-upload>
<pdx-inline-edit class="ie" ::value="title"></pdx-inline-edit>
<p class="out">{{ doc }}|{{ profile ? profile.name : '' }}|{{ files.map(f => f.name).join(',') }}|{{ title }}</p>
<button class="set" @click="doc = '<p>dal genitore</p>'; profile = { name: 'Linus' }; files = [picked]; title = 'Set'">set</button>
</template>
<script>
@tag 'pdx-editor-parent';
const schema = { label: 'Profile', fields: [{ k: 'name', label: 'Name' }] };
const picked = new File(['x'], 'picked.txt', { type: 'text/plain' });
let doc = $signal('<p>iniziale</p>');
let profile = $signal({ name: 'Grace' });
let files = $signal([]);
let title = $signal('Start');
</script>`);
    });

    async function parent(): Promise<HTMLElement> {
        const el = document.createElement('pdx-editor-parent');
        document.body.appendChild(el);
        await tick(150);
        return el;
    }

    it('the signal sets the component', async () => {
        const el = await parent();
        el.querySelector<HTMLButtonElement>('.set')!.click();
        await tick(150);
        expect((el.querySelector('.rt') as HTMLElement & { getHTML(): string }).getHTML()).toBe('<p>dal genitore</p>');
        expect((el.querySelector('.je input') as HTMLInputElement).value).toBe('Linus');
        expect(el.querySelector('.fu')!.textContent).toContain('picked.txt');
        expect(el.querySelector('.ie .pdx-inline-edit-text')!.textContent).toBe('Set');
    });

    it('the component\'s own interaction sets the signal', async () => {
        const el = await parent();
        (el.querySelector('.rt') as HTMLElement & { setHTML(h: string): void }).setHTML('<p>scritto</p>');
        type(el.querySelector('.je input') as HTMLInputElement, 'Ada');
        const a = file('a.txt');
        (el.querySelector('.fu') as HTMLElement & { addFiles(f: File[]): void }).addFiles([a]);
        const ie = el.querySelector('.ie')!;
        const display = ie.querySelector('.pdx-inline-edit-display') as HTMLElement;
        display.focus();
        key(display, 'Enter');
        const inp = ie.querySelector('input.pdx-inline-edit-input') as HTMLInputElement;
        type(inp, 'Typed');
        key(inp, 'Enter');
        await tick(50);
        expect(el.querySelector('.out')!.textContent).toBe('<p>scritto</p>|Ada|a.txt|Typed');
    });
});
