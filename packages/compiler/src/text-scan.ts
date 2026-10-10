// Linear scans of markup and source text.
//
// Each replaces a regular expression that took polynomial time on a crafted file (#70): an opening
// tag repeated without its `>`, a comment opened and never closed, a `:param(` without its `)`. The
// input is the developer's own source, so the cost was a build or an editor stalling on one file, not
// an attack — but the compiler reads every file in a project, and the fix costs nothing.
//
// The shape they share: find the opener with indexOf, then the closer with indexOf, and when the
// closer is not there at all, stop — a later opener cannot find it either. That last step is what a
// regex retrying from every position does not know.

/** Whitespace as `\s` reads it in the markup these scans see. */
export function isSpace(ch: string | undefined): boolean {
    return ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r' || ch === '\f' || ch === '\v';
}

/** An opening tag found in markup: where it starts and ends, its text, and what lies between name and `>`. */
export interface OpenTag {
    start: number;
    /** Just past its `>`. */
    end: number;
    text: string;
    /** Everything between the tag name and the `>`, as written (a leading space, a trailing `/`). */
    attrs: string;
}

/**
 * Every opening `<name …>` in `source`, in order, the name matched without regard to case and
 * followed by whitespace, `/` or `>` — so `<head>` and not `<header>`. The tag ends at the first `>`,
 * as `<name[^>]*>` did.
 */
export function* openTags(source: string, name: string): Generator<OpenTag> {
    const lower = source.toLowerCase();
    const needle = '<' + name.toLowerCase();
    let i = lower.indexOf(needle);
    while (i !== -1) {
        const after = i + needle.length;
        const ch = source[after];
        if (ch === undefined) return;
        if (ch === '>' || ch === '/' || isSpace(ch)) {
            const close = source.indexOf('>', after);
            // No `>` after this one, so none after any later one either.
            if (close === -1) return;
            yield { start: i, end: close + 1, text: source.slice(i, close + 1), attrs: source.slice(after, close) };
            i = lower.indexOf(needle, close + 1);
        } else {
            i = lower.indexOf(needle, i + 1);
        }
    }
}

/** The first opening `<name …>` in `source`, or null. */
export function findOpenTag(source: string, name: string): OpenTag | null {
    for (const tag of openTags(source, name)) return tag;
    return null;
}

/**
 * The content of the first `<name …>…</name>` element, or null: what `<name[^>]*>([\s\S]*?)<\/name>`
 * captured. The closing tag is matched as written, in lower case, as that pattern did.
 */
export function elementContent(source: string, name: string): string | null {
    const open = findOpenTag(source, name);
    if (!open) return null;
    const close = source.indexOf(`</${name}>`, open.end);
    return close === -1 ? null : source.slice(open.end, close);
}

/**
 * Every `<name …>…</name>` element in `source`, as [start of the opening tag, start of the body, end of
 * the body, end of the closing tag]. The closing tag is matched in any case and may have whitespace
 * before its `>` (`</script >`), as a browser reads it; an element that never closes is not listed.
 */
function elementSpans(source: string, name: string): [number, number, number, number][] {
    const lower = source.toLowerCase();
    const closer = `</${name.toLowerCase()}`;
    const out: [number, number, number, number][] = [];
    let from = 0;
    // One pass over the opening tags; one inside an element already taken (a `<script>` named in a
    // script's own text) is that element's content, not a new one.
    for (const open of openTags(source, name)) {
        if (open.start < from) continue;
        let close = lower.indexOf(closer, open.end);
        let end = -1;
        while (close !== -1) {
            let k = close + closer.length;
            while (isSpace(source[k])) k++;
            if (source[k] === '>') { end = k + 1; break; }
            close = lower.indexOf(closer, close + 1);
        }
        // Not closed: no later one can close either.
        if (end === -1) break;
        out.push([open.start, open.end, close, end]);
        from = end;
    }
    return out;
}

/** `source` without its `<name>` elements, each removed with its content: a `<script>` or `<style>` block. */
export function removeElements(source: string, name: string): string {
    let out = '';
    let at = 0;
    for (const [start, , , end] of elementSpans(source, name)) {
        out += source.slice(at, start);
        at = end;
    }
    return out + source.slice(at);
}

/** The content of every `<name>` element in `source`, in order. */
export function elementBodies(source: string, name: string): string[] {
    return elementSpans(source, name).map(([, bodyStart, bodyEnd]) => source.slice(bodyStart, bodyEnd));
}

/** `source` without its `<!-- … -->` comments. An opened comment that never closes stays, as before. */
export function removeHtmlComments(source: string): string {
    let out = '';
    let from = 0;
    for (;;) {
        const open = source.indexOf('<!--', from);
        if (open === -1) break;
        const close = source.indexOf('-->', open + 4);
        if (close === -1) break;
        out += source.slice(from, open);
        from = close + 3;
    }
    return out + source.slice(from);
}

const isWordChar = (ch: string | undefined): boolean => ch !== undefined && /\w/.test(ch);

/** A `:name` in a route path, with the text of its `(…)` when it has one. */
export interface RouteParam {
    name: string;
    /** Between the parentheses; undefined when the name is not followed by a closed `(…)`. */
    constraint?: string;
}

/**
 * The `:name` and `:name(constraint)` parameters of a route path, left to right: what
 * `/:(\w+)(?:\(([^)]*)\))?/g` found. The constraint runs to the first `)`.
 */
export function routeParams(path: string): RouteParam[] {
    const out: RouteParam[] = [];
    // Once there is no `)` after some point, there is none after any later point.
    let noCloseFrom = Infinity;
    let i = path.indexOf(':');
    while (i !== -1) {
        let j = i + 1;
        while (isWordChar(path[j])) j++;
        if (j === i + 1) { i = path.indexOf(':', i + 1); continue; }
        const name = path.slice(i + 1, j);
        if (path[j] === '(' && j + 1 < noCloseFrom) {
            const close = path.indexOf(')', j + 1);
            if (close !== -1) {
                out.push({ name, constraint: path.slice(j + 1, close) });
                i = path.indexOf(':', close + 1);
                continue;
            }
            noCloseFrom = j + 1;
        }
        out.push({ name });
        i = path.indexOf(':', j);
    }
    return out;
}

/**
 * The text of every opening tag in markup — `<` and a letter, its name, its attributes up to the `>`
 * that is not inside a quoted value — as `/<[A-Za-z][\w-]*(?:[^>"']|"[^"]*"|'[^']*')*>/g` matched.
 *
 * Where the markup runs out inside a tag — a quote that never closes, no `>` — the scan stops there.
 * The regex retried from every later `<`, which is the quadratic part, and in markup that broken the
 * tags it found after that point were found by reading half of them inside a quoted value.
 */
export function openingTagTexts(markup: string): string[] {
    const out: string[] = [];
    let i = markup.indexOf('<');
    while (i !== -1) {
        if (!/[A-Za-z]/.test(markup[i + 1] ?? '')) { i = markup.indexOf('<', i + 1); continue; }
        let j = i + 2;
        let end = -1;
        while (j < markup.length) {
            const ch = markup[j];
            if (ch === '>') { end = j; break; }
            if (ch === '"' || ch === "'") {
                const q = markup.indexOf(ch, j + 1);
                if (q === -1) break;
                j = q + 1;
                continue;
            }
            j++;
        }
        if (end === -1) return out;
        out.push(markup.slice(i, end + 1));
        i = markup.indexOf('<', end + 1);
    }
    return out;
}
