// focusGroup.
//
// It drives Menu, Listbox, Tree, Toolbar, RadioGroup and TabList, and unlike useRovingTabindex it
// navigates the NAVIGABLE items rather than all of them: a disabled item is not a position you can
// land on and then step off, it is not a position at all. That distinction is most of the file.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { focusGroup } from '../src/a11y/focus-group';

let container: HTMLElement;

function build(labels = ['Alpha', 'Bravo', 'Charlie'], disabled: number[] = []): HTMLElement[] {
    container.innerHTML = '';
    return labels.map((label, i) => {
        const item = document.createElement('div');
        item.setAttribute('role', 'option');
        item.tabIndex = -1;
        item.textContent = label;
        if (disabled.includes(i)) item.setAttribute('aria-disabled', 'true');
        container.appendChild(item);
        return item;
    });
}

const items = () => Array.from(container.querySelectorAll<HTMLElement>('[role="option"]'));
const tabindexes = () => items().map(i => i.getAttribute('tabindex'));

function press(key: string, init: Partial<KeyboardEventInit> = {}): KeyboardEvent {
    const e = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
    container.dispatchEvent(e);
    return e;
}

beforeEach(() => {
    document.body.innerHTML = '';
    container = document.createElement('div');
    document.body.appendChild(container);
    build();
});

afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
});

describe('focusGroup — the single tab stop', () => {
    it('gives the first item tabindex 0 the moment it is attached', () => {
        const dispose = focusGroup(container);
        expect(tabindexes()).toEqual(['0', '-1', '-1']);
        dispose();
    });

    it('starts at the first NAVIGABLE item, not the first item', () => {
        build(['Alpha', 'Bravo'], [0]);
        const dispose = focusGroup(container);
        expect(tabindexes(), 'a disabled item cannot be the group tab stop').toEqual(['-1', '0']);
        dispose();
    });

    it('moves the 0 as focus moves', () => {
        const dispose = focusGroup(container);
        press('ArrowDown');
        expect(tabindexes()).toEqual(['0', '-1', '-1']);   // no item focused yet → first
        press('ArrowDown');
        expect(tabindexes()).toEqual(['-1', '0', '-1']);
        dispose();
    });

    it('reports what it focused', () => {
        const onFocus = vi.fn();
        const made = build();
        const dispose = focusGroup(container, { onFocus });
        press('ArrowDown');
        expect(onFocus).toHaveBeenCalledWith(made[0], 0);
        dispose();
    });
});

describe('focusGroup — navigating', () => {
    it('answers all four arrows by default', () => {
        const dispose = focusGroup(container);
        press('ArrowDown');                       // → first
        press('ArrowRight');
        expect(document.activeElement).toBe(items()[1]);
        press('ArrowUp');
        expect(document.activeElement).toBe(items()[0]);
        press('ArrowLeft');
        expect(document.activeElement, 'wrapped back to the last').toBe(items()[2]);
        dispose();
    });

    it('a horizontal group leaves the vertical arrows to the page', () => {
        const dispose = focusGroup(container, { orientation: 'horizontal' });
        press('ArrowRight');
        const down = press('ArrowDown');
        expect(down.defaultPrevented).toBe(false);
        expect(document.activeElement).toBe(items()[0]);
        dispose();
    });

    it('a vertical group leaves the horizontal arrows to the page', () => {
        const dispose = focusGroup(container, { orientation: 'vertical' });
        press('ArrowDown');
        const right = press('ArrowRight');
        expect(right.defaultPrevented).toBe(false);
        expect(document.activeElement).toBe(items()[0]);
        dispose();
    });

    it('stops at the ends when wrap is off', () => {
        const dispose = focusGroup(container, { wrap: false });
        press('ArrowDown');                       // → first
        press('ArrowUp');
        expect(document.activeElement, 'went past the start').toBe(items()[0]);
        press('ArrowDown');
        press('ArrowDown');
        press('ArrowDown');
        expect(document.activeElement, 'went past the end').toBe(items()[2]);
        dispose();
    });

    it('skips a disabled item entirely — it is not a position', () => {
        const made = build(['Alpha', 'Bravo', 'Charlie'], [1]);
        const dispose = focusGroup(container);
        press('ArrowDown');                       // → Alpha
        press('ArrowDown');
        expect(document.activeElement).toBe(made[2]);
        dispose();
    });

    it('lands on a disabled item when skipDisabled is off', () => {
        const made = build(['Alpha', 'Bravo'], [1]);
        const dispose = focusGroup(container, { skipDisabled: false });
        press('ArrowDown');
        press('ArrowDown');
        expect(document.activeElement).toBe(made[1]);
        dispose();
    });

    it('does nothing when every item is disabled', () => {
        build(['Alpha', 'Bravo'], [0, 1]);
        const dispose = focusGroup(container);
        expect(() => press('ArrowDown')).not.toThrow();
        dispose();
    });

    it('Home and End reach the first and last NAVIGABLE items', () => {
        const made = build(['Alpha', 'Bravo', 'Charlie'], [0, 2]);
        const dispose = focusGroup(container);
        press('End');
        expect(document.activeElement, 'End landed on a disabled item').toBe(made[1]);
        press('Home');
        expect(document.activeElement).toBe(made[1]);
        dispose();
    });
});

describe('focusGroup — selecting', () => {
    it('reports Enter on the focused item', () => {
        const onSelect = vi.fn();
        const made = build();
        const dispose = focusGroup(container, { onSelect });
        press('ArrowDown');
        press('Enter');
        expect(onSelect).toHaveBeenCalledWith(made[0], 0);
        dispose();
    });

    it('reports Space too', () => {
        const onSelect = vi.fn();
        const made = build();
        const dispose = focusGroup(container, { onSelect });
        press('ArrowDown');
        press(' ');
        expect(onSelect).toHaveBeenCalledWith(made[0], 0);
        dispose();
    });

    it('selects nothing when focus is not on an item', () => {
        const onSelect = vi.fn();
        const dispose = focusGroup(container, { onSelect });
        press('Enter');
        expect(onSelect).not.toHaveBeenCalled();
        dispose();
    });
});

describe('focusGroup — aria-activedescendant mode', () => {
    it('points the container at the item instead of moving focus', () => {
        const dispose = focusGroup(container, { activeDescendant: true });
        press('ArrowDown');

        const active = container.getAttribute('aria-activedescendant');
        expect(active, 'nothing was announced as active').toBeTruthy();
        expect(items()[0].id).toBe(active);
        expect(items()[0].hasAttribute('data-active')).toBe(true);
        expect(document.activeElement, 'focus must stay where it was').not.toBe(items()[0]);
        dispose();
    });

    it('leaves the tabindexes alone in this mode', () => {
        build();
        const dispose = focusGroup(container, { activeDescendant: true });
        // The items keep whatever they had: the container owns focus, so there is no tab stop to
        // rove. build() set -1 on each.
        expect(tabindexes()).toEqual(['-1', '-1', '-1']);
        dispose();
    });

    it('moves the marker, leaving only one active', () => {
        const dispose = focusGroup(container, { activeDescendant: true });
        press('ArrowDown');
        press('ArrowDown');
        const marked = items().filter(i => i.hasAttribute('data-active'));
        expect(marked).toHaveLength(1);
        expect(container.getAttribute('aria-activedescendant')).toBe(marked[0].id);
        dispose();
    });

    it('selects the active descendant on Enter', () => {
        const onSelect = vi.fn();
        const made = build();
        const dispose = focusGroup(container, { activeDescendant: true, onSelect });
        press('ArrowDown');
        press('Enter');
        expect(onSelect).toHaveBeenCalledWith(made[0], 0);
        dispose();
    });
});

describe('focusGroup — type-ahead', () => {
    it('is off unless asked for', () => {
        const dispose = focusGroup(container);
        press('c');
        expect(document.activeElement).not.toBe(items()[2]);
        dispose();
    });

    it('jumps to the item whose text starts with what was typed', () => {
        const made = build();
        const dispose = focusGroup(container, { typeAhead: true });
        press('c');
        expect(document.activeElement).toBe(made[2]);
        dispose();
    });

    it('accumulates letters', () => {
        const made = build(['Bee', 'Bravo']);
        const dispose = focusGroup(container, { typeAhead: true });
        press('b');
        expect(document.activeElement).toBe(made[0]);
        press('r');
        expect(document.activeElement).toBe(made[1]);
        dispose();
    });

    it('forgets the buffer after the timeout', () => {
        vi.useFakeTimers();
        const made = build(['Bee', 'Bravo']);
        const dispose = focusGroup(container, { typeAhead: true, typeAheadTimeout: 200 });
        press('b');
        press('r');
        expect(document.activeElement).toBe(made[1]);
        vi.advanceTimersByTime(201);
        press('b');
        expect(document.activeElement).toBe(made[0]);
        dispose();
    });

    it('never matches a disabled item', () => {
        const made = build(['Alpha', 'Charlie'], [1]);
        const dispose = focusGroup(container, { typeAhead: true });
        press('c');
        expect(document.activeElement).not.toBe(made[1]);
        dispose();
    });

    it('is not triggered by a shortcut', () => {
        const dispose = focusGroup(container, { typeAhead: true });
        press('c', { ctrlKey: true });
        press('c', { metaKey: true });
        press('c', { altKey: true });
        expect(document.activeElement).not.toBe(items()[2]);
        dispose();
    });
});

describe('focusGroup — pointer', () => {
    it('adopts the item the user pressed', () => {
        const made = build();
        const onFocus = vi.fn();
        const dispose = focusGroup(container, { onFocus });

        made[2].dispatchEvent(new Event('pointerdown', { bubbles: true }));

        expect(tabindexes()).toEqual(['-1', '-1', '0']);
        expect(onFocus).toHaveBeenCalledWith(made[2], 2);
        dispose();
    });

    it('ignores a press on a disabled item', () => {
        const made = build(['Alpha', 'Bravo'], [1]);
        const onFocus = vi.fn();
        const dispose = focusGroup(container, { onFocus });
        made[1].dispatchEvent(new Event('pointerdown', { bubbles: true }));
        expect(onFocus).not.toHaveBeenCalled();
        dispose();
    });

    it('ignores a press outside any item', () => {
        const onFocus = vi.fn();
        const dispose = focusGroup(container, { onFocus });
        container.dispatchEvent(new Event('pointerdown', { bubbles: true }));
        expect(onFocus).not.toHaveBeenCalled();
        dispose();
    });
});

describe('focusGroup — items that are not there yet', () => {
    it('waits for them and then sets the tab stop', async () => {
        container.innerHTML = '';
        const dispose = focusGroup(container);

        const late = document.createElement('div');
        late.setAttribute('role', 'option');
        late.textContent = 'Late';
        container.appendChild(late);

        await new Promise(r => setTimeout(r, 0));
        expect(late.getAttribute('tabindex'),
            'the group never noticed the items arriving — @for renders after the composable runs')
            .toBe('0');
        dispose();
    });

    it('leaves no timer or observer behind when disposed before they arrive', () => {
        // The safety net that disconnects the MutationObserver is a 5s setTimeout, and dispose()
        // must clear it along with the type-ahead timer. Otherwise a menu opened and closed quickly
        // leaves an observer watching a detached container, and a timer, for five seconds.
        vi.useFakeTimers();
        container.innerHTML = '';
        const dispose = focusGroup(container);
        dispose();
        expect(vi.getTimerCount(), 'a disposed focus group is still holding a timer').toBe(0);
    });
});

describe('focusGroup — teardown', () => {
    it('stops answering the keyboard', () => {
        const dispose = focusGroup(container);
        dispose();
        const e = press('ArrowDown');
        expect(e.defaultPrevented).toBe(false);
    });

    it('can be disposed twice', () => {
        const dispose = focusGroup(container);
        dispose();
        expect(() => dispose()).not.toThrow();
    });
});
