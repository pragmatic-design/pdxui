// __PDX_DEVTOOLS__ v1 — what an agent driving a browser can ask a running app.
//
// The inspector (inspector.ts) is built for a person in the console: its component tree holds live
// DOM nodes, nothing maps a component to its state, and errors are only counted. This is the
// versioned surface an agent reads with `JSON.stringify(__PDX_DEVTOOLS__.inspect('pdx-login'))`:
// every result serialisable, every function available from page load in development with no level
// change. The overlay is a client of it.
//
// Development only. The runtime calls the `dev*` recorders below behind `if (DEV)`, so a production
// bundle carries neither the recorders' calls nor this global.

import { DEV } from '../utils/env';
import { __pdx_debug, connectDevTools } from './inspector';

// ─── Serialisation ────────────────────────────────────────────────

const MAX_DEPTH = 4;
const MAX_ITEMS = 50;

/**
 * A value as JSON can carry it: depth 4, arrays cut at 50 with a `…n more` marker, a function as
 * `[function name]`, a DOM node as `<tag#id>`. A cycle ends at the depth bound like anything else.
 */
export function devSerialise(value: unknown, depth = 0): unknown {
    if (value === null || typeof value === 'boolean' || typeof value === 'string') return value;
    if (typeof value === 'number') return Number.isFinite(value) ? value : String(value);
    if (value === undefined) return null;
    if (typeof value === 'bigint' || typeof value === 'symbol') return String(value);
    if (typeof value === 'function') return `[function ${value.name || 'anonymous'}]`;
    if (typeof Node !== 'undefined' && value instanceof Node) return nodeLabel(value);
    if (value instanceof Date) return value.toISOString();
    if (value instanceof Error) return { name: value.name, message: value.message };
    if (depth >= MAX_DEPTH) return Array.isArray(value) ? '[Array]' : '[Object]';
    if (Array.isArray(value) || value instanceof Set) {
        const items = Array.from(value as Iterable<unknown>);
        const out = items.slice(0, MAX_ITEMS).map((v) => devSerialise(v, depth + 1));
        if (items.length > MAX_ITEMS) out.push(`…${items.length - MAX_ITEMS} more`);
        return out;
    }
    const entries = value instanceof Map ? Array.from(value.entries()) : Object.entries(value as object);
    const out: Record<string, unknown> = {};
    for (const [k, v] of entries.slice(0, MAX_ITEMS)) out[String(k)] = devSerialise(v, depth + 1);
    if (entries.length > MAX_ITEMS) out['…'] = `${entries.length - MAX_ITEMS} more`;
    return out;
}

function nodeLabel(node: Node): string {
    if (!(node instanceof Element)) return `<${node.nodeName.toLowerCase()}>`;
    return `<${node.localName}${node.id ? `#${node.id}` : ''}>`;
}

// ─── Instances: ids, props, setup state ──────────────────────────

type Readable = { peek(): unknown };
interface InstanceRecord { props: Map<string, Readable>; state: Map<string, Readable>; deriveds: Map<string, Readable> }

const instanceIds = new WeakMap<object, number>();
const instancesById = new Map<number, WeakRef<Element>>();
const instanceRecords = new WeakMap<object, InstanceRecord>();
let nextInstanceId = 1;
/** The components whose setup is running, innermost last: who a named signal belongs to. */
const setupOwners: object[] = [];

/** The instance's id, stamped the first time it is asked for — at its first connect. */
export function devInstanceId(el: Element): number {
    let id = instanceIds.get(el);
    if (id === undefined) {
        id = nextInstanceId++;
        instanceIds.set(el, id);
        instancesById.set(id, new WeakRef(el));
    }
    return id;
}

function recordOf(el: object): InstanceRecord {
    let rec = instanceRecords.get(el);
    if (!rec) {
        rec = { props: new Map(), state: new Map(), deriveds: new Map() };
        instanceRecords.set(el, rec);
    }
    return rec;
}

/** A component's setup begins: its props, and the owner the named signals created now belong to. */
export function devSetupBegin(el: object, props: Record<string, Readable>): void {
    const rec = recordOf(el);
    rec.props = new Map(Object.entries(props));
    rec.state.clear();
    rec.deriveds.clear();
    setupOwners.push(el);
}

/** The setup ended — thrown or returned. */
export function devSetupEnd(): void {
    setupOwners.pop();
}

/**
 * A named signal or computed was created. During a component's setup it belongs to that instance,
 * under the variable's name: the compiler names it `file:var`, and the part after the colon is
 * what the author wrote.
 */
export function devOwnedNode(kind: 'state' | 'derived', name: string, node: Readable): void {
    const owner = setupOwners[setupOwners.length - 1];
    if (!owner) return;
    const key = name.slice(name.lastIndexOf(':') + 1);
    const rec = recordOf(owner);
    (kind === 'state' ? rec.state : rec.deriveds).set(key, node);
}

function read(node: Readable): unknown {
    try {
        return devSerialise(node.peek());
    } catch (err) {
        // A computed that throws when read: what it threw IS its state, and the inspection goes on.
        return `[threw: ${err instanceof Error ? err.message : String(err)}]`;
    }
}

function readAll(map: Map<string, Readable>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [k, v] of map) out[k] = read(v);
    return out;
}

function fileOf(el: Element): string | undefined {
    const file = (el.constructor as { file?: unknown }).file;
    return typeof file === 'string' ? file : undefined;
}

export interface DevtoolsTreeNode { id: number; tag: string; file?: string; children: DevtoolsTreeNode[] }

function treeUnder(root: ParentNode): DevtoolsTreeNode[] {
    const out: DevtoolsTreeNode[] = [];
    for (const child of Array.from(root.children)) {
        const nested = treeUnder(child);
        const shadow = (child as Element & { shadowRoot?: ShadowRoot | null }).shadowRoot;
        if (shadow) nested.push(...treeUnder(shadow));
        const id = instanceIds.get(child);
        if (id === undefined) { out.push(...nested); continue; }
        const node: DevtoolsTreeNode = { id, tag: child.localName, children: nested };
        const file = fileOf(child);
        if (file) node.file = file;
        out.push(node);
    }
    return out;
}

export interface DevtoolsInspection {
    id: number; tag: string; file?: string;
    props: Record<string, unknown>; state: Record<string, unknown>; deriveds: Record<string, unknown>;
}

function resolveTarget(target: number | Element | string): Element | null {
    if (typeof target === 'number') return instancesById.get(target)?.deref() ?? null;
    if (typeof target === 'string') {
        try { return document.querySelector(target); } catch { return null; }
    }
    return target ?? null;
}

function inspect(target: number | Element | string): DevtoolsInspection | null {
    const el = resolveTarget(target);
    if (!el) return null;
    const id = instanceIds.get(el);
    if (id === undefined) return null;
    const rec = instanceRecords.get(el);
    const out: DevtoolsInspection = {
        id, tag: el.localName,
        props: rec ? readAll(rec.props) : {},
        state: rec ? readAll(rec.state) : {},
        deriveds: rec ? readAll(rec.deriveds) : {},
    };
    const file = fileOf(el);
    if (file) out.file = file;
    return out;
}

// ─── Errors ───────────────────────────────────────────────────────

export type DevtoolsErrorSource = 'setup' | 'render' | 'handler' | 'effect' | 'global';
export interface DevtoolsError {
    time: number; tag?: string; file?: string; source: DevtoolsErrorSource; message: string; stack?: string;
}

const MAX_ERRORS = 50;
const errorLog: DevtoolsError[] = [];
/** An error reported on two paths — a boundary and then the global handler — is listed once. */
const seenErrors = new WeakSet<object>();

/** An error the runtime saw: thrown in a setup, a render, a handler, an effect, or unhandled. */
export function devRecordError(error: unknown, source: DevtoolsErrorSource, tag?: string, file?: string): void {
    if (error !== null && typeof error === 'object') {
        if (seenErrors.has(error)) return;
        seenErrors.add(error);
    }
    const entry: DevtoolsError = {
        time: Date.now(), source,
        message: error instanceof Error ? error.message : String(error),
    };
    if (tag) entry.tag = tag;
    if (file) entry.file = file;
    if (error instanceof Error && error.stack) entry.stack = error.stack;
    if (errorLog.length >= MAX_ERRORS) errorLog.shift();
    errorLog.push(entry);
}

// ─── Route ────────────────────────────────────────────────────────

export interface DevtoolsRoute { path: string; params: Record<string, string>; query: Record<string, string>; matched: string | null }
export interface DevtoolsNavigation { time: number; from: string; to: string; matched: string | null; error: string | null }

const MAX_NAVIGATIONS = 20;
const navigationLog: DevtoolsNavigation[] = [];
let routeSource: (() => DevtoolsRoute | null) | null = null;

/** The router says where to read the current route from. One router at a time: the last one wins. */
export function setDevtoolsRouteSource(source: () => DevtoolsRoute | null): void {
    routeSource = source;
}

/** The router records a navigation that finished — matched, refused, or not found. */
export function recordDevtoolsNavigation(entry: Omit<DevtoolsNavigation, 'time'>): void {
    if (!DEV) return;
    if (navigationLog.length >= MAX_NAVIGATIONS) navigationLog.shift();
    navigationLog.push({ time: Date.now(), ...entry });
}

// ─── The global ───────────────────────────────────────────────────

/** The object installed as `window.__PDX_DEVTOOLS__` in development. */
export const devtoolsApi = {
    /** The API's version: what an agent checks before it relies on a shape. */
    v: 1 as const,
    /** PDX components on the page, nested as they are: `[{ id, tag, file, children }]`. */
    tree: (): DevtoolsTreeNode[] => (typeof document === 'undefined' ? [] : treeUnder(document.body)),
    /** One instance — by id, element or CSS selector — with its props, state and deriveds. */
    inspect,
    /** The last 50 errors the runtime saw. */
    errors: (): DevtoolsError[] => errorLog.map((e) => ({ ...e })),
    /** The current route, or null with no router. */
    route: (): DevtoolsRoute | null => (routeSource ? devSerialise(routeSource()) as DevtoolsRoute | null : null),
    /** The last 20 navigations. */
    navigations: (): DevtoolsNavigation[] => navigationLog.map((n) => ({ ...n })),
    /** The global stores and their state (filled at telemetry level 2, which the devtools set). */
    stores: (): unknown[] => devSerialise(__pdx_debug.stores()) as unknown[],
    /** Listen to runtime events; returns the disconnect. Several listeners may be connected. */
    connect: connectDevTools,
    /** The inspector, for a person in the console. */
    debug: __pdx_debug,
};

// DEV only: in production the global must not be part of the app's attack or fingerprint surface.
if (DEV && typeof window !== 'undefined') {
    (window as Window & { __PDX_DEVTOOLS__?: unknown }).__PDX_DEVTOOLS__ = devtoolsApi;
    // What nothing in the runtime caught: an uncaught exception, a rejected promise nobody awaited.
    // An error the runtime already listed — a render error rethrown to the browser — is not listed twice.
    window.addEventListener('error', (e: ErrorEvent) => devRecordError(e.error ?? e.message, 'global'));
    window.addEventListener('unhandledrejection', (e: PromiseRejectionEvent) => devRecordError(e.reason, 'global'));
}
