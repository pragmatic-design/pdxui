// A real endpoint for the offline harness.
//
// The offline queue's five unit tests all run past a getter the test itself redefines
// (`offline.test.ts:7`: `Object.defineProperty(navigator, 'onLine', …)`), so no request in them
// ever fails. Measuring the queue for real needs two things a mock cannot give: a request that
// travels over TCP, so `context.setOffline(true)` can actually stop it, and a server that can be
// asked afterwards WHAT IT RECEIVED — because "the mutation was replayed" is a fact about the
// server, not about the page that sent it.
//
// So the scenario Vite server has an endpoint. The spec reads the log through Playwright's
// `request` fixture, which is a separate Node-side context and is therefore still online while the
// browser context is not.
//
// Every route is keyed by a RUN ID the page passes in its URL, because `certify` runs fullyParallel
// and one shared server would otherwise hand every worker every other worker's requests.

import type { Plugin } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';

export interface ReceivedRequest {
    /** Order of arrival within the run — this is what "replayed in order" is measured against. */
    seq: number;
    method: string;
    /** The path after the run id, e.g. `/tickets/3`. */
    path: string;
    /** Parsed JSON body, or the raw string when it is not JSON, or null for a bodyless request. */
    body: unknown;
}

const MAX_RUNS = 200;

function readBody(req: IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
        let raw = '';
        req.on('data', (chunk) => { raw += chunk; });
        req.on('end', () => resolve(raw));
        req.on('error', reject);
    });
}

function json(res: ServerResponse, status: number, payload: unknown): void {
    const text = JSON.stringify(payload);
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json');
    // The log must never be answered from a cache: the spec asks the same URL repeatedly and the
    // whole point is that the answer changes.
    res.setHeader('Cache-Control', 'no-store');
    res.end(text);
}

/**
 * Mounts `/__offline` on the scenarios dev server:
 *
 * - `<METHOD> /__offline/api/<run>/<path…>` — the application endpoint. Records the request and
 *   answers `{ ok: true, seq }`. Every method is accepted, including GET, because "a GET is not
 *   queued" is one of the things being measured and it has to be able to succeed when online.
 * - `GET /__offline/log/<run>` — everything that run has received, in arrival order.
 * - `DELETE /__offline/log/<run>` — forget it.
 *
 * The map is capped: a long `certify` run would otherwise keep every request of every scenario
 * alive for as long as the dev server.
 */
export function offlineEndpoint(): Plugin {
    const runs = new Map<string, ReceivedRequest[]>();

    function entriesFor(run: string): ReceivedRequest[] {
        let list = runs.get(run);
        if (!list) {
            // Map preserves insertion order, so the first key is the oldest run.
            while (runs.size >= MAX_RUNS) runs.delete(runs.keys().next().value as string);
            list = [];
            runs.set(run, list);
        }
        return list;
    }

    return {
        name: 'pdx-offline-endpoint',
        configureServer(server) {
            server.middlewares.use('/__offline', (req, res, next) => {
                const url = req.url ?? '/';
                const [pathname] = url.split('?');
                const method = (req.method ?? 'GET').toUpperCase();

                const log = /^\/log\/([^/]+)\/?$/.exec(pathname);
                if (log) {
                    const run = decodeURIComponent(log[1]);
                    if (method === 'DELETE') {
                        runs.delete(run);
                        json(res, 200, { ok: true });
                        return;
                    }
                    json(res, 200, { run, received: runs.get(run) ?? [] });
                    return;
                }

                const api = /^\/api\/([^/]+)(\/.*)?$/.exec(pathname);
                if (api) {
                    const run = decodeURIComponent(api[1]);
                    const path = api[2] ?? '/';
                    void readBody(req).then((raw) => {
                        let body: unknown = null;
                        if (raw) {
                            try { body = JSON.parse(raw); } catch { body = raw; }
                        }
                        const list = entriesFor(run);
                        const entry: ReceivedRequest = { seq: list.length + 1, method, path, body };
                        list.push(entry);
                        json(res, 200, { ok: true, seq: entry.seq });
                    });
                    return;
                }

                next();
            });
        },
    };
}
