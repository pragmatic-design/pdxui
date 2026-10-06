// A redirect target is not a link href, and the two need different rules.
//
// `sanitizeUrl` guarded `navigate()` and none of the three paths that also reach the address bar:
// the redirect table, a route's `config.redirect`, and `guardFailRedirect`. All three sources are
// developer-authored, so this is missing defence in depth rather than an open redirect — and the
// issue says so before it says anything else.
//
// But reusing `sanitizeUrl` alone would not be enough, and that is the interesting part.
// `sanitizeUrl` exists for `<a href>`, where `https://stripe.com` is a perfectly good target: its
// scheme allow-list contains http and https. A ROUTER target is different — `history.replaceState`
// cannot leave the origin at all — so an absolute URL there is never meaningful, and letting it
// through produces a SecurityError from deep inside the browser instead of a message naming the
// configuration mistake.

import { describe, it, expect, beforeEach } from 'vitest';
import { createRouter, destroyRouter, navigate, currentPath, currentRoute } from '../src/runtime';

const settle = () => new Promise(r => setTimeout(r, 20));

beforeEach(() => {
    destroyRouter();
    history.replaceState(null, '', '/');
});

const HOSTILE = [
    ['protocol-relative', '//evil.example'],
    ['absolute https', 'https://evil.example/steal'],
    ['javascript scheme', 'javascript:alert(1)'],
    ['backslash-smuggled', '/\\evil.example'],
] as const;

describe('redirect targets stay inside the origin', () => {
    for (const [label, target] of HOSTILE) {
        it(`refuses a redirect table entry pointing at ${label}`, async () => {
            createRouter(
                [
                    { path: '/', component: () => document.createElement('div') },
                    { path: '/go', component: () => document.createElement('div') },
                ],
                { redirects: [{ from: '/go', to: target }] },
            );
            navigate('/');
            await settle();

            navigate('/go');
            await settle();

            expect(currentPath(), `redirected to ${target}`).not.toContain('evil.example');
            expect(currentPath()).not.toContain('javascript:');
        });

        it(`refuses a route redirect pointing at ${label}`, async () => {
            createRouter([
                { path: '/', component: () => document.createElement('div') },
                { path: '/go', component: () => document.createElement('div'), redirect: target },
            ]);
            navigate('/');
            await settle();

            navigate('/go');
            await settle();

            expect(currentPath(), `redirected to ${target}`).not.toContain('evil.example');
            expect(currentPath()).not.toContain('javascript:');
        });
    }

    it('an ordinary internal redirect still works — the fix must not reject everything', async () => {
        createRouter(
            [
                { path: '/', component: () => document.createElement('div') },
                { path: '/old', component: () => document.createElement('div') },
                { path: '/new', component: () => document.createElement('div') },
            ],
            { redirects: [{ from: '/old', to: '/new' }] },
        );
        navigate('/old');
        await settle();
        expect(currentRoute()?.config.path).toBe('/new');
    });
});
