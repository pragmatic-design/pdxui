// The shipped themes, generated from their sources (#155).
//
// Every component rule of a theme must stop at a nested root of another theme, and it does through a
// guard on its subject: `[pdx-theme="x"] sel:not(:where([pdx-theme="x"] [pdx-theme]:not([pdx-theme="x"]), …))`.
// Written by hand on each of 333 rules, forgetting it was caught only after the fact by
// tests/nested-themes.spec.ts. A theme's source, `theme-sources/<name>.css`, writes its overrides
// inside `@pdx-theme <name> { … }` without the root and the guard; this writes `src/themes/<name>.css`
// with both, through the engine's `expandThemeBlocks` — the same guard a generated theme gets.
// An `@variant pdx-<name> …` rule in a source is compiled first (#512, ./variant-build.mjs), so every
// selector it yields takes the root and the guard like any other; the rules are checked against
// `packages/ui/custom-elements.json`, and one naming what it does not declare stops the generator.
//
// The output is COMMITTED: in this repository `src/themes/*.css` reach the browser as written (the
// package's `development` export, Vite), so a block left unexpanded would break the theme. A test
// (packages/cli/tests/theme-sources.test.ts) fails when a theme file and its source drift apart.
//
// Run: node packages/design/scripts/gen-themes.mjs   (Node ≥ 22.18 reads the engine's TypeScript)

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { expandThemeBlocks } from '../src/engine/nested-theme-guard.ts';
import { expandVariants, manifestAxes, reportVariants } from './variant-build.mjs';

const here = dirname(fileURLToPath(import.meta.url));
export const SOURCES = join(here, '..', 'theme-sources');
export const THEMES = join(here, '..', 'src', 'themes');

/** The theme file a source generates: a line that says so, then the source with its rules compiled and its blocks expanded. */
export function generatedTheme(source, name, axes = manifestAxes()) {
    return `/* GENERATED from packages/design/theme-sources/${name}.css by packages/design/scripts/gen-themes.mjs — edit the source, then run it. */\n`
        + expandThemeBlocks(expandVariants(source, undefined, axes));
}

function main() {
    const axes = manifestAxes();
    if (!reportVariants(axes)) {
        console.error('[gen-themes] PDX_VARIANT_UNKNOWN: nothing written.');
        process.exit(1);
    }
    const files = readdirSync(SOURCES).filter((f) => f.endsWith('.css'));
    for (const file of files) {
        const name = file.replace(/\.css$/, '');
        writeFileSync(join(THEMES, file), generatedTheme(readFileSync(join(SOURCES, file), 'utf8'), name, axes));
    }
    console.log(`[gen-themes] ${files.length} themes → src/themes/`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
