// Turning a downloaded Blob into a file the user has.
//
// `downloadFile` hands back a Blob. The eight lines that follow — createObjectURL, an anchor with
// `download`, a click, the removal, revokeObjectURL — are `saveBlob`, so no caller writes them: every
// caller that copies them is a chance to forget `revokeObjectURL` and leak the blob for the life of
// the document. That is the rule of this repository: boilerplate the developer writes is a bug in
// the framework.
//
// `DownloadOptions.filename` is the fallback when the server names no file, and the server's own
// name — Content-Disposition — is what the handle reports first.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { saveBlob, downloadFile } from '../src/http/upload';

interface Saved { href: string; download: string; clicked: boolean; inDocument: boolean }

/** Watch what saveBlob does to the document and to the object URL registry. */
function watchSave(): { saved: Saved[]; revoked: string[]; restore(): void } {
    const saved: Saved[] = [];
    const revoked: string[] = [];
    let n = 0;

    const createSpy = vi.spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:fake/${++n}`);
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation((url: string) => { revoked.push(url); });
    const realCreate = document.createElement.bind(document);
    const elementSpy = vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
        const el = realCreate(tag);
        if (tag === 'a') {
            const anchor = el as HTMLAnchorElement;
            anchor.click = () => {
                saved.push({
                    href: anchor.href,
                    download: anchor.download,
                    clicked: true,
                    // The anchor has to be IN the document when it is clicked: a detached one does
                    // nothing in Firefox, which is the whole reason for the append/remove dance.
                    inDocument: document.body.contains(anchor),
                });
            };
        }
        return el;
    });

    return {
        saved,
        revoked,
        restore: () => { createSpy.mockRestore(); revokeSpy.mockRestore(); elementSpy.mockRestore(); },
    };
}

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('saveBlob', () => {
    it('clicks an anchor that is in the document, named by the filename', () => {
        const w = watchSave();
        try {
            saveBlob(new Blob(['hello']), 'report.pdf');
            expect(w.saved).toHaveLength(1);
            expect(w.saved[0].download).toBe('report.pdf');
            expect(w.saved[0].href).toContain('blob:fake/1');
            expect(w.saved[0].inDocument, 'the anchor was clicked while detached').toBe(true);
        } finally { w.restore(); }
    });

    it('takes the anchor back out of the document', () => {
        const w = watchSave();
        try {
            saveBlob(new Blob(['hello']), 'report.pdf');
            expect(document.querySelectorAll('a[download]')).toHaveLength(0);
        } finally { w.restore(); }
    });

    it('revokes the object URL it created', () => {
        const w = watchSave();
        try {
            saveBlob(new Blob(['hello']), 'report.pdf');
            expect(w.revoked, 'the object URL was never revoked — that blob is held for the life of the document').toEqual(['blob:fake/1']);
        } finally { w.restore(); }
    });

    it('refuses an empty filename rather than saving a file called "undefined"', () => {
        expect(() => saveBlob(new Blob(['x']), '')).toThrow(/filename/i);
    });
});

/** A fetch whose response carries the given headers and a one-chunk body. */
function stubFetch(headers: Record<string, string>): void {
    vi.stubGlobal('fetch', async () => ({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Headers(headers),
        body: null,
        blob: async () => new Blob(['data']),
    }));
}

describe('downloadFile: the name the server sent', () => {
    it('reads the filename out of Content-Disposition', async () => {
        stubFetch({ 'Content-Disposition': 'attachment; filename="quarterly report.pdf"' });
        const h = downloadFile('/api/export/7');
        await h.result;
        expect(h.filename()).toBe('quarterly report.pdf');
    });

    it('prefers filename* over filename, and decodes it', async () => {
        // RFC 5987: the ASCII `filename` is the fallback for old clients; `filename*` is the truth.
        stubFetch({ 'Content-Disposition': "attachment; filename=\"fattura.pdf\"; filename*=UTF-8''fattura%20d%27acconto.pdf" });
        const h = downloadFile('/api/export/7');
        await h.result;
        expect(h.filename()).toBe("fattura d'acconto.pdf");
    });

    it('falls back to the filename given in the options', async () => {
        stubFetch({});
        const h = downloadFile('/api/export/7', { filename: 'fallback.csv' });
        await h.result;
        expect(h.filename()).toBe('fallback.csv');
    });

    it('is null when nobody named the file — not the last segment of the URL', async () => {
        stubFetch({});
        const h = downloadFile('/api/export/7');
        await h.result;
        expect(h.filename(), 'an id was used as a filename').toBeNull();
    });

    it('ignores a path in the header, keeping the basename', async () => {
        // A server that sends `filename="../../etc/passwd"` must not name the saved file that.
        stubFetch({ 'Content-Disposition': 'attachment; filename="../../etc/passwd"' });
        const h = downloadFile('/api/export/7');
        await h.result;
        expect(h.filename()).toBe('passwd');
    });
});
