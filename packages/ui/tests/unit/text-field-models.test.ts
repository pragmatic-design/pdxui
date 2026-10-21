// The text fields declare their model (#479, part 2 of #125).
//
// Each announces a change with `value-change` carrying `{ value }`, live, on every write, and none of the
// alpha names (`pdx-input`, `pdx-change`, `change`, `valuechange`). The commit, on blur or Enter, is the
// inner input's native `change`, which bubbles to the host (owner's decision on #479); where the
// component commits a value no typing produced — a stepper, the clear button — it dispatches that
// `change` itself. The manifest lists the model and the alpha events, and a parent's `::value` binds it
// both ways.

import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import * as core from '@pdxui/core';
import { compile } from '../../../compiler/src/plugin';
import { tick, cleanup } from './helpers';
import '../../src/input/pdx-input';
import '../../src/textarea/pdx-textarea';
import '../../src/number-input/pdx-number-input';
import '../../src/password-input/pdx-password-input';
import '../../src/search-input/pdx-search-input';
import '../../src/masked-input/pdx-masked-input';
import '../../src/otp-input/pdx-otp-input';

const TAGS = ['pdx-input', 'pdx-textarea', 'pdx-number-input', 'pdx-password-input', 'pdx-search-input', 'pdx-masked-input', 'pdx-otp-input'];
const ALPHA = ['pdx-change', 'change', 'valuechange', 'pressedchange', 'pdx-pressed-change', 'pdx-input'];
/** What each emitted before, and whether its `pdx-change` was a commit apart from a live `pdx-input`. */
const RECORDED: Record<string, { events: string[]; commit?: string }> = {
    'pdx-input': { events: ['pdx-input', 'pdx-change'], commit: 'pdx-change' },
    'pdx-textarea': { events: ['pdx-input', 'pdx-change'], commit: 'pdx-change' },
    'pdx-number-input': { events: ['pdx-input', 'pdx-change'], commit: 'pdx-change' },
    'pdx-password-input': { events: ['pdx-input', 'pdx-change'], commit: 'pdx-change' },
    'pdx-search-input': { events: ['pdx-input'] },
    'pdx-masked-input': { events: ['pdx-input', 'pdx-change'], commit: 'pdx-change' },
    'pdx-otp-input': { events: ['pdx-input'] },
};

afterEach(() => cleanup());

describe('the manifest', () => {
    const manifest = JSON.parse(readFileSync(join(__dirname, '..', '..', 'custom-elements.json'), 'utf8')) as {
        modules: { declarations: { tagName?: string; models?: string[]; events?: { name: string }[]; alphaEvents?: string[]; alphaCommit?: string }[] }[];
    };
    const decl = (tag: string) => manifest.modules.flatMap((m) => m.declarations).find((d) => d.tagName === tag);

    for (const tag of TAGS) {
        it(`${tag} lists its model, value-change, no alpha event, and records what it emitted`, () => {
            const d = decl(tag);
            expect(d?.models).toEqual(['value']);
            const events = (d?.events ?? []).map((e) => e.name);
            expect(events).toContain('value-change');
            expect(events.filter((e) => ALPHA.includes(e))).toEqual([]);
            expect(d?.alphaEvents).toEqual(RECORDED[tag].events);
            expect(d?.alphaCommit).toBe(RECORDED[tag].commit);
        });
    }
});

/** Every CustomEvent the component dispatches among the alpha names and value-change, and every native change, in order. */
function record(el: Element): [string, unknown][] {
    const seen: [string, unknown][] = [];
    for (const name of [...ALPHA, 'value-change']) {
        el.addEventListener(name, (e) => {
            if (e instanceof CustomEvent && e.target === el) seen.push([name, e.detail]);
            else if (name === 'change' && !(e instanceof CustomEvent)) seen.push(['native change', (el as unknown as { value: unknown }).value]);
        });
    }
    return seen;
}

const type = (field: HTMLInputElement | HTMLTextAreaElement, text: string) => { field.value = text; field.dispatchEvent(new Event('input', { bubbles: true })); };

async function mount<T extends HTMLElement>(markup: string): Promise<T> {
    document.body.innerHTML = markup;
    await tick(150);
    return document.body.firstElementChild as T;
}

describe('typing announces value-change, and no alpha event', () => {
    const cases: [string, string, string, unknown][] = [
        ['pdx-input', 'input', 'Ada', 'Ada'],
        ['pdx-textarea', 'textarea', 'Ada', 'Ada'],
        ['pdx-number-input', 'input', '42', 42],
        ['pdx-password-input', 'input', 'secret', 'secret'],
        ['pdx-search-input', 'input', 'query', 'query'],
        ['pdx-masked-input mask="###"', 'input', '123', '123'],
        ['pdx-otp-input length="4"', 'input', '7', '7'],
    ];
    for (const [tagAndAttrs, field, text, value] of cases) {
        it(tagAndAttrs.split(' ')[0], async () => {
            const tag = tagAndAttrs.split(' ')[0];
            const el = await mount(`<${tagAndAttrs}></${tag}>`);
            const seen = record(el);
            type(el.querySelector(field) as HTMLInputElement, text);
            await tick();
            expect(seen).toEqual([['value-change', { value }]]);
            expect((el as unknown as { value: unknown }).value).toEqual(value);
        });
    }
});

describe('a commit no typing produced dispatches the native change, after the model\'s event', () => {
    it('pdx-input: the clear button', async () => {
        const el = await mount<HTMLElement & { value: string }>('<pdx-input clearable value="Ada"></pdx-input>');
        const seen = record(el);
        el.querySelector<HTMLButtonElement>('.pdx-input-clear')!.click();
        await tick();
        expect(seen).toEqual([['value-change', { value: '' }], ['native change', '']]);
    });

    it('pdx-number-input: a stepper', async () => {
        const el = await mount<HTMLElement & { value: number }>('<pdx-number-input value="1"></pdx-number-input>');
        const seen = record(el);
        (el.querySelector('button[aria-label]') as HTMLButtonElement).click();
        await tick();
        expect(seen.map(([name]) => name)).toEqual(['value-change', 'native change']);
    });
});

describe('::value binds each both ways', () => {
    function load(filename: string, source: string): void {
        const { code } = compile(source, filename, [], undefined, {});
        const body = code.replace(/import\s*\{([^}]*)\}\s*from\s*'@pdxui\/core';?/, 'const {$1} = __core;');
        new Function('__core', body)(core);
    }

    beforeAll(() => {
        load('text-parent.pdx', `<template>
<pdx-input class="in" ::value="name"></pdx-input>
<pdx-textarea class="ta" ::value="notes"></pdx-textarea>
<pdx-number-input class="nu" ::value="qty"></pdx-number-input>
<pdx-password-input class="pw" ::value="secret"></pdx-password-input>
<pdx-search-input class="se" ::value="query"></pdx-search-input>
<p class="out">{{ name }}|{{ notes }}|{{ qty }}|{{ secret }}|{{ query }}</p>
<button class="set" @click="name = 'Linus'; notes = 'n'; qty = 7; secret = 's'; query = 'q'">set</button>
</template>
<script>
@tag 'pdx-text-parent';
let name = $signal('Grace');
let notes = $signal('');
let qty = $signal(1);
let secret = $signal('');
let query = $signal('');
</script>`);
    });

    async function parent(): Promise<HTMLElement> {
        const el = document.createElement('pdx-text-parent');
        document.body.appendChild(el);
        await tick(150);
        return el;
    }

    it('the signal sets the component', async () => {
        const el = await parent();
        el.querySelector<HTMLButtonElement>('.set')!.click();
        await tick(150);
        expect((el.querySelector('.in input') as HTMLInputElement).value).toBe('Linus');
        expect((el.querySelector('.ta textarea') as HTMLTextAreaElement).value).toBe('n');
        expect((el.querySelector('.nu') as HTMLElement & { value: number }).value).toBe(7);
        expect((el.querySelector('.pw input') as HTMLInputElement).value).toBe('s');
        expect((el.querySelector('.se input') as HTMLInputElement).value).toBe('q');
    });

    it('the component\'s own typing sets the signal', async () => {
        const el = await parent();
        type(el.querySelector('.in input') as HTMLInputElement, 'Ada');
        type(el.querySelector('.ta textarea') as HTMLTextAreaElement, 'typed');
        type(el.querySelector('.nu input') as HTMLInputElement, '42');
        type(el.querySelector('.pw input') as HTMLInputElement, 'pw');
        type(el.querySelector('.se input') as HTMLInputElement, 'find');
        await tick(50);
        expect(el.querySelector('.out')!.textContent).toBe('Ada|typed|42|pw|find');
    });
});
