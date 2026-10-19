// `@defer` in two phases, compiled (#281; docs/language/beta/template.md → «`@defer` — two phases»).
//
// Both render paths read `@defer (<render>; prefetch <prefetch>)`, `when (expr)` and `@error (err, retry)`
// and emit them as `defer()`'s options. `hover` is a removed form, rewritten to `interaction`. The
// runtime half is `core/tests/defer-two-phases.test.ts`.
import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';
import { generateNodes } from '../src/compiler/codegen-template';
import { parseTemplate } from '../src/parser/template';
import { parseDeferTriggers } from '../src/compiler/defer-triggers';
import { deferHover } from '../src/language/defer-hover';
import { createCompileContext } from '../src/compiler/compile-context';

const pdx = (template: string, script = '') => `<template>\n  ${template}\n</template>\n<script>\n${script}\n</script>\n`;
const errors = (source: string) => compile(source, 'd.pdx').warnings.filter((w) => w.severity === 'error');

/** The `defer({ … })` options the template path emits for a template. */
function templatePath(template: string): string {
    const imports = new Set<string>();
    return generateNodes(parseTemplate(template), imports, createCompileContext());
}

describe('the trigger grammar', () => {
    it('splits the phases at the top-level ; and the triggers at the top-level |', () => {
        expect(parseDeferTriggers('viewport | idle(500); prefetch idle | when (ready && !busy)')).toEqual({
            render: { triggers: ['viewport', 'idle(500)'], when: [] },
            prefetch: { triggers: ['idle'], when: ['ready && !busy'] },
            unknown: [],
        });
    });

    it('a | or a ; inside when ( … ) is the expression\'s', () => {
        expect(parseDeferTriggers("when (a || (b; c)) | interaction").render).toEqual({ triggers: ['interaction'], when: ['a || (b; c)'] });
    });

    it('what is not a trigger is listed: an unknown name, an empty when, a ; with no prefetch', () => {
        expect(parseDeferTriggers('soon | when ()').unknown).toEqual(['soon', 'when ()']);
        expect(parseDeferTriggers('viewport; idle').unknown).toEqual(['; idle']);
    });
});

describe('a compiled @defer (viewport; prefetch idle)', () => {
    it("emits prefetch: 'idle' on the inline path", () => {
        const { code } = compile(pdx('@defer (viewport; prefetch idle) { <p>x</p> }'), 'd.pdx');
        expect(code).toContain("trigger:'viewport'");
        expect(code).toContain("prefetch:'idle'");
    });

    it("and on the template path", () => {
        const code = templatePath('@defer (viewport; prefetch idle) { <p>x</p> }');
        expect(code).toContain("trigger: 'viewport'");
        expect(code).toContain("prefetch: 'idle'");
    });

    it('compiles with no diagnostic', () => {
        expect(errors(pdx('@defer (viewport; prefetch idle) { <p>x</p> }'))).toEqual([]);
    });

    it('control — triggers that are only built-ins are emitted as written, as before', () => {
        expect(compile(pdx('@defer (viewport | idle(2000)) { <p>x</p> }'), 'd.pdx').code).toContain("trigger:'viewport | idle(2000)'");
    });
});

describe('when (expr)', () => {
    it('is emitted as a function of the expression, its signals read, on both paths', () => {
        const source = pdx('@defer (when (tab === \'sales\'); prefetch when (ready)) { <p>x</p> }', "let tab = $signal('a');\nlet ready = $signal(false);");
        const { code } = compile(source, 'd.pdx');
        expect(code).toMatch(/when:\(\)=>\(ctx\.tab\(\) === 'sales'\)/);
        expect(code).toMatch(/prefetchWhen:\(\)=>\(ctx\.ready\(\)\)/);
        expect(code).not.toMatch(/trigger:/);
        expect(errors(source)).toEqual([]);
        expect(templatePath("@defer (when (open)) { <p>x</p> }")).toMatch(/when: \(\) => \(ctx\.open/);
    });
});

describe('@error (err, retry)', () => {
    it('binds the names on both paths, err and retry by default', () => {
        const named = compile(pdx('@defer (viewport) { <p>x</p> } @error (e, again) { <button @click="again()">{{ e.message }}</button> }'), 'd.pdx');
        expect(named.code).toMatch(/error:\(e,again\)=>/);
        expect(named.warnings.filter((w) => w.severity === 'error')).toEqual([]);
        expect(compile(pdx('@defer (viewport) { <p>x</p> } @error { <button @click="retry()">{{ err.message }}</button> }'), 'd.pdx').code).toMatch(/error:\(err,retry\)=>/);
        expect(templatePath('@defer (viewport) { <p>x</p> } @error (e, again) { <p>x</p> }')).toMatch(/error: \(e, again\) =>/);
    });
});

describe('@defer (hover)', () => {
    it('is PDX_REMOVED_FORM naming interaction, and not also an unknown trigger', () => {
        const codes = errors(pdx('@defer (hover) { <p>x</p> }'));
        expect(codes.map((w) => w.code)).toEqual(['PDX_REMOVED_FORM']);
        expect(codes[0].message).toContain('interaction');
    });

    it('pdx migrate rewrites it, in both phases, and a second run changes nothing', () => {
        const source = pdx("@defer (hover | viewport; prefetch hover) { <p>x</p> }\n  @defer (when (hover)) { <p>y</p> }", 'let hover = $signal(false);');
        const fixed = (deferHover.fix as (t: string) => string)(source);
        expect(fixed).toContain('@defer (interaction | viewport; prefetch interaction)');
        expect(fixed, 'the name inside when ( … ) was rewritten').toContain('@defer (when (hover))');
        expect((deferHover.fix as (t: string) => string)(fixed)).toBe(fixed);
        expect(errors(fixed)).toEqual([]);
    });
});
