// Enter and Space on a focusGroup item activate it, whether or not the consumer passed onSelect.
//
// focusGroup preventDefault()s Enter and Space on every item — it has to, or a consumer's onSelect
// and the button's own activation would both run — and then calls `onSelect?.()`. With no onSelect
// and no default the key would do nothing at all: the native activation is cancelled.
// pdx-context-menu and pdx-split-button pass none, so without a default their items could not be
// chosen from the keyboard: Enter on "Cut" would leave the menu open and emit nothing.
//
// The default is `el.click()`: the same action a pointer takes, and one that also reaches the
// item in activeDescendant mode, where focus stays on the container and a native activation would
// never land on the item.

import { describe, it, expect, afterEach, vi } from 'vitest';
import { focusGroup } from '../src/a11y/focus-group';

function menu(tag: 'button' | 'div' = 'button'): { container: HTMLElement; items: HTMLElement[] } {
    const container = document.createElement('div');
    container.setAttribute('role', 'menu');
    for (const label of ['Cut', 'Copy', 'Paste']) {
        const el = document.createElement(tag);
        el.setAttribute('role', 'menuitem');
        el.id = 'mi-' + label.toLowerCase();
        el.textContent = label;
        if (tag === 'div') el.tabIndex = -1;
        container.appendChild(el);
    }
    document.body.appendChild(container);
    return { container, items: Array.from(container.children) as HTMLElement[] };
}

function key(target: EventTarget, k: string): KeyboardEvent {
    const e = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true });
    target.dispatchEvent(e);
    return e;
}

afterEach(() => { document.body.innerHTML = ''; });

describe('focusGroup with no onSelect', () => {
    it('Enter clicks the focused item', () => {
        const { container, items } = menu();
        const clicked = vi.fn();
        items[1].addEventListener('click', clicked);
        const dispose = focusGroup(container, { orientation: 'vertical' });
        items[1].focus();

        key(items[1], 'Enter');
        expect(clicked).toHaveBeenCalledTimes(1);
        dispose();
    });

    it('Space clicks the focused item', () => {
        const { container, items } = menu();
        const clicked = vi.fn();
        items[0].addEventListener('click', clicked);
        const dispose = focusGroup(container, { orientation: 'vertical' });
        items[0].focus();

        key(items[0], ' ');
        expect(clicked).toHaveBeenCalledTimes(1);
        dispose();
    });

    it('Enter clicks an item that is not a button', () => {
        const { container, items } = menu('div');
        const clicked = vi.fn();
        items[2].addEventListener('click', clicked);
        const dispose = focusGroup(container, { orientation: 'vertical' });
        items[2].focus();

        key(items[2], 'Enter');
        expect(clicked).toHaveBeenCalledTimes(1);
        dispose();
    });

    it('Enter clicks the active descendant, where focus stays on the container', () => {
        const { container, items } = menu('div');
        container.tabIndex = 0;
        const clicked = vi.fn();
        items[1].addEventListener('click', clicked);
        const dispose = focusGroup(container, { orientation: 'vertical', activeDescendant: true });
        container.focus();
        key(container, 'ArrowDown');
        key(container, 'ArrowDown');
        expect(container.getAttribute('aria-activedescendant')).toBe(items[1].id);

        key(container, 'Enter');
        expect(clicked).toHaveBeenCalledTimes(1);
        dispose();
    });

    it('still cancels the native activation, so a button is not activated twice', () => {
        const { container, items } = menu();
        const dispose = focusGroup(container, { orientation: 'vertical' });
        items[0].focus();
        expect(key(items[0], 'Enter').defaultPrevented).toBe(true);
        dispose();
    });
});

describe('focusGroup with an onSelect', () => {
    it('calls onSelect and does not also click — the consumer owns the activation', () => {
        // The control: a default that clicked as well would toggle an accordion twice.
        const { container, items } = menu();
        const clicked = vi.fn();
        const onSelect = vi.fn();
        items[1].addEventListener('click', clicked);
        const dispose = focusGroup(container, { orientation: 'vertical', onSelect });
        items[1].focus();

        key(items[1], 'Enter');
        expect(onSelect).toHaveBeenCalledWith(items[1], 1);
        expect(clicked).not.toHaveBeenCalled();
        dispose();
    });
});
