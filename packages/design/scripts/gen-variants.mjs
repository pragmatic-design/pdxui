// The stylesheets that hold `@variant` rules, generated from their sources (#512): each
// variant-sources/<path>.css becomes src/<path>.css with its rules compiled (./variant-build.mjs).
// Run after `pnpm --dir packages/ui run manifest`: the rules are checked against the axes it lists,
// and a rule naming what it does not declare stops the generator before it writes anything.
// packages/cli/tests/design-variants.test.ts fails when a generated stylesheet and its source drift.
//
// Run: node packages/design/scripts/gen-variants.mjs   (Node ≥ 22.18 reads the compiler's TypeScript)

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { DESIGN, VARIANT_SOURCES, generatedStylesheet, manifestAxes, reportVariants, variantSources } from './variant-build.mjs';

function main() {
    const axes = manifestAxes();
    if (!reportVariants(axes)) {
        console.error('[gen-variants] PDX_VARIANT_UNKNOWN: nothing written.');
        process.exit(1);
    }
    const sources = variantSources();
    for (const rel of sources) {
        const out = join(DESIGN, 'src', rel);
        mkdirSync(dirname(out), { recursive: true });
        writeFileSync(out, generatedStylesheet(readFileSync(join(VARIANT_SOURCES, rel), 'utf8'), rel, axes));
    }
    console.log(`[gen-variants] ${sources.length} stylesheets → src/`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
