/**
 * The attachment endpoints, as a Vite plugin.
 *
 * `TransferHandle` exposes `progress`, `loaded`, `total` and `abort()`, and the only way to show
 * that those are real is to make them move. A mock that resolves immediately proves the opposite
 * of what the panel is for: the bar would jump 0 -> 100 and every screenshot would look identical
 * to one with no progress tracking at all.
 *
 * So this is a real HTTP endpoint, served in `dev` and in `preview` (the suite runs against the
 * production build, so `configurePreviewServer` is the one that matters), and it is SLOW ON
 * PURPOSE:
 *
 *   - the upload reads the request body in chunks with a pause between them. It is the reading
 *     that makes the browser's `upload.onprogress` fire more than once: a server that consumes the
 *     body as fast as the socket delivers it gets one event at 100% for anything that fits in a
 *     buffer;
 *   - the download writes the response body in chunks with a pause between them, and sends
 *     `Content-Length` so a percentage exists at all, plus `Content-Disposition` so there is a
 *     name to save under that is NOT the URL's last segment.
 *
 * State lives in the preview process and is reset per run. It is a mock, and it says so.
 */
import type { Plugin, ViteDevServer, PreviewServer } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';

/** What the server knows about a stored file. The bytes are kept so a download can return them. */
interface StoredAttachment {
    id: number;
    /** A ticket's file, or 0. */
    ticketId: number;
    /** An employee's document, or 0. One owner each, never both. */
    employeeId: number;
    name: string;
    size: number;
    bytes: Buffer;
    /** A document's own label and expiry, edited after the upload; empty until then. */
    label: string;
    expires: string;
    /** Withdrawn, not deleted: out of the list and still on record, so it can come back. */
    withdrawn: boolean;
}

/** What a list returns: the metadata, without the bytes. */
const summary = ({ id, ticketId, employeeId, name, size, label, expires }: StoredAttachment) =>
    ({ id, ticketId, employeeId, name, size, label, expires });

/** The owner a request names: `?ticket=7` or `?employee=3`. */
function ownerOf(url: URL): { ticketId: number; employeeId: number } {
    return {
        ticketId: Number(url.searchParams.get('ticket') ?? '0'),
        employeeId: Number(url.searchParams.get('employee') ?? '0'),
    };
}

/** Read a small JSON body — a PATCH's, not a file. `null` when it is not a JSON object: a 400. */
async function readJson(req: IncomingMessage): Promise<Record<string, unknown> | null> {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    let parsed: unknown;
    try {
        parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch (err) {
        if (err instanceof SyntaxError) return null;
        throw err;
    }
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : null;
}

/** How slowly the body moves. Enough for several progress events, short enough for a test. */
const CHUNK_BYTES = 64 * 1024;
const CHUNK_PAUSE_MS = 25;

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

function json(res: ServerResponse, status: number, body: unknown): void {
    const payload = JSON.stringify(body);
    res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) });
    res.end(payload);
}

/**
 * Read the whole request body, pausing between chunks.
 *
 * The pause is what creates back-pressure: the socket buffer fills, the browser cannot hand the
 * rest of the file to the kernel at once, and `xhr.upload.onprogress` reports partial numbers
 * instead of a single completion. Without it the panel's progress bar is decorative.
 */
async function readSlowly(req: IncomingMessage): Promise<Buffer> {
    const chunks: Buffer[] = [];
    let sinceLastPause = 0;
    for await (const chunk of req) {
        const buf = chunk as Buffer;
        chunks.push(buf);
        sinceLastPause += buf.length;
        if (sinceLastPause >= CHUNK_BYTES) {
            sinceLastPause = 0;
            await sleep(CHUNK_PAUSE_MS);
        }
    }
    return Buffer.concat(chunks);
}

/** Write the body in chunks, pausing between them, so the client's download progress moves. */
async function writeSlowly(res: ServerResponse, body: Buffer): Promise<void> {
    for (let offset = 0; offset < body.length; offset += CHUNK_BYTES) {
        if (res.destroyed) return;
        res.write(body.subarray(offset, offset + CHUNK_BYTES));
        await sleep(CHUNK_PAUSE_MS);
    }
    res.end();
}

function createHandler() {
    let nextId = 1;
    const stored: StoredAttachment[] = [];

    return async function handle(req: IncomingMessage, res: ServerResponse, next: () => void): Promise<void> {
        const url = new URL(req.url ?? '/', 'http://localhost');
        const path = url.pathname;
        if (!path.startsWith('/api/attachments')) return next();

        // POST /api/attachments?ticket=7&name=notes.pdf (or ?employee=3) — the body is the file.
        if (req.method === 'POST' && path === '/api/attachments') {
            const name = url.searchParams.get('name') ?? 'upload.bin';
            const { ticketId, employeeId } = ownerOf(url);
            let bytes: Buffer;
            try {
                bytes = await readSlowly(req);
            } catch {
                // The client aborted mid-flight. Nothing is stored — which is the assertion the
                // cancel test makes, and the reason the write happens after the read completes.
                res.destroy();
                return;
            }
            const item: StoredAttachment = {
                id: nextId++, ticketId, employeeId, name, size: bytes.length, bytes,
                label: '', expires: '', withdrawn: false,
            };
            stored.push(item);
            json(res, 201, summary(item));
            return;
        }

        // GET /api/attachments?ticket=7 (or ?employee=3) — the list, without the bytes and
        // without what was withdrawn.
        if (req.method === 'GET' && path === '/api/attachments') {
            const { ticketId, employeeId } = ownerOf(url);
            json(res, 200, stored
                .filter((a) => !a.withdrawn && a.ticketId === ticketId && a.employeeId === employeeId)
                .map(summary));
            return;
        }

        // GET /api/attachments/:id/content — the bytes, named by the SERVER.
        const content = /^\/api\/attachments\/(\d+)\/content$/.exec(path);
        if (req.method === 'GET' && content) {
            const item = stored.find((a) => a.id === Number(content[1]));
            if (!item) return json(res, 404, { error: 'no such attachment' });
            res.writeHead(200, {
                'Content-Type': 'application/octet-stream',
                'Content-Length': String(item.size),
                // The name the client must save under. Deliberately NOT the last segment of the
                // URL, which is `content` — that is the whole point of reading the header.
                'Content-Disposition': `attachment; filename="${item.name}"`,
            });
            await writeSlowly(res, item.bytes);
            return;
        }

        const one = /^\/api\/attachments\/(\d+)$/.exec(path);

        // PATCH /api/attachments/:id { label?, expires?, withdrawn? } — a document's own fields,
        // and its withdrawal and return.
        if (req.method === 'PATCH' && one) {
            const item = stored.find((a) => a.id === Number(one[1]));
            if (!item) return json(res, 404, { error: 'no such attachment' });
            const body = await readJson(req);
            if (!body) return json(res, 400, { error: 'the body is not a JSON object' });
            if (typeof body.label === 'string') item.label = body.label;
            if (typeof body.expires === 'string') item.expires = body.expires;
            if (typeof body.withdrawn === 'boolean') item.withdrawn = body.withdrawn;
            json(res, 200, summary(item));
            return;
        }

        if (req.method === 'DELETE' && one) {
            const i = stored.findIndex((a) => a.id === Number(one[1]));
            if (i >= 0) stored.splice(i, 1);
            json(res, 200, { ok: true });
            return;
        }

        json(res, 405, { error: `${req.method} ${path} is not an endpoint of this mock` });
    };
}

/** Serve `/api/attachments` in both `vite dev` and `vite preview`. */
export function mockAttachments(): Plugin {
    const handle = createHandler();
    return {
        name: 'showcase-mock-attachments',
        configureServer(server: ViteDevServer) {
            server.middlewares.use((req, res, next) => { void handle(req, res, next); });
        },
        configurePreviewServer(server: PreviewServer) {
            server.middlewares.use((req, res, next) => { void handle(req, res, next); });
        },
    };
}
