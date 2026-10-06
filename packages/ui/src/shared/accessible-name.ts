/**
 * Does the element have something to be called by: an `aria-label`/`aria-labelledby`/`title` of its
 * own, or content that is read — text outside `aria-hidden`, an `alt`, a labelled element?
 * Used to warn about icon-only buttons, which render fine and are announced "button" alone.
 */
export function hasAccessibleName(el: HTMLElement): boolean {
    if (el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || el.getAttribute('title')) return true;
    const read = (node: Node): boolean => {
        if (node.nodeType === Node.TEXT_NODE) return Boolean(node.textContent?.trim());
        if (!(node instanceof Element) || node.getAttribute('aria-hidden') === 'true') return false;
        if (node.getAttribute('aria-label') || node.getAttribute('alt') || node.getAttribute('title')) return true;
        return [...node.childNodes].some(read);
    };
    return [...el.childNodes].some(read);
}
