// A .pdx of a @pdxui package gets its pdx- tag, whatever app compiles it (#1009).
//
// An app in the workspace imports `@pdxui/ui/switch` through the `development` condition, which is the
// component's .pdx source (#1004), and its own pdx() compiles that file. With the app's prefix, `app`
// by default, `pdx-switch.pdx` registered <app-switch>: <pdx-switch> was never defined, and nothing
// said so. `pdx-` is the @pdxui packages' prefix (#136), so a file of one of them keeps it.

import { describe, it, expect, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pdx } from '../src/plugin';

const SFC = '<template><p>x</p></template>\n<script>\n@prop label: string = \'\';\n</script>\n';
const registered = (code: string) => /component\('([\w-]+)'/.exec(code)?.[1];

let root: string | null = null;
afterEach(() => { if (root) rmSync(root, { recursive: true, force: true }); root = null; });

/**
 * A fresh app root with a package.json in each directory given (relative): its name, or its name and
 * whether it is private.
 */
function project(packages: Record<string, string | { name: string; private: boolean }>): string {
    root = mkdtempSync(join(tmpdir(), 'pdx-libprefix-'));
    for (const [dir, pkg] of Object.entries(packages)) {
        mkdirSync(join(root, dir, 'src'), { recursive: true });
        writeFileSync(join(root, dir, 'package.json'), JSON.stringify(typeof pkg === 'string' ? { name: pkg } : pkg));
    }
    return root;
}

/** The tag the app's plugin registers for the file at `rel`, the app's Vite root at `appRoot`. */
function tagOf(rel: string, options: Parameters<typeof pdx>[0] = {}, appRoot = '.'): string | undefined {
    const [plugin] = pdx(options);
    (plugin.config as (c: object, e: { command: string }) => void)({}, { command: 'serve' });
    (plugin.configResolved as (c: { root: string; server: { fs: { allow: string[] } } }) => void)(
        { root: join(root!, appRoot), server: { fs: { allow: [] } } });
    const transform = plugin.transform as (this: { error(m: string): never }, code: string, id: string) => { code: string };
    const id = join(root!, rel).replace(/\\/g, '/');
    return registered(transform.call({ error(m: string): never { throw new Error(m); } }, SFC, id).code);
}

describe('the tag of a .pdx, by the package it belongs to', () => {
    it('a file of a @pdxui package keeps its pdx- name under the app\'s default prefix', () => {
        project({ '.': 'my-app', 'node_modules/@pdxui/fixture-lib': '@pdxui/fixture-lib' });
        expect(tagOf('node_modules/@pdxui/fixture-lib/src/pdx-probe.pdx')).toBe('pdx-probe');
    });

    it('and under an app prefix of its own', () => {
        project({ '.': 'my-app', 'node_modules/@pdxui/fixture-lib': '@pdxui/fixture-lib' });
        expect(tagOf('node_modules/@pdxui/fixture-lib/src/pdx-probe.pdx', { prefix: 'acme' })).toBe('pdx-probe');
    });

    it('the control: the app\'s own pdx- file still takes the app\'s prefix (#136)', () => {
        project({ '.': 'my-app' });
        expect(tagOf('src/pdx-local.pdx')).toBe('app-local');
    });

    // The showcase, the site, the builder and the certification harness are named @pdxui/* and are
    // apps, never published: their own components take the app's prefix.
    it('a private @pdxui package is an app: its pdx- file takes the app\'s prefix', () => {
        project({ '.': { name: '@pdxui/showcase', private: true } });
        expect(tagOf('src/pdx-local.pdx')).toBe('app-local');
    });

    // The compiler's demo apps and a CLI test's project have no package.json of their own: the nearest
    // is the published package around them, and they are still the app.
    it('an app with no package.json inside a published @pdxui package is the app', () => {
        project({ 'lib': '@pdxui/lib' });
        expect(tagOf('lib/demo/src/pdx-local.pdx', {}, 'lib/demo')).toBe('app-local');
    });

    // A harness inside the library (its scenario server, its vitest) compiles the library's files as
    // its own, and names the library's prefix itself, as ui/library-config.ts does.
    it('an app inside the package compiles the package\'s files as its own', () => {
        project({ 'lib': '@pdxui/lib' });
        expect(tagOf('lib/src/pdx-probe.pdx', {}, 'lib/demo')).toBe('app-probe');
        expect(tagOf('lib/src/pdx-probe.pdx', { prefix: 'pdx' }, 'lib/demo')).toBe('pdx-probe');
    });

    it('the control: a package that is not @pdxui does not own pdx-', () => {
        project({ '.': 'my-app', 'node_modules/acme-lib': 'acme-lib' });
        expect(tagOf('node_modules/acme-lib/src/pdx-thing.pdx')).toBe('app-thing');
    });
});
