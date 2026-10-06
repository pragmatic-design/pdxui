// A `//` comment containing a semicolon is not cut in half, and its tail is not emitted as code.
//
// The setup script is split into statements on `;`, and the split has to know what a comment is.
// Otherwise prose is a syntax hazard: writing "…orders it after the signal it reads (see above); it
// is…" in a comment makes the module fail to compile, the dev server refuse it, the page 404, and
// the app go blank with nothing in the browser console. The diagnostic that does fire points at the
// comment's line and says "Unexpected keyword or identifier", which connects to nothing.

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';

const out = (script: string, template = '<div>{{ n }}</div>') => {
    const r = compile(`<template>${template}</template>\n<script setup>\n${script}\n</script>`,
        'semi.pdx', [], undefined, { production: false });
    return typeof r === 'string' ? { code: r, warnings: [] as { code: string }[] } : r;
};

describe('a semicolon inside a comment is not a statement boundary', () => {
    it('compiles a line comment that contains one', () => {
        const r = out('// a note with a semicolon; and a tail that is not code\nlet n = $signal(1);');

        expect(r.warnings.map(w => w.code), 'the comment was cut and its tail emitted as code')
            .not.toContain('PDX_SCRIPT_SYNTAX_ERROR');
        expect(r.code).toContain('signal(1');
    });

    it('keeps the comment whole in the output', () => {
        const r = out('// a note with a semicolon; and a tail that is not code\nlet n = $signal(1);');

        expect(r.code, 'the comment was split across lines')
            .toContain('// a note with a semicolon; and a tail that is not code');
    });

    it('handles several semicolons in one comment', () => {
        const r = out('// one; two; three; and prose after\nlet n = $signal(1);');
        expect(r.warnings.map(w => w.code)).not.toContain('PDX_SCRIPT_SYNTAX_ERROR');
        expect(r.code).toContain('// one; two; three; and prose after');
    });

    it('handles a block comment that contains one', () => {
        const r = out('/* a block; with a semicolon */\nlet n = $signal(1);');
        expect(r.warnings.map(w => w.code)).not.toContain('PDX_SCRIPT_SYNTAX_ERROR');
        expect(r.code).toContain('signal(1');
    });

    it('handles a multi-line block comment with semicolons on several lines', () => {
        const r = out('/*\n * first; line\n * second; line\n */\nlet n = $signal(1);');
        expect(r.warnings.map(w => w.code)).not.toContain('PDX_SCRIPT_SYNTAX_ERROR');
        expect(r.code).toContain('signal(1');
    });

    it('handles a trailing comment on a statement line', () => {
        const r = out('let n = $signal(1); // sets it to one; nothing more');
        expect(r.warnings.map(w => w.code)).not.toContain('PDX_SCRIPT_SYNTAX_ERROR');
        expect(r.code).toContain('signal(1');
    });

    it('a parenthetical followed by a semicolon compiles', () => {
        // The shape of prose most likely to reach a comment: a parenthetical, then a semicolon.
        const r = out('// orders it after the signal it reads (see above); it used to be the other way\nlet n = $signal(1);');
        expect(r.warnings.map(w => w.code)).not.toContain('PDX_SCRIPT_SYNTAX_ERROR');
    });
});

describe('a semicolon that IS a statement boundary still is one', () => {
    // The control: skipping comments must not stop the split from splitting.
    it('still separates two statements on one line', () => {
        const r = out('let a = $signal(1); let b = $signal(2);', '<div>{{ a }}{{ b }}</div>');

        expect(r.warnings.map(w => w.code)).not.toContain('PDX_SCRIPT_SYNTAX_ERROR');
        expect(r.code).toContain("name: 'semi:a'");
        expect(r.code, 'the second declaration was swallowed').toContain("name: 'semi:b'");
    });

    it('still rewrites a mutation that follows a comment with a semicolon', () => {
        const r = out([
            '// a note; with a semicolon',
            'let n = $signal(0);',
            'function bump() { n++; }',
        ].join('\n'));

        expect(r.warnings.map(w => w.code)).not.toContain('PDX_SCRIPT_SYNTAX_ERROR');
        expect(r.code, 'the signal mutation stopped being rewritten').toMatch(/__n\.set\(/);
    });

    it("an apostrophe in a comment does not swallow the code after it", () => {
        // Same root cause, second symptom: a splitter that reads the `'` of "compiler's" as the start
        // of a string literal stops splitting until the next quote — anywhere in the file.
        const r = out([
            "// read by the compiler's own pass",
            'let a = $signal(1); let b = $signal(2);',
        ].join('\n'), '<div>{{ a }}{{ b }}</div>');

        expect(r.warnings.map(w => w.code)).not.toContain('PDX_SCRIPT_SYNTAX_ERROR');
        expect(r.code).toContain("name: 'semi:a'");
        expect(r.code, 'the declaration after the apostrophe was swallowed').toContain("name: 'semi:b'");
    });

    it('a semicolon inside a string is not a boundary either', () => {
        const r = out(`let n = $signal('a;b');`, '<div>{{ n }}</div>');
        expect(r.warnings.map(w => w.code)).not.toContain('PDX_SCRIPT_SYNTAX_ERROR');
        expect(r.code).toContain("signal('a;b'");
    });
});
