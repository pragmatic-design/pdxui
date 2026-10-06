// pdx-file-upload counts max-files once, says what it refused, and keeps focus on removal.
//
// - `max-files="3"` keeps 3 of 5: counting each accepted file twice, once in `added` and once in
//   the entries it has already been pushed to, would keep 2.
// - Files over the limit do not vanish with no event; a wrong type or an oversize file is shown,
//   not only emitted as pdx-error.
// - After a file's "×" (each named after its file, not just "Remove"), focus does not fall to <body>.

import { describe, it, expect, beforeEach } from 'vitest';
import { cleanup, tick } from './helpers';
import '../../src/file-upload/pdx-file-upload';

type Upload = HTMLElement & { addFiles(files: File[]): void; removeFile(i: number): void };

async function mount(attrs: Record<string, string> = {}): Promise<{ el: Upload; errors: string[] }> {
    const el = document.createElement('pdx-file-upload') as Upload;
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    const errors: string[] = [];
    el.addEventListener('pdx-error', (e) => {
        const d = (e as CustomEvent).detail as { file: File; error: string };
        errors.push(`${d.file.name}: ${d.error}`);
    });
    document.body.appendChild(el);
    await tick(20);
    return { el, errors };
}

const file = (name: string, bytes = 4, type = 'text/plain') => new File(['x'.repeat(bytes)], name, { type });
const items = (el: Element) => [...el.querySelectorAll('.pdx-file-item')].map(i => i.querySelector('.pdx-file-name')?.textContent);
const status = (el: Element) => el.querySelector('[role="status"]') as HTMLElement | null;

beforeEach(cleanup);

describe('max-files', () => {
    it('max-files="3" keeps 3 of 5, and reports each refused file', async () => {
        const { el, errors } = await mount({ multiple: '', 'max-files': '3' });
        el.addFiles(['a', 'b', 'c', 'd', 'e'].map(n => file(n + '.txt')));
        await tick();
        expect(items(el)).toEqual(['a.txt', 'b.txt', 'c.txt']);
        expect(errors).toEqual(['d.txt: Too many files (max 3)', 'e.txt: Too many files (max 3)']);
    });

    it('counts what is already there: 2, then 2 more, keeps 3', async () => {
        const { el, errors } = await mount({ multiple: '', 'max-files': '3' });
        el.addFiles([file('a.txt'), file('b.txt')]);
        await tick();
        el.addFiles([file('c.txt'), file('d.txt')]);
        await tick();
        expect(items(el)).toEqual(['a.txt', 'b.txt', 'c.txt']);
        expect(errors).toEqual(['d.txt: Too many files (max 3)']);
    });
});

describe('rejections are shown and announced', () => {
    it('an oversize file is listed with its reason, in a polite status region', async () => {
        const { el, errors } = await mount({ 'max-size': '10' });
        el.addFiles([file('big.bin', 20)]);
        await tick();
        expect(errors).toEqual(['big.bin: File too large (max 10 B)']);
        const region = status(el)!;
        expect(region).not.toBeNull();
        expect(region.textContent).toContain('big.bin: File too large (max 10 B)');
        expect(el.querySelector('.pdx-file-rejections')!.textContent).toContain('big.bin: File too large (max 10 B)');
    });

    it('a wrong type is listed, and the next selection clears the list', async () => {
        const { el } = await mount({ accept: 'image/*', multiple: '' });
        el.addFiles([file('doc.pdf', 4, 'application/pdf')]);
        await tick();
        expect(status(el)!.textContent).toContain('doc.pdf: File type not accepted');
        el.addFiles([file('pic.png', 4, 'image/png')]);
        await tick();
        expect(status(el)!.textContent?.trim()).toBe('');
        expect(items(el)).toEqual(['pic.png']);
    });

    it('the status region is there before anything is refused', async () => {
        const { el } = await mount();
        // A live region added together with its text is often not announced: it exists empty first.
        expect(status(el)).not.toBeNull();
        expect(status(el)!.getAttribute('aria-live') ?? 'polite').toBe('polite');
    });
});

describe('removing a file', () => {
    const removeButtons = (el: Element) => [...el.querySelectorAll<HTMLButtonElement>('.pdx-file-remove')];

    it('each remove button names its file', async () => {
        const { el } = await mount({ multiple: '' });
        el.addFiles([file('f1.txt'), file('f2.txt')]);
        await tick();
        expect(removeButtons(el).map(b => b.getAttribute('aria-label'))).toEqual(['Remove f1.txt', 'Remove f2.txt']);
    });

    it('focus goes to the next file, then the previous, then the drop zone', async () => {
        const { el } = await mount({ multiple: '' });
        el.addFiles([file('f1.txt'), file('f2.txt'), file('f3.txt')]);
        await tick();

        removeButtons(el)[0].focus();
        removeButtons(el)[0].click();
        await tick();
        expect(items(el)).toEqual(['f2.txt', 'f3.txt']);
        expect((document.activeElement as HTMLElement).getAttribute('aria-label')).toBe('Remove f2.txt');

        removeButtons(el)[1].focus();
        removeButtons(el)[1].click();
        await tick();
        expect((document.activeElement as HTMLElement).getAttribute('aria-label')).toBe('Remove f2.txt');

        removeButtons(el)[0].focus();
        removeButtons(el)[0].click();
        await tick();
        expect(items(el)).toEqual([]);
        expect(document.activeElement).toBe(el.querySelector('.pdx-file-dropzone'));
    });

    it('removeFile() from code does not move focus that is elsewhere', async () => {
        const { el } = await mount({ multiple: '' });
        const outside = document.createElement('button');
        document.body.appendChild(outside);
        el.addFiles([file('f1.txt'), file('f2.txt')]);
        await tick();
        outside.focus();
        el.removeFile(0);
        await tick();
        expect(document.activeElement).toBe(outside);
    });
});
