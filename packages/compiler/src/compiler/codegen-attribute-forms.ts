// Attribute forms that are shorthand for others, expanded once, before either render path reads the
// tag (#96).
//
//   :class="{ active: on, off: !on }"   →  :class.active="on" :class.off="!on"
//   :style="{ color: c, fontSize: s }"  →  :style.color="c" :style.font-size="s"
//
// The template path expanded these inside its own rewrite, and the inline path a production build
// uses re-read the raw tag and never did: `:class` reached a binding that stringified the object —
// `class="[object Object]"` — and `:style` assigned it whole to `el.style`. Expanded here, in the
// source form both paths already read, the two cannot disagree about it.

import { splitAtDepthZero, findAtDepthZero } from './tokenizer';

/**
 * Split an object-literal body `key: value, key2: value2` into [key, value] pairs.
 * Depth- and string-aware: commas/colons inside calls, brackets, ternaries or
 * strings (e.g. `{ active: has(a, b), label: x ? 'a:b' : 'c' }`) don't break it.
 * The pair key is taken as the first depth-0 `:`; the rest is the value.
 */
function splitObjectPairs(inner: string): [string, string][] {
    const pairs: [string, string][] = [];
    for (const part of splitAtDepthZero(inner, ',')) {
        const seg = part.trim();
        if (!seg) continue;
        const colon = findAtDepthZero(seg, 0, ':');
        if (colon === -1) continue;
        const key = seg.slice(0, colon).trim();
        const value = seg.slice(colon + 1).trim();
        if (key && value) pairs.push([key, value]);
    }
    return pairs;
}

/** Convert camelCase to kebab-case: a CSS property, or an HTML-safe attribute name. */
export function camelToKebab(s: string): string {
    return s.replace(/[A-Z]/g, m => '-' + m.toLowerCase());
}

/**
 * The tag with its `:class` and `:style` objects expanded into one `:class.x` / `:style.x` attribute
 * per key. Each value keeps the quote its object was written in: a value inside double quotes holds no
 * double quote, so it is written back safely. `onExpand(name, from)` hears each attribute made, with
 * the attribute it came from — what a source map keys an origin by.
 */
export function expandAttributeForms(tag: string, onExpand?: (name: string, from: string) => void): string {
    // Match: :class="{ … }" or :class='{ … }' — an object literal as the whole value.
    // Groups: [1]=double-quoted object [2]=single-quoted object
    tag = tag.replace(/:class=(?:"(\{[^"]*?\})"|'(\{[^']*?\})')/g, (_, dq: string, sq: string) => {
        const q = dq !== undefined ? '"' : "'";
        const inner = (dq ?? sq).slice(1, -1).trim();
        return splitObjectPairs(inner).map(([cls, cond]) => {
            const name = `:class.${cls.replace(/['"]/g, '')}`;
            onExpand?.(name, ':class');
            return `${name}=${q}${cond}${q}`;
        }).join(' ');
    });
    // Match: :style="{ … }" or :style='{ … }'.  Groups: [1]=double-quoted object [2]=single-quoted object
    tag = tag.replace(/:style=(?:"(\{[^"]*?\})"|'(\{[^']*?\})')/g, (_, dq: string, sq: string) => {
        const q = dq !== undefined ? '"' : "'";
        const inner = (dq ?? sq).slice(1, -1).trim();
        return splitObjectPairs(inner).map(([prop, val]) => {
            const name = `:style.${camelToKebab(prop.replace(/['"]/g, ''))}`;
            onExpand?.(name, ':style');
            return `${name}=${q}${val}${q}`;
        }).join(' ');
    });
    return tag;
}
