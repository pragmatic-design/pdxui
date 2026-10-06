import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';

// What a layout needs from the compiler is its TAG — the name `@layout`
// resolves to — and that is what is asserted here; `layout-directive.test.ts` measures the
// resolution itself, and `outlet-layout-directive.test.ts` the effect on the DOM.
describe('layout codegen', () => {
    it('derives the layout tag from the file, which is what @layout resolves to', () => {
        const source = `
<template>
    <nav>Nav</nav>
    <slot />
</template>

<script setup>
let title = $signal('App');
</script>`;

        const { code } = compile(source, '_layout.pdx');
        expect(code).toContain("component('pdx-layout'");
        expect(code, 'the dead self-registration is back').not.toContain('__pdx_layouts');
    });

    it('uses parent dir in tag for nested layout', () => {
        const source = `
<template>
    <aside>Sidebar</aside>
    <slot />
</template>

<script setup>
let expanded = $signal(true);
</script>`;

        const { code } = compile(source, 'admin/_layout.pdx');
        expect(code, "the tag @layout 'admin' resolves to").toContain("component('pdx-admin-layout'");
    });

    it('does NOT emit __pdx_layouts for regular components', () => {
        const source = `
<template><div>Regular</div></template>

<script setup>
let count = $signal(0);
</script>`;

        const { code } = compile(source, 'counter.pdx');
        expect(code).not.toContain('__pdx_layouts');
    });

    it('strips leading _ from special file tag names', () => {
        const source = `
<template><div>Error</div></template>

<script setup>
@prop code: string = '500';
</script>`;

        const { code } = compile(source, '_error.pdx');
        expect(code).toContain("component('pdx-error'");
    });

    it('registers no layout chain for a page that declares none', () => {
        const source = `
<template><div>Dashboard</div></template>

<script setup>
@page '/dashboard';
</script>`;

        const { code } = compile(source, 'dashboard.pdx');
        expect(code).toContain('__pdx_routes');
        expect(code).toContain('path:"/dashboard"');
        expect(code, 'a shell appeared around a page that asked for none').not.toContain('layouts:');
    });
});

describe('error page codegen', () => {
    it('generates __pdx_error_pages registration for _404.pdx', () => {
        const source = `
<template>
    <h1>404</h1>
    <p>Page not found</p>
</template>

<script setup>
@prop code: string = '404';
@prop path: string = '';
</script>`;

        const { code } = compile(source, '_404.pdx');
        expect(code).toContain('__pdx_error_pages');
        expect(code).toContain("'404'");
        expect(code).toContain("component('pdx-404'");
    });

    it('generates __pdx_error_pages for _error-403.pdx', () => {
        const source = `
<template>
    <h1>Forbidden</h1>
</template>

<script setup>
@prop code: string = '403';
</script>`;

        const { code } = compile(source, '_error-403.pdx');
        expect(code).toContain('__pdx_error_pages');
        expect(code).toContain("'403'");
    });

    it('does NOT emit error page registration for regular components', () => {
        const source = `
<template><div>Regular</div></template>

<script setup>
let x = $signal(0);
</script>`;

        const { code } = compile(source, 'about.pdx');
        expect(code).not.toContain('__pdx_error_pages');
    });
});
