// The drop zone says which files it takes in words a reader knows.
//
// Printing the `accept` attribute as it is written would put «.csv,text/csv» under the showcase's
// import. A MIME type is a machine's name for a format; the reader knows the extension. When
// `accept` names extensions, the hint lists them — CSV — and the MIME types beside them, which say
// the same thing twice in a worse way, stay out of it.

import { describe, it, expect, beforeEach } from 'vitest';
import { cleanup, tick } from './helpers';
import '../../src/file-upload/pdx-file-upload';

async function hintFor(accept: string): Promise<string> {
    const el = document.createElement('pdx-file-upload');
    el.setAttribute('accept', accept);
    document.body.appendChild(el);
    await tick(20);
    return el.querySelector('.pdx-file-dropzone-hint')?.textContent?.trim() ?? '';
}

beforeEach(cleanup);

describe('the accepted types, as the hint names them', () => {
    it('extensions and a MIME type: the extension, in capitals, and no MIME type', async () => {
        const hint = await hintFor('.csv,text/csv');
        expect(hint, 'the hint prints the attribute as it is written').toBe('CSV');
    });

    it('several extensions: each one, once', async () => {
        expect(await hintFor('.pdf, .doc,.docx,.PDF')).toBe('PDF, DOC, DOCX');
    });

    it('control — MIME types alone are shown as written: there is no extension to say instead', async () => {
        expect(await hintFor('image/*')).toBe('image/*');
    });
});
