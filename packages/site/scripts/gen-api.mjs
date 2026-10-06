// Generate the API reference page from the code, so it cannot go stale.
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

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SITE = join(__dirname, '..');
const PACKAGES = join(SITE, '..');
const OUT = join(SITE, 'content', 'docs', 'api.md');
// The same page, where an agent looks: the skill's references. An agent that finds the reference
// only on the site reads core's dist/index.d.ts to learn what core exports.
export const SKILL_OUT = join(PACKAGES, '..', 'marketplace', 'plugins', 'pdxui', 'skills', 'pdxui', 'references', 'api.md');

/** Packages whose surface the reference covers, in the order they appear on the page. */
const COVERED = ['core', 'router'];

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
                found.set(name, got ? { ...got, name } : { name, signature: name, doc: '' });
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
                });
            }
        } else if (ts.isVariableStatement(stmt)) {
            for (const d of stmt.declarationList.declarations) {
                const name = d.name.getText(source);
                found.set(name, { name, signature: signatureOf(stmt, name), doc: docOf(stmt) });
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
        for (const name of names) {
            const { signature, doc, specifier } = surface.get(name);
            lines.push(`### \`${name}\``, '');
            lines.push('```ts', `import { ${name} } from '${specifier}';`, '', signature, '```', '');
            if (doc) lines.push(doc, '');
        }
    }
    return lines.join('\n');
}

// Run directly (not imported by the test). A file:// URL comparison is unreliable on Windows.
if (process.argv[1]?.endsWith('gen-api.mjs')) {
    const out = render();
    writeFileSync(OUT, out);
    writeFileSync(SKILL_OUT, out);
    console.log(`api.md: ${out.split('\n').length} lines (site docs + pdxui skill references)`);
}

export { render };
