// An @event name with an uppercase letter cannot be listened to from a template.
//
// `@event itemPicked` dispatches `CustomEvent('itemPicked')`, but a parent's `@itemPicked="…"` is an
// HTML attribute: it is lowercased on parse, and the listener is registered for `itempicked`. The
// two names differ by case (measured in packages/ui/tests/unit/event-emitter-runtime.test.ts), and
// the compiler says so.

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';
import { analyzeScript } from '../src/compiler/script-analyzer';
import { validate } from '../src/compiler/validate';
import { parseTemplate } from '../src/parser/template';

function caseWarnings(script: string) {
    const analysis = analyzeScript(script, 'test.pdx');
    return validate(analysis, parseTemplate('<div></div>'), 'test.pdx').filter(w => w.code === 'PDX_EVENT_NAME_CASE');
}

describe('PDX_EVENT_NAME_CASE — an @event name a listener attribute cannot carry', () => {
    it('warns once on a camelCase @event, naming it and the form a listener can match', () => {
        const found = caseWarnings(`@event itemPicked: string;`);
        expect(found).toHaveLength(1);
        expect(found[0].severity).toBe('warn');
        expect(found[0].message).toContain('itemPicked');
        expect(found[0].message).toContain('itempicked');
        expect(found[0].hint).toMatch(/lowercase/i);
    });

    it('does not warn on a lowercase @event (the control)', () => {
        expect(caseWarnings(`@event picked: string;`)).toHaveLength(0);
    });

    it('warns once per offending event, not once per file', () => {
        const found = caseWarnings(`
            @event picked: string;
            @event itemPicked: string;
            @event rowOpened: number;
        `);
        expect(found.map(w => w.message.match(/'(\w+)'/)?.[1])).toEqual(['itemPicked', 'rowOpened']);
    });

    it('reaches the warnings compile() returns', () => {
        const result = compile(`
<template>
  <button @click="itemPicked('z')">pick</button>
</template>
<script setup>
@event itemPicked: string;
</script>`, 'test.pdx');
        expect(result.warnings.filter(w => w.code === 'PDX_EVENT_NAME_CASE')).toHaveLength(1);
    });
});
