import { describe, it, expect, beforeEach, vi } from 'vitest';
import { focusTrap } from '../src/a11y/focus-trap';
import { focusGroup } from '../src/a11y/focus-group';
import { focusRestore } from '../src/a11y/focus-restore';
import { manageFocusOrder } from '../src/a11y/focus-order';
import { roving } from '../src/a11y/roving';

// Helper: create a container with buttons
function createButtonContainer(count: number, role = 'option'): HTMLElement {
    const container = document.createElement('div');
    for (let i = 0; i < count; i++) {
        const btn = document.createElement('button');
        btn.textContent = `Item ${i}`;
        btn.setAttribute('role', role);
        container.appendChild(btn);
    }
    document.body.appendChild(container);
    return container;
}

function dispatchKey(target: EventTarget, key: string, opts: Partial<KeyboardEvent> = {}): void {
    target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...opts }));
}

// ─── focusTrap ─────────────────────────────────────────────────

describe('focusTrap', () => {
    let container: HTMLElement;

    beforeEach(() => {
        container = document.createElement('div');
        container.innerHTML = `
            <button id="first">First</button>
            <input id="mid" />
            <button id="last">Last</button>
        `;
        document.body.appendChild(container);
    });

    it('focuses first focusable element by default', () => {
        const dispose = focusTrap(container);
        expect(document.activeElement?.id).toBe('first');
        dispose();
    });

    it('focuses last element when initialFocus is "last"', () => {
        const dispose = focusTrap(container, { initialFocus: 'last' });
        expect(document.activeElement?.id).toBe('last');
        dispose();
    });

    it('focuses specific element', () => {
        const mid = container.querySelector<HTMLElement>('#mid')!;
        const dispose = focusTrap(container, { initialFocus: mid });
        expect(document.activeElement?.id).toBe('mid');
        dispose();
    });

    it('wraps Tab from last to first', () => {
        const dispose = focusTrap(container);
        const last = container.querySelector<HTMLElement>('#last')!;
        last.focus();

        dispatchKey(container, 'Tab');
        expect(document.activeElement?.id).toBe('first');
        dispose();
    });

    it('wraps Shift+Tab from first to last', () => {
        const dispose = focusTrap(container);
        const first = container.querySelector<HTMLElement>('#first')!;
        first.focus();

        dispatchKey(container, 'Tab', { shiftKey: true });
        expect(document.activeElement?.id).toBe('last');
        dispose();
    });

    it('restores focus on deactivate', () => {
        const trigger = document.createElement('button');
        trigger.id = 'trigger';
        document.body.appendChild(trigger);
        trigger.focus();

        const dispose = focusTrap(container);
        expect(document.activeElement?.id).toBe('first');

        dispose();
        expect(document.activeElement?.id).toBe('trigger');
        trigger.remove();
    });

    it('does not restore focus when restoreFocus is false', () => {
        const trigger = document.createElement('button');
        trigger.id = 'trigger';
        document.body.appendChild(trigger);
        trigger.focus();

        const dispose = focusTrap(container, { restoreFocus: false });
        dispose();
        // Should NOT have restored to trigger
        expect(document.activeElement?.id).not.toBe('trigger');
        trigger.remove();
    });
});

// ─── focusGroup ────────────────────────────────────────────────

describe('focusGroup', () => {
    let container: HTMLElement;

    beforeEach(() => {
        container = createButtonContainer(4);
    });

    it('initializes first item with tabindex="0"', () => {
        const dispose = focusGroup(container);
        const items = container.querySelectorAll('button');
        expect(items[0].getAttribute('tabindex')).toBe('0');
        expect(items[1].getAttribute('tabindex')).toBe('-1');
        dispose();
    });

    it('ArrowDown navigates to next item', () => {
        const dispose = focusGroup(container, { orientation: 'vertical' });
        const items = container.querySelectorAll('button');
        items[0].focus();

        dispatchKey(container, 'ArrowDown');
        expect(document.activeElement).toBe(items[1]);
        dispose();
    });

    it('ArrowUp navigates to previous item', () => {
        const dispose = focusGroup(container, { orientation: 'vertical' });
        const items = container.querySelectorAll('button');
        items[1].focus();
        items[1].setAttribute('tabindex', '0');

        dispatchKey(container, 'ArrowUp');
        expect(document.activeElement).toBe(items[0]);
        dispose();
    });

    it('wraps around edges', () => {
        const dispose = focusGroup(container, { orientation: 'vertical', wrap: true });
        const items = container.querySelectorAll('button');
        items[3].focus();
        items[3].setAttribute('tabindex', '0');

        dispatchKey(container, 'ArrowDown');
        expect(document.activeElement).toBe(items[0]);
        dispose();
    });

    it('does not wrap when wrap=false', () => {
        const dispose = focusGroup(container, { orientation: 'vertical', wrap: false });
        const items = container.querySelectorAll('button');
        items[3].focus();
        items[3].setAttribute('tabindex', '0');

        dispatchKey(container, 'ArrowDown');
        expect(document.activeElement).toBe(items[3]);
        dispose();
    });

    it('Home goes to first item', () => {
        const dispose = focusGroup(container, { orientation: 'vertical' });
        const items = container.querySelectorAll('button');
        items[2].focus();

        dispatchKey(container, 'Home');
        expect(document.activeElement).toBe(items[0]);
        dispose();
    });

    it('End goes to last item', () => {
        const dispose = focusGroup(container, { orientation: 'vertical' });
        const items = container.querySelectorAll('button');
        items[0].focus();

        dispatchKey(container, 'End');
        expect(document.activeElement).toBe(items[3]);
        dispose();
    });

    it('Enter/Space calls onSelect', () => {
        const onSelect = vi.fn();
        const dispose = focusGroup(container, { onSelect });
        const items = container.querySelectorAll('button');
        items[1].focus();

        dispatchKey(container, 'Enter');
        expect(onSelect).toHaveBeenCalledWith(items[1], 1);
        dispose();
    });

    it('calls onFocus on navigation', () => {
        const onFocus = vi.fn();
        const dispose = focusGroup(container, { orientation: 'vertical', onFocus });
        const items = container.querySelectorAll('button');
        items[0].focus();

        dispatchKey(container, 'ArrowDown');
        expect(onFocus).toHaveBeenCalledWith(items[1], 1);
        dispose();
    });

    it('skips disabled items', () => {
        const items = container.querySelectorAll('button');
        items[1].setAttribute('disabled', '');

        const dispose = focusGroup(container, { orientation: 'vertical', skipDisabled: true });
        items[0].focus();

        dispatchKey(container, 'ArrowDown');
        expect(document.activeElement).toBe(items[2]);
        dispose();
    });

    it('supports horizontal orientation', () => {
        const dispose = focusGroup(container, { orientation: 'horizontal' });
        const items = container.querySelectorAll('button');
        items[0].focus();

        // ArrowDown should NOT navigate in horizontal mode
        dispatchKey(container, 'ArrowDown');
        expect(document.activeElement).toBe(items[0]);

        // ArrowRight should navigate
        dispatchKey(container, 'ArrowRight');
        expect(document.activeElement).toBe(items[1]);
        dispose();
    });

    it('cleans up on dispose', () => {
        const onSelect = vi.fn();
        const dispose = focusGroup(container, { onSelect });
        dispose();

        const items = container.querySelectorAll('button');
        items[0].focus();
        dispatchKey(container, 'Enter');
        expect(onSelect).not.toHaveBeenCalled();
    });
});

// ─── focusTrap: escapeDeactivates (#1160) ─────────────────────

describe('focusTrap escapeDeactivates', () => {
    function trapFixture(): { container: HTMLElement; outside: HTMLElement; last: HTMLElement } {
        const outside = document.createElement('button');
        const container = document.createElement('div');
        container.innerHTML = '<button id="esc-first">First</button><button id="esc-last">Last</button>';
        document.body.append(outside, container);
        return { container, outside, last: container.querySelector<HTMLElement>('#esc-last')! };
    }

    it('releases the trap on Escape: Tab is no longer held, the page is exposed again', () => {
        const { container, outside, last } = trapFixture();
        const dispose = focusTrap(container, { escapeDeactivates: true });
        expect(outside.getAttribute('aria-hidden')).toBe('true');

        dispatchKey(last, 'Escape');
        last.focus();
        const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
        last.dispatchEvent(tab);
        expect(tab.defaultPrevented, 'the trap still holds Tab after Escape').toBe(false);
        expect(document.activeElement).toBe(last);
        expect(outside.hasAttribute('aria-hidden'), 'the page stays hidden after Escape').toBe(false);

        dispose();
        container.remove();
        outside.remove();
    });

    it('keeps the trap on Escape with escapeDeactivates: false', () => {
        const { container, outside, last } = trapFixture();
        const dispose = focusTrap(container, { escapeDeactivates: false });

        dispatchKey(last, 'Escape');
        last.focus();
        dispatchKey(last, 'Tab');
        expect(document.activeElement?.id).toBe('esc-first');
        expect(outside.getAttribute('aria-hidden')).toBe('true');

        dispose();
        container.remove();
        outside.remove();
    });

    it('restores focus once: a dispose after the Escape release does nothing', () => {
        const { container, outside, last } = trapFixture();
        outside.focus();
        const dispose = focusTrap(container, { escapeDeactivates: true });
        const focusSpy = vi.spyOn(outside, 'focus');

        dispatchKey(last, 'Escape');
        dispose();
        expect(focusSpy).toHaveBeenCalledTimes(1);

        container.remove();
        outside.remove();
    });
});

// ─── focusRestore ──────────────────────────────────────────────

describe('focusRestore', () => {
    it('saves and restores focus', () => {
        const btn = document.createElement('button');
        btn.id = 'save-target';
        document.body.appendChild(btn);
        btn.focus();

        const fr = focusRestore();
        fr.save();

        // Move focus elsewhere
        const other = document.createElement('button');
        document.body.appendChild(other);
        other.focus();
        expect(document.activeElement).toBe(other);

        fr.restore();
        expect(document.activeElement?.id).toBe('save-target');

        fr.dispose();
        btn.remove();
        other.remove();
    });

    it('handles removed element gracefully', () => {
        const btn = document.createElement('button');
        document.body.appendChild(btn);
        btn.focus();

        const fr = focusRestore();
        fr.save();

        // Remove the saved element
        btn.remove();

        // Trigger MutationObserver
        // (In happy-dom this may not fire synchronously — verify no crash)
        fr.restore(); // should not throw
        fr.dispose();
    });

    // #1159: the saved element's row is removed before restore() — a dialog opened from a row's menu
    // button, whose own action deletes the row. Focus goes to the nearest ancestor still in the
    // document, not to <body>.
    it('falls back to the nearest ancestor still in the document, when that ancestor is focusable', () => {
        const list = document.createElement('div');
        list.tabIndex = -1;
        const row = document.createElement('div');
        const menu = document.createElement('button');
        row.appendChild(menu);
        list.appendChild(row);
        document.body.appendChild(list);
        menu.focus();

        const fr = focusRestore();
        fr.save();
        row.remove();
        fr.restore();
        expect(document.activeElement).toBe(list);

        fr.dispose();
        list.remove();
    });

    it('falls back to the first focusable inside the nearest remaining ancestor', () => {
        const section = document.createElement('section');
        const row = document.createElement('div');
        const menu = document.createElement('button');
        row.appendChild(menu);
        const next = document.createElement('button');
        section.append(row, next);
        document.body.appendChild(section);
        menu.focus();

        const fr = focusRestore();
        fr.save();
        row.remove();
        fr.restore();
        expect(document.activeElement).toBe(next);

        fr.dispose();
        section.remove();
    });
});

// ─── manageFocusOrder ──────────────────────────────────────────

describe('manageFocusOrder', () => {
    it('Tab moves between child tab stops', () => {
        const container = document.createElement('div');
        const child1 = document.createElement('div');
        const btn1 = document.createElement('button');
        btn1.id = 'btn1';
        child1.appendChild(btn1);

        const child2 = document.createElement('div');
        const btn2 = document.createElement('button');
        btn2.id = 'btn2';
        child2.appendChild(btn2);

        container.appendChild(child1);
        container.appendChild(child2);
        document.body.appendChild(container);

        const dispose = manageFocusOrder(container);
        btn1.focus();

        dispatchKey(container, 'Tab');
        expect(document.activeElement?.id).toBe('btn2');

        dispose();
        container.remove();
    });

    it('Shift+Tab moves backward', () => {
        const container = document.createElement('div');
        const child1 = document.createElement('div');
        const btn1 = document.createElement('button');
        btn1.id = 'btn1';
        child1.appendChild(btn1);

        const child2 = document.createElement('div');
        const btn2 = document.createElement('button');
        btn2.id = 'btn2';
        child2.appendChild(btn2);

        container.appendChild(child1);
        container.appendChild(child2);
        document.body.appendChild(container);

        const dispose = manageFocusOrder(container);
        btn2.focus();

        dispatchKey(container, 'Tab', { shiftKey: true });
        expect(document.activeElement?.id).toBe('btn1');

        dispose();
        container.remove();
    });

    it('skips disabled children', () => {
        const container = document.createElement('div');

        const child1 = document.createElement('div');
        child1.appendChild(Object.assign(document.createElement('button'), { id: 'btn1' }));

        const child2 = document.createElement('div');
        child2.setAttribute('disabled', '');
        child2.appendChild(document.createElement('button'));

        const child3 = document.createElement('div');
        child3.appendChild(Object.assign(document.createElement('button'), { id: 'btn3' }));

        container.append(child1, child2, child3);
        document.body.appendChild(container);

        const dispose = manageFocusOrder(container, { skipDisabled: true });
        container.querySelector<HTMLElement>('#btn1')!.focus();

        dispatchKey(container, 'Tab');
        expect(document.activeElement?.id).toBe('btn3');

        dispose();
        container.remove();
    });
});

// ─── roving backward compat ────────────────────────────────────

describe('roving (backward compat)', () => {
    it('still works with original API', () => {
        const container = createButtonContainer(3, 'tab');
        const onSelect = vi.fn();

        const dispose = roving(container, {
            selector: '[role="tab"]',
            orientation: 'horizontal',
            onSelect,
        });

        const items = container.querySelectorAll('button');
        expect(items[0].getAttribute('tabindex')).toBe('0');
        expect(items[1].getAttribute('tabindex')).toBe('-1');

        items[0].focus();
        dispatchKey(container, 'ArrowRight');
        expect(document.activeElement).toBe(items[1]);

        dispatchKey(container, 'Enter');
        expect(onSelect).toHaveBeenCalledWith(items[1], 1);

        dispose();
        container.remove();
    });
});
