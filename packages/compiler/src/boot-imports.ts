// The boot modules an app gets from the pdx() plugin (#1246).
//
// Two behaviours an app relies on without calling anything used to run when core's modules loaded,
// in every app, whatever it used: the stored theme restored on <html>, and the start-up splash taken
// down. Core does nothing at load now; each lives in a boot module (`@pdxui/core/boot/theme`,
// `@pdxui/core/boot/splash`) that this plugin imports into an app that has the behaviour:
//
//   - the theme, into a module that imports the design system's themes — `@pdxui/design`, its `base`,
//     or a theme: what an app writes in `index.html` or its entry. A stored theme means something only
//     where the themes are loaded. A library component brings only its own stylesheet
//     (`@pdxui/design/components/x`), and its module stays as it is: the theme is the app's;
//   - the splash, into the page, when the page has it: written by the author, or injected by this
//     plugin (`splash.ts`). An inline module script added before Vite processes the page, so that
//     Vite resolves its import as it resolves the author's own scripts, in dev and in a build.

import type { Plugin } from 'vite';

/** The module that restores the stored theme. */
export const BOOT_THEME = '@pdxui/core/boot/theme';
/** The module that takes the start-up splash down. */
export const BOOT_SPLASH = '@pdxui/core/boot/splash';

// Match: a static import of the design system's themes, with or without bindings — `@pdxui/design`
// itself, `@pdxui/design/base`, `@pdxui/design/themes` or one theme (`/themes/neutral`); not a
// component's own stylesheet (`@pdxui/design/components/select`). Groups: none
const DESIGN_IMPORT = /(?:^|[\s;])import\s*(?:[^'"`;]*?\sfrom\s*)?['"]@pdxui\/design(?:\/base|\/themes(?:\/[^'"]*)?)?['"]/m;

/** Does `code` import the design system's themes, as an app does? */
export function importsDesign(code: string): boolean {
    return DESIGN_IMPORT.test(code);
}

/** `code` with the theme's boot module imported first, or null when it imports none of the themes. */
export function withThemeBoot(code: string): string | null {
    if (!importsDesign(code) || code.includes(BOOT_THEME)) return null;
    return `import '${BOOT_THEME}';\n${code}`;
}

/** The splash element's id, as `splash.ts` writes it and core's `browser/splash.ts` reads it. */
const SPLASH_ID = 'pdx-splash';

/**
 * `html` with the splash's boot module imported by a module script in its head, when the page has the
 * splash or `willInject` says the plugin will add it; otherwise `html` as it is.
 */
export function withSplashBoot(html: string, willInject: boolean): string {
    if (html.includes(BOOT_SPLASH)) return html;
    if (!willInject && !html.includes(`id="${SPLASH_ID}"`)) return html;
    const tag = `<script type="module">import '${BOOT_SPLASH}';</script>`;
    return html.includes('</head>') ? html.replace('</head>', `${tag}\n</head>`) : tag + html;
}

/**
 * The plugin that imports the boot modules. `splashInjected` answers whether the main plugin will
 * write the splash into this page (an app with routes, the splash not turned off).
 */
export function bootImportsPlugin(splashInjected: () => boolean): Plugin {
    return {
        name: 'pragmatic-pdx-boot',
        transform(code, id) {
            // Scripts and the modules Vite makes of a page's inline scripts; not stylesheets.
            if (!/\.(?:[cm]?[jt]sx?|pdx)(?:\?|$)/.test(id) && !id.includes('?html-proxy')) return null;
            const out = withThemeBoot(code);
            return out === null ? null : { code: out, map: null };
        },
        transformIndexHtml: {
            // Before Vite processes the page: the added script is then one of the page's own.
            order: 'pre',
            handler: (html: string) => withSplashBoot(html, splashInjected()),
        },
    };
}
