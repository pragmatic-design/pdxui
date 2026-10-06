// HTML template minification — strips unnecessary whitespace.
// Preserves: <pre>/<code> content, significant text whitespace.
// Used as optional post-processing on generated html`` strings.

/**
 * Minify HTML inside a template string.
 * - Collapses whitespace between tags to one space: `>  <` → `> <`
 * - Collapses a run of whitespace inside text to a single space
 * - Preserves content inside <pre> and <code> blocks
 *
 * ⚠️ It does NOT touch the whitespace around an interpolation, and that is deliberate, not an
 * omission. This function runs at `plugin.ts:447` on `descriptor.template.content` — the raw
 * template, where interpolations are still `{{ … }}`, not `${…}`. A rule dropping the whitespace
 * after a `}` would match the closing brace of `{{ count }}` and eat the space after it:
 * `clicked {{ count }} times` would ship as `clicked 0times` while `vite dev` renders
 * `clicked 0 times` — the production build would show different TEXT from the one the author wrote,
 * and dev could not reveal it. It would match EVERY `}`, interpolation or not, so
 * `the set {1, 2} and the rest` would lose that space too.
 *
 * Whitespace inside text is content: `a {{ x }} b` is three pieces the author typed. Collapsing a RUN
 * of it is fine; removing the single space that separates two words is not.
 */
export function minifyHTML(html: string): string {
    // Protect <pre> and <code> blocks
    const preserved: string[] = [];
    let result = html.replace(/<(pre|code)[^>]*>[\s\S]*?<\/\1>/gi, (match) => {
        preserved.push(match);
        return `__PDX_PRESERVE_${preserved.length - 1}__`;
    });

    // Collapse whitespace between tags to ONE space, not to none. Dev renders through the browser's
    // parser, which keeps it; between two inline elements it is text the reader sees, and dropping it
    // would ship `<span>PDX</span> <span>UI</span>` as "PDXUI".
    result = result.replace(/>\s+</g, '> <');

    // Collapse multiple whitespace in text to single space
    result = result.replace(/\s{2,}/g, ' ');

    // Restore preserved blocks
    result = result.replace(/__PDX_PRESERVE_(\d+)__/g, (_, idx) => preserved[parseInt(idx)]);

    return result.trim();
}
