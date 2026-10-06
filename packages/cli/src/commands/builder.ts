// pdx builder — start the PDX Builder (component tester + theme builder).
//
// The builder is a workspace app (packages/builder), not a published artifact: it serves
// the generated scenario pages from the repo, so it only runs inside a checkout. The
// command finds it by walking up from this file and says so plainly when it cannot.

import { defineCommand } from 'citty';
import { existsSync } from 'fs';
import { dirname, join, resolve } from 'pathe';
import { fileURLToPath } from 'node:url';
import { logger } from '../utils/logger';

/** Walk up looking for packages/builder/vite.config.ts. Returns its directory. */
function findBuilderDir(): string | null {
    let dir = dirname(fileURLToPath(import.meta.url));
    for (let i = 0; i < 8; i++) {
        const candidate = join(dir, 'packages', 'builder');
        if (existsSync(join(candidate, 'vite.config.ts'))) return candidate;
        const parent = dirname(dir);
        if (parent === dir) break;
        dir = parent;
    }
    return null;
}

export default defineCommand({
    meta: { name: 'builder', description: 'Start the PDX Builder (component tester + theme builder)' },
    args: {
        port: { type: 'string', default: '5230', description: 'Server port' },
        host: { type: 'string', default: 'localhost', description: 'Server host' },
        open: { type: 'boolean', default: false, description: 'Open browser' },
    },
    async run({ args }) {
        const builderDir = findBuilderDir();
        if (!builderDir) {
            logger.error('The builder app was not found (packages/builder).');
            logger.info('`pdx builder` runs from a checkout of the PDX UI repository — it serves the generated scenario pages from the repo.');
            process.exit(1);
        }

        let vite: typeof import('vite');
        try {
            vite = await import('vite');
        } catch {
            logger.error('Vite is required for `pdx builder`. Install with: pnpm add -D vite');
            process.exit(1);
        }

        const port = parseInt(args.port as string, 10);
        const server = await vite.createServer({
            configFile: resolve(builderDir, 'vite.config.ts'),
            server: { port, host: args.host as string, open: args.open as boolean },
        });

        await server.listen();
        // The Vite root is the repo root, so `/` is not the app — the config redirects it.
        logger.success(`PDX Builder running at http://${args.host}:${port}/`);
    },
});
