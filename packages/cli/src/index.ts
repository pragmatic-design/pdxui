#!/usr/bin/env node
// pdx — the PDX UI CLI.

import { defineCommand, runMain } from 'citty';
import { consola } from 'consola';
import { createRequire } from 'node:module';

// Read, never restated. A restated number drifts from the package's version, which makes every bug
// report unattributable: two reports months apart carry the same number.
//
// Resolved at runtime rather than inlined at build time, so the number cannot go stale between a
// version bump and a rebuild. `../package.json` holds from both entry points that exist:
// dist/index.mjs (what `bin` points at, and package.json always ships beside dist) and
// src/index.ts (what `unbuild --stub` runs in dev).
const pkg = createRequire(import.meta.url)('../package.json') as { version: string };

// `--version` answers on stdout, unprefixed, in every environment.
//
// Not through citty's meta, which prints via the default consola instance — and that instance
// takes its level and its reporter from the ambient environment. Through it, `pdx --version` prints
// NOTHING under TEST=true or NODE_ENV=test, and `[log] <version>` under CI=true.
// A version flag exists so a script can read it, and those are the environments where scripts run.
//
// Answered here rather than by fixing the reporter, because this output is not a diagnostic: it is
// a value a caller asked for, and it belongs on stdout with nothing around it. Only when it is the
// FIRST argument — `pdx build --version` is the build command's business, not this.
if (process.argv[2] === '--version') {
    process.stdout.write(`${pkg.version}\n`);
    process.exit(0);
}

// Chosen, not inherited. consola drops below `log` when the environment says test, which silently
// removed citty's usage output and every informational line the commands print — while errors,
// being level 0, still came through. Nobody sets TEST=true intending to mute an unrelated tool, and
// a build whose progress vanished in CI is a build nobody can diagnose.
//
// 3 is consola's own default for an interactive shell: info, log, success, warn, error. Not a
// widening — it is the level the CLI already had everywhere except under those two variables.
consola.level = 3;

const main = defineCommand({
    meta: {
        name: 'pdx',
        version: pkg.version,
        description: 'The PDX UI CLI — build, check, analyze, scaffold .pdx components',
    },
    subCommands: {
        dev: () => import('./commands/dev').then(m => m.default),
        builder: () => import('./commands/builder').then(m => m.default),
        build: () => import('./commands/build').then(m => m.default),
        new: () => import('./commands/new').then(m => m.default),
        check: () => import('./commands/check').then(m => m.default),
        explain: () => import('./commands/explain').then(m => m.default),
        analyze: () => import('./commands/analyze').then(m => m.default),
        mcp: () => import('./commands/mcp').then(m => m.default),
        theme: () => import('./commands/theme').then(m => m.default),
        extract: () => import('./commands/extract').then(m => m.default),
        i18n: () => import('./commands/i18n').then(m => m.default),
    },
});

runMain(main);
