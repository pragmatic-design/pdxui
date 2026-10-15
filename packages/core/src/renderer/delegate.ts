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
// A row's handler is one function for every row of its @for (#375): the compiler declares it once,
// outside the row, and the row stores with it its scope — the names the row binds (its item getter,
// its index, an outer row's), the value itself when there is one name, an array when there are more.
// The handler receives the scope after the event. Built per row, it was three closures a row.
//
// The listener is on the component's shadow root when it has one: an event that is not composed —
// `change`, `input` from a form control — does not cross the shadow boundary to the host.

/** The property holding an element's handler for one event type: `__pdx_on_click`. */
const ON = '__pdx_on_';
/** The property holding the scope an element's handler for one event type is called with: `__pdx_in_click`. */
const IN = '__pdx_in_';
/** The property holding the component that stored an element's handlers. */
const OWNER = '__pdx_owner';

type Delegating = Element & Record<string, unknown>;

/** The event types each component already listens to. */
const listening = new WeakMap<Element, Set<string>>();

/**
 * Store `handler` for events of `type` on `el`, an element `host` rendered, and make sure `host`
 * listens to `type` once. With a `scope`, the handler is called with it after the event: a row's
 * handler, shared by every row, reads the row from it (#375).
 */
export function delegate(
    host: Element, el: Element, type: string,
    handler: (event: Event, scope?: unknown) => void, scope?: unknown,
): void {
    const target = el as Delegating;
    target[ON + type] = handler;
    if (scope !== undefined) target[IN + type] = scope;
    target[OWNER] = host;
    let types = listening.get(host);
    if (!types) listening.set(host, (types = new Set()));
    if (types.has(type)) return;
    types.add(type);
    const root: Node = host.shadowRoot ?? host;
    root.addEventListener(type, (event) => dispatch(host, root, type, event));
}

/** Call, from the target up to `root`, every handler `host` stored for `type`. */
function dispatch(host: Element, root: Node, type: string, event: Event): void {
    const key = ON + type, scopeKey = IN + type;
    for (const node of event.composedPath()) {
        if (node === root) return;
        const el = node as Delegating;
        const handler = el[key] as ((event: Event, scope?: unknown) => void) | undefined;
        // A nested component's elements carry their own owner: its listener calls them, not this one.
        if (!handler || el[OWNER] !== host) continue;
        // The element the handler is written on, as a direct listener would have seen it.
        Object.defineProperty(event, 'currentTarget', { value: node, configurable: true });
        try {
            // Only a handler stored with a scope gets a second argument: a handler written as a bare
            // reference, `@click="toggle"`, is called with the event alone, as a listener calls it.
            const scope = el[scopeKey];
            if (scope === undefined) handler(event);
            else handler(event, scope);
        } finally {
            delete (event as { currentTarget?: unknown }).currentTarget;
        }
        if (event.cancelBubble) return;
    }
}
