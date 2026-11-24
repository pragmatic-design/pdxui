// `@try { maxRetries: n, autoRetry: on, retryDelay: ms, onError: fn, onRecover: fn } { … }` (#1365): the options of
// core's errorBoundary, in a block right after `@try`, as `@await` takes its timing in one.
//
// The block is options when a second block follows it: a `@try` body is followed by `@catch`, never
// by another block, so the shape decides and the text inside does not. Each value is an expression of
// the script's names, read when the block renders.

import { splitAtDepthZero } from '../compiler/tokenizer';

/** The keys errorBoundary takes from a template, in the order its options declare them. */
export const TRY_OPTION_KEYS = ['maxRetries', 'autoRetry', 'retryDelay', 'onError', 'onRecover'] as const;

/** One option: its key and the expression written for it, as written. */
export interface TryOption {
    key: (typeof TRY_OPTION_KEYS)[number];
    expr: string;
}

// Match: `key: value`. Groups: [1]=the key [2]=the value, everything after the first colon
const ENTRY = /^([A-Za-z_$][\w$]*)\s*:([\s\S]*)$/;
// Match: a bare name, the shorthand `{ maxRetries }`, which names no value. Groups: [1]=the name
const BARE = /^([A-Za-z_$][\w$]*)$/;

/**
 * The entries of an options block, its text between the braces. An unknown key, a key twice and a
 * key with no value stop the compile: a typo would otherwise be an option silently not passed.
 */
export function parseTryOptions(raw: string, line: number): TryOption[] {
    const options: TryOption[] = [];
    const keys = TRY_OPTION_KEYS.join(', ');
    for (const part of splitAtDepthZero(raw, ',').map((s) => s.trim()).filter(Boolean)) {
        const bare = BARE.exec(part);
        if (bare) {
            throw new Error(
                `@try option '${bare[1]}' at line ${line} has no value.\n` +
                `  Hint: write the value after a colon, as an object does: { ${bare[1]}: ${bare[1]} }.`
            );
        }
        const m = ENTRY.exec(part);
        if (!m || !(TRY_OPTION_KEYS as readonly string[]).includes(m[1])) {
            const name = m ? m[1] : part;
            throw new Error(
                `@try option '${name}' at line ${line} is not one @try takes.\n` +
                `  Hint: the options are ${keys}.`
            );
        }
        const key = m[1] as TryOption['key'];
        if (options.some((o) => o.key === key)) {
            throw new Error(
                `@try option '${key}' is given twice at line ${line}.\n` +
                `  Hint: each of ${keys} at most once.`
            );
        }
        const expr = m[2].trim();
        if (!expr) {
            throw new Error(
                `@try option '${key}' at line ${line} has no value.\n` +
                `  Hint: { ${key}: expression }.`
            );
        }
        options.push({ key, expr });
    }
    return options;
}
