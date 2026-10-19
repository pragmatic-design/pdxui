// `<component :is @keepAlive(n)>` keeps at most n views (#270; beta spec, lifecycle.md, «Frozen is
// bounded», «Acceptance cases», case 5). The least recently shown view is dropped, and destroyed.
//
// Compiled on both render paths and mounted: a switcher over views that each log their destroy.

import { describe, it, expect, beforeEach } from 'vitest';
import * as core from '../src/index';
import { compile } from '../../compiler/src/plugin';

let seq = 0;
const destroyed: string[] = [];

/** `count` views, `pdx-kv<seq>-<i>`, each logging its own destroy. */
function defineViews(prefix: string, count: number): void {
    for (let i = 0; i < count; i++) {
        const tag = `${prefix}-${i}`;
        core.component(tag, {
            setup() { core.onDestroy(() => { destroyed.push(tag); }); return {}; },
            render: () => core.html`<p>${tag}</p>`,
        });
    }
}

/** The switcher, compiled on one path, mounted; returns a function that shows view `i`. */
function mountSwitcher(prefix: string, keepAlive: string, build: boolean): (i: number) => Promise<void> {
    const name = `kvswitch${++seq}${build ? 'b' : 'd'}`;
    const src = `<template><component :is="view" ${keepAlive}></component></template>\n<script>\nlet view = $signal('${prefix}-0');\nwindow.__show_${name} = (t) => { view = t; };\n</script>\n`;
    const { code } = compile(src, `${name}.pdx`, [], undefined, build ? { production: true } : {});
    new Function('__core', code.replace(/^\s*import\s*\{([^}]*)\}\s*from\s*'@pdxui\/core';?\s*$/gm, 'const {$1} = __core;'))(core);
    document.body.appendChild(document.createElement(`app-${name}`));
    const show = (window as unknown as Record<string, (t: string) => void>)[`__show_${name}`];
    return async (i: number) => { show(`${prefix}-${i}`); await new Promise((r) => setTimeout(r, 0)); };
}

for (const [path, build] of [['dev', false], ['build', true]] as const) {
    describe(`<component :is @keepAlive(n)> — ${path}`, () => {
        beforeEach(() => { document.body.innerHTML = ''; destroyed.length = 0; });

        it('@keepAlive(3): the fourth view evicts the first', async () => {
            const prefix = `pdx-kv${++seq}`;
            defineViews(prefix, 4);
            const show = mountSwitcher(prefix, '@keepAlive(3)', build);
            await show(0); await show(1); await show(2);
            expect(destroyed, 'a view was destroyed within the maximum').toEqual([]);
            await show(3);
            expect(destroyed, 'the least recently shown view was not dropped').toEqual([`${prefix}-0`]);
        });

        it('@keepAlive(10): the eleventh view evicts the first', async () => {
            const prefix = `pdx-kv${++seq}`;
            defineViews(prefix, 11);
            const show = mountSwitcher(prefix, '@keepAlive(10)', build);
            for (let i = 0; i < 10; i++) await show(i);
            expect(destroyed).toEqual([]);
            await show(10);
            expect(destroyed).toEqual([`${prefix}-0`]);
        });

        it('a view shown again is the most recently used', async () => {
            const prefix = `pdx-kv${++seq}`;
            defineViews(prefix, 4);
            const show = mountSwitcher(prefix, '@keepAlive(3)', build);
            await show(0); await show(1); await show(2);
            await show(0); // 0 is now the most recent: 1 is the oldest
            await show(3);
            expect(destroyed).toEqual([`${prefix}-1`]);
        });
    });
}
