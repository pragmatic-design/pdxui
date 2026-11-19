// onNextFrame (#1231): `ctx.frame` for a script that has no `ctx` — a .pdx component's. The function
// runs in the next animation frame of the current mount, and not at all when the component was
// disconnected by then: the rule `ctx.frame` keeps with its mount generation.

import { describe, it, expect, afterEach } from 'vitest';
import * as core from '../src/index';
import { compile } from '../../compiler/src/plugin';
import { component } from '../src/component/component';
import { onNextFrame, onMount } from '../src/component/lifecycle';
import { html } from '../src/renderer/template';

let seq = 0;
const tag = () => `x-next-frame-${++seq}`;
const mounted: HTMLElement[] = [];
afterEach(() => { for (const el of mounted.splice(0)) el.remove(); });

const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

function mount(name: string): HTMLElement {
    const el = document.createElement(name);
    document.body.appendChild(el);
    mounted.push(el);
    return el;
}

describe('onNextFrame', () => {
    it('runs once, in the next frame of a live mount, from setup', async () => {
        const name = tag();
        const calls: string[] = [];
        component(name, {
            setup() { onNextFrame(() => { calls.push('frame'); }); },
            render: () => html`<p>x</p>`,
        });
        mount(name);
        expect(calls, 'it ran in the same task').toEqual([]);
        await frame();
        await frame();
        expect(calls).toEqual(['frame']);
    });

    it('runs from onMount too, where the rendered markup is there', async () => {
        const name = tag();
        let seen = '';
        component(name, {
            setup(ctx) { onMount(() => { onNextFrame(() => { seen = ctx.el.querySelector('p')?.textContent ?? ''; }); }); },
            render: () => html`<p>drawn</p>`,
        });
        mount(name);
        await frame();
        await frame();
        expect(seen).toBe('drawn');
    });

    it('does not run when the component was disconnected before the frame', async () => {
        const name = tag();
        const calls: string[] = [];
        component(name, {
            setup() { onNextFrame(() => { calls.push('frame'); }); },
            render: () => html`<p>x</p>`,
        });
        mount(name).remove();
        await frame();
        await frame();
        expect(calls).toEqual([]);
    });

    it('a .pdx script calls it with no ctx, and reads the element after its host in the next frame', async () => {
        const { code, warnings } = compile(`<template><span :ref="box">{{ after }}</span></template>
<script>
import { onNextFrame } from '@pdxui/core';
let box = $signal(null);
let after = $signal('');
onNextFrame(() => { after = box?.parentElement?.nextElementSibling?.tagName ?? 'none'; });
</script>`, 'frameprobe.pdx', [], undefined, {});
        expect(warnings.filter((w) => w.severity === 'error'), 'the probe did not compile clean').toEqual([]);
        expect(code, 'the compiled script reaches ctx.frame itself').not.toContain('ctx.frame');
        const body = code.replace(/^\s*import\s*\{([^}]*)\}\s*from\s*'@pdxui\/core';?\s*$/gm, 'const {$1} = __core;');
        new Function('__core', body)(core);
        const host = mount('app-frameprobe');
        // Placed after the host in the same task: in the next frame it is there to be found.
        host.after(document.createElement('input'));
        expect(host.textContent, 'it ran before the frame').toBe('');
        await frame();
        await frame();
        expect(host.textContent).toBe('INPUT');
    });

    it('outside a component\'s setup it throws, as onMount does', () => {
        expect(() => onNextFrame(() => {})).toThrow(/outside component setup/);
    });
});
