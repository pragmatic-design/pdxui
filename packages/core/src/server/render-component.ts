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
import { isDeferredTemplate } from './mode';
import { isDeferredBlock } from '../renderer/deferred-block';
import { setServerParent } from './dom-shim';

/** The hosts whose content is being rendered, innermost last: a host built now is the last one's child. */
const rendering: HTMLElement[] = [];

/**
 * Whether `value` is what a render returns while templates are not built: a template, or a helper's
 * block — a component's render may return a `when()` alone.
 */
function isDeferredContent(value: unknown): boolean {
    return isDeferredTemplate(value) || isDeferredBlock(value);
}

/** A component the server could not render, and why. */
export interface SkippedComponent {
    tag: string;
    reason: string;
    /**
     * The global its setup or render read that Node does not have — `window`, `document`,
     * `localStorage` — when that is why (#160). A static build stops on it: the read belongs in
     * onMount, or behind `typeof window !== 'undefined'`.
     */
    global?: string;
    /** Where it read it: the first frame of the error's stack — the source's, where source maps are on. */
    at?: string;
}

/** What a host renders as: its attributes after its body ran, and its content. */
export interface RenderedHost {
    attributes: Map<string, string | null>;
    inner: string;
    /** It could not be rendered on the server and is an empty host, reported in `skipped`. */
    skipped: boolean;
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
        return { attributes: new Map(attributes), inner: '', skipped: true };
    }
    if (!(host instanceof PdxElement)) return null;
    // Its parent, before its setup runs: an inject() there looks up through it.
    setServerParent(host, rendering[rendering.length - 1] ?? null);
    for (const [name, value] of attributes) host.setAttribute(name, value ?? '');
    for (const [name, value] of props) assignBoundProperty(host, name, value);
    // What connectedCallback writes before the body runs: the boundary a parent's scoped style stops at.
    host.setAttribute('data-pdx-root', '');
    let rendered: unknown = null;
    let failed = false;
    const [, dispose] = collectDisposers(() => {
        try {
            rendered = untracked(() => host.body());
        } catch (error) {
            const global = undefinedGlobal(error);
            const at = global ? firstFrame(error) : null;
            skipped.push(global ? { tag, reason: message(error), global, ...(at ? { at } : {}) } : { tag, reason: message(error) });
            rendered = null;
            failed = true;
        }
    });
    let markup = '';
    try {
        if (rendered !== null && !isDeferredContent(rendered)) {
            // A render that built DOM itself, or the error the client draws for a failed setup.
            skipped.push({ tag, reason: 'its render built DOM instead of returning an html`` template or a helper\'s block' });
            failed = true;
        } else if (rendered !== null) {
            // The hosts its content builds — its template's, and the children it projects — are its.
            rendering.push(host);
            try {
                markup = inner(rendered);
            } finally {
                rendering.pop();
            }
        }
    } finally {
        dispose();
    }
    const out = new Map<string, string | null>();
    for (const name of host.getAttributeNames()) out.set(name, host.getAttribute(name));
    return { attributes: out, inner: markup, skipped: failed };
}

/**
 * The name a `ReferenceError` says is not defined — on the server, a global of the browser the
 * component reached for: in the browser the same name resolves.
 */
function undefinedGlobal(error: unknown): string | null {
    if (!(error instanceof ReferenceError)) return null;
    // Match: V8's `<name> is not defined`. Groups: [1]=the name
    const m = /^([A-Za-z_$][\w$]*) is not defined$/.exec(error.message);
    return m ? m[1] : null;
}

/** The place the first frame of an error's stack names, without the function's name: `file:line:column`. */
function firstFrame(error: unknown): string | null {
    if (!(error instanceof Error)) return null;
    const frame = (error.stack ?? '').split('\n').find((line) => /^\s+at /.test(line));
    if (!frame) return null;
    // Match: `at name (place)` or `at place`. Groups: [1]=the place
    const m = /\(([^)]+)\)\s*$/.exec(frame) ?? /^\s+at (.+)$/.exec(frame);
    return m ? m[1].trim() : null;
}

function message(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
