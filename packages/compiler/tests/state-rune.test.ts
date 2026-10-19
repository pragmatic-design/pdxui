// `@state name = expression;` (#132): a visual state of the host, kept in the platform's custom states
// and matched in CSS with `:state(name)`. The compiler declares it in the descriptor and keeps it in
// sync with the expression in an effect; the expression has to be a boolean.

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';
import { analyzeScript } from '../src/compiler/script-analyzer';
import { validate } from '../src/compiler/validate';
import { parseTemplate } from '../src/parser/template';

const pdx = (script: string) => `<template><button>x</button></template>\n<script>\n${script}\n</script>`;

function codes(script: string, code: string) {
    const analysis = analyzeScript(script, 'test.pdx');
    const found = [...analysis.warnings, ...validate(analysis, parseTemplate('<div></div>'), 'test.pdx')];
    return found.filter(w => w.code === code);
}

describe('@state compiles into the descriptor and an effect', () => {
    it('declares the state, and sets it from its expression whenever that changes', () => {
        const { code } = compile(pdx('let open = $signal(false);\n@state expanded = open;'), 'test.pdx');
        expect(code).toContain("states: ['expanded'],");
        expect(code).toContain("ctx.track(() => { ctx.state('expanded', __open()); });");
    });

    it('takes any boolean expression, read reactively', () => {
        const { code } = compile(pdx('let count = $signal(0);\n@state busy = count > 0;'), 'test.pdx');
        expect(code).toContain("ctx.state('busy', __count() > 0)");
    });

    it('the control: a component with no @state declares no states and sets none', () => {
        const { code } = compile(pdx('let open = $signal(false);'), 'test.pdx');
        expect(code).not.toContain('states:');
        expect(code).not.toContain('ctx.state(');
    });
});

describe('PDX_STATE_NOT_BOOLEAN', () => {
    it('a number, a string or a $signal() is data, not a condition', () => {
        expect(codes('@state count = 0;', 'PDX_STATE_NOT_BOOLEAN')).toHaveLength(1);
        expect(codes("@state mode = 'open';", 'PDX_STATE_NOT_BOOLEAN')).toHaveLength(1);
        expect(codes('@state open = $signal(false);', 'PDX_STATE_NOT_BOOLEAN')).toHaveLength(1);
    });

    it('so is a signal whose value is a number', () => {
        const found = codes('let count = $signal(0);\n@state busy = count;', 'PDX_STATE_NOT_BOOLEAN');
        expect(found).toHaveLength(1);
        expect(found[0].hint).toContain('$signal');
    });

    it('the control: a boolean signal, a comparison and a literal boolean are accepted', () => {
        expect(codes('let open = $signal(false);\n@state expanded = open;', 'PDX_STATE_NOT_BOOLEAN')).toHaveLength(0);
        expect(codes('let count = $signal(0);\n@state busy = count > 0;', 'PDX_STATE_NOT_BOOLEAN')).toHaveLength(0);
        expect(codes('@state on = true;', 'PDX_STATE_NOT_BOOLEAN')).toHaveLength(0);
    });
});

describe('a signal a @state reads is read', () => {
    it('is not PDX_UNUSED_REACTIVE when the @state is its only reader', () => {
        expect(codes('let open = $signal(false);\n@state expanded = open;', 'PDX_UNUSED_REACTIVE')).toHaveLength(0);
    });

    it('the control: a signal nothing reads still is', () => {
        expect(codes('let open = $signal(false);', 'PDX_UNUSED_REACTIVE')).toHaveLength(1);
    });
});

describe('PDX_MALFORMED_STATE', () => {
    it('a @state with no expression is reported, not dropped', () => {
        expect(codes('@state open;', 'PDX_MALFORMED_STATE')).toHaveLength(1);
    });
});
