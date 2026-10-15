// A template literal's `${…}` in a template expression is read like the expression around it (#371).
//
// The prefixer skipped a template literal whole, substitutions included: `{{ `x-${label}` }}` compiled
// to a read of a bare `label`, which the render does not have — `ReferenceError: label is not defined`
// at mount — and `PDX_UNUSED_REACTIVE` called the signal unused, because nothing saw the read.
import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';

const SCRIPT = "<script setup>\nlet label = $signal('en');\nlet note = $signal('');\nconst rows = [{ id: 1 }];\nconst items = ['a'];\n</script>\n";
const build = (template: string) => compile(`<template>${template}</template>\n${SCRIPT}`, 'tl.pdx', [], undefined, { production: true });

describe('a template literal in a template expression', () => {
    it('an attribute binding reads the signal inside ${…}', () => {
        expect(build('<p :lang="`${label}`">x</p>').code).toContain('`${ctx.label()}`');
    });

    it('an interpolation too, and the text around it stays as written', () => {
        expect(build('<p>{{ `x-${label}` }}</p>').code).toContain('`x-${ctx.label()}`');
    });

    it('a @for row inside ${…} is the row getter', () => {
        expect(build('@for (rows as row; track row.id) { <p>{{ `${row.id}` }}</p> }').code).toContain('`${row().id}`');
    });

    it('an event handler and an @if condition, the same', () => {
        expect(build('<button @click="note = `n-${label}`">x</button>').code).toContain('ctx.note.setRaw(`n-${ctx.label()}`)');
        expect(build('@if (`${label}` === \'en\') { <p>x</p> }').code).toContain('`${ctx.label()}` === \'en\'');
    });

    it('a name an arrow binds stays local inside ${…}', () => {
        expect(build('<p>{{ items.map(x => `${x}!`).join() }}</p>').code).toContain('ctx.items.map(x => `${x}!`)');
    });

    it('nested: a template literal inside a substitution', () => {
        expect(build('<p>{{ `a${`b${label}`}` }}</p>').code).toContain('`a${`b${ctx.label()}`}`');
    });

    it('a signal read only inside ${…} is not reported unused', () => {
        const unused = build('<p>{{ `x-${label}` }}</p>').warnings
            .filter((w) => w.code === 'PDX_UNUSED_REACTIVE').map((w) => w.message);
        expect(unused.filter((m) => m.includes("'label'")), 'label is read, in ${…}').toEqual([]);
        // The control: `note`, which this template does not read, is still reported.
        expect(unused.filter((m) => m.includes("'note'"))).toHaveLength(1);
    });

    it('control — a template literal with no substitution is left as written', () => {
        expect(build('<p :lang="`en`">x</p>').code).toContain('`en`');
    });
});
