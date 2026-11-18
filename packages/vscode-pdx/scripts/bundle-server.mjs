// bundle-server.mjs — builds the language server the extension loads, `server/server.cjs`. `npm run
// package` runs it, and so does `packages/lsp/tests/bundled-server.test.ts`, which then starts the very
// file the .vsix would ship.
//
// Its own build, not a copy of `@pdxui/lsp`'s `dist/server.cjs`: that one requires TypeScript from where
// it is installed (#1214), and a .vsix is packaged with no node_modules (`vsce package
// --no-dependencies`), so this one bundles TypeScript. The options and the externals are lsp's own
// (`esbuild-options.mjs`), so the two servers differ in that one thing.

import { build } from 'esbuild';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ext = join(dirname(fileURLToPath(import.meta.url)), '..');
const lsp = join(ext, '..', 'lsp');
const { bundleOptions, extensionServerExternal } = await import(pathToFileURL(join(lsp, 'esbuild-options.mjs')).href);

mkdirSync(join(ext, 'server'), { recursive: true });
await build({
    ...bundleOptions,
    entryPoints: [join(lsp, 'src', 'server.ts')],
    outfile: join(ext, 'server', 'server.cjs'),
    external: extensionServerExternal,
    logLevel: 'warning',
});
console.log('server/server.cjs: bundled');
