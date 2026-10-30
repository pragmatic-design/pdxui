// PDX_ONE_WAY_EDITED_FIELD (#678): a one-way `:value` (or `:checked`) on a native field whose own
// `@input`/`@change` handler writes the bound signal. The binding writes only when its value changes
// (#44), so a handler that sets the signal and puts it back in one go — the user types `a`, the handler
// clears it — leaves `a` in the field while the signal is `''`. The field wants `::value`. The fix is
// offered when the handler is the plain assignment `x = $event.target.value` (or `.checked`); otherwise
// the warning says what to do. The runtime half — `::value` clearing the field — is
// packages/ui/tests/unit/one-way-edited-field-runtime.test.ts.

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';
import type { ValidationWarning } from '../src/compiler/validate';

function sfc(template: string, script: string): string {
    return `<template>\n${template}\n</template>\n<script>\n${script}\n</script>`;
}
const found = (template: string, script = "let query = $signal('');\nlet other = $signal('');"): ValidationWarning[] =>
    compile(sfc(template, script), 'm.pdx', [], undefined, {}).warnings.filter(w => w.code === 'PDX_ONE_WAY_EDITED_FIELD');

/** The source with a finding's fix applied, edits from the last to the first. */
function applied(source: string, w: ValidationWarning): string {
    let out = source;
    for (const e of [...(w.fix?.edits ?? [])].sort((a, b) => b.start - a.start)) out = out.slice(0, e.start) + e.newText + out.slice(e.end);
    return out;
}

/** #678's template, as the issue writes it. */
const ISSUE_SCRIPT = `let query = $signal('');
function onInput(e: Event) { query = (e.target as HTMLInputElement).value; reset(); }
function reset() { query = ''; }`;

describe('PDX_ONE_WAY_EDITED_FIELD', () => {
    it('#678\'s template: a warning on the :value, whose handler is a script function that writes the signal', () => {
        const w = found('<input :value="query" @input="onInput" />', ISSUE_SCRIPT);
        expect(w).toHaveLength(1);
        expect(w[0].severity).toBe('warn');
        expect(w[0].message).toContain(`':value="query"' on <input>`);
        expect(w[0].message).toContain("writes 'query'");
        expect(w[0].hint).toContain('::value="query"');
        // Not the plain assignment: the handler does more, so the change is the author's to make.
        expect(w[0].fix).toBeUndefined();
        expect(w[0].line).toBe(2);
    });

    it('a write in a function the handler calls counts', () => {
        expect(found('<input :value="query" @input="onInput($event)" />',
            "let query = $signal('');\nfunction onInput(e) { clear(); }\nfunction clear() { query = ''; }")).toHaveLength(1);
    });

    it('an inline handler, on <textarea> and <select>, and :checked with @change on a checkbox', () => {
        expect(found('<textarea :value="query" @input="query = $event.target.value.trim()"></textarea>')).toHaveLength(1);
        expect(found('<select :value="query" @change="query = $event.target.value; other = query"><option>a</option></select>')).toHaveLength(1);
        expect(found('<input type="checkbox" :checked="on" @change="on = $event.target.checked" />',
            'let on = $signal(false);')).toHaveLength(1);
    });

    it('the plain handler gets the fix: ::value, and the handler gone', () => {
        const source = sfc('<input class="q" :value="query" @input="query = $event.target.value" />', "let query = $signal('');");
        const w = compile(source, 'm.pdx', [], undefined, {}).warnings.filter(x => x.code === 'PDX_ONE_WAY_EDITED_FIELD');
        expect(w).toHaveLength(1);
        expect(w[0].fix?.title).toContain('::value');
        const fixed = applied(source, w[0]);
        expect(fixed).toContain('<input class="q" ::value="query" />');
        expect(compile(fixed, 'm.pdx', [], undefined, {}).warnings.filter(x => x.code === 'PDX_ONE_WAY_EDITED_FIELD')).toEqual([]);
    });

    it('the plain handler as an arrow, with a cast, and :checked', () => {
        const arrow = sfc('<input :value="query" @input="(e) => query = (e.target as HTMLInputElement).value" />', "let query = $signal('');");
        const [a] = compile(arrow, 'm.pdx', [], undefined, {}).warnings.filter(x => x.code === 'PDX_ONE_WAY_EDITED_FIELD');
        expect(applied(arrow, a)).toContain('<input ::value="query" />');
        const box = sfc('<input type="checkbox" :checked="on" @change="on = $event.target.checked" />', 'let on = $signal(false);');
        const [c] = compile(box, 'm.pdx', [], undefined, {}).warnings.filter(x => x.code === 'PDX_ONE_WAY_EDITED_FIELD');
        expect(applied(box, c)).toContain('<input type="checkbox" ::checked="on" />');
    });

    it('the second of two identical fields is the one found when only it is edited', () => {
        const source = sfc('<input :value="query" />\n<input :value="query" @input="query = $event.target.value" />', "let query = $signal('');");
        const [w] = compile(source, 'm.pdx', [], undefined, {}).warnings.filter(x => x.code === 'PDX_ONE_WAY_EDITED_FIELD');
        expect(w.line).toBe(3);
        expect(applied(source, w)).toContain('<input :value="query" />\n<input ::value="query" />');
    });

    it('control: ::value, a handler that writes another signal, a component, and :value.once raise nothing', () => {
        expect(found('<input ::value="query" @input="other = 1" />')).toEqual([]);
        expect(found('<input :value="query" @input="other = $event.target.value" />')).toEqual([]);
        expect(found('<input :value="query" @input="onInput" />',
            "let query = $signal('');\nlet other = $signal('');\nfunction onInput(e) { other = e.target.value; }")).toEqual([]);
        expect(found('<app-field :value="query" @input="query = $event.target.value"></app-field>')).toEqual([]);
        expect(found('<input :value.once="query" @input="query = $event.target.value" />')).toEqual([]);
        expect(found('<input :value="query" />')).toEqual([]);
    });
});
