// The pilot (#137): the library's unit tests, run unchanged against components written in .pdx.
//
// The WHOLE unit suite, not the files that name a piloted component: a component is also mounted by
// the ones that compose it (a pagination's page-size select, a form template's lookup), and those
// tests hold it too. The substitution is pilot/plugin.ts, the same one the pilot's certification run
// uses. Run with `pnpm --dir packages/ui test:pilot`. Not part of `pnpm test`: the pilot measures,
// and its components are not exported until the follow-up the pilot opens decides
// (packages/ui/PILOT.md).
import { defineConfig } from 'vitest/config';
import { unitTestWorkers } from '../../build/unit-test-workers';
import { pilotPlugins } from './pilot/plugin';

export default defineConfig({
    plugins: pilotPlugins(),
    test: {
        environment: 'happy-dom',
        include: ['tests/unit/**/*.test.ts'],
        maxWorkers: unitTestWorkers(),
        setupFiles: ['../core/tests/setup/gc-observer.ts', 'tests/setup/settle-prefetch.ts'],
        execArgv: ['--expose-gc'],
    },
});
