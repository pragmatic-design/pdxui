// httpResource — combines HttpClient + resource() for zero-glue reactive data fetching.
// Inspired by Angular 20 httpResource(). Reactive params auto-refetch.

import { resource } from './resource';
import { getDefaultClient } from '../http/client';
import type { Resource, ResourceOptions } from './resource';

// ─── Types ─────────────────────────────────────────────────────────

export interface HttpResourceOptions<T> extends Omit<ResourceOptions<T>, 'key'> {
    /** HTTP method. Default: 'GET'. */
    method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    /** Request body (for POST/PUT/PATCH). */
    body?: unknown | (() => unknown);
    /** Request headers. */
    headers?: Record<string, string>;
    /** Reactive URL params — when these change, auto-refetch. */
    params?: () => Record<string, string | number>;
}

// ─── httpResource() ────────────────────────────────────────────────

/**
 * Reactive HTTP data resource — fetches data from a URL with auto-refetch on param changes.
 * Wraps HttpClient + resource() into a single call.
 *
 * Usage:
 *   const users = httpResource<User[]>('/api/users');
 *   const user = httpResource<User>(() => `/api/users/${id()}`, { staleTime: 60_000 });
 *   const results = httpResource<SearchResult[]>('/api/search', {
 *       method: 'POST',
 *       body: () => ({ query: searchQuery() }),
 *   });
 */
export function httpResource<T>(
    url: string | (() => string),
    options?: HttpResourceOptions<T>,
): Resource<T> {
    const method = options?.method ?? 'GET';
    const urlFn = typeof url === 'function' ? url : () => url;

    // Resolve params() and append them to the URL as a query string.
    // Reading params() inside the fetcher/keyFn makes them reactive (auto-refetch).
    function resolveFullUrl(): string {
        const base = urlFn();
        if (!options?.params) return base;
        const params = options.params();
        const search = new URLSearchParams();
        for (const [k, v] of Object.entries(params)) {
            search.set(k, String(v));
        }
        const query = search.toString();
        if (!query) return base;
        return base.includes('?') ? `${base}&${query}` : `${base}?${query}`;
    }

    // Build cache key from a stable serialization of everything that affects the
    // response: method, resolved URL (incl. params), resolved body and headers.
    // Without this, two requests with the same method+url but different body/params
    // share a cache entry → cache poisoning.
    const keyFn = () => {
        const body = typeof options?.body === 'function' ? (options.body as () => unknown)() : options?.body;
        return httpResourceKey(method, resolveFullUrl(), body, options?.headers);
    };

    const resourceOpts: ResourceOptions<T> = {
        ...options,
        key: keyFn,
    };

    return resource<T>(() => {
        const client = getDefaultClient();
        const resolvedUrl = resolveFullUrl();
        const body = typeof options?.body === 'function' ? (options.body as () => unknown)() : options?.body;

        switch (method) {
            case 'GET':    return client.get<T>(resolvedUrl, { headers: options?.headers });
            case 'POST':   return client.post<T>(resolvedUrl, body, { headers: options?.headers });
            case 'PUT':    return client.put<T>(resolvedUrl, body, { headers: options?.headers });
            case 'PATCH':  return client.patch<T>(resolvedUrl, body, { headers: options?.headers });
            case 'DELETE': return client.delete<T>(resolvedUrl, { headers: options?.headers });
        }
    }, resourceOpts);
}

/** Build the cache key for an HTTP resource from its resolved request shape.
 *  Exported for testing — equal requests (order-independent) yield equal keys. */
export function httpResourceKey(
    method: string,
    url: string,
    body?: unknown,
    headers?: Record<string, string>,
): string {
    return `http:${stableStringify({ method, url, body, headers })}`;
}

/** Deterministic JSON.stringify — object keys sorted recursively so equal values
 *  produce equal strings regardless of insertion order. */
function stableStringify(value: unknown): string {
    return JSON.stringify(value, (_key, val) => {
        if (val && typeof val === 'object' && !Array.isArray(val)) {
            const sorted: Record<string, unknown> = {};
            for (const k of Object.keys(val as Record<string, unknown>).sort()) {
                sorted[k] = (val as Record<string, unknown>)[k];
            }
            return sorted;
        }
        return val;
    });
}
