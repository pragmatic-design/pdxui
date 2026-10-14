#!/usr/bin/env node
// The behavioural test of the description API (#273): does an agent complete showcase tasks with
// `map`, `shell`, `page` and `outline` as often as with full accessibility snapshots?
//
// A local script, run on demand: outside CI and outside the gate, because it runs a model. See
// README.md beside it for when to run it and how to read its result.

import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { browser, cleanup, evaluate, resolveCommand } from './browser.mjs';
import { TASKS } from './tasks.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..', '..');
const showcase = join(repo, 'packages', 'showcase');

// ─── Options ──────────────────────────────────────────────────────

const HELP = `usage: node scripts/agent-behaviour/run.mjs [options]

  --runs <n>       how many times the whole list runs (default 2: the bar is over two runs)
  --tasks <ids>    a comma-separated subset of the tasks (default: all)
  --modes <list>   description,snapshot (default: both)
  --model <name>   the model claude runs (default: sonnet)
  --port <n>       the showcase dev server's port (default 5314)
  --out <file>     where the JSON result goes (default: test-results/agent-behaviour.json)
  --timeout <s>    how long one task may take (default 300)
  --list           print the tasks and exit`;

function options(argv) {
    const o = { runs: 2, tasks: null, modes: ['description', 'snapshot'], model: 'sonnet', port: 5314, out: join(repo, 'test-results', 'agent-behaviour.json'), timeout: 300 };
    for (let i = 0; i < argv.length; i++) {
        const [flag, value] = [argv[i], argv[i + 1]];
        switch (flag) {
            case '--runs': o.runs = Number(value); i++; break;
            case '--tasks': o.tasks = value.split(','); i++; break;
            case '--modes': o.modes = value.split(','); i++; break;
            case '--model': o.model = value; i++; break;
            case '--port': o.port = Number(value); i++; break;
            case '--out': o.out = resolve(value); i++; break;
            case '--timeout': o.timeout = Number(value); i++; break;
            case '--list': o.list = true; break;
            case '--help': case '-h': o.help = true; break;
            default: throw new Error(`unknown option ${flag}\n${HELP}`);
        }
    }
    if (!(o.runs >= 1)) throw new Error('--runs takes a number from 1');
    for (const m of o.modes) if (m !== 'description' && m !== 'snapshot') throw new Error(`unknown mode "${m}"`);
    const unknown = (o.tasks ?? []).filter((id) => !TASKS.some((t) => t.id === id));
    if (unknown.length) throw new Error(`unknown task ${unknown.join(', ')}; --list names them`);
    return o;
}

// ─── The showcase ─────────────────────────────────────────────────

/** Start the showcase's dev server, as `playwright.dev.config.ts` does, and wait for it to answer. */
async function startShowcase(port) {
    const base = `http://localhost:${port}`;
    const server = spawn('npx', ['vite', '--port', String(port), '--strictPort', '--force', '--logLevel', 'warn'], {
        cwd: showcase, stdio: 'ignore', shell: process.platform === 'win32', windowsHide: true,
    });
    const until = Date.now() + 120_000;
    while (Date.now() < until) {
        if (server.exitCode !== null) throw new Error(`the showcase dev server exited (${server.exitCode}); is port ${port} free?`);
        // A refused connection is the server not listening yet: null, and the loop asks again.
        const res = await fetch(`${base}/`).catch(() => null);
        if (res?.ok) return { base, stop: () => stopTree(server) };
        await new Promise((r) => setTimeout(r, 500));
    }
    stopTree(server);
    throw new Error(`the showcase dev server did not answer on ${base} within 120 s`);
}

/** Stop a process and its children: `npx` on Windows runs vite under a shell. */
function stopTree(child) {
    if (child.exitCode !== null) return;
    if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    else child.kill('SIGTERM');
}

/** A token for the admin, from the mock server, as `packages/showcase/tests/session.ts` gets one. */
async function signIn(base) {
    const res = await fetch(`${base}/api/auth/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password: 'pdx' }),
    });
    if (!res.ok) throw new Error(`could not sign in: ${res.status}`);
    const { access, refresh } = await res.json();
    return JSON.stringify({ access, refresh });
}

// ─── One task ─────────────────────────────────────────────────────

/** A fresh browser session on the task's start page, signed in, in English, 1440 × 900. */
function openSession(session, base, auth, task) {
    browser(session, 'open', `${base}/login`);
    browser(session, 'set', 'viewport', '1440', '900');
    evaluate(session, `localStorage.setItem('showcase.auth', ${JSON.stringify(auth)}); localStorage.setItem('pdx-locale', 'en'); true`);
    browser(session, 'open', base + task.start);
    browser(session, 'wait', task.ready);
}

/** What the check gets: reads in the page, actions on it, and the agent's last message. */
function pageFor(session, answer) {
    return {
        answer,
        read: (js) => evaluate(session, js),
        act: (...args) => browser(session, ...args),
    };
}

const PROMPTS = {
    description: [
        'You operate a web application in a browser, through one command:',
        '  node scripts/agent-behaviour/tool.mjs <verb> [args]',
        'Run it with no verb to list the verbs. You read the application only through `map`, `shell`, `page` and `outline`: `map` and `shell` describe the whole app and need reading once; `page` and `outline` describe the page you are on. The outline gives a CSS selector in brackets on each control: act with `click`, `fill` and `press` on those selectors.',
    ],
    snapshot: [
        'You operate a web application in a browser, through one command:',
        '  node scripts/agent-behaviour/tool.mjs <verb> [args]',
        'Run it with no verb to list the verbs. You read the application only through `snapshot`, its full accessibility tree; each element carries an @ref. Act with `click`, `fill` and `press` on those refs.',
    ],
};

// One command per call: the permission covers the one command, so a chain (`a && b`, `a; b`, a
// pipe) is refused as a whole. Measured: an agent that had read the outline planned the whole step
// in one chain, was refused, and gave up — four times in four runs.
const COMMON = 'Run one command per call: a chain of commands (&&, ;, a pipe) is refused. Read the page again after an action before you rely on what it changed. When the task is done, stop and say so in one short sentence — unless the task asks for a reply, then give only that. Do not ask questions: nobody will answer.';

/** Run the agent on one task in one mode; resolve with its last message and what it was sent. */
function runAgent(o, base, session, mode, task, log) {
    const prompt = `${PROMPTS[mode].join('\n')}\n${COMMON}\n\nYou are on ${task.start}. Task: ${task.prompt}`;
    const args = [
        '-p', prompt,
        '--model', o.model,
        '--output-format', 'json',
        // Nothing of this machine's setup reaches the agent: no CLAUDE.md, skills, plugins, hooks or
        // MCP servers. Its one tool is Bash, allowed for this command only; anything else is denied.
        '--safe-mode',
        '--tools', 'Bash',
        '--allowedTools', 'Bash(node scripts/agent-behaviour/tool.mjs:*)',
        '--permission-mode', 'dontAsk',
        '--no-session-persistence',
    ];
    const env = {
        ...process.env, PDX_AB_SESSION: session, PDX_AB_MODE: mode, PDX_AB_BASE: base, PDX_AB_LOG: log,
        // Git Bash, the shell claude runs commands in on Windows, rewrites an argument like
        // `/customers` into a Windows path. The app's paths must reach tool.mjs as written.
        MSYS_NO_PATHCONV: '1',
    };
    return new Promise((resolveRun) => {
        const child = spawn(resolveCommand('claude') ?? 'claude', args, { cwd: repo, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
        let stdout = '';
        let stderr = '';
        child.stdout.on('data', (d) => { stdout += d; });
        child.stderr.on('data', (d) => { stderr += d; });
        const timer = setTimeout(() => stopTree(child), o.timeout * 1000);
        child.on('close', (code) => {
            clearTimeout(timer);
            let answer = '';
            let turns = null;
            try {
                const result = JSON.parse(stdout);
                answer = String(result.result ?? '');
                turns = result.num_turns ?? null;
            } catch {
                answer = '';
            }
            resolveRun({ code, answer, turns, prompt, error: code === 0 ? null : (stderr.trim() || stdout.trim()).slice(0, 300) });
        });
    });
}

/** Characters the agent was sent: its prompt, and every answer of the tool. */
function sent(prompt, log) {
    let lines = [];
    try {
        lines = readFileSync(log, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
    } catch {
        lines = []; // the agent never ran the tool
    }
    return { chars: prompt.length + lines.reduce((n, l) => n + l.chars, 0), calls: lines.length, verbs: lines.map((l) => l.verb) };
}

async function runTask(o, base, auth, task, mode, run, logs) {
    const session = `pdx-ab-${task.id}-${mode}-${run}`;
    const log = join(logs, `${session}.jsonl`);
    const started = Date.now();
    const result = await attempt(o, base, auth, task, mode, run, session, log, started);
    // Every task gets a browser of its own, so what one task changed never reaches the next.
    const message = (err) => (err instanceof Error ? err.message : String(err));
    let closeError = null;
    try {
        browser(session, 'close');
    } catch (err) {
        closeError = message(err);
    }
    return closeError ? { ...result, closeError } : result;
}

async function attempt(o, base, auth, task, mode, run, session, log, started) {
    try {
        openSession(session, base, auth, task);
        // A check that holds before the agent has done anything measures nothing.
        const before = task.check(pageFor(session, ''));
        if (before.done) return { task: task.id, mode, run, done: false, invalid: true, detail: `already done at the start: ${before.detail}` };
        // A check may act on the page (ticket-status searches the list): the agent starts afresh.
        browser(session, 'open', base + task.start);
        browser(session, 'wait', task.ready);
        const agent = await runAgent(o, base, session, mode, task, log);
        const result = task.check(pageFor(session, agent.answer));
        const s = sent(agent.prompt, log);
        return {
            task: task.id, mode, run, done: result.done, detail: result.detail,
            chars: s.chars, calls: s.calls, verbs: s.verbs, turns: agent.turns,
            // What the agent said when it stopped: a task it gave up on says why here.
            answer: agent.answer.slice(0, 400),
            seconds: Math.round((Date.now() - started) / 1000), error: agent.error,
        };
    } catch (err) {
        return { task: task.id, mode, run, done: false, error: err instanceof Error ? err.message : String(err) };
    }
}

// ─── Summary ──────────────────────────────────────────────────────

function summarise(results, modes) {
    const by = {};
    for (const mode of modes) {
        const rows = results.filter((r) => r.mode === mode && !r.invalid);
        by[mode] = {
            done: rows.filter((r) => r.done).length,
            of: rows.length,
            chars: rows.reduce((n, r) => n + (r.chars ?? 0), 0),
        };
    }
    const d = by.description;
    const s = by.snapshot;
    const both = d && s;
    return {
        ...by,
        ...(both ? {
            charRatio: s.chars ? Math.round((100 * d.chars) / s.chars) / 100 : null,
            meetsBar: d.done >= s.done,
        } : {}),
    };
}

// ─── Main ─────────────────────────────────────────────────────────

async function main() {
    const o = options(process.argv.slice(2));
    if (o.help) { console.log(HELP); return; }
    if (o.list) { for (const t of TASKS) console.log(`${t.id.padEnd(22)} ${t.start.padEnd(11)} ${t.prompt}`); return; }

    const missing = ['claude', 'agent-browser'].filter((c) => !resolveCommand(c));
    if (missing.length) {
        console.error(`agent-behaviour needs ${missing.join(' and ')} on PATH, and they are not there.\n`
            + 'They are not dependencies of the repository: install the Claude Code CLI (`claude`) and '
            + '`agent-browser` (npm install -g agent-browser, then agent-browser install).');
        process.exitCode = 2;
        return;
    }

    const tasks = o.tasks ? TASKS.filter((t) => o.tasks.includes(t.id)) : TASKS;
    const logs = join(dirname(o.out), 'agent-behaviour-logs');
    rmSync(logs, { recursive: true, force: true });
    mkdirSync(logs, { recursive: true });

    console.log(`starting the showcase dev server on port ${o.port}…`);
    const server = await startShowcase(o.port);
    const results = [];
    try {
        const auth = await signIn(server.base);
        for (let run = 1; run <= o.runs; run++) {
            for (const task of tasks) {
                for (const mode of o.modes) {
                    const r = await runTask(o, server.base, auth, task, mode, run, logs);
                    results.push(r);
                    const mark = r.invalid ? 'INVALID' : r.done ? 'done' : 'NOT DONE';
                    console.log(`run ${run} · ${task.id.padEnd(22)} · ${mode.padEnd(11)} · ${mark.padEnd(8)} · ${String(r.chars ?? '-').padStart(7)} chars · ${r.detail ?? ''}${r.error ? ` · error: ${r.error}` : ''}`);
                }
            }
        }
    } finally {
        server.stop();
        cleanup();
    }

    const summary = summarise(results, o.modes);
    const report = { date: new Date().toISOString(), model: o.model, runs: o.runs, tasks: tasks.map((t) => t.id), summary, results };
    mkdirSync(dirname(o.out), { recursive: true });
    writeFileSync(o.out, `${JSON.stringify(report, null, 2)}\n`);

    const line = (m) => `${m}: ${summary[m].done}/${summary[m].of} done, ${summary[m].chars} chars`;
    console.log(`\n${o.modes.map(line).join(' · ')}`);
    if ('meetsBar' in summary) {
        console.log(`description API / snapshots, characters: ${summary.charRatio} · bar (description ≥ snapshots): ${summary.meetsBar ? 'met' : 'NOT met'}`);
    }
    console.log(`result: ${o.out}`);
    if (results.some((r) => r.invalid)) process.exitCode = 1;
}

main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
});
