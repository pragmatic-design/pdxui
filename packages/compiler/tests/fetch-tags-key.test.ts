// An @fetch is emitted tagged with its own cache key (#282).
//
// `invalidate(['GET:/api/users'])` matches TAGS; the compiler gives every @fetch the tag of its key so
// that form reaches it. The behaviour — the entry's tags, the invalidation, a reactive URL — is
// measured on the running component in core/tests/fetch-tagged-by-key.test.ts; this holds the shape.

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';

const fetchLine = (decl: string): string => {
    const { code } = compile(`<template><p></p></template>\n<script setup>\n${decl}\n</script>\n`, 'f.pdx');
    return code.split('\n').filter((l) => l.includes('resource(') || l.includes('_opts =')).join('\n');
};

describe('@fetch tags', () => {
    it('with no options, the tags are the key', () => {
        const line = fetchLine("@fetch users: 'GET /api/users' as User[];");
        expect(line).toContain('key: "GET:/api/users"');
        expect(line).toContain('tags: (k) => [k]');
    });

    it('an author\'s tags are evaluated once and spread after the key', () => {
        const line = fetchLine("@fetch users: 'GET /api/users' as User[] { tags: ['users'], staleTime: 60000 };");
        expect(line).toMatch(/const __users_opts = \{ tags: \['users'\], staleTime: 60000 \};/);
        expect(line).toContain('...__users_opts, tags: (k) => [k, ...(Array.isArray(__users_opts.tags) ? __users_opts.tags : [])]');
    });

    it('a custom key option still wins over the generated one', () => {
        const line = fetchLine("@fetch users: 'GET /api/users' as User[] { key: 'people' };");
        // Spread after `key:`, so the author's key is the one the resource resolves — and the tag.
        const generated = line.indexOf('key: "GET:/api/users"');
        expect(generated, 'no generated key').toBeGreaterThan(-1);
        expect(generated).toBeLessThan(line.indexOf('...__users_opts'));
    });
});
