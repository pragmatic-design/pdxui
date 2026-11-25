// onDestroy in a .pdx script (#1407): it compiles to core's onDestroy, which registers the callback on
// the component's scope, as a component written in TypeScript calls it. It used to compile to an
// effect whose only job was to return the callback as its cleanup: one effect created and run at
// every mount, for nothing the callback reads.

import { describe, it, expect, afterEach } from 'vitest';
import * as core from '../src/index';
import { compile } from '../../compiler/src/plugin';

const mounted: HTMLElement[] = [];
afterEach(() => { for (const el of mounted.splice(0)) el.remove(); });

function load(source: string, file: string): string {
    const { code, warnings } = compile(source, file, [], undefined, {});
    expect(warnings.filter((w) => w.severity === 'error'), 'the probe did not compile clean').toEqual([]);
    const body = code.replace(/^\s*import\s*\{([^}]*)\}\s*from\s*'@pdxui\/core';?\s*$/gm, 'const {$1} = __core;');
    new Function('__core', '__calls', body)(core, calls);
    return code;
}

const calls: string[] = [];

describe('onDestroy in a .pdx script', () => {
    it('compiles to core\'s onDestroy, imported, and to no effect', () => {
        const code = load(`<template><p>x</p></template>
<script>
onDestroy(() => { __calls.push('destroyed'); });
</script>`, 'destroyprobe.pdx');
        expect(code, 'an effect stands in for the hook').not.toMatch(/ctx\.track\(\(\) => \(\) =>/);
        expect(code).toMatch(/\bonDestroy\(/);
        expect(code.match(/import\s*\{([^}]*)\}\s*from\s*'@pdxui\/core'/)?.[1], 'onDestroy is called and not imported')
            .toMatch(/\bonDestroy\b/);
    });

    it('runs its callback once, when the component is removed', () => {
        calls.length = 0;
        load(`<template><p>x</p></template>
<script>
onDestroy(() => { __calls.push('gone'); });
</script>`, 'destroyrun.pdx');
        const el = document.createElement('app-destroyrun');
        document.body.appendChild(el);
        mounted.push(el);
        expect(calls, 'it ran at mount').toEqual([]);
        el.remove();
        expect(calls).toEqual(['gone']);
        document.body.appendChild(el);
        el.remove();
        expect(calls, 'each mount registers it once, and it runs once per removal').toEqual(['gone', 'gone']);
    });
});
