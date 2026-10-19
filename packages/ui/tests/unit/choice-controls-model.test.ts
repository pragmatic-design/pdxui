// The choice controls declare their model (#480, part 3 of #125).
//
// Each announces a change with its model's event, `<model>-change` carrying `{ value }`, and none of
// the alpha names (`pdx-change`, `change`, `valuechange`, `pressedchange`, `pdx-pressed-change`, nor
// `pdx-input`). The manifest lists the model, and a parent's `::<model>` binds it both ways: the signal
// sets the component, the component's own interaction sets the signal.

import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import * as core from '@pdxui/core';
import { compile } from '../../../compiler/src/plugin';
import { tick, cleanup } from './helpers';
import '../../src/checkbox/pdx-checkbox';
import '../../src/switch-toggle/pdx-switch';
import '../../src/radio/pdx-radio';
import '../../src/toggle/pdx-toggle';
import '../../src/radio-group/pdx-radio-group';
import '../../src/checkbox-group/pdx-checkbox-group';
import '../../src/segmented/pdx-segmented';
import '../../src/rating/pdx-rating';
import '../../src/slider/pdx-slider';

/** Each control of the batch and the models it declares. */
const MODELS: Record<string, string[]> = {
    'pdx-checkbox': ['checked', 'indeterminate'],
    'pdx-switch': ['checked'],
    'pdx-radio': ['checked'],
    'pdx-toggle': ['pressed'],
    'pdx-radio-group': ['value'],
    'pdx-checkbox-group': ['value'],
    'pdx-segmented': ['value'],
    'pdx-rating': ['value'],
    'pdx-slider': ['value'],
};
const ALPHA = ['pdx-change', 'change', 'valuechange', 'pressedchange', 'pdx-pressed-change', 'pdx-input'];
const kebab = (name: string) => name.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);

afterEach(() => cleanup());

describe('the manifest', () => {
    const manifest = JSON.parse(readFileSync(join(__dirname, '..', '..', 'custom-elements.json'), 'utf8')) as {
        modules: { declarations: { tagName?: string; models?: string[]; events?: { name: string }[]; alphaEvents?: string[] }[] }[];
    };
    const decl = (tag: string) => manifest.modules.flatMap((m) => m.declarations).find((d) => d.tagName === tag);

    for (const [tag, models] of Object.entries(MODELS)) {
        it(`${tag} lists exactly its models, their events, and no alpha event`, () => {
            const d = decl(tag);
            expect(d?.models).toEqual(models);
            const events = (d?.events ?? []).map((e) => e.name);
            for (const m of models) expect(events).toContain(`${kebab(m)}-change`);
            expect(events.filter((e) => ALPHA.includes(e))).toEqual([]);
            // What `pdx migrate` reads to rewrite a listener on the alpha event (#478).
            expect(d?.alphaEvents?.length, `${tag} records no alpha event`).toBeGreaterThan(0);
        });
    }
});

/**
 * Every event the component dispatches among the alpha names and its models' events, in order. Only
 * CustomEvents: the native `change` of an inner `<input>` bubbles to the host, and is the platform's.
 */
function record(el: Element): [string, unknown][] {
    const seen: [string, unknown][] = [];
    for (const name of [...ALPHA, 'checked-change', 'indeterminate-change', 'pressed-change', 'value-change']) {
        el.addEventListener(name, (e) => { if (e instanceof CustomEvent) seen.push([name, e.detail]); });
    }
    return seen;
}

async function mount(markup: string): Promise<HTMLElement> {
    const box = document.createElement('div');
    box.innerHTML = markup;
    document.body.appendChild(box);
    await tick(20);
    return box.firstElementChild as HTMLElement;
}

const key = (el: Element, k: string) => el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));

describe('an interaction announces the model\'s event, and no alpha event', () => {
    it('pdx-checkbox: a click is checked-change', async () => {
        const el = await mount('<pdx-checkbox label="A"></pdx-checkbox>');
        const seen = record(el);
        el.querySelector('input')!.click();
        expect(seen).toEqual([['checked-change', { value: true }]]);
    });

    it('pdx-switch: a click is checked-change', async () => {
        const el = await mount('<pdx-switch label="A"></pdx-switch>');
        const seen = record(el);
        el.querySelector('input')!.click();
        expect(seen).toEqual([['checked-change', { value: true }]]);
    });

    it('pdx-radio: a click is checked-change', async () => {
        const el = await mount('<pdx-radio value="a" label="A"></pdx-radio>');
        const seen = record(el);
        el.querySelector('input')!.click();
        expect(seen).toEqual([['checked-change', { value: true }]]);
    });

    it('pdx-toggle: a click is pressed-change', async () => {
        const el = await mount('<pdx-toggle value="b">B</pdx-toggle>');
        const seen = record(el);
        el.querySelector('button')!.click();
        expect(seen).toEqual([['pressed-change', { value: true }]]);
    });

    it('pdx-radio-group: choosing a radio is value-change on the group', async () => {
        const el = await mount('<pdx-radio-group><pdx-radio value="a" label="A"></pdx-radio><pdx-radio value="b" label="B"></pdx-radio></pdx-radio-group>');
        const seen = record(el);
        el.querySelectorAll('input')[1].click();
        await tick();
        expect(seen).toEqual([['value-change', { value: 'b' }]]);
    });

    it('pdx-checkbox-group: checking a box is value-change on the group', async () => {
        const el = await mount('<pdx-checkbox-group><pdx-checkbox value="a" label="A"></pdx-checkbox><pdx-checkbox value="b" label="B"></pdx-checkbox></pdx-checkbox-group>');
        const seen = record(el);
        el.querySelectorAll('input')[0].click();
        await tick();
        expect(seen).toEqual([['value-change', { value: 'a' }]]);
    });

    it('pdx-segmented: choosing a segment is value-change', async () => {
        const el = await mount(`<pdx-segmented options='["a","b"]' value="a"></pdx-segmented>`);
        const seen = record(el);
        el.querySelectorAll<HTMLButtonElement>('.pdx-segmented-item')[1].click();
        expect(seen).toEqual([['value-change', { value: 'b' }]]);
    });

    it('pdx-rating: an arrow key is value-change', async () => {
        const el = await mount('<pdx-rating></pdx-rating>');
        const seen = record(el);
        key(el.querySelector('[role="slider"]')!, 'ArrowRight');
        expect(seen).toEqual([['value-change', { value: 1 }]]);
    });

    it('pdx-slider: an arrow key is value-change', async () => {
        const el = await mount('<pdx-slider></pdx-slider>');
        const seen = record(el);
        key(el.querySelector('[role="slider"]')!, 'ArrowRight');
        expect(seen).toEqual([['value-change', { value: 1 }]]);
    });
});

describe('::<model> binds each both ways', () => {
    /** Compile a .pdx and run the module: the core import becomes the injected namespace. */
    function load(filename: string, source: string): void {
        const { code } = compile(source, filename, [], undefined, {});
        const body = code.replace(/import\s*\{([^}]*)\}\s*from\s*'@pdxui\/core';?/, 'const {$1} = __core;');
        new Function('__core', body)(core);
    }

    beforeAll(() => {
        load('choice-parent.pdx', `<template>
<pdx-checkbox class="cb" label="A" ::checked="agree"></pdx-checkbox>
<pdx-switch class="sw" label="A" ::checked="on"></pdx-switch>
<pdx-toggle class="tg" value="b" ::pressed="bold">B</pdx-toggle>
<pdx-segmented class="sg" options='["a","b"]' ::value="seg"></pdx-segmented>
<pdx-rating class="rt" ::value="stars"></pdx-rating>
<pdx-slider class="sl" ::value="level"></pdx-slider>
<p class="out">{{ String(agree) }} {{ String(on) }} {{ String(bold) }} {{ seg }} {{ stars }} {{ level }}</p>
<button class="set" @click="agree = true; on = true; bold = true; seg = 'b'; stars = 3; level = 40">set</button>
</template>
<script>
@tag 'pdx-choice-parent';
let agree = $signal(false);
let on = $signal(false);
let bold = $signal(false);
let seg = $signal('a');
let stars = $signal(0);
let level = $signal(0);
</script>`);
    });

    async function parent(): Promise<HTMLElement> {
        const el = document.createElement('pdx-choice-parent');
        document.body.appendChild(el);
        await tick(20);
        return el;
    }
    const prop = (el: HTMLElement, sel: string, name: string) => (el.querySelector(sel) as unknown as Record<string, unknown>)[name];

    it('the signal sets the component', async () => {
        const el = await parent();
        el.querySelector<HTMLButtonElement>('.set')!.click();
        await tick(20);
        expect([prop(el, '.cb', 'checked'), prop(el, '.sw', 'checked'), prop(el, '.tg', 'pressed'), prop(el, '.sg', 'value'), prop(el, '.rt', 'value'), prop(el, '.sl', 'value')])
            .toEqual([true, true, true, 'b', 3, 40]);
    });

    it('the component\'s own interaction sets the signal', async () => {
        const el = await parent();
        el.querySelector<HTMLInputElement>('.cb input')!.click();
        el.querySelector<HTMLInputElement>('.sw input')!.click();
        el.querySelector<HTMLButtonElement>('.tg button')!.click();
        el.querySelectorAll<HTMLButtonElement>('.sg .pdx-segmented-item')[1].click();
        key(el.querySelector('.rt [role="slider"]')!, 'ArrowRight');
        key(el.querySelector('.sl [role="slider"]')!, 'ArrowRight');
        await tick(20);
        expect(el.querySelector('.out')!.textContent).toBe('true true true b 1 1');
    });
});
