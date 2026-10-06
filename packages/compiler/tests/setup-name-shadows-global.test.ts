// A <script setup> function named like a browser global, called from a template handler, is the
// component's function, not the global. Compiled to the bare global, `confirm` makes a click open
// the browser's own modal dialog, blocking the page, and the component's function never runs. The
// global list yields to a declared name, as the neighbouring LOOP_VAR_FALLBACK list does.
// Keywords and literals never yield: they are not names a setup can declare.

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';
import { prefixCtx } from '../src/compiler/codegen-prefix';
import { createCompileContext } from '../src/compiler/compile-context';

function handlerOf(code: string, event: string): string {
    const at = code.indexOf(`@${event}=`);
    expect(at, `no @${event} binding in:\n${code}`).toBeGreaterThanOrEqual(0);
    // The handler is `@click=${safeHandler(() => …, tag, 'click')}`: cut at its closing marker,
    // not at the first `>`, which is the arrow's.
    const end = code.indexOf(`'${event}')`, at);
    expect(end, `no closing marker for @${event} in:\n${code}`).toBeGreaterThan(at);
    return code.slice(at, end);
}

function componentWith(fnName: string): string {
    return `<template><button @click="${fnName}()">x</button></template>
<script setup>
let n = $signal(0);
function ${fnName}() { n = n + 1; }
</script>`;
}

describe('a setup function named like a global', () => {
    for (const name of ['confirm', 'alert', 'fetch', 'setTimeout']) {
        it(`\`${name}()\` declared in setup compiles to ctx.${name}()`, () => {
            const { code } = compile(componentWith(name), 'shadow.pdx');
            const handler = handlerOf(code, 'click');
            expect(handler, `the handler calls the browser global:\n${handler}`).toContain(`ctx.${name}()`);
        });
    }

    it('the control: a global the component does not declare stays the global', () => {
        const { code } = compile(`<template><button @click="alert('x')">x</button></template>
<script setup>
let n = $signal(0);
</script>`, 'global.pdx');
        const handler = handlerOf(code, 'click');
        expect(handler).toContain("alert('x')");
        expect(handler).not.toContain('ctx.alert');
    });

    it('keywords and literals never take the prefix, even with a declared set', () => {
        const ctx = createCompileContext({ production: false });
        ctx.declaredNames = new Set(['true', 'this', 'undefined']);
        expect(prefixCtx('flag = true', ctx)).toBe('ctx.flag = true');
        expect(prefixCtx('this.x === undefined', ctx)).toBe('this.x === undefined');
    });

    it('a declared global name takes the prefix in prefixCtx', () => {
        const ctx = createCompileContext({ production: false });
        ctx.declaredNames = new Set(['confirm']);
        expect(prefixCtx('confirm()', ctx)).toBe('ctx.confirm()');
        expect(prefixCtx('alert()', ctx)).toBe('alert()');
    });
});
