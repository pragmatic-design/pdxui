// Tests for Sprint 2 router runes: @redirect, @alias, @search, @outlet, route @meta, param constraints.

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';
import { analyzeScript } from '../src/compiler/script-analyzer';
// Static, not an `await import()` in the test body: loaded there, the module is transformed inside
// the test's 5-second budget, and under the gate's load that alone can time out.
import { filePathToRoute } from '../../cli/src/routing/file-router';

describe('@page with param constraints', () => {
    it('parses constraint in path', () => {
        const analysis = analyzeScript("@page '/users/:id(number)';", 'test.pdx');
        expect(analysis.route.page).toBe('/users/:id(number)');
    });

    it('emits paramConstraints in route manifest', () => {
        const { code } = compile(`
<template><div>User</div></template>
<script setup>
@page '/users/:id(number)';
</script>`, 'user.pdx');
        expect(code).toContain('paramConstraints:{id:"number"}');
    });

    it('emits multiple constraints', () => {
        const { code } = compile(`
<template><div>Order</div></template>
<script setup>
@page '/orders/:year(number)/:month(number)';
</script>`, 'order.pdx');
        expect(code).toContain('year:"number"');
        expect(code).toContain('month:"number"');
    });
});

describe('@redirect rune', () => {
    it('parses redirect with from -> to', () => {
        const analysis = analyzeScript("@page '/app';\n@redirect '/' -> '/app';", 'test.pdx');
        expect(analysis.route.redirects).toEqual([{ from: '/', to: '/app' }]);
    });

    it('parses redirect target (page-level)', () => {
        const analysis = analyzeScript("@page '/old';\n@redirect '/new';", 'test.pdx');
        expect(analysis.route.redirectTo).toBe('/new');
    });

    it('emits __pdx_redirects', () => {
        const { code } = compile(`
<template><div>App</div></template>
<script setup>
@page '/app';
@redirect '/' -> '/app';
</script>`, 'app.pdx');
        expect(code).toContain('__pdx_redirects');
        expect(code).toContain('from:"/"');
        expect(code).toContain('to:"/app"');
    });
});

describe('@alias rune', () => {
    it('parses alias', () => {
        const analysis = analyzeScript("@page '/users';\n@alias '/people';", 'test.pdx');
        expect(analysis.route.aliases).toEqual(['/people']);
    });

    it('parses inline aliases via @page', () => {
        const analysis = analyzeScript("@page '/users', '/people';", 'test.pdx');
        expect(analysis.route.page).toBe('/users');
        expect(analysis.route.aliases).toEqual(['/people']);
    });

    it('emits alias route entries', () => {
        const { code } = compile(`
<template><div>Users</div></template>
<script setup>
@page '/users';
@alias '/people';
</script>`, 'users.pdx');
        expect(code).toContain('path:"/users"');
        expect(code).toContain('path:"/people"');
    });
});

describe('@search rune', () => {
    it('parses search params schema', () => {
        const analysis = analyzeScript("@page '/products';\n@search { page: number = 1, sort: string = 'name', filter?: string };", 'test.pdx');
        expect(analysis.route.searchParams).toHaveLength(3);
        expect(analysis.route.searchParams![0]).toEqual({ name: 'page', type: 'number', default: '1', optional: false });
        expect(analysis.route.searchParams![1]).toEqual({ name: 'sort', type: 'string', default: 'name', optional: false });
        expect(analysis.route.searchParams![2]).toEqual({ name: 'filter', type: 'string', default: undefined, optional: true });
    });
});

describe('@outlet rune', () => {
    it('parses outlet declaration', () => {
        const analysis = analyzeScript("@page '/dashboard';\n@outlet 'sidebar' -> 'pdx-sidebar-nav';", 'test.pdx');
        expect(analysis.route.outlets).toEqual([{ name: 'sidebar', tag: 'pdx-sidebar-nav' }]);
    });

    it('emits outlets in route manifest', () => {
        const { code } = compile(`
<template><div>Dashboard</div></template>
<script setup>
@page '/dashboard';
@outlet 'sidebar' -> 'pdx-sidebar-nav';
</script>`, 'dashboard.pdx');
        expect(code).toContain('outlets:[{name:"sidebar",tag:"pdx-sidebar-nav"}]');
    });
});

describe('route @meta (block form)', () => {
    it('parses route meta object', () => {
        const analysis = analyzeScript("@page '/admin';\n@meta { permissions: ['admin'], breadcrumb: 'Admin' };", 'test.pdx');
        expect(analysis.route.meta).toEqual({ permissions: ['admin'], breadcrumb: 'Admin' });
    });

    it('does NOT confuse with HTML @meta', () => {
        const analysis = analyzeScript("@page '/page';\n@meta description: 'A nice page';", 'test.pdx');
        // HTML @meta goes to head.meta, not route.meta
        expect(analysis.route.meta).toBeUndefined();
        expect(analysis.head.meta.length).toBeGreaterThan(0);
    });

    it('emits meta in route manifest', () => {
        const { code } = compile(`
<template><div>Admin</div></template>
<script setup>
@page '/admin';
@meta { permissions: ['admin.view'] };
</script>`, 'admin.pdx');
        expect(code).toContain('meta:{"permissions":["admin.view"]}');
    });
});

describe('file-router param constraint convention', () => {
    it('[id=number].pdx → :id(number)', () => {
        expect(filePathToRoute('users/[id=number].pdx')).toBe('/users/:id(number)');
    });

    it('[slug=string].pdx → :slug(string)', () => {
        expect(filePathToRoute('posts/[slug=string].pdx')).toBe('/posts/:slug(string)');
    });
});
