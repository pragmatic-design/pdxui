// A production build that imports a name its module does not export FAILS, as the dev server does.
//
// Rollup reports a missing export as a warning, and the build exits 0. In dev the browser refuses the
// same module outright ("does not provide an export named …"). So a broken import ships whenever
// its binding happens to be unused: `import type { DataSource }` merged into the runtime core import
// builds clean and breaks `/tickets` in dev only.
//
// Rollup already fails on a missing name that is READ; it only warns on one that is not, and that is
// the case built here. The build is the showcase's own config, with only the entry swapped. The
// entries are .js: a .ts entry would have its unused import erased by esbuild before Rollup saw it,
// and the test would pass with or without the rule.

import { test, expect } from '@playwright/test';
import { build } from 'vite';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
const packageDir = join(here, '..');
const fixtures = join(here, 'fixtures', 'missing-export');

/** Build one fixture entry with the showcase's vite.config.ts; the error, or null when it built. */
async function buildEntry(file: string): Promise<Error | null> {
    const outDir = mkdtempSync(join(tmpdir(), 'pdx-missing-export-'));
    try {
        await build({
            configFile: join(packageDir, 'vite.config.ts'),
            root: packageDir,
            logLevel: 'silent',
            build: { outDir, emptyOutDir: true, write: false, rollupOptions: { input: join(fixtures, file) } },
        });
        return null;
    } catch (error) {
        return error as Error;
    } finally {
        rmSync(outDir, { recursive: true, force: true });
    }
}

test('the control: an entry importing a name that exists builds', async () => {
    expect(await buildEntry('present.js')).toBeNull();
});

test('an entry importing a name nobody exports fails the build, and the error names it', async () => {
    const error = await buildEntry('missing.js');
    expect(error, 'the build succeeded: a missing export is still only a warning').not.toBeNull();
    expect(error!.message).toContain('NotThere');
});
