// `__PDX_DEVTOOLS__` v2's last members (#298, docs/language/agents.md): `delta()`, `actions()` and
// `run()`, `sources()`, `forms()`. Each reads what the components in the route registered while their
// setup ran (devtools-registry.ts), or the card and the outline the API already builds.
//
// Development only, like the rest of the devtools global.

import type { PageCard } from './page-card';
import { routeRoot } from './page-card';
import { selectorOf } from './outline';
import { devOwnedEntries, type DevEntry } from './devtools-registry';
// Types only: importing the form runtime here would make the devtools a cycle of signal.ts's.
import type { Form, FormField } from '../form/form';

/** What `delta()` returns: the changes, or everything when there is nothing to compare with. */
export interface DevtoolsDelta {
    /** The card's keys whose value changed, with the new value; a key gone is `null`. The whole card with `full`. */
    card: Partial<Record<keyof PageCard, unknown>>;
    /** The outline's lines added, removed and changed; the whole outline with `full`. */
    outline: DevtoolsOutlineDelta | string;
    /** There was no card and outline to compare with, or the route changed: `card` and `outline` are whole. */
    full?: true;
    /** A navigation since the last look. */
    route?: true;
}

/** The outline lines that changed: `changed` are the lines of an addressable node whose text is new. */
export interface DevtoolsOutlineDelta { added: string[]; removed: string[]; changed: string[] }

export interface DevtoolsAction {
    component: string; name: string; enabled: boolean; pending: boolean; error: string | null; schema: unknown;
}
export interface DevtoolsRunResult { state: 'success' | 'error'; data: unknown; error: string | null }
export interface DevtoolsSource {
    component: string | null; name: string; key: string | null; state: string; pending: boolean;
    stale?: boolean; error: string | null; size?: number;
}
export interface DevtoolsFormField { name: string; value: unknown; required: boolean; error: string | null; touched: boolean; dirty: boolean }
export interface DevtoolsForm {
    component: string; name: string; valid: boolean; dirty: boolean; submitting: boolean; fields: DevtoolsFormField[];
}

/** A route loader as the router reports it: its pattern and its state, in the async vocabulary. */
export interface DevtoolsLoaderEntry {
    key: string; state: string; pending: boolean; stale: boolean; error: string | null; data: unknown;
}
export type DevtoolsLoaderSource = () => DevtoolsLoaderEntry[];

export interface DevtoolsMembersInput {
    card(): PageCard;
    outline(): string;
    routePath(): string | null;
    loaders(): DevtoolsLoaderEntry[];
}

type Readable<T> = () => T;
interface Action { execute(input: unknown): Promise<unknown>; enabled: Readable<boolean>; pending: Readable<boolean>; error: Readable<Error | null> }
interface Source { state: Readable<string>; pending: Readable<boolean>; stale?: Readable<boolean>; error: Readable<Error | null>; data: Readable<unknown>; key?: string }

/** The components in the route, outermost first, with what their setup registered. */
function ownersInRoute(): { el: Element; entries: readonly DevEntry[] }[] {
    if (typeof document === 'undefined') return [];
    const root = routeRoot();
    const out: { el: Element; entries: readonly DevEntry[] }[] = [];
    for (const el of [root, ...Array.from(root.querySelectorAll('*'))]) {
        const entries = devOwnedEntries(el);
        if (entries.length) out.push({ el, entries });
    }
    return out;
}

const messageOf = (error: unknown): string | null =>
    error === null || error === undefined ? null : error instanceof Error ? error.message : String(error);

// Match: an outline line's first selector, `[…]` after a role or a name. Groups: [1]=the selector
const LINE_REF = /\[([^\]]+)\]/;
// Match: a quoted name or text, escapes included — blanked before LINE_REF, whose brackets it may hold.
const QUOTED = /"(?:[^"\\]|\\.)*"/g;

/** The lines that differ between two outlines, an addressable node's new text as `changed`. */
function diffOutline(before: readonly string[], after: readonly string[]): DevtoolsOutlineDelta {
    const count = (lines: readonly string[]) => {
        const m = new Map<string, number>();
        for (const l of lines) m.set(l, (m.get(l) ?? 0) + 1);
        return m;
    };
    const refOf = (l: string) => LINE_REF.exec(l.replace(QUOTED, '""'))?.[1] ?? null;
    const oldCount = count(before);
    const newCount = count(after);
    const oldRefs = new Set(before.map(refOf).filter((r): r is string => r !== null));
    const newRefs = new Set(after.map(refOf).filter((r): r is string => r !== null));
    const added: string[] = [];
    const changed: string[] = [];
    for (const l of after) {
        const left = oldCount.get(l) ?? 0;
        if (left > 0) { oldCount.set(l, left - 1); continue; }
        const ref = refOf(l);
        (ref !== null && oldRefs.has(ref) ? changed : added).push(l);
    }
    const removed: string[] = [];
    for (const l of before) {
        const left = newCount.get(l) ?? 0;
        if (left > 0) { newCount.set(l, left - 1); continue; }
        const ref = refOf(l);
        if (ref === null || !newRefs.has(ref)) removed.push(l);
    }
    return { added, removed, changed };
}

/** The card's keys whose value changed, with the new value; a key that is gone is `null`. */
function diffCard(before: PageCard, after: PageCard): DevtoolsDelta['card'] {
    const out: DevtoolsDelta['card'] = {};
    const keys = new Set([...Object.keys(before), ...Object.keys(after)] as (keyof PageCard)[]);
    for (const k of keys) {
        if (JSON.stringify(before[k]) === JSON.stringify(after[k])) continue;
        out[k] = k in after ? after[k] : null;
    }
    return out;
}

/** The element a selector names, or null — a selector that does not parse names nothing either. */
function elementAt(selector: string): Element | null {
    try {
        return document.querySelector(selector);
    } catch {
        return null;
    }
}

/** A field bound to a password control in its component: its value is not shown. */
function isPassword(owner: Element, field: string): boolean {
    const name = CSS.escape(field);
    return !!owner.querySelector(`input[type="password"][name="${name}"], pdx-password-input[name="${name}"]`);
}

/** The five members, over the card and outline `input` builds. */
export function createDevtoolsMembers(input: DevtoolsMembersInput) {
    /** The last card and outline the agent was given, and the route they were read on. */
    let base: { card?: PageCard; outline?: string[]; path?: string | null } = {};

    function noteCard(card: PageCard): PageCard {
        const path = input.routePath();
        base = base.path === path ? { ...base, card } : { card, path };
        return card;
    }

    function noteOutline(text: string): string {
        const path = input.routePath();
        const outline = text ? text.split('\n') : [];
        base = base.path === path ? { ...base, outline } : { outline, path };
        return text;
    }

    function delta(): DevtoolsDelta {
        const path = input.routePath();
        const card = input.card();
        const text = input.outline();
        const lines = text ? text.split('\n') : [];
        const navigated = (base.card !== undefined || base.outline !== undefined) && base.path !== path;
        const previous = base;
        base = { card, outline: lines, path };
        if (navigated) return { card, outline: text, full: true, route: true };
        if (!previous.card || !previous.outline) return { card, outline: text, full: true };
        return { card: diffCard(previous.card, card), outline: diffOutline(previous.outline, lines) };
    }

    function actions(): DevtoolsAction[] {
        const out: DevtoolsAction[] = [];
        for (const { el, entries } of ownersInRoute()) {
            for (const e of entries) {
                if (e.kind !== 'action' || !e.name) continue;
                const a = e.target as Action;
                out.push({
                    component: selectorOf(el), name: e.name, enabled: a.enabled(), pending: a.pending(),
                    error: messageOf(a.error()), schema: e.schema ?? {},
                });
            }
        }
        return out;
    }

    async function run(component: string, name: string, value?: unknown): Promise<DevtoolsRunResult> {
        const el = elementAt(component);
        if (!el) throw new Error(`run: no component on the page matches "${component}".`);
        const entry = devOwnedEntries(el).find((e) => e.kind === 'action' && e.name === name);
        if (!entry) throw new Error(`run: "${component}" has no @action named "${name}".`);
        const action = entry.target as Action;
        // Not called, as a waiting call is not when its turn comes (#142).
        if (!action.enabled()) return { state: 'error', data: null, error: 'ActionDisabledError' };
        try {
            const data = await action.execute(value);
            return { state: 'success', data: data === undefined ? null : data, error: null };
        } catch (err) {
            const disabled = err instanceof Error && err.name === 'ActionDisabledError';
            return { state: 'error', data: null, error: disabled ? 'ActionDisabledError' : messageOf(err) };
        }
    }

    function sources(): DevtoolsSource[] {
        const out: DevtoolsSource[] = [];
        for (const { el, entries } of ownersInRoute()) {
            for (const e of entries) {
                if (e.kind !== 'source') continue;
                const s = e.target as Source;
                const key = e.key ?? s.key ?? null;
                const item: DevtoolsSource = {
                    component: selectorOf(el), name: e.name ?? key ?? '', key,
                    state: s.state(), pending: s.pending(), error: messageOf(s.error()),
                };
                if (typeof s.stale === 'function') item.stale = s.stale();
                const data = s.data();
                if (Array.isArray(data)) item.size = data.length;
                out.push(item);
            }
        }
        for (const l of input.loaders()) {
            const item: DevtoolsSource = {
                component: null, name: l.key, key: l.key, state: l.state, pending: l.pending, stale: l.stale, error: l.error,
            };
            if (Array.isArray(l.data)) item.size = l.data.length;
            out.push(item);
        }
        return out;
    }

    function forms(): DevtoolsForm[] {
        const out: DevtoolsForm[] = [];
        for (const { el, entries } of ownersInRoute()) {
            for (const e of entries) {
                if (e.kind !== 'form') continue;
                const form = e.target as Form<Record<string, unknown>>;
                const fields = (e.fields?.() ?? []).map(([name, field]): DevtoolsFormField => {
                    const f = field as FormField<unknown>;
                    return {
                        name, value: isPassword(el, name) ? '***' : f.value(), required: f.required,
                        error: f.error() ?? null, touched: f.touched(), dirty: f.dirty(),
                    };
                });
                out.push({
                    component: selectorOf(el), name: e.name ?? '', valid: form.valid(), dirty: form.dirty(),
                    submitting: form.submitting(), fields,
                });
            }
        }
        return out;
    }

    return { noteCard, noteOutline, delta, actions, run, sources, forms };
}
