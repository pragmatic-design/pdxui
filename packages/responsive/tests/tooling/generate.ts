/**
 * THE GENERATOR — from Component Test Manifests to test infrastructure.
 *
 * It reads manifests/ *.manifest.ts and produces:
 *  1. scenarios/generated/tier-<tier>.html  — one page per tier, one section per scenario,
 *     one import per component the page renders (NOT the barrel — see pageTags). Served by
 *     Vite on :5220.
 *  2. contracts/generated/manifests.ts      — a registry with static imports + the scenarioPage map,
 *     importable from the Playwright runners.
 *
 * Running it (Node 22+, native type stripping — the manifests only have `import type`):
 *   node tests/tooling/generate.ts
 *
 * The manifests are the ONLY thing written by hand. Everything in generated/ is AUTO-GENERATED.
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { ComponentManifest } from '../manifests/_types';
import { sharedRadioNames } from './radio-names.ts';

const here = dirname(fileURLToPath(import.meta.url));
const testsDir = join(here, '..');                       // packages/responsive/tests
const manifestsDir = join(testsDir, 'manifests');
const scenariosOut = join(testsDir, '..', '..', 'ui', 'tests', 'scenarios', 'generated');
const registryOut = join(testsDir, 'integration', 'ui-components', 'contracts', 'generated');

interface Loaded {
    /** the exported variable, 'button' for one */
    varName: string;
    /** the relative file without its extension, 'button.manifest' for one */
    importPath: string;
    manifest: ComponentManifest;
}

/** The tier's slug for the file name, '1A' → '1a' */
function tierSlug(tier: string): string {
    return tier.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

async function loadManifests(): Promise<Loaded[]> {
    const files = readdirSync(manifestsDir)
        .filter((f) => f.endsWith('.manifest.ts'))
        .sort();
    const loaded: Loaded[] = [];
    for (const f of files) {
        const mod = await import(pathToFileURL(join(manifestsDir, f)).href);
        // It prefers the named export (`button`, for one); it falls back to default.
        const namedKey = Object.keys(mod).find((k) => k !== 'default');
        const manifest: ComponentManifest = mod.default ?? mod[namedKey!];
        loaded.push({
            varName: namedKey ?? manifest.name,
            importPath: f.replace(/\.ts$/, ''),
            manifest,
        });
    }
    return loaded;
}

/**
 * Tag -> the `@pdxui/ui` sub-path that registers it, read from the package rather than guessed.
 *
 * `pdx-icon` lives at `./icon/pdx-icon` and a module may register more than one tag, so a rule
 * inferred from the common case is wrong twice over. Each export's `development` target is read and
 * every `component('pdx-...')` / `customElements.define('pdx-...')` in it is credited to that
 * sub-path — the same source of truth the scenario server's aliases are generated from.
 */
function uiTagMap(): Map<string, string> {
    const uiDir = join(testsDir, '..', '..', 'ui');
    const pkg = JSON.parse(readFileSync(join(uiDir, 'package.json'), 'utf-8')) as {
        exports: Record<string, { development?: string } | string>;
    };
    const map = new Map<string, string>();
    for (const [key, target] of Object.entries(pkg.exports)) {
        if (key === '.' || !key.startsWith('./') || key === './all') continue;
        const dev = typeof target === 'string' ? target : target.development;
        if (!dev?.endsWith('.ts')) continue;
        const file = join(uiDir, dev.replace(/^\.\//, ''));
        if (!existsSync(file)) continue;
        const src = readFileSync(file, 'utf-8');
        for (const m of src.matchAll(/(?:component|customElements\.define)\(\s*'(pdx-[a-z0-9-]+)'/g)) {
            if (!map.has(m[1])) map.set(m[1], key.slice(2));
        }
    }
    return map;
}

const TAG_SUBPATH = uiTagMap();

/**
 * What a page must import: every specifier its manifests DECLARE, plus a module for every
 * `<pdx-*>` its markup or a SETUP script builds.
 *
 * `imports` — *"the sub-paths to import to register the custom element… this is for targeted
 * imports"* — is the authority here, not a glob, because
 * a scenario can be CSS-ONLY: `tab-basic` is a plain `<div class="pdx-tabs">` with no element to
 * find, and what paints it is a stylesheet, not a component. Four manifests are in that shape;
 * three of them need nothing, because `.pdx-table`, `.pdx-breadcrumb` and the CSS-only tier live
 * in `base.css` by design (gen-layered-entries.mjs, SHARED).
 *
 * The markup scan stays for what a scenario renders without declaring it — a cross-component page
 * putting somebody else's element inside its own.
 */
function pageImports(items: Loaded[], source: string): { specifiers: string[]; tags: string[] } {
    const specifiers = new Set<string>();
    for (const { manifest } of items) for (const spec of manifest.imports ?? []) specifiers.add(spec);

    const tags = new Set<string>();
    for (const m of source.matchAll(/<(pdx-[a-z0-9-]+)[\s/>]/g)) tags.add(m[1]);
    for (const m of source.matchAll(/createElement\(\s*'(pdx-[a-z0-9-]+)'/g)) tags.add(m[1]);
    const known = [...tags].filter((t) => TAG_SUBPATH.has(t)).sort();
    for (const t of known) specifiers.add(`@pdxui/ui/${TAG_SUBPATH.get(t)}`);

    return { specifiers: [...specifiers].sort(), tags: known };
}

/** Generates the HTML of a tier page, with every section of its components. */
function renderTierHtml(tier: string, items: Loaded[]): string {
    const sections = items
        .flatMap(({ manifest }) =>
            manifest.scenarios.map(
                (s) => `
    <section data-scenario="${s.id}">
        <h3>${s.title}</h3>
        ${s.html.trim()}
    </section>`,
            ),
        )
        .join('\n');

    // The map of per-scenario `setup` scripts (run AFTER the mount, before data-pdx-ready).
    // It is there to bring a component into a state markup cannot express (a boolean prop whose
    // default is true → sb.open=false): the property can only be set once the custom element upgrades.
    const setupEntries = items
        .flatMap(({ manifest }) => manifest.scenarios.filter((s) => s.setup))
        // async: a setup may use `await` (waiting for a rAF before the measurement, for one).
        .map((s) => `        ${JSON.stringify(s.id)}: async function () { ${s.setup} },`)
        .join('\n');

    const { specifiers, tags } = pageImports(items, sections + setupEntries);
    const imports = specifiers.map((s) => `        import '${s}';`).join('\n');
    const tagList = JSON.stringify(tags);

    return `<!DOCTYPE html>
<!-- AUTO-GENERATED by tests/tooling/generate.ts — do NOT edit by hand. Tier ${tier}. -->
<html lang="en" pdx-theme="neutral" pdx-scheme="light">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Contracts — Tier ${tier}</title>
    <style>
        /* The THEME decides the family. A font hardcoded here would silently suppress the
           archetype's typography on every scenario page — half of what a design language is.
           The fallback keeps the page readable if the design CSS ever fails to load. */
        body { font-family: var(--pdx-font-sans, system-ui); padding: 40px; margin: 0; }
        section { margin-bottom: 60px; padding: 20px; }
        section[hidden] { display: none; }
        h3 { margin: 0 0 16px; color: #666; font-size: 14px; text-transform: uppercase; }
        .row { display: flex; gap: 16px; align-items: center; flex-wrap: wrap; margin-bottom: 16px; }
    </style>
    <script type="module">
        // The foundation and EVERY theme — but NOT the component styles, which each component
        // imports for itself. That is what makes this harness the proof: a component whose
        // stylesheet does not travel with it fails a contract here, loudly, across 13 themes.
        // Importing the whole design package would load every stylesheet regardless, and the
        // measurements would be blind to a broken mapping.
        import '@pdxui/design/base';
        import '@pdxui/design/themes';
        // ONE IMPORT PER COMPONENT THIS PAGE RENDERS, and that is the whole point of the harness.
        // Each component carries its own CSS, so that an app ships the styles of what it renders.
        // A barrel import here would register every component and load every stylesheet, and a
        // scenario could then rely on a neighbour's import without anything noticing.
${imports}

        const params = new URLSearchParams(location.search);
        const theme = params.get('theme');
        const scheme = params.get('scheme');
        const scenario = params.get('scenario');
        if (theme) document.documentElement.setAttribute('pdx-theme', theme);
        if (scheme) document.documentElement.setAttribute('pdx-scheme', scheme);
        if (scenario) {
            document.querySelectorAll('section[data-scenario]').forEach((s) => {
                const active = s.getAttribute('data-scenario') === scenario;
                s.hidden = !active;
                // Close the overlays in the sections that are NOT active: an open overlay (dialog/drawer/
                // bottom-sheet) turns on the focus trap, which puts aria-hidden on its siblings and
                // pollutes the whole page's a11y (aria-hidden-focus) even where the section is display:none.
                if (!active) s.querySelectorAll('[open]').forEach((el) => el.removeAttribute('open'));
            });
        }
        // The per-scenario setup scripts (state markup cannot express). Run after the CEs upgrade
        // and after their initial render, before signalling ready.
        const __setups = {
${setupEntries}
        };
        // Signals that the mount is complete, for deterministic waits (no waitForTimeout).
        // The tags THIS page imports, not a fixed one: a page that renders no button would wait
        // on pdx-button for a promise nothing resolves, and data-pdx-ready would never arrive.
        const __tags = ${tagList};
        Promise.allSettled(__tags.map((t) => customElements.whenDefined(t))).finally(() => {
            // 1st rAF: lets the initial render of the active CEs finish.
            requestAnimationFrame(async () => {
                try { if (scenario && __setups[scenario]) await __setups[scenario](); }
                catch (e) { console.error('scenario setup failed:', scenario, e); }
                // 2 rAFs: let the reactive mutation the setup caused re-render, then ready.
                requestAnimationFrame(() => requestAnimationFrame(() =>
                    document.documentElement.setAttribute('data-pdx-ready', '1')));
            });
        });
    </script>
</head>
<body>
${sections}
</body>
</html>
`;
}

/**
 * The loaders the hand-written pages beside the generated ones use (gotchas, touch-targets, behavior):
 * each builds one case per load, so it registers that case's components and nothing else.
 *
 * Not the barrel: gotchas.html is opened ~400 times a certify run, touch-targets ~500, and with the
 * barrel every load asks the scenario server for 414 modules — the whole library, chart included, for
 * a page that moves one pdx-aspect-ratio. Under that load the server refuses a chart module mid-run,
 * and a push is blocked by a failure that is not in the code.
 *
 * One literal `import()` per tag, so Vite resolves each through the same alias the generated pages
 * use; a bare specifier assembled at runtime would not be resolved at all.
 */
function renderLoaders(): string {
    const entries = [...TAG_SUBPATH]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([tag, sub]) => `    ['${tag}', () => import('@pdxui/ui/${sub}')],`)
        .join('\n');
    // A Map, not an object: the tag comes from the page's URL, and `LOADERS[tag]()` on an object would
    // reach `constructor` or `toString` for a name no module registers (#72).
    return `// AUTO-GENERATED by tests/tooling/generate.ts — do NOT edit by hand.
// tag → the module of @pdxui/ui that registers it (read from the package's export map).

export const LOADERS = new Map([
${entries}
]);

/** The library tags named anywhere in \`text\` (markup, a case's source): what a case builds. */
export function tagsIn(text) {
    const tags = new Set();
    for (const m of String(text).matchAll(/pdx-[a-z0-9]+(?:-[a-z0-9]+)*/g)) if (LOADERS.has(m[0])) tags.add(m[0]);
    return [...tags];
}

/** Registers these tags before the page builds with them. A tag no module registers is an error. */
export async function loadTags(tags) {
    const unknown = tags.filter((t) => !LOADERS.has(t));
    if (unknown.length > 0) throw new Error('no @pdxui/ui module registers ' + unknown.join(', '));
    await Promise.all(tags.map((t) => {
        const load = LOADERS.get(t);
        if (typeof load !== 'function') throw new Error('no @pdxui/ui module registers ' + t);
        return load();
    }));
}
`;
}

/** Generates the TS registry with static imports + the scenarioPage map. */
function renderRegistry(loaded: Loaded[]): string {
    const imports = loaded
        .map((l) => `import { ${l.varName} } from '../../../../manifests/${l.importPath}';`)
        .join('\n');
    const list = loaded.map((l) => l.varName).join(', ');

    // scenario id → the slug of the tier page that holds it
    const scenarioPage: Record<string, string> = {};
    for (const l of loaded) {
        const slug = tierSlug(l.manifest.tier);
        for (const s of l.manifest.scenarios) scenarioPage[s.id] = `tier-${slug}`;
    }
    const pageEntries = Object.entries(scenarioPage)
        .map(([k, v]) => `    ${JSON.stringify(k)}: ${JSON.stringify(v)},`)
        .join('\n');

    return `// AUTO-GENERATED by tests/tooling/generate.ts — do NOT edit by hand.
import type { ComponentManifest } from '../../../../manifests/_types';
${imports}

/** Every component manifest. */
export const manifests: ComponentManifest[] = [${list}];

/** The map from scenario id to the HTML page (slug) that holds it. */
export const scenarioPage: Record<string, string> = {
${pageEntries}
};
`;
}

/**
 * The JSON catalogue: the same information as the TS registry, but consumable at RUNTIME by
 * an app (the builder fetches it) rather than at build time by a Playwright runner.
 * It sits next to the generated pages, so it is served from the same origin as they are.
 */
function renderCatalog(loaded: Loaded[]): string {
    const components = loaded.map(({ manifest }) => ({
        name: manifest.name,
        // The cross manifests have no single `tag` but `tags` (several components per scenario).
        tags: manifest.tag ? [manifest.tag] : ((manifest as unknown as { tags?: string[] }).tags ?? []),
        tier: manifest.tier,
        status: manifest.status,
        page: `tier-${tierSlug(manifest.tier)}`,
        scenarios: manifest.scenarios.map((s) => ({
            id: s.id,
            title: s.title,
            ...(s.viewport ? { viewport: s.viewport } : {}),
        })),
    }));
    // Sorted by name: the generated file's diff stays readable between two runs.
    components.sort((a, b) => a.name.localeCompare(b.name));
    return JSON.stringify({ components }, null, 2) + '\n';
}

async function main() {
    const loaded = await loadManifests();
    if (loaded.length === 0) {
        console.error('No manifest found in', manifestsDir);
        process.exit(1);
    }

    // Group by tier
    const byTier = new Map<string, Loaded[]>();
    for (const l of loaded) {
        const t = l.manifest.tier;
        if (!byTier.has(t)) byTier.set(t, []);
        byTier.get(t)!.push(l);
    }

    if (!existsSync(scenariosOut)) mkdirSync(scenariosOut, { recursive: true });
    if (!existsSync(registryOut)) mkdirSync(registryOut, { recursive: true });

    for (const [tier, items] of byTier) {
        // One page, one document: scenarios sharing a radio name are one native group.
        const shared = sharedRadioNames(items.flatMap(({ manifest }) => manifest.scenarios));
        if (shared.length > 0) {
            const lines = shared.map((s) => `  name="${s.name}": ${s.scenarios.join(', ')}`).join('\n');
            throw new Error(`tier ${tier}: scenarios on the same page share a radio name, so the browser `
                + `joins them into one group and the last radio checked unchecks the others:\n${lines}`);
        }
        const file = join(scenariosOut, `tier-${tierSlug(tier)}.html`);
        writeFileSync(file, renderTierHtml(tier, items), 'utf8');
        console.log(`  scenario  tier-${tierSlug(tier)}.html  (${items.length} components)`);
    }

    const registryFile = join(registryOut, 'manifests.ts');
    writeFileSync(registryFile, renderRegistry(loaded), 'utf8');
    console.log(`  registry  contracts/generated/manifests.ts  (${loaded.length} manifest)`);

    const catalogFile = join(scenariosOut, 'catalog.json');
    writeFileSync(catalogFile, renderCatalog(loaded), 'utf8');
    console.log(`  catalog   scenarios/generated/catalog.json  (${loaded.length} components)`);

    writeFileSync(join(scenariosOut, 'component-loaders.js'), renderLoaders(), 'utf8');
    console.log(`  loaders   scenarios/generated/component-loaders.js  (${TAG_SUBPATH.size} tags)`);

    console.log(`\nGenerated ${byTier.size} tier pages + the registry from ${loaded.length} manifests.`);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
