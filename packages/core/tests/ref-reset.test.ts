// A `:ref` lets go of an element that leaves the page (#262; beta spec, lifecycle.md, «The matrix»,
// row `:ref` — set to null when removed and when destroyed).
//
// Both render paths only ever SET the ref. `@if (editing) { <input :ref="field"> }`, then
// `editing = false`: `field` still held the detached <input>, so `if (field) field.focus()` acted on a
// node that was not in the document, and silently did nothing.
//
// Compiled on both paths and mounted, as render-parity.test.ts does; the template prints what the ref
// holds, so the assertion reads the page.

import { describe, it, expect, beforeEach } from 'vitest';
import * as core from '../src/index';
import { compile } from '../../compiler/src/plugin';

let seq = 0;

/** The component compiled on one path, defined, and mounted in the document. */
function mount(template: string, script: string, inline: boolean): HTMLElement {
    const name = `refreset${++seq}${inline ? 'i' : 't'}`;
    const src = `<template>${template}</template>\n<script setup>\n${script}\n</script>\n`;
    const options = inline ? { production: true, inlineBindings: true } : { inlineBindings: false };
    const { code } = compile(src, `${name}.pdx`, [], undefined, options);
    const body = code.replace(/^\s*import\s*\{([^}]*)\}\s*from\s*'@pdxui\/core';?\s*$/gm, 'const {$1} = __core;');
    new Function('__core', body)(core);
    const el = document.createElement(`pdx-${name}`);
    document.body.appendChild(el);
    return el;
}

const settle = () => new Promise(r => setTimeout(r, 0));
const shown = (host: HTMLElement) => host.querySelector('.ref')!.textContent;
const click = (host: HTMLElement, sel: string) => (host.querySelector(sel) as HTMLElement).click();

for (const [path, inline] of [['template path', false], ['inline path', true]] as const) {
    describe(`:ref — ${path}`, () => {
        beforeEach(() => { document.body.innerHTML = ''; });

        it('is reset to null when its element is removed by an @if', async () => {
            const host = mount(
                '@if (editing) { <input class="field" :ref="field"> }'
                + '<p class="ref">{{ field ? field.className : \'none\' }}</p>'
                + '<button class="close" @click="editing = false">x</button>',
                'let editing = $signal(true); let field = $signal(null);',
                inline,
            );
            await settle();
            expect(shown(host), 'control: the ref did not receive its element').toBe('field');
            click(host, '.close');
            await settle();
            expect(host.querySelector('input'), 'the @if did not remove the input').toBeNull();
            expect(shown(host), 'the ref still holds the removed element').toBe('none');
        });

        it('an @if/@else whose branches bind the same ref holds the new branch\'s element', async () => {
            const host = mount(
                '@if (a) { <input class="first" :ref="field"> } @else { <input class="second" :ref="field"> }'
                + '<p class="ref">{{ field ? field.className : \'none\' }}</p>'
                + '<button class="swap" @click="a = !a">x</button>',
                'let a = $signal(true); let field = $signal(null);',
                inline,
            );
            await settle();
            expect(shown(host)).toBe('first');
            click(host, '.swap');
            await settle();
            expect(shown(host), 'the old branch\'s disposal cleared the ref the new branch had taken').toBe('second');
            click(host, '.swap');
            await settle();
            expect(shown(host)).toBe('first');
        });

        it('onDestroy still reads the element; once the component is gone the ref is null', async () => {
            const probe = globalThis as { __refSeen?: string; __readRef?: () => unknown };
            delete probe.__refSeen;
            const host = mount(
                '<input class="own" :ref="field"><p class="ref">{{ field ? field.className : \'none\' }}</p>',
                'let field = $signal(null);'
                + ' onMount(() => { globalThis.__readRef = () => field; });'
                + " onDestroy(() => { globalThis.__refSeen = field ? field.className : 'none'; });",
                inline,
            );
            await settle();
            expect(shown(host)).toBe('own');
            host.remove();
            await settle();
            expect(probe.__refSeen, 'onDestroy ran after the ref was reset').toBe('own');
            expect(probe.__readRef!(), 'the destroyed component\'s ref still holds its element').toBeNull();
        });

        it('is reset to null when its @for row is removed', async () => {
            const host = mount(
                '@for (rows as r; track r) { <input :class="r" :ref="field"> }'
                + '<p class="ref">{{ field ? field.className : \'none\' }}</p>'
                + '<button class="clear" @click="rows = []">x</button>',
                "let rows = $signal(['row']); let field = $signal(null);",
                inline,
            );
            await settle();
            expect(shown(host)).toBe('row');
            click(host, '.clear');
            await settle();
            expect(shown(host), 'the ref still holds the removed row\'s element').toBe('none');
        });
    });
}
