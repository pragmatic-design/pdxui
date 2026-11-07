// A generated page, from the `index.html` the client build wrote (#160, part 5c): the same document,
// with the body's markup rendered for one route. Pure functions over strings; `build-ssg.ts` runs them.

/** The body of a built page: the markup the server renders, and the scripts, which stay as they are. */
export interface BodyParts {
    /** Everything up to the end of the `<body>` tag. */
    readonly before: string;
    /** The markup inside the body, without its scripts. */
    readonly markup: string;
    /** The body's scripts, in their order. */
    readonly scripts: string[];
    /** From `</body>` to the end. */
    readonly after: string;
}

// Match: the start-up splash the plugin paints (`compiler/src/splash.ts`), its style, and the
// `aria-busy` it puts on the body.
const SPLASH_ELEMENT = /<div id="pdx-splash"[^>]*>[\s\S]*?<\/div>\s*/;
const SPLASH_STYLE = /<style id="pdx-splash-style">[\s\S]*?<\/style>\s*/;
const BODY_BUSY = /(<body\b[^>]*?)\s+aria-busy="true"/;

/** Split a built page at its body; null when it has none. */
export function bodyParts(html: string): BodyParts | null {
    const open = /<body\b[^>]*>/i.exec(html);
    const close = html.toLowerCase().lastIndexOf('</body>');
    if (!open || close < open.index) return null;
    const start = open.index + open[0].length;
    const { markup, scripts } = splitScripts(html.slice(start, close));
    return { before: html.slice(0, start), markup: markup.trim(), scripts, after: html.slice(close) };
}

/**
 * The body cut into its markup and its script elements, read the way the HTML parser reads them: a
 * script runs from `<script` to the first `</script` followed by a space, a slash or `>`, whatever
 * its content says. Split, not filtered — every character lands on one side or the other.
 */
function splitScripts(inner: string): { markup: string; scripts: string[] } {
    const lower = inner.toLowerCase();
    const scripts: string[] = [];
    let markup = '';
    let at = 0;
    for (let open = tagAt(lower, '<script', at); open !== -1; open = tagAt(lower, '<script', at)) {
        const close = tagAt(lower, '</script', open);
        const gt = close === -1 ? -1 : lower.indexOf('>', close);
        const end = gt === -1 ? inner.length : gt + 1;
        markup += inner.slice(at, open);
        scripts.push(inner.slice(open, end));
        at = end;
    }
    return { markup: markup + inner.slice(at), scripts };
}

/** Where `name` opens a tag from `from` on: followed by a space, `/`, `>` or the end, not `<scripts-list`. */
function tagAt(lower: string, name: string, from: number): number {
    for (let i = lower.indexOf(name, from); i !== -1; i = lower.indexOf(name, i + 1)) {
        const next = lower.charAt(i + name.length);
        if (next === '' || next === '>' || next === '/' || /\s/.test(next)) return i;
    }
    return -1;
}

/**
 * The page with the body's markup replaced by what the server rendered for a route. The splash goes:
 * it covers a page with nothing in it yet, and this one has its content.
 */
export function generatedPage(parts: BodyParts, rendered: string): string {
    const before = parts.before.replace(SPLASH_STYLE, '').replace(BODY_BUSY, '$1');
    const scripts = parts.scripts.length > 0 ? `\n${parts.scripts.join('\n')}` : '';
    return `${before}\n${rendered}${scripts}\n${parts.after}`;
}

/** The body's markup without the splash, which the server does not render. */
export function renderableMarkup(parts: BodyParts): string {
    return parts.markup.replace(SPLASH_ELEMENT, '').trim();
}

/** Where a route's page is written, relative to the output: `/` → `index.html`, `/a/b` → `a/b/index.html`. */
export function pageFile(path: string): string {
    const segments = path.split('/').filter(Boolean);
    return segments.length === 0 ? 'index.html' : `${segments.join('/')}/index.html`;
}
