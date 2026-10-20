// The options block of a named `@loader user: loadUser { staleTime: 30_000 };` (#148).
//
// `staleTime` is the one option. It goes into the route table, which is data the compiler writes for
// every page — read before any page module runs — so its value is a number the compiler reads: a
// literal, or a product of literals (`5 * 60_000`). A name of the script cannot reach the table.

import { objectKeys } from './script-analyzer-helpers';

/** The options `@loader` takes. */
export const LOADER_OPTION_KEYS: readonly string[] = ['staleTime'];

/**
 * A `staleTime` value in ms: `30_000`, `30000`, `5 * 60_000`. Undefined for anything else — a name,
 * a call, a negative or fractional result.
 */
export function readMilliseconds(text: string): number | undefined {
    const factors = text.split('*').map((f) => f.trim());
    // Match: an integer literal, underscores between digits allowed. Groups: none
    if (factors.some((f) => !/^\d+(?:_\d+)*$/.test(f))) return undefined;
    const value = factors.reduce((product, f) => product * Number(f.replace(/_/g, '')), 1);
    return Number.isSafeInteger(value) ? value : undefined;
}

/**
 * Read `{ staleTime: 30_000 }`: the value in ms, and what is wrong with the block when something is —
 * a sentence that follows the declaration's name in PDX_LOADER_UNKNOWN_OPTION.
 */
export function readLoaderOptions(block: string): { staleTime?: number; problem?: string } {
    const { keys, spread } = objectKeys(block);
    const unknown = keys.filter((k) => !LOADER_OPTION_KEYS.includes(k));
    if (spread) return { problem: 'spreads an object into its options, which the compiler cannot read: write `staleTime` itself.' };
    if (unknown.length > 0) {
        return { problem: `passes ${unknown.map((k) => `\`${k}\``).join(', ')}, which a loader does not take: it would do nothing.` };
    }
    if (!keys.includes('staleTime')) return {};
    // Match: the value of `staleTime`, up to the next key or the end. Groups: [1]=the value
    const value = /(?:^|[{,])\s*staleTime\s*:\s*([^,}]*)/.exec(block)?.[1]?.trim() ?? '';
    const staleTime = readMilliseconds(value);
    if (staleTime === undefined) {
        return { problem: `sets \`staleTime: ${value}\`, which the compiler cannot read as a number of milliseconds: the route table holds it before any page runs.` };
    }
    return { staleTime };
}
