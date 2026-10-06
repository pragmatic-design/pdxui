// pdx dev — start Vite dev server with pdx plugin auto-configured.

import { defineCommand } from 'citty';
import { loadConfigOrExit, resolveConfig } from '../config/loader';
import { detectEntry } from '../utils/paths';
import { logger } from '../utils/logger';

export default defineCommand({
    meta: { name: 'dev', description: 'Start dev server with HMR' },
    args: {
        port: { type: 'string', default: '5173', description: 'Server port' },
        host: { type: 'string', default: 'localhost', description: 'Server host' },
        open: { type: 'boolean', default: false, description: 'Open browser' },
    },
    async run({ args }) {
        const cwd = process.cwd();
        const config = await loadConfigOrExit(cwd);
        const resolved = resolveConfig(config, cwd);

        // Dynamic import — Vite only loaded for dev command
        let vite: typeof import('vite');
        try {
            vite = await import('vite');
        } catch {
            logger.error('Vite is required for `pdx dev`. Install with: pnpm add -D vite');
            process.exit(1);
        }

        const { pdx } = await import('@pdxui/compiler');

        const entry = detectEntry(cwd);
        const port = parseInt(args.port as string, 10);

        const server = await vite.createServer({
            root: cwd,
            plugins: [pdx({ plugins: resolved.plugins, components: [resolved.components] })],
            server: {
                port,
                host: args.host as string,
                open: args.open as boolean,
            },
        });

        await server.listen();
        const address = `http://${args.host}:${port}`;
        logger.success(`Dev server running at ${address}`);
        if (!entry) logger.warn('No index.html found — create one or use src/App.pdx');
    },
});
