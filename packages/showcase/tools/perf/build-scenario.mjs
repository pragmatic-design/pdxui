// A production build of a scenario into a directory:
//
//   node tools/perf/build-scenario.mjs <scenario> <out> [--no-minify] [--config <vite config>]
//
// <scenario> is a name of the scenario suite's table (tests/scenarios-build.ts); its root and its Vite
// config are the suite's, and --config replaces the config with another file in the same root. <out> is
// emptied first. An unminified build keeps the functions' names, which is what a profile is read by.
import { build } from 'vite';
import { join, resolve } from 'node:path';
import { SCENARIOS, packageDir } from './lib.mjs';

const args = process.argv.slice(2);
const flag = (name) => {
    const i = args.indexOf(name);
    return i < 0 ? undefined : args.splice(i, 2)[1];
};
const minify = !args.includes('--no-minify');
if (!minify) args.splice(args.indexOf('--no-minify'), 1);
const configOverride = flag('--config');
const [name, out] = args;

const scenario = SCENARIOS.find((s) => s.name === name);
if (!scenario || !out) {
    console.error('usage: build-scenario.mjs <scenario> <out> [--no-minify] [--config <vite config>]');
    console.error(`scenarios: ${SCENARIOS.map((s) => s.name).join(', ')}`);
    process.exit(2);
}

const outDir = resolve(out);
// A scenario's config resolves its packages from the showcase, as the suite runs it.
process.chdir(packageDir);
await build({
    root: scenario.root,
    configFile: join(scenario.root, configOverride ?? scenario.config),
    logLevel: 'warn',
    build: { outDir, emptyOutDir: true, ...(minify ? {} : { minify: false }) },
});
console.log(`${name} → ${out}${minify ? '' : ' (unminified)'}`);
