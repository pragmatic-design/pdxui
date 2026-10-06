// Coverage (network): uploadFile (XHR) + downloadFile (fetch/stream) with mocks.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { uploadFile, downloadFile } from '../src/http/upload';

class FakeXHR {
    static instances: FakeXHR[] = [];
    upload: { onprogress: ((e: { lengthComputable: boolean; loaded: number; total: number }) => void) | null } = { onprogress: null };
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    onabort: (() => void) | null = null;
    status = 0;
    statusText = '';
    responseText = '';
    method = '';
    url = '';
    headers: Record<string, string> = {};
    sent: unknown;
    open(m: string, u: string) { this.method = m; this.url = u; }
    setRequestHeader(k: string, v: string) { this.headers[k] = v; }
    send(body: unknown) { this.sent = body; FakeXHR.instances.push(this); }
    abort() { this.onabort?.(); }
}

afterEach(() => { vi.unstubAllGlobals(); FakeXHR.instances = []; });

describe('uploadFile', () => {
    it('tracks progress and resolves with parsed JSON on success', async () => {
        vi.stubGlobal('XMLHttpRequest', FakeXHR);
        const file = new Blob(['x'.repeat(100)]);
        const h = uploadFile('/api/upload', file, { fieldName: 'avatar', headers: { 'X-T': '1' } });
        const xhr = FakeXHR.instances[0];

        expect(h.total()).toBe(100);
        expect(xhr.method).toBe('POST');
        expect(xhr.headers['X-T']).toBe('1');
        expect(xhr.sent).toBeInstanceOf(FormData);

        xhr.upload.onprogress!({ lengthComputable: true, loaded: 50, total: 100 });
        expect(h.progress()).toBe(50);
        expect(h.loaded()).toBe(50);

        xhr.status = 200;
        xhr.responseText = '{"ok":true}';
        xhr.onload!();
        await expect(h.result).resolves.toEqual({ ok: true });
        expect(h.status()).toBe('done');
        expect(h.progress()).toBe(100);
    });

    it('sends a raw blob when no fieldName, and rejects on HTTP error', async () => {
        vi.stubGlobal('XMLHttpRequest', FakeXHR);
        const file = new Blob(['data']);
        const h = uploadFile('/api/upload', file);
        const xhr = FakeXHR.instances[0];
        expect(xhr.sent).toBe(file);
        xhr.status = 500;
        xhr.statusText = 'Server Error';
        xhr.onload!();
        await expect(h.result).rejects.toThrow('Upload failed: 500');
        expect(h.status()).toBe('error');
    });

    it('rejects on network error and on abort', async () => {
        vi.stubGlobal('XMLHttpRequest', FakeXHR);
        const h1 = uploadFile('/u', new Blob(['a']));
        FakeXHR.instances[0].onerror!();
        await expect(h1.result).rejects.toThrow('network error');

        const h2 = uploadFile('/u', new Blob(['a']));
        h2.abort();
        await expect(h2.result).rejects.toThrow('aborted');
    });
});

describe('downloadFile', () => {
    it('streams chunks and resolves with a Blob', async () => {
        let read = false;
        const body = {
            getReader: () => ({
                read: async () => read ? { done: true, value: undefined } : (read = true, { done: false, value: new Uint8Array([1, 2, 3]) }),
            }),
        };
        vi.stubGlobal('fetch', vi.fn(async () => ({
            ok: true,
            status: 200,
            statusText: 'OK',
            headers: new Headers({ 'Content-Length': '3', 'Content-Type': 'text/plain' }),
            body,
        })));
        const h = downloadFile('/api/file');
        const blob = await h.result;
        expect(blob).toBeInstanceOf(Blob);
        expect(h.status()).toBe('done');
        expect(h.progress()).toBe(100);
        expect(h.total()).toBe(3);
    });

    it('falls back to blob() when no stream body', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => ({
            ok: true, status: 200, statusText: 'OK',
            headers: new Headers(), body: null,
            blob: async () => new Blob(['hello']),
        })));
        const h = downloadFile('/api/file');
        await expect(h.result).resolves.toBeInstanceOf(Blob);
        expect(h.status()).toBe('done');
    });

    it('rejects on non-ok response', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => ({
            ok: false, status: 404, statusText: 'Not Found', headers: new Headers(), body: null,
        })));
        const h = downloadFile('/api/missing');
        await expect(h.result).rejects.toThrow('Download failed: 404');
        expect(h.status()).toBe('error');
    });
});
