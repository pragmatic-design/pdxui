// Event delegation for compiled templates (#113).
//
// A list of 1,000 rows with a clickable cell held 1,000 listeners. The compiler now stores a row's
// handler on its element instead, with `delegate`, and the component listens once per event type: the
// listener walks the event's path from its target up to the component, calling each handler this
// component stored, inner first — the order of the DOM, as direct listeners ran. A handler that stops
// propagation stops the walk, and the event, as it did. While a handler runs, `event.currentTarget` is
// the element it is on, so a handler reads it as it did.
//
// What an element carries is two plain properties — its handler for the type, and the component that
// stored it — not a map: per row, that is the whole cost, and a listener's own cost is what it saves.
//
// The listener is on the component's shadow root when it has one: an event that is not composed —
// `change`, `input` from a form control — does not cross the shadow boundary to the host.

/** The property holding an element's handler for one event type: `__pdx_on_click`. */
const ON = '__pdx_on_';
/** The property holding the component that stored an element's handlers. */
const OWNER = '__pdx_owner';

type Delegating = Element & Record<string, unknown>;

/** The event types each component already listens to. */
const listening = new WeakMap<Element, Set<string>>();

/**
 * Store `handler` for events of `type` on `el`, an element `host` rendered, and make sure `host`
 * listens to `type` once.
 */
export function delegate(host: Element, el: Element, type: string, handler: (event: Event) => void): void {
    const target = el as Delegating;
    target[ON + type] = handler;
    target[OWNER] = host;
    let types = listening.get(host);
    if (!types) listening.set(host, (types = new Set()));
    if (types.has(type)) return;
    types.add(type);
    const root: Node = host.shadowRoot ?? host;
    root.addEventListener(type, (event) => dispatch(host, root, ON + type, event));
}

/** Call, from the target up to `root`, every handler `host` stored under `key`. */
function dispatch(host: Element, root: Node, key: string, event: Event): void {
    for (const node of event.composedPath()) {
        if (node === root) return;
        const el = node as Delegating;
        const handler = el[key] as ((event: Event) => void) | undefined;
        // A nested component's elements carry their own owner: its listener calls them, not this one.
        if (!handler || el[OWNER] !== host) continue;
        // The element the handler is written on, as a direct listener would have seen it.
        Object.defineProperty(event, 'currentTarget', { value: node, configurable: true });
        try {
            handler(event);
        } finally {
            delete (event as { currentTarget?: unknown }).currentTarget;
        }
        if (event.cancelBubble) return;
    }
}
