// The browser build of @pdxui/ui, for a page that loads the library from a CDN with no build step
// (#1163), into dist/browser/:
//   • `pdx-ui.js` registers every component and re-exports core's API; the package's `unpkg` and
//     `jsdelivr` fields name it, so `https://unpkg.com/@pdxui/ui` serves it;
//   • one module per entry of the library build, at the same path (`button/pdx-button.js`), for a
//     page that loads only the components it uses;
//   • `core.js`, core's API alone.
// Every entry shares one chunk of core, so a page that mixes them has one core.
//
// It differs from the library build (library-config.ts) in three ways, each because a browser is the
// last stop and no bundler follows:
//   • @pdxui/core is bundled, not external: a browser cannot resolve its bare name. The entry
//     re-exports core's API so the page has one core;
//   • `process.env.NODE_ENV` is replaced with "production", as core's own CDN bundle does: nothing
//     after this build would replace it, and a browser has no `process`;
//   • the components' stylesheet imports (`@pdxui/design/...`) are left out. The page links
//     @pdxui/design's flattened sheet, which carries every component's styles; imported here they would
//     be CSS loaded as modules, which a browser refuses, or a second copy of those styles.
//
// Run after the library build, with `emptyOutDir: false`, so it adds dist/browser/ beside dist/.
import { defineConfig, type Plugin } from 'vite';
import { libraryPlugins } from './library-config';
// @ts-expect-error — plain .mjs build script, no type declarations by design
import { libraryEntries } from './scripts/library-entries.mjs';

/** The library build's entries, with the barrel replaced by the browser entry, plus core's API. */
function browserEntries(): Record<string, string> {
    const modules = Object.entries(libraryEntries(__dirname) as Record<string, string>).filter(([name]) => name !== 'index');
    return { ...Object.fromEntries(modules), 'pdx-ui': 'src/browser.ts', core: 'src/browser-core.ts' };
}

/** The components' stylesheet imports resolve to nothing in this build: the page links the sheet. */
function stylesFromTheSheet(): Plugin {
    const EMPTY = '\0pdx-browser-style';
    return {
        name: 'pdx-browser-styles-from-the-sheet',
        enforce: 'pre',
        resolveId(id) {
            return /^@pdxui\/design(\/|$)/.test(id) ? EMPTY : null;
        },
        load(id) {
            return id === EMPTY ? '' : null;
        },
    };
}

export default defineConfig({
    plugins: [stylesFromTheSheet(), ...libraryPlugins()],
    define: {
        'process.env.NODE_ENV': '"production"',
    },
    build: {
        emptyOutDir: false,
        outDir: 'dist/browser',
        target: 'es2022',
        minify: 'esbuild',
        // No source maps, as the library build ships none: measured, they were 7.9 MB of the 11.9 MB
        // this build adds, paid by every install for the pages that open a debugger on CDN code.
        sourcemap: false,
        lib: {
            entry: browserEntries(),
            formats: ['es'],
        },
        rollupOptions: {
            external: [],
            output: {
                entryFileNames: '[name].js',
                chunkFileNames: 'chunks/[name]-[hash].js',
            },
        },
    },
});
