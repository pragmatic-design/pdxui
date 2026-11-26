// A `.peek()` the script writes on a prop in an initialiser is not peeked again (#1419).
//
// An initialiser reads a prop at setup time, `ctx.prop.peek()` (#682). The rewrite added the `.peek()`
// to the prop's name even when the script had written one, `$signal(start.peek())` →
// `ctx.start.peek().peek()`: the string has no `peek`, and mount threw. Elsewhere in the script
// `x.peek()` on a prop stays as written (#676). Moving pdx-mention (#1210) found it.

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';
import { rewritePropPeeks } from '../src/compiler/signal-rewrite';

const pdx = (script: string, template = '<p>{{ copy }}</p>') => `<template>${template}</template>\n<script>\n${script}\n</script>\n`;

describe('a prop the initialiser peeks itself', () => {
    it('$signal(start.peek()) compiles to one .peek()', () => {
        const { code } = compile(pdx("@prop start: string = '';\nlet copy = $signal(start.peek());"), 'w.pdx');
        expect(code).toMatch(/signal\(ctx\.start\.peek\(\)[,)]/);
        expect(code).not.toMatch(/\.peek\(\)\.peek\(\)/);
    });

    it('in a $store initialiser too', () => {
        const { code } = compile(pdx("@prop start: string = '';\nlet state = $store({ copy: start.peek() });", '<p>{{ state.copy }}</p>'), 'w.pdx');
        expect(code).toMatch(/copy: ctx\.start\.peek\(\)/);
        expect(code).not.toMatch(/\.peek\(\)\.peek\(\)/);
    });

    it('with whitespace or a line break before .peek', () => {
        expect(rewritePropPeeks('start .peek()', new Set(['start']))).toBe('ctx.start .peek()');
        expect(rewritePropPeeks('start\n  .peek()', new Set(['start']))).toBe('ctx.start\n  .peek()');
    });
});

describe('controls', () => {
    it('a bare prop is still peeked once', () => {
        const { code } = compile(pdx("@prop start: string = '';\nlet copy = $signal(start);"), 'w.pdx');
        expect(code).toMatch(/signal\(ctx\.start\.peek\(\)[,)]/);
    });

    it('a member of the prop that is not peek is read off its value', () => {
        expect(rewritePropPeeks('start.length', new Set(['start']))).toBe('ctx.start.peek().length');
        expect(rewritePropPeeks('start.peekaboo', new Set(['start']))).toBe('ctx.start.peek().peekaboo');
    });

    it("a $signal's own .peek() in an initialiser is read once", () => {
        const { code } = compile(pdx('let a = $signal(1);\nlet copy = $signal(a.peek());'), 'w.pdx');
        expect(code).toMatch(/signal\(__a\.peek\(\)[,)]/);
        expect(code).not.toMatch(/\.peek\(\)\.peek\(\)/);
    });
});
