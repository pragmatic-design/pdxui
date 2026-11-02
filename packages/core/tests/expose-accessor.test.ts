// `@expose` of a `$derived` or a `$signal` (#752), compiled and run: the element holds an accessor to
// the value, not the function the component keeps it in. A derived one is read-only; a signal one is
// written by an assignment the component sees. Functions keep being exposed as they are.

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

type Host = HTMLElement & { count: unknown; doubled: unknown; reset: unknown };

function mount(name: string): Host {
    defineCompiled(name, [
        '<template><p class="count">{{ count }}</p><p class="doubled">{{ doubled }}</p></template>',
        '<script>',
        'let count = $signal<number>(0);',
        'const doubled = $derived<number>(count * 2);',
        'function reset() { count = 0; }',
        '@expose count, doubled, reset;',
        '</script>',
        '',
    ].join('\n'));
    const el = document.createElement(`app-${name}`) as Host;
    document.body.appendChild(el);
    return el;
}

afterEach(() => { document.body.innerHTML = ''; });

describe('@expose of a reactive name', () => {
    it('a $derived reads as its current value, not as the computed function', async () => {
        const el = mount('exposederived');
        el.count = 2;
        expect(el.doubled).toBe(4);
    });

    it('a $derived is read-only: an assignment is refused and the value stays', async () => {
        const el = mount('exposereadonly');
        el.count = 2;
        expect(Reflect.set(el, 'doubled', 1)).toBe(false);
        expect(el.doubled).toBe(4);
    });

    it('a $signal reads as its value, and an assignment is a write the template sees', async () => {
        const el = mount('exposesignal');
        expect(el.count).toBe(0);
        el.count = 5;
        await settle();
        expect(el.count).toBe(5);
        expect(el.querySelector('.count')?.textContent).toBe('5');
        expect(el.querySelector('.doubled')?.textContent).toBe('10');
    });

    it('a function written to a $signal is stored as it is, as an assignment inside the component does', () => {
        const el = mount('exposefnvalue');
        const fn = () => 7;
        el.count = fn;
        expect(el.count).toBe(fn);
    });

    it('control: a function is still exposed as the function', () => {
        const el = mount('exposefunction');
        el.count = 3;
        expect(typeof el.reset).toBe('function');
        (el.reset as () => void)();
        expect(el.count).toBe(0);
    });
});
