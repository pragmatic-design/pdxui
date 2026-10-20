/**
 * `GET /api/tickets/:id`, as a Vite plugin: the record the ticket page loads before it renders.
 *
 * The page reads its ticket through `@loader` (#507), so a navigation to it has a data request
 * beside its chunk — the request `first-paint-waves.spec.ts` counts as part of the same wave. It
 * answers the seeded record, the one `ticketById` holds before the browser has written to its store;
 * a ticket created or edited in the browser lives in the browser's store, and this mock does not see
 * it. 404 for an id the seed has no row for.
 *
 * Served in `dev` and in `preview`, because the suite runs against the production build.
 */
import type { Plugin, ViteDevServer, PreviewServer } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { ticketSeed } from './src/data/seed';

// Match: `/api/tickets/42`. Groups: [1]=the id
const TICKET = /^\/api\/tickets\/(\d+)$/;

function handle(req: IncomingMessage, res: ServerResponse, next: () => void): void {
    const path = new URL(req.url ?? '/', 'http://localhost').pathname;
    const m = TICKET.exec(path);
    if (!m || req.method !== 'GET') return next();
    const record = ticketSeed().find((t) => t.id === Number(m[1]));
    const payload = JSON.stringify(record ?? { error: `No ticket ${m[1]}.` });
    res.writeHead(record ? 200 : 404, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) });
    res.end(payload);
}

/** Serve `GET /api/tickets/:id` in both `vite dev` and `vite preview`. */
export function mockTickets(): Plugin {
    return {
        name: 'showcase-mock-tickets',
        configureServer(server: ViteDevServer) { server.middlewares.use(handle); },
        configurePreviewServer(server: PreviewServer) { server.middlewares.use(handle); },
    };
}
