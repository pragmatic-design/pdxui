// `@state name;` (#1436): a state of the host with no expression, set by the script's assignments.
// `name = on` is `ctx.state('name', !!(on))` — no signal and no effect at mount, as a TypeScript
// component's `ctx.state(…)` from a handler. A state is written, not read: CSS reads it with
// `:state(name)`, and a value the script reads is a `$signal`.

import { describe, it, expect } from 'vitest';
import { compile } from '../src/index';
import { analyzeScript } from '../src/compiler/script-analyzer';
import { validate } from '../src/compiler/validate';
import { parseTemplate } from '../src/parser/template';

const SCRIPT = [
    '@state shown;',
    'function draw(on: boolean) {',
    '    shown = on;',
    '}',
    'function hide() { shown = false; }',
].join('\n');

const source = (script: string, template = '<p></p>') => `<template>${template}</template>\n<script>\n${script}\n</script>`;
const codesOf = (script: string, template = '<p></p>') =>
    validate(analyzeScript(script, 'probe.pdx'), parseTemplate(template), 'probe.pdx').map(w => w.code);

describe('@state name; — set by assignment', () => {
    it('an assignment is ctx.state, with no ctx.states entry and no signal', () => {
        const { code } = compile(source(SCRIPT), 'C:/app/src/app-probe.pdx');
        expect(code).toContain(`ctx.state('shown', !!(on))`);
        expect(code).toContain(`ctx.state('shown', !!(false))`);
        expect(code).not.toContain('ctx.states(');
        expect(code).not.toMatch(/\bsignal\(/);
        expect(code).not.toContain('__shown');
    });

    it('it is listed among the component\'s states, as an expression state is', () => {
        expect(analyzeScript(SCRIPT, 'probe.pdx').states).toEqual([{ name: 'shown' }]);
    });

    it('beside an expression state, only that one goes to ctx.states', () => {
        const { code } = compile(source(`let busy = $signal(false);\n@state loading = busy;\n${SCRIPT}`), 'C:/app/src/app-probe.pdx');
        expect(code).toMatch(/ctx\.states\(\{ loading: \(\) ?=> ?__busy\(\) \}\)/);
        expect(code).toContain(`ctx.state('shown', !!(on))`);
    });

    it('a parameter of the same name is the parameter, not the state', () => {
        const { code } = compile(source('@state shown;\nfunction f(shown: boolean) { shown = !shown; }'), 'C:/app/src/app-probe.pdx');
        expect(code).toContain('shown = !shown;');
        expect(code).not.toContain(`ctx.state('shown'`);
    });

    it('raises no diagnostic when it is only written', () => {
        const codes = codesOf(SCRIPT);
        expect(codes).not.toContain('PDX_STATE_READ');
        expect(codes).not.toContain('PDX_MALFORMED_STATE');
        expect(codes.filter(c => /UNDECLARED/.test(c))).toEqual([]);
    });

    it('a read in the script is PDX_STATE_READ, an error', () => {
        for (const read of ['if (shown) hide();', 'shown = !shown;', 'shown ||= true;', 'shown++;', 'const was = shown;']) {
            const found = validate(analyzeScript(`${SCRIPT}\nfunction g() { ${read} }`, 'probe.pdx'), parseTemplate('<p></p>'), 'probe.pdx')
                .filter(w => w.code === 'PDX_STATE_READ');
            expect(found, read).toHaveLength(1);
            expect(found[0].severity).toBe('error');
            expect(found[0].message).toContain("'shown'");
        }
    });

    it('a read in the template is PDX_STATE_READ', () => {
        expect(codesOf(SCRIPT, '<p :hidden="!shown"></p>')).toContain('PDX_STATE_READ');
    });

    it('a name the script also declares is PDX_STATE_REDECLARED', () => {
        expect(codesOf('@state shown;\nlet shown = false;\nfunction f() { shown = true; }')).toContain('PDX_STATE_REDECLARED');
    });

    it('a hyphenated name cannot be assigned: PDX_MALFORMED_STATE says so', () => {
        const w = analyzeScript('@state label-left;', 'probe.pdx').warnings.find(x => x.code === 'PDX_MALFORMED_STATE');
        expect(w?.hint).toContain('@state name;');
    });

    it('control: @state name = expr; compiles as before', () => {
        const { code } = compile(source('let open = $signal(false);\n@state expanded = open;'), 'C:/app/src/app-probe.pdx');
        expect(code).toMatch(/ctx\.states\(\{ expanded: \(\) ?=> ?__open\(\) \}\)/);
        expect(codesOf('let open = $signal(false);\n@state expanded = open;', '<p>{{ open }}</p>')).not.toContain('PDX_STATE_READ');
    });
});
