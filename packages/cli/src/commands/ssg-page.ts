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

// Match: a <script …>…</script> element. The content of a script is never markup.
const SCRIPT = /<script\b[^>]*>[\s\S]*?<\/script>/gi;
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
    const inner = html.slice(start, close);
    return {
        before: html.slice(0, start),
        markup: inner.replace(SCRIPT, '').trim(),
        scripts: inner.match(SCRIPT) ?? [],
        after: html.slice(close),
    };
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
