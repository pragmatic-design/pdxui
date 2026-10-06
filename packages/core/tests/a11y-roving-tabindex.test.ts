// The roving tabindex: a group Tab enters once and the arrows move within.
//
// Getting this wrong is the most common keyboard defect in a component library — a toolbar of
// twelve buttons costing twelve Tab stops — and it drives Tabs, Toolbar, Menubar, RadioGroup and
// ButtonGroup.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useRovingTabindex } from '../src/a11y/roving-tabindex';

let group: HTMLElement;

function build(count = 3, disabledIdx: number[] = []): HTMLButtonElement[] {
    group.innerHTML = '';
    const made: HTMLButtonElement[] = [];
    for (let i = 0; i < count; i++) {
        const b = document.createElement('button');
        b.textContent = `Item ${i}`;
        if (disabledIdx.includes(i)) b.setAttribute('aria-disabled', 'true');
        group.appendChild(b);
        made.push(b);
    }
    return made;
}

const tabindexes = () =>
    Array.from(group.querySelectorAll('button')).map(b => b.getAttribute('tabindex'));

function press(key: string): KeyboardEvent {
    const e = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
    group.dispatchEvent(e);
    return e;
}

beforeEach(() => {
    document.body.innerHTML = '';
    group = document.createElement('div');
    document.body.appendChild(group);
    build();
});

afterEach(() => { document.body.innerHTML = ''; });

const roving = (options?: Parameters<typeof useRovingTabindex>[1]) =>
    useRovingTabindex(() => group, options);

describe('useRovingTabindex — one tab stop', () => {
    it('gives exactly one item tabindex 0 as soon as it is attached', () => {
        const r = roving();
        expect(tabindexes()).toEqual(['0', '-1', '-1']);
        r.dispose();
    });

    it('moves the single 0 as the active item changes', () => {
        const r = roving();
        r.focusItem(2);
        expect(tabindexes()).toEqual(['-1', '-1', '0']);
        expect(r.activeIndex()).toBe(2);
        r.dispose();
    });

    it('reports the element and the index it moved to', () => {
        const onActiveChange = vi.fn();
        const items = build();
        const r = roving({ onActiveChange });
        r.focusItem(1);
        expect(onActiveChange).toHaveBeenCalledWith(items[1], 1);
        r.dispose();
    });

    it('does nothing with an empty group', () => {
        group.innerHTML = '';
        const r = roving();
        r.focusItem(0);
        expect(r.activeIndex()).toBe(0);
        r.dispose();
    });

    it('does nothing without a container', () => {
        const r = useRovingTabindex(() => null);
        expect(() => r.focusItem(1)).not.toThrow();
        r.dispose();
    });

    it('honours a custom selector', () => {
        group.innerHTML = '<a class="i" href="#">a</a><a class="i" href="#">b</a>';
        const r = roving({ itemSelector: '.i' });
        expect(Array.from(group.querySelectorAll('.i')).map(e => e.getAttribute('tabindex')))
            .toEqual(['0', '-1']);
        r.dispose();
    });
});

describe('useRovingTabindex — the ends', () => {
    it('wraps in both directions by default', () => {
        const r = roving();
        r.focusPrev();                    // from 0 → wraps to last
        expect(r.activeIndex()).toBe(2);
        r.focusNext();                    // → wraps to first
        expect(r.activeIndex()).toBe(0);
        r.dispose();
    });

    it('stops at the ends when wrap is off', () => {
        const r = roving({ wrap: false });
        r.focusPrev();
        expect(r.activeIndex()).toBe(0);
        r.focusItem(2);
        r.focusNext();
        expect(r.activeIndex()).toBe(2);
        r.dispose();
    });
});

describe('useRovingTabindex — disabled items', () => {
    it('steps over a disabled item on the way forward', () => {
        build(3, [1]);
        const r = roving();
        r.focusNext();
        expect(r.activeIndex(), 'landed on the disabled item').toBe(2);
        r.dispose();
    });

    it('steps over a disabled item on the way back', () => {
        build(3, [1]);
        const r = roving();
        r.focusItem(2);
        r.focusPrev();
        expect(r.activeIndex()).toBe(0);
        r.dispose();
    });

    it('treats the disabled ATTRIBUTE the same as aria-disabled', () => {
        const items = build(3);
        items[1].setAttribute('disabled', '');
        const r = roving();
        r.focusNext();
        expect(r.activeIndex()).toBe(2);
        r.dispose();
    });

    it('lands on a disabled item when skipDisabled is off', () => {
        build(3, [1]);
        const r = roving({ skipDisabled: false });
        r.focusNext();
        expect(r.activeIndex()).toBe(1);
        r.dispose();
    });

    it('gives up rather than spinning when every item is disabled', () => {
        // The attempts counter is what stops this being an infinite loop. Pinning the behaviour
        // rather than calling it right: a group with nothing focusable is a caller's bug, and the
        // primitive's job is to return.
        build(3, [0, 1, 2]);
        const r = roving();
        expect(() => r.focusNext()).not.toThrow();
        r.dispose();
    });

    it('Home reaches the first ENABLED item, not the last', () => {
        // The direction to search when the requested index is disabled cannot be inferred from
        // `index > activeIndex`: Home asks for 0 while active is already 0, so the inference would
        // say "backwards" and Home would wrap to the END of the group.
        build(3, [0]);
        const r = roving();
        press('Home');
        expect(r.activeIndex(), 'Home went backwards and wrapped to the last item').toBe(1);
        r.dispose();
    });

    it('End reaches the last ENABLED item, not the first', () => {
        build(3, [2]);
        const r = roving();
        press('End');
        expect(r.activeIndex()).toBe(1);
        r.dispose();
    });
});

describe('useRovingTabindex — the keyboard', () => {
    it('is horizontal by default: left and right move, up and down do not', () => {
        const r = roving();
        const right = press('ArrowRight');
        expect(r.activeIndex()).toBe(1);
        expect(right.defaultPrevented).toBe(true);

        press('ArrowLeft');
        expect(r.activeIndex()).toBe(0);

        const down = press('ArrowDown');
        expect(r.activeIndex(), 'a horizontal group must leave vertical scrolling alone').toBe(0);
        expect(down.defaultPrevented).toBe(false);
        r.dispose();
    });

    it('vertical uses up and down, and leaves left and right alone', () => {
        const r = roving({ orientation: 'vertical' });
        press('ArrowDown');
        expect(r.activeIndex()).toBe(1);
        press('ArrowUp');
        expect(r.activeIndex()).toBe(0);

        const right = press('ArrowRight');
        expect(r.activeIndex()).toBe(0);
        expect(right.defaultPrevented).toBe(false);
        r.dispose();
    });

    it('both answers all four arrows', () => {
        const r = roving({ orientation: 'both' });
        press('ArrowRight');
        expect(r.activeIndex()).toBe(1);
        press('ArrowDown');
        expect(r.activeIndex()).toBe(2);
        press('ArrowLeft');
        expect(r.activeIndex()).toBe(1);
        press('ArrowUp');
        expect(r.activeIndex()).toBe(0);
        r.dispose();
    });

    it('Home and End jump to the ends', () => {
        const r = roving();
        press('End');
        expect(r.activeIndex()).toBe(2);
        press('Home');
        expect(r.activeIndex()).toBe(0);
        r.dispose();
    });

    it('ignores a key it does not own', () => {
        const r = roving();
        const e = press('a');
        expect(r.activeIndex()).toBe(0);
        expect(e.defaultPrevented).toBe(false);
        r.dispose();
    });
});

describe('useRovingTabindex — following the user', () => {
    it('adopts an item the user clicked into', () => {
        const items = build();
        const onActiveChange = vi.fn();
        const r = roving({ onActiveChange });

        items[2].dispatchEvent(new FocusEvent('focusin', { bubbles: true }));

        expect(r.activeIndex()).toBe(2);
        expect(tabindexes()).toEqual(['-1', '-1', '0']);
        expect(onActiveChange).toHaveBeenCalledWith(items[2], 2);
        r.dispose();
    });

    it('says nothing when focus lands on the item that was already active', () => {
        const items = build();
        const onActiveChange = vi.fn();
        const r = roving({ onActiveChange });
        items[0].dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
        expect(onActiveChange).not.toHaveBeenCalled();
        r.dispose();
    });

    it('ignores focus on something that is not an item', () => {
        const stray = document.createElement('input');
        group.appendChild(stray);
        const r = roving({ itemSelector: 'button' });
        stray.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
        expect(r.activeIndex()).toBe(0);
        r.dispose();
    });
});

describe('useRovingTabindex — teardown', () => {
    it('stops answering the keyboard once disposed', () => {
        const r = roving();
        r.dispose();
        press('ArrowRight');
        expect(r.activeIndex()).toBe(0);
    });

    it('can be disposed twice', () => {
        const r = roving();
        r.dispose();
        expect(() => r.dispose()).not.toThrow();
    });
});
