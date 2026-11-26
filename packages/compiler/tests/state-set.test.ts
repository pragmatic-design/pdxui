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
        expect(analyzeScript(SCRIPT, 'probe.pdx').states).toEqual([{ name: 'shown', binding: 'shown' }]);
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

    // #1441: a hyphenated name binds its camelCase, as `@event 'open-change'` emits with `openChange`;
    // `as` names the binding when the script already uses the state's name.
    it('a hyphenated name is set by its camelCase', () => {
        const script = '@state at-top;\nfunction edge(on: boolean) { atTop = on; }';
        expect(analyzeScript(script, 'probe.pdx').states).toEqual([{ name: 'at-top', binding: 'atTop' }]);
        const { code } = compile(source(script), 'C:/app/src/app-probe.pdx');
        expect(code).toContain(`ctx.state('at-top', !!(on))`);
        expect(code).not.toContain('ctx.states(');
        expect(codesOf(script)).toEqual(expect.not.arrayContaining(['PDX_MALFORMED_STATE', 'PDX_STATE_READ']));
    });

    it('`as` names the binding: the state keeps its name, the prop keeps its own', () => {
        const script = '@prop blocked: boolean = false;\n@state blocked as held;\nfunction block(on: boolean) { held = on || blocked; }';
        expect(analyzeScript(script, 'probe.pdx').states).toEqual([{ name: 'blocked', binding: 'held' }]);
        const { code } = compile(source(script), 'C:/app/src/app-probe.pdx');
        expect(code).toContain(`ctx.state('blocked', !!(on || blocked()))`);
        expect(codesOf(script)).toEqual(expect.not.arrayContaining(['PDX_STATE_REDECLARED', 'PDX_STATE_READ']));
        expect(analyzeScript('@state at-top as top;', 'probe.pdx').states).toEqual([{ name: 'at-top', binding: 'top' }]);
    });

    it('a read of the binding is PDX_STATE_READ, naming the state', () => {
        const found = validate(analyzeScript('@state at-top;\nfunction f() { if (atTop) return; }', 'probe.pdx'), parseTemplate('<p></p>'), 'probe.pdx')
            .filter(w => w.code === 'PDX_STATE_READ');
        expect(found).toHaveLength(1);
        expect(found[0].message).toContain("'at-top'");
        expect(found[0].message).toContain('atTop');
    });

    it('a binding the script also declares is PDX_STATE_REDECLARED, and its hint is `as`', () => {
        const found = validate(analyzeScript('@prop blocked: boolean = false;\n@state blocked;', 'probe.pdx'), parseTemplate('<p></p>'), 'probe.pdx')
            .filter(w => w.code === 'PDX_STATE_REDECLARED');
        expect(found).toHaveLength(1);
        expect(found[0].hint).toContain('@state blocked as ');
        expect(codesOf('@state at-top;\nlet atTop = false;')).toContain('PDX_STATE_REDECLARED');
    });

    it('a binding that is not an identifier, or a reserved word, is PDX_MALFORMED_STATE', () => {
        for (const bad of ['@state open as 1x;', '@state open as class;', '@state a-;', '@state delete;']) {
            expect(analyzeScript(bad, 'probe.pdx').warnings.map(w => w.code), bad).toContain('PDX_MALFORMED_STATE');
        }
        // In an expression state, `as` is TypeScript's: `@state open = (x as boolean);` is one.
        expect(analyzeScript('@state open = (x as boolean);', 'probe.pdx').states).toEqual([{ name: 'open', expr: '(x as boolean)' }]);
    });

    it('control: @state name = expr; compiles as before', () => {
        const { code } = compile(source('let open = $signal(false);\n@state expanded = open;'), 'C:/app/src/app-probe.pdx');
        expect(code).toMatch(/ctx\.states\(\{ expanded: \(\) ?=> ?__open\(\) \}\)/);
        expect(codesOf('let open = $signal(false);\n@state expanded = open;', '<p>{{ open }}</p>')).not.toContain('PDX_STATE_READ');
    });
});
