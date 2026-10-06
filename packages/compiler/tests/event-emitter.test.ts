// `@event name: T` gives the component a function `name(detail)` that dispatches the event.
//
// The skill calls it "an emitter", the structure reference calls `selected(customer)` after
// `@event selected: string;`, and the project's own documentation lists "@event → emit function +
// CustomEvent dispatch" among what the compiler generates. A `.d.ts` interface alone is not enough:
// `selected(x)` would be a ReferenceError, logged as "[pdx] Unhandled event error" while the button
// seems to do nothing.
//
// This file is the compiler half: what is emitted, on each path. The runtime half — the parent's
// handler receiving the detail — is in packages/ui/tests/unit/event-emitter-runtime.test.ts, which
// mounts the compiled components in happy-dom.

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';
import { generateDts } from '../src/compiler/dts-generator';
import { analyzeScript } from '../src/compiler/script-analyzer';

const PATHS = {
    dev: {},
    build: { production: true },
    'production inline': { production: true, inlineBindings: true },
} as const;

function sfc(script: string, template = '<button @click="picked(\'a\')">x</button>'): string {
    return `<template>\n${template}\n</template>\n<script setup>\n${script}\n</script>`;
}

function parses(code: string): void {
    const body = code.replace(/^import .*$/gm, '');
    expect(() => new Function(body), `generated module is not valid JS:\n${body}`).not.toThrow();
}

for (const [name, opts] of Object.entries(PATHS)) {
    describe(`@event — ${name}`, () => {
        it('declares an emitter that dispatches through ctx.emit', () => {
            const { code } = compile(sfc('@event picked: string;\nlet n = $signal(0);'), 'pick.pdx', [], undefined, opts);
            parses(code);
            expect(code, 'no emitter for @event picked').toMatch(/const picked = \(detail\) => ctx\.emit\('picked', detail\)/);
        });

        it('hands it to the template, which calls ctx.picked', () => {
            const { code } = compile(sfc('@event picked: string;\nlet n = $signal(0);'), 'pick.pdx', [], undefined, opts);
            expect(code).toMatch(/return \{[^}]*\bpicked\b[^}]*\}/);
        });

        it('lets the script call it before anything else runs', () => {
            // A const: it must be declared before the body that calls it at setup time.
            const { code } = compile(sfc('@event picked: string;\nlet n = $signal(0);\npicked(\'on-setup\');'), 'pick.pdx', [], undefined, opts);
            parses(code);
            // Presence first: indexOf() of a missing emitter is -1, which is "before" everything.
            expect(code).toContain('const picked =');
            expect(code.indexOf('const picked ='), 'emitter declared after the code that calls it')
                .toBeLessThan(code.indexOf("picked('on-setup')"));
        });

        it('$emit dispatches too', () => {
            const { code } = compile(sfc("let n = $signal(0);\nfunction go(v) { $emit('chosen', v); }", '<b @click="go(1)">x</b>'), 'emit.pdx', [], undefined, opts);
            parses(code);
            expect(code, '$emit is called but defined nowhere').toMatch(/const \$emit = \(event, detail\) => ctx\.emit\(event, detail\)/);
        });
    });
}

describe('@event — what does not change', () => {
    it('an author who declares the name themselves keeps their own function', () => {
        const { code } = compile(sfc("@event picked: string;\nlet n = $signal(0);\nfunction picked(v) { console.log(v); }"), 'own.pdx', [], undefined, {});
        parses(code);
        expect(code).not.toMatch(/const picked =/);
    });

    it('no $emit helper when nothing calls $emit', () => {
        const { code } = compile(sfc('@event picked: string;\nlet n = $signal(0);'), 'pick.pdx', [], undefined, {});
        expect(code).not.toMatch(/const \$emit/);
    });

    it('control — the .d.ts still carries the events interface', () => {
        const analysis = analyzeScript('@event picked: string;', 'pick.pdx');
        const dts = generateDts({ tag: 'pdx-pick', props: [], events: analysis.events, slots: [] });
        expect(dts).toMatch(/export interface PdxPickEvents \{\s*picked: string;/);
    });
});
