// The start-up splash, written into `index.html`.
//
// It has to be painted before any JavaScript runs — the JavaScript is what it stands in for — so it
// cannot be a custom element: it is plain HTML and an inline `<style>`, a fixed full-viewport SIBLING
// of the app root (inside it, mounting would clear it). `@pdxui/core`'s `browser/splash.ts` takes
// it away once the app says it is ready; the router says so for the first page it shows.

import { findOpenTag } from './text-scan';

/** What `pdx({ splash })` accepts. */
export interface SplashOptions {
    /** The name shown. Default: the page's `<title>`. */
    title?: string;
    /** An image URL shown above the name. */
    logo?: string;
    /** Keep the splash at least this long, in ms from the navigation's start. Default: none. */
    minDuration?: number;
}

const SPLASH_ID = 'pdx-splash';

// The theme's ground and ink when the stylesheet has arrived — in a build it is a render-blocking
// <link>, so it has — and the system's otherwise. `pointer-events: none` once leaving: the fade must
// not swallow the first click on the app under it.
const SPLASH_STYLE = `<style id="${SPLASH_ID}-style">
#${SPLASH_ID}{position:fixed;inset:0;z-index:2147483647;display:flex;flex-direction:column;gap:16px;align-items:center;justify-content:center;background:var(--pdx-color-bg,Canvas);color:var(--pdx-color-text,CanvasText);font:600 1.25rem/1.3 var(--pdx-font-sans,system-ui,sans-serif);transition:opacity .2s ease}
#${SPLASH_ID} img{max-width:96px;max-height:96px}
#${SPLASH_ID}.pdx-splash-leaving{opacity:0;pointer-events:none}
@media (prefers-reduced-motion:reduce){#${SPLASH_ID}{transition:none}}
</style>`;

/** The text of a `<title>`, or ''. */
function pageTitle(html: string): string {
    // `<title …>text</title>`, with no markup in the text. Scanned, not matched (#70).
    const open = findOpenTag(html, 'title');
    if (!open) return '';
    const lt = html.indexOf('<', open.end);
    if (lt === -1 || html.slice(lt, lt + 8).toLowerCase() !== '</title>') return '';
    return html.slice(open.end, lt).trim();
}

function escapeHtml(text: string): string {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * `html` with the splash: its style in the head, its element first in the body, and the body marked
 * `aria-busy` until the app is ready. Idempotent by content — Vite transforms the page more than
 * once per dev server — and a page with no `<body>` is returned as it is.
 */
export function injectSplash(html: string, options: SplashOptions = {}): string {
    if (html.includes(`id="${SPLASH_ID}"`)) return html;
    const body = findOpenTag(html, 'body');
    if (!body) return html;

    const title = escapeHtml(options.title ?? pageTitle(html));
    const logo = options.logo ? `<img src="${escapeHtml(options.logo)}" alt="">` : '';
    const min = options.minDuration && options.minDuration > 0 ? ` data-min-duration="${Math.round(options.minDuration)}"` : '';
    const element = `<div id="${SPLASH_ID}" aria-hidden="true"${min}>${logo}<span>${title}</span></div>`;
    const attrs = /\baria-busy\s*=/.test(body.attrs) ? body.attrs : `${body.attrs} aria-busy="true"`;

    html = html.slice(0, body.start) + `<body${attrs}>\n${element}` + html.slice(body.end);
    return html.includes('</head>') ? html.replace('</head>', `${SPLASH_STYLE}\n</head>`) : SPLASH_STYLE + html;
}
