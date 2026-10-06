// A group that re-emits its children's event under the same name: the child's event must not reach
// the group's host.
//
// pdx-checkbox-group and pdx-radio-group both emit `pdx-change`, and so do their children. Stopping
// the child's event at the host is too late: `stopPropagation` there still runs every other listener
// on the host (pdx-checkbox-group's author would get two events per click, the second without
// `values`), and `stopImmediatePropagation` spares the ones added before the group's own — code that
// creates the group, listens, then appends it, before setup has run.
//
// So the event is stopped AT THE CHILD, after the child's own listeners: on its way down (capture, at
// the host) the group adds a one-shot listener to the child, which runs last there — a listener added
// before the event reaches its target is part of that dispatch — and handles and stops the event.

/**
 * Handles the `type` events of `host`'s children with `handle`, and keeps them from bubbling past the
 * child. `isChild` picks the children the group owns. Returns the teardown.
 */
export function interceptChildEvent(
    host: HTMLElement,
    type: string,
    isChild: (target: Element) => boolean,
    handle: (e: CustomEvent) => void,
): () => void {
    function atChild(e: Event): void {
        e.stopPropagation();
        handle(e as CustomEvent);
    }
    function onCapture(e: Event): void {
        const target = e.target as Element | null;
        if (!target || target === host || !isChild(target)) return;
        target.addEventListener(type, atChild, { once: true });
    }
    host.addEventListener(type, onCapture, true);
    return () => host.removeEventListener(type, onCapture, true);
}
