// Which words are component tags (#136): the library's `pdx-…` and an application's `app-…`.

import { DEFAULT_TAG_PREFIX, RESERVED_TAG_PREFIX } from '@pdxui/compiler';

/** The prefixes a component tag starts with: the library's, then the application's. */
export const COMPONENT_TAG_PREFIXES: readonly string[] = [RESERVED_TAG_PREFIX, `${DEFAULT_TAG_PREFIX}-`];

/** Whether `word` names a component — a library tag or an application one. */
export function isComponentTag(word: string): boolean {
    return COMPONENT_TAG_PREFIXES.some((p) => word.startsWith(p) && word.length > p.length);
}

/** `word` without the prefix that makes it a component tag, or as it is. */
export function withoutTagPrefix(word: string): string {
    const p = COMPONENT_TAG_PREFIXES.find((prefix) => word.startsWith(prefix));
    return p ? word.slice(p.length) : word;
}
