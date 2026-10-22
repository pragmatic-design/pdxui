// The design suite's static server: `node static-server.mjs <root> <port>`.
//
// It was `npx http-server`, which nothing in the repository depends on, so every CI run downloaded it
// and one run timed out before a test started (#615). This is what the suite used of it: files under
// a root, a content type by extension, no caching (`-c-1`), no logging (`-s`).
//
// A file that disappears between the request and the read answers 404 and the server goes on: the
// builder's e2e suite rewrites themes under `src/themes/custom/` while this suite runs, and http-server
// died on that ENOENT (`packages/builder/tests/custom-themes-dir.ts`).
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';

const [rootArg = '.', portArg = '3333'] = process.argv.slice(2);
const ROOT = resolve(rootArg);
const PORT = Number(portArg);

const TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.map': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.woff2': 'font/woff2',
};

createServer(async (req, res) => {
    const path = normalize(decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname));
    let file = join(ROOT, path);
    if (file !== ROOT && !file.startsWith(ROOT + sep)) { res.writeHead(403).end(); return; }
    if (path.endsWith('/') || path.endsWith(sep)) file = join(file, 'index.html');
    try {
        const body = await readFile(file);
        res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
        res.end(req.method === 'HEAD' ? undefined : body);
    } catch (e) {
        // Missing, a directory, or gone mid-request: not found, as http-server answered. Anything else
        // is the server's own failure, and says so where the webServer output is read.
        const missing = e.code === 'ENOENT' || e.code === 'EISDIR' || e.code === 'ENOTDIR';
        if (!missing) process.stderr.write(`design static server: ${req.url}: ${e}\n`);
        res.writeHead(missing ? 404 : 500).end();
    }
}).listen(PORT, () => process.stdout.write(`design static server on http://localhost:${PORT} serving ${ROOT}\n`));
