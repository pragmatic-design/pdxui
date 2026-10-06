#!/usr/bin/env node
/**
 * sync-skills.mjs — copy the PDX skills into the shared skills repository.
 *
 *   node scripts/sync-skills.mjs <skills repository>            write plugins/pdxui and its marketplace entry
 *   node scripts/sync-skills.mjs <skills repository> --check    exit 1 if the copy there has drifted
 *
 * The skills live here, beside the library, because the gate tests them against it: the catalogue
 * is generated from the components, the examples compile, the gotchas are measured in a browser.
 * The skills repository (`pragmatic-design/skills`) is where they are installed from, by Claude Code
 * and by Codex alike: one marketplace, the .NET plugin `pragmatic-design` beside this one.
 *
 * What does not travel: each skill's `tools/` (the catalogue generator and its notes), which only a
 * maintainer of this repository can run. The other plugins in that marketplace are never touched.
 *
 * A copy is only as good as the day it was made: it drifts as soon as the source moves on, which
 * is why `--check` exists.
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, statSync } from 'node:fs';
import { join, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MARKETPLACE = join(ROOT, 'marketplace');
const PLUGIN = 'pdxui';

/** Every file of the plugin that travels, relative to the plugin folder, with `/` separators. */
function pluginFiles(dir) {
    const out = [];
    const walk = (d) => {
        for (const e of readdirSync(d, { withFileTypes: true })) {
            const p = join(d, e.name);
            const rel = relative(dir, p).split(sep).join('/');
            if (e.isDirectory()) {
                if (/^skills\/[^/]+\/tools$/.test(rel)) continue; // maintainer material stays here
                walk(p);
            } else out.push(rel);
        }
    };
    walk(dir);
    return out.sort();
}

/** Text compared without its line endings: the two repositories may check out differently. */
const norm = (buf) => buf.toString('utf8').replace(/\r\n/g, '\n');

function sourceEntry() {
    const m = JSON.parse(readFileSync(join(MARKETPLACE, '.claude-plugin', 'marketplace.json'), 'utf8'));
    const entry = m.plugins.find((p) => p.name === PLUGIN);
    if (!entry) throw new Error(`the marketplace here has no plugin "${PLUGIN}"`);
    return { name: entry.name, source: `./plugins/${PLUGIN}`, description: entry.description, version: entry.version };
}

/** The differences between what is here and what is there. Empty when the copy is current. */
export function drift(target) {
    const src = join(MARKETPLACE, 'plugins', PLUGIN);
    const dst = join(target, 'plugins', PLUGIN);
    const problems = [];
    const want = pluginFiles(src);
    const have = existsSync(dst) ? pluginFiles(dst) : [];
    for (const f of want) {
        if (!have.includes(f)) problems.push(`missing there: ${f}`);
        else if (norm(readFileSync(join(src, f))) !== norm(readFileSync(join(dst, f)))) problems.push(`differs: ${f}`);
    }
    for (const f of have) if (!want.includes(f)) problems.push(`only there: ${f}`);

    const mpFile = join(target, '.claude-plugin', 'marketplace.json');
    const there = existsSync(mpFile) ? JSON.parse(readFileSync(mpFile, 'utf8')).plugins?.find((p) => p.name === PLUGIN) : undefined;
    const here = sourceEntry();
    if (!there) problems.push(`the marketplace there has no "${PLUGIN}" entry`);
    else for (const k of Object.keys(here)) if (there[k] !== here[k]) problems.push(`marketplace entry ${k}: "${there[k]}" there, "${here[k]}" here`);

    // An installed plugin updates only when its version changes: new content published under the
    // version already out there reaches nobody who has it installed.
    const contentDiffers = problems.some((p) => /^(missing there|differs|only there): /.test(p));
    if (contentDiffers && there && there.version === here.version) {
        problems.push(`the content changed and the version did not: raise "version" in marketplace.json and plugins/${PLUGIN}/.claude-plugin/plugin.json (still ${here.version})`);
    }
    return problems;
}

function write(target) {
    const src = join(MARKETPLACE, 'plugins', PLUGIN);
    const dst = join(target, 'plugins', PLUGIN);
    rmSync(dst, { recursive: true, force: true });
    for (const f of pluginFiles(src)) {
        mkdirSync(dirname(join(dst, f)), { recursive: true });
        writeFileSync(join(dst, f), readFileSync(join(src, f)));
    }
    const mpFile = join(target, '.claude-plugin', 'marketplace.json');
    if (!existsSync(mpFile)) throw new Error(`${mpFile} does not exist: is ${target} the skills repository?`);
    const raw = readFileSync(mpFile, 'utf8');
    const m = JSON.parse(raw);
    const entry = sourceEntry();
    const at = m.plugins.findIndex((p) => p.name === PLUGIN);
    if (at >= 0) m.plugins[at] = entry; else m.plugins.push(entry);
    const nl = raw.includes('\r\n') ? '\r\n' : '\n';
    writeFileSync(mpFile, JSON.stringify(m, null, 2).replace(/\n/g, nl) + nl);
}

function main(argv) {
    const target = argv.find((a) => !a.startsWith('--'));
    if (!target || !existsSync(target) || !statSync(target).isDirectory()) {
        console.error('usage: node scripts/sync-skills.mjs <skills repository> [--check]');
        process.exit(2);
    }
    if (argv.includes('--check')) {
        const problems = drift(target);
        for (const p of problems) console.log(`  ${p}`);
        console.log(problems.length ? `skills out of date there: ${problems.length} differences` : 'skills current there');
        process.exit(problems.length ? 1 : 0);
    }
    write(target);
    const left = drift(target);
    if (left.length) { for (const p of left) console.log(`  ${p}`); process.exit(1); }
    console.log(`copied plugin ${PLUGIN} (${pluginFiles(join(MARKETPLACE, 'plugins', PLUGIN)).length} files) to ${target}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main(process.argv.slice(2));
