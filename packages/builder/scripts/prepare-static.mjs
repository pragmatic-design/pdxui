/**
 * Collect everything the builder needs to run as a STATIC site, before `vite build`.
 *
 * In dev the builder serves the scenario pages straight out of the repo (Vite's root is the
 * repo root, so they are always the freshly generated ones). A deployed build has no repo
 * behind it, so the pages, the catalog and the theme list have to become files under this
 * package — and the three dev-only endpoints (`/__pdx/themes`, `/__pdx/custom-themes/`,
 * `/__pdx/save-theme`) have to become a static answer, copied files and nothing at all.
 *
 * Everything written here is DERIVED. It is git-ignored and regenerated on every build; the
 * manifests remain the only hand-written source.
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const pkg = join(here, '..');
const repoRoot = join(pkg, '..', '..');

const scenariosSrc = join(repoRoot, 'packages/ui/tests/scenarios/generated');
const themesDir = join(repoRoot, 'packages/design/src/themes');
// TWO destinations, because Vite treats them differently:
//  · the HTML pages are rollup INPUTS — they must be processed, their module imports bundled;
//  · the data files are fetched at runtime and imported by nothing, so Vite would not emit
//    them at all. They go in `public/`, which is copied verbatim. Missing that is invisible
//    in preview (the SPA fallback answers 200 with index.html) and shows up as a builder
//    with no components.
const out = join(pkg, 'scenarios');
const pub = join(pkg, 'public', 'scenarios');

if (!existsSync(scenariosSrc)) {
    console.error(`Scenario pages not found at ${scenariosSrc}.`);
    console.error('Generate them first: node packages/responsive/tests/tooling/generate.ts');
    process.exit(1);
}

rmSync(out, { recursive: true, force: true });
rmSync(join(pkg, 'public'), { recursive: true, force: true });
mkdirSync(out, { recursive: true });
mkdirSync(pub, { recursive: true });

const pages = readdirSync(scenariosSrc).filter(f => f.endsWith('.html'));
for (const f of pages) copyFileSync(join(scenariosSrc, f), join(out, f));

const catalog = join(scenariosSrc, 'catalog.json');
if (!existsSync(catalog)) {
    console.error('catalog.json is missing — run the generator.');
    process.exit(1);
}
copyFileSync(catalog, join(pub, 'catalog.json'));

// The theme list is an endpoint in dev because a save can add to it. A static build cannot
// save, so the list is fixed at build time and shipped as the same shape the endpoint returns.
const shipped = readdirSync(themesDir).filter(f => f.endsWith('.css')).map(f => f.slice(0, -4)).sort();
const customDir = join(themesDir, 'custom');
const custom = existsSync(customDir)
    ? readdirSync(customDir).filter(f => f.endsWith('.css') && !f.startsWith('_')).map(f => f.slice(0, -4)).sort()
    : [];
writeFileSync(join(pub, 'themes.json'), JSON.stringify({ shipped, custom }, null, 2) + '\n');

// The custom themes are not in the served bundle in dev either — the builder loads each one
// directly. A static build needs the files themselves.
if (custom.length) {
    const customOut = join(pub, 'custom');
    mkdirSync(customOut, { recursive: true });
    for (const name of custom) copyFileSync(join(customDir, `${name}.css`), join(customOut, `${name}.css`));
}

// Hand-authored deployment files (CNAME, …) land at the root of the built site. They cannot
// live in public/ directly: this script wipes it on every run.
const deployDir = join(pkg, 'deploy');
let deployed = 0;
if (existsSync(deployDir)) {
    for (const f of readdirSync(deployDir)) {
        if (f === 'README.md') continue;   // documentation for us, not for the site
        copyFileSync(join(deployDir, f), join(pkg, 'public', f));
        deployed++;
    }
}

console.log(`prepare-static: ${pages.length} scenario pages, ${shipped.length} shipped themes, ${custom.length} custom, ${deployed} deploy file(s)`);
