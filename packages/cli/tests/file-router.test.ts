// Tests for file-based routing scanner.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { filePathToRoute, discoverRoutes } from '../src/routing/file-router';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('filePathToRoute()', () => {
    it('index.pdx → /', () => {
        expect(filePathToRoute('index.pdx')).toBe('/');
    });

    it('about.pdx → /about', () => {
        expect(filePathToRoute('about.pdx')).toBe('/about');
    });

    it('users/index.pdx → /users', () => {
        expect(filePathToRoute('users/index.pdx')).toBe('/users');
    });

    it('users/[id].pdx → /users/:id', () => {
        expect(filePathToRoute('users/[id].pdx')).toBe('/users/:id');
    });

    it('[...catch].pdx → /*', () => {
        expect(filePathToRoute('[...catch].pdx')).toBe('/*');
    });

    it('(admin)/dashboard.pdx → /dashboard (group stripped)', () => {
        expect(filePathToRoute('(admin)/dashboard.pdx')).toBe('/dashboard');
    });

    it('(admin)/settings/index.pdx → /settings', () => {
        expect(filePathToRoute('(admin)/settings/index.pdx')).toBe('/settings');
    });

    it('nested dynamic: products/[category]/[id].pdx → /products/:category/:id', () => {
        expect(filePathToRoute('products/[category]/[id].pdx')).toBe('/products/:category/:id');
    });

    it('deep group: (marketing)/campaigns/[id].pdx → /campaigns/:id', () => {
        expect(filePathToRoute('(marketing)/campaigns/[id].pdx')).toBe('/campaigns/:id');
    });
});

describe('discoverRoutes()', () => {
    const tmpBase = join(tmpdir(), 'pdx-router-test-' + Date.now());

    function createFile(relPath: string, content = '<template></template>'): void {
        const full = join(tmpBase, relPath);
        mkdirSync(join(full, '..'), { recursive: true });
        writeFileSync(full, content);
    }

    // Setup test directory structure
    beforeAll(() => {
        createFile('index.pdx');
        createFile('about.pdx');
        createFile('_layout.pdx');
        createFile('_error.pdx');
        createFile('users/index.pdx');
        createFile('users/[id].pdx');
        createFile('users/_layout.pdx');
        createFile('(admin)/dashboard.pdx');
        createFile('(admin)/settings.pdx');
        createFile('[...catch].pdx');
    });

    afterAll(() => {
        rmSync(tmpBase, { recursive: true, force: true });
    });

    it('discovers all route files', () => {
        const routes = discoverRoutes(tmpBase);
        expect(routes.length).toBe(7); // index, about, users/index, users/[id], dashboard, settings, catch-all
    });

    it('excludes _layout.pdx and _error.pdx from routes', () => {
        const routes = discoverRoutes(tmpBase);
        const files = routes.map(r => r.file);
        expect(files).not.toContain('_layout.pdx');
        expect(files).not.toContain('_error.pdx');
    });

    it('resolves correct paths', () => {
        const routes = discoverRoutes(tmpBase);
        const paths = routes.map(r => r.path);
        expect(paths).toContain('/');
        expect(paths).toContain('/about');
        expect(paths).toContain('/users');
        expect(paths).toContain('/users/:id');
        expect(paths).toContain('/dashboard');
        expect(paths).toContain('/settings');
        expect(paths).toContain('/*');
    });

    it('assigns nearest layout', () => {
        const routes = discoverRoutes(tmpBase);
        const usersIndex = routes.find(r => r.path === '/users');
        expect(usersIndex?.layout).toBe('users/_layout.pdx');

        const about = routes.find(r => r.path === '/about');
        expect(about?.layout).toBe('_layout.pdx');
    });

    it('assigns nearest error page', () => {
        const routes = discoverRoutes(tmpBase);
        const about = routes.find(r => r.path === '/about');
        expect(about?.error).toBe('_error.pdx');
    });

    it('catch-all sorted last', () => {
        const routes = discoverRoutes(tmpBase);
        expect(routes[routes.length - 1].isCatchAll).toBe(true);
    });

    it('static routes before dynamic', () => {
        const routes = discoverRoutes(tmpBase);
        const usersIdx = routes.findIndex(r => r.path === '/users');
        const userIdIdx = routes.findIndex(r => r.path === '/users/:id');
        expect(usersIdx).toBeLessThan(userIdIdx);
    });

    it('returns empty array for non-existent directory', () => {
        expect(discoverRoutes('/nonexistent/path')).toEqual([]);
    });
});
