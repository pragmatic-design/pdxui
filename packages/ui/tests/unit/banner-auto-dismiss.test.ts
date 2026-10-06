// A banner shown again with `show()` counts its auto-dismiss again.
//
// A timer started only once, at mount, would leave a banner put back by `show()` there for good, and
// the showcase's auto-dismiss example could not be replayed: gone before the reader scrolls to it, and
// a "Show again" would show a banner that no longer dismisses.
//
// Only setTimeout/clearTimeout are faked, so the milliseconds below are exact.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import '../../src/banner/pdx-banner';

type Banner = HTMLElement & { show(): void; dismiss(): void; readonly isVisible: boolean };

function mount(attrs: string): Banner {
    const host = document.createElement('div');
    host.innerHTML = `<pdx-banner ${attrs}>Saved.</pdx-banner>`;
    document.body.appendChild(host);
    return host.querySelector('pdx-banner') as Banner;
}

beforeEach(() => { vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }); });
afterEach(() => { vi.useRealTimers(); document.body.innerHTML = ''; });

describe('pdx-banner auto-dismiss', () => {
    it('hides itself after autoDismiss ms', () => {
        const el = mount('auto-dismiss="100"');
        vi.advanceTimersByTime(99);
        expect(el.isVisible).toBe(true);
        vi.advanceTimersByTime(1);
        expect(el.isVisible).toBe(false);
    });

    it('shown again after dismissing itself, it dismisses itself again', () => {
        const el = mount('auto-dismiss="100"');
        vi.advanceTimersByTime(100);
        el.show();
        expect(el.isVisible).toBe(true);
        vi.advanceTimersByTime(99);
        expect(el.isVisible, 'it waits the full delay again').toBe(true);
        vi.advanceTimersByTime(1);
        expect(el.isVisible).toBe(false);
    });

    it('show() on a visible banner restarts the countdown', () => {
        const el = mount('auto-dismiss="100"');
        vi.advanceTimersByTime(60);
        el.show();
        vi.advanceTimersByTime(60);
        expect(el.isVisible, 'the first timer would have fired at 100 ms').toBe(true);
        vi.advanceTimersByTime(40);
        expect(el.isVisible).toBe(false);
    });

    it('show() without autoDismiss leaves it shown', () => {
        const el = mount('closable');
        el.dismiss();
        el.show();
        vi.advanceTimersByTime(10_000);
        expect(el.isVisible).toBe(true);
    });
});
