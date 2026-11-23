// A file's row follows its upload: the progress bar while it runs, the check when it is done, the
// message when it failed, and its thumbnail once an image is read.
//
// The row is the list's, keyed by the file's entry. What changes during an upload — status,
// progress, error, preview — has to reach a row that is already drawn, not only a list drawn again.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cleanup, tick } from './helpers';
import '../../src/file-upload/pdx-file-upload.pdx';
import { definedIcon } from '../../src/icon/icon-map';

type Upload = HTMLElement & { addFiles(files: File[]): void; uploadAll(): void };

/** The XMLHttpRequest the component opens, driven by hand: no network. */
class FakeXhr {
    static last: FakeXhr | null = null;
    status = 0;
    responseText = '';
    upload: { onprogress: ((e: { lengthComputable: boolean; loaded: number; total: number }) => void) | null } = { onprogress: null };
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    aborted = false;
    constructor() { FakeXhr.last = this; }
    open(): void {}
    send(): void {}
    abort(): void { this.aborted = true; }
}

async function mount(): Promise<Upload> {
    const el = document.createElement('pdx-file-upload') as Upload;
    el.setAttribute('action', '/upload');
    document.body.appendChild(el);
    await tick(20);
    return el;
}

const row = (el: Element) => el.querySelector('.pdx-file-item') as HTMLElement;

beforeEach(() => {
    cleanup();
    FakeXhr.last = null;
    vi.stubGlobal('XMLHttpRequest', FakeXhr);
});
afterEach(() => vi.unstubAllGlobals());

describe('a row during its upload', () => {
    it('shows the progress bar with its value, then the check and the success class', async () => {
        const el = await mount();
        el.addFiles([new File(['abcd'], 'a.txt', { type: 'text/plain' })]);
        await tick();
        expect(row(el).className).toContain('pdx-file-pending');
        expect(row(el).querySelector('[role="progressbar"]')).toBeNull();

        el.uploadAll();
        await tick();
        const xhr = FakeXhr.last!;
        expect(row(el).className).toContain('pdx-file-uploading');
        expect(row(el).querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')).toBe('0');

        xhr.upload.onprogress!({ lengthComputable: true, loaded: 1, total: 4 });
        await tick();
        expect(row(el).querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')).toBe('25');
        expect(el.querySelector('.pdx-file-list')?.getAttribute('aria-busy')).toBe('true');

        xhr.status = 200;
        xhr.responseText = '{"ok":true}';
        xhr.onload!();
        await tick();
        expect(row(el).className).toContain('pdx-file-success');
        expect(row(el).querySelector('[role="progressbar"]')).toBeNull();
        expect(row(el).querySelector('.pdx-file-status pdx-icon')?.getAttribute('name')).toBe('check');
        expect(el.querySelector('.pdx-file-list')?.hasAttribute('aria-busy')).toBe(false);
    });

    it('shows the failure on the row when the server refuses it', async () => {
        const el = await mount();
        el.addFiles([new File(['abcd'], 'a.txt', { type: 'text/plain' })]);
        await tick();
        el.uploadAll();
        await tick();
        const xhr = FakeXhr.last!;
        xhr.status = 500;
        xhr.onload!();
        await tick();
        expect(row(el).className).toContain('pdx-file-error');
        expect(row(el).querySelector('.pdx-file-info .pdx-file-error')?.textContent).toContain('500');
    });

    it('control — a row that never uploads keeps the file icon and no status', async () => {
        const el = await mount();
        el.addFiles([new File(['abcd'], 'a.txt', { type: 'text/plain' })]);
        await tick();
        expect(row(el).querySelector('.pdx-file-icon pdx-icon')?.getAttribute('name')).toBe('file');
        expect(row(el).querySelector('.pdx-file-status')).toBeNull();
    });
});

describe('the icons it always draws (#47)', () => {
    it('are on the page with it: pdx-icon registered, `file` and `check` defined, by its module alone', () => {
        expect(customElements.get('pdx-icon'), 'pdx-icon is not registered by the module').toBeDefined();
        expect(definedIcon('file'), 'the `file` icon would load a frame late').toBeDefined();
        expect(definedIcon('check'), 'the `check` icon would load a frame late').toBeDefined();
    });
});

describe('an image file', () => {
    it('shows its thumbnail once it is read', async () => {
        const el = await mount();
        el.addFiles([new File([new Uint8Array([137, 80, 78, 71])], 'a.png', { type: 'image/png' })]);
        // The FileReader answers on its own turn.
        await tick(100);
        const img = row(el).querySelector('.pdx-file-thumb img') as HTMLImageElement | null;
        expect(img, 'the thumbnail was never drawn on the row').not.toBeNull();
        expect(img!.getAttribute('src') ?? img!.src).toMatch(/^data:image\/png/);
    });
});
