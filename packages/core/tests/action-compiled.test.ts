// `@action` compiled and run (#501): the body runs with the argument of execute(), `{ signal }` reaches
// it and save.cancel() aborts it, and `when` is save.enabled().

import { describe, it, expect, afterEach } from 'vitest';
import * as core from '../src/index';
import { compile } from '../../compiler/src/plugin';

const settle = async () => { for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0)); };

/** Compile a `.pdx` source and run its module against core (render-parity's bridge). */
function defineCompiled(name: string, src: string): void {
    const { code } = compile(src, `${name}.pdx`, [], undefined, {});
    const body = code.replace(/^\s*import\s*\{([^}]*)\}\s*from\s*'@pdxui\/core';?\s*$/gm, 'const {$1} = __core;');
    new Function('__core', body)(core);
}

type Action = { execute(arg?: unknown): Promise<unknown>; cancel(): void; enabled(): boolean; data(): unknown; error(): unknown; pending(): boolean };
type Host = HTMLElement & { save: Action; disable?: () => void };

function mount(name: string, script: string): Host {
    defineCompiled(name, `<template><p>{{ save.pending() }}</p></template>\n<script>\n${script}\n@expose save;\n</script>\n`);
    const el = document.createElement(`app-${name}`) as Host;
    document.body.appendChild(el);
    return el;
}

const seen = globalThis as unknown as { __actionSeen: unknown[] };

afterEach(() => { document.body.innerHTML = ''; seen.__actionSeen = []; });

describe('@action, compiled and run', () => {
    it('execute(arg) runs the body with the argument, and data() is what it returns', async () => {
        const el = mount('actionrun', '@action save(n: number) { return n * 2; }');
        expect(await el.save.execute(21)).toBe(42);
        expect(el.save.data()).toBe(42);
    });

    it('{ signal } reaches the body, and save.cancel() aborts it', async () => {
        seen.__actionSeen = [];
        const el = mount('actionsignal', "@action save(n: number, { signal }) {\n  (globalThis as any).__actionSeen.push(signal);\n  await new Promise((r) => signal.addEventListener('abort', r));\n  throw signal.reason;\n}");
        const call = el.save.execute(1);
        await settle();
        const [signal] = seen.__actionSeen as AbortSignal[];
        expect(signal).toBeInstanceOf(AbortSignal);
        expect(signal.aborted).toBe(false);
        el.save.cancel();
        expect(signal.aborted).toBe(true);
        await expect(call).rejects.toMatchObject({ name: 'AbortError' });
        expect(el.save.error()).toBeNull();
    });

    it('when cond is save.enabled(), following cond', async () => {
        const el = mount('actionwhen', 'let ok = $signal(true);\n@action save() when ok { return 1; }\nfunction disable() { ok = false; }\n@expose disable;');
        expect(el.save.enabled()).toBe(true);
        el.disable!();
        expect(el.save.enabled()).toBe(false);
        await expect(el.save.execute()).rejects.toBeInstanceOf(core.ActionDisabledError);
    });
});
