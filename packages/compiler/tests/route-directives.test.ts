// Tests for route directives: @page, @guard, @loader, @search, @prefetch, @layout.

import { describe, it, expect } from 'vitest';
import { analyzeScript } from '../src/compiler/script-analyzer';

describe('route directives', () => {
    it('detects @page with path', () => {
        const a = analyzeScript(`
            @page '/users';
            let title = $signal('Users');
        `, 'users.pdx');
        expect(a.route.page).toBe('/users');
    });

    it('detects @page with params', () => {
        const a = analyzeScript(`
            @page '/users/:id';
            let user = $signal(null);
        `, 'user-detail.pdx');
        expect(a.route.page).toBe('/users/:id');
    });

    it('detects @guard', () => {
        const a = analyzeScript(`
            @page '/admin';
            @guard 'admin.dashboard';
            let data = $signal([]);
        `, 'admin.pdx');
        expect(a.route.guard).toBe('admin.dashboard');
    });

    it('detects @loader', () => {
        const a = analyzeScript(`
            @page '/products';
            @loader fetchProducts;
            let products = $signal([]);
        `, 'products.pdx');
        expect(a.route.loader).toBe('fetchProducts');
    });

    it('detects @search', () => {
        const a = analyzeScript(`
            @page '/products';
            @search { page: number = 1, sort: string = 'name' };
            let items = $signal([]);
        `, 'products.pdx');
        expect(a.route.search).toContain('page: number');
        expect(a.route.search).toContain('sort: string');
    });

    it('detects @prefetch', () => {
        const a = analyzeScript(`
            @page '/home';
            @prefetch 'hover';
            let msg = $signal('');
        `, 'home.pdx');
        expect(a.route.prefetch).toBe('hover');
    });

    it('detects @layout', () => {
        const a = analyzeScript(`
            @page '/settings';
            @layout 'dashboard';
            let prefs = $signal({});
        `, 'settings.pdx');
        expect(a.route.layout).toBe('dashboard');
    });

    it('detects all route directives together', () => {
        const a = analyzeScript(`
            @page '/admin/users/:id';
            @guard 'admin.users.edit';
            @loader fetchUser;
            @search { tab: string = 'profile' };
            @prefetch 'eager';
            @layout 'admin';
            let user = $signal(null);
        `, 'admin-user.pdx');

        expect(a.route.page).toBe('/admin/users/:id');
        expect(a.route.guard).toBe('admin.users.edit');
        expect(a.route.loader).toBe('fetchUser');
        expect(a.route.search).toContain('tab: string');
        expect(a.route.prefetch).toBe('eager');
        expect(a.route.layout).toBe('admin');
    });

    it('returns empty route when no @page', () => {
        const a = analyzeScript(`
            @prop label: string = 'Hello';
            let count = $signal(0);
        `, 'counter.pdx');
        expect(a.route.page).toBeUndefined();
    });

    it('route directives do not end up in body', () => {
        const a = analyzeScript(`
            @page '/test';
            @guard 'test';
            let x = $signal(0);
        `, 'test.pdx');
        expect(a.body).not.toContain('@page');
        expect(a.body).not.toContain('@guard');
    });
});
