// The tag prefixes (#136): what an application's components are named with, and what is reserved.

/**
 * The prefix of an application's component tags when `pdx({ prefix })` gives none. `pdx-` is the
 * `@pdxui/*` packages': an app's `button.pdx` as `<pdx-button>` was the library's tag.
 */
export const DEFAULT_TAG_PREFIX = 'app';

/** The prefix the `@pdxui/*` packages own: an application tag that starts with it is PDX_TAG_RESERVED. */
export const RESERVED_TAG_PREFIX = 'pdx-';
