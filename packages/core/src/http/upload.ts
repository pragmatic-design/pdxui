// File upload/download with reactive progress signals.
// Upload uses XMLHttpRequest (only way to get upload progress events).
// Download uses fetch + ReadableStream (streaming progress).

import { signal } from '../reactivity/signal';
import type { ReadonlySignal } from '../utils/types';
import { resolveUrl } from './client';

// ─── Types ─────────────────────────────────────────────────────────

export type TransferStatus = 'idle' | 'uploading' | 'downloading' | 'done' | 'error';

export interface UploadOptions {
    /** HTTP method. Default: 'POST' */
    method?: 'POST' | 'PUT' | 'PATCH';
    /** Additional headers. */
    headers?: Record<string, string>;
    /** Field name for FormData wrapping. If set, wraps file in FormData. */
    fieldName?: string;
    /** Custom HttpClient for auth headers. */
    client?: { headers?: Record<string, string> };
    /** Base URL prepended to relative paths. Must not end with '/'. */
    baseUrl?: string;
    /** Upload timeout in ms (0 = no timeout). Default: 0. */
    timeout?: number;
}

export interface DownloadOptions {
    /** Additional headers (e.g., Authorization). */
    headers?: Record<string, string>;
    /**
     * The name to use when the server does not send one. Read only as a fallback: a
     * `Content-Disposition` on the response wins, because the server is the one that knows.
     */
    filename?: string;
}

export interface TransferHandle<T = unknown> {
    /** Progress percentage 0-100. */
    progress: ReadonlySignal<number>;
    /** Transfer status. */
    status: ReadonlySignal<TransferStatus>;
    /** Loaded bytes. */
    loaded: ReadonlySignal<number>;
    /** Total bytes (0 if unknown). */
    total: ReadonlySignal<number>;
    /** Abort the transfer. */
    abort(): void;
    /** Promise that resolves with the result. */
    result: Promise<T>;
}

export interface DownloadHandle extends TransferHandle<Blob> {
    /**
     * What the file is called: the response's `Content-Disposition`, else `options.filename`, else
     * null. Never the last segment of the URL — that is an id as often as it is a name, and a file
     * saved as `7` is worse than one the caller had to name itself.
     *
     * A signal, like the rest of the handle, because it is known only once the response arrives.
     */
    filename: ReadonlySignal<string | null>;
}

// ─── Upload ────────────────────────────────────────────────────────

/**
 * Upload a file with reactive progress tracking.
 * Uses XMLHttpRequest for upload.onprogress events (fetch doesn't support this).
 *
 * Usage:
 *   const handle = uploadFile('/api/upload', myFile, { fieldName: 'avatar' });
 *   effect(() => console.log(`${handle.progress()}%`));
 *   const response = await handle.result;
 */
export function uploadFile(url: string, file: File | Blob, options?: UploadOptions): TransferHandle {
    const _progress = signal(0);
    const _status = signal<TransferStatus>('uploading');
    const _loaded = signal(0);
    const _total = signal(file.size);

    const xhr = new XMLHttpRequest();

    const result = new Promise<unknown>((resolve, reject) => {
        xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) {
                _loaded.set(e.loaded);
                _total.set(e.total);
                _progress.set(Math.round((e.loaded / e.total) * 100));
            }
        };

        xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                _progress.set(100);
                _status.set('done');
                try { resolve(JSON.parse(xhr.responseText)); }
                catch { resolve(xhr.responseText); }
            } else {
                _status.set('error');
                reject(new Error(`Upload failed: ${xhr.status} ${xhr.statusText}`));
            }
        };

        xhr.onerror = () => {
            _status.set('error');
            reject(new Error('Upload failed: network error'));
        };

        xhr.onabort = () => {
            _status.set('error');
            reject(new Error('Upload aborted'));
        };

        // Timeout (configurable) — rejects and aborts the transfer.
        const timeout = options?.timeout ?? 0;
        if (timeout > 0) {
            xhr.timeout = timeout;
            xhr.ontimeout = () => {
                _status.set('error');
                reject(new Error(`Upload timed out after ${timeout}ms`));
            };
        }

        const method = options?.method ?? 'POST';
        // Resolve + sanitize the URL through the same policy as the HTTP client
        // (rejects //evil.com, backslashes, javascript:, applies baseUrl).
        const resolvedUrl = resolveUrl(options?.baseUrl, url);
        xhr.open(method, resolvedUrl);

        // Apply headers from options + client
        const headers = { ...options?.client?.headers, ...options?.headers };
        for (const [k, v] of Object.entries(headers)) {
            xhr.setRequestHeader(k, v);
        }

        // Send as FormData (multipart) or raw blob
        if (options?.fieldName) {
            const fd = new FormData();
            fd.append(options.fieldName, file);
            xhr.send(fd);
        } else {
            xhr.send(file);
        }
    });

    return {
        progress: _progress as ReadonlySignal<number>,
        status: _status as ReadonlySignal<TransferStatus>,
        loaded: _loaded as ReadonlySignal<number>,
        total: _total as ReadonlySignal<number>,
        abort: () => xhr.abort(),
        result,
    };
}

// ─── Saving a blob ─────────────────────────────────────────────────

/**
 * Save a Blob as a file the user has.
 *
 * The browser has no API for this: it takes an object URL, an anchor that must be IN the document
 * to be clickable in Firefox, a click, the removal, and `revokeObjectURL` — which is the step that
 * gets forgotten, and forgetting it holds the blob for the life of the document.
 *
 * Usage:
 *   const handle = downloadFile('/api/export/7');
 *   saveBlob(await handle.result, handle.filename() ?? 'export.csv');
 */
export function saveBlob(blob: Blob, filename: string): void {
    if (!filename) throw new Error('saveBlob needs a filename: the browser has no default, and an unnamed download lands as "download"');

    const url = URL.createObjectURL(blob);
    try {
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        // Detached anchors do not open a download in Firefox.
        document.body.appendChild(a);
        try {
            a.click();
        } finally {
            a.remove();
        }
    } finally {
        URL.revokeObjectURL(url);
    }
}

/**
 * The filename a `Content-Disposition` header names, or null.
 *
 * `filename*` (RFC 5987, percent-encoded with its charset) wins over the plain `filename`, which
 * exists as the ASCII fallback for clients that cannot read the other. Any path is dropped: a
 * server that answers `filename="../../etc/passwd"` must not get to name the saved file that.
 */
function filenameFromDisposition(header: string | null): string | null {
    if (!header) return null;

    // Groups: [1]=charset [2]=language [3]=percent-encoded value
    const extended = /filename\*\s*=\s*([^']*)'([^']*)'([^;]+)/i.exec(header);
    let raw: string | undefined;
    if (extended) {
        try {
            raw = decodeURIComponent(extended[3].trim());
        } catch {
            // A malformed percent sequence: fall through to the plain filename rather than throw on
            // a header. A bad name must not fail a download that otherwise succeeded.
        }
    }
    if (raw === undefined) {
        const quoted = /filename\s*=\s*"([^"]*)"/i.exec(header);
        const bare = quoted ? undefined : /filename\s*=\s*([^;]+)/i.exec(header);
        raw = quoted ? quoted[1] : bare?.[1].trim();
    }
    if (raw === undefined) return null;

    const base = raw.split(/[/\\]/).pop()?.trim();
    return base ? base : null;
}

// ─── Download ──────────────────────────────────────────────────────

/**
 * Download a file with reactive progress tracking.
 * Uses fetch + ReadableStream for download progress.
 * Requires server to send Content-Length header for percentage.
 *
 * Usage:
 *   const handle = downloadFile('/api/export/report.pdf');
 *   effect(() => console.log(`${handle.progress()}%`));
 *   const blob = await handle.result;
 */
export function downloadFile(url: string, options?: DownloadOptions): DownloadHandle {
    const _progress = signal(0);
    const _status = signal<TransferStatus>('downloading');
    const _loaded = signal(0);
    const _total = signal(0);
    const _filename = signal<string | null>(options?.filename ?? null);

    const controller = new AbortController();

    const result = (async (): Promise<Blob> => {
        try {
            const res = await fetch(url, {
                headers: options?.headers,
                signal: controller.signal,
            });

            if (!res.ok) {
                _status.set('error');
                throw new Error(`Download failed: ${res.status} ${res.statusText}`);
            }

            // The server's name wins over the caller's hint; when it sends none, the hint stands.
            const sent = filenameFromDisposition(res.headers.get('Content-Disposition'));
            if (sent) _filename.set(sent);

            const contentLength = res.headers.get('Content-Length');
            const total = contentLength ? Number(contentLength) : 0;
            _total.set(total);

            // No ReadableStream support → fallback to blob()
            if (!res.body) {
                const blob = await res.blob();
                _progress.set(100);
                _status.set('done');
                return blob;
            }

            // Stream with progress
            const reader = res.body.getReader();
            const chunks: Uint8Array[] = [];
            let loaded = 0;

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                chunks.push(value);
                loaded += value.length;
                _loaded.set(loaded);
                if (total > 0) {
                    _progress.set(Math.round((loaded / total) * 100));
                }
            }

            const blob = new Blob(chunks as unknown as BlobPart[], {
                type: res.headers.get('Content-Type') ?? 'application/octet-stream',
            });
            _progress.set(100);
            _status.set('done');
            return blob;

        } catch (err) {
            if ((err as Error).name !== 'AbortError') {
                _status.set('error');
            }
            throw err;
        }
    })();

    return {
        progress: _progress as ReadonlySignal<number>,
        status: _status as ReadonlySignal<TransferStatus>,
        loaded: _loaded as ReadonlySignal<number>,
        total: _total as ReadonlySignal<number>,
        filename: _filename as ReadonlySignal<string | null>,
        abort: () => controller.abort(),
        result,
    };
}
