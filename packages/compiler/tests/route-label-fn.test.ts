// `@page { label: fn }` — a crumb the application computes from the params.
//
// A string label names the ROUTE and cannot name the record: `Tickets / Ticket 1`, where a real
// one says `Tickets / T-1042 · Printer jam`. Both runtimes read the other half —
// `RegisteredRoute.label` and the generated router both read
// `typeof label === 'function' ? label(params) : fillParams(label, params)` — so the analyzer must
// not read the option as a string, nor the codegen write it out as one.
//
// The shape is `@loader`'s, for the same reason: the declaration names a function, the codegen
// lifts it to module scope and registers the REFERENCE, because a label that runs while the
// breadcrumb builds cannot reach anything inside `setup(ctx)`. A string label is untouched.
//
// Why not just pass `<pdx-breadcrumb :items="…">`: it works, and it breaks all five rows of the
// showcase's `breadcrumb-route.spec.ts` — the suite whose subject is that NO page mentions a
// crumb, so renaming a route renames the trail.

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';

const src = (script: string) =>
    `<template>\n<div>x</div>\n</template>\n<script setup>\n${script}\n</script>`;

const out = (s: string, file = 'ticket.pdx') => compile(s, file).code;

const FN_LABEL = src([
    "@page '/tickets/:id' { label: ticketLabel };",
    'function ticketLabel(params) { return `T-${params.id}`; }',
    'let ticket = $signal(null);',
].join('\n'));

const STRING_LABEL = src([
    "@page '/tickets' { label: 'Tickets' };",
    'let rows = $signal([]);',
].join('\n'));

describe('a label that names a function', () => {
    it('registers the reference, not the name', () => {
        const code = out(FN_LABEL);

        expect(code, 'the route carries the function NAME as a string, which no runtime can call')
            .not.toContain('label:"ticketLabel"');
        expect(code).toMatch(/label:\s*ticketLabel/);
    });

    it('declares the function at module level, where the route registration can see it', () => {
        const code = out(FN_LABEL);

        const declaration = code.indexOf('function ticketLabel');
        const setupStart = code.indexOf('setup(ctx)');
        expect(declaration, 'the label function was not emitted at all').toBeGreaterThanOrEqual(0);
        expect(declaration, 'it is still inside setup(ctx), out of the registration’s reach')
            .toBeLessThan(setupStart);
    });

    it('takes the function out of the setup body, so it is declared once', () => {
        const code = out(FN_LABEL);
        const occurrences = code.split('function ticketLabel').length - 1;
        expect(occurrences, 'declared twice — hoisted AND left in setup').toBe(1);
    });

    it('control — a string label is still a string, with its params intact', () => {
        // `label: 'Ticket :id'` is the directive's own way to reach a param, and the runtimes fill
        // it. Nothing here may turn it into an identifier.
        const code = out(src("@page '/tickets/:id' { label: 'Ticket :id' };\nlet t = $signal(0);"));
        expect(code).toContain('label:"Ticket :id"');
    });

    it('control — a plain string label is untouched', () => {
        expect(out(STRING_LABEL, 'tickets.pdx')).toContain('label:"Tickets"');
    });

    it('a label naming a function that is not declared is REPORTED, not registered', () => {
        // The shape PDX_LOADER_NOT_FOUND has: a route registered with a label the runtime would
        // call and cannot is a crash in the breadcrumb, which is worse than no crumb.
        const result = compile(
            src("@page '/tickets/:id' { label: missingLabel };\nlet t = $signal(0);"),
            'ticket.pdx',
        );
        const codes = (result.warnings ?? []).map(w => w.code);
        expect(codes, `no diagnostic: ${JSON.stringify(result.warnings)}`)
            .toContain('PDX_LABEL_NOT_FOUND');
        expect(result.code, 'it registered a label nothing can call')
            .not.toMatch(/label:\s*missingLabel/);
    });
});
