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
import { languageChanges, parseSFC, type LanguageChange } from '@pdxui/compiler';
import { findFiles } from '../find-files';

/** One rewrite: a file, the change applied, and how many places it rewrote. */
export interface MigrateChange { file: string; id: string; count: number }
/** One place a person has to look at. */
export interface MigrateFlag { file: string; line: number; id: string; found: string; message: string }
/** What a run did, files relative to the working directory. */
export interface MigrateReport { changed: MigrateChange[]; flagged: MigrateFlag[] }

const SCRIPT_FILE = /\.(?:[cm]?[jt]s|[jt]sx)$/;
const VITE_CONFIG = /^vite\.config\.(?:[cm]?[jt]s)$/;
const IGNORE = ['**/node_modules/**', '**/dist/**', '**/.git/**', '**/coverage/**', '**/test-results/**', '**/playwright-report/**'];

type FileKind = 'pdx' | 'script' | 'config';

/** What a file is to the registry: a .pdx, the Vite config, a script, or nothing it reads. */
function kindOf(path: string): FileKind | null {
    if (path.endsWith('.pdx')) return 'pdx';
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
        for (const f of await findFiles(['**/*.pdx', '**/*.{ts,mts,cts,js,mjs,cjs,tsx,jsx}'], { cwd: abs, ignore: IGNORE })) out.add(f);
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

/** Apply the registry to the files under `paths`; with `dry`, compute the same report and write nothing. */
export async function migrate(paths: string[], { cwd, dry = false }: { cwd: string; dry?: boolean }): Promise<MigrateReport> {
    const report: MigrateReport = { changed: [], flagged: [] };
    for (const path of await filesOf(paths.length > 0 ? paths : ['.'], cwd)) {
        const kind = kindOf(path)!;
        const rel = relative(cwd, path).replace(/\\/g, '/');
        const original = readFileSync(path, 'utf-8');
        let text = original;
        for (const change of languageChanges()) {
            if (change.kind === 'target') continue;
            const region = regionFor(change, kind, text);
            if (!region) continue;
            const found = change.detect(region.text);
            if (found.length === 0) continue;
            if (change.kind === 'fix' || change.fix === 'flag') {
                for (const f of found) {
                    report.flagged.push({ file: rel, line: f.line + region.lineOffset, id: change.id, found: f.found, message: change.message });
                }
                continue;
            }
            text = region.replace(change.fix(region.text));
            report.changed.push({ file: rel, id: change.id, count: found.length });
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
