// What a component exposes on its element: methods and getters a parent reaches through a ref, each
// also an invoker command (`commandfor` / `command`). The typed channel and command dispatcher that
// lived here left the public API (#144): `@prop` / `@event` and `@expose` are the ways down and up.

// ─── Invoker commands ─────────────────────────────────────────────

/** The hosts already listening for invoker commands: a re-expose on reconnect adds no second listener. */
const commandHosts = new WeakSet<HTMLElement>();

/**
 * An exposed method is also an invoker command (#140): `<button commandfor="d" command="--show">`
 * makes the browser dispatch a `command` event on `d`, and the component calls its exposed `show()`,
 * with no arguments. A command without the `--` prefix is a built-in one (`show-modal`, `close`), the
 * platform's to handle; a name that is not an exposed function does nothing.
 */
function listenForCommands(element: HTMLElement): void {
    if (commandHosts.has(element)) return;
    commandHosts.add(element);
    element.addEventListener('command', (e) => {
        const command = (e as Event & { command?: unknown }).command;
        if (typeof command !== 'string' || !command.startsWith('--')) return;
        const name = command.slice(2);
        // Only an own, exposed member: `--focus` must not reach HTMLElement.prototype.focus.
        const desc = Object.getOwnPropertyDescriptor(element, name);
        if (desc && typeof desc.value === 'function') (desc.value as () => unknown).call(element);
    });
}

// ─── Expose helper ────────────────────────────────────────────────

/**
 * Expose methods/signals on the host element for parent access via ref.
 * Each entry becomes a read-only, non-configurable own property (external code can't reassign).
 *
 * Copies property DESCRIPTORS (not a spread), so a live `get x()` accessor stays live instead of
 * being snapshotted to its value at expose time — e.g. a component whose `get form()` is filled in
 * after mount keeps returning the current value.
 *
 * Called from component setup: ctx.expose({ showModal, close, isOpen })
 */
export function exposeOnElement(
    element: HTMLElement,
    api: Record<string, unknown>
): void {
    listenForCommands(element);
    for (const [key, desc] of Object.entries(Object.getOwnPropertyDescriptors(api))) {
        // configurable:true so the property can be REDEFINED when the element is disconnected and reconnected
        // (setup re-runs in connectedCallback → expose() runs again). With configurable:false a reconnect — e.g.
        // a drawer portaling its children to <body> — threw "Cannot redefine property". Still getter-only /
        // writable:false, so external code cannot reassign via `el.x = y`.
        if (desc.get || desc.set) {
            // Accessor: keep the getter live, drop any setter → read-only from outside.
            Object.defineProperty(element, key, { get: desc.get, configurable: true, enumerable: true });
        } else {
            Object.defineProperty(element, key, { value: desc.value, writable: false, configurable: true, enumerable: true });
        }
    }
}
