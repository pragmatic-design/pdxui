// A disabled host swallows clicks before any listener the app bound on it can run.
//
// Button-like components disable their inner native control, but the app's `@click` sits on the
// HOST element. A click on the host's own box never touches the inner control, and in Chromium a
// click reaches the ancestors of a disabled control anyway — so the handler would run on a
// disabled «Next» and save twice on a «Save» in its loading state.
//
// The listener is registered in the CAPTURE phase on the host: for a click on a descendant it runs
// before the event reaches the target; for a click on the host itself, capture listeners at the
// target run before its bubble listeners. stopImmediatePropagation keeps every later listener,
// the app's included, from seeing it.

/**
 * Stop clicks at `host` while `isDisabled()` is true. Returns the teardown — hand it to
 * `ctx.track(() => guardDisabledClicks(...))` so it is removed on disconnect.
 */
export function guardDisabledClicks(host: HTMLElement, isDisabled: () => boolean): () => void {
    const onClick = (e: Event) => {
        if (!isDisabled()) return;
        e.preventDefault();
        e.stopImmediatePropagation();
    };
    host.addEventListener('click', onClick, { capture: true });
    return () => host.removeEventListener('click', onClick, { capture: true });
}
