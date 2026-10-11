// The matcher is built once and then does no parsing per navigation — and, for every pattern made
// of whole segments, runs no regex either (#108). Measured by counting the regex calls a match
// makes, not inferred from the code.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { compileMatcher } from '../src/matcher';

const ROUTES = [
    { path: '/' },
    { path: '/about' },
    { path: '/users/:id' },
    { path: '/users/:id/posts/:postId' },
    { path: '/files/*' },
    { path: '/orders/:oid(number)' },
    { path: '/docs/:name.:ext' },
    { path: '/tickets/:id', hasOutlet: true },
    { path: '/tickets/:id/notes/:n' },
    { path: '/owners' },
    { path: '/owners/new' },
];

afterEach(() => vi.restoreAllMocks());

/**
 * Every regex run made while `fn` runs. `exec` alone: `RegExp.prototype.test` calls `exec` itself,
 * so spying on both would count one run twice.
 */
function regexCalls(fn: () => void): number {
    const exec = vi.spyOn(RegExp.prototype, 'exec');
    fn();
    const n = exec.mock.calls.length;
    exec.mockRestore();
    return n;
}

describe('compileMatcher', () => {
    const m = compileMatcher(ROUTES);

    it('matches whole-segment patterns without running a regex', () => {
        // Without the one route that is not made of whole segments: a path that reaches it — a 404
        // does — runs its regex, which is the price of declaring it.
        const whole = compileMatcher(ROUTES.filter(r => r.path !== '/docs/:name.:ext' && !r.path.includes('(')));
        const paths = ['/', '/about', '/about/', '/users/7', '/users/7/posts/9', '/files/a/b', '/nope', '/users'];
        const results: (string | null)[] = [];
        expect(regexCalls(() => { for (const p of paths) results.push(whole.match(p)?.route.path ?? null); }),
            'a navigation ran a regex for a pattern made of whole segments').toBe(0);
        // The control: the matches are the right ones, so zero calls is not zero work.
        expect(results).toEqual(['/', '/about', '/about', '/users/:id', '/users/:id/posts/:postId',
            '/files/*', null, null]);
    });

    it('runs the constraint, and only the constraint, for a constrained param', () => {
        let hit: string | null = null;
        expect(regexCalls(() => { hit = m.match('/orders/42')?.route.path ?? null; })).toBe(1);
        expect(hit).toBe('/orders/:oid(number)');
        expect(m.match('/orders/abc'), 'the constraint was not applied').toBeNull();
    });

    it('keeps a regex for a pattern that is not made of whole segments', () => {
        expect(m.match('/docs/guide.pdf')).toEqual({ route: ROUTES[6], params: { name: 'guide', ext: 'pdf' } });
    });

    it('decodes a rest once, after the join', () => {
        expect(m.match('/files/a%2Fb/c')?.params).toEqual({ $rest: 'a/b/c' });
    });

    it('keeps a malformed escape as written instead of throwing', () => {
        expect(m.match('/users/%E0%A4%A')?.params).toEqual({ id: '%E0%A4%A' });
    });

    it('does not let an empty segment be a param', () => {
        expect(m.match('/users//posts/9')).toBeNull();
    });

    it('a trailing wildcard takes one segment or many, never none', () => {
        const w = compileMatcher([{ path: '/files/*' }, { path: '/a/b/*' }, { path: '/files/list' }]);
        expect(w.match('/files/a/b.txt')?.params).toEqual({ $rest: 'a/b.txt' });
        expect(w.match('/files/readme.md')?.params).toEqual({ $rest: 'readme.md' });
        expect(w.match('/files'), 'the wildcard swallowed its own prefix').toBeNull();
        expect(w.match('/filesystem/a'), 'a path that only starts with the same letters').toBeNull();
        expect(w.match('/a/b/c/d')?.params).toEqual({ $rest: 'c/d' });
        expect(w.match('/a/x/c'), 'the middle segment of the prefix was not checked').toBeNull();
        // A static route under the same prefix still wins.
        expect(w.match('/files/list')?.route.path).toBe('/files/list');
    });

    it('a wildcard at the root takes everything but the root', () => {
        const w = compileMatcher([{ path: '/*' }]);
        expect(w.match('/anything/at/all')?.params).toEqual({ $rest: 'anything/at/all' });
        expect(w.match('/'), 'the root wildcard matched an empty tail').toBeNull();
    });

    it('builds each chain once', () => {
        const note = ROUTES[8];
        expect(m.chain(note).map(r => r.path)).toEqual(['/tickets/:id', '/tickets/:id/notes/:n']);
        expect(m.chain(note), 'the chain is recomputed per call').toBe(m.chain(note));
        // A shared prefix without an outlet is not a parent: `/owners` and `/owners/new` are siblings.
        expect(m.chain(ROUTES[10]).map(r => r.path)).toEqual(['/owners/new']);
        // But it is an ancestor for the breadcrumb.
        expect(m.ancestors(ROUTES[10]).map(r => r.path)).toEqual(['/owners']);
    });
});
