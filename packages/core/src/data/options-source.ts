// options-source.ts — cached async option loader for selects (enum/entity lookups).
// Resolves the repeated app-level pattern "fetch options once, cache, map to {label,value}, track loading"
// that every FK/enum dropdown re-implements (UI-15f). Pair with <pdx-select :options> + a `load()` on open.

import { signal, computed } from '../reactivity/signal';
import type { ReadonlySignal } from '../utils/types';

export interface SelectOption {
    label: string;
    value: unknown;
    [key: string]: unknown;
}

export interface OptionsSource {
    /** Load options once and cache them; subsequent calls return the cache (unless cache:false). */
    load(): Promise<SelectOption[]>;
    /** Force a refetch, replacing the cache. */
    reload(): Promise<SelectOption[]>;
    /** Currently cached options (empty array until first load resolves). */
    peek(): SelectOption[];
    /** Reactive loading flag (true while a fetch is in flight). */
    readonly loading: ReadonlySignal<boolean>;
}

/**
 * Load a select's options once, cache them, and expose a `loading` signal while it happens.
 *
 * The pattern every foreign-key or enum dropdown re-implements: fetch on first open, do not fetch
 * again, and do not fire a second request when the user opens the menu twice before the first
 * answers — concurrent calls share the in-flight promise rather than racing.
 *
 * `reload()` forces a refetch, `peek()` reads the cache without triggering one, and `cache: false`
 * turns the whole thing into a plain loader for options that change per open.
 */
export function createOptionsSource(
    loader: () => Promise<SelectOption[]>,
    options?: { cache?: boolean }
): OptionsSource {
    const useCache = options?.cache !== false;
    const _options = signal<SelectOption[]>([]);
    const _loading = signal(false);
    let inflight: Promise<SelectOption[]> | null = null;
    let loaded = false;

    async function run(): Promise<SelectOption[]> {
        _loading.set(true);
        try {
            const result = await loader();
            _options.set(result);
            loaded = true;
            return result;
        } finally {
            _loading.set(false);
            inflight = null;
        }
    }

    return {
        load() {
            if (useCache && loaded) return Promise.resolve(_options.peek());
            if (inflight) return inflight;
            inflight = run();
            return inflight;
        },
        reload() {
            loaded = false;
            inflight = run();
            return inflight;
        },
        peek: () => _options.peek(),
        // computed: the consumer must not be able to write the flag
        loading: computed(() => _loading()),
    };
}

/** Map raw records to {label, value} options via field names (keeps the source row under `_raw`). */
export function mapOptions<T extends Record<string, unknown>>(
    records: T[],
    labelField = 'label',
    valueField = 'value'
): SelectOption[] {
    return records.map((r) => ({ label: String(r[labelField] ?? ''), value: r[valueField], _raw: r }));
}
