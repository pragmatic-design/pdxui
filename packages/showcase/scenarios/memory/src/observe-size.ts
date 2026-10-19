/**
 * An attachment with something to release: a ResizeObserver on the element, disconnected by its
 * cleanup. Left connected, the observer keeps the element — and the row it belongs to — alive.
 */
export function observeSize(el: Element): () => void {
    const observer = new ResizeObserver(() => {});
    observer.observe(el);
    return () => observer.disconnect();
}
