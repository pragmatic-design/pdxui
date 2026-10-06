// A page that renders a child outlet says so in its route.
//
// Nested routes need to know which route is a PARENT. The path cannot tell: `/owners` is a segment
// prefix of `/owners/new` and they are siblings, so inferring it renders the list in place of the
// form. `/docs` and `/docs/:slug`, `/components` and `/components/:tag` — a shared prefix is
// everywhere and it means nothing on its own.
//
// The declaration is the thing the feature already asks the author to write: a <pdx-router-outlet>
// in the parent's template. The compiler reads it and emits `hasOutlet:true`, and the router's chain
// requires it.

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';

const page = (template: string, path = '/tickets/:id'): string => `
<template>${template}</template>

<script setup>
@page '${path}';
</script>`;

describe('hasOutlet on the route a page registers', () => {
    it('is emitted when the template renders a child outlet', () => {
        const { code } = compile(page('<h1>Ticket</h1><pdx-router-outlet></pdx-router-outlet>'), 'ticket.pdx');
        expect(code, 'the page renders an outlet and its route does not say so').toContain('hasOutlet:true');
    });

    it('is emitted for the self-closing form too', () => {
        const { code } = compile(page('<pdx-router-outlet />'), 'ticket.pdx');
        expect(code).toContain('hasOutlet:true');
    });

    it('is NOT emitted for a page that renders no outlet', () => {
        const { code } = compile(page('<h1>Owners</h1><ul></ul>', '/owners'), 'owners.pdx');
        expect(code, 'a page with no outlet was marked as a parent — every route sharing a prefix would nest')
            .not.toContain('hasOutlet');
    });

    // Found by the golden corpus: `comp-overlay-outlet.pdx` prints `&lt;pdx-router-outlet&gt;` in a
    // source block — a page ABOUT the element — and a substring test marked it a parent.
    it('is NOT emitted for a page that only writes about the outlet', () => {
        const { code } = compile(page(
            '<pre><code>&lt;pdx-router-outlet&gt;&lt;/pdx-router-outlet&gt;</code></pre>', '/docs/router'), 'docs.pdx');
        expect(code, 'a page that documents the outlet was marked as a parent').not.toContain('hasOutlet');
    });

    it('is not emitted when the tag is only part of a longer name', () => {
        const { code } = compile(page('<pdx-router-outlet-preview />', '/preview'), 'preview.pdx');
        expect(code).not.toContain('hasOutlet');
    });

    it('is not emitted on a component that declares no page at all', () => {
        const source = `
<template><pdx-router-outlet /></template>

<script setup>
@prop label: string = '';
</script>`;
        const { code } = compile(source, 'shell.pdx');
        expect(code, 'a component with no @page registered a route').not.toContain('hasOutlet');
    });

    it('sits alongside the rest of the route, not instead of it', () => {
        const { code } = compile(`
<template><pdx-router-outlet /></template>

<script setup>
@page '/tickets/:id';
@guard 'tickets.read';
</script>`, 'ticket.pdx');
        expect(code).toContain('hasOutlet:true');
        expect(code).toContain("path:\"/tickets/:id\"");
        expect(code).toContain("guard:\"tickets.read\"");
    });
});
