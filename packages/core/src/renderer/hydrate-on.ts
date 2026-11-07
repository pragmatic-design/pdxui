// `@hydrate (trigger) { … }` (#160, part 4d): a part of a generated page that the client takes over
// later, when its trigger fires, instead of at boot. Until then the server's markup stands as it was
// written, readable and still — no binding, no handler — and the first event on it hydrates the part
// at once and is dispatched again on the same element (hydrate/later.ts).
//
// Mounted, with no server markup to take over, there is nothing to put off: the content renders as
// it would without the block, between the markers the server writes, so a page mounted and a page
// hydrated end as the same nodes.

import { isDeferring, deferredBlock } from './deferred-block';

/** When the part is taken over: the triggers of `@defer`, as `@defer` reads them. */
export interface HydrateOnOptions {
    /** `viewport`, `idle`, `idle(2000)`, `interaction`, `timer(1000)`, `immediate`, combined with `|`. */
    trigger?: string;
    /** A trigger too (`when (expr)`): fires the first time it is truthy. */
    when?: () => unknown;
}

/** The content `renderFn` makes, taken over when a trigger in `options` fires if the page was generated. */
export function hydrateOn(options: HydrateOnOptions, renderFn: () => Node | DocumentFragment): DocumentFragment {
    // Rendered to a string or hydrating (#160): the call, for the code that writes or adopts the block.
    if (isDeferring()) return deferredBlock((v) => v.hydrateOn(options, renderFn));
    const frag = document.createDocumentFragment();
    frag.appendChild(document.createComment('hydrate'));
    frag.appendChild(renderFn());
    frag.appendChild(document.createComment('/hydrate'));
    return frag;
}
