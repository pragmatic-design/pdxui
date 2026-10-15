// The press outside a floating element that closes it (#427).
//
// Eight components added this listener from a `setTimeout`, so that the press that opened them would
// not close them again. The timer outlived a component left open: pdx-split-button's fired after a
// test file's environment was torn down (#382). And a press is not the only way in — an app can call
// a component's `open()` from its own mousedown handler, and a listener added to `document` while
// that mousedown is still on its way up would receive it.
//
// So the listener is added at once, and ignores every press already under way when it was added: an
// event's `timeStamp` and `performance.now()` read the same clock, and the press that opened the
// component is older than the opening. Nothing is left pending.

export interface PressOutsideOptions {
    /** `mousedown` (the default), or `pointerdown`. */
    type?: 'mousedown' | 'pointerdown';
    /** Listen in the capture phase, so a handler that stops the press cannot hide it. */
    capture?: boolean;
    /** Whether the press landed on the component itself: its trigger, its panel. */
    inside(target: Node): boolean;
    /** What a press outside does: close. */
    outside(e: MouseEvent): void;
}

/** Listen for a press outside, from now on. Returns what removes the listener. */
export function onPressOutside(options: PressOutsideOptions): () => void {
    const type = options.type ?? 'mousedown';
    const capture = options.capture ?? false;
    const since = performance.now();
    const handler = (e: Event): void => {
        // The press that opened the component, still being dispatched.
        if (e.timeStamp < since) return;
        if (options.inside(e.target as Node)) return;
        options.outside(e as MouseEvent);
    };
    document.addEventListener(type, handler, capture);
    return () => document.removeEventListener(type, handler, capture);
}
