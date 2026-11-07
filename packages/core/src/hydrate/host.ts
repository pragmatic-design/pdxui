// A pre-rendered component taking over its markup (#160, part 4). Installed by the app that hydrates
// (installHydration): element.ts calls it from the connect of a host marked `data-pdx-ssr`, inside the
// component's own scope, so that what the adoption binds is the component's.
//
// The host's slots received its parent's nodes, which stay where they are: they are its light
// children, and the parent binds them. When the markup is not the render, what the adoption bound is
// disposed, the host is left holding those children alone, and it mounts as it would have without the
// build — in development, saying which component and where the markup differed.

import { installHostHydration, type HydratingHost } from '../component/element';
import { collectDisposers, onDispose } from '../reactivity/signal';
import { DEV } from '../utils/env';
import { adoptPartValue, hydrateChildren } from './adopt';
import { regionNodes, regionsOf, release as releaseRegion, takeRegions } from './regions';
import { installPartAdoption } from './compiled';
import { replay, waitForTrigger } from './later';

/** Hydrate pre-rendered components from now on, instead of rendering them over their markup. */
export function installHydration(): void {
    installHostHydration({ adopt: adoptHost, waits, release });
    installPartAdoption(adoptPartValue);
}

/** The pre-rendered hosts waiting for an ancestor, by that ancestor. */
const waiting = new WeakMap<Element, HydratingHost[]>();

/**
 * A pre-rendered host under a pre-rendered ancestor not hydrated yet waits for it: what the ancestor
 * passes it — a prop is a property, not in the markup — is bound when the ancestor adopts its render.
 * Components upgrade in the order their definitions run, so a child can connect first.
 */
function waits(host: HydratingHost): boolean {
    if (!host.hasAttribute('data-pdx-ssr')) return false;
    const ancestor = host.parentElement?.closest('[data-pdx-ssr]');
    if (ancestor) {
        const list = waiting.get(ancestor);
        if (list) list.push(host);
        else waiting.set(ancestor, [host]);
        return true;
    }
    return waitsForTrigger(host);
}

/** The generated hosts whose `@hydrate` trigger has fired, or is being waited for: what stops the wait. */
const triggered = new WeakSet<HydratingHost>();
const armed = new WeakMap<HydratingHost, () => void>();

/**
 * A host whose component says `@hydrate trigger;` (#160, part 4d) is taken over when the trigger fires,
 * or at the first event on it, which is dispatched again once it is live. Until then it stands as the
 * server wrote it, and the hosts inside it wait for it as for any ancestor not hydrated yet.
 */
function waitsForTrigger(host: HydratingHost): boolean {
    const options = host._hydrateLater;
    if (!options || triggered.has(host)) return false;
    if (armed.has(host)) return true;
    armed.set(host, waitForTrigger({
        listener: host,
        inPart: (target) => target instanceof Node && host.contains(target),
        elements: () => [host],
    }, options, null, (first) => {
        armed.delete(host);
        // Gone from the page before its trigger: it waits again when it comes back.
        if (!host.isConnected) return;
        triggered.add(host);
        host.connectedCallback();
        if (first) replay(first);
    }));
    return true;
}

/** `host` has mounted: the hosts that waited for it connect again, now that it has bound them. */
function release(host: HydratingHost): void {
    const list = waiting.get(host);
    if (!list) return;
    waiting.delete(host);
    for (const child of list) if (child.isConnected) child.connectedCallback();
}

function adoptHost(host: Element, render: () => unknown): { light: Node[]; slots: Element[] } | null {
    const regions = regionsOf(host);
    host.removeAttribute('data-pdx-ssr');
    // A component the server could not render has no markup of its own to take over, only the light
    // DOM its parent gave it (the region `*`): it mounts with it, as it would have without the build.
    if (regions.has('*')) {
        host.replaceChildren(...takeRegions(host));
        return null;
    }
    // Taken now: the regions' markers go as the walks finish with them.
    const light = [...regions.values()].flatMap(regionNodes);
    const [slots, dispose] = collectDisposers(() => {
        try {
            return hydrateChildren(host, render, regions);
        } catch (error) {
            // A mismatch, or a render that threw: rendered afresh, which shows a real error again.
            if (DEV) console.warn(`[pdx] <${host.localName}> renders afresh: ${error instanceof Error ? error.message : String(error)}`);
            return null;
        }
    });
    if (slots) {
        onDispose(dispose);
        // The component's walk is through its regions — a compiled one steps over them without a word.
        for (const r of regions.values()) releaseRegion(r, 'owner');
        return { light, slots };
    }
    dispose();
    host.replaceChildren(...takeRegions(host));
    return null;
}
