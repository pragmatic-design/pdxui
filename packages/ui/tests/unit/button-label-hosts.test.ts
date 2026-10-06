// A pdx-button's text goes through its `label` prop, so the rendered <button> survives it.
//
// `textContent` on a CONNECTED pdx-button replaces the <button> it rendered with a bare text node: no
// role, no tab stop, no keyboard. pdx-relation-picker writes its footer labels on every prop sync,
// and pdx-auto-form its Save / Reset on every label change, so both go through `label`. The relation
// picker reads the ids the grid's selection event carries (`{ selected, count }`), not
// `detail.items`: otherwise its count stays empty and pdx-pick can never fire.

import { describe, it, expect, beforeEach } from 'vitest';
import { cleanup, tick } from './helpers';
import { createDataSource } from '@pdxui/core';
import '../../src/button/pdx-button';
import '../../src/relation-picker/pdx-relation-picker';
import '../../src/auto-form/pdx-auto-form';

beforeEach(cleanup);

describe('pdx-button label', () => {
    it('renders inside the <button>, after slotted content', async () => {
        document.body.innerHTML = '<pdx-button label="Save"><span class="icon">*</span></pdx-button>';
        await tick(30);
        const btn = document.querySelector('pdx-button button') as HTMLButtonElement;
        expect(btn).toBeTruthy();
        // The icon and the label are separate flex items; the button's `gap` spaces them.
        const icon = btn.querySelector('.icon')!;
        expect(icon, 'the slotted icon is not inside the button').toBeTruthy();
        const texts = Array.from(btn.childNodes).filter(n => n.nodeType === Node.TEXT_NODE && n.textContent!.trim());
        const label = texts[texts.length - 1];
        expect(label?.textContent?.trim()).toBe('Save');
        expect(icon.compareDocumentPosition(label!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('updates the text and keeps the button', async () => {
        document.body.innerHTML = '<pdx-button label="Save"></pdx-button>';
        await tick(30);
        const host = document.querySelector('pdx-button') as HTMLElement;
        const btn = host.querySelector('button');
        host.setAttribute('label', 'Saved');
        await tick();
        expect(host.querySelector('button')).toBe(btn);
        expect(btn?.textContent?.trim()).toBe('Saved');
    });
});

interface City extends Record<string, unknown> { id: number; code: string; name: string }
const CITIES: City[] = [
    { id: 1, code: 'TO', name: 'Torino' },
    { id: 2, code: 'MI', name: 'Milano' },
    { id: 3, code: 'RM', name: 'Roma' },
];

async function mountPicker() {
    const el = document.createElement('pdx-relation-picker') as HTMLElement & { source: unknown; columns: unknown };
    el.setAttribute('create-label', 'New city');
    el.source = createDataSource<City>({ data: CITIES.map(c => ({ ...c })), pageSize: 0 });
    el.columns = [{ field: 'code', header: 'Code' }, { field: 'name', header: 'Name' }];
    document.body.appendChild(el);
    await tick(60);
    const picks: unknown[][] = [];
    el.addEventListener('pdx-pick', (e) => picks.push((e as CustomEvent<{ items: unknown[] }>).detail.items));
    return { el, picks };
}

const footButton = (el: Element, name: string) =>
    Array.from(el.querySelectorAll('.pdx-relation-picker-foot pdx-button button')).find(b => b.textContent?.trim() === name) as HTMLButtonElement | undefined;

describe('pdx-relation-picker footer', () => {
    it('holds two real buttons, New city and Add selected', async () => {
        const { el } = await mountPicker();
        expect(footButton(el, 'New city'), 'New city is not a <button>').toBeTruthy();
        expect(footButton(el, 'Add selected'), 'Add selected is not a <button>').toBeTruthy();
    });

    it('keeps them buttons when a label changes after the build', async () => {
        const { el } = await mountPicker();
        el.setAttribute('add-label', 'Link cities');
        await tick(30);
        expect(footButton(el, 'Link cities')).toBeTruthy();
    });

    it('counts the ticked rows, and Add selected picks them', async () => {
        const { el, picks } = await mountPicker();
        const add = footButton(el, 'Add selected')!;
        expect(add.disabled, 'Add selected is enabled with nothing selected').toBe(true);

        const boxes = el.querySelectorAll<HTMLInputElement>('.pdx-dg-row .pdx-dg-checkbox input');
        boxes[0].click();
        boxes[2].click();
        await tick(30);

        expect(el.querySelector('.pdx-relation-picker-count')?.textContent).toBe('2 selected');
        expect(footButton(el, 'Add selected')!.disabled).toBe(false);
        footButton(el, 'Add selected')!.click();
        expect(picks.length).toBe(1);
        expect((picks[0] as City[]).map(c => c.code)).toEqual(['TO', 'RM']);
    });
});

describe('pdx-auto-form actions', () => {
    it('Save and Reset stay buttons after their labels change', async () => {
        const el = document.createElement('pdx-auto-form') as HTMLElement & { fields: unknown };
        el.fields = [{ key: 'name', label: 'Name', type: 'text' }];
        document.body.appendChild(el);
        await tick(60);
        el.setAttribute('submit-label', 'Store');
        el.setAttribute('reset-label', 'Undo');
        await tick(30);

        const names = Array.from(el.querySelectorAll('pdx-button button')).map(b => b.textContent?.trim());
        expect(names).toContain('Store');
        expect(names).toContain('Undo');
    });
});
