// A1 — live region announcement timing.
// Re-setting textContent must happen on a microtask (queueMicrotask), not via
// requestAnimationFrame: rAF doesn't fire reliably when the tab is backgrounded
// or in headless contexts, and the project convention (CONTRIBUTING.md) mandates
// microtasks for predictable scheduling.

import { describe, it, expect, afterEach } from 'vitest';
import { createLiveRegion } from '../src/a11y/live-region';

describe('live region (A1)', () => {
    afterEach(() => { document.body.innerHTML = ''; });

    it('sets the message within a microtask, not a frame', async () => {
        const live = createLiveRegion();
        live.announce('Saved');

        const el = document.querySelector('[aria-live="polite"]')!;
        // Cleared synchronously to force a re-read.
        expect(el.textContent).toBe('');

        // One microtask flush must be enough — rAF would still be pending here.
        await Promise.resolve();
        expect(el.textContent).toBe('Saved');

        live.dispose();
    });

    it('routes assertive announcements to the assertive region', async () => {
        const live = createLiveRegion();
        live.announce('Connection lost', 'assertive');
        await Promise.resolve();
        expect(document.querySelector('[aria-live="assertive"]')?.textContent).toBe('Connection lost');
        live.dispose();
    });
});
