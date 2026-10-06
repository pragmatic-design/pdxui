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
<script setup>
@title 'My Page';
</script>
        `);
        expect(code).toContain('useHead({ title: "My Page" })');
    });

    it('parses static @title with double quotes', () => {
        const { code } = compileHead(`
<template><div>Page</div></template>
<script setup>
@title "Products";
</script>
        `);
        expect(code).toContain('useHead({ title: "Products" })');
    });

    it('parses dynamic @title as expression', () => {
        const { code } = compileHead(`
<template><div>Page</div></template>
<script setup>
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
<script setup>
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
<script setup>
@meta description: 'Browse our products';
</script>
        `);
        expect(code).toContain('useHead({ meta: [{ name: "description", content: "Browse our products" }] })');
    });

    it('parses @meta with property (Open Graph)', () => {
        const { code } = compileHead(`
<template><div>Page</div></template>
<script setup>
@meta property og:title: 'My App';
</script>
        `);
        expect(code).toContain('property: "og:title"');
        expect(code).toContain('content: "My App"');
    });

    it('combines multiple @meta tags', () => {
        const { code } = compileHead(`
<template><div>Page</div></template>
<script setup>
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
<script setup>
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
<script setup>
@page '/products';
@scroll 'preserve';
</script>
        `);
        // @scroll is stored in route info, used by router at build time
        // Verify it compiles without error
        expect(code).toBeTruthy();
    });
});

describe('@head { ... } — structured head block', () => {
    it('parses @head with title', () => {
        const { code } = compileHead(`
<template><div>Page</div></template>
<script setup>
@head {
  title: 'My Dashboard';
}
</script>
        `);
        expect(code).toContain('useHead({ title: "My Dashboard" })');
    });

    it('parses @head with meta array', () => {
        const { code } = compileHead(`
<template><div>Page</div></template>
<script setup>
@head {
  meta: [
    { name: 'description', content: 'Browse products' },
    { property: 'og:title', content: 'My Site' },
  ];
}
</script>
        `);
        expect(code).toContain('name: "description"');
        expect(code).toContain('content: "Browse products"');
        expect(code).toContain('property: "og:title"');
        expect(code).toContain('content: "My Site"');
    });

    it('parses @head with title + meta combined', () => {
        const { code } = compileHead(`
<template><div>Page</div></template>
<script setup>
@head {
  title: 'Products';
  meta: [
    { name: 'description', content: 'Product list' },
  ];
}
</script>
        `);
        expect(code).toContain('useHead({ title: "Products" })');
        expect(code).toContain('name: "description"');
    });

    it('coexists with @meta { } route metadata', () => {
        const { code } = compileHead(`
<template><div>Page</div></template>
<script setup>
@page '/products';
@head {
  title: 'Products';
  meta: [{ name: 'description', content: 'List' }];
}
@meta { permissions: ['admin'] };
</script>
        `);
        expect(code).toContain('useHead({ title: "Products" })');
        expect(code).toContain('name: "description"');
    });
});

describe('@route { ... } — aggregate routing block', () => {
    it('parses @route with path', () => {
        const { code, warnings } = compileHead(`
<template><div>Page</div></template>
<script setup>
@route {
  path: '/users/:id';
  guard: 'admin.users';
  prefetch: 'hover';
  layout: 'dashboard';
}
</script>
        `);
        expect(warnings).toEqual([]);
        expect(code).toBeTruthy();
    });

    it('parses @route with search params', () => {
        const { code } = compileHead(`
<template><div>Page</div></template>
<script setup>
@route {
  path: '/products';
  search: { page: number, q: string };
}
</script>
        `);
        expect(code).toBeTruthy();
    });

    it('parses @route with transition and scroll', () => {
        const { code } = compileHead(`
<template><div>Page</div></template>
<script setup>
@route {
  path: '/dashboard';
  transition: 'slide-right';
  scroll: 'preserve';
  keepAlive: true;
}
</script>
        `);
        expect(code).toBeTruthy();
    });

    it('parses @route with params', () => {
        const { code } = compileHead(`
<template><div>Page</div></template>
<script setup>
@route {
  path: '/users/:id';
  params: { id: number };
}
</script>
        `);
        expect(code).toBeTruthy();
    });
});

describe('@params — typed route parameters', () => {
    it('parses @params with single param', () => {
        const { code } = compileHead(`
<template><div>Page</div></template>
<script setup>
@page '/users/:id';
@params { id: number };
</script>
        `);
        expect(code).toBeTruthy();
    });

    it('parses @params with multiple params', () => {
        const { code } = compileHead(`
<template><div>Page</div></template>
<script setup>
@page '/products/:category/:id';
@params { category: string, id: number };
</script>
        `);
        expect(code).toBeTruthy();
    });

    it('generates inject + computed for number param coercion', () => {
        const { code } = compileHead(`
<template><div>{{ id }}</div></template>
<script setup>
@page '/users/:id';
@params { id: number };
</script>
        `);
        expect(code).toContain("inject('routeParams'");
        expect(code).toContain('computed(');
        expect(code).toContain('Number(');
    });

    it('generates string param without coercion', () => {
        const { code } = compileHead(`
<template><div>{{ slug }}</div></template>
<script setup>
@page '/posts/:slug';
@params { slug: string };
</script>
        `);
        expect(code).toContain("inject('routeParams'");
        expect(code).toContain("__routeParams()?.slug ?? ''");
    });

    it('generates boolean param coercion', () => {
        const { code } = compileHead(`
<template><div>{{ active }}</div></template>
<script setup>
@page '/items/:active';
@params { active: boolean };
</script>
        `);
        expect(code).toContain("=== 'true'");
    });

    it('emits paramTypes in route registration', () => {
        const { code } = compileHead(`
<template><div>Page</div></template>
<script setup>
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
<script setup>
@title 'Dashboard';
@meta description: 'Main dashboard';
@meta property og:title: 'Dashboard';
</script>
        `);
        expect(warnings).toEqual([]);
    });
});
