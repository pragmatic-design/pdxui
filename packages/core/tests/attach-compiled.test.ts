// `attach:` in a compiled .pdx (#143): the attachment runs on mount, re-runs when its value changes,
// and cleans up when the block that holds the element goes — on the inline path every template
// takes, and in a scoped slot's body, which still takes the template path.

import { describe, it, expect, afterEach } from 'vitest';
import * as core from '../src/index';
import { compile } from '../../compiler/src/plugin';

const settle = async () => { for (let i = 0; i < 3; i++) await new Promise((r) => setTimeout(r, 0)); };

function define(name: string, src: string): void {
    const { code, warnings } = compile(src, `${name}.pdx`, [], undefined, {});
    const errors = warnings.filter((w) => w.severity === 'error').map((w) => `${w.code}: ${w.message}`);
    expect(errors, `${name} did not compile clean`).toEqual([]);
    const body = code.replace(/^\s*import\s*\{([^}]*)\}\s*from\s*'@pdxui\/core';?\s*$/gm, 'const {$1} = __core;');
    new Function('__core', body)(core);
}

afterEach(() => { document.body.innerHTML = ''; });

const log: string[] = [];
(globalThis as Record<string, unknown>).__attachLog = log;

describe('attach: in a compiled template', () => {
    it('runs on mount, again when its value changes (cleanup first), and cleans up when its block goes', async () => {
        log.length = 0;
        define('attachprobe', `<template>
<button class="relabel" @click="label = 'b'">relabel</button>
<button class="hide" @click="shown = false">hide</button>
@if (shown) { <input attach:probe="label" /> }
</template>
<script>
let shown = $signal(true);
let label = $signal('a');
function probe(el, value) {
  const v = value();
  globalThis.__attachLog.push('run:' + el.tagName + ':' + v);
  return () => globalThis.__attachLog.push('clean:' + v);
}
</script>`);
        const el = document.createElement('app-attachprobe');
        document.body.appendChild(el);
        await settle();
        expect(log).toEqual(['run:INPUT:a']);
        el.querySelector<HTMLButtonElement>('.relabel')!.click();
        await settle();
        expect(log).toEqual(['run:INPUT:a', 'clean:a', 'run:INPUT:b']);
        el.querySelector<HTMLButtonElement>('.hide')!.click();
        await settle();
        expect(log, 'the block went and the attachment did not clean up').toEqual(['run:INPUT:a', 'clean:a', 'run:INPUT:b', 'clean:b']);
    });

    it('a built-in, autofocus, needs no import: it focuses the input', async () => {
        define('attachfocus', '<template><button>first</button><input class="target" attach:autofocus /></template>\n<script>\nlet n = $signal(0);\n</script>');
        const el = document.createElement('app-attachfocus');
        document.body.appendChild(el);
        await settle();
        expect(document.activeElement).toBe(el.querySelector('input.target'));
    });

    it('on a component, it attaches to the host element', async () => {
        log.length = 0;
        define('attachchild', '<template><p>child</p></template>\n<script>\nlet n = $signal(0);\n</script>');
        define('attachhost', `<template><app-attachchild attach:probe /></template>
<script>
function probe(el) { globalThis.__attachLog.push('host:' + el.tagName.toLowerCase()); }
</script>`);
        const el = document.createElement('app-attachhost');
        document.body.appendChild(el);
        await settle();
        expect(log).toEqual(['host:app-attachchild']);
    });
});
