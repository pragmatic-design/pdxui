// The pickers declare their model (#481, part 4 of #125).
//
// Each announces a change of its value with `value-change` carrying `{ value }`, and none of the alpha
// names (`pdx-change`, `change`, `valuechange`, `pressedchange`, `pdx-pressed-change`, `pdx-input`).
// The owner's decisions on #481:
// - autocomplete's query and tag-input's draft are not the value: each is a declared event of its own,
//   `query-change` and `draft-change`, which `pdx migrate` rewrites `@pdx-input` to (`alphaRename`);
// - color-picker's and mention's commit is a native `change`, as the text fields' is since #479;
// - the value is the mode's whole value: `[start, end]` for a range, an array for several dates.

import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import * as core from '@pdxui/core';
import { compile } from '../../../compiler/src/plugin';
import { tick, cleanup } from './helpers';
import '../../src/select/pdx-select';
import '../../src/autocomplete/pdx-autocomplete';
import '../../src/cascader/pdx-cascader';
import '../../src/tree-select/pdx-tree-select';
import '../../src/transfer/pdx-transfer';
import '../../src/tag-input/pdx-tag-input';
import '../../src/mention/pdx-mention';
import '../../src/date-picker/pdx-date-picker';
import '../../src/time-picker/pdx-time-picker';
import '../../src/calendar/pdx-calendar';
import '../../src/color-picker/pdx-color-picker';
import '../../src/json-editor/pdx-json-editor';

const ALPHA = ['pdx-change', 'change', 'valuechange', 'pressedchange', 'pdx-pressed-change', 'pdx-input'];

/** What each recorded, as gen-manifest writes it. */
const RECORDED: Record<string, { events: string[]; commit?: string; rename?: Record<string, string> }> = {
    'pdx-select': { events: ['pdx-change'] },
    'pdx-autocomplete': { events: ['pdx-input', 'pdx-change'], rename: { 'pdx-input': 'query-change' } },
    'pdx-cascader': { events: ['pdx-change'] },
    'pdx-tree-select': { events: ['pdx-change'] },
    'pdx-transfer': { events: ['pdx-change'] },
    'pdx-tag-input': { events: ['pdx-input', 'pdx-change'], rename: { 'pdx-input': 'draft-change' } },
    'pdx-mention': { events: ['pdx-input', 'pdx-change'], commit: 'pdx-change' },
    'pdx-date-picker': { events: ['pdx-change'] },
    'pdx-time-picker': { events: ['pdx-change', 'pdx-input'] },
    'pdx-calendar': { events: ['pdx-change'] },
    'pdx-color-picker': { events: ['pdx-input', 'pdx-change'], commit: 'pdx-change' },
};
const TAGS = Object.keys(RECORDED);

afterEach(() => cleanup());

describe('the manifest', () => {
    type Decl = { tagName?: string; models?: string[]; events?: { name: string }[]; alphaEvents?: string[]; alphaCommit?: string; alphaRename?: Record<string, string> };
    const manifest = JSON.parse(readFileSync(join(__dirname, '..', '..', 'custom-elements.json'), 'utf8')) as { modules: { declarations: Decl[] }[] };
    const decl = (tag: string) => manifest.modules.flatMap((m) => m.declarations).find((d) => d.tagName === tag);

    for (const tag of TAGS) {
        it(`${tag} lists its model, value-change, no alpha event, and what it recorded`, () => {
            const d = decl(tag);
            expect(d?.models).toEqual(['value']);
            const events = (d?.events ?? []).map((e) => e.name);
            expect(events).toContain('value-change');
            expect(events.filter((e) => ALPHA.includes(e))).toEqual([]);
            expect(d?.alphaEvents).toEqual(RECORDED[tag].events);
            expect(d?.alphaCommit).toBe(RECORDED[tag].commit);
            expect(d?.alphaRename).toEqual(RECORDED[tag].rename);
            for (const renamed of Object.values(RECORDED[tag].rename ?? {})) expect(events, `${tag} declares ${renamed}`).toContain(renamed);
        });
    }
});

/** Every event among the alpha names, value-change and the renamed ones, in order, with its detail. */
function record(el: Element): [string, unknown][] {
    const seen: [string, unknown][] = [];
    for (const name of [...ALPHA, 'value-change', 'query-change', 'draft-change']) {
        el.addEventListener(name, (e) => {
            // A native `change` is the commit (#479): counted apart, by name only.
            if (!(e instanceof CustomEvent)) { seen.push([`native ${name}`, null]); return; }
            if (e.target === el) seen.push([name, e.detail]);
        });
    }
    return seen;
}

const q = <T extends Element>(el: Element, sel: string): T => {
    const found = el.querySelector<T>(sel);
    if (!found) throw new Error(`no ${sel} in ${el.tagName.toLowerCase()}`);
    return found;
};
const typeInto = (field: HTMLInputElement | HTMLTextAreaElement, text: string, events: string[] = ['input']) => {
    field.value = text;
    for (const type of events) field.dispatchEvent(new Event(type, { bubbles: true }));
};
const key = (target: Element, k: string) => target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));

async function mount<T extends HTMLElement>(markup: string, setup?: (el: T) => void): Promise<T> {
    document.body.innerHTML = markup;
    const el = document.body.firstElementChild as T;
    setup?.(el);
    await tick(setup ? 200 : 60);
    return el;
}

type Props = HTMLElement & Record<string, unknown>;

describe('a change announces value-change, and no alpha event', () => {
    it('pdx-select: a pick', async () => {
        const el = await mount(`<pdx-select options='["Red","Green","Blue"]'></pdx-select>`);
        const seen = record(el);
        q<HTMLElement>(el, '.pdx-select-trigger').click();
        await tick();
        el.querySelectorAll<HTMLElement>('.pdx-select-option')[1].click();
        await tick();
        expect(seen).toEqual([['value-change', { value: 'Green' }]]);
    });

    it('pdx-select, multiple: the array of values', async () => {
        const el = await mount(`<pdx-select multiple options='["Red","Green","Blue"]'></pdx-select>`);
        const seen = record(el);
        q<HTMLElement>(el, '.pdx-select-trigger').click();
        await tick();
        el.querySelectorAll<HTMLElement>('.pdx-select-option')[0].click();
        el.querySelectorAll<HTMLElement>('.pdx-select-option')[2].click();
        await tick();
        expect(seen).toEqual([['value-change', { value: ['Red'] }], ['value-change', { value: ['Red', 'Blue'] }]]);
    });

    it('pdx-autocomplete: typing is query-change; a pick is the value, its value field', async () => {
        const el = await mount<Props>('<pdx-autocomplete></pdx-autocomplete>', (e) => {
            e.suggestions = [{ label: 'Rome', value: 'ROM' }, { label: 'Paris', value: 'PAR' }];
        });
        const seen = record(el);
        const field = q<HTMLInputElement>(el, 'input:not([type="hidden"])');
        field.focus();
        typeInto(field, 'Ro');
        await tick();
        q<HTMLElement>(el, '.pdx-autocomplete-option').dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
        await tick();
        expect(seen).toEqual([['query-change', { value: 'Ro' }], ['value-change', { value: 'ROM' }]]);
        expect((el as unknown as { getText(): string }).getText()).toBe('Rome');
        expect((el as unknown as { getSelectedItem(): unknown }).getSelectedItem()).toEqual({ label: 'Rome', value: 'ROM' });
    });

    it('pdx-cascader: a choice is the path', async () => {
        const el = await mount<Props>('<pdx-cascader></pdx-cascader>', (e) => { e.options = [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }]; });
        const seen = record(el);
        q<HTMLElement>(el, '.pdx-cascader-trigger').click();
        await tick();
        el.querySelectorAll<HTMLElement>('.pdx-cascader-item')[1].click();
        await tick();
        expect(seen).toEqual([['value-change', { value: ['b'] }]]);
        expect((el as unknown as { getLabels(): string[] }).getLabels()).toEqual(['B']);
    });

    it('pdx-tree-select: a node', async () => {
        const el = await mount<Props>('<pdx-tree-select></pdx-tree-select>', (e) => { e.options = [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }]; });
        const seen = record(el);
        q<HTMLElement>(el, '[role="combobox"]').click();
        await tick();
        el.querySelectorAll<HTMLElement>('[role="treeitem"]')[1].click();
        await tick();
        expect(seen).toEqual([['value-change', { value: 'b' }]]);
        expect((el as unknown as { getLabel(): string }).getLabel()).toBe('B');
    });

    it('pdx-transfer: a move is the target side', async () => {
        const el = await mount<Props>('<pdx-transfer></pdx-transfer>', (e) => {
            e.items = [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }];
            e.value = ['b'];
        });
        const seen = record(el);
        q<HTMLElement>(el.querySelectorAll('.pdx-transfer-panel')[0], '.pdx-transfer-item').click();
        await tick();
        el.querySelectorAll<HTMLButtonElement>('.pdx-transfer-btn')[0].click();
        await tick();
        expect(seen).toEqual([['value-change', { value: ['b', 'a'] }]]);
        expect((el as unknown as { getDirection(): string }).getDirection()).toBe('right');
    });

    it('pdx-tag-input: typing is draft-change; a tag is the value', async () => {
        const el = await mount('<pdx-tag-input></pdx-tag-input>');
        const seen = record(el);
        const field = q<HTMLInputElement>(el, 'input');
        typeInto(field, 'urgent');
        key(field, 'Enter');
        await tick();
        expect(seen).toEqual([['draft-change', { value: 'urgent' }], ['value-change', { value: ['urgent'] }]]);
    });

    it('pdx-mention: typing is the live model; a picked mention commits with a native change', async () => {
        const el = await mount<Props>('<pdx-mention></pdx-mention>', (e) => { e.items = [{ value: 'u1', label: 'Alice' }]; });
        const seen = record(el);
        const field = q<HTMLTextAreaElement>(el, 'textarea');
        field.focus();
        field.value = 'hi @';
        field.selectionStart = field.selectionEnd = 4;
        field.dispatchEvent(new Event('input', { bubbles: true }));
        await tick(50);
        q<HTMLElement>(el, '.pdx-mention-item').dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
        await tick();
        expect(seen).toEqual([['value-change', { value: 'hi @' }], ['value-change', { value: 'hi @Alice ' }], ['native change', null]]);
        expect((el as unknown as { getMentionMarkup(): string }).getMentionMarkup()).toBe('hi @[Alice](u1) ');
    });

    it('pdx-time-picker: a step', async () => {
        const el = await mount('<pdx-time-picker value="09:30"></pdx-time-picker>');
        const seen = record(el);
        key(el.querySelectorAll('[role="spinbutton"]')[0], 'ArrowUp');
        await tick();
        expect(seen).toEqual([['value-change', { value: '10:30' }]]);
    });

    it('pdx-calendar: a date, then a range as [start, end]', async () => {
        const one = await mount('<pdx-calendar inline value="2026-09-10"></pdx-calendar>');
        const seenOne = record(one);
        q<HTMLElement>(one, '[data-iso="2026-09-15"]').click();
        await tick();
        expect(seenOne).toEqual([['value-change', { value: '2026-09-15' }]]);

        const range = await mount('<pdx-calendar inline mode="range" value="2026-09-10"></pdx-calendar>');
        const seen = record(range);
        q<HTMLElement>(range, '[data-iso="2026-09-12"]').click();
        q<HTMLElement>(range, '[data-iso="2026-09-15"]').click();
        await tick();
        expect(seen).toEqual([['value-change', { value: ['2026-09-12', ''] }], ['value-change', { value: ['2026-09-12', '2026-09-15'] }]]);
        expect((range as unknown as { getRange(): string[] }).getRange()).toEqual(['2026-09-12', '2026-09-15']);
    });

    it('pdx-date-picker: a date the calendar picks, and a range', async () => {
        const one = await mount('<pdx-date-picker inline></pdx-date-picker>');
        const seenOne = record(one);
        q(one, 'pdx-calendar').dispatchEvent(new CustomEvent('value-change', { detail: { value: '2026-09-14' } }));
        await tick();
        expect(seenOne).toEqual([['value-change', { value: '2026-09-14' }]]);

        const range = await mount('<pdx-date-picker inline mode="daterange"></pdx-date-picker>');
        const seen = record(range);
        q(range, 'pdx-calendar').dispatchEvent(new CustomEvent('value-change', { detail: { value: ['2026-09-01', '2026-09-05'] } }));
        await tick();
        expect(seen).toEqual([['value-change', { value: ['2026-09-01', '2026-09-05'] }]]);
        expect((range as unknown as { getRange(): string[] }).getRange()).toEqual(['2026-09-01', '2026-09-05']);
    });

    it('pdx-date-picker, datetime: a time alone is a change of the value', async () => {
        const el = await mount('<pdx-date-picker inline mode="datetime" value="2026-09-14T09:00"></pdx-date-picker>');
        const seen = record(el);
        q(el, 'pdx-time-picker').dispatchEvent(new CustomEvent('value-change', { detail: { value: '10:30' } }));
        await tick();
        expect(seen).toEqual([['value-change', { value: '2026-09-14T10:30' }]]);
    });

    it('pdx-color-picker: a key step is live, the keyup commits with a native change', async () => {
        const el = await mount('<pdx-color-picker value="#ff0000" inline></pdx-color-picker>');
        const seen = record(el);
        const hue = q<HTMLElement>(el, '.pdx-color-hue-slider');
        key(hue, 'ArrowRight');
        hue.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowRight', bubbles: true }));
        await tick();
        expect(seen.map(([name]) => name)).toEqual(['value-change', 'native change']);
        // The format is hex: the value is the hex.
        expect((el as unknown as { getHex(): string }).getHex()).toBe((seen[0][1] as { value: string }).value);
        expect((el as Props).value).toBe((seen[0][1] as { value: string }).value);
    });
});

describe('the library hears its pickers by their model event, which does not bubble', () => {
    it('pdx-json-editor: a tag added in a taglist field is an edit of the document', async () => {
        const el = await mount<Props>('<pdx-json-editor></pdx-json-editor>', (e) => {
            e.schema = { label: 'Post', fields: [{ k: 'tags', label: 'Tags', type: 'taglist' }] };
            e.value = { tags: ['a'] };
        });
        const seen = record(el);
        const field = q<HTMLInputElement>(el, 'pdx-tag-input input');
        typeInto(field, 'b');
        key(field, 'Enter');
        await tick();
        // The draft's native `input` bubbles to the editor's root too, and is an edit of its own; the
        // tag is the last one.
        expect(seen.filter(([name]) => name === 'value-change').at(-1)).toEqual(['value-change', { value: { tags: ['a', 'b'] } }]);
        expect((el as Props).value).toEqual({ tags: ['a', 'b'] });
    });
});

describe('::value binds each both ways', () => {
    function load(filename: string, source: string): void {
        const { code } = compile(source, filename, [], undefined, {});
        const body = code.replace(/import\s*\{([^}]*)\}\s*from\s*'@pdxui\/core';?/, 'const {$1} = __core;');
        new Function('__core', body)(core);
    }

    beforeAll(() => {
        load('picker-parent.pdx', `<template>
<pdx-select class="sel" :options="colors" ::value="color"></pdx-select>
<pdx-tag-input class="tags" ::value="tags"></pdx-tag-input>
<pdx-time-picker class="time" ::value="time"></pdx-time-picker>
<pdx-calendar class="cal" inline ::value="day"></pdx-calendar>
<pdx-cascader class="cas" :options="tree" ::value="path"></pdx-cascader>
<p class="out">{{ color }}|{{ tags.join(',') }}|{{ time }}|{{ day }}|{{ path.join('/') }}</p>
<button class="set" @click="color = 'Blue'; tags = ['a', 'b']; time = '07:15'; day = '2026-09-20'; path = ['b']">set</button>
</template>
<script>
@tag 'pdx-picker-parent';
const colors = ['Red', 'Green', 'Blue'];
const tree = [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }];
let color = $signal('Red');
let tags = $signal([]);
let time = $signal('09:30');
let day = $signal('2026-09-10');
let path = $signal(['a']);
</script>`);
    });

    async function parent(): Promise<HTMLElement> {
        const el = document.createElement('pdx-picker-parent');
        document.body.appendChild(el);
        await tick(200);
        return el;
    }

    it('the signal sets the component', async () => {
        const el = await parent();
        el.querySelector<HTMLButtonElement>('.set')!.click();
        await tick(200);
        expect((el.querySelector('.sel') as Props).value).toBe('Blue');
        expect(el.querySelector('.sel .pdx-select-value')!.textContent).toBe('Blue');
        expect([...el.querySelectorAll('.tags .pdx-chip')].map((c) => c.textContent?.replace('×', '').trim())).toEqual(['a', 'b']);
        expect(el.querySelectorAll('.time [role="spinbutton"]')[0].getAttribute('aria-valuenow')).toBe('7');
        expect(el.querySelector('.cal [data-iso="2026-09-20"]')!.getAttribute('aria-selected')).toBe('true');
        expect((el.querySelector('.cas') as unknown as { getValue(): string[] }).getValue()).toEqual(['b']);
    });

    it('the component\'s own interaction sets the signal', async () => {
        const el = await parent();
        const sel = el.querySelector('.sel')!;
        q<HTMLElement>(sel, '.pdx-select-trigger').click();
        await tick();
        sel.querySelectorAll<HTMLElement>('.pdx-select-option')[1].click();
        const field = q<HTMLInputElement>(el, '.tags input');
        typeInto(field, 'x');
        key(field, 'Enter');
        key(el.querySelectorAll('.time [role="spinbutton"]')[0], 'ArrowUp');
        q<HTMLElement>(el, '.cal [data-iso="2026-09-15"]').click();
        const cas = el.querySelector('.cas')!;
        q<HTMLElement>(cas, '.pdx-cascader-trigger').click();
        await tick();
        cas.querySelectorAll<HTMLElement>('.pdx-cascader-item')[1].click();
        await tick(60);
        expect(el.querySelector('.out')!.textContent).toBe('Green|x|10:30|2026-09-15|b');
    });
});
