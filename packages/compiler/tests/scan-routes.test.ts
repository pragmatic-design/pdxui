// The build-time scan and the dev-time analyzer read the same directive the same way.
//
// `@page '/docs', '/docs/:slug'` is one declaration with two paths, and the analyzer parses both:
// the first becomes the route, the rest become aliases, and the codegen registers one
// `__pdx_pushRoute` for each. `scanForRoutes` builds the table the GENERATED router compiles into its
// switch; a scan that matched a single quoted string and kept the first would make
// `/docs/quickstart` a page in dev and a 404 in production.
//
// The two readers of one directive must not disagree. This file pins the scan against the shapes the
// analyzer accepts.

import { describe, it, expect, afterEach } from 'vitest';
import { scanForRoutes, type ScannedRoute } from '../src/plugin-utils';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dirs: string[] = [];

/** Write one page and scan the directory it is in. */
function scan(name: string, source: string): ScannedRoute[] {
    const dir = mkdtempSync(join(tmpdir(), 'pdx-scan-'));
    dirs.push(dir);
    writeFileSync(join(dir, name), source, 'utf-8');
    const routes: ScannedRoute[] = [];
    scanForRoutes(dir, routes);
    return routes;
}

afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe('a @page that declares more than one path', () => {
    it('produces a route for every path', () => {
        const routes = scan('docs.pdx', "<script setup>\n@page '/docs', '/docs/:slug';\nlet n = $signal(0);\n</script>");

        expect(routes.map(r => r.path),
            'the second path was dropped, so it is a page in dev and a 404 in production',
        ).toEqual(['/docs', '/docs/:slug']);
    });

    it('gives each of them the same tag, guard and metadata', () => {
        // They are one component under two URLs; a second path that resolved to nothing renderable
        // would be a different way of getting the same blank page.
        const routes = scan('docs.pdx', [
            '<script setup>',
            "@page '/docs', '/docs/:slug';",
            "@guard 'docs.read';",
            'let n = $signal(0);',
            '</script>',
        ].join('\n'));

        expect(routes).toHaveLength(2);
        for (const r of routes) {
            expect(r.tag).toBe('pdx-docs');
            expect(r.guard).toBe('docs.read');
        }
    });

    it('still produces exactly one route for the ordinary single-path form', () => {
        // The control. Splitting on quotes would be easy to get wrong in the other direction.
        const routes = scan('about.pdx', "<script setup>\n@page '/about';\nlet n = $signal(0);\n</script>");

        expect(routes.map(r => r.path)).toEqual(['/about']);
    });

    it('reads the paths and the options block, not the option names as paths', () => {
        const routes = scan('user.pdx', "<script setup>\n@page '/u', '/users/:id' { keepAlive };\nlet n = $signal(0);\n</script>");

        expect(routes.map(r => r.path)).toEqual(['/u', '/users/:id']);
    });

    it('adds the paths an @alias declares', () => {
        // The analyzer treats `@alias` as another way of writing the extra paths of `@page`, and the
        // codegen registers it identically. A scanner that knew only one of the two forms would put
        // the dev/prod difference back under a different directive.
        const routes = scan('home.pdx', "<script setup>\n@page '/';\n@alias '/home';\nlet n = $signal(0);\n</script>");

        expect(routes.map(r => r.path)).toEqual(['/', '/home']);
    });

    it('does not read a @page out of a commented-out line', () => {
        // The control for the anchoring: the scan is line-anchored like the analyzer, so a
        // directive that is not at the start of its line is not a directive.
        const routes = scan('note.pdx', "<script setup>\n@page '/real';\n// see also @page '/fake', '/fake/:id'\nlet n = $signal(0);\n</script>");

        expect(routes.map(r => r.path)).toEqual(['/real']);
    });
});
