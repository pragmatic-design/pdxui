// What a route loader can say besides its data (#147): `throw redirect('/login')` sends the navigation
// elsewhere, `throw notFound()` ends it on the level's not-found page. Both are Errors, so a loader
// that does not know them — or code between it and the router — still sees something thrown.
//
// The router recognises them by a marker, `pdxOutcome`, not by `instanceof`: these constructors are
// then imported only by the loaders that throw them, in their own chunks, and stay out of the entry
// that every page waits for.

/** Thrown by a loader: go to `to` instead of the route being entered. */
export interface LoaderRedirect extends Error {
    readonly pdxOutcome: 'redirect';
    readonly to: string;
    /** Replace the abandoned target's history entry (the default), or keep it. */
    readonly replace: boolean;
}

/** Thrown by a loader: there is nothing at this address for its level. */
export interface LoaderNotFound extends Error {
    readonly pdxOutcome: 'notFound';
}

/**
 * `throw redirect('/login')` in a route loader: the router navigates to `to` before the current
 * navigation is published, and the route that redirected never renders. With `replace` (the default)
 * the abandoned target leaves no history entry; `{ replace: false }` keeps it.
 */
export function redirect(to: string, options: { replace?: boolean } = {}): LoaderRedirect {
    return Object.assign(new Error(`redirect to ${to} thrown by a route loader`), {
        pdxOutcome: 'redirect' as const, to, replace: options.replace ?? true,
    });
}

/**
 * `throw notFound()` in a route loader: the level renders its not-found page — the levels above it
 * stay — and the address is unchanged.
 */
export function notFound(): LoaderNotFound {
    // For a developer reading `loaderError(path)`; the visitor reads the router's `notFound` string.
    return Object.assign(new Error('notFound() thrown by a route loader'), { pdxOutcome: 'notFound' as const });
}

/** The outcome a thrown value carries, if it is one of the above. */
export function outcomeOf(thrown: unknown): LoaderRedirect | LoaderNotFound | null {
    const kind = (thrown as { pdxOutcome?: unknown } | null)?.pdxOutcome;
    return kind === 'redirect' || kind === 'notFound' ? thrown as LoaderRedirect | LoaderNotFound : null;
}
