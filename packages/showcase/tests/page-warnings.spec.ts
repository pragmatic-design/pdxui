/**
 * Every page of the reference application compiles without a warning.
 *
 * The site's guard — `packages/site/tests/demo-warnings.spec.ts`, *"every gallery page compiles
 * with no warning"* — for the showcase, which is the application the docs point at and the bundle
 * budgets are measured on. Without it a warning is printed on every build and no suite goes red
 * for it:
 *
 *     [pdx] src/pages/intake.pdx: <pdx-input> type="date" is not a declared value for "type".
 *
 * A warning nobody's suite reads is a warning that teaches the next author it is normal.
 *
 * Node-side, no browser: it compiles the sources as the build does — `compile()` with the UI
 * manifest's props and enum values.
 */
import { test, expect } from './fixture';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { basename, join } from 'node:path';
import { compile } from '../../compiler/src/plugin';
import { ComponentResolver } from '../../compiler/src/component-resolver';

/**
 * Every `.pdx` under src/, at any depth: the pages, the shell, and the pieces pages are split into.
 * A listing of `pages/` and `src/` alone misses the pieces in `shell/` and `employee/`, and they
 * compile with warnings no suite reads.
 */
const SRC = fileURLToPath(new URL('../src/', import.meta.url));
const pdxFiles = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? pdxFiles(join(dir, e.name)) : e.name.endsWith('.pdx') ? [join(dir, e.name)] : []);

/**
 * The warnings this application means to carry, each with the reason. Empty is the goal; an entry
 * is a decision, and the assertion below fails if one of them stops being produced — a written-down
 * exception that has gone stale is how a hole reopens quietly.
 */
const EXPECTED: Record<string, string> = {
    'dashboard.pdx — PDX_UNUSED_REACTIVE: Reactive variable \'neverReadByAnything\' is declared but not used in the template.':
        'deliberate: the production compiler claims a signal nothing reads is removed, and '
        + 'compiler-claims.spec.ts measures it on this declaration. The compiler suggests `_name` to '
        + 'suppress the warning, and here that is a trap — measured, a prefixed signal is not emitted '
        + 'at all, so the bundler would have nothing to eliminate and the claim would be proven by '
        + 'an absence that was never there.',
};

test('every page of the showcase compiles with no warning', () => {
    const resolver = new ComponentResolver();
    expect(resolver.registerUiManifest(), 'no UI manifest: the enum check would check nothing').toBe(true);

    const problems: string[] = [];
    let pages = 0;
    for (const path of existsSync(SRC) ? pdxFiles(SRC) : []) {
        pages++;
        const file = basename(path);
        const source = readFileSync(path, 'utf8');
        // The enum check is compile()'s, given the manifest's values as the plugin gives them.
        const { warnings } = compile(source, file, [], undefined, {
            propsOf: (t) => resolver.propsOf(t),
            enumValues: (t, p) => resolver.enumValues(t, p),
        });
        for (const w of warnings) {
            problems.push(`${file} — ${w.code}: ${w.message}`);
        }
    }
    // Without this a renamed directory would make the assertion below pass by compiling nothing —
    // which is the shape of the hole this test exists to close.
    expect(pages, 'no showcase pages found: has src/pages moved?').toBeGreaterThanOrEqual(9);
    expect(pdxFiles(SRC).some((p) => /[\\/]shell[\\/]/.test(p)), 'the walk does not reach src/shell/').toBe(true);

    const unexpected = problems.filter((p) => !(p in EXPECTED));
    expect(unexpected, 'these pages warn, and nothing says they should').toEqual([]);

    // The other direction: an entry that has stopped being produced is an entry to delete.
    const stale = Object.keys(EXPECTED).filter((p) => !problems.includes(p));
    expect(stale, 'these are written down as expected and no longer happen').toEqual([]);
});
