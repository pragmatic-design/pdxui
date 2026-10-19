// A `@defer` trigger the runtime does not know is an error, never a body that loads at once (#260).
//
// The runtime's fallback for a trigger it does not recognise is «fire immediately» — the safe failure
// for a hand-written `defer()` call, and the opposite of what `@defer (viewprt)` meant. The compiler
// now names it: PDX_DEFER_UNKNOWN_TRIGGER, an error, at the trigger (beta spec, template.md;
// decisions.md 39). Triggers combine with `|`, so each part is judged on its own.

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';
import { DEFER_TRIGGERS, unknownDeferTriggers } from '../src/compiler/defer-triggers';

const page = (trigger: string) =>
    `<template>\n  <section>\n    @defer (${trigger}) { <p>x</p> }\n  </section>\n</template>\n<script>\n</script>\n`;

const unknown = (trigger: string) =>
    compile(page(trigger), 'x.pdx').warnings.filter((w) => w.code === 'PDX_DEFER_UNKNOWN_TRIGGER');

describe('@defer triggers', () => {
    it('a misspelt trigger is PDX_DEFER_UNKNOWN_TRIGGER, an error that names it', () => {
        const found = unknown('viewprt');
        expect(found).toHaveLength(1);
        expect(found[0].severity).toBe('error');
        expect(found[0].message).toContain('viewprt');
        expect(found[0].message + (found[0].hint ?? '')).toContain('immediate');
    });

    it('it is placed on the @defer line', () => {
        expect(unknown('viewprt')[0].line).toBe(3);
    });

    for (const ok of ['viewport | idle(500)', 'timer(100)', 'interaction', 'hover', 'immediate', 'idle', 'viewport']) {
        it(`control: @defer (${ok}) reports nothing`, () => {
            expect(unknown(ok)).toEqual([]);
        });
    }

    it('in a combination, only the unknown part is reported', () => {
        const found = unknown('viewport | soon');
        expect(found).toHaveLength(1);
        // The message quotes the whole trigger for context and blames the one part.
        expect(found[0].message).toContain("'soon' is not a trigger");
        expect(found[0].message).not.toContain("'viewport'");
    });

    for (const bad of ['idle(2s)', 'timer', 'on viewport']) {
        it(`${bad} is not a trigger the runtime reads`, () => {
            expect(unknown(bad)).toHaveLength(1);
        });
    }

    it('exports the list it checks against, for the migration registry to reuse (#121)', () => {
        expect(DEFER_TRIGGERS).toEqual(expect.arrayContaining(['immediate', 'viewport', 'idle', 'interaction']));
        // `hover` is a removed form (#281), not a trigger: PDX_REMOVED_FORM reports it, this list does not.
        expect(DEFER_TRIGGERS).not.toContain('hover');
        expect(unknownDeferTriggers('hover')).toEqual([]);
        expect(unknownDeferTriggers('viewport | idle(10) | nope')).toEqual(['nope']);
    });
});
