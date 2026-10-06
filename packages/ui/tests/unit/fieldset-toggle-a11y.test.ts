// pdx-fieldset's collapse toggle has a name and says what it controls.
//
// A toggle rendered as a <button aria-expanded> holding only a chevron SVG has no accessible name
// ("button, expanded") and no aria-controls, and the legend text sits in the same <legend>,
// unlinked — enough to make an app replace its collapsible fieldsets with pdx-accordion to get a
// named trigger.
import { describe, it, expect, beforeEach } from 'vitest';
import { setComponentStrings, clearComponentStrings } from '@pdxui/core';
import { cleanup, mount, tick } from './helpers';
import '../../src/fieldset/pdx-fieldset';

const toggleOf = (el: HTMLElement): HTMLButtonElement => el.querySelector('.pdx-fieldset-toggle') as HTMLButtonElement;

describe('pdx-fieldset collapsible — the toggle', () => {
    beforeEach(() => { cleanup(); clearComponentStrings(); });

    it('is named by the legend text, through aria-labelledby', async () => {
        const el = await mount('pdx-fieldset', { legend: 'Storico 2025', collapsible: '' });
        await tick(20);
        const toggle = toggleOf(el);
        const id = toggle.getAttribute('aria-labelledby');
        expect(id, 'the toggle has no accessible name').toBeTruthy();
        expect(document.getElementById(id!)?.textContent).toBe('Storico 2025');
    });

    it('points aria-controls at the content it shows and hides', async () => {
        const el = await mount('pdx-fieldset', { legend: 'Storico 2025', collapsible: '' });
        await tick(20);
        const id = toggleOf(el).getAttribute('aria-controls');
        expect(id, 'the toggle does not say what it controls').toBeTruthy();
        const target = document.getElementById(id!);
        expect(target?.classList.contains('pdx-fieldset-content')).toBe(true);
        expect(el.contains(target)).toBe(true);
    });

    it('two fieldsets on one page use different ids', async () => {
        const a = await mount('pdx-fieldset', { legend: 'A', collapsible: '' });
        const b = await mount('pdx-fieldset', { legend: 'B', collapsible: '' });
        await tick(20);
        const ids = [a, b].flatMap(el => [toggleOf(el).getAttribute('aria-labelledby'), toggleOf(el).getAttribute('aria-controls')]);
        expect(ids.every(Boolean)).toBe(true);
        expect(new Set(ids).size, 'two instances share an id').toBe(4);
        expect(document.getElementById(toggleOf(b).getAttribute('aria-labelledby')!)?.textContent).toBe('B');
    });

    it('without a legend, is named by the registered string, and follows an override', async () => {
        const el = await mount('pdx-fieldset', { collapsible: '' });
        await tick(20);
        const toggle = toggleOf(el);
        expect(toggle.hasAttribute('aria-labelledby'), 'it points at an empty, hidden legend').toBe(false);
        expect(toggle.getAttribute('aria-label')).toBe('Show or hide section');

        setComponentStrings('fieldset', { toggle: 'Mostra o nascondi la sezione' });
        await tick(20);
        expect(toggle.getAttribute('aria-label')).toBe('Mostra o nascondi la sezione');
    });

    it('without a legend, the toggle is still shown — the legend that holds it is not hidden', async () => {
        const el = await mount('pdx-fieldset', { collapsible: '' });
        await tick(20);
        const legend = el.querySelector('.pdx-legend') as HTMLElement;
        expect(legend.style.display, 'the empty legend was hidden with the toggle inside it').not.toBe('none');
        expect(toggleOf(el).style.display).not.toBe('none');
    });

    it('a plain fieldset with no legend still hides the empty legend — the control', async () => {
        const el = await mount('pdx-fieldset', {});
        await tick(20);
        expect((el.querySelector('.pdx-legend') as HTMLElement).style.display).toBe('none');
    });

    it('a legend set later replaces the fallback name', async () => {
        const el = await mount('pdx-fieldset', { collapsible: '' });
        await tick(20);
        el.setAttribute('legend', 'Allergie');
        await tick(20);
        const toggle = toggleOf(el);
        expect(toggle.hasAttribute('aria-label')).toBe(false);
        expect(document.getElementById(toggle.getAttribute('aria-labelledby')!)?.textContent).toBe('Allergie');
    });
});
