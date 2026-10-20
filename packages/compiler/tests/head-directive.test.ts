// Tests for @title/@meta runes — head management compilation.

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';

function compileHead(source: string) {
    return compile(source, 'page.pdx');
}

describe('@title — script analyzer + codegen', () => {
    it('parses static @title with single quotes', () => {
        const { code } = compileHead(`
<template><div>Page</div></template>
<script>
@title 'My Page';
</script>
        `);
        expect(code).toContain('useHead({ title: "My Page" })');
    });

    it('parses static @title with double quotes', () => {
        const { code } = compileHead(`
<template><div>Page</div></template>
<script>
@title "Products";
</script>
        `);
        expect(code).toContain('useHead({ title: "Products" })');
    });

    it('parses dynamic @title as expression', () => {
        const { code } = compileHead(`
<template><div>Page</div></template>
<script>
@page '/products';
let name = $signal('Widget');
@title name;
</script>
        `);
        // Dynamic title should use ctx.track effect, not useHead
        expect(code).toContain('document.title =');
        expect(code).not.toContain("useHead({ title:");
    });

    it('imports useHead for static title', () => {
        const { code } = compileHead(`
<template><div>Page</div></template>
<script>
@title 'Dashboard';
</script>
        `);
        expect(code).toContain('useHead');
        expect(code).toContain("from '@pdxui/core'");
    });
});

describe('@meta — script analyzer + codegen', () => {
    it('parses @meta with name', () => {
        const { code } = compileHead(`
<template><div>Page</div></template>
<script>
@meta description: 'Browse our products';
</script>
        `);
        expect(code).toContain('useHead({ meta: [{ name: "description", content: "Browse our products" }] })');
    });

    it('parses @meta with property (Open Graph)', () => {
        const { code } = compileHead(`
<template><div>Page</div></template>
<script>
@meta property og:title: 'My App';
</script>
        `);
        expect(code).toContain('property: "og:title"');
        expect(code).toContain('content: "My App"');
    });

    it('combines multiple @meta tags', () => {
        const { code } = compileHead(`
<template><div>Page</div></template>
<script>
@meta description: 'Product listing';
@meta property og:image: '/hero.png';
</script>
        `);
        expect(code).toContain('name: "description"');
        expect(code).toContain('property: "og:image"');
    });

    it('combines @title and @meta', () => {
        const { code } = compileHead(`
<template><div>Page</div></template>
<script>
@title 'Products';
@meta description: 'Browse products';
</script>
        `);
        expect(code).toContain('useHead({ title: "Products" })');
        expect(code).toContain('useHead({ meta: [{ name: "description"');
    });
});

describe('@scroll — script analyzer', () => {
    it('parses @scroll preserve', () => {
        const { code } = compileHead(`
<template><div>Page</div></template>
<script>
@page '/products';
@scroll 'preserve';
</script>
        `);
        // @scroll is stored in route info, used by router at build time
        // Verify it compiles without error
        expect(code).toBeTruthy();
    });
});

// `@head { … }` and `@route { … }` are removed forms (#277): `page-one-home.test.ts` has them, and how
// `pdx migrate` splits them. What stays here is what they were used for, in the beta's forms.
describe('route data and head tags, apart', () => {
    it('@page meta is the route\'s data, and @title / @meta name the head', () => {
        const { code, warnings } = compileHead(`
<template><div>Page</div></template>
<script>
@page '/products' { meta: { permissions: ['admin'] } };
@title 'Products';
@meta description: 'List';
</script>
        `);
        expect(warnings.filter((w) => w.severity !== 'info')).toEqual([]);
        expect(code).toContain('useHead({ title: "Products" })');
        expect(code).toContain('name: "description"');
        expect(code).toContain('meta:{"permissions":["admin"]}');
    });
});

describe('@params — typed route parameters', () => {
    it('parses @params with single param', () => {
        const { code } = compileHead(`
<template><div>Page</div></template>
<script>
@page '/users/:id';
@params { id: number };
</script>
        `);
        expect(code).toBeTruthy();
    });

    it('parses @params with multiple params', () => {
        const { code } = compileHead(`
<template><div>Page</div></template>
<script>
@page '/products/:category/:id';
@params { category: string, id: number };
</script>
        `);
        expect(code).toBeTruthy();
    });

    it('generates inject + computed for number param coercion', () => {
        const { code } = compileHead(`
<template><div>{{ id }}</div></template>
<script>
@page '/users/:id';
@params { id: number };
</script>
        `);
        // The outlet's token (#495), with a fallback: outside an outlet the params are empty, not a throw.
        expect(code).toContain('inject(RouteParams, ctx.el, null)');
        expect(code).toMatch(/import \{[^}]*\bRouteParams\b[^}]*\} from '@pdxui\/router'/);
        expect(code).toContain('computed(');
        expect(code).toContain('Number(');
    });

    it('generates string param without coercion', () => {
        const { code } = compileHead(`
<template><div>{{ slug }}</div></template>
<script>
@page '/posts/:slug';
@params { slug: string };
</script>
        `);
        expect(code).toContain('inject(RouteParams, ctx.el, null)');
        expect(code).toContain("__routeParams()?.slug ?? ''");
    });

    it('generates boolean param coercion', () => {
        const { code } = compileHead(`
<template><div>{{ active }}</div></template>
<script>
@page '/items/:active';
@params { active: boolean };
</script>
        `);
        expect(code).toContain("=== 'true'");
    });

    it('emits paramTypes in route registration', () => {
        const { code } = compileHead(`
<template><div>Page</div></template>
<script>
@page '/users/:id';
@params { id: number };
</script>
        `);
        expect(code).toContain('paramTypes:{id:"number"}');
    });
});

describe('head directives — no warnings', () => {
    it('produces zero warnings', () => {
        const { warnings } = compileHead(`
<template><div>Page</div></template>
<script>
@title 'Dashboard';
@meta description: 'Main dashboard';
@meta property og:title: 'Dashboard';
</script>
        `);
        expect(warnings).toEqual([]);
    });
});
