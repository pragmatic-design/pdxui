// pdx build --ssg (#160, part 5c): the client build, built to hydrate, then every static route rendered
// in Node and written as a page of its own, which the app takes over at boot instead of rendering it.
//
// 1. The client, with `pdx({ hydrate: true })`: each .pdx walks the markup it is handed, and the page
//    installs hydration and the outlet's adoption before the app's code runs.
// 2. The same app built for Node (`ssg-entry.ts`), run in a process of its own: the server DOM
//    installed first, the app's entry scripts and every lazy page imported, and the body of the built
//    `index.html` rendered for each route without parameters and each path `ssg.routes` names.
// 3. Each rendered body written into the built page, at the route's path.
//
// Each path is prepared as a navigation to it would be: the app's `onBeforeNavigate` hooks, awaited,
// then the route's guards against the permissions the app has set. `ssg.setup`, imported before the
// app's entries, is where the app sets what no visitor brings: a build session, a locale.
//
// What is not rendered is reported and not written: a path a hook refuses, a guard the permissions
// deny, a redirect, a pattern with parameters no path was given for. A component that
// renders as an empty host is reported with its reason, and the page is written: the client renders
// that component at boot.

import { existsSync, mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { tmpdir } from 'os';
import { dirname, join, resolve } from 'pathe';
import type { resolveConfig } from '../config/loader';
import type { Plugin } from 'vite';
import type { HydrateApi } from '@pdxui/compiler';
import { pdxPluginsFor } from './pdx-plugins';
import { PDX_HYDRATE_PLUGIN_NAME } from '../utils/vite-config';
import { SSG_ENTRY_ID, SSG_RUNNER, appEntries, ssgEntryPlugin, type SsgRender } from './ssg-entry';
import { bodyParts, generatedPage, pageFile, renderableMarkup } from './ssg-page';

/** A component written as an empty host, as the server reports it. */
export interface SsgSkippedComponent { readonly tag: string; readonly reason: string }

export interface SsgReport {
    /** The pages written, relative to the output, with the components each could not render. */
    readonly pages: { readonly path: string; readonly file: string; readonly skipped: SsgSkippedComponent[] }[];
    /** The routes not written, and why. */
    readonly skippedRoutes: { readonly path: string; readonly reason: string }[];
}

/** A static generation that could not run, with what to do about it. */
export class SsgError extends Error {}

/** Build the app at `cwd` into `outDir`, then generate a page for every route it can. */
export async function buildSsg(
    cwd: string,
    resolved: ReturnType<typeof resolveConfig>,
    outDir: string,
    sourcemap: boolean | 'hidden',
    /** The Vite config to build with, instead of the one Vite finds at `cwd`: an app's SSG variant. */
    configFile?: string,
): Promise<SsgReport> {
    if (resolved.ssgSetup && !existsSync(resolved.ssgSetup)) {
        throw new SsgError(`ssg.setup names ${resolved.ssgSetup}, and there is no such file.`);
    }
    const vite = await import('vite');
    const plugins = await pdxPluginsFor(vite, cwd, resolved, true, configFile);
    const sourceHtml = readFileSync(resolve(cwd, 'index.html'), 'utf-8');

    const preloads = hydrateApiReader();
    await vite.build({
        root: cwd,
        configFile,
        plugins: [...plugins, preloads.plugin],
        build: { outDir, minify: 'esbuild', target: resolved.target, sourcemap },
    });

    const serverDir = mkdtempSync(join(tmpdir(), 'pdx-ssg-'));
    try {
        await vite.build({
            root: cwd,
            configFile,
            logLevel: 'warn',
            plugins: [...plugins, ssgEntryPlugin(appEntries(sourceHtml), cwd, resolved.ssgSetup)],
            ssr: { noExternal: true },
            // Core's `DEV` is `process.env.NODE_ENV`, which a server build leaves to the process that
            // runs it. Fixed here to what the client build saw, so the markup the server writes is the
            // markup the client hydrates with — no development attribute on one side only.
            define: { 'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'production') },
            build: {
                // The entry is a virtual module: as a string here, Vite would read it as a path.
                ssr: true,
                outDir: serverDir,
                emptyOutDir: true,
                minify: false,
                // A failure on the server names the app's file and line, not the bundle's.
                sourcemap: true,
                rollupOptions: { input: SSG_ENTRY_ID, output: { entryFileNames: 'ssg-entry.mjs', format: 'es' } },
            },
        });
        return await generate(serverDir, outDir, resolved.ssgRoutes, resolved.ssgOrigin, (html, route) => preloads.api()?.retargetPreloads(html, route) ?? html);
    } finally {
        rmSync(serverDir, { recursive: true, force: true });
    }
}

/**
 * The pdx plugin's offer to a static build (its `api`, `HydrateApi`), from the client build's
 * resolved plugins: the project's own config may register pdx(), and then this build holds no
 * instance of it.
 */
function hydrateApiReader(): { plugin: Plugin; api(): HydrateApi | null } {
    let found: HydrateApi | null = null;
    return {
        plugin: {
            name: 'pragmatic-pdx-ssg-preloads',
            configResolved(config) {
                const hydrate = config.plugins.find((p) => p.name === PDX_HYDRATE_PLUGIN_NAME) as { api?: HydrateApi } | undefined;
                found = hydrate?.api ?? null;
            },
        },
        api: () => found,
    };
}

/**
 * Render every route in a node process of its own, then write each page. Source maps are on there, so
 * a failure names the app's file and line, not the bundle's.
 */
async function generate(
    serverDir: string,
    outDir: string,
    extraPaths: readonly string[],
    /** `ssg.origin`: what a relative fetch is resolved against while the routes render (#239). */
    origin: string | null,
    /** A page for `route` announcing that route's chunks instead of the landing route's. */
    retarget: (html: string, route: string) => string,
): Promise<SsgReport> {
    const built = readFileSync(join(outDir, 'index.html'), 'utf-8');
    const parts = bodyParts(built);
    if (!parts) throw new SsgError('the built index.html has no <body> to render the routes into.');

    const runner = join(serverDir, 'ssg-run.mjs');
    const input = join(serverDir, 'ssg-input.json');
    const output = join(serverDir, 'ssg-output.json');
    writeFileSync(runner, SSG_RUNNER);
    writeFileSync(input, JSON.stringify({ markup: renderableMarkup(parts), extraPaths, origin }));
    try {
        await promisify(execFile)(process.execPath, ['--enable-source-maps', runner, join(serverDir, 'ssg-entry.mjs'), input, output]);
    } catch (e) {
        throw new SsgError(`rendering on the server failed: ${(e as { stderr?: string }).stderr?.trim() || (e as Error).message}`);
    }
    const rendered = JSON.parse(readFileSync(output, 'utf-8')) as SsgRender;
    if (rendered.failed) {
        // A fetch to a path of the app's own server, with nothing to resolve it against in Node.
        const hint = !origin && /Failed to parse URL from \//.test(rendered.failed.message)
            ? '\n  A loader fetched a path of the app\'s own server: name where its API answers during the build, ssg: { origin } in pdx.config.'
            : '';
        throw new SsgError(`generating ${rendered.failed.path} failed: ${rendered.failed.message}${hint}`);
    }
    if (rendered.error) {
        throw new SsgError(`the app's modules could not run on the server, where there is no document or window: ${rendered.error}\n  Move what reads the browser into onMount, or behind a check that it is there.`);
    }

    // A setup or a render that reads a browser global stops the build, before any page is written: on
    // the server it is a component written as an empty host, and the read belongs in onMount (#160).
    // One line per component and global, with where it read it, the first time it did.
    const reads = new Map<string, string>();
    for (const page of rendered.pages) {
        for (const s of page.skipped) {
            const key = `<${s.tag}> reads \`${s.global}\``;
            if (s.global && !reads.has(key)) reads.set(key, s.at ? ` at ${s.at}` : '');
        }
    }
    if (reads.size > 0) {
        const list = [...reads].map(([what, at]) => `  ${what}${at}`).join('\n');
        throw new SsgError(`a setup or a render reads the browser, and it runs on the server too, where there is no browser:\n${list}\n  Move the read into onMount, which runs only in the browser, or guard it: typeof window !== 'undefined'.`);
    }

    const report: SsgReport = { pages: [], skippedRoutes: [...rendered.skippedRoutes] };
    for (const page of rendered.pages) {
        const file = pageFile(page.path);
        mkdirSync(dirname(join(outDir, file)), { recursive: true });
        writeFileSync(join(outDir, file), retarget(generatedPage(parts, page.html, page.head), page.route));
        report.pages.push({ path: page.path, file, skipped: page.skipped });
    }
    return report;
}
