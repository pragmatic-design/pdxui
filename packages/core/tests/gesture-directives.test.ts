// `@swipe.dir`, `@longpress` and `@pinch` call their handler, on both render paths (#99).
//
// The template path rewrote them to `@__swipe=${['left', fn]}`, which `bindAttribute` handed to
// `bindEvent` — a listener for an event nobody dispatches — and the gesture setup in `setProp` was
// never reached; a mutation such as `n++` was also emitted as a plain read, so it ran once at render.
// The inline path never ran the rewrite at all: `.left` became the ArrowLeft key filter.
//
// The pointer sequences use `gestures.ts`'s own thresholds: a swipe is 50px within 300ms, a longpress
// a 500ms hold, a pinch two pointers whose distance changes.
//
// In core, because the compiled component runs on core in happy-dom — the same bridge as
// render-parity.test.ts.

import { describe, it, expect, vi, afterEach } from 'vitest';
import * as core from '../src/index';
import { compile } from '../../compiler/src/plugin';

let seq = 0;
const settle = async () => { for (let i = 0; i < 3; i++) await new Promise((r) => setTimeout(r, 0)); };

function mount(template: string, script: string, inline: boolean): HTMLElement {
    const name = `gesture${++seq}${inline ? 'i' : 't'}`;
    const src = `<template>${template}</template>\n<script setup>\n${script}\n</script>\n`;
    const { code } = compile(src, `${name}.pdx`, [], undefined, inline ? { production: true, inlineBindings: true } : { inlineBindings: false });
    const body = code.replace(/^\s*import\s*\{([^}]*)\}\s*from\s*'@pdxui\/core';?\s*$/gm, 'const {$1} = __core;');
    new Function('__core', body)(core);
    const el = document.createElement(`pdx-${name}`);
    document.body.appendChild(el);
    return el;
}

const pointer = (target: Element, type: string, x: number, id = 1) =>
    target.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: 10, pointerId: id, bubbles: true }));
const count = (el: HTMLElement) => el.querySelector('p')!.textContent;

afterEach(() => { vi.useRealTimers(); });

describe('gesture directives', () => {
    for (const inline of [false, true]) {
        const path = inline ? 'inline path' : 'template path';

        it(`@swipe.left runs on a left swipe, and not at render or on a right one (${path})`, async () => {
            const el = mount('<div class="pad" @swipe.left="n++">s</div><p>{{ n }}</p>', 'let n = $signal(0);', inline);
            await settle();
            expect(count(el), 'the handler ran at render').toBe('0');
            const pad = el.querySelector('.pad')!;
            pointer(pad, 'pointerdown', 100); pointer(pad, 'pointerup', 200);
            await settle();
            expect(count(el), 'a right swipe counted').toBe('0');
            pointer(pad, 'pointerdown', 200); pointer(pad, 'pointerup', 100);
            await settle();
            expect(count(el)).toBe('1');
        });

        it(`@longpress runs after a held press (${path})`, async () => {
            const el = mount('<div class="pad" @longpress="hold()">h</div><p>{{ n }}</p>', 'let n = $signal(0);\nfunction hold() { n++; }', inline);
            await settle();
            vi.useFakeTimers();
            pointer(el.querySelector('.pad')!, 'pointerdown', 50);
            vi.advanceTimersByTime(600);
            vi.useRealTimers();
            await settle();
            expect(count(el)).toBe('1');
        });

        it(`@pinch hands the handler the scale (${path})`, async () => {
            const el = mount('<div class="pad" @pinch="e => scale = e.scale">p</div><p>{{ scale }}</p>', 'let scale = $signal(1);', inline);
            await settle();
            const pad = el.querySelector('.pad')!;
            pointer(pad, 'pointerdown', 100, 1); pointer(pad, 'pointerdown', 200, 2);
            pointer(pad, 'pointermove', 300, 2);
            await settle();
            expect(count(el)).toBe('2');
        });
    }
});
