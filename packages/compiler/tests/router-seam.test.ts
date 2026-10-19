// The seam: how a production build hands the router its route table.
//
// There is one router, `@pdxui/router`'s, and a build adds DATA — the route table compiled from the
// project's `@page` declarations (#108). The table goes in through ONE file,
// `packages/router/src/active.ts`, which every other file of the package imports the router from:
// in a production build the plugin's `load` hook answers for it with its own source and the table
// installed in front of it. Dev hands the same table over from `index.html`, because an installed
// router may be pre-bundled there and a pre-bundled file never reaches `load`.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pdx } from '../src/plugin';
import { isRouterSeam } from '../src/plugin-utils';
import { generateRouteTable } from '../src/route-table';

type Loaded = string | { code: string; moduleSideEffects?: boolean } | undefined | null;
type Hooks = {
    config: (c: object, e: { command: string }) => void;
    load: (id: string) => Loaded;
};

/** The plugin with its mode decided, and the two hooks this file drives. */
function pluginIn(command: 'build' | 'serve'): Hooks {
    const plugin = pdx({ autoAlias: false })[0] as unknown as Hooks;
    plugin.config({}, { command });
    return plugin;
}

const codeOf = (out: Loaded): string => (typeof out === 'object' && out ? out.code : out ?? '');

// The real seam, so `load` reads the file the package ships.
const SEAM = join(__dirname, '..', '..', 'router', 'src', 'active.ts').replace(/\\/g, '/');
const SEAM_SOURCE = readFileSync(SEAM, 'utf-8');

describe('the seam', () => {
    it('answers for the router package seam in a production build: the table, then the file', () => {
        const out = pluginIn('build').load(SEAM);
        const code = codeOf(out);

        expect(code, 'the seam was left alone in a production build').toContain('from "virtual:pdx-routes"');
        expect(code).toMatch(/installRouteTable as \w+ \} from '\.\/runtime'/);
        // Its surface stays the file's own: the source follows, untouched.
        expect(code.endsWith(SEAM_SOURCE), 'the seam\'s own exports were replaced').toBe(true);
    });

    it('declares the effect it has, so the install survives tree-shaking', () => {
        // The package declares `active.ts` free of side effects. Without the flag Rollup follows the
        // re-exports straight to `./runtime` and drops the install: `router-seam-build.test.ts` is
        // the build that showed it.
        const out = pluginIn('build').load(SEAM);
        expect(typeof out === 'object' && out?.moduleSideEffects).toBe(true);
    });

    it('recognises the seam when the package is installed from node_modules too', () => {
        // The monorepo is not the only shape this ships in, and a seam that only works in the
        // monorepo is a seam that only works for us.
        expect(isRouterSeam('/w/node_modules/@pdxui/router/src/active.ts')).toBe(true);
        expect(isRouterSeam('/w/packages/router/src/active.ts')).toBe(true);
    });

    it('leaves the seam alone in dev', () => {
        // Dev gets the table from `index.html` (`virtual:pdx-routes-dev`), and keeps HMR on the
        // router file it actually runs.
        expect(pluginIn('serve').load(SEAM)).toBeUndefined();
    });

    it('does not answer for any other file in the package', () => {
        const build = pluginIn('build');

        expect(build.load('/w/packages/router/src/runtime.ts')).toBeUndefined();
        expect(build.load('/w/packages/router/src/outlet.ts')).toBeUndefined();
        expect(build.load('/w/packages/router/src/index.ts')).toBeUndefined();
        // A file merely NAMED active.ts elsewhere is not this package's seam.
        expect(isRouterSeam('/w/packages/site/src/active.ts')).toBe(false);
        expect(build.load('/w/packages/site/src/active.ts')).toBeUndefined();
    });

    it('serves the route table under its own id, in both modes', () => {
        for (const mode of ['build', 'serve'] as const) {
            expect(codeOf(pluginIn(mode).load('\0virtual:pdx-routes')), mode).toContain('export const routes = [');
        }
    });

    it('and the dev door hands that table to the router', () => {
        const code = codeOf(pluginIn('serve').load('\0virtual:pdx-routes-dev'));
        expect(code).toContain('from "virtual:pdx-routes"');
        expect(code).toContain('globalThis.__pdx_route_table = table');
    });
});

describe('the table a project with no @page gets', () => {
    // An app can legitimately have no `@page` yet, and the seam imports the table in every build: a
    // module that exported nothing would fail the build on the seam's import, in production only.
    it('exports the three names, empty', () => {
        const src = generateRouteTable([]).replace(/^export\s+/gm, '');
        const table = new Function(`${src}\nreturn { routes, pageModules, redirects };`)() as Record<string, unknown>;
        expect(table).toEqual({ routes: [], pageModules: {}, redirects: [] });
    });
});
