import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { offlineEndpoint } from './offline-endpoint';
import { designTargetPlugin } from '../../../compiler/src/design-target';

// Scenarios don't use .pdx files — just HTML + ES modules importing @pdxui/*
// The pdx() plugin is not needed here, only aliases for workspace packages — and its design-target
// plugin, which gives the design CSS the form of the target.
//
// IMPORTANT: the alias targets must be ABSOLUTE. @rollup/plugin-alias resolves a relative
// target against the IMPORTING FILE, so a page in generated/ (one level deeper) would break
// the relative paths. With resolve() the aliases work from any depth (root and generated/).
const here = dirname(fileURLToPath(import.meta.url));
const ui = resolve(here, '../../src');
const core = resolve(here, '../../../core/src/index.ts');
// The router, for a hand-written page that mounts an outlet (keepalive-children.html, #268).
const router = resolve(here, '../../../router/src');
// The FOUNDATION, not the whole design system. Each component's stylesheet travels
// with the component, so the scenario pages must get it from the modules they import — which is
// what makes `pnpm certify` the proof that no component lost its styles. Aliasing the full entry
// here would load every stylesheet regardless and the 6263 contract measurements would be blind to
// a broken mapping.
const design = resolve(here, '../../../design/src/base.css');
const designComponents = resolve(here, '../../../design/src/components/layered');
const designThemes = resolve(here, '../../../design/src/themes/layered');

/**
 * One alias per `@pdxui/ui` sub-path export, pointing at its `development` target (the source).
 *
 * The same condition the rest of the workspace resolves by, and the reason it is read rather than
 * derived: `./icon/pdx-icon` is not `icon/pdx-icon.ts` by pattern, `./all` is `index.ts`, and a
 * rule inferred from the common case would be wrong for both.
 */
function uiSubpathAliases(): { find: string; replacement: string }[] {
    const pkg = JSON.parse(readFileSync(resolve(here, '../../package.json'), 'utf-8')) as {
        exports: Record<string, { development?: string } | string>;
    };
    const aliases: { find: string; replacement: string }[] = [];
    for (const [key, target] of Object.entries(pkg.exports)) {
        if (key === '.' || !key.startsWith('./')) continue;
        const dev = typeof target === 'string' ? target : target.development;
        if (!dev?.endsWith('.ts')) continue;   // ./manifest is JSON, and nothing imports it here
        aliases.push({
            find: `@pdxui/ui${key.slice(1)}`,
            replacement: resolve(here, '../..', dev.replace(/^\.\//, '')),
        });
    }
    // Longest first: Vite matches a string alias by PREFIX, so `@pdxui/ui/icon` must not
    // answer for `@pdxui/ui/icon/pdx-icon`.
    return aliases.sort((a, b) => b.find.length - a.find.length);
}

// The browser target the pages are certified for (#156): the design CSS in the form pdx() gives an
// app on that target, and core told the same. The default target unless PDX_TARGET says
// `baseline-2024`, the form with the behaviour attributes on <html>.
const target = process.env.PDX_TARGET === 'baseline-2024' ? 'baseline-2024' : 'baseline-2026';

export default defineConfig({
    server: { port: 5220 },
    define: { __PDX_TARGET__: JSON.stringify(target) },
    // A real endpoint for `offline-queue.html`, so that going offline is a network fact and not a
    // redefined `navigator.onLine`. It answers `/__offline/*` and nothing else.
    plugins: [offlineEndpoint(), designTargetPlugin(target)],
    resolve: {
        // An ARRAY, not an object: the design sub-paths need a regex, because each one resolves to
        // a FILE named after the component and a prefix alias would produce `<dir>/button` with no
        // extension. They come first — the same ordering trap this file documents for
        // `@pdxui/ui/*`. The string entries follow, mapped into the same shape.
        alias: [
            { find: /^@pdxui\/design\/components\/(.*)$/, replacement: `${designComponents}/$1.css` },
            { find: /^@pdxui\/design\/themes$/, replacement: resolve(here, '../../../design/src/themes-all.css') },
            { find: /^@pdxui\/design\/base$/, replacement: design },
            { find: /^@pdxui\/design\/themes\/(.*)$/, replacement: `${designThemes}/$1.css` },
            // EVERY sub-path @pdxui/ui exports, read from the package itself — not a hand-kept
            // list.
            //
            // Without an explicit entry the prefix alias below matches and resolves
            // `@pdxui/ui/avatar` to `<src>/index.ts/avatar`, which does not exist — the page
            // throws, `data-pdx-ready` never arrives, and the contract tests time out naming
            // nothing. The generated pages import what they render, so every sub-path must resolve.
            //
            // Generated from the export map, so a component added tomorrow is resolvable here by
            // being exported — which the component workflow already requires.
            ...uiSubpathAliases(),
            { find: /^@pdxui\/router\/outlet$/, replacement: resolve(router, 'outlet.ts') },
            { find: /^@pdxui\/router$/, replacement: resolve(router, 'index.ts') },
            ...Object.entries({
            '@pdxui/core': core,
            // The prefix alias, AFTER the sub-paths: `@pdxui/ui` alone is the whole library,
            // which the hand-written scenario pages (offline-queue.html and friends) still use.
            '@pdxui/ui': resolve(ui, 'index.ts'),
            '@pdxui/design': design,
            }).map(([find, replacement]) => ({ find, replacement })),
        ],
    },
});
