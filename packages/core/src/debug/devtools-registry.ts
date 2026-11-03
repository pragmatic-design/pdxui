// What a component's setup created that `__PDX_DEVTOOLS__` v2 describes (#298): its async sources, its
// `@action`s and its forms, each kept against the component whose setup made it.
//
// A leaf module, imported by the runtimes that register (resource, createForm) and by the compiled
// `@action` line: it imports nothing, so registering cannot pull the devtools into a module graph. Every
// call is behind `if (DEV)` at its call site, and a production bundle drops this module with them.

/** The components whose setup is running, innermost last: who a source, an action or a form belongs to. */
export const setupOwners: object[] = [];

export type DevEntryKind = 'source' | 'action' | 'form';

/** One thing a setup made, as the devtools read it. */
export interface DevEntry {
    kind: DevEntryKind;
    /** The object the setup holds: a resource or a query, a mutation, a form. */
    target: object;
    /** The name the setup gave it: the variable its returned object holds it under. */
    name?: string;
    /** A source's cache key, read when it was created. */
    key?: string;
    /** An action's parameter, as a JSON schema (development builds, #298). */
    schema?: unknown;
    /**
     * A form's fields, by name, as the form lists them when asked. Handed over by the form: reading
     * them here would make this module import the form runtime.
     */
    fields?: () => [string, unknown][];
}

const byOwner = new WeakMap<object, DevEntry[]>();

function entriesOf(owner: object): DevEntry[] {
    let list = byOwner.get(owner);
    if (!list) {
        list = [];
        byOwner.set(owner, list);
    }
    return list;
}

/** The setup that is running, or null outside one. */
function currentOwner(): object | null {
    return setupOwners[setupOwners.length - 1] ?? null;
}

/** A setup begins again (a reconnect): what the last one registered is gone with it. */
export function devForgetOwned(owner: object): void {
    byOwner.delete(owner);
}

/** A source was created; inside a component's setup it belongs to that component. */
export function devTrackSource(target: object, key: string): void {
    const owner = currentOwner();
    if (owner) entriesOf(owner).push({ kind: 'source', target, key });
}

/** A form was created, with how to list its fields; inside a component's setup it belongs to that component. */
export function devTrackForm(target: object, fields: () => [string, unknown][]): void {
    const owner = currentOwner();
    if (owner) entriesOf(owner).push({ kind: 'form', target, fields });
}

/**
 * What a setup holds instead of `from`: `useQuery` returns its own object over the resource it made,
 * and that object is the one the setup names.
 */
export function devRetarget(from: object, to: object): void {
    const owner = currentOwner();
    const entry = owner ? byOwner.get(owner)?.find((e) => e.target === from) : undefined;
    if (entry) entry.target = to;
}

/**
 * A compiled `@action` (#298): the mutation it made, its name, and its parameter's schema. Emitted by
 * the compiler after the action's line in a development build.
 */
export function devAction(target: object, name: string, schema: unknown): void {
    const owner = currentOwner();
    if (!owner) return;
    entriesOf(owner).push({ kind: 'action', target, name, schema });
}

/** The setup returned `result`: each registered object it holds gets the name it is held under. */
export function devNameOwned(owner: object, result: unknown): void {
    const list = byOwner.get(owner);
    if (!list || !result || typeof result !== 'object') return;
    for (const [name, value] of Object.entries(result as Record<string, unknown>)) {
        const entry = list.find((e) => e.target === value && e.name === undefined);
        if (entry) entry.name = name;
    }
}

/** What `owner`'s setup registered, in creation order. */
export function devOwnedEntries(owner: object): readonly DevEntry[] {
    return byOwner.get(owner) ?? [];
}
