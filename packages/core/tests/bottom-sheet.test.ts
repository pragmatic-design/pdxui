// Coverage (gesture): useBottomSheet — detents, open/close, drag-to-snap.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useBottomSheet } from '../src/mobile/bottom-sheet';

function ptr(type: string, clientY: number): MouseEvent {
    return new MouseEvent(type, { clientY, bubbles: true, cancelable: true });
}

beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '';
    Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true });
});
afterEach(() => vi.useRealTimers());

function sheet() {
    const el = document.createElement('div');
    document.body.appendChild(el);
    return el;
}

describe('useBottomSheet', () => {
    it('snapTo sets detent + height and clamps the index', () => {
        const el = sheet();
        const onDetentChange = vi.fn();
        const bs = useBottomSheet(() => el, { detents: [0.5, 1], onDetentChange });
        bs.snapTo(1);
        expect(bs.currentDetent()).toBe(1);
        expect(bs.height()).toBe(800);
        expect(onDetentChange).toHaveBeenLastCalledWith(1);
        bs.snapTo(0);
        expect(bs.height()).toBe(400);
        bs.snapTo(99); // clamps to last
        expect(bs.currentDetent()).toBe(1);
        bs.dispose();
    });

    it('open shows the sheet + backdrop, close hides after the transition', () => {
        const el = sheet();
        const onClose = vi.fn();
        const bs = useBottomSheet(() => el, { detents: [0.5, 1], onClose });
        bs.open(1);
        expect(bs.isOpen()).toBe(true);
        expect(el.style.display).toBe('block');
        expect(document.querySelector('div[style*="z-index:1040"], div[style*="z-index: 1040"]')).toBeTruthy();
        vi.runAllTimers(); // flush rAF → snapTo
        expect(bs.height()).toBe(800);

        bs.close();
        vi.advanceTimersByTime(300);
        expect(bs.isOpen()).toBe(false);
        expect(onClose).toHaveBeenCalled();
        bs.dispose();
    });

    it('backdrop click closes when closeOnBackdrop is on', () => {
        const el = sheet();
        const onClose = vi.fn();
        const bs = useBottomSheet(() => el, { onClose });
        bs.open();
        vi.runAllTimers();
        const backdrop = document.body.querySelector('div[style*="1040"]') as HTMLElement;
        expect(backdrop).toBeTruthy();
        backdrop.click();
        vi.advanceTimersByTime(300);
        expect(onClose).toHaveBeenCalled();
        bs.dispose();
    });

    it('drag on the handle updates height and snaps on release', () => {
        const el = sheet();
        const bs = useBottomSheet(() => el, { detents: [0.5, 1] });
        bs.snapTo(0); // height 400
        // pointerdown within the top 40px handle area (getBoundingClientRect top = 0)
        el.dispatchEvent(ptr('pointerdown', 10));
        expect(bs.isDragging()).toBe(true);
        document.dispatchEvent(ptr('pointermove', 5)); // drag up by 5 → height grows
        expect(bs.height()).toBeGreaterThan(400);
        document.dispatchEvent(ptr('pointerup', 5));
        expect(bs.isDragging()).toBe(false);
        // snapped back to nearest detent (0.5 → 400)
        expect([400, 800]).toContain(bs.height());
        bs.dispose();
    });

    it('ignores pointerdown outside the handle area', () => {
        const el = sheet();
        const bs = useBottomSheet(() => el, { detents: [0.5, 1] });
        bs.snapTo(1);
        el.dispatchEvent(ptr('pointerdown', 500)); // below the 40px handle
        expect(bs.isDragging()).toBe(false);
        bs.dispose();
    });
});
