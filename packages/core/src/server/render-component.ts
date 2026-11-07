// A component rendered to a string (#160): the real component, constructed and run as the client runs
// it. Its class is the one `component()` registered — in Node on the server DOM (dom-shim.ts) — and
// its `body()` is the client's own: props from the attributes and properties its parent gave it, the
// host's declared bindings, setup, render. Nothing of that is written twice. What the server does
// differently is only what it cannot do: the host is never connected, so no mount callback runs, and
// the effects the body created are disposed once its markup is written.
//
// A component whose setup or render needs what the server DOM does not have — `document`, `window`,
// building elements by hand, querying a tree — throws there. It renders as an empty host and is
// reported with the reason: that is the developer's signal to move the browser work into onMount.

import { collectDisposers, untracked } from '../reactivity/signal';
import { PdxElement } from '../component/element';
import { assignBoundProperty } from '../renderer/template';
import { isDeferredContent } from './mode';

/** A component the server could not render, and why. */
export interface SkippedComponent {
    tag: string;
    reason: string;
}

/** What a host renders as: its attributes after its body ran, and its content. */
export interface RenderedHost {
    attributes: Map<string, string | null>;
    inner: string;
}

/**
 * Render the component `tag` with the attributes and properties its parent bound. `inner` renders
 * what the body returned, with this host's projection. Null when `tag` is not a component of the
 * framework — an unknown element or one not defined here — which the caller renders as plain markup.
 */
export function renderHost(
    tag: string,
    attributes: ReadonlyMap<string, string | null>,
    props: ReadonlyMap<string, unknown>,
    inner: (rendered: unknown) => string,
    skipped: SkippedComponent[],
): RenderedHost | null {
    const Ctor = typeof customElements === 'undefined' ? undefined : customElements.get(tag);
    if (!Ctor) return null;
    let host: HTMLElement;
    try {
        host = new Ctor();
    } catch (error) {
        skipped.push({ tag, reason: `its constructor threw: ${message(error)}` });
        return { attributes: new Map(attributes), inner: '' };
    }
    if (!(host instanceof PdxElement)) return null;
    for (const [name, value] of attributes) host.setAttribute(name, value ?? '');
    for (const [name, value] of props) assignBoundProperty(host, name, value);
    // What connectedCallback writes before the body runs: the boundary a parent's scoped style stops at.
    host.setAttribute('data-pdx-root', '');
    let rendered: unknown = null;
    const [, dispose] = collectDisposers(() => {
        try {
            rendered = untracked(() => host.body());
        } catch (error) {
            skipped.push({ tag, reason: message(error) });
            rendered = null;
        }
    });
    let markup = '';
    try {
        if (rendered !== null && !isDeferredContent(rendered)) {
            // A render that built DOM itself, or the error the client draws for a failed setup.
            skipped.push({ tag, reason: 'its render built DOM instead of returning an html`` template or a helper\'s block' });
        } else if (rendered !== null) {
            markup = inner(rendered);
        }
    } finally {
        dispose();
    }
    const out = new Map<string, string | null>();
    for (const name of host.getAttributeNames()) out.set(name, host.getAttribute(name));
    return { attributes: out, inner: markup };
}

function message(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
