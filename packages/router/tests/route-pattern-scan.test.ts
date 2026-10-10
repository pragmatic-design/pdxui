// A route pattern is compiled in time linear in its length, and its literal text is matched literally.
//
// pathToRegex compiled a pattern with three regex passes (#67, code scanning alerts #30 and #66):
// the `:name(constraint)` pass ran in polynomial time on a pattern of repeated `:0((`, and the
// escape pass escaped the slashes only — a `.` stayed a wildcard. Route patterns are the
// developer's, so the first is a build that stalls rather than an attack; the second is a wrong
// match (the dot row of parity.test.ts).

import { describe, it, expect, afterEach } from 'vitest';
import { createRouter, destroyRouter, navigate, currentRoute, currentParams } from '../src/runtime';

afterEach(() => destroyRouter());

/** A page a route renders: what it is does not matter here. */
const page = () => document.createElement('div');

const settle = () => new Promise((r) => setTimeout(r, 0));

describe('compiling a route pattern', () => {
    it('compiles the input CodeQL names, its literal parentheses escaped', () => {
        // 200 repetitions: the router also MATCHES the current URL against it at once, and a regex of
        // thousands of groups overflows V8's stack there. Before the scan, the unescaped `(` of the
        // pattern made it no regex at all — a SyntaxError — whatever the length. The scan reads each
        // character once; no clock is read here, where six packages run at once.
        const pathological = '/:0(' + ':0(('.repeat(200);
        expect(() => createRouter([{ path: pathological, component: page }])).not.toThrow();
    });

    it('keeps each param in the order it appears, a wildcard included', async () => {
        // The wildcard was named in a first pass and the params in a second: `/:id/*` listed
        // `$rest` before `id`, and each value went to the other name.
        createRouter([{ path: '/docs/:section/*', component: page }]);
        navigate('/docs/guide/a/b');
        await settle();
        expect(currentRoute()?.path).toBe('/docs/:section/*');
        expect(currentParams()).toEqual({ section: 'guide', $rest: 'a/b' });
    });

    it('takes a `*` inside a constraint as part of the constraint', async () => {
        createRouter([{ path: '/tags/:slug([a-z]*)', component: page }]);
        navigate('/tags/abc');
        await settle();
        expect(currentParams()).toEqual({ slug: 'abc' });
    });
});
