// The two render paths must wire an event handler the same way.
//
// `codegen-template-rewrite.ts` has `buildEventHandler`, and its own comment says what it exists
// for: without it `@click="count++"` compiles to `safeHandler(ctx.count++)` — evaluated once at
// bind time, clobbering the signal — arrows are double-wrapped, and `$event` is unavailable.
//
// A two-line version of it on the inline path (`inlineBindings`):
//
//     expr.includes('(') ? `() => ${callSignals(px)}` : px
//
// gets five of the seven forms CONTRIBUTING.md documents as supported wrong, and every one of them
// silently:
//
//   @load="f($event)"      → `() => ctx.f($event)`      — `$event` is a free identifier: a
//                                                         ReferenceError that `safeHandler` eats
//   @click="count++"       → `ctx.count++`              — at bind time, on the signal OBJECT
//   @click="open = !open"  → `ctx.open = !ctx.open`     — at bind time, and it REPLACES the signal
//   @input="e => n = e.x"  → `e => ctx.n = e.x`         — same, inside an arrow
//   @click="a(); b()"      → `() => ctx.a(); ctx.b()`   — not even valid as an argument
//
// With the first of those, `<iframe @load="onFrameLoad($event)">` never calls its handler, so the
// builder's preview frame is never captured and nothing can be measured or themed.
//
// The assertion is PARITY, not a snapshot of either path. A handler is a contract between the
// author and the runtime, and which render path compiled it is not the author's business.

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';

/** Every form CONTRIBUTING.md § "Writing .pdx" lists, plus the two the builder uses. */
const FORMS = [
    'onClick',                          // bare reference
    'save(item)',                       // call
    'onFrameLoad($event)',              // the raw event
    'count++',                          // signal mutation
    'open = !open',                     // signal assignment
    'e => name = e.target.value',       // arrow with a signal write
    'a(); b()',                         // multi-statement
];

const SOURCE = (handler: string): string => `<template><button @click="${handler}">x</button></template>
<script setup>
let count = $signal(0); let open = $signal(false); let name = $signal('');
const item = 1;
function save(x) {} function a() {} function b() {} function onClick() {} function onFrameLoad(e) {}
</script>`;

/** The handler expression each path hands to `safeHandler`. */
function handlerOf(handler: string, inlineBindings: boolean): string {
    const { code } = compile(SOURCE(handler), 'p.pdx', [], undefined, { production: true, inlineBindings });
    const re = inlineBindings
        ? /addEventListener\('click', safeHandler\(([\s\S]*?), ctx\.el/
        : /@click=\$\{safeHandler\(([\s\S]*?), ctx\.el/;
    const m = re.exec(code);
    if (!m) throw new Error(`no click handler found in the ${inlineBindings ? 'inline' : 'template'} output for ${handler}`);
    return m[1];
}

describe('an event handler compiles the same in both render paths', () => {
    for (const form of FORMS) {
        it(`@click="${form}"`, () => {
            expect(handlerOf(form, true), 'the inline path wires this handler differently')
                .toBe(handlerOf(form, false));
        });
    }
});

describe('and the forms that were silently broken are right on their own terms', () => {
    // Parity alone would be satisfied by breaking BOTH paths the same way. These say what right is.
    it('$event is a parameter, not a free identifier', () => {
        expect(handlerOf('onFrameLoad($event)', true)).toBe('($event) => ctx.onFrameLoad($event)');
    });

    it('a signal mutation is deferred to the event and goes through .set', () => {
        expect(handlerOf('count++', true)).toBe('() => ctx.count.set(v => v + 1)');
    });

    it('a signal assignment does not replace the signal', () => {
        expect(handlerOf('open = !open', true)).toBe('() => ctx.open.set(!ctx.open())');
    });

    it('a signal written inside an arrow goes through .set too', () => {
        expect(handlerOf('e => name = e.target.value', true)).toBe('e => ctx.name.set(e.target.value)');
    });

    it('two statements are a block, not two arguments', () => {
        expect(handlerOf('a(); b()', true)).toBe('($event) => { ctx.a(); ctx.b() }');
    });
});
