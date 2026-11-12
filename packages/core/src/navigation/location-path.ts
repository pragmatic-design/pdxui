// The path of the page in front of you, held where a component can read it (#1023).
//
// `<pdx-app-shell>` lights the navigation entry of the current page and notes the lists you open, so
// it needs the current path. The router has it, and `@pdxui/ui` must not depend on `@pdxui/router`:
// the path lives HERE, as a registry, the arrangement `route-trail.ts` uses for `<pdx-breadcrumb>`.
// The router names its own path as the source when it loads (`setLocationSource`); a component
// reads `locationPath()`. Both halves keep their dependency on core alone.
//
// With no router there is no source, and the path is the address bar's, followed across the back
// and forward buttons. A `history.pushState` an app makes by hand fires no event, so such an app
// names its own source.
//
// No work at load: the `popstate` listener is added at the first read that needs it, so a bundle
// that never reads the path drops this module.

import { signal } from '../reactivity/signal';

const _source = signal<(() => string) | null>(null);
const _address = signal('/');
let _listening = false;

/** The address bar's path, followed across the back and forward buttons from the first read. */
function addressPath(): string {
    if (!_listening && typeof window !== 'undefined') {
        _listening = true;
        _address.set(location.pathname);
        window.addEventListener('popstate', () => _address.set(location.pathname));
    }
    return _address();
}

/**
 * The current path: the router's when it runs, else the address bar's. Reactive: a reader re-runs on
 * every navigation, and when a source is named after it first read.
 */
export function locationPath(): string {
    const source = _source();
    return source ? source() : addressPath();
}

/**
 * Name where the current path comes from: `@pdxui/router` does, when it loads. An application with a
 * router of its own passes its path signal; `null` goes back to the address bar.
 */
export function setLocationSource(source: (() => string) | null): void {
    // A function is the VALUE here, not an updater (see `setRaw`).
    _source.setRaw(source);
    // Back to the address bar: read it again, it may have moved while a source held the path.
    if (!source && _listening) _address.set(location.pathname);
}
