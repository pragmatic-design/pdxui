/**
 * Builds the scenario apps the scenario suite measures: the `globalSetup` of
 * `playwright.scenarios.config.ts`, and the table `scenario-budgets.spec.ts` reads.
 *
 * A scenario is a small app built by its own Vite config, with nothing of the showcase in it:
 *
 *   - `hello`, under `scenarios/hello/`: one component, one signal, one button;
 *   - `memory`, under `scenarios/memory/`: a page with an @fetch, a @for of 200 rows, an attach: and
 *     a child component per row, mounted and destroyed by `scenario-memory.spec.ts` (#243);
 *   - `lifecycle`, under `scenarios/lifecycle/`: a kept-alive route page and a kept `<component :is>`
 *     view, frozen and resumed by `scenario-lifecycle.spec.ts` (#269);
 *   - `crud`, under `scenarios/crud/`: one routed page with a named @loader, a @form of three fields,
 *     an @action that saves and invalidates the loader, and a @for of 100 rows (#245);
 *   - `dashboard`, under `scenarios/dashboard/`: four @defer panels (one prefetched), a virtual list of
 *     10,000 rows and one theme of @pdxui/design (#245);
 *   - `benchmark`, the js-framework-benchmark app, built from `scripts/bench-jfb/` with its own
 *     `vite.config.js`, so what is weighed here is the app `pnpm bench:jfb` measures. Its output goes
 *     under this package, not into `scripts/`;
 *   - `pilot-ts` and `pilot-pdx`, under `scenarios/pilot-mount/`: one page that mounts the `.pdx`
 *     pilot's components, built with the library's TypeScript components and with the pilot's `.pdx`
 *     rewrites in their place (`vite.pilot.config.ts`), timed against each other by
 *     `scenario-pilot-mount.spec.ts` (#685);
 *   - `component-mount`, under `scenarios/component-mount/`: every component of @pdxui/ui on one page,
 *     mounted 100 at a time and removed by `scenario-component-retention.spec.ts`, which holds each one
 *     to keeping no instance after its removal (#865, #881).
 *
 * Every build lands in `scenarios/dist/<name>/` (ignored by git), emptied first: a stale build would
 * be weighed as if it were today's.
 */
import { build } from 'vite';
import { rmSync, writeFileSync } from 'node:fs';
import { mainWorktree } from './pilot-main';
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
    { name: 'lifecycle', root: join(packageDir, 'scenarios', 'lifecycle'), config: 'vite.config.ts' },
    { name: 'crud', root: join(packageDir, 'scenarios', 'crud'), config: 'vite.config.ts' },
    { name: 'dashboard', root: join(packageDir, 'scenarios', 'dashboard'), config: 'vite.config.ts' },
    { name: 'benchmark', root: join(repoDir, 'scripts', 'bench-jfb'), config: 'vite.config.js' },
    { name: 'pilot-ts', root: join(packageDir, 'scenarios', 'pilot-mount'), config: 'vite.config.ts' },
    { name: 'pilot-pdx', root: join(packageDir, 'scenarios', 'pilot-mount'), config: 'vite.pilot.config.ts' },
    { name: 'component-mount', root: join(packageDir, 'scenarios', 'component-mount'), config: 'vite.config.ts' },
];

/**
 * `ssg`, under `scenarios/ssg/`: a generated app (#160), built by `pdx build --ssg` itself rather than
 * by Vite alone, and opened by `scenario-ssg.spec.ts`. Not in SCENARIOS: that table is the one the
 * budgets are held against, and what this app is held to is that its pages are taken over.
 */
export const SSG_ROOT = join(packageDir, 'scenarios', 'ssg');

/**
 * `pilot-pdx-main`: the `.pdx` pilot as `origin/main` builds it, from a worktree of it (`pilot-main.ts`),
 * which `scenario-pilot-mount.spec.ts` measures beside this tree's (#938). Not in SCENARIOS, which the
 * budgets weigh; the commit it was built from is written beside it.
 */
export const PILOT_MAIN = 'pilot-pdx-main';

export default async function buildScenarios(): Promise<void> {
    for (const { name, root, config } of SCENARIOS) {
        await build({
            root,
            configFile: join(root, config),
            logLevel: 'warn',
            build: { outDir: scenarioDist(name), emptyOutDir: true },
        });
    }
    const main = mainWorktree();
    const pilotRoot = join(main.root, 'packages', 'showcase', 'scenarios', 'pilot-mount');
    await build({
        root: pilotRoot,
        configFile: join(pilotRoot, 'vite.pilot.config.ts'),
        logLevel: 'warn',
        build: { outDir: scenarioDist(PILOT_MAIN), emptyOutDir: true },
    });
    writeFileSync(join(scenarioDist(PILOT_MAIN), 'commit.txt'), main.commit);
    // The CLI's own build, from its sources: the showcase does not depend on the CLI's package.
    const { buildSsg } = await import('../../cli/src/commands/build-ssg');
    const { resolveConfig } = await import('../../cli/src/config/loader');
    // Outside the app's root, so Vite does not empty it: a page left from an earlier build would be
    // opened as if this one had written it.
    rmSync(scenarioDist('ssg'), { recursive: true, force: true });
    await buildSsg(SSG_ROOT, resolveConfig({}, SSG_ROOT), scenarioDist('ssg'), false);
}
