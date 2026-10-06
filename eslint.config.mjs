// Flat ESLint config for the PDX UI monorepo.
// Scope of the quality gate: @pdxui/core + @pdxui/compiler source.
// Pragmatic ruleset — a mature codebase adopting lint late: correctness rules are
// errors, stylistic/late-adoption noise is 'warn' so the gate fails only on real
// problems. Ratchet rules up to 'error' over time.

import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
    {
        ignores: [
            '**/dist/**',
            '**/node_modules/**',
            '**/*.d.ts',
            '**/demo/**',
            'benchmarks/**',
            '.internals/**',
            '.claude/**',
            'templates/**',
            'packages/*/tests/**/generated/**',
        ],
    },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    {
        files: ['**/*.ts'],
        languageOptions: {
            globals: { ...globals.browser, ...globals.node },
        },
        rules: {
            // no-explicit-any: 'error' across core + compiler. Every remaining `any`
            // is either typed away or carries an inline eslint-disable with a reason.
            '@typescript-eslint/no-explicit-any': 'error',
            // Allow intentionally-unused via leading underscore.
            '@typescript-eslint/no-unused-vars': [
                'error',
                { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
            ],
            'no-empty': ['warn', { allowEmptyCatch: true }],
            // Triple-slash etc. are used in client.d.ts-style files; keep as warn.
            '@typescript-eslint/no-empty-object-type': 'warn',

            // Control chars are intentional: the template/placeholder system uses
            // \x00 / zero-width sentinels (see parser/template.ts).
            'no-control-regex': 'off',
            // no-useless-assignment stays 'warn': prone to false positives on patterns
            // that are legitimate (a loop condition `m=regex.exec`, conditional inits). Low value.
            'no-useless-assignment': 'warn',
        },
    },
    {
        // Tests: looser — fixtures and probes legitimately use any / non-null.
        files: ['**/tests/**/*.ts'],
        rules: {
            '@typescript-eslint/no-explicit-any': 'off',
            '@typescript-eslint/no-non-null-assertion': 'off',
        },
    },
);
