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
/**
 * `html` with every `<pre …>…</pre>` and `<code …>…</code>` replaced by a placeholder, the blocks
 * pushed to `preserved` in order: what `/<(pre|code)[^>]*>[\s\S]*?<\/\1>/gi` replaced. Scanned, not
 * matched — that pattern took quadratic time on `<pre` repeated without its `>` or its `</pre>` (#70).
 */
function preserveBlocks(html: string, preserved: string[]): string {
    const lower = html.toLowerCase();
    // Per name, the position after which its closing tag does not occur.
    const noClose: Record<string, number> = {};
    // Per name, the next opener found at or after `at`, kept until `at` passes it: searching again
    // from every block would read the file once per block.
    const next: Record<string, number> = { pre: -2, code: -2 };
    const nextOpener = (name: string, at: number): number => {
        if (at >= (noClose[name] ?? Infinity)) return -1;
        if (next[name] === -1 || next[name] >= at) return next[name];
        return (next[name] = lower.indexOf('<' + name, at));
    };
    let out = '';
    let from = 0;
    let at = 0;
    for (;;) {
        const candidates = ['pre', 'code']
            .map((name) => ({ name, i: nextOpener(name, at) }))
            .filter((c) => c.i !== -1)
            .sort((a, b) => a.i - b.i);
        if (candidates.length === 0) break;
        const { name, i } = candidates[0];
        const gt = html.indexOf('>', i + name.length + 1);
        // No `>` after this opener, so no later opener can end either.
        if (gt === -1) break;
        const closeTag = `</${name}>`;
        const close = lower.indexOf(closeTag, gt + 1);
        if (close === -1) {
            noClose[name] = i;
            at = i + 1;
            continue;
        }
        const end = close + closeTag.length;
        preserved.push(html.slice(i, end));
        out += html.slice(from, i) + `__PDX_PRESERVE_${preserved.length - 1}__`;
        from = at = end;
    }
    return out + html.slice(from);
}

export function minifyHTML(html: string): string {
    // Protect <pre> and <code> blocks
    const preserved: string[] = [];
    let result = preserveBlocks(html, preserved);

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
