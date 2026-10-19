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

// The second form puts the button in a scoped slot's body, which the template generator wrote until
// #364 and the inline path writes now: the same handler, at the top level and in a slot.
const SOURCE = (handler: string, inline = true): string => `<template>${inline ? '' : '<pdx-list><slot name="item" let:row>'}<button @click="${handler}">x</button>${inline ? '' : '</slot></pdx-list>'}</template>
<script>
let count = $signal(0); let open = $signal(false); let name = $signal('');
const item = 1;
function save(x) {} function a() {} function b() {} function onClick() {} function onFrameLoad(e) {}
</script>`;

/**
 * The handler expression each path hands to `safeHandler`, inside the `batchHandler(…)` every
 * compiled handler is wrapped in (#114) — required here, so a path that stopped batching fails.
 */
function handlerOf(handler: string, inline: boolean): string {
    const { code } = compile(SOURCE(handler, inline), 'p.pdx', [], undefined, { production: true });
    const m = /addEventListener\('click', safeHandler\(batchHandler\(([\s\S]*?)\), ctx\.el/.exec(code);
    if (!m) throw new Error(`no click handler found in the ${inline ? 'top-level' : 'slot body'} output for ${handler}`);
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
        expect(handlerOf('open = !open', true)).toBe('() => ctx.open.setRaw(!ctx.open())');
    });

    it('a signal written inside an arrow goes through .set too', () => {
        expect(handlerOf('e => name = e.target.value', true)).toBe('e => ctx.name.setRaw(e.target.value)');
    });

    it('two statements are a block, not two arguments', () => {
        expect(handlerOf('a(); b()', true)).toBe('($event) => { ctx.a(); ctx.b() }');
    });
});

describe('an event with modifiers and no handler', () => {
    // `<a @click.stop>` stops the click and does nothing else. The inline path wrote
    // `batchHandler(() => )`, a module that does not parse: the showcase's shell has one, in a slot.
    for (const [where, template] of [
        ['the top level', '<a href="/x" @click.stop>x</a>'],
        ['a scoped slot body', '<pdx-list><slot name="item" let:row><a href="/x" @click.stop>x</a></slot></pdx-list>'],
    ] as const) {
        it(`${where}: the module parses, and the click still stops`, () => {
            const { code } = compile(`<template>${template}</template>\n<script>\nlet n = $signal(0);\n</script>`, 'p.pdx', [], undefined, { production: true });
            expect(() => new Function(code.replace(/^\s*import\b.*$/gm, '')), 'the module does not parse').not.toThrow();
            expect(code).toContain('e.stopPropagation();');
            expect(code).toContain('batchHandler(() => {})');
        });
    }
});
