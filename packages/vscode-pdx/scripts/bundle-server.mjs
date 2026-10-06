// bundle-server.mjs — builds the language server and puts it where the extension loads it from,
// `server/server.cjs`. `npm run package` runs it, and so does
// `packages/lsp/tests/bundled-server.test.ts`, which then starts the very file the .vsix would ship.

import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ext = join(dirname(fileURLToPath(import.meta.url)), '..');
const lsp = join(ext, '..', 'lsp');

execFileSync(process.execPath, ['build.mjs'], { cwd: lsp, stdio: 'inherit' });
const built = join(lsp, 'dist', 'server.cjs');
if (!existsSync(built)) throw new Error(`the language server build produced no ${built}`);
mkdirSync(join(ext, 'server'), { recursive: true });
copyFileSync(built, join(ext, 'server', 'server.cjs'));
console.log('server/server.cjs: bundled');
