// A pre-rendered component taking over its markup (#160, part 4). Installed by the app that hydrates
// (installHydration): element.ts calls it from the connect of a host marked `data-pdx-ssr`, inside the
// component's own scope, so that what the adoption binds is the component's.
//
// The host's slots received its parent's nodes, which stay where they are: they are its light
// children, and the parent binds them. When the markup is not the render, what the adoption bound is
// disposed, the host is left holding those children alone, and it mounts as it would have without the
// build — in development, saying which component and where the markup differed.

import { installHostHydration } from '../component/element';
import { collectDisposers, onDispose } from '../reactivity/signal';
import { DEV } from '../utils/env';
import { hydrateChildren, regionNodes, regionsOf, takeRegions } from './adopt';

/** Hydrate pre-rendered components from now on, instead of rendering them over their markup. */
export function installHydration(): void {
    installHostHydration({ adopt: adoptHost });
}

function adoptHost(host: Element, render: () => unknown): Node[] | null {
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
    const [adopted, dispose] = collectDisposers(() => {
        try {
            hydrateChildren(host, render, regions);
            return true;
        } catch (error) {
            // A mismatch, or a render that threw: rendered afresh, which shows a real error again.
            if (DEV) console.warn(`[pdx] <${host.localName}> renders afresh: ${error instanceof Error ? error.message : String(error)}`);
            return false;
        }
    });
    if (adopted) {
        onDispose(dispose);
        return light;
    }
    dispose();
    host.replaceChildren(...takeRegions(host));
    return null;
}
