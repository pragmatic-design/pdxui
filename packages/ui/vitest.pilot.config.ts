// The pilot (#137): the library's unit tests, run unchanged against components written in .pdx.
//
// The substitution is pilot/plugin.ts, the same one the pilot's certification run uses. Run with
// `pnpm --dir packages/ui test:pilot`. Not part of `pnpm test`: the pilot measures, and its
// components are not exported until the follow-up the pilot opens decides (packages/ui/PILOT.md).
import { defineConfig } from 'vitest/config';
import { pilotPlugins } from './pilot/plugin';

/** The unit test files that mount a piloted component. */
const TESTS = [
    'tests/unit/choice-controls-model.test.ts',
    'tests/unit/choice-variants.test.ts',
    'tests/unit/form-controls-live-prop.test.ts',
    'tests/unit/form-field-names-control.test.ts',
    'tests/unit/form-value-live.test.ts',
    'tests/unit/json-editor-a11y.test.ts',
];

export default defineConfig({
    plugins: pilotPlugins(),
    test: {
        environment: 'happy-dom',
        include: TESTS,
        setupFiles: ['../core/tests/setup/gc-observer.ts', 'tests/setup/settle-prefetch.ts'],
        execArgv: ['--expose-gc'],
    },
});
