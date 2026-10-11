// Generate the API reference from the code, so it cannot go stale: on the site an index and one
// page per module (MODULE_PAGES), in the skill one page with everything.
//
// Prose pages do not name every export — `useMediaQuery`, `onSwipe`, `spring`, the whole
// form-control registry, the calendar helpers. For a framework that sells itself as agent-native,
// an API named nowhere cannot be found by an agent.
//
// Hand-written prose pages stay the front door; this is the reference they link into. It is
// generated rather than written because a hand-maintained list falls behind the code — and because
// the import specifier it prints is the thing a hand-written page gets wrong.
//
// Run from `build`, alongside gen-llms.mjs. The output is committed so it is reviewable in a diff,
// and a test asserts it is current.

import { readFileSync, writeFileSync, readdirSync, existsSync, rmSync } from 'node:fs';
import { join, dirname, resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SITE = join(__dirname, '..');
const PACKAGES = join(SITE, '..');
const OUT = join(SITE, 'content', 'docs', 'api.md');
// The reference where an agent looks: the skill's references. An agent that finds the reference
// only on the site reads core's dist/index.d.ts to learn what core exports. One file there: an
// agent reads it from disk, and nothing downloads it.
export const SKILL_OUT = join(PACKAGES, '..', 'marketplace', 'plugins', 'pdxui', 'skills', 'pdxui', 'references', 'api.md');

/** Packages whose surface the reference covers, in the order they appear on the page. */
const COVERED = ['core', 'router'];

/**
 * The site's reference is one page per module, and a module is a folder of a package's `src/`.
 * One page held every export: 175 kB of markdown, a 636 kB chunk to read one entry, and one URL
 * for all of it. A folder too small to be a page shares one with its neighbours. A folder this
 * list does not place fails the generation by name: an export is never left off the site.
 */
export const MODULE_PAGES = [
    { slug: 'api-reactivity', title: 'Reactivity', sources: ['core/reactivity'],
      description: 'Signals, computed values, effects, stores, watchers, signal operators, events and observers as signals, resources, queries, mutations and the cache.' },
    { slug: 'api-components', title: 'Components', sources: ['core/component'],
      description: 'Defining components, lifecycle hooks, provide and inject, slots, themes and schemes, permissions, icons, overlays and positioning, dialog and toast queues, selection, drag, sorting and gestures.' },
    { slug: 'api-rendering', title: 'Rendering', sources: ['core/renderer'],
      description: 'Templates, lists, conditional and deferred blocks, error boundaries, portals, transitions, keyframes, springs, tweens and the virtualizer.' },
    { slug: 'api-forms', title: 'Forms', sources: ['core/form'],
      description: 'Forms, fields, field arrays, validators, schemas and form-associated custom elements.' },
    { slug: 'api-data', title: 'Data and HTTP', sources: ['core/data', 'core/http', 'core/auth'],
      description: 'The HTTP client and its middleware, uploads, data sources and transports, the data grid model, CSV and XLSX export, and the auth store.' },
    { slug: 'api-accessibility', title: 'Accessibility', sources: ['core/a11y'],
      description: 'Focus management, focus traps, roving tabindex, active descendant, live regions and the announcer.' },
    { slug: 'api-i18n', title: 'Internationalisation', sources: ['core/i18n'],
      description: 'Locales and translations, ICU messages, the $t, $d, $n and $r formatters, component strings and right-to-left direction.' },
    { slug: 'api-calendar', title: 'Calendar', sources: ['core/calendar'],
      description: 'Date arithmetic, month grids, week, quarter and fiscal ranges, ISO dates: the engine behind the date components.' },
    { slug: 'api-browser', title: 'Browser and device', sources: ['core/browser', 'core/mobile', 'core/navigation'],
      description: 'Storage, online and idle state, the title and head, media queries, scroll, the splash screen, bottom sheets, pull-to-refresh, safe areas and the route trail.' },
    { slug: 'api-testing', title: 'Testing', sources: ['core/testing'],
      description: 'Mounting a component in a test, queries by role, text and test id, events, typing and waiting.' },
    { slug: 'api-devtools', title: 'Debugging and devtools', sources: ['core/debug', 'core/devtools'],
      description: 'The devtools entry point and overlay, the debug handle, telemetry and navigation recording.' },
    { slug: 'api-utilities', title: 'Security and utilities', sources: ['core/security', 'core/utils'],
      description: 'URL sanitising and the development flag.' },
    { slug: 'api-router', title: 'Router', sources: ['router/*'],
      description: 'Creating the router, navigation, the current route with its params, query and loader data, guards, the outlet, links and prefetching.' },
];

/**
 * Whether a file in content/docs is one of the generated reference pages. They name every export
 * by construction, so the scans that ask "which exports does no page explain" leave them out.
 */
export const isApiReferencePage = (file) => /^api(-[a-z0-9-]+)?\.md$/.test(file);

/** The module of an export: its package and the first folder of `src/` its declaration is in. */
function moduleOf(pkgName, file) {
    const parts = relative(join(PACKAGES, pkgName, 'src'), file).split(sep);
    return `${pkgName}/${parts.length > 1 ? parts[0] : parts[0].replace(/\.ts$/, '')}`;
}

function pageOf(module) {
    const pkg = module.split('/')[0];
    return MODULE_PAGES.find(p => p.sources.includes(module) || p.sources.includes(`${pkg}/*`));
}

/**
 * Map every export name of a package to the sub-path a consumer must import it from.
 * The barrel is `.`; a symbol only reachable from a sub-path gets that sub-path, which is the
 * thing hand-written docs get wrong (`mount` is in `@pdxui/core/testing`, not the barrel).
 */
function entryPoints(pkgDir) {
    const pkg = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'));
    const out = [];
    for (const [subpath, def] of Object.entries(pkg.exports ?? {})) {
        if (subpath === './package.json') continue;
        const pick = (v) => {
            if (typeof v === 'string') return v;
            if (v && typeof v === 'object') {
                for (const k of ['development', 'types', 'import', 'default']) {
                    const got = pick(v[k]);
                    if (got) return got;
                }
            }
            return null;
        };
        const rel = pick(def);
        if (!rel) continue;
        const src = rel.replace(/^\.\/dist\//, './src/').replace(/\.(d\.ts|js|cjs|mjs)$/, '.ts');
        const file = resolve(pkgDir, src);
        if (!existsSync(file) || !file.endsWith('.ts')) continue;
        out.push({ specifier: `${pkg.name}${subpath === '.' ? '' : subpath.slice(1)}`, file });
    }
    return out;
}

/** Every value export of a module, with its signature and its TSDoc, following re-exports once. */
function surfaceOf(file, seen = new Set()) {
    const found = new Map();
    if (seen.has(file) || !existsSync(file)) return found;
    seen.add(file);

    const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.ES2022, true);
    const text = source.getFullText();

    const docOf = (node) => {
        const ranges = ts.getLeadingCommentRanges(text, node.getFullStart()) ?? [];
        const blocks = ranges.filter(r => text.slice(r.pos, r.pos + 3) === '/**');
        // The LONGEST block, not the nearest. Overloaded functions carry the API doc above the first
        // overload and a one-line `/** Overload: ... */` immediately above each signature; taking the
        // nearest would give "Overload: no setup or setup returns void" as the documentation for
        // `component`, which has a full block with a worked example just above it.
        const block = blocks.reduce((a, b) => (!a || b.end - b.pos > a.end - a.pos ? b : a), null);
        if (!block) return '';
        return text.slice(block.pos, block.end)
            .replace(/^\s*\/\*\*/, '').replace(/\*\/\s*$/, '')
            .split('\n').map(l => l.replace(/^\s*\*\s?/, '').trimEnd())
            .join('\n').trim();
    };

    /** The declaration line, without the body — enough to see what it takes and returns. */
    const signatureOf = (node, name) => {
        if (ts.isFunctionDeclaration(node)) {
            const params = node.parameters.map(p => p.getText(source)).join(', ');
            const ret = node.type ? `: ${node.type.getText(source)}` : '';
            return `function ${name}(${params})${ret}`;
        }
        if (ts.isClassDeclaration(node)) return `class ${name}`;
        if (ts.isVariableStatement(node)) {
            const d = node.declarationList.declarations[0];
            if (d?.type) return `const ${name}: ${d.type.getText(source)}`;
            return `const ${name}`;
        }
        return name;
    };

    for (const stmt of source.statements) {
        const exported = ts.getCombinedModifierFlags(stmt) & ts.ModifierFlags.Export
            || stmt.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword);

        // `export { a, b } from './x'` / `export { a }`
        if (ts.isExportDeclaration(stmt) && stmt.exportClause && ts.isNamedExports(stmt.exportClause)) {
            if (stmt.isTypeOnly) continue;
            const from = stmt.moduleSpecifier?.getText(source).slice(1, -1);
            const target = from?.startsWith('.')
                ? [resolve(dirname(file), `${from}.ts`), resolve(dirname(file), from, 'index.ts')].find(existsSync)
                : null;
            const inner = target ? surfaceOf(target, seen) : new Map();
            for (const el of stmt.exportClause.elements) {
                if (el.isTypeOnly) continue;
                const local = (el.propertyName ?? el.name).getText(source);
                const name = el.name.getText(source);
                const got = inner.get(local);
                found.set(name, got ? { ...got, name } : { name, signature: name, doc: '', file });
            }
            continue;
        }

        if (!exported) continue;
        if (ts.isFunctionDeclaration(stmt) || ts.isClassDeclaration(stmt)) {
            const name = stmt.name?.getText(source);
            // Overloads: an overloaded function is several declarations with one name, and the doc
            // is written once, above the FIRST. The implementation that follows has no comment of
            // its own — or a terse "Overload: …" line — so taking the last declaration's doc reads
            // `component`, `each` and friends as undocumented while they carry a full block with an
            // example. Keep the first non-empty doc; later declarations still refine the signature.
            if (name) {
                const doc = docOf(stmt);
                const prev = found.get(name);
                found.set(name, {
                    name,
                    signature: signatureOf(stmt, name),
                    // Keep the fuller of the two: later declarations refine the signature, and the
                    // implementation of an overloaded function usually has no doc of its own.
                    doc: (doc.length >= (prev?.doc?.length ?? 0)) ? doc : prev.doc,
                    file,
                });
            }
        } else if (ts.isVariableStatement(stmt)) {
            for (const d of stmt.declarationList.declarations) {
                const name = d.name.getText(source);
                found.set(name, { name, signature: signatureOf(stmt, name), doc: docOf(stmt), file });
            }
        }
    }
    return found;
}

/** Collect the whole surface of a package: name -> { signature, doc, specifier }. */
export function surfaceOfPackage(pkgName) {
    const pkgDir = join(PACKAGES, pkgName);
    const byName = new Map();
    for (const { specifier, file } of entryPoints(pkgDir)) {
        for (const [name, info] of surfaceOf(file)) {
            // The barrel wins: if a symbol is reachable from both, `@pdxui/core` is the
            // specifier to print. Sub-path-only symbols keep their sub-path.
            if (!byName.has(name) || specifier.split('/').length < byName.get(name).specifier.split('/').length) {
                byName.set(name, { ...info, specifier });
            }
        }
    }
    return byName;
}

function render() {
    const lines = [
        // Frontmatter: the docs route builds its nav from the glob and orders by this. Without it
        // the page exists, renders, and is reachable only by typing the URL — which is the defect
        // this page was written to fix.
        '---',
        'title: API reference',
        'description: "Every value export of @pdxui/core and @pdxui/router, with the import specifier that works. Generated from the source."',
        'order: 24',
        '---',
        '',
        '# API reference',
        '',
        'Generated from the source by `packages/site/scripts/gen-api.mjs` — every value export of',
        'the packages below, with the specifier that actually imports it. The prose pages are the',
        'place to start; this is the index they link into.',
        '',
        'A symbol reachable only from a sub-path shows that sub-path. `mount` is in',
        '`@pdxui/core/testing`, not in the barrel, and that distinction is what this page exists',
        'to make visible.',
        '',
    ];

    for (const pkgName of COVERED) {
        const surface = surfaceOfPackage(pkgName);
        const names = [...surface.keys()].sort((a, b) => a.localeCompare(b));
        lines.push(`## @pdxui/${pkgName}`, '', `${names.length} value exports.`, '');
        for (const name of names) lines.push(...entryLines('###', name, surface.get(name)));
    }
    return lines.join('\n');
}

/** One export: its heading, the import that works, its signature and its doc. */
function entryLines(depth, name, { signature, doc, specifier }) {
    const lines = [`${depth} \`${name}\``, ''];
    lines.push('```ts', `import { ${name} } from '${specifier}';`, '', signature, '```', '');
    if (doc) lines.push(doc, '');
    return lines;
}

/** The id the site's markdown gives the heading of `name` (vite-markdown.ts, `slugify`). */
const anchorOf = (name) => name.toLowerCase().replace(/[^\w-]/g, '');

/**
 * The site's reference: `api.md`, the index, and one `api-<module>.md` per entry of MODULE_PAGES.
 * Returns file name → content.
 */
function renderPages() {
    /** slug → [name, info][] */
    const byPage = new Map(MODULE_PAGES.map(p => [p.slug, []]));
    const unplaced = [];
    for (const pkgName of COVERED) {
        for (const [name, info] of surfaceOfPackage(pkgName)) {
            const module = moduleOf(pkgName, info.file);
            const page = pageOf(module);
            if (page) byPage.get(page.slug).push([name, info]);
            else unplaced.push(`${name} (${module})`);
        }
    }
    if (unplaced.length) {
        throw new Error(`gen-api: no page in MODULE_PAGES takes these exports: ${unplaced.join(', ')}`);
    }
    const sorted = (list) => [...list].sort((a, b) => a[0].localeCompare(b[0]));

    const files = new Map();
    for (const page of MODULE_PAGES) {
        const entries = sorted(byPage.get(page.slug));
        if (entries.length === 0) throw new Error(`gen-api: ${page.slug} has no exports — drop it from MODULE_PAGES`);
        const lines = [
            '---',
            `title: ${page.title} API`,
            `description: "${page.description}"`,
            'order: 24',
            // Not in the docs nav: the reference index is, and it links here.
            'parent: api',
            '---',
            '',
            `# ${page.title} API`,
            '',
            `${page.description} ${entries.length} exports, from ${[...new Set(entries.map(([, i]) => `\`${i.specifier}\``))].join(' and ')}.`,
            '',
            'Part of the [API reference](/docs/api), generated from the source by `packages/site/scripts/gen-api.mjs`.',
            '',
        ];
        for (const [name, info] of entries) lines.push(...entryLines('##', name, info));
        files.set(`${page.slug}.md`, lines.join('\n'));
    }

    const index = [
        // Frontmatter: the docs route builds its nav from the glob and orders by this. Without it
        // the page exists, renders, and is reachable only by typing the URL — which is the defect
        // this page was written to fix.
        '---',
        'title: API reference',
        'description: "Every value export of @pdxui/core and @pdxui/router, one page per module, with the import specifier that works. Generated from the source."',
        'order: 24',
        '---',
        '',
        '# API reference',
        '',
        'Generated from the source by `packages/site/scripts/gen-api.mjs` — every value export of',
        '`@pdxui/core` and `@pdxui/router`, one page per module, with the specifier that actually',
        'imports it. The prose pages are the place to start; this is the index they link into.',
        '',
        'A symbol reachable only from a sub-path shows that sub-path. `mount` is in',
        '`@pdxui/core/testing`, not in the barrel, and that distinction is what these pages exist',
        'to make visible.',
        '',
        '## Modules',
        '',
    ];
    for (const page of MODULE_PAGES) {
        index.push(`- [${page.title}](/docs/${page.slug}) — ${page.description} ${byPage.get(page.slug).length} exports.`);
    }
    index.push('', '## Every export, A–Z', '');
    const all = [];
    for (const page of MODULE_PAGES) for (const [name] of byPage.get(page.slug)) all.push([name, page.slug]);
    all.sort((a, b) => a[0].localeCompare(b[0]));
    index.push(all.map(([name, slug]) => `[\`${name}\`](/docs/${slug}#${anchorOf(name)})`).join(' · '), '');
    files.set('api.md', index.join('\n'));
    return files;
}

// Run directly (not imported by the test). A file:// URL comparison is unreliable on Windows.
if (process.argv[1]?.endsWith('gen-api.mjs')) {
    const pages = renderPages();
    const docs = dirname(OUT);
    // A module page that is no longer generated goes: a stale page is a URL that lies.
    for (const f of readdirSync(docs)) {
        if (isApiReferencePage(f) && !pages.has(f)) rmSync(join(docs, f));
    }
    for (const [f, text] of pages) writeFileSync(join(docs, f), text);
    const out = render();
    writeFileSync(SKILL_OUT, out);
    console.log(`api: ${pages.size} site pages; skill reference ${out.split('\n').length} lines`);
}

export { render, renderPages };
