// pdx migrate [paths] [--dry] — the registry of language changes, applied to a project (#121).
//
// The beta replaces the alpha, and every form it removes or changes is registered once in the
// compiler (`@pdxui/compiler`'s `languageChanges()`). This command reads the same registry the
// compiler reports PDX_REMOVED_FORM from: it applies every mechanical rewrite of a `removed` or
// `changed` form, writes the files, and lists the places it could only flag — a form a person has to
// rewrite, and every `fix`, a behaviour that changed because the old one was a defect. It is
// idempotent: a rewritten form is no longer found, so a second run changes nothing.
//
// Where it looks: `.pdx` files (the whole file, or its `<script>`), scripts (`.ts`, `.js` and their
// kin) and the Vite config, where the plugin's options are. `node_modules`, build output and test
// output are not walked.

import { defineCommand } from 'citty';
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, relative, resolve } from 'node:path';
import { ComponentResolver, DEFAULT_TAG_PREFIX, languageChanges, parseSFC, projectRoutePatterns, projectTagRenames, type LanguageChange, type LanguageChangeContext } from '@pdxui/compiler';
import { findFiles } from '../find-files';
import { planContextTokens, writeContextModule } from './migrate-contexts';

/** One rewrite: a file, the change applied, and how many places it rewrote. */
export interface MigrateChange { file: string; id: string; count: number }
/** One place a person has to look at. */
export interface MigrateFlag { file: string; line: number; id: string; found: string; message: string }
/** What a run did, files relative to the working directory. */
export interface MigrateReport { changed: MigrateChange[]; flagged: MigrateFlag[] }

const SCRIPT_FILE = /\.(?:[cm]?[jt]s|[jt]sx)$/;
const VITE_CONFIG = /^vite\.config\.(?:[cm]?[jt]s)$/;
const IGNORE = ['**/node_modules/**', '**/dist/**', '**/.git/**', '**/coverage/**', '**/test-results/**', '**/playwright-report/**'];

type FileKind = 'pdx' | 'script' | 'config' | 'html';

/** What a file is to the registry: a .pdx, the Vite config, a script, an HTML page, or nothing it reads. */
function kindOf(path: string): FileKind | null {
    if (path.endsWith('.pdx')) return 'pdx';
    if (path.endsWith('.html')) return 'html';
    if (VITE_CONFIG.test(basename(path))) return 'config';
    if (SCRIPT_FILE.test(path) && !path.endsWith('.d.ts')) return 'script';
    return null;
}

/** The files under `paths` the registry reads, as absolute paths with `/`. */
async function filesOf(paths: string[], cwd: string): Promise<string[]> {
    const out = new Set<string>();
    for (const p of paths) {
        const abs = resolve(cwd, p);
        const stat = statSync(abs, { throwIfNoEntry: false });
        if (!stat) throw new Error(`pdx migrate: ${p} does not exist.`);
        if (stat.isFile()) { out.add(abs.replace(/\\/g, '/')); continue; }
        for (const f of await findFiles(['**/*.pdx', '**/*.html', '**/*.{ts,mts,cts,js,mjs,cjs,tsx,jsx}'], { cwd: abs, ignore: IGNORE })) out.add(f);
    }
    return [...out].filter((f) => kindOf(f) !== null).sort();
}

/** The part of a file a change reads, where it starts, and how to put a rewritten part back. */
interface Region { text: string; lineOffset: number; replace(next: string): string }

/** The region of `text` (a file of `kind`) that `change` is looked for in, or null when it does not apply. */
function regionFor(change: LanguageChange, kind: FileKind, text: string): Region | null {
    const whole: Region = { text, lineOffset: 0, replace: (next) => next };
    if (change.scope === 'config') return kind === 'config' ? whole : null;
    if (change.scope === 'pdx') return kind === 'pdx' ? whole : null;
    if (change.scope === 'html') return kind === 'html' ? whole : null;
    if (kind === 'html') return null;
    // A script: a module as a whole, or the `<script>` of a .pdx.
    if (kind === 'script' || kind === 'config') return whole;
    const script = parseSFC(text).script;
    if (!script || script.src) return null;
    const start = script.start;
    const end = start + script.content.length;
    return {
        text: script.content,
        lineOffset: text.slice(0, start).split('\n').length - 1,
        replace: (next) => text.slice(0, start) + next + text.slice(end),
    };
}

/**
 * What a change that reads other files looks with: the project's components, as the build resolves
 * them — their models, for a `::x` whose child is another file (#124). A project whose packages
 * cannot be read gives nothing, and those changes find nothing.
 */
function projectContext(cwd: string, prefix: string, paths: string[]): LanguageChangeContext {
    try {
        const resolver = new ComponentResolver();
        // The component packages the project depends on — read from each folder being migrated as
        // well, the app's own package.json: run from above it, the library would be unknown and an
        // app file named like a library component would take that component's uses.
        resolver.registerUiManifest(cwd);
        for (const p of paths) resolver.registerUiManifest(resolve(cwd, p));
        // src/ and pages/, as the build scans them, and every folder being migrated: a component the
        // build finds through `pdx({ components })` is under one of them, and this does not read it.
        resolver.registerProjectComponents(cwd, paths, prefix);
        // Its application tags, alpha name → the prefixed one (#136).
        const projectTags = projectTagRenames(resolver.projectComponents(), prefix, (tag) => resolver.isLibraryTag(tag));
        return {
            // An alpha template names a child by its alpha tag: it is looked up by the tag it has now.
            modelsOf: (tag) => resolver.modelsOf(projectTags.get(tag) ?? tag),
            projectTags,
            // Its routes (#150): a `navigate('/x')` to one of them stays a pattern, any other is a URL.
            routePatterns: new Set(projectRoutePatterns(cwd, paths)),
            // The alpha events a library component no longer emits, from its manifest (#478).
            alphaOf: (tag) => resolver.alphaOf(tag),
        };
    } catch {
        return {};
    }
}

/**
 * Apply the registry to the files under `paths`; with `dry`, compute the same report and write nothing.
 * `context` replaces what the project's components say, key by key — how a test gives a library
 * component alpha events no shipped manifest records yet (#478).
 */
export async function migrate(paths: string[], { cwd, dry = false, prefix = DEFAULT_TAG_PREFIX, context: given }: { cwd: string; dry?: boolean; prefix?: string; context?: LanguageChangeContext }): Promise<MigrateReport> {
    const report: MigrateReport = { changed: [], flagged: [] };
    const targets = paths.length > 0 ? paths : ['.'];
    const files = await filesOf(targets, cwd);
    // The string context keys the .pdx files use, each mapped to a token, and the contexts.ts that
    // declares the new ones (#497). Written first: the rewritten files import from it.
    const contexts = planContextTokens(files, cwd);
    if (contexts.module) {
        const rel = relative(cwd, contexts.module.path).replace(/\\/g, '/');
        if (!dry) writeContextModule(contexts, cwd);
        report.changed.push({ file: rel, id: 'context-tokens', count: contexts.module.added });
    }
    const projectWide: LanguageChangeContext = {
        ...projectContext(cwd, prefix, targets.filter((p) => statSync(resolve(cwd, p), { throwIfNoEntry: false })?.isDirectory())),
        contextTokens: contexts.tokens,
        ...given,
    };
    for (const path of files) {
        const kind = kindOf(path)!;
        const rel = relative(cwd, path).replace(/\\/g, '/');
        // The file itself, for a change that imports a module relative to it.
        const context: LanguageChangeContext = { ...projectWide, file: path };
        const original = readFileSync(path, 'utf-8');
        let text = original;
        for (const change of languageChanges()) {
            if (change.kind === 'target') continue;
            const region = regionFor(change, kind, text);
            if (!region) continue;
            const found = change.detect(region.text, context);
            if (found.length === 0) continue;
            // A place may say what it takes in particular (#478: the model's event on this tag).
            const messageOf = (f: { note?: string }) => (f.note ? `${change.message} ${f.note}` : change.message);
            if (change.kind === 'fix' || change.fix === 'flag') {
                for (const f of found) {
                    report.flagged.push({ file: rel, line: f.line + region.lineOffset, id: change.id, found: f.found, message: messageOf(f) });
                }
                continue;
            }
            const fixed = change.fix(region.text, context);
            // What the rewrite could not reach (a `$emit` with a hyphenated name, #138) is a person's.
            const left = change.detect(fixed, context);
            text = region.replace(fixed);
            if (found.length > left.length) report.changed.push({ file: rel, id: change.id, count: found.length - left.length });
            for (const f of left) {
                report.flagged.push({ file: rel, line: f.line + region.lineOffset, id: change.id, found: f.found, message: messageOf(f) });
            }
        }
        if (!dry && text !== original) writeFileSync(path, text, 'utf-8');
    }
    return report;
}

export default defineCommand({
    meta: { name: 'migrate', description: 'Rewrite the forms the beta removed or changed, and list the ones to rewrite by hand' },
    args: {
        paths: { type: 'positional', required: false, description: 'Files or folders to migrate (default: the current folder)' },
        dry: { type: 'boolean', default: false, description: 'Print what would change, and write nothing' },
    },
    async run({ args }) {
        const paths = (args._ as string[] | undefined)?.length ? (args._ as string[]) : [];
        const report = await migrate(paths, { cwd: process.cwd(), dry: Boolean(args.dry) });
        const verb = args.dry ? 'would rewrite' : 'rewrote';
        for (const c of report.changed) console.log(`${verb}  ${c.file}  ${c.id} ×${c.count}`);
        for (const f of report.flagged) console.log(`flagged  ${f.file}:${f.line}  ${f.id}  ${f.found}\n         ${f.message}`);
        console.log(`\n${report.changed.length} rewrite(s)${args.dry ? ' (dry run: nothing written)' : ''}, ${report.flagged.length} place(s) to rewrite by hand.`);
    },
});
