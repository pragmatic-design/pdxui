// `untracked(() => x)` reads x's value now, subscribing nothing: what `x.peek()` is (#1287, item C).
//
// Compiled as written it is a closure handed to core's untracked at every read: 15.7 ns against 2.8 for
// `.peek()`, measured on core. A TypeScript component reads `ctx.x.peek()`, and the compiler emits no
// slower than that: `untracked(() => x)` of a `$signal`, a `$derived` or a prop, with core's untracked,
// is the accessor's `.peek()`. Anything else is left as written.

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';

function setup(script: string): string {
    const code = compile(`<template><p>{{ size }}</p></template>\n<script>\n${script}\n</script>\n`, 'peek-probe.pdx', [], undefined, { production: true }).code;
    return code.slice(code.indexOf('setup(ctx)'), code.indexOf('render:'));
}

const DECLS = [
    "@prop size: string = 'md';",
    'let open = $signal(false);',
    'const doubled = $derived(size.length * 2);',
].join('\n');

describe('untracked(() => x) is x.peek()', () => {
    it('a $signal, a prop and a $derived, read through core\'s untracked', () => {
        const code = setup(`import { untracked } from '@pdxui/core';\n${DECLS}\nfunction read() { return [untracked(() => open), untracked(() => size), untracked(() => doubled)]; }`);
        expect(code).toContain('__open.peek()');
        expect(code).toContain('size.peek()');
        expect(code).toContain('doubled.peek()');
        expect(code).not.toContain('untracked(');
    });

    it('under an alias of the import: untracked as u', () => {
        const code = setup(`import { untracked as u } from '@pdxui/core';\n${DECLS}\nfunction read() { return u(() => open); }`);
        expect(code).toContain('__open.peek()');
        expect(code).not.toContain('u(() =>');
    });

    it('the controls: an expression, a parameter of the same name, and an untracked that is not core\'s, are left as written', () => {
        const code = setup(`import { untracked } from '@pdxui/core';\n${DECLS}\nfunction read(open: boolean) { return untracked(() => open); }\nfunction both() { return untracked(() => open && size); }`);
        expect(code).toMatch(/untracked\(\(\) => open\)/);
        expect(code).toMatch(/untracked\(\(\) => __open\(\) && size\(\)\)/);
        const local = setup(`${DECLS}\nfunction untracked<T>(f: () => T): T { return f(); }\nfunction read() { return untracked(() => open); }`);
        expect(local).toMatch(/untracked\(\(\) => __open\(\)\)/);
    });
});
