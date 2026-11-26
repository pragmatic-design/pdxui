// `@await (source) { minMs: n, maxMs: n } { … }` (#145, #1369): the timing of an `@await`, in a block
// right after its source.
//
// The block is timing when a second block follows it: an `@await` body is followed by `@loading`,
// `@error` or nothing, never by another block, so the shape decides — as for `@try`'s options
// (./try-options, #1365). It was decided by the words inside: a block naming `minMs` or `maxMs` was
// timing, so `{ maxMS: 5000 }` rendered as the body and a body whose text said "minMs" was read as
// timing. Each value is a non-negative integer of milliseconds, written as digits.

import { splitAtDepthZero } from '../compiler/tokenizer';

/** The keys a timing block takes. */
export const AWAIT_TIMING_KEYS = ['minMs', 'maxMs'] as const;

/** The timing an `@await` was given; a key not written is absent. */
export interface AwaitTiming {
    minMs?: number;
    maxMs?: number;
}

// Match: `key: value`. Groups: [1]=the key [2]=the value, everything after the first colon
const ENTRY = /^([A-Za-z_$][\w$]*)\s*:([\s\S]*)$/;
// Match: a bare name, the shorthand `{ minMs }`, which names no value. Groups: [1]=the name
const BARE = /^([A-Za-z_$][\w$]*)$/;
// Match: a non-negative integer written as digits, the only value a timing key takes
const MILLISECONDS = /^\d+$/;

/**
 * The entries of a timing block, its text between the braces. An unknown key, a key twice, a key
 * with no value and a value that is not digits stop the compile: each was a timing silently not
 * applied.
 */
export function parseAwaitTiming(raw: string, line: number): AwaitTiming {
    const timing: AwaitTiming = {};
    const keys = AWAIT_TIMING_KEYS.join(', ');
    for (const part of splitAtDepthZero(raw, ',').map((s) => s.trim()).filter(Boolean)) {
        const bare = BARE.exec(part);
        const m = ENTRY.exec(part);
        const name = bare ? bare[1] : m ? m[1] : part;
        if (!(AWAIT_TIMING_KEYS as readonly string[]).includes(name)) {
            throw new Error(
                `@await timing '${name}' at line ${line} is not one @await takes.\n` +
                `  Hint: the timing block holds ${keys}, in milliseconds: @await (source) { minMs: 200, maxMs: 5000 } { … }.`
            );
        }
        const key = name as (typeof AWAIT_TIMING_KEYS)[number];
        if (timing[key] !== undefined) {
            throw new Error(
                `@await timing '${key}' is given twice at line ${line}.\n` +
                `  Hint: each of ${keys} at most once.`
            );
        }
        const value = m ? m[2].trim() : '';
        if (!value) {
            throw new Error(
                `@await timing '${key}' at line ${line} has no value.\n` +
                `  Hint: { ${key}: 200 }, in milliseconds.`
            );
        }
        if (!MILLISECONDS.test(value)) {
            throw new Error(
                `@await timing '${key}' at line ${line} is '${value}', which is not a number of milliseconds.\n` +
                `  Hint: write it in digits, a non-negative integer: { ${key}: 200 }.`
            );
        }
        timing[key] = Number(value);
    }
    return timing;
}
