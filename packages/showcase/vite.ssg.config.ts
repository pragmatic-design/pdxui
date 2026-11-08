import { existsSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import { showcaseConfig } from './vite.config';

/**
 * The generated pages served as a static host serves them: `/tickets` by `tickets/index.html`, the
 * file `pdx build --ssg` writes. Vite's preview looks for `tickets.html`, or for `tickets/index.html`
 * only behind a trailing slash, and would answer every route with the root's page.
 */
function servePages(): Plugin {
    return {
        name: 'showcase-ssg-pages',
        configurePreviewServer(server) {
            const dir = resolve(server.config.root, server.config.build.outDir);
            server.middlewares.use((req, _res, next) => {
                const url = req.url ?? '/';
                const path = url.split('?')[0];
                if (!extname(path) && !path.endsWith('/') && existsSync(join(dir, path, 'index.html'))) {
                    req.url = `${path}/${url.slice(path.length)}`;
                }
                next();
            });
        },
    };
}

/**
 * The showcase built to take over the pages `pdx build --ssg` writes (#160): the same config with
 * `hydrate`, into `dist-ssg`. `tests/ssg-site.ts` generates and serves it.
 */
const config = showcaseConfig({ hydrate: true });
export default defineConfig({ ...config, plugins: [...(config.plugins ?? []), servePages()] });
