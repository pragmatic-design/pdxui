/**
 * DTCG export/import — bridges the PDX token map to the W3C/DTCG Design Tokens
 * format (first stable version 2025.10): `{ $value, $type }`, grouped, JSON.
 *
 * Purpose: make a theme machine-readable and interoperable
 * (Figma / Style Dictionary / Tokens Studio) AND agent-legible — the compact
 * semantic surface an agent reads/writes. Values are kept verbatim (OKLCH,
 * `light-dark(...)`, `var(...)`) so the round-trip is lossless — except a value that
 * is one CSS string (`'/'`), which exports as its text with its quote in
 * `$extensions.pdx.quote`, and comes back quoted.
 *
 * Zero dependencies. Grouping is one level deep: `--pdx-<group>-<rest>` →
 * `{ [group]: { [rest]: { $value, $type? } } }`. Reconstruction is deterministic,
 * so `fromDTCG(toDTCG(tokens))` deep-equals the original map.
 */

/** A single DTCG token: `$value` required, `$type` optional. */
export interface DTCGToken {
    $value: string;
    $type?: string;
    $description?: string;
    /** `pdx.quote`: the value was a CSS string with this quote; the import puts it back. */
    $extensions?: { pdx?: { quote?: string } } & Record<string, unknown>;
}

/** A value that is exactly one CSS string, `'/'` or `"›"`, with `\\`, `\'` and `\"` escapes. */
const CSS_STRING = /^(['"])((?:\\[\\'"]|(?!\1)[^\\])*)\1$/;

function quoteCss(text: string, quote: string): string {
    return quote + text.replace(/\\/g, '\\\\').split(quote).join('\\' + quote) + quote;
}

/**
 * The text of a CSS string token and its quote, or null. A separator exported verbatim reaches a
 * design tool as "'/'", quotes included. Only a value that quoting gives back byte for
 * byte is unquoted, so the round-trip stays lossless; anything else stays verbatim.
 */
function cssStringText(value: string): { text: string; quote: string } | null {
    const m = CSS_STRING.exec(value);
    if (!m) return null;
    const text = m[2].replace(/\\([\\'"])/g, '$1');
    return quoteCss(text, m[1]) === value ? { text, quote: m[1] } : null;
}

/** A DTCG group: nested tokens/groups keyed by name. */
export type DTCGGroup = { [key: string]: DTCGToken | DTCGGroup };

/** Sentinel leaf name for a token with no sub-segment (e.g. `--pdx-foo`). */
const ROOT_LEAF = '_';

/** Infer the DTCG `$type` from a `--pdx-*` token name. Omitted when unknown. */
export function inferDTCGType(name: string): string | undefined {
    if (
        name.startsWith('--pdx-color-') ||
        name.startsWith('--pdx-gray-') ||
        name.startsWith('--pdx-primary-') ||
        name.startsWith('--pdx-secondary-')
    ) {
        return 'color';
    }
    if (name.startsWith('--pdx-font-')) return 'fontFamily';
    if (name.startsWith('--pdx-weight-')) return 'fontWeight';
    if (name.startsWith('--pdx-shadow-')) return 'shadow';
    if (
        name.startsWith('--pdx-space-') ||
        name.startsWith('--pdx-radius-') ||
        name.startsWith('--pdx-text-') ||
        name.includes('-min-height') ||
        name.includes('-width') ||
        name.includes('-height') ||
        name.endsWith('-size')
    ) {
        return 'dimension';
    }
    if (
        name.startsWith('--pdx-hue-') ||
        name.startsWith('--pdx-opacity-') ||
        name.startsWith('--pdx-motion-') ||
        name.startsWith('--pdx-z-')
    ) {
        return 'number';
    }
    return undefined;
}

/** Split `--pdx-color-primary-text` → `{ group: 'color', leaf: 'primary-text' }`. */
function splitName(name: string): { group: string; leaf: string } {
    const rest = name.replace(/^--pdx-/, '');
    const dash = rest.indexOf('-');
    if (dash === -1) return { group: rest, leaf: ROOT_LEAF };
    return { group: rest.slice(0, dash), leaf: rest.slice(dash + 1) };
}

/** Rebuild `--pdx-<group>-<leaf>` (or `--pdx-<group>` for the root sentinel). */
function joinName(group: string, leaf: string): string {
    return leaf === ROOT_LEAF ? `--pdx-${group}` : `--pdx-${group}-${leaf}`;
}

/**
 * Serialize a token map (or a GeneratedTheme's `.tokens`) to a DTCG group tree.
 * Pass `{ root: 'pdx' }` to wrap everything under a single top-level group.
 */
export function toDTCG(
    input: Record<string, string> | { tokens: Record<string, string> },
    opts?: { root?: string },
): DTCGGroup {
    const tokens = 'tokens' in input ? input.tokens : input;
    const tree: DTCGGroup = {};
    for (const [name, value] of Object.entries(tokens)) {
        const { group, leaf } = splitName(name);
        const g = (tree[group] ??= {}) as DTCGGroup;
        const str = cssStringText(value);
        const token: DTCGToken = { $value: str ? str.text : value };
        const type = inferDTCGType(name);
        if (type) token.$type = type;
        if (str) token.$extensions = { pdx: { quote: str.quote } };
        g[leaf] = token;
    }
    return opts?.root ? { [opts.root]: tree } : tree;
}

/**
 * Parse a DTCG group tree back to a flat `--pdx-*` token map. Tolerant of an
 * optional single-key root wrapper and of unknown/extra `$*` fields.
 */
export function fromDTCG(dtcg: DTCGGroup): Record<string, string> {
    // Unwrap a single-key non-token root (e.g. `{ pdx: {...} }`).
    const keys = Object.keys(dtcg);
    let tree = dtcg;
    if (keys.length === 1) {
        const only = dtcg[keys[0]];
        if (only && typeof only === 'object' && !('$value' in only)) {
            const inner = only as DTCGGroup;
            const innerIsGroups = Object.values(inner).every(
                (v) => v && typeof v === 'object' && !('$value' in v),
            );
            if (innerIsGroups) tree = inner;
        }
    }
    const out: Record<string, string> = {};
    for (const [group, node] of Object.entries(tree)) {
        if (!node || typeof node !== 'object') continue;
        for (const [leaf, token] of Object.entries(node as DTCGGroup)) {
            const t = token as DTCGToken;
            if (!t || typeof t.$value !== 'string') continue;
            const quote = t.$extensions?.pdx?.quote;
            out[joinName(group, leaf)] = quote === "'" || quote === '"' ? quoteCss(t.$value, quote) : t.$value;
        }
    }
    return out;
}

/** Convenience: DTCG tree as a pretty JSON string (for `--out theme.tokens.json`). */
export function toDTCGJson(
    input: Record<string, string> | { tokens: Record<string, string> },
    opts?: { root?: string },
): string {
    return JSON.stringify(toDTCG(input, opts), null, 2);
}
