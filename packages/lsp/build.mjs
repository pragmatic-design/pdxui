import { build } from 'esbuild';
import { bundleOptions } from './esbuild-options.mjs';

await build({
    ...bundleOptions,
    entryPoints: ['src/server.ts'],
    outfile: 'dist/server.cjs',
    external: ['vscode'],
    sourcemap: true,
    logLevel: 'info',
});

// `@pdxui/lsp/typecheck`, the type-check `pdx check --types` runs. TypeScript stays
// external: the check runs on the project's own TypeScript, as vue-tsc and svelte-check do.
// CommonJS, as the server is: vscode-languageserver is CommonJS and requires node builtins at load,
// which an ESM bundle cannot do ("Dynamic require of node:util is not supported" — measured).
await build({
    ...bundleOptions,
    entryPoints: ['src/typecheck.ts'],
    outfile: 'dist/typecheck.cjs',
    external: ['typescript'],
    sourcemap: true,
    logLevel: 'info',
});
