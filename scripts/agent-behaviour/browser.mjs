// agent-browser, called from node.
//
// The first command of a session starts agent-browser's daemon, and the daemon inherits the
// command's stdout. Through a pipe, a synchronous call would wait for that pipe to close — that is,
// for the daemon to exit, which it never does. So every call writes to a file and the file is read
// once the command has exited.

import { spawnSync } from 'node:child_process';
import { closeSync, mkdtempSync, openSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const scratch = mkdtempSync(join(tmpdir(), 'pdx-agent-behaviour-'));
let calls = 0;

/**
 * The executable to run, or null when a command is not on PATH.
 *
 * On Windows npm installs a `.cmd` shim, and a shim only runs through `cmd.exe`, which reads quotes
 * its own way: the JavaScript passed to `eval` would not arrive intact. The shim names the real
 * executable, so that is what runs, with no shell in between.
 */
export function resolveCommand(name) {
    const finder = process.platform === 'win32' ? 'where' : 'which';
    const found = spawnSync(finder, [name], { encoding: 'utf8', windowsHide: true });
    if (found.status !== 0) return null;
    const candidates = found.stdout.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (process.platform !== 'win32') return candidates[0] ?? null;
    const exe = candidates.find((c) => c.toLowerCase().endsWith('.exe'));
    if (exe) return exe;
    const shim = candidates.find((c) => c.toLowerCase().endsWith('.cmd'));
    if (!shim) return null;
    // The shim's one line: "%~dp0node_modules\…\agent-browser-win32-x64.exe" %*
    const target = /"%~dp0([^"]+)"/.exec(readFileSync(shim, 'utf8'))?.[1];
    return target ? join(dirname(shim), target) : null;
}

let binary = null;
function agentBrowser() {
    binary ??= resolveCommand('agent-browser');
    if (!binary) throw new Error('agent-browser is not on PATH');
    return binary;
}

/**
 * Run `agent-browser --session <session> ...args` and return what it printed, stdout then stderr.
 * Throws when it exits non-zero, with what it printed.
 */
export function browser(session, ...args) {
    const file = join(scratch, `out-${process.pid}-${++calls}.txt`);
    const fd = openSync(file, 'w');
    let result;
    try {
        result = spawnSync(agentBrowser(), ['--session', session, ...args], {
            stdio: ['ignore', fd, fd],
            windowsHide: true,
            timeout: 60_000,
        });
    } finally {
        closeSync(fd);
    }
    const out = readFileSync(file, 'utf8');
    rmSync(file, { force: true });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`agent-browser ${args[0]} failed (${result.status}): ${out.trim()}`);
    return out;
}

/** Evaluate `js` in the page and return its value, parsed from the JSON agent-browser prints. */
export function evaluate(session, js) {
    const out = browser(session, 'eval', js).trim();
    try {
        return JSON.parse(out);
    } catch {
        return out; // not JSON: agent-browser printed the value as text
    }
}

/** Remove the scratch folder: call once, at the end of a run. */
export function cleanup() {
    rmSync(scratch, { recursive: true, force: true });
}
