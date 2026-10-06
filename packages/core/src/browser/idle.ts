// useIdle — how long since the user was last here, as signals.
//
// `createAuthStore` knows when the TOKEN expires. This knows when the USER stopped being there,
// and they are different questions: a token that lives eight hours does not protect a screen left
// open on a shared desk. An application that handles anything regulated — personal data, money,
// patients — is asked for an inactivity timeout in its first review, and before this every one of
// them wrote its own listener stack.
//
// It does NOT know what logging out means. It reports, and the application decides: `onIdle` is
// where `authStore.clear()` goes, behind whatever dialog the app wants.

import { signal, computed } from '../reactivity/signal';
import type { ReadonlySignal, Dispose } from '../utils/types';

const isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined';

/** The events that mean "somebody is here". Passive, on the document, throttled. */
const ACTIVITY_EVENTS = ['pointerdown', 'pointermove', 'keydown', 'scroll', 'touchstart', 'wheel'] as const;

/** Where a tab tells the others it saw activity. */
const CROSS_TAB_KEY = 'pdx:idle';

export interface IdleOptions {
    /** Milliseconds of inactivity before the user counts as gone. */
    after: number;
    /** Fire `onWarn` this many milliseconds BEFORE going idle. 0 disables the warning. */
    warnBefore?: number;
    /** How often `msRemaining` is recomputed. Default 1000 — a countdown does not need more. */
    tick?: number;
    /** The shortest gap between two resets, however many events arrive. Default 500. */
    throttle?: number;
    /** Activity in another tab of the same origin counts here. Default true. */
    crossTab?: boolean;
    /** Called once when the user goes idle. This is where `authStore.clear()` belongs. */
    onIdle?: () => void;
    /** Called once, `warnBefore` milliseconds before that. Re-armed by a reset. */
    onWarn?: () => void;
}

export interface IdleHandle {
    /** Whether the user has been away for `after` milliseconds (reactive). */
    isIdle: ReadonlySignal<boolean>;
    /** Milliseconds left before that, for the countdown in a dialog (reactive). */
    msRemaining: ReadonlySignal<number>;
    /** "I am still here" — from a dialog's Stay button, or from the application. */
    reset(): void;
    /** How many times the countdown was actually restarted. For a test that asserts throttling. */
    readonly resetCount: number;
    /** Remove every listener and stop every timer. */
    dispose: Dispose;
}

/**
 * Watch for inactivity.
 *
 * Four things make this more than a `setTimeout`, and each one is a test in `idle.test.ts`:
 *
 *   - **which events count**, listened passively on the document and THROTTLED: a reset per
 *     `pointermove` is a signal write per `pointermove`, which is a render per `pointermove`;
 *   - **the wall clock, not the timer.** A background tab's timers are throttled to once a minute
 *     or stopped, so an implementation that trusts `setTimeout` comes back from an hour asleep
 *     still logged in. Every read compares `Date.now()` against the last activity, and
 *     `visibilitychange` forces that comparison the moment the tab returns;
 *   - **`warnBefore`**, because a session that dies without warning takes the form the user was
 *     filling in with it. It fires once, and a reset arms it again;
 *   - **other tabs.** Work in a second tab of the same app is work: each tab writes its activity
 *     to `localStorage`, and the others hear the `storage` event. It is the cheap answer and the
 *     only one that needs no service worker.
 */
export function useIdle(options: IdleOptions): IdleHandle {
    const { after, warnBefore = 0, tick = 1000, throttle = 500, crossTab = true, onIdle, onWarn } = options;

    const _last = signal(Date.now());
    const _idle = signal(false);
    const _remaining = signal(after);

    let warned = false;
    let resets = 0;
    let lastReset = 0;
    let timer: ReturnType<typeof setInterval> | null = null;
    let disposed = false;

    /** The one place that decides, from the CLOCK. Called by the tick and by every event. */
    function evaluate(): void {
        if (disposed) return;
        const elapsed = Date.now() - _last.peek();
        const remaining = Math.max(0, after - elapsed);
        _remaining.set(remaining);

        if (warnBefore > 0 && !warned && remaining <= warnBefore && remaining > 0) {
            warned = true;
            onWarn?.();
        }
        if (!_idle.peek() && elapsed >= after) {
            _idle.set(true);
            onIdle?.();
        }
    }

    function reset(): void {
        if (disposed) return;
        resets++;
        lastReset = Date.now();
        _last.set(lastReset);
        _idle.set(false);
        warned = false;
        _remaining.set(after);
    }

    /**
     * An activity event. Throttled, and NOT while idle: once the user is gone, a stray pointermove
     * from a bumped desk must not put them back — `reset()` is the deliberate answer to that, and
     * it is what a dialog's "Stay" button calls.
     */
    function onActivity(): void {
        if (disposed || _idle.peek()) return;
        const now = Date.now();
        if (now - lastReset < throttle) return;
        reset();
        if (crossTab && isBrowser) {
            try { localStorage.setItem(CROSS_TAB_KEY, String(now)); } catch { /* private mode, quota */ }
        }
    }

    function onVisibility(): void {
        // The tab came back: ask the clock, because the timers were not running.
        if (!disposed && document.visibilityState === 'visible') evaluate();
    }

    function onStorage(e: StorageEvent): void {
        if (e.key !== CROSS_TAB_KEY || disposed || _idle.peek()) return;
        // Another tab saw activity. Not written back: that would be two tabs answering each other.
        resets++;
        lastReset = Date.now();
        _last.set(lastReset);
        warned = false;
        _remaining.set(after);
    }

    if (isBrowser) {
        for (const type of ACTIVITY_EVENTS) {
            document.addEventListener(type, onActivity, { passive: true });
        }
        document.addEventListener('visibilitychange', onVisibility);
        if (crossTab) window.addEventListener('storage', onStorage);
        timer = setInterval(evaluate, tick);
    }

    return {
        isIdle: computed(() => _idle()) as ReadonlySignal<boolean>,
        msRemaining: computed(() => _remaining()) as ReadonlySignal<number>,
        reset,
        get resetCount() { return resets; },
        dispose(): void {
            if (disposed) return;
            disposed = true;
            if (timer !== null) { clearInterval(timer); timer = null; }
            if (!isBrowser) return;
            for (const type of ACTIVITY_EVENTS) document.removeEventListener(type, onActivity);
            document.removeEventListener('visibilitychange', onVisibility);
            if (crossTab) window.removeEventListener('storage', onStorage);
        },
    };
}
