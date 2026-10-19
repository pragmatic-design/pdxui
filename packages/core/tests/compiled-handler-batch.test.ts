// A compiled template event handler runs inside batch() (#114).
//
// Outside batch() every signal write flushes at once, so a handler writing three signals ran an
// effect reading them three times, and the first two runs saw a state half written. The owner's
// decision (2026-10-10): the compiler wraps every template handler in batch(); code outside a
// template handler keeps the synchronous flush. Measured on both render paths, because both build
// their handlers with the one `buildEventHandler`.

import { describe, it, expect, afterEach } from 'vitest';
import * as core from '../src/index';
import { compile } from '../../compiler/src/plugin';

let seq = 0;

/** Compile `template` + `script` on one path, define it, mount it, and return the host. */
function mount(template: string, script: string, build: boolean): HTMLElement {
    const name = `batchprobe${++seq}${build ? 'b' : 'd'}`;
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

afterEach(() => { document.body.innerHTML = ''; });

describe('a compiled handler writing three signals', () => {
    for (const build of [false, true]) {
        const path = build ? 'build' : 'dev';

        it(`runs an effect reading all three once, and it never sees them half written — ${path}`, async () => {
            const runs: string[] = [];
            (globalThis as { __batchRuns?: string[] }).__batchRuns = runs;
            const el = mount(
                '<button @click="a = 1; b = 1; c = 1">go</button>',
                `let a = $signal(0);\nlet b = $signal(0);\nlet c = $signal(0);\n$effect(() => { globalThis.__batchRuns.push(a + ',' + b + ',' + c); });`,
                build,
            );
            await settle();
            runs.length = 0;
            (el.querySelector('button') as HTMLButtonElement).click();
            await settle();
            expect(runs, 'the effect ran once per write, or saw a half-written state').toEqual(['1,1,1']);
        });

        it(`keeps an async handler's promise, so a rejection still reaches the error handlers — ${path}`, async () => {
            const errors: unknown[] = [];
            const off = core.onGlobalError((err) => { errors.push(err); return true; });
            const el = mount(
                '<button @click="fail">go</button>',
                "async function fail() { throw new Error('async boom'); }",
                build,
            );
            await settle();
            (el.querySelector('button') as HTMLButtonElement).click();
            await settle();
            await settle();
            off?.();
            expect(errors.map(e => (e as Error).message)).toContain('async boom');
        });
    }
});
