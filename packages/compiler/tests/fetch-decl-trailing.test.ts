// A `@fetch` type with nothing after it loses its trailing `;` and the space around it. CodeQL #182
// had the regex that did it rewritten (it ran in quadratic time on a long run of spaces, measured in
// tests/perf/fetch-decl-redos.test.ts); this holds what the rewrite must keep.
import { describe, it, expect } from 'vitest';
import { parseFetchDecl } from '../src/compiler/script-analyzer-helpers';

describe('a @fetch type with nothing after it', () => {
    it('loses its trailing `;` and spaces, and keeps the spaces inside it', () => {
        expect(parseFetchDecl(`@fetch users: 'GET /api/users' as User[] ;  `)?.type).toBe('User[]');
        expect(parseFetchDecl(`@fetch users: 'GET /api/users' as A\t\tB`)?.type).toBe('A\t\tB');
        // A `;` the scan does not end the type on (inside an unclosed `<`) is taken off the end.
        expect(parseFetchDecl(`@fetch users: 'GET /api/users' as A<B; \t`)?.type).toBe('A<B');
    });
});
