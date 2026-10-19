// A $signal in a .pdx can hold a function (#187).
//
// `onSave = () => count++` compiled to `__onSave.set(() => count++)`, and `set` calls a function
// argument as an updater: the handler ran once at assignment and its RESULT was stored. A template
// calling the stored handler (`@click="onSave()"`) only read the signal. Both render paths build
// their handlers with the one `buildEventHandler`, so both are measured.

import { describe, it, expect, afterEach } from 'vitest';
import * as core from '../src/index';
import { compile } from '../../compiler/src/plugin';

let seq = 0;

/** Compile `template` + `script` on one path, define it, mount it, and return the host. */
function mount(template: string, script: string, build: boolean): HTMLElement {
    const name = `fnsignal${++seq}${build ? 'b' : 'd'}`;
    const src = `<template>${template}</template>\n<script>\n${script}\n</script>\n`;
    const options = build ? { production: true } : {};
    const { code } = compile(src, `${name}.pdx`, [], undefined, options);
    const body = code.replace(/^\s*import\s*\{([^}]*)\}\s*from\s*'@pdxui\/core';?\s*$/gm, 'const {$1} = __core;');
    new Function('__core', body)(core);
    const el = document.createElement(`app-${name}`);
    document.body.appendChild(el);
    return el;
}

const settle = () => new Promise(r => setTimeout(r, 0));
const text = (el: HTMLElement, sel: string) => el.querySelector(sel)!.textContent?.trim();
const click = (el: HTMLElement, sel: string) => (el.querySelector(sel) as HTMLButtonElement).click();

afterEach(() => { document.body.innerHTML = ''; });

describe('a $signal holds a handler', () => {
    for (const build of [false, true]) {
        const path = build ? 'build' : 'dev';

        it(`a handler stored in a $signal runs once per click from the template — ${path}`, async () => {
            const el = mount(
                '<p class="n">{{ count }}</p><button class="arm" @click="arm()">arm</button><button class="go" @click="onSave()">go</button>',
                'let count = $signal(0);\nlet onSave = $signal(null);\nfunction arm() { onSave = () => count++; }',
                build,
            );
            await settle();
            click(el, '.arm');
            await settle();
            expect(text(el, '.n'), 'storing the handler called it').toBe('0');
            click(el, '.go');
            await settle();
            click(el, '.go');
            await settle();
            expect(text(el, '.n'), 'the stored handler did not run once per click').toBe('2');
        });

        it(`an assignment in a template handler stores a function too — ${path}`, async () => {
            const el = mount(
                '<p class="n">{{ count }}</p><button class="arm" @click="onSave = () => count++">arm</button><button class="go" @click="onSave()">go</button>',
                'let count = $signal(0);\nlet onSave = $signal(null);',
                build,
            );
            await settle();
            click(el, '.arm');
            await settle();
            expect(text(el, '.n'), 'storing the handler called it').toBe('0');
            click(el, '.go');
            await settle();
            expect(text(el, '.n')).toBe('1');
        });

        it(`a template expression calls the function a $signal holds — ${path}`, async () => {
            const el = mount(
                '<p class="f">{{ fmt(2) }}</p><button @click="fmt = (n) => \'#\' + n">swap</button>',
                "let fmt = $signal(null);\nfmt = (n) => 'n' + n;",
                build,
            );
            await settle();
            expect(text(el, '.f'), 'the template did not call the stored function').toBe('n2');
            click(el, 'button');
            await settle();
            expect(text(el, '.f'), 'a new function stored did not re-render the call').toBe('#2');
        });

        it(`logical assignments store, and short-circuit — ${path}`, async () => {
            const el = mount(
                '<p class="h">{{ typeof handler }}</p><p class="a">{{ a }}</p><p class="b">{{ b }}</p><button @click="run()">run</button>',
                'let handler = $signal(null);\nlet a = $signal(null);\nlet b = $signal(3);\nfunction run() { handler ??= () => 1; a ??= 5; b ||= 5; }',
                build,
            );
            await settle();
            click(el, 'button');
            await settle();
            expect(text(el, '.h'), '??= called the function instead of storing it').toBe('function');
            expect(text(el, '.a'), '??= on null did not set').toBe('5');
            expect(text(el, '.b'), '||= on a non-zero value wrote').toBe('3');
        });

        it(`an effect that assigns from the same signal runs once, as before — ${path}`, async () => {
            // `count = count + 1` reads `count` on its right side. Read with tracking, the effect
            // would depend on what it writes and run again forever; the old `set(prev => …)` did
            // not track, and neither does the new form.
            const el = mount(
                '<p class="n">{{ count }}</p>',
                'let count = $signal(0);\n$effect(() => { count = count + 1; });',
                build,
            );
            await settle();
            await settle();
            expect(text(el, '.n'), 'the effect re-ran on its own write').toBe('1');
        });

        it(`value state behaves as before: =, ++ and += — ${path}`, async () => {
            const el = mount(
                '<p class="n">{{ count }}</p><button @click="step()">step</button>',
                'let count = $signal(0);\nfunction step() { count = count + 1; count++; count += 2; }',
                build,
            );
            await settle();
            click(el, 'button');
            await settle();
            expect(text(el, '.n')).toBe('4');
        });
    }
});
