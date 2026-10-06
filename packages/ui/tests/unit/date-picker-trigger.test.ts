/**
 * The trigger of `pdx-date-picker` must be able to CLOSE its own calendar.
 *
 * Both components built on `usePopover` toggle from the trigger: `pdx-select` (`onTriggerClick` →
 * `toggle()`) and the date picker alike. A listener that called `openPopover()` and nothing else
 * would leave the control that opened the calendar unable to close it — Escape and an outside click
 * would, the one affordance a mouse user reaches for first would not.
 *
 * `usePopover.setOpen` refuses a no-op (`if (_isOpen.peek() === open) return`), so the panel itself
 * is not the risk: EVENTS emitted outside that guard would make a second click re-announce
 * `pdx-open`. `openPopover` and `closePopover` have the same shape, so both are asserted here — a
 * duplicate is a duplicate whichever direction it fires in.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { cleanup, mount, tick } from './helpers';
import '../../src/date-picker/pdx-date-picker';

/** The panel is hidden with `display:none` and shown by clearing it (onOpenChange). */
function isPanelOpen(el: HTMLElement): boolean {
    const panel = el.querySelector('.pdx-date-picker-panel') as HTMLElement | null;
    return !!panel && panel.style.display !== 'none';
}

function trigger(el: HTMLElement): HTMLElement {
    return el.querySelector('.pdx-date-picker-trigger') as HTMLElement;
}

describe('pdx-date-picker — the trigger owns its own panel', () => {
    beforeEach(cleanup);

    it('opens the calendar on the first click', async () => {
        // The control: without it, "closes on the second click" is satisfied by a picker that
        // never opens at all.
        const el = await mount('pdx-date-picker', { value: '2024-06-15' });
        await tick(50);

        expect(isPanelOpen(el), 'panel starts closed').toBe(false);
        trigger(el).click();
        await tick(50);
        expect(isPanelOpen(el), 'panel is open after one click').toBe(true);
    });

    it('closes the calendar on the second click', async () => {
        const el = await mount('pdx-date-picker', { value: '2024-06-15' });
        await tick(50);

        trigger(el).click();
        await tick(50);
        trigger(el).click();
        await tick(50);

        expect(isPanelOpen(el), 'a second click on the trigger closes the panel').toBe(false);
        expect(trigger(el).getAttribute('aria-expanded'), 'aria-expanded follows the panel').toBe('false');
    });

    it('announces pdx-open once per opening, not once per click', async () => {
        const el = await mount('pdx-date-picker', { value: '2024-06-15' });
        await tick(50);

        let opens = 0;
        el.addEventListener('pdx-open', () => { opens++; });

        // Three clicks on a picker that opens on the first one: open, close, open.
        trigger(el).click();
        await tick(50);
        trigger(el).click();
        await tick(50);
        trigger(el).click();
        await tick(50);

        expect(opens, 'pdx-open fires once per actual opening').toBe(2);
    });

    it('announces pdx-close once when the Done button dismisses the panel', async () => {
        // The Done button is rendered when `showTimePicker || isRange()` (`:529`), and `isRange()`
        // is `daterange` or `datetimerange` (`:123`) — not `range`, which renders no footer button
        // and would fail this test on its own selector before it could measure anything.
        const el = await mount('pdx-date-picker', { mode: 'daterange' });
        await tick(50);

        trigger(el).click();
        await tick(50);
        expect(isPanelOpen(el), 'panel is open before Done').toBe(true);

        let closes = 0;
        el.addEventListener('pdx-close', () => { closes++; });

        const done = el.querySelector('.pdx-date-picker-panel button.pdx-primary') as HTMLElement;
        expect(done, 'the Done button is rendered in range mode').toBeTruthy();
        done.click();
        await tick(50);

        expect(isPanelOpen(el), 'Done closes the panel').toBe(false);
        expect(closes, 'pdx-close fires once per actual closing').toBe(1);
    });

    it('leaves openPopover() open-only, because the contract scenarios call it', async () => {
        // `host.openPopover()` is the imperative API, and the `date-picker-open` contract scenario
        // opens the calendar with it. If IT toggled, that scenario would go dark: the setup would
        // open and the runner would find nothing. Calling it twice must
        // leave the panel open.
        const el = await mount('pdx-date-picker', { value: '2024-06-15' });
        await tick(50);

        (el as unknown as { openPopover: () => void }).openPopover();
        await tick(50);
        (el as unknown as { openPopover: () => void }).openPopover();
        await tick(50);

        expect(isPanelOpen(el), 'openPopover() is idempotent, never a toggle').toBe(true);
    });
});
