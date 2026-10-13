// Event delegation for compiled templates (#113).
//
// A list of 1,000 rows with a clickable cell held 1,000 listeners, each with its closure. The compiler
// now stores a row's handler on its element instead, with `delegate`, and the component listens once
// per event type: the listener walks the event's path from its target up to the component, calling
// each handler this component stored, inner first — the order of the DOM, as direct listeners ran.
// A handler that stops propagation stops the walk, and the event, as it did. While a handler runs,
// `event.currentTarget` is the element it is on, so a handler reads it as it did.
//
// The listener is on the component's shadow root when it has one: an event that is not composed —
// `change`, `input` from a form control — does not cross the shadow boundary to the host.

/** The handlers a component stored on an element, by event type. */
const HANDLERS = Symbol('pdx.delegated');

interface Stored {
    /** The component whose listener calls it: a nested component's elements are not this one's. */
    owner: Element;
    handler: (event: Event) => void;
}

type Delegating = Element & { [HANDLERS]?: Map<string, Stored> };

/** The event types each component already listens to. */
const listening = new WeakMap<Element, Set<string>>();

/**
 * Store `handler` for events of `type` on `el`, an element `host` rendered, and make sure `host`
 * listens to `type` once.
 */
export function delegate(host: Element, el: Element, type: string, handler: (event: Event) => void): void {
    const target = el as Delegating;
    (target[HANDLERS] ??= new Map()).set(type, { owner: host, handler });
    let types = listening.get(host);
    if (!types) listening.set(host, (types = new Set()));
    if (types.has(type)) return;
    types.add(type);
    const root: Node = host.shadowRoot ?? host;
    root.addEventListener(type, (event) => dispatch(host, root, type, event));
}

/** Call, from the target up to `root`, every handler `host` stored for `type`. */
function dispatch(host: Element, root: Node, type: string, event: Event): void {
    for (const node of event.composedPath()) {
        if (node === root) return;
        const stored = (node as Delegating)[HANDLERS]?.get(type);
        if (!stored || stored.owner !== host) continue;
        // The element the handler is written on, as a direct listener would have seen it.
        Object.defineProperty(event, 'currentTarget', { value: node, configurable: true });
        try {
            stored.handler(event);
        } finally {
            delete (event as { currentTarget?: unknown }).currentTarget;
        }
        if (event.cancelBubble) return;
    }
}
