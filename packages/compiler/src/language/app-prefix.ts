// Application tags change prefix (#136): an app's `button.pdx` was `<pdx-button>` and is
// `<app-button>`. The renames come from the project — `pdx migrate` builds them from its components
// (`projectTagRenames`), old tag → new — so a library tag (`<pdx-button>` meaning the library's
// button) is never touched. In a .pdx, the template's tags, the style's type selectors and `@tag`
// are rewritten; a tag named in a string is only flagged, as nothing says it is a tag.

import { parseSFC } from '../parser/sfc';
import { deriveTag } from '../compiler/codegen-shared';
import { RESERVED_TAG_PREFIX } from '../compiler/tag-prefix';
import type { LanguageChange, LanguageChangeContext, LanguageChangeFinding } from './changes';

/** `text` as a literal inside a RegExp. */
const literal = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The line (1-based) of `index` in `text`. */
const lineAt = (text: string, index: number): number => text.slice(0, index).split('\n').length;

/** One kind of place a tag is written, and how to find it for one old tag. */
type Place = (old: string) => RegExp;

// Match: an element of that name opening or closing — `<pdx-x`, `</pdx-x` — before a blank, `/` or `>`.
const TEMPLATE_TAG: Place = (old) => new RegExp(`(?<=</?)${literal(old)}(?=[\\s/>])`, 'gi');
// Match: a type selector of that name — not part of a class, an id, an attribute or a longer name.
const CSS_SELECTOR: Place = (old) => new RegExp(`(?<![\\w.#\\-"'=])${literal(old)}(?![\\w-])`, 'g');
// Match: `@tag 'pdx-x'` — the value only.
const TAG_RUNE: Place = (old) => new RegExp(`(?<=@tag\\s+['"])${literal(old)}(?=['"])`, 'g');
// Match: the tag in a string of code — `'pdx-x'`, `"pdx-x"`, `` `pdx-x` ``, or as a selector inside one
// (`'main > pdx-x'`). One alternative per quote, so a string may hold the other quotes.
const IN_STRING: Place = (old) => new RegExp(['\'', '"', '`']
    .map((q) => `${q}(?:[^${q}\\n]*[\\s>+~(,])?${literal(old)}(?![\\w-])[^${q}\\n]*${q}`).join('|'), 'g');

/** The blocks of a .pdx a rename applies to: each block's range and the places looked for in it. */
function blocksOf(text: string): { from: number; to: number; places: Place[] }[] {
    const sfc = parseSFC(text);
    const out: { from: number; to: number; places: Place[] }[] = [];
    if (sfc.template && !sfc.template.src) out.push({ from: sfc.template.start, to: sfc.template.start + sfc.template.content.length, places: [TEMPLATE_TAG] });
    for (const s of sfc.styles) if (!s.src) out.push({ from: s.start, to: s.start + s.content.length, places: [CSS_SELECTOR] });
    if (sfc.script && !sfc.script.src) out.push({ from: sfc.script.start, to: sfc.script.start + sfc.script.content.length, places: [TAG_RUNE] });
    return out;
}

/** Every rewritable place of a rename in a .pdx: where it is, and the new tag. */
function rewrites(text: string, renames: ReadonlyMap<string, string>): { at: number; length: number; to: string }[] {
    const out: { at: number; length: number; to: string }[] = [];
    for (const block of blocksOf(text)) {
        const part = text.slice(block.from, block.to);
        for (const [old, to] of renames) {
            for (const place of block.places) {
                for (const m of part.matchAll(place(old))) out.push({ at: block.from + m.index, length: m[0].length, to });
            }
        }
    }
    return out.sort((a, b) => a.at - b.at);
}

export const appPrefix: LanguageChange = {
    id: 'app-prefix',
    kind: 'removed',
    scope: 'pdx',
    issue: 136,
    message: "An application's component tags start with its own prefix, `app-` by default: `pdx-` is the @pdxui packages'.",
    // Every renamed tag is an old `pdx-` one (projectTagRenames).
    marker: 'pdx-',
    detect: (text, context?: LanguageChangeContext): LanguageChangeFinding[] => {
        const renames = context?.projectTags;
        if (!renames || renames.size === 0) return [];
        return rewrites(text, renames).map(r => ({ line: lineAt(text, r.at), found: text.slice(r.at, r.at + r.length) }));
    },
    fix: (text, context?: LanguageChangeContext) => {
        const renames = context?.projectTags;
        if (!renames || renames.size === 0) return text;
        let out = text;
        for (const r of rewrites(text, renames).reverse()) out = out.slice(0, r.at) + r.to + out.slice(r.at + r.length);
        return out;
    },
};

/** The places of a rename in an HTML page: its elements anywhere, and the selectors of its `<style>`s. */
function htmlRewrites(text: string, renames: ReadonlyMap<string, string>): { at: number; length: number; to: string }[] {
    const out: { at: number; length: number; to: string }[] = [];
    // Match: a <style> element's content. Groups: [1]=the CSS
    const styles = [...text.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map(m => ({ from: m.index + m[0].indexOf(m[1]), text: m[1] }));
    for (const [old, to] of renames) {
        for (const m of text.matchAll(TEMPLATE_TAG(old))) out.push({ at: m.index, length: m[0].length, to });
        for (const s of styles) for (const m of s.text.matchAll(CSS_SELECTOR(old))) out.push({ at: s.from + m.index, length: m[0].length, to });
    }
    return out.sort((a, b) => a.at - b.at);
}

export const appPrefixHtml: LanguageChange = {
    id: 'app-prefix-html',
    kind: 'removed',
    scope: 'html',
    issue: 136,
    message: "An application's component tags start with its own prefix, `app-` by default — in the page that mounts the app too.",
    marker: 'pdx-',
    detect: (text, context?: LanguageChangeContext): LanguageChangeFinding[] => {
        const renames = context?.projectTags;
        if (!renames || renames.size === 0) return [];
        return htmlRewrites(text, renames).map(r => ({ line: lineAt(text, r.at), found: text.slice(r.at, r.at + r.length) }));
    },
    fix: (text, context?: LanguageChangeContext) => {
        const renames = context?.projectTags;
        if (!renames || renames.size === 0) return text;
        let out = text;
        for (const r of htmlRewrites(text, renames).reverse()) out = out.slice(0, r.at) + r.to + out.slice(r.at + r.length);
        return out;
    },
};

export const appPrefixString: LanguageChange = {
    id: 'app-prefix-string',
    kind: 'removed',
    scope: 'script',
    issue: 136,
    message: "A string names an application tag by its old `pdx-` name: write the `app-` one if it is the tag.",
    marker: 'pdx-',
    detect: (text, context?: LanguageChangeContext): LanguageChangeFinding[] => {
        const renames = context?.projectTags;
        if (!renames || renames.size === 0) return [];
        const out: LanguageChangeFinding[] = [];
        for (const old of renames.keys()) {
            for (const m of text.matchAll(IN_STRING(old))) {
                // `@tag 'pdx-x'` is rewritten by app-prefix, not flagged.
                if (/@tag\s+$/.test(text.slice(0, m.index))) continue;
                out.push({ line: lineAt(text, m.index), found: m[0] });
            }
        }
        return out.sort((a, b) => a.line - b.line);
    },
    fix: 'flag',
};

/**
 * The renames of a project's application tags: each component's alpha tag → its tag now. The alpha
 * tag is what `deriveTag` gave with `pdx-` — or a `@tag 'pdx-x'`, which becomes `<prefix>-x`. A
 * component whose alpha tag is a library tag is left out: that name means the library's component,
 * which shadowed it.
 */
export function projectTagRenames(
    components: Iterable<{ tag: string; file: string; declaredTag?: string | null }>,
    prefix: string,
    isLibraryTag: (tag: string) => boolean,
): Map<string, string> {
    const out = new Map<string, string>();
    for (const c of components) {
        const old = c.declaredTag ?? deriveTag(c.file, 'pdx');
        const now = c.declaredTag?.startsWith(RESERVED_TAG_PREFIX) ? `${prefix}-${c.declaredTag.slice(RESERVED_TAG_PREFIX.length)}` : c.tag;
        if (old === now || isLibraryTag(old)) continue;
        out.set(old, now);
    }
    return out;
}
