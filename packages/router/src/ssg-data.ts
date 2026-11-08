// The loader results a generated page carries to the client (#239): written by the static build into
// the page, read by `installRouteAdoption()` at boot. One module for both sides, so the format cannot
// drift between them.
//
//   <script type="application/json" id="pdx-ssg-data">{"builtAt": …, "results": [ … ]}</script>
//
// Each result is a level's: under the identity the cache keeps it by, with its pattern (the tag
// `invalidate()` matches) and its staleTime. The build's time is when they were fetched: a level is
// fresh while the build is younger than its staleTime, and runs its loader again behind the kept result
// once it is older — the cache's ordinary rule (#148).

import { seedKeptResults } from './loader-cache';

/** The id of the script that carries the data. */
export const SSG_DATA_ID = 'pdx-ssg-data';

/** A level's loader result as the page carries it. */
export interface SsgLoaderResult {
    readonly key: string;
    readonly pattern: string;
    readonly staleTime: number;
    readonly value: unknown;
}

/**
 * The script for `results`, fetched at `builtAt` (ms since the epoch). `<` is written as `<`, so
 * nothing in the data — a `</script>` in a text — ends the script early; JSON reads it back the same.
 */
export function ssgDataScript(results: readonly SsgLoaderResult[], builtAt: number): string {
    const json = JSON.stringify({ builtAt, results }).replace(/</g, '\\u003c');
    return `<script type="application/json" id="${SSG_DATA_ID}">${json}</script>`;
}

/** Keep the results the page carries as their levels' results, and take the script out of the page. */
export function seedFromPage(): void {
    const script = typeof document === 'undefined' ? null : document.getElementById(SSG_DATA_ID);
    if (!script) return;
    script.remove();
    const { builtAt, results } = JSON.parse(script.textContent ?? '{}') as { builtAt?: number; results?: SsgLoaderResult[] };
    if (typeof builtAt === 'number' && Array.isArray(results)) seedKeptResults(results, builtAt);
}
