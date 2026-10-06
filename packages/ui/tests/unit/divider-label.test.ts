// pdx-divider takes its text content as the label when `label` is not set: otherwise
// `<pdx-divider>OR</pdx-divider>` renders a plain <hr> and "OR" is gone.
//
// The children are in place when the divider connects — a compiled template, or markup inserted
// whole. Text that arrives after the connect reaches the label through a MutationObserver, which
// happy-dom may silence after a GC: that path is measured in Chromium,
// responsive/.../divider-late-text.spec.ts.
import { describe, it, expect, beforeEach } from 'vitest';
import { cleanup, tick } from './helpers';
import '../../src/divider/pdx-divider';

async function place(text: string, attrs: Record<string, string> = {}): Promise<HTMLElement> {
    const el = document.createElement('pdx-divider');
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    if (text) el.textContent = text;
    document.body.appendChild(el);
    await tick(20);
    return el;
}

beforeEach(cleanup);

describe('pdx-divider label', () => {
    it('text content is the label', async () => {
        const el = await place('OR');
        const seps = el.querySelectorAll('[role="separator"]');
        expect(seps).toHaveLength(1);
        expect(seps[0].tagName).toBe('DIV');
        expect(seps[0].textContent?.trim()).toBe('OR');
        // The authored text is kept, hidden, not shown twice.
        expect((el.querySelector('[data-divider-text]') as HTMLElement).hidden).toBe(true);
    });

    it('the label prop wins over text content', async () => {
        const el = await place('ignored', { label: 'Section' });
        expect(el.querySelector('[role="separator"]')!.textContent?.trim()).toBe('Section');
    });

    it('with neither, it is a plain line', async () => {
        const el = await place('');
        expect(el.querySelector('hr[role="separator"]')).toBeTruthy();
    });
});
