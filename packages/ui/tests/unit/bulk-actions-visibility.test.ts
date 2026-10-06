// pdx-bulk-actions shows only while something is selected, and says so in the registry.
//
// At `count` 0 it is hidden, not a 52 px bar saying "0 selected" with its actions: a data-visible
// attribute that no CSS reads, or an inline display:inline-flex, would keep it on screen. Its default
// label is a component string, not an English literal.
import { describe, it, expect, afterEach } from 'vitest';
import { setComponentStrings, clearComponentStrings, setLocale } from '@pdxui/core';
import { tick } from './helpers';
import '../../src/bulk-actions/pdx-bulk-actions';

async function mount(html: string): Promise<HTMLElement> {
    const host = document.createElement('div');
    host.innerHTML = html;
    document.body.appendChild(host);
    await tick(20);
    return host;
}

afterEach(() => { document.body.innerHTML = ''; clearComponentStrings(); setLocale('en'); });

const bar = (host: HTMLElement) => host.querySelector<HTMLElement>('.pdx-bulk-actions')!;

describe('pdx-bulk-actions', () => {
    it('is hidden at count 0, including when created there', async () => {
        const host = await mount('<pdx-bulk-actions count="0"></pdx-bulk-actions>');
        expect(bar(host).hidden).toBe(true);
        // An inline display:inline-flex beats the [hidden] rule: hidden, and still on screen.
        expect(getComputedStyle(bar(host)).display).toBe('none');
    });

    it('shows while count > 0, and hides again at 0', async () => {
        const host = await mount('<pdx-bulk-actions count="2"></pdx-bulk-actions>');
        expect(bar(host).hidden).toBe(false);
        host.querySelector('pdx-bulk-actions')!.setAttribute('count', '0');
        await tick(20);
        expect(bar(host).hidden).toBe(true);
    });

    it('takes its default label from the component strings', async () => {
        setComponentStrings('bulk-actions', { selected: '{count} ausgewählt' });
        const host = await mount('<pdx-bulk-actions count="3"></pdx-bulk-actions>');
        expect(host.querySelector('.pdx-bulk-count')!.textContent).toBe('3 ausgewählt');
    });

    it('lets a locale pluralise it', async () => {
        setLocale('it');
        setComponentStrings('bulk-actions', { selected: '{count, plural, one {# selezionato} other {# selezionati}}' });
        const host = await mount('<pdx-bulk-actions count="1"></pdx-bulk-actions><pdx-bulk-actions count="4"></pdx-bulk-actions>');
        const labels = [...host.querySelectorAll('.pdx-bulk-count')].map((e) => e.textContent);
        expect(labels).toEqual(['1 selezionato', '4 selezionati']);
    });
});

// An action the caller may not perform.
//
// Offering an action or not offering it is not enough: an application with permissions would have
// to drop the action from the array and explain itself in a paragraph beside the bar, and the
// visitor would never learn the action exists. The third case is "it exists, you cannot do it", and
// it needs the two things a withheld action cannot give: the button, and the reason.
describe('pdx-bulk-actions, an action the caller may not perform', () => {
    /** The bar with one ordinary action and one the caller may not perform. */
    async function withDisabled(reason?: string): Promise<HTMLElement> {
        const host = await mount('<pdx-bulk-actions count="2"></pdx-bulk-actions>');
        const el = host.querySelector('pdx-bulk-actions') as HTMLElement & { actions: unknown };
        el.actions = [
            { key: 'close', label: 'Close' },
            { key: 'export', label: 'Export', disabled: true, ...(reason ? { disabledReason: reason } : {}) },
        ];
        await tick(20);
        return host;
    }

    const actionButtons = (host: HTMLElement) =>
        [...host.querySelectorAll<HTMLButtonElement>('.pdx-bulk-action')];

    it('renders the action rather than hiding it', async () => {
        const host = await withDisabled('Your role may not export.');
        expect(actionButtons(host).map((b) => b.textContent?.trim())).toEqual(['Close', 'Export']);
    });

    it('marks it aria-disabled and leaves it reachable', async () => {
        // `aria-disabled` and not the `disabled` attribute, which is the whole point: a `disabled`
        // button is out of the tab order, so the reason below is unreachable and the user is back
        // to inferring a rule from something they cannot get to. The design system already styles
        // `[aria-disabled="true"]` on a button exactly like `:disabled` (`surfaces/buttons.css`),
        // and `role="toolbar"` is where the ARIA practices recommend this form.
        const host = await withDisabled('Your role may not export.');
        const [ordinary, refused] = actionButtons(host);
        expect(ordinary.getAttribute('aria-disabled')).toBe(null);
        expect(refused.getAttribute('aria-disabled')).toBe('true');
        expect(refused.disabled, 'the button is out of the tab order, so nobody can hear why').toBe(false);
    });

    it('does not emit pdx-action when it is clicked', async () => {
        const host = await withDisabled('Your role may not export.');
        const keys: string[] = [];
        host.querySelector('pdx-bulk-actions')!
            .addEventListener('pdx-action', (e) => keys.push((e as CustomEvent).detail.key));

        const [ordinary, refused] = actionButtons(host);
        refused.click();
        ordinary.click();
        expect(keys, 'the refused action fired anyway').toEqual(['close']);
    });

    it('says why, where a screen reader will read it', async () => {
        const host = await withDisabled('Your role may not export.');
        const refused = actionButtons(host)[1];
        const id = refused.getAttribute('aria-describedby');
        expect(id, 'the reason is not attached to the button').toBeTruthy();
        expect(host.querySelector(`#${id}`)?.textContent).toBe('Your role may not export.');
    });

    it('and describes nothing when no reason was given', async () => {
        // The control: an `aria-describedby` pointing at an empty node is worse than none, and a
        // reason is optional — `disabled: true` alone is a legitimate thing to write.
        const host = await withDisabled();
        expect(actionButtons(host)[1].getAttribute('aria-describedby')).toBe(null);
    });
});
