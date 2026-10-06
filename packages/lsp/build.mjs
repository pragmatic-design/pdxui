import { build } from 'esbuild';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

await build({
    entryPoints: ['src/server.ts'],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    outfile: 'dist/server.cjs',
    external: ['vscode'],
    alias: {
        '@pdxui/compiler': resolve(__dirname, '../compiler/src/index.ts'),
    },
    sourcemap: true,
    logLevel: 'info',
});

// `@pdxui/lsp/typecheck`, the type-check `pdx check --types` runs. TypeScript stays
// external: the check runs on the project's own TypeScript, as vue-tsc and svelte-check do.
// CommonJS, as the server is: vscode-languageserver is CommonJS and requires node builtins at load,
// which an ESM bundle cannot do ("Dynamic require of node:util is not supported" — measured).
await build({
    entryPoints: ['src/typecheck.ts'],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    outfile: 'dist/typecheck.cjs',
    external: ['typescript'],
    alias: {
        '@pdxui/compiler': resolve(__dirname, '../compiler/src/index.ts'),
    },
    sourcemap: true,
    logLevel: 'info',
});
