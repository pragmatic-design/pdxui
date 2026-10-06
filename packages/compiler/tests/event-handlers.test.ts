// @event handler compilation — references, inline signal mutations, and wrapped expressions.

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';

function handlerCode(clickExpr: string): string {
    const src = `<template><button @click="${clickExpr}">x</button></template>\n`
        + `<script setup>\nlet count = $signal(0);\nfunction inc() { count++; }\n</script>`;
    return compile(src, 'x.pdx').code;
}

describe('@event handlers', () => {
    it('bare reference is passed as a function reference', () => {
        const out = handlerCode('inc');
        expect(out).toContain('safeHandler(ctx.inc');
        expect(out).not.toContain('() => ctx.inc'); // not wrapped
    });

    it('count++ → () => ctx.count.set(v => v + 1)', () => {
        expect(handlerCode('count++')).toContain('ctx.count.set(v => v + 1)');
    });

    it('count-- → () => ctx.count.set(v => v - 1)', () => {
        expect(handlerCode('count--')).toContain('ctx.count.set(v => v - 1)');
    });

    it('count += 5 → () => ctx.count.set(v => v + (5))', () => {
        expect(handlerCode('count += 5')).toContain('ctx.count.set(v => v + (5))');
    });

    it('count = count + 1 → set with the signal read', () => {
        expect(handlerCode('count = count + 1')).toContain('ctx.count.set(ctx.count() + 1)');
    });

    it("alert('hi') (a global call) → () => alert('hi')", () => {
        expect(handlerCode("alert('hi')")).toContain("() => alert('hi')");
    });

    it('a method call wraps and prefixes args', () => {
        expect(handlerCode('inc()')).toContain('() => ctx.inc()');
    });

    it('toggle via negation: open = !open → set(!ctx.open())', () => {
        expect(handlerCode('open = !open')).toContain('ctx.open.set(!ctx.open())');
    });

    // ── Lambdas / arrows ──────────────────────────────────────────
    it('arrow with a param keeps the param local and prefixes the call', () => {
        const out = handlerCode('e => inc(e.detail)');
        expect(out).toContain('e => ctx.inc(e.detail)');
    });

    it('arrow with a body mutation rewrites to .set, param stays local', () => {
        const out = handlerCode('e => count = e.detail');
        expect(out).toContain('e => ctx.count.set(e.detail)');
    });

    it('parenthesized arrow with empty params', () => {
        expect(handlerCode('() => inc()')).toContain('() => ctx.inc()');
    });

    it('empty-param arrow with a mutation body', () => {
        expect(handlerCode('() => count++')).toContain('() => ctx.count.set(v => v + 1)');
    });

    it('multi-param arrow keeps every param local', () => {
        expect(handlerCode('(a, b) => save(a, b)')).toContain('(a, b) => ctx.save(a, b)');
    });

    it('arrow with a block body rewrites each statement', () => {
        const out = handlerCode('(e) => { count++; log(e.detail) }');
        expect(out).toContain('(e) => { ctx.count.set(v => v + 1); ctx.log(e.detail) }');
    });

    // ── $event (Vue-style raw event) ──────────────────────────────
    it('$event is exposed as the wrapper param', () => {
        const out = handlerCode('inc($event.detail)');
        expect(out).toContain('($event) => ctx.inc($event.detail)');
    });

    it('$event in a mutation RHS', () => {
        const out = handlerCode('count = $event.detail');
        expect(out).toContain('($event) => ctx.count.set($event.detail)');
    });

    // ── Multiple statements ───────────────────────────────────────
    it('multiple statements run together in a block', () => {
        const out = handlerCode('count++; inc()');
        expect(out).toContain('($event) => { ctx.count.set(v => v + 1); ctx.inc() }');
    });

    it('does NOT split on a semicolon inside a string', () => {
        const out = handlerCode("alert('a;b')");
        // single statement → not wrapped in a multi-statement block
        expect(out).toContain("() => alert('a;b')");
        expect(out).not.toContain('($event) => {');
    });
});
