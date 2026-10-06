// A focus group with another group nested in it (pdx-tabs in a pdx-tabs panel).
//
// The outer group listens for keydown on its container, so it also hears the keys pressed in the
// nested group. A selector for its items matches the nested items too; and when the focused element
// is not one of its items a group moves the focus to its own first item. Without a guard an arrow
// key in the inner tabs moves the inner focus, then the outer group moves it again.
//
// A group acts only on the keys and pointer presses of its own items (or of its container),
// and `items` gives it its items when a selector cannot tell them from a nested group's.

import { describe, it, expect, afterEach } from 'vitest';
import { focusGroup } from '../src/a11y/focus-group';

/** Outer tabs A, B; a nested group C, D in the panel after them, with the same role. */
function nested(): { outer: HTMLElement; inner: HTMLElement; a: HTMLElement; b: HTMLElement; c: HTMLElement; d: HTMLElement } {
    const outer = document.createElement('div');
    outer.innerHTML = `
        <div role="tablist"><button role="tab" class="own">A</button><button role="tab" class="own">B</button></div>
        <div role="tabpanel">
            <div class="inner" role="tablist"><button role="tab">C</button><button role="tab">D</button></div>
        </div>`;
    document.body.appendChild(outer);
    const [a, b, c, d] = Array.from(outer.querySelectorAll<HTMLElement>('[role="tab"]'));
    return { outer, inner: outer.querySelector('.inner') as HTMLElement, a, b, c, d };
}

function key(target: EventTarget, k: string): KeyboardEvent {
    const e = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true });
    target.dispatchEvent(e);
    return e;
}

afterEach(() => { document.body.innerHTML = ''; });

describe('focusGroup with a group nested in it', () => {
    it('ignores a key pressed on an element in its container that is not one of its items', () => {
        const { outer, c } = nested();
        const dispose = focusGroup(outer, { selector: '.own', orientation: 'horizontal' });
        c.focus();
        const e = key(c, 'ArrowRight');
        expect(document.activeElement, 'the focus stays where the key was pressed').toBe(c);
        expect(e.defaultPrevented).toBe(false);
        dispose();
    });

    it('ignores a pointer press outside its items', () => {
        const { outer, a, c } = nested();
        const dispose = focusGroup(outer, { selector: '.own', orientation: 'horizontal' });
        c.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
        expect(a.getAttribute('tabindex')).toBe('0');
        expect(c.hasAttribute('tabindex')).toBe(false);
        dispose();
    });

    it('takes its items from `items`, so a selector the nested group also matches is not needed', () => {
        const { outer, a, b } = nested();
        const dispose = focusGroup(outer, { items: () => [a, b], orientation: 'horizontal', wrap: true });
        b.focus();
        key(b, 'ArrowRight');
        expect(document.activeElement, 'ArrowRight on the last item wraps to the first, not into the nested group').toBe(a);
        dispose();
    });

    it('with both groups active, an arrow key moves only the group it is pressed in', () => {
        const { outer, inner, a, b, c, d } = nested();
        const disposeOuter = focusGroup(outer, { items: () => [a, b], orientation: 'horizontal' });
        const disposeInner = focusGroup(inner, { orientation: 'horizontal' });
        c.focus();
        key(c, 'ArrowRight');
        expect(document.activeElement).toBe(d);
        a.focus();
        key(a, 'ArrowRight');
        expect(document.activeElement).toBe(b);
        disposeInner();
        disposeOuter();
    });
});
