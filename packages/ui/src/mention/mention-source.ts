// pdx-mention's suggestions, read from what the app gave it: static `items`, a raw array, or a data
// source that searches remotely. Beside the component, which passes its props' current values.

import type { MentionItem } from './mention-types';

/** The fields a suggestion is read from: its label, its value and its description (optional). */
export interface MentionFields {
    label: string;
    value: string;
    description: string;
}

/** A data source that searches remotely: one with `fetch`, whose rows are `data` or `data()`. */
export interface RemoteSource {
    fetch: (query: { search: string }) => Promise<unknown>;
    data: unknown;
}

/** One suggestion, from a string or from an object by the named fields. */
export function normalizeItem(obj: unknown, fields: MentionFields): MentionItem {
    if (typeof obj === 'string') return { value: obj, label: obj };
    const rec = obj as Record<string, unknown>;
    const lf = fields.label || 'label';
    const vf = fields.value || 'value';
    const df = fields.description;
    return {
        value: String(rec[vf] ?? ''),
        label: String(rec[lf] ?? rec[vf] ?? ''),
        description: df ? String(rec[df] ?? '') : undefined,
    };
}

/** The source's rows: a data source's `data()`, or the array itself. */
export function sourceRows(src: unknown): unknown[] {
    if (!src) return [];
    if (Array.isArray(src)) return src;
    const data = (src as { data?: unknown }).data;
    if (typeof src === 'object' && typeof data === 'function') return (data as () => unknown[])() || [];
    return [];
}

/** The source when it searches remotely, or null. */
export function remoteSource(src: unknown): RemoteSource | null {
    return src && typeof src === 'object' && typeof (src as { fetch?: unknown }).fetch === 'function'
        ? src as RemoteSource : null;
}

/** A remote source's rows after its fetch: `data()` or `data`. */
export function remoteRows(src: RemoteSource): unknown[] {
    return ((typeof src.data === 'function' ? (src.data as () => unknown[])() : src.data) as unknown[]) || [];
}
