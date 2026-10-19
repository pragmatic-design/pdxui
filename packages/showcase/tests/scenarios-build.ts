/**
 * Builds the scenario apps the scenario suite measures: the `globalSetup` of
 * `playwright.scenarios.config.ts`, and the table `scenario-budgets.spec.ts` reads.
 *
 * A scenario is a small app built by its own Vite config, with nothing of the showcase in it:
 *
 *   - `hello`, under `scenarios/hello/`: one component, one signal, one button;
 *   - `memory`, under `scenarios/memory/`: a page with an @fetch, a @for of 200 rows, an attach: and
 *     a child component per row, mounted and destroyed by `scenario-memory.spec.ts` (#243);
 *   - `benchmark`, the js-framework-benchmark app, built from `scripts/bench-jfb/` with its own
 *     `vite.config.js`, so what is weighed here is the app `pnpm bench:jfb` measures. Its output goes
 *     under this package, not into `scripts/`.
 *
 * Every build lands in `scenarios/dist/<name>/` (ignored by git), emptied first: a stale build would
 * be weighed as if it were today's.
 */
import { build } from 'vite';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoDir = resolve(packageDir, '..', '..');

/** Where a scenario's build is written. */
export function scenarioDist(name: string): string {
    return join(packageDir, 'scenarios', 'dist', name);
}

export const SCENARIOS: { name: string; root: string; config: string }[] = [
    { name: 'hello', root: join(packageDir, 'scenarios', 'hello'), config: 'vite.config.ts' },
    { name: 'memory', root: join(packageDir, 'scenarios', 'memory'), config: 'vite.config.ts' },
    { name: 'benchmark', root: join(repoDir, 'scripts', 'bench-jfb'), config: 'vite.config.js' },
];

export default async function buildScenarios(): Promise<void> {
    for (const { name, root, config } of SCENARIOS) {
        await build({
            root,
            configFile: join(root, config),
            logLevel: 'warn',
            build: { outDir: scenarioDist(name), emptyOutDir: true },
        });
    }
}
