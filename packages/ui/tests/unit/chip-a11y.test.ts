// pdx-chip: a selectable chip is pressed from the keyboard, only interactive parts are tab stops,
// every remove button says what it removes, and nothing interactive nests.
//
// A role="button" + aria-pressed chip needs more than a click handler: Space presses it too. A
// display-only chip is not a tab stop — on the chip page that is 51 dead stops — and a removable
// chip is not two. Each × names what it removes, not just "Remove". aria-disabled sits on an element
// with a role, not on a bare span. Selectable + removable must not put a <button> inside the
// role="button" (axe nested-interactive).
import { describe, it, expect, beforeEach } from 'vitest';
import { cleanup, tick } from './helpers';
import '../../src/chip/pdx-chip';

type Chip = HTMLElement & { selected: boolean };

async function mountChip(html: string): Promise<Chip> {
    document.body.innerHTML = html;
    await tick(30);
    return document.querySelector('pdx-chip') as Chip;
}
const key = (el: Element, k: string): KeyboardEvent => {
    const e = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true });
    el.dispatchEvent(e);
    return e;
};
/** Focusable elements inside the chip: tabindex ≥ 0 or a native button that is not disabled. */
const focusables = (el: Element) => [...el.querySelectorAll<HTMLElement>('[tabindex], button')]
    .filter(n => n.tagName === 'BUTTON' ? !(n as HTMLButtonElement).disabled && n.getAttribute('tabindex') !== '-1' : n.getAttribute('tabindex') === '0');

beforeEach(cleanup);

describe('a selectable chip is a toggle button the keyboard can press', () => {
    it('Space and Enter toggle aria-pressed and emit pdx-toggle; Space does not scroll', async () => {
        const chip = await mountChip('<pdx-chip selectable value="music">Music</pdx-chip>');
        const btn = chip.querySelector('[role="button"]') as HTMLElement;
        expect(btn.getAttribute('aria-pressed')).toBe('false');
        const toggles: unknown[] = [];
        chip.addEventListener('pdx-toggle', (e) => toggles.push((e as CustomEvent).detail));

        const space = key(btn, ' ');
        await tick();
        expect(space.defaultPrevented, 'Space scrolled the page').toBe(true);
        expect(btn.getAttribute('aria-pressed')).toBe('true');
        expect(chip.selected).toBe(true);

        key(btn, 'Enter');
        await tick();
        expect(btn.getAttribute('aria-pressed')).toBe('false');
        expect(toggles).toEqual([{ selected: true, value: 'music' }, { selected: false, value: 'music' }]);
    });

    it('a disabled selectable chip says so on its button and does not toggle', async () => {
        const chip = await mountChip('<pdx-chip selectable disabled>Music</pdx-chip>');
        const btn = chip.querySelector('[role="button"]') as HTMLElement;
        expect(btn.getAttribute('aria-disabled')).toBe('true');
        key(btn, ' ');
        await tick();
        expect(btn.getAttribute('aria-pressed')).toBe('false');
    });
});

describe('only what does something is a tab stop', () => {
    it('a plain chip has no tabindex and no role; disabled, it carries no ARIA either', async () => {
        const chip = await mountChip('<pdx-chip>Info</pdx-chip><pdx-chip disabled>Off</pdx-chip>');
        const [plain, off] = [...document.querySelectorAll('pdx-chip .pdx-chip')];
        expect(plain.hasAttribute('tabindex')).toBe(false);
        expect(plain.hasAttribute('role')).toBe(false);
        expect(off.hasAttribute('aria-disabled'), 'aria-disabled on a span with no role').toBe(false);
        expect(focusables(chip)).toHaveLength(0);
    });

    it('a removable chip has one tab stop, its remove button, named after what it removes', async () => {
        const chip = await mountChip('<pdx-chip removable>React</pdx-chip>');
        const stops = focusables(chip);
        expect(stops).toHaveLength(1);
        expect(stops[0].tagName).toBe('BUTTON');
        expect(stops[0].getAttribute('aria-label')).toBe('Remove React');
    });

    it('the label prop names the remove button too', async () => {
        const chip = await mountChip('<pdx-chip removable label="Vue"></pdx-chip>');
        expect(chip.querySelector('button')!.getAttribute('aria-label')).toBe('Remove Vue');
    });

    it('a disabled removable chip keeps its × and disables it', async () => {
        const chip = await mountChip('<pdx-chip removable disabled>React</pdx-chip>');
        const x = chip.querySelector('button.pdx-chip-remove') as HTMLButtonElement;
        expect(x, 'the × was dropped').toBeTruthy();
        expect(x.disabled).toBe(true);
    });
});

describe('selectable + removable: two sibling buttons, nothing nested', () => {
    it('the toggle and the remove are siblings, both reachable, no button inside a role="button"', async () => {
        const chip = await mountChip('<pdx-chip selectable removable value="tech">Tech</pdx-chip>');
        const toggle = chip.querySelector('[role="button"]') as HTMLElement;
        const x = chip.querySelector('button.pdx-chip-remove') as HTMLButtonElement;
        expect(toggle.querySelector('button, [role="button"]'), 'interactive content nested in the toggle').toBeNull();
        expect(x.closest('[role="button"]'), 'the × sits inside the toggle').toBeNull();
        expect(focusables(chip)).toEqual([toggle, x]);
        expect(x.getAttribute('aria-label')).toBe('Remove Tech');

        const removed: unknown[] = [];
        chip.addEventListener('pdx-remove', (e) => removed.push((e as CustomEvent).detail));
        x.click();
        await tick();
        expect(removed).toEqual([{ value: 'tech', label: '' }]);
        expect(toggle.getAttribute('aria-pressed'), 'the × click toggled the chip').toBe('false');
    });
});
