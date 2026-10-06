// aria-activedescendant, the pattern a combobox is built on. Shipped a11y code nothing runs is a bug
// in every component that uses it.
//
// Written from the rules the file enforces, not from its lines: what it does with an index out of
// range, what it removes when it moves, what it refuses to do without a controller. Coverage is the
// by-product.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useActiveDescendant } from '../src/a11y/active-descendant';

let input: HTMLInputElement;
let listbox: HTMLElement;

/** Three options with text, so type-ahead has something to match. */
function buildList(labels = ['Alpha', 'Bravo', 'Charlie']): void {
    listbox.innerHTML = '';
    for (const label of labels) {
        const li = document.createElement('div');
        li.setAttribute('role', 'option');
        li.textContent = label;
        listbox.appendChild(li);
    }
}

function items(): HTMLElement[] {
    return Array.from(listbox.querySelectorAll('[role="option"]'));
}

function press(key: string, init: Partial<KeyboardEventInit> = {}): KeyboardEvent {
    const e = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
    input.dispatchEvent(e);
    return e;
}

beforeEach(() => {
    document.body.innerHTML = '';
    input = document.createElement('input');
    listbox = document.createElement('div');
    document.body.append(input, listbox);
    buildList();
});

afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
});

const ad = (options?: Parameters<typeof useActiveDescendant>[2]) =>
    useActiveDescendant(() => input, () => listbox, options);

describe('useActiveDescendant — marking the active item', () => {
    it('marks the item, points the controller at it, and reports the change', () => {
        const onActiveChange = vi.fn();
        const a = ad({ onActiveChange });

        a.setActive(1);

        expect(items()[1].hasAttribute('data-active')).toBe(true);
        expect(items()[1].classList.contains('pdx-active')).toBe(true);
        expect(input.getAttribute('aria-activedescendant')).toBe(items()[1].id);
        expect(a.activeId()).toBe(items()[1].id);
        expect(a.activeIndex()).toBe(1);
        expect(onActiveChange).toHaveBeenCalledWith(items()[1].id, 1);
        a.dispose();
    });

    it('gives the item an id when it has none — aria-activedescendant needs one', () => {
        const a = ad();
        expect(items()[0].id).toBe('');

        a.setActive(0);

        expect(items()[0].id).not.toBe('');
        expect(input.getAttribute('aria-activedescendant')).toBe(items()[0].id);
        a.dispose();
    });

    it('gives every item a DIFFERENT id, across lists and within a millisecond', () => {
        // An id like `pdx-ad-${index}-${Date.now()}` is not unique: two comboboxes on one page, both
        // activating their first option in the same millisecond — which is what happens when one
        // opens in response to the other — would produce the SAME id. A duplicate id makes
        // aria-activedescendant resolve to whichever element comes first in the document, so one
        // combobox announces the other's option.
        const secondInput = document.createElement('input');
        const secondList = document.createElement('div');
        const secondOption = document.createElement('div');
        secondOption.setAttribute('role', 'option');
        secondOption.textContent = 'Elsewhere';
        secondList.appendChild(secondOption);
        document.body.append(secondInput, secondList);

        const a = ad();
        const b = useActiveDescendant(() => secondInput, () => secondList);
        a.setActive(0);
        b.setActive(0);

        expect(items()[0].id).not.toBe(secondOption.id);
        expect(input.getAttribute('aria-activedescendant')).toBe(items()[0].id);
        expect(secondInput.getAttribute('aria-activedescendant')).toBe(secondOption.id);
        a.dispose();
        b.dispose();
    });

    it('keeps an id the author already chose', () => {
        items()[2].id = 'my-own-id';
        const a = ad();
        a.setActive(2);
        expect(input.getAttribute('aria-activedescendant')).toBe('my-own-id');
        a.dispose();
    });

    it('unmarks the previous item when it moves — only one is active', () => {
        const a = ad();
        a.setActive(0);
        a.setActive(2);

        expect(items()[0].hasAttribute('data-active')).toBe(false);
        expect(items()[0].classList.contains('pdx-active')).toBe(false);
        expect(items()[2].hasAttribute('data-active')).toBe(true);
        a.dispose();
    });

    it('does nothing when the list is empty', () => {
        listbox.innerHTML = '';
        const onActiveChange = vi.fn();
        const a = ad({ onActiveChange });

        a.setActive(0);

        expect(a.activeIndex()).toBe(-1);
        expect(input.hasAttribute('aria-activedescendant')).toBe(false);
        expect(onActiveChange).not.toHaveBeenCalled();
        a.dispose();
    });

    it('does nothing when there is no controller to point', () => {
        const onActiveChange = vi.fn();
        const a = useActiveDescendant(() => null, () => listbox, { onActiveChange });
        a.setActive(0);
        expect(a.activeIndex()).toBe(-1);
        expect(onActiveChange).not.toHaveBeenCalled();
        a.dispose();
    });

    it('finds nothing when there is no listbox', () => {
        const a = useActiveDescendant(() => input, () => null);
        a.setActive(0);
        expect(a.activeIndex()).toBe(-1);
        a.dispose();
    });

    it('honours a custom item selector', () => {
        listbox.innerHTML = '<li class="opt">One</li><li class="opt">Two</li>';
        const a = ad({ itemSelector: '.opt' });
        a.setActive(1);
        expect(a.activeIndex()).toBe(1);
        expect(listbox.querySelectorAll('.opt')[1].hasAttribute('data-active')).toBe(true);
        a.dispose();
    });
});

describe('useActiveDescendant — the ends of the list', () => {
    it('wraps past the end to the first, and before the start to the last', () => {
        const a = ad();
        a.setActive(3);            // one past the end
        expect(a.activeIndex()).toBe(0);
        a.setActive(-1);
        expect(a.activeIndex()).toBe(2);
        a.dispose();
    });

    it('clamps instead of wrapping when wrap is off', () => {
        const a = ad({ wrap: false });
        a.setActive(99);
        expect(a.activeIndex()).toBe(2);
        a.setActive(-5);
        expect(a.activeIndex()).toBe(0);
        a.dispose();
    });

    it('next and prev walk the list, and wrap at both ends', () => {
        const a = ad();
        a.next();                  // from -1 → 0
        expect(a.activeIndex()).toBe(0);
        a.next();
        a.next();
        expect(a.activeIndex()).toBe(2);
        a.next();                  // wraps
        expect(a.activeIndex()).toBe(0);
        a.prev();                  // wraps back
        expect(a.activeIndex()).toBe(2);
        a.dispose();
    });

    it('first and last go to the ends', () => {
        const a = ad();
        a.last();
        expect(a.activeIndex()).toBe(2);
        a.first();
        expect(a.activeIndex()).toBe(0);
        a.dispose();
    });
});

describe('useActiveDescendant — clearing', () => {
    it('removes the mark, the aria attribute and the state', () => {
        const onActiveChange = vi.fn();
        const a = ad({ onActiveChange });
        a.setActive(1);
        onActiveChange.mockClear();

        a.clear();

        expect(items()[1].hasAttribute('data-active')).toBe(false);
        expect(items()[1].classList.contains('pdx-active')).toBe(false);
        expect(input.hasAttribute('aria-activedescendant')).toBe(false);
        expect(a.activeId()).toBeNull();
        expect(a.activeIndex()).toBe(-1);
        expect(onActiveChange).toHaveBeenCalledWith(null, -1);
        a.dispose();
    });

    it('is safe with nothing active', () => {
        const a = ad();
        expect(() => a.clear()).not.toThrow();
        expect(a.activeIndex()).toBe(-1);
        a.dispose();
    });

    it('is safe when the list shrank under it', () => {
        // The index it holds may no longer exist: an option list is filtered as the user types.
        const a = ad();
        a.setActive(2);
        buildList(['Only one']);
        expect(() => a.clear()).not.toThrow();
        expect(input.hasAttribute('aria-activedescendant')).toBe(false);
        a.dispose();
    });
});

describe('useActiveDescendant — the keyboard', () => {
    it('moves down and up with the arrows, and consumes the event', () => {
        const a = ad();
        const down = press('ArrowDown');
        expect(a.activeIndex()).toBe(0);
        expect(down.defaultPrevented, 'an unconsumed arrow scrolls the page instead').toBe(true);

        press('ArrowDown');
        expect(a.activeIndex()).toBe(1);
        press('ArrowUp');
        expect(a.activeIndex()).toBe(0);
        a.dispose();
    });

    it('uses left and right when the list is horizontal, and ignores up and down', () => {
        const a = ad({ orientation: 'horizontal' });
        press('ArrowRight');
        expect(a.activeIndex()).toBe(0);
        press('ArrowRight');
        expect(a.activeIndex()).toBe(1);
        press('ArrowLeft');
        expect(a.activeIndex()).toBe(0);

        // The vertical keys are not this list's business — they scroll the page.
        const down = press('ArrowDown');
        expect(a.activeIndex()).toBe(0);
        expect(down.defaultPrevented).toBe(false);
        a.dispose();
    });

    it('Home and End jump to the ends', () => {
        const a = ad();
        press('End');
        expect(a.activeIndex()).toBe(2);
        press('Home');
        expect(a.activeIndex()).toBe(0);
        a.dispose();
    });

    it('Enter selects the active item', () => {
        const onSelect = vi.fn();
        const a = ad({ onSelect });
        a.setActive(1);

        const e = press('Enter');

        expect(onSelect).toHaveBeenCalledWith(items()[1].id, 1);
        expect(e.defaultPrevented).toBe(true);
        a.dispose();
    });

    it('Space selects too, because a listbox option is a button', () => {
        const onSelect = vi.fn();
        const a = ad({ onSelect });
        a.setActive(0);
        press(' ');
        expect(onSelect).toHaveBeenCalledWith(items()[0].id, 0);
        a.dispose();
    });

    it('Enter with nothing active selects nothing and lets the event through', () => {
        // The control on the two above: a form submits on Enter, and swallowing it when no option
        // is highlighted would break every combobox inside one.
        const onSelect = vi.fn();
        const a = ad({ onSelect });
        const e = press('Enter');
        expect(onSelect).not.toHaveBeenCalled();
        expect(e.defaultPrevented).toBe(false);
        a.dispose();
    });

    it('Escape clears', () => {
        const a = ad();
        a.setActive(1);
        press('Escape');
        expect(a.activeIndex()).toBe(-1);
        expect(input.hasAttribute('aria-activedescendant')).toBe(false);
        a.dispose();
    });

    it('ignores a key it does not handle', () => {
        const a = ad({ typeAhead: false });
        const e = press('Tab');
        expect(a.activeIndex()).toBe(-1);
        expect(e.defaultPrevented).toBe(false);
        a.dispose();
    });
});

describe('useActiveDescendant — type-ahead', () => {
    it('jumps to the item whose text starts with what was typed', () => {
        const a = ad();
        press('c');
        expect(a.activeIndex(), 'Charlie').toBe(2);
        a.dispose();
    });

    it('accumulates letters, so "br" is not the same query as "b"', () => {
        buildList(['Bee', 'Bravo']);
        const a = ad();
        press('b');
        expect(a.activeIndex()).toBe(0);   // Bee
        press('r');
        expect(a.activeIndex(), 'now matching "br"').toBe(1);   // Bravo
        a.dispose();
    });

    it('forgets the buffer after the timeout, so the next letter starts over', () => {
        vi.useFakeTimers();
        buildList(['Bee', 'Bravo']);
        const a = ad({ typeAheadTimeout: 300 });
        press('b');
        press('r');
        expect(a.activeIndex()).toBe(1);

        vi.advanceTimersByTime(301);

        press('b');
        expect(a.activeIndex(), 'a fresh "b" matches the first B again').toBe(0);
        a.dispose();
    });

    it('leaves the selection alone when nothing matches', () => {
        const a = ad();
        a.setActive(1);
        press('z');
        expect(a.activeIndex()).toBe(1);
        a.dispose();
    });

    it('does nothing when type-ahead is off', () => {
        const a = ad({ typeAhead: false });
        press('c');
        expect(a.activeIndex()).toBe(-1);
        a.dispose();
    });

    it('is not triggered by a shortcut — Ctrl+C is a copy, not a search for C', () => {
        const a = ad();
        press('c', { ctrlKey: true });
        expect(a.activeIndex()).toBe(-1);
        press('c', { metaKey: true });
        expect(a.activeIndex()).toBe(-1);
        press('c', { altKey: true });
        expect(a.activeIndex()).toBe(-1);
        a.dispose();
    });
});

describe('useActiveDescendant — teardown', () => {
    it('stops listening once disposed', () => {
        const a = ad();
        a.dispose();
        press('ArrowDown');
        expect(a.activeIndex()).toBe(-1);
    });

    it('cancels a pending type-ahead timer', () => {
        vi.useFakeTimers();
        const a = ad();
        press('a');
        a.dispose();
        // Nothing left to fire: if the timer survived, it would clear a buffer on a disposed
        // instance, which is the leak this asserts against.
        expect(vi.getTimerCount()).toBe(0);
    });

    it('can be disposed twice', () => {
        const a = ad();
        a.dispose();
        expect(() => a.dispose()).not.toThrow();
    });
});
