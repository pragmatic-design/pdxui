#!/usr/bin/env node
// node scripts/bench-jfb/bench-all.mjs <folder> [--limit 100]
//
// Fetches the bench.json of every nightly run on main that kept one, into <folder> as
// `<commit>-<run id>.json`, for bench-replay.mjs to replay a rule over (#736). A run already in the
// folder is not fetched again. Needs the GitHub CLI, signed in; the artifacts expire after the
// repository's retention period, so the history it can fetch is that long.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, renameSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const REPO = 'pragmatic-design/pdxui';

function gh(args) {
    return execFileSync('gh', args, { encoding: 'utf8' });
}

function main() {
    const argv = process.argv.slice(2);
    let folder = null;
    let limit = 100;
    for (let i = 0; i < argv.length; i++) {
        if (argv[i] === '--limit') limit = Number(argv[++i]);
        else if (!folder) folder = argv[i];
        else throw new Error(`unknown argument ${argv[i]}`);
    }
    if (!folder || !Number.isInteger(limit) || limit < 1) throw new Error('usage: node scripts/bench-jfb/bench-all.mjs <folder> [--limit 100]');
    const out = resolve(folder);
    mkdirSync(out, { recursive: true });

    const runs = JSON.parse(gh(['run', 'list', '--repo', REPO, '--workflow', 'bench-nightly.yml', '--branch', 'main',
        '--limit', String(limit), '--json', 'databaseId,headSha,createdAt']));
    let fetched = 0;
    let missing = 0;
    for (const run of runs) {
        const file = join(out, `${run.headSha.slice(0, 8)}-${run.databaseId}.json`);
        if (existsSync(file)) continue;
        const tmp = mkdtempSync(join(tmpdir(), 'pdx-bench-all-'));
        try {
            gh(['run', 'download', String(run.databaseId), '--repo', REPO, '-n', 'bench', '-D', tmp]);
            const json = join(tmp, 'bench.json');
            if (!existsSync(json)) { missing++; continue; }
            renameSync(json, file);
            fetched++;
        } catch (error) {
            // A run with no artifact left — a failed run, or one past its retention — is counted and
            // named with what gh said, so another failure (not signed in) does not pass for it.
            missing++;
            console.warn(`[bench-all] run ${run.databaseId}: ${String(error?.stderr ?? error?.message ?? error).trim().split('\n')[0]}`);
        } finally {
            rmSync(tmp, { recursive: true, force: true });
        }
    }
    console.log(`[bench-all] ${runs.length} nightly runs: ${fetched} fetched, ${missing} with no bench.json, the rest already in ${out}`);
}

main();
