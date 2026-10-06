import { describe, it, expect, beforeEach, vi } from 'vitest';
import { overlayStack, createPortal, createBackdrop, onClickOutsideStack } from '../src/component/overlay-stack';

// Reset stack between tests (pop all entries)
beforeEach(() => {
    while (overlayStack.top()) {
        overlayStack.pop(overlayStack.top()!);
    }
});

describe('overlayStack', () => {
    it('starts empty', () => {
        expect(overlayStack.top()).toBeNull();
        expect(overlayStack.count()).toBe(0);
        expect(overlayStack.modalCount()).toBe(0);
    });

    it('push returns incrementing z-index', () => {
        const z1 = overlayStack.push('a');
        const z2 = overlayStack.push('b');
        expect(z1).toBe(1000);
        expect(z2).toBe(1010);
        expect(overlayStack.count()).toBe(2);
    });

    it('top returns the last pushed overlay', () => {
        overlayStack.push('first');
        overlayStack.push('second');
        expect(overlayStack.top()).toBe('second');
    });

    it('isTop checks correctly', () => {
        overlayStack.push('a');
        overlayStack.push('b');
        expect(overlayStack.isTop('b')).toBe(true);
        expect(overlayStack.isTop('a')).toBe(false);
    });

    it('pop removes by id', () => {
        overlayStack.push('a');
        overlayStack.push('b');
        overlayStack.pop('a');
        expect(overlayStack.count()).toBe(1);
        expect(overlayStack.top()).toBe('b');
    });

    it('pop removes top correctly', () => {
        overlayStack.push('a');
        overlayStack.push('b');
        overlayStack.pop('b');
        expect(overlayStack.top()).toBe('a');
    });

    it('prevents duplicate pushes', () => {
        const z1 = overlayStack.push('same');
        const z2 = overlayStack.push('same');
        expect(z1).toBe(z2);
        expect(overlayStack.count()).toBe(1);
    });

    it('tracks modal count separately', () => {
        overlayStack.push('tooltip');
        overlayStack.push('dialog', { modal: true });
        overlayStack.push('popover');
        expect(overlayStack.count()).toBe(3);
        expect(overlayStack.modalCount()).toBe(1);
    });

    it('entries returns readonly snapshot', () => {
        overlayStack.push('a', { modal: true });
        overlayStack.push('b');
        const entries = overlayStack.entries();
        expect(entries).toHaveLength(2);
        expect(entries[0].id).toBe('a');
        expect(entries[0].modal).toBe(true);
        expect(entries[1].id).toBe('b');
        expect(entries[1].modal).toBe(false);
    });

    it('onDismissTop registers callback for current top', () => {
        overlayStack.push('dialog');
        const dismiss = vi.fn();
        const dispose = overlayStack.onDismissTop(dismiss);

        // Simulate Escape
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        expect(dismiss).toHaveBeenCalledTimes(1);

        dispose();
    });

    it('Escape only dismisses topmost overlay', () => {
        overlayStack.push('bottom');
        const bottomDismiss = vi.fn();
        overlayStack.onDismissTop(bottomDismiss);

        overlayStack.push('top');
        const topDismiss = vi.fn();
        overlayStack.onDismissTop(topDismiss);

        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        expect(topDismiss).toHaveBeenCalledTimes(1);
        expect(bottomDismiss).not.toHaveBeenCalled();
    });
});

describe('createPortal', () => {
    it('creates a portal element in document.body', () => {
        const content = document.createElement('span');
        content.textContent = 'portaled';

        const { el, dispose } = createPortal(content);
        expect(el.getAttribute('data-pdx-portal')).toBe('');
        expect(document.body.contains(el)).toBe(true);
        expect(el.querySelector('span')?.textContent).toBe('portaled');

        dispose();
        expect(document.body.contains(el)).toBe(false);
    });

    it('respects custom target', () => {
        const target = document.createElement('div');
        document.body.appendChild(target);

        const { el, dispose } = createPortal(document.createElement('div'), target);
        expect(target.contains(el)).toBe(true);

        dispose();
        target.remove();
    });
});

describe('createBackdrop', () => {
    it('creates a fixed backdrop element', () => {
        const { el, dispose } = createBackdrop();
        expect(el.style.position).toBe('fixed');
        expect(el.getAttribute('aria-hidden')).toBe('true');
        expect(document.body.contains(el)).toBe(true);

        dispose();
        expect(document.body.contains(el)).toBe(false);
    });

    it('applies blur when requested', () => {
        const { el, dispose } = createBackdrop({ blur: true });
        expect(el.style.backdropFilter).toBe('blur(4px)');
        dispose();
    });

    it('calls onClick on backdrop click', () => {
        const onClick = vi.fn();
        const { el, dispose } = createBackdrop({ onClick });

        el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
        expect(onClick).toHaveBeenCalledTimes(1);

        dispose();
    });
});

describe('onClickOutsideStack', () => {
    it('fires handler when clicking outside element while on top', async () => {
        const el = document.createElement('div');
        document.body.appendChild(el);
        overlayStack.push('test-overlay');

        const handler = vi.fn();
        const dispose = onClickOutsideStack('test-overlay', el, handler);

        // Wait for rAF
        await new Promise(r => requestAnimationFrame(r));

        // Click outside
        document.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
        expect(handler).toHaveBeenCalledTimes(1);

        dispose();
        el.remove();
    });

    it('does NOT fire when overlay is not on top', async () => {
        const el = document.createElement('div');
        document.body.appendChild(el);
        overlayStack.push('bottom');
        overlayStack.push('top-one');

        const handler = vi.fn();
        const dispose = onClickOutsideStack('bottom', el, handler);

        await new Promise(r => requestAnimationFrame(r));

        document.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
        expect(handler).not.toHaveBeenCalled();

        dispose();
        el.remove();
    });
});

// a monotonic z-index, and an onDismissTop that holds

describe('overlay z-index monotonic', () => {
    it('a push after an out-of-order pop does not reuse an active z-index', () => {
        const zA = overlayStack.push('f19-a');
        const zB = overlayStack.push('f19-b');
        const zC = overlayStack.push('f19-c');
        expect(zB).toBeGreaterThan(zA);
        expect(zC).toBeGreaterThan(zB);

        overlayStack.pop('f19-b'); // pop out-of-order
        const zD = overlayStack.push('f19-d');
        expect(zD).toBeGreaterThan(zC); // without the fix: zD === zC

        overlayStack.pop('f19-a');
        overlayStack.pop('f19-c');
        overlayStack.pop('f19-d');
    });
});

describe('onDismissTop dispose', () => {
    it('the dispose does not cancel a callback registered again after it', () => {
        overlayStack.push('f20-x');
        let firstCalls = 0;
        let secondCalls = 0;
        const d1 = overlayStack.onDismissTop(() => { firstCalls++; });
        const d2 = overlayStack.onDismissTop(() => { secondCalls++; });
        d1(); // dispose of the FIRST registration: it must not remove the second

        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        expect(firstCalls).toBe(0);
        expect(secondCalls).toBe(1);
        d2();
        overlayStack.pop('f20-x');
    });
});
