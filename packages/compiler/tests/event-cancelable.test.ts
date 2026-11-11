// `@event(cancelable)` (#1035): a .pdx dispatches an event its parent can refuse, as a TypeScript
// component does with `ctx.emit(name, detail, { cancelable: true })`. The emitter returns what the
// dispatch returns, so `if (!beforeMove(d)) return;` is the form. The runtime half — a listener's
// preventDefault() reaching the component — is in packages/core/tests/component-descriptor.test.ts.

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';
import { analyzeScript } from '../src/compiler/script-analyzer';
import { generateDts } from '../src/compiler/dts-generator';
import { eventBubbles } from '../src/language/event-bubbles';

function sfc(script: string, template = '<b @click="go()">x</b>'): string {
    return `<template>\n${template}\n</template>\n<script>\n${script}\nfunction go() {}\n</script>`;
}

describe('@event(cancelable) — the declaration', () => {
    it('is read, alone or beside bubbles, in either order, quoted or not', () => {
        const { events, warnings } = analyzeScript([
            "@event(cancelable) 'before-move': { id: string };",
            '@event(bubbles, cancelable) picked: number;',
            '@event(cancelable, bubbles) chosen;',
            '@event(bubbles) saved;',
        ].join('\n'), 'x.pdx');
        expect(warnings.map((w) => w.code)).not.toContain('PDX_UNKNOWN_DECLARATION');
        expect(events).toEqual([
            { name: 'before-move', emitter: 'beforeMove', payloadType: '{ id: string }', cancelable: true },
            { name: 'picked', payloadType: 'number', bubbles: true, cancelable: true },
            { name: 'chosen', payloadType: 'void', bubbles: true, cancelable: true },
            { name: 'saved', payloadType: 'void', bubbles: true },
        ]);
    });

    it('an unknown option is still PDX_UNKNOWN_DECLARATION, and the hint names both', () => {
        const { warnings } = analyzeScript('@event(sometimes) saved: number;', 'x.pdx');
        const w = warnings.find((x) => x.code === 'PDX_UNKNOWN_DECLARATION');
        expect(w, 'an unknown option was accepted').toBeDefined();
        expect(w!.message).toContain('`(bubbles)`');
        expect(w!.message).toContain('`(cancelable)`');
    });

    it('an option written twice is PDX_UNKNOWN_DECLARATION', () => {
        const { warnings } = analyzeScript('@event(cancelable, cancelable) saved;', 'x.pdx');
        expect(warnings.map((w) => w.code)).toContain('PDX_UNKNOWN_DECLARATION');
    });
});

describe('@event(cancelable) — the code', () => {
    const script = "@event(cancelable) 'before-move': { id: string };\n@event(bubbles, cancelable) picked: number;\n@event closed;";

    it('the emitter dispatches with cancelable: true and returns the dispatch: false when refused', () => {
        const { code } = compile(sfc(script), 'board.pdx', [], undefined, {});
        expect(code).toMatch(/const beforeMove = \(detail\) => ctx\.emit\('before-move', detail, \{ cancelable: true \}\);/);
        expect(code).toMatch(/const picked = \(detail\) => ctx\.emit\('picked', detail, \{ bubbles: true, cancelable: true \}\);/);
        expect(code).toMatch(/const closed = \(detail\) => ctx\.emit\('closed', detail\);/);
    });

    it('the descriptor declares it as event() does in TypeScript', () => {
        const { code } = compile(sfc(script), 'board.pdx', [], undefined, {});
        expect(code).toContain(`events: { 'before-move': { cancelable: true }, 'picked': { bubbles: true, cancelable: true }, 'closed': {} }`);
    });

    it('the .d.ts lists the event under its name', () => {
        const { events } = analyzeScript(script, 'board.pdx');
        const dts = generateDts({ tag: 'app-board', props: [], events, slots: [] });
        expect(dts).toContain("'before-move': { id: string }");
    });
});

describe('migrate — (bubbles) on an alpha @event', () => {
    it('reads an @event(cancelable) as one with options, and does not mark it twice', () => {
        const text = sfc("@event(cancelable) 'before-move': number;\n@event saved: number;");
        const fixed = (eventBubbles.fix as (t: string) => string)(text);
        expect(fixed).toContain("@event(cancelable) 'before-move': number;");
        expect(fixed).toContain('@event(bubbles) saved: number;');
        expect(fixed).not.toContain('(bubbles)(cancelable)');
    });
});
