// pdx-rich-text edits one field of one DataSource record: `source`, `field` and `record-id`.
//
// `source` and `field` are declared and published in custom-elements.json, on the site and in the
// skill, so they are wired: a declared prop that is read by nothing does nothing and warns nobody.
// Which row they edit is `record-id`, as on pdx-form and pdx-auto-form: the document
// is that record's field, it follows the record when the source changes it, and an edit writes the
// record back through the source, where it is an unsaved change like any other.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createDataSource } from '@pdxui/core';
import '../../src/rich-text/pdx-rich-text';

type RichText = HTMLElement & { value: unknown; source: unknown; getText(): string; setJSON(json: unknown): void };

const doc = (text: string) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] });

/** The editor builds in requestAnimationFrame: wait for its editing area, frame by frame. */
async function built(el: HTMLElement): Promise<void> {
    for (let i = 0; i < 20; i++) {
        if (el.querySelector('.pdx-rt-content')) return;
        await new Promise(r => requestAnimationFrame(r));
    }
    throw new Error('pdx-rich-text never built its editing area');
}

async function bound(rows: Record<string, unknown>[], recordId: string) {
    const ds = createDataSource({ data: rows, pageSize: 0 });
    const el = document.createElement('pdx-rich-text') as RichText;
    el.source = ds;
    el.setAttribute('field', 'body');
    el.setAttribute('record-id', recordId);
    document.body.appendChild(el);
    await built(el);
    return { el, ds };
}

beforeEach(() => { document.body.innerHTML = ''; });

describe('pdx-rich-text bound to a DataSource record', () => {
    it('opens on the field of the record record-id names', async () => {
        const { el } = await bound([{ id: 1, body: doc('first') }, { id: 2, body: doc('second') }], '2');
        await vi.waitFor(() => expect(el.getText()).toBe('second'));
    });

    it('an edit writes the record back, as an unsaved change of the source', async () => {
        const { el, ds } = await bound([{ id: 1, body: doc('before') }], '1');
        await vi.waitFor(() => expect(el.getText()).toBe('before'));
        el.setJSON(doc('after'));
        await vi.waitFor(() => expect((ds.getById(1) as { body: unknown }).body).toEqual(doc('after')));
        expect(ds.hasChanges()).toBe(true);
    });

    it('follows the record when the source changes it', async () => {
        const { el, ds } = await bound([{ id: 1, body: doc('one') }], '1');
        await vi.waitFor(() => expect(el.getText()).toBe('one'));
        ds.update({ id: 1, body: doc('two') });
        await vi.waitFor(() => expect(el.getText()).toBe('two'));
    });

    it('the control: without a source, value is the document, as before', async () => {
        const el = document.createElement('pdx-rich-text') as RichText;
        el.value = doc('plain');
        document.body.appendChild(el);
        await built(el);
        expect(el.getText()).toBe('plain');
    });
});
