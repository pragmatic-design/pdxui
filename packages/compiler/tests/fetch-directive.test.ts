// Tests for @fetch directive — parsing and codegen.

import { describe, it, expect } from 'vitest';
import { analyzeScript } from '../src/compiler/script-analyzer';

describe('@fetch parsing', () => {
    it('detects simple @fetch with type', () => {
        const a = analyzeScript(`
            @fetch users: 'GET /api/users' as User[];
        `, 'users.pdx');

        expect(a.fetches).toHaveLength(1);
        expect(a.fetches[0].name).toBe('users');
        expect(a.fetches[0].method).toBe('GET');
        expect(a.fetches[0].url).toBe('/api/users');
        expect(a.fetches[0].type).toBe('User[]');
        expect(a.fetches[0].hasReactiveParams).toBe(false);
    });

    it('detects @fetch with reactive params', () => {
        const a = analyzeScript(`
            @page '/users/:id';
            @fetch user: 'GET /api/users/\${params.id}' as User;
        `, 'user-detail.pdx');

        expect(a.fetches).toHaveLength(1);
        expect(a.fetches[0].url).toBe('/api/users/${params.id}');
        expect(a.fetches[0].hasReactiveParams).toBe(true);
        expect(a.fetches[0].type).toBe('User');
    });

    it('detects @fetch without type annotation', () => {
        const a = analyzeScript(`
            @fetch data: 'GET /api/data';
        `, 'data.pdx');

        expect(a.fetches).toHaveLength(1);
        expect(a.fetches[0].name).toBe('data');
        expect(a.fetches[0].method).toBe('GET');
        expect(a.fetches[0].type).toBeUndefined();
    });

    it('detects @fetch with inline options', () => {
        const a = analyzeScript(`
            @fetch users: 'GET /api/users' as User[] { staleTime: 60000, tags: ["users"] };
        `, 'users.pdx');

        expect(a.fetches).toHaveLength(1);
        expect(a.fetches[0].options).toBe('{ staleTime: 60000, tags: ["users"] }');
    });

    it('detects multiple @fetch declarations', () => {
        const a = analyzeScript(`
            @fetch users: 'GET /api/users' as User[];
            @fetch roles: 'GET /api/roles' as Role[];
        `, 'admin.pdx');

        expect(a.fetches).toHaveLength(2);
        expect(a.fetches[0].name).toBe('users');
        expect(a.fetches[1].name).toBe('roles');
    });

    it('@fetch activates new mode', () => {
        const a = analyzeScript(`
            @fetch users: 'GET /api/users' as User[];
        `, 'users.pdx');

        expect(a.mode).toBe('new');
    });

    it('@fetch names are auto-exported', () => {
        const a = analyzeScript(`
            @fetch users: 'GET /api/users' as User[];
        `, 'users.pdx');

        expect(a.exports).toContainEqual({ name: 'users', kind: 'const' });
    });

    it('private @fetch names (prefixed with _) are NOT exported', () => {
        const a = analyzeScript(`
            @fetch _internal: 'GET /api/internal' as Data;
        `, 'test.pdx');

        expect(a.exports.find(e => e.name === '_internal')).toBeUndefined();
    });

    it('@fetch does not end up in body', () => {
        const a = analyzeScript(`
            @fetch users: 'GET /api/users' as User[];
            let count = $signal(0);
        `, 'test.pdx');

        expect(a.body).not.toContain('@fetch');
    });

    it('adds resource to usedFeatures', () => {
        const a = analyzeScript(`
            @fetch users: 'GET /api/users' as User[];
        `, 'test.pdx');

        expect(a.usedFeatures.has('resource')).toBe(true);
    });

    it('handles POST method', () => {
        const a = analyzeScript(`
            @fetch result: 'POST /api/search' as SearchResult[];
        `, 'search.pdx');

        expect(a.fetches[0].method).toBe('POST');
    });

    it('handles double-quoted URL', () => {
        const a = analyzeScript(`
            @fetch users: "GET /api/users" as User[];
        `, 'users.pdx');

        expect(a.fetches[0].url).toBe('/api/users');
    });

    it('coexists with @page, @guard, and signals', () => {
        const a = analyzeScript(`
            @page '/admin/users';
            @guard 'admin.users.view';
            @fetch users: 'GET /api/users' as User[];
            let selected = $signal(null);
        `, 'admin-users.pdx');

        expect(a.route.page).toBe('/admin/users');
        expect(a.route.guard).toBe('admin.users.view');
        expect(a.fetches).toHaveLength(1);
        expect(a.signals).toHaveLength(1);
    });
});
