// pdx-label ties itself to its control, and pdx-empty-state's title is a heading.
//
// A label must never render for="" — an empty string is written as an attribute, only null removes
// it — or clicking it focuses nothing and its input gets no name from it. The empty state's title as
// plain text would be skipped by a screen reader moving by headings.

import { describe, it, expect, beforeEach } from 'vitest';
import { cleanup, tick } from './helpers';
import '../../src/label/pdx-label';
import '../../src/input/pdx-input';
import '../../src/empty-state/pdx-empty-state';

async function mount(html: string): Promise<HTMLElement> {
    document.body.innerHTML = html;
    await tick(20);
    await tick();
    return document.body;
}

beforeEach(cleanup);

describe('pdx-label association', () => {
    it('with no for, it labels the next control, which gets an id', async () => {
        const root = await mount('<div><pdx-label>Email</pdx-label><input type="email"></div>');
        const label = root.querySelector('label')!;
        const input = root.querySelector('input')!;
        expect(input.id).not.toBe('');
        expect(label.getAttribute('for')).toBe(input.id);
        expect(label.textContent?.trim()).toBe('Email');
    });

    it('it reaches the native input inside a following pdx-input', async () => {
        const root = await mount('<div><pdx-label>Name</pdx-label><pdx-input></pdx-input></div>');
        const input = root.querySelector('pdx-input input') as HTMLInputElement;
        expect(input.id).not.toBe('');
        expect(root.querySelector('label')!.getAttribute('for')).toBe(input.id);
    });

    it('an explicit for is kept', async () => {
        const root = await mount('<div><pdx-label for="u">User</pdx-label><input id="other"><input id="u"></div>');
        expect(root.querySelector('label')!.getAttribute('for')).toBe('u');
    });

    it('with no control after it, it renders no for at all (not for="")', async () => {
        const root = await mount('<div><pdx-label>Alone</pdx-label></div>');
        expect(root.querySelector('label')!.hasAttribute('for')).toBe(false);
    });

    it('a following group is labelled by the label, not its first radio', async () => {
        const root = await mount(`<div><pdx-label>Payment method</pdx-label>
            <div role="radiogroup"><input type="radio" name="p"><input type="radio" name="p"></div></div>`);
        const label = root.querySelector('label')!;
        const group = root.querySelector('[role="radiogroup"]')!;
        expect(label.hasAttribute('for')).toBe(false);
        expect(label.id).not.toBe('');
        expect(group.getAttribute('aria-labelledby')).toBe(label.id);
    });
});

describe('pdx-empty-state title', () => {
    it('is a heading, level 3 by default', async () => {
        const root = await mount('<pdx-empty-state title="No documents"></pdx-empty-state>');
        const title = root.querySelector('.pdx-empty-state-title')!;
        expect(title.getAttribute('role')).toBe('heading');
        expect(title.getAttribute('aria-level')).toBe('3');
        expect(title.textContent).toBe('No documents');
    });

    it('heading-level sets the level', async () => {
        const root = await mount('<pdx-empty-state title="Nothing" heading-level="2"></pdx-empty-state>');
        expect(root.querySelector('.pdx-empty-state-title')!.getAttribute('aria-level')).toBe('2');
    });
});
