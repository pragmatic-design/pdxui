// A diagnostic that only reaches a terminal is not a diagnostic.
//
// A `PDX_*` code travels as a structured `ValidationWarning` object, which is what the LSP turns into
// editor squiggles and what `pdx check` reports; a `console.warn` string reaches neither. The three
// codes held to that here:
//
//   PDX_UNRESOLVED_COMPONENT  a <pdx-*> tag the resolver does not know — the custom element will
//                             not be registered, and CONTRIBUTING.md names that first among the
//                             silent failures: "nothing says so"
//   PDX_REWRITE_FALLBACK      a fragment naming a signal was not rewritten
//   PDX_TAG_COLLISION         two .pdx files deriving the same tag
//
// The third is different in kind: it *throws*, so the build stops with a message and a suggested
// fix. It is not silent.
//
// That holds for the site that throws. There is a SECOND collision site that does not: the
// resolver's disk scan, which warns and lets the scan continue. The two cover different inputs —
// the throwing one only sees files the build compiles, and a losing file is unreachable by
// auto-import precisely because it lost — so the scan has its own code, PDX_TAG_COLLISION_RESOLVER,
// covered in `resolver-collision-channel.test.ts`.

import { describe, it, expect } from 'vitest';
import { parseSFC } from '../src/parser/sfc';
import { parseTemplate } from '../src/parser/template';
import { analyzeScript } from '../src/compiler/script-analyzer';
import { validate } from '../src/compiler/validate';
import { compile } from '../src/plugin';

function analyse(template: string, script = 'let x = $signal(0);') {
    const src = `<template>\n${template}\n</template>\n\n<script setup>\n${script}\n</script>`;
    const d = parseSFC(src);
    return {
        analysis: analyzeScript(d.script?.content ?? '', 'probe.pdx'),
        ast: parseTemplate(d.template?.content ?? ''),
    };
}

describe('PDX_UNRESOLVED_COMPONENT reaches the structured channel', () => {
    it('reports a pdx-* tag the caller does not know', () => {
        const { analysis, ast } = analyse('<div><pdx-nope-here /></div>');
        const warnings = validate(analysis, ast, 'probe.pdx', { isKnownTag: t => t === 'pdx-button' });

        const hit = warnings.find(w => w.code === 'PDX_UNRESOLVED_COMPONENT');
        expect(hit, 'no structured diagnostic for an unknown component').toBeDefined();
        expect(hit!.message).toContain('pdx-nope-here');
    });

    it('says nothing about a tag the caller does know', () => {
        const { analysis, ast } = analyse('<div><pdx-button>hi</pdx-button></div>');
        const warnings = validate(analysis, ast, 'probe.pdx', { isKnownTag: t => t === 'pdx-button' });
        expect(warnings.filter(w => w.code === 'PDX_UNRESOLVED_COMPONENT')).toEqual([]);
    });

    it('says nothing when the caller supplies no tag set', () => {
        // A caller without a resolver — a unit test, a tool that only parses — must not be told
        // every component in the file is missing. Absence of knowledge is not evidence of absence.
        const { analysis, ast } = analyse('<div><pdx-anything /></div>');
        const warnings = validate(analysis, ast, 'probe.pdx');
        expect(warnings.filter(w => w.code === 'PDX_UNRESOLVED_COMPONENT')).toEqual([]);
    });

    it('carries a hint naming what to add', () => {
        const { analysis, ast } = analyse('<div><pdx-nope-here /></div>');
        const warnings = validate(analysis, ast, 'probe.pdx', { isKnownTag: () => false });
        const hit = warnings.find(w => w.code === 'PDX_UNRESOLVED_COMPONENT');
        // FixProposal is {title, edits} — the human-readable suggestion is `hint`.
        expect(hit?.hint ?? '').toMatch(/export|import/i);
    });
});

// PDX_REWRITE_FALLBACK is the other half: it fires during CODE GENERATION, which validate() does not
// run and neither the LSP nor `pdx check` reaches. A skipped rewrite means the generated code reads a
// signal without calling it — a runtime bug that a console line alone does not surface.
const NEWLINE = String.fromCharCode(10);

describe('PDX_REWRITE_FALLBACK reaches the structured channel', () => {
    // An unparseable setup body that NAMES a signal. The rewriter cannot parse it, so it returns the
    // fragment untouched: `count` stays a bare read of a signal that has become `__count`.
    const BROKEN = [
        '<template><div>{{ count }}</div></template>',
        '<script setup>',
        '  let count = $signal(0);',
        '  function bump() { count = ( }',
        '</script>',
    ].join(NEWLINE);

    it('reports the skipped rewrite in warnings, not only on the console', () => {
        const { warnings } = compile(BROKEN, 'broken.pdx');
        const hit = warnings.find(w => w.code === 'PDX_REWRITE_FALLBACK');
        expect(hit, 'a skipped rewrite left no structured diagnostic').toBeDefined();
        expect(hit!.message).toContain('broken.pdx');
    });

    it('says what to do about it', () => {
        const { warnings } = compile(BROKEN, 'broken.pdx');
        const hit = warnings.find(w => w.code === 'PDX_REWRITE_FALLBACK');
        expect(hit?.hint ?? '', 'the message names the problem; the hint has to name the fix').toBeTruthy();
    });

    it('stays quiet on a file that compiles cleanly', () => {
        // The control: a diagnostic that fires on everything is a diagnostic nobody reads.
        const ok = [
            '<template><div>{{ count }}</div></template>',
            '<script setup>',
            '  let count = $signal(0);',
            '  function bump() { count++; }',
            '</script>',
        ].join(NEWLINE);
        const { warnings } = compile(ok, 'ok.pdx');
        expect(warnings.filter(w => w.code === 'PDX_REWRITE_FALLBACK')).toEqual([]);
    });
});
