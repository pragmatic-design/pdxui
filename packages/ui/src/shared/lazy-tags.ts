// The components a component creates from code on a user's action — an editor when a cell is
// edited, a dialog when a record is opened — loaded the first time one is created, not with the
// component (#407).
//
// pdx-data-grid imported all six of these with itself, so a list that never edits fetched ~40 KB of
// editors before its first screen. An element created before its module has arrived is an ordinary
// unknown element until then: `customElements` upgrades it when the definition lands, keeping the
// properties set on it meanwhile (core's component() reads them back at upgrade). What cannot wait
// for the upgrade — the focus — waits for `loadTag()`.

const LOADERS = {
    'pdx-input': () => import('../input/pdx-input'),
    'pdx-number-input': () => import('../number-input/pdx-number-input'),
    'pdx-select': () => import('../select/pdx-select'),
    'pdx-date-picker': () => import('../date-picker/pdx-date-picker'),
    'pdx-form-field': () => import('../form-field/pdx-form-field'),
    'pdx-dialog': () => import('../dialog/pdx-dialog'),
} as const;

export type LazyTag = keyof typeof LOADERS;

/** Resolves once `tag` is defined, loading its module the first time it is asked for. */
export function loadTag(tag: LazyTag): Promise<void> {
    if (customElements.get(tag)) return Promise.resolve();
    // Kept until it settles, for `settlePrefetches()`: a load `createLazy()` started is one nobody
    // awaits either (#745). `finally` passes a failed load on to the caller, as before.
    const load: Promise<void> = LOADERS[tag]().then(() => customElements.whenDefined(tag))
        .then(() => undefined).finally(() => loading.delete(load));
    loading.add(load);
    return load;
}

/** `document.createElement(tag)`, with the module that defines it asked for. */
export function createLazy<T extends HTMLElement = HTMLElement>(tag: LazyTag): T {
    void loadTag(tag);
    return document.createElement(tag) as T;
}

// The prefetches waiting for idle time, and every load `loadTag()` started: nobody awaits either, so
// a test environment torn down under them failed its run (#603, #745). `settlePrefetches()` waits.
const scheduled = new Set<() => void>();
const loading = new Set<Promise<void>>();

/** Load `tags` once the browser is idle: what a component will need before its user asks. */
export function prefetchTags(tags: readonly LazyTag[]): void {
    const run = () => {
        if (!scheduled.delete(run)) return;
        // A failed load is passed on unhandled, as the bare `loadTag()` did.
        for (const tag of tags) void loadTag(tag);
    };
    scheduled.add(run);
    if (typeof requestIdleCallback === 'function') requestIdleCallback(run, { timeout: 2000 });
    else setTimeout(run, 0);
}

/**
 * Starts every prefetch still waiting for idle time, and resolves once every load — prefetched, or
 * started by `createLazy()` — has settled. For a test environment, which must not be torn down while a module is still loading.
 */
export async function settlePrefetches(): Promise<void> {
    for (const run of [...scheduled]) run();
    await Promise.allSettled([...loading]);
}
