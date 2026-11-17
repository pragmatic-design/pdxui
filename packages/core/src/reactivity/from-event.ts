// DOM event → Signal bridge.
// Converts any DOM event into a reactive signal, auto-disposed with component lifecycle.
// Beats RxJS fromEvent: no subscribe/unsubscribe, auto-tracked in computed/effect.

import { signal, effect, onCleanup } from './signal';
import type { ReadonlySignal, Dispose } from '../utils/types';

// ─── Types ─────────────────────────────────────────────────────────

export interface FromEventOptions<T> {
    /** Transform the event before storing. Default: identity. */
    transform?: (event: Event) => T;
    /** addEventListener options (capture, passive, once). */
    eventOptions?: AddEventListenerOptions;
}

type DisposableSignal<T> = ReadonlySignal<T> & { dispose: Dispose };

// ─── fromEvent() ───────────────────────────────────────────────────

/**
 * Create a signal that updates on every DOM event.
 *
 * Usage:
 *   const clicks = fromEvent(buttonRef, 'click');
 *   effect(() => console.log('Clicked!', clicks()));
 *
 *   const value = fromEvent(inputRef, 'input', { transform: e => (e.target as HTMLInputElement).value });
 *   const deb = debounced(() => value(), 300); // compose with other operators
 */
export function fromEvent<T = Event>(
    target: EventTarget | (() => EventTarget | null),
    eventName: string,
    options?: FromEventOptions<T> | ((event: Event) => T),
): DisposableSignal<T> {
    const opts: FromEventOptions<T> = typeof options === 'function'
        ? { transform: options }
        : (options ?? {});

    const transform = opts.transform ?? ((e: Event) => e as unknown as T);
    const _value = signal<T>(undefined as T);

    const handler = (event: Event) => {
        _value.set(transform(event) as never);
    };

    let currentTarget: EventTarget | null = null;

    function attach(el: EventTarget): void {
        el.addEventListener(eventName, handler, opts.eventOptions);
        currentTarget = el;
    }

    function detach(): void {
        if (currentTarget) {
            currentTarget.removeEventListener(eventName, handler, opts.eventOptions);
            currentTarget = null;
        }
    }

    // If target is a getter (e.g. ref signal), track reactively
    let disposeEffect: Dispose | null = null;
    if (typeof target === 'function') {
        disposeEffect = effect(() => {
            const el = (target as () => EventTarget | null)();
            detach();
            if (el) attach(el);
            onCleanup(detach);
        });
    } else if (target) {
        attach(target);
    }

    const readable = (() => _value()) as DisposableSignal<T>;
    readable.peek = () => _value.peek();
    readable.dispose = () => {
        detach();
        if (disposeEffect) disposeEffect();
    };

    return readable;
}

// ─── fromEvents() — multi-event ─────────────────────────────────

/**
 * Listen to multiple events on the same target, merged into one signal. The target is the element or,
 * as for `fromEvent`, a getter for it that is followed: a `:ref` still empty in setup is listened to
 * once it fills (#1158).
 *
 * Usage:
 *   const interaction = fromEvents(el, ['mousedown', 'touchstart', 'pointerdown']);
 *   const focus = fromEvents(() => field, ['focus', 'blur'], { transform: e => e.type });
 */
export function fromEvents<T = Event>(
    target: EventTarget | (() => EventTarget | null),
    eventNames: string[],
    options?: FromEventOptions<T>,
): DisposableSignal<T> {
    const transform = options?.transform ?? ((e: Event) => e as unknown as T);
    const _value = signal<T>(undefined as T);

    const handler = (event: Event) => {
        _value.set(transform(event) as never);
    };

    let currentTarget: EventTarget | null = null;

    function attach(el: EventTarget): void {
        for (const name of eventNames) el.addEventListener(name, handler, options?.eventOptions);
        currentTarget = el;
    }

    function detach(): void {
        if (!currentTarget) return;
        for (const name of eventNames) currentTarget.removeEventListener(name, handler, options?.eventOptions);
        currentTarget = null;
    }

    let disposeEffect: Dispose | null = null;
    if (typeof target === 'function') {
        disposeEffect = effect(() => {
            const el = target();
            detach();
            if (el) attach(el);
            onCleanup(detach);
        });
    } else if (target) {
        attach(target);
    }

    const readable = (() => _value()) as DisposableSignal<T>;
    readable.peek = () => _value.peek();
    readable.dispose = () => {
        detach();
        if (disposeEffect) disposeEffect();
    };

    return readable;
}
