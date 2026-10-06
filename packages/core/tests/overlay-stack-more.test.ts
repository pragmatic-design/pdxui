// The overlay stack and its neighbours.
//
// Dialog, Drawer, Toast, Popover, Tooltip, ContextMenu and BottomSheet all sit on this file, and
// the things it gets right are invisible until it gets one wrong: which overlay Escape closes, what
// z-index the second dialog gets after the first was closed out of order, whether the body can
// scroll behind a modal.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    overlayStack, createPortal, createBackdrop, applySafeArea, swipeDownDismiss,
    onClickOutsideStack,
} from '../src/component/overlay-stack';

/** The stack is a module singleton: every test has to hand it back empty. */
function drain(): void {
    for (const e of [...overlayStack.entries()]) overlayStack.pop(e.id);
}

function escape(): KeyboardEvent {
    const e = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    document.dispatchEvent(e);
    return e;
}

beforeEach(() => {
    drain();
    document.body.innerHTML = '';
    document.body.style.overflow = '';
});

afterEach(() => {
    drain();
    vi.useRealTimers();
    document.body.innerHTML = '';
});

describe('overlayStack — what is on top', () => {
    it('is empty until something is pushed', () => {
        expect(overlayStack.count()).toBe(0);
        expect(overlayStack.top()).toBeNull();
        expect(overlayStack.isTop('anything')).toBe(false);
    });

    it('stacks in push order and reports the last one', () => {
        overlayStack.push('a');
        overlayStack.push('b');
        expect(overlayStack.count()).toBe(2);
        expect(overlayStack.top()).toBe('b');
        expect(overlayStack.isTop('b')).toBe(true);
        expect(overlayStack.isTop('a')).toBe(false);
    });

    it('uncovers the one below when the top closes', () => {
        overlayStack.push('a');
        overlayStack.push('b');
        overlayStack.pop('b');
        expect(overlayStack.top()).toBe('a');
    });

    it('ignores a pop for something that was never pushed', () => {
        overlayStack.push('a');
        overlayStack.pop('ghost');
        expect(overlayStack.count()).toBe(1);
    });

    it('refuses to stack the same overlay twice, and gives back the z it already had', () => {
        const first = overlayStack.push('a');
        const again = overlayStack.push('a');
        expect(again).toBe(first);
        expect(overlayStack.count()).toBe(1);
    });
});

describe('overlayStack — z-index', () => {
    it('gives each overlay a higher z than the one before', () => {
        const a = overlayStack.push('a');
        const b = overlayStack.push('b');
        expect(b).toBeGreaterThan(a);
    });

    it('never reuses a z after an out-of-order close', () => {
        // From stack.length the second and third overlay could share a z, and which one painted on
        // top was then down to DOM order. The counter is monotonic for exactly this.
        const a = overlayStack.push('a');
        const b = overlayStack.push('b');
        overlayStack.pop('a');           // the one UNDERNEATH closes first
        const c = overlayStack.push('c');
        expect(c).toBeGreaterThan(b);
        expect(c).not.toBe(b);
        expect(c).not.toBe(a);
    });
});

describe('overlayStack — modality', () => {
    it('counts only the modal ones', () => {
        overlayStack.push('toast');
        overlayStack.push('dialog', { modal: true });
        expect(overlayStack.count()).toBe(2);
        expect(overlayStack.modalCount()).toBe(1);
    });

    it('locks the body while a modal is open and releases it after', async () => {
        overlayStack.push('dialog', { modal: true });
        await Promise.resolve();
        expect(document.body.style.overflow, 'the page scrolled behind the modal').toBe('hidden');

        overlayStack.pop('dialog');
        await Promise.resolve();
        expect(document.body.style.overflow).toBe('');
    });

    it('keeps the lock while any modal remains', async () => {
        overlayStack.push('one', { modal: true });
        overlayStack.push('two', { modal: true });
        overlayStack.pop('two');
        await Promise.resolve();
        expect(document.body.style.overflow).toBe('hidden');
    });

    it('does not lock for a non-modal overlay', async () => {
        overlayStack.push('toast');
        await Promise.resolve();
        expect(document.body.style.overflow).toBe('');
    });
});

describe('overlayStack — Escape dismisses the top, and only the top', () => {
    it('calls the top overlay back', () => {
        const onTop = vi.fn();
        overlayStack.push('a');
        overlayStack.onDismissTop(onTop);
        const e = escape();
        expect(onTop).toHaveBeenCalledTimes(1);
        expect(e.defaultPrevented, 'a handled Escape must not also close the dialog behind').toBe(true);
    });

    it('leaves the one underneath alone', () => {
        const onA = vi.fn();
        const onB = vi.fn();
        overlayStack.push('a');
        overlayStack.onDismissTop(onA);
        overlayStack.push('b');
        overlayStack.onDismissTop(onB);

        escape();

        expect(onB).toHaveBeenCalledTimes(1);
        expect(onA).not.toHaveBeenCalled();
    });

    it('falls to the next one down once the top has closed', () => {
        const onA = vi.fn();
        overlayStack.push('a');
        overlayStack.onDismissTop(onA);
        overlayStack.push('b');
        overlayStack.onDismissTop(vi.fn());
        overlayStack.pop('b');

        escape();

        expect(onA).toHaveBeenCalledTimes(1);
    });

    it('does nothing with an empty stack, and lets the key through', () => {
        const e = escape();
        expect(e.defaultPrevented).toBe(false);
    });

    it('ignores every other key', () => {
        const onTop = vi.fn();
        overlayStack.push('a');
        overlayStack.onDismissTop(onTop);
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        expect(onTop).not.toHaveBeenCalled();
    });

    it('registers nothing when there is no overlay to register against', () => {
        const dispose = overlayStack.onDismissTop(vi.fn());
        expect(() => dispose()).not.toThrow();
    });

    it('disposing an OLD registration does not cancel the current one', () => {
        // Two registrations for the same overlay: the first's dispose must not take the second's
        // callback with it, or a re-registering component silently stops answering Escape.
        const first = vi.fn();
        const second = vi.fn();
        overlayStack.push('a');
        const disposeFirst = overlayStack.onDismissTop(first);
        overlayStack.onDismissTop(second);

        disposeFirst();
        escape();

        expect(second).toHaveBeenCalledTimes(1);
        expect(first).not.toHaveBeenCalled();
    });

    it('stops answering once disposed', () => {
        const cb = vi.fn();
        overlayStack.push('a');
        overlayStack.onDismissTop(cb)();
        escape();
        expect(cb).not.toHaveBeenCalled();
    });
});

describe('createPortal', () => {
    it('wraps the content and puts it on the body', () => {
        const content = document.createElement('span');
        content.textContent = 'hello';
        const p = createPortal(content);

        expect(p.el.parentElement).toBe(document.body);
        expect(p.el.hasAttribute('data-pdx-portal')).toBe(true);
        expect(p.el.firstChild).toBe(content);
        p.dispose();
    });

    it('mounts into a selector when given one', () => {
        const host = document.createElement('div');
        host.id = 'host';
        document.body.appendChild(host);

        const p = createPortal(document.createElement('span'), '#host');

        expect(p.el.parentElement).toBe(host);
        p.dispose();
    });

    it('mounts into an element when given one', () => {
        const host = document.createElement('div');
        document.body.appendChild(host);
        const p = createPortal(document.createElement('span'), host);
        expect(p.el.parentElement).toBe(host);
        p.dispose();
    });

    it('falls back to the body when the selector matches nothing', () => {
        const p = createPortal(document.createElement('span'), '#not-here');
        expect(p.el.parentElement).toBe(document.body);
        p.dispose();
    });

    it('takes itself out of the DOM on dispose', () => {
        const p = createPortal(document.createElement('span'));
        p.dispose();
        expect(p.el.isConnected).toBe(false);
    });
});

describe('createBackdrop', () => {
    it('covers the viewport, is hidden from assistive tech, and sits under the overlays', () => {
        const b = createBackdrop();
        expect(b.el.getAttribute('aria-hidden')).toBe('true');
        expect(b.el.style.position).toBe('fixed');
        expect(b.el.style.inset).toBe('0');
        expect(Number(b.el.style.zIndex), 'the backdrop must sit below the overlay base').toBeLessThan(1000);
        expect(b.el.parentElement).toBe(document.body);
        b.dispose();
    });

    it('blurs only when asked', () => {
        const plain = createBackdrop();
        const blurred = createBackdrop({ blur: true });
        expect(plain.el.style.backdropFilter).toBe('');
        expect(blurred.el.style.backdropFilter).toContain('blur');
        plain.dispose();
        blurred.dispose();
    });

    it('takes the z-index it is given', () => {
        const b = createBackdrop({ zIndex: 42 });
        expect(b.el.style.zIndex).toBe('42');
        b.dispose();
    });

    it('answers a press on itself', () => {
        const onClick = vi.fn();
        const b = createBackdrop({ onClick });
        b.el.dispatchEvent(new Event('pointerdown', { bubbles: true }));
        expect(onClick).toHaveBeenCalledTimes(1);
        b.dispose();
    });

    it('ignores a press that started on the dialog above it', () => {
        // The event bubbles through the backdrop; only a press ON the backdrop dismisses. Without
        // the target check, releasing a text selection over the backdrop closes the dialog.
        const onClick = vi.fn();
        const b = createBackdrop({ onClick });
        const child = document.createElement('button');
        b.el.appendChild(child);

        child.dispatchEvent(new Event('pointerdown', { bubbles: true }));

        expect(onClick).not.toHaveBeenCalled();
        b.dispose();
    });

    it('removes itself on dispose', () => {
        const b = createBackdrop();
        b.dispose();
        expect(b.el.isConnected).toBe(false);
    });
});

describe('applySafeArea', () => {
    it('pads for the notch and the home indicator on all four sides', () => {
        // A plain object, not a real element: happy-dom's CSS parser rejects `env()` and drops the
        // assignment, so `document.createElement('div').style.paddingTop` comes back empty and the
        // assertion would be measuring the DOM implementation instead of this function. The
        // function only ever touches el.style.padding*, so this is the whole of its contract.
        const fake = { style: {} as CSSStyleDeclaration } as HTMLElement;

        applySafeArea(fake);

        expect(fake.style.paddingTop).toBe('env(safe-area-inset-top, 0px)');
        expect(fake.style.paddingBottom).toBe('env(safe-area-inset-bottom, 0px)');
        expect(fake.style.paddingLeft).toBe('env(safe-area-inset-left, 0px)');
        expect(fake.style.paddingRight).toBe('env(safe-area-inset-right, 0px)');
    });
});

describe('swipeDownDismiss', () => {
    let sheet: HTMLElement;

    function touch(type: string, clientY: number): TouchEvent {
        const e = new Event(type, { bubbles: true, cancelable: true }) as TouchEvent;
        Object.defineProperty(e, 'touches', { value: [{ clientY }] });
        sheet.dispatchEvent(e);
        return e;
    }

    beforeEach(() => {
        sheet = document.createElement('div');
        (sheet as unknown as { getBoundingClientRect: unknown }).getBoundingClientRect = () =>
            ({ top: 0, left: 0, width: 300, height: 400, right: 300, bottom: 400, x: 0, y: 0,
                toJSON: () => ({}) }) as DOMRect;
        document.body.appendChild(sheet);
    });

    it('follows the finger downwards', () => {
        const dispose = swipeDownDismiss(sheet, vi.fn());
        touch('touchstart', 10);
        touch('touchmove', 60);
        expect(sheet.style.transform).toBe('translateY(50px)');
        dispose();
    });

    it('does not follow it upwards', () => {
        const dispose = swipeDownDismiss(sheet, vi.fn());
        touch('touchstart', 50);
        touch('touchmove', 10);
        expect(sheet.style.transform, 'a sheet that can be dragged up leaves a gap under it')
            .toBe('translateY(0px)');
        dispose();
    });

    it('only starts from the grab area at the top', () => {
        const dispose = swipeDownDismiss(sheet, vi.fn());
        touch('touchstart', 200);        // well below the 60px handle
        touch('touchmove', 300);
        expect(sheet.style.transform).toBe('');
        dispose();
    });

    it('dismisses past the threshold', () => {
        vi.useFakeTimers();
        const onDismiss = vi.fn();
        const dispose = swipeDownDismiss(sheet, onDismiss, 100);
        touch('touchstart', 10);
        touch('touchmove', 200);
        touch('touchend', 200);

        expect(sheet.style.transform).toBe('translateY(100%)');
        vi.advanceTimersByTime(200);
        expect(onDismiss).toHaveBeenCalledTimes(1);
        dispose();
    });

    it('springs back below the threshold', () => {
        vi.useFakeTimers();
        const onDismiss = vi.fn();
        const dispose = swipeDownDismiss(sheet, onDismiss, 100);
        touch('touchstart', 10);
        touch('touchmove', 40);
        touch('touchend', 40);

        expect(sheet.style.transform).toBe('');
        vi.advanceTimersByTime(500);
        expect(onDismiss).not.toHaveBeenCalled();
        dispose();
    });

    it('ignores a move that never started', () => {
        const dispose = swipeDownDismiss(sheet, vi.fn());
        touch('touchmove', 300);
        expect(sheet.style.transform).toBe('');
        dispose();
    });

    it('does not dismiss after it has been disposed', () => {
        // The dismiss is scheduled 200ms out, to let the slide-away animation finish. Disposing in
        // between — the overlay closed some other way, or the component unmounted — must clear
        // that timer, or onDismiss fires on something already gone.
        vi.useFakeTimers();
        const onDismiss = vi.fn();
        const dispose = swipeDownDismiss(sheet, onDismiss, 100);
        touch('touchstart', 10);
        touch('touchmove', 200);
        touch('touchend', 200);

        dispose();
        vi.advanceTimersByTime(500);

        expect(onDismiss, 'a disposed swipe handler still dismissed').not.toHaveBeenCalled();
    });

    it('stops listening once disposed', () => {
        const dispose = swipeDownDismiss(sheet, vi.fn());
        dispose();
        touch('touchstart', 10);
        touch('touchmove', 60);
        expect(sheet.style.transform).toBe('');
    });
});

describe('onClickOutsideStack', () => {
    let panel: HTMLElement;

    /** The listener is armed in a rAF, so nothing sees the click that opened the overlay. */
    const armed = () => new Promise(r => requestAnimationFrame(() => r(null)));

    beforeEach(() => {
        panel = document.createElement('div');
        document.body.appendChild(panel);
    });

    it('fires for a press outside', async () => {
        const handler = vi.fn();
        overlayStack.push('p');
        const dispose = onClickOutsideStack('p', panel, handler);
        await armed();

        document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));

        expect(handler).toHaveBeenCalledTimes(1);
        dispose();
    });

    it('ignores a press inside', async () => {
        const handler = vi.fn();
        const inside = document.createElement('button');
        panel.appendChild(inside);
        overlayStack.push('p');
        const dispose = onClickOutsideStack('p', panel, handler);
        await armed();

        inside.dispatchEvent(new Event('pointerdown', { bubbles: true }));

        expect(handler).not.toHaveBeenCalled();
        dispose();
    });

    it('stays quiet while another overlay is on top', async () => {
        // A dropdown under a dialog must not close because the user clicked in the dialog.
        const handler = vi.fn();
        overlayStack.push('p');
        const dispose = onClickOutsideStack('p', panel, handler);
        await armed();
        overlayStack.push('dialog');

        document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));

        expect(handler).not.toHaveBeenCalled();
        dispose();
    });

    it('is not armed yet in the frame it was created in', () => {
        // Without the delay it catches the very click that opened the overlay, and the overlay
        // closes the instant it opens.
        const handler = vi.fn();
        overlayStack.push('p');
        const dispose = onClickOutsideStack('p', panel, handler);

        document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));

        expect(handler).not.toHaveBeenCalled();
        dispose();
    });

    it('stops listening once disposed', async () => {
        const handler = vi.fn();
        overlayStack.push('p');
        const dispose = onClickOutsideStack('p', panel, handler);
        await armed();
        dispose();

        document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));

        expect(handler).not.toHaveBeenCalled();
    });

    it('cancels the arming frame if disposed before it runs', async () => {
        const handler = vi.fn();
        overlayStack.push('p');
        onClickOutsideStack('p', panel, handler)();
        await armed();

        document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));

        expect(handler).not.toHaveBeenCalled();
    });
});
