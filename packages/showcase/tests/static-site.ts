/**
 * A static server over a generated site (#160): a path is served by the page written for it —
 * `/about` by `about/index.html`, as a host serves a static build. A path with no page of its own gets
 * the root's, the SPA fallback a host is configured with.
 */
import { createServer, type Server } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import type { AddressInfo } from 'node:net';

const TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

/** The file a request is answered with. */
function fileFor(dir: string, url: string): string | null {
    const path = normalize(decodeURIComponent(url.split('?')[0]));
    const file = join(dir, path);
    if (!file.startsWith(dir)) return null;
    if (existsSync(file) && statSync(file).isFile()) return file;
    const page = join(file, 'index.html');
    if (existsSync(page)) return page;
    // An asset that is not there is a 404, not a page.
    return extname(path) ? null : join(dir, 'index.html');
}

export function serveSite(dir: string): Promise<{ url: string; server: Server }> {
    const server = createServer((req, res) => {
        const file = fileFor(dir, req.url ?? '/');
        if (!file) { res.writeHead(404).end(); return; }
        res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' }).end(readFileSync(file));
    });
    return new Promise((done) => server.listen(0, '127.0.0.1', () => {
        done({ url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, server });
    }));
}
