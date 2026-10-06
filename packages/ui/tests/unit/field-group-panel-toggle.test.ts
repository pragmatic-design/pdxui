// pdx-field-group display="panel": the toggle is a button a keyboard can reach.
//
// A <legend role="button" aria-expanded> with a click listener and no tabindex or keys would be
// skipped by Tab, leaving a collapsed panel's fields out of reach without a mouse, and a screen reader
// would hear a "button" that Enter does nothing to — and axe passes it. The toggle is the disclosure
// pattern: a real <button type="button" aria-expanded aria-controls> in the legend.
import { describe, it, expect, beforeEach } from 'vitest';
import { setComponentStrings, clearComponentStrings } from '@pdxui/core';
import { cleanup, mount, tick } from './helpers';
import '../../src/field-group/pdx-field-group';

const toggleOf = (el: HTMLElement) => el.querySelector('legend button') as HTMLButtonElement | null;

describe('pdx-field-group panel — the toggle', () => {
    beforeEach(() => { cleanup(); clearComponentStrings(); });

    it('is a button in the legend, named by the label, that says it is collapsed and what it controls', async () => {
        const el = await mount('pdx-field-group', { label: 'Billing', display: 'panel', collapsed: '' });
        await tick(20);
        const toggle = toggleOf(el);
        expect(toggle, 'no button in the legend: the toggle cannot be reached with Tab').not.toBeNull();
        expect(toggle!.type).toBe('button');
        expect(toggle!.textContent!.trim()).toBe('Billing');
        expect(toggle!.getAttribute('aria-expanded')).toBe('false');
        const content = document.getElementById(toggle!.getAttribute('aria-controls') ?? '');
        expect(content?.classList.contains('pdx-field-group-content')).toBe(true);
        expect(el.contains(content)).toBe(true);
        expect(el.querySelector('legend')!.hasAttribute('role'), 'the legend is no longer a pretend button').toBe(false);
    });

    it('a click expands the panel and collapses it again', async () => {
        const el = await mount('pdx-field-group', { label: 'Billing', display: 'panel', collapsed: '' });
        await tick(20);
        const toggle = toggleOf(el)!;
        const content = el.querySelector('.pdx-field-group-content') as HTMLElement;
        expect(content.hidden).toBe(true);
        toggle.click();
        await tick();
        expect(toggle.getAttribute('aria-expanded')).toBe('true');
        expect(content.hidden).toBe(false);
        toggle.click();
        await tick();
        expect(toggle.getAttribute('aria-expanded')).toBe('false');
        expect(content.hidden).toBe(true);
    });

    // A legend, and the toggle in it, rendered only with a label would leave a collapsed panel with
    // none hidden, and nothing could show it.
    it('without a label, a collapsed panel still has its toggle, named by the registered string, and it opens', async () => {
        const el = await mount('pdx-field-group', { display: 'panel', collapsed: '' });
        await tick(20);
        const toggle = toggleOf(el);
        expect(toggle, 'no toggle: the collapsed content can never be shown').not.toBeNull();
        expect(toggle!.getAttribute('aria-label')).toBe('Show or hide section');
        expect(toggle!.getAttribute('aria-expanded')).toBe('false');
        const content = el.querySelector('.pdx-field-group-content') as HTMLElement;
        expect(content.hidden).toBe(true);
        toggle!.click();
        await tick();
        expect(toggle!.getAttribute('aria-expanded')).toBe('true');
        expect(content.hidden).toBe(false);
    });

    it('without a label the name follows a string override; with one, the label names it and aria-label is gone', async () => {
        const el = await mount('pdx-field-group', { display: 'panel' });
        await tick(20);
        setComponentStrings('field-group', { toggle: 'Mostra o nascondi la sezione' });
        await tick(20);
        expect(toggleOf(el)!.getAttribute('aria-label')).toBe('Mostra o nascondi la sezione');

        const labelled = await mount('pdx-field-group', { display: 'panel', label: 'Billing' });
        await tick(20);
        expect(toggleOf(labelled)!.hasAttribute('aria-label'), 'aria-label would override the visible label').toBe(false);
        expect(toggleOf(labelled)!.textContent!.trim()).toBe('Billing');
    });

    it('two panels on one page control different contents', async () => {
        const a = await mount('pdx-field-group', { label: 'A', display: 'panel' });
        const b = await mount('pdx-field-group', { label: 'B', display: 'panel' });
        await tick(20);
        const ids = [a, b].map(el => toggleOf(el)?.getAttribute('aria-controls'));
        expect(ids.every(Boolean)).toBe(true);
        expect(ids[0]).not.toBe(ids[1]);
        expect(b.contains(document.getElementById(ids[1]!))).toBe(true);
    });
});
