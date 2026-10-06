// What CI actually runs in the container.
//
// A visual job that spells its own docker build + docker run, ending in
// `playwright test --config tests/playwright-docker.config.ts visual-runner`, selects one file: that
// positional is a regex over the FILE PATH, so it matches visual-runner.spec.ts and nothing else —
// `--list` says "Total: 1586 tests in 1 file". fonts.spec.ts is excluded.
//
// fonts.spec.ts is the guard against a font resolving to a CJK face, every heading of every
// baseline rendering in Chinese, and the whole screenshot suite staying green because the baselines
// all agree with each other. A screenshot suite structurally cannot catch that; this is the only
// thing that can.
//
// The rule is not "add fonts to the CI filter". It is to have one place that decides what runs in
// the container: run.mjs owns that decision and is asserted in certification-gate.test.ts. This
// file pins that CI goes through it, so the two cannot drift apart.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const workflow = readFileSync(join(__dirname, '../../../.github/workflows/certify.yml'), 'utf-8');

/**
 * The job named `visual`, with comment lines removed.
 *
 * Comments are dropped because this asks what CI EXECUTES, not what the file says. The comment
 * above the step may quote a command CI does not run — a test that read it as a live invocation
 * would forbid explaining the rule in the place it applies.
 */
function visualJobBody(): string {
    // Jobs are two-space indented under `jobs:`; the next job starts at that same indent.
    const start = workflow.indexOf('\n  visual:');
    expect(start, 'certify.yml has no job named `visual`').toBeGreaterThan(-1);
    const rest = workflow.slice(start + 1);
    const next = rest.search(/\n {2}\w[\w-]*:/);
    const job = next === -1 ? rest : rest.slice(0, next);
    return job
        .split('\n')
        .filter((line) => !line.trim().startsWith('#'))
        .join('\n');
}

/** The job named `name`, with comment lines removed (see visualJobBody for why). */
function jobBody(name: string): string {
    const start = workflow.indexOf(`\n  ${name}:`);
    expect(start, `certify.yml has no job named \`${name}\``).toBeGreaterThan(-1);
    const rest = workflow.slice(start + 1);
    const next = rest.search(/\n {2}\w[\w-]*:/);
    const job = next === -1 ? rest : rest.slice(0, next);
    return job.split('\n').filter((line) => !line.trim().startsWith('#')).join('\n');
}

/**
 * Every `playwright test …` a job runs, as its config file and its positional file filters. A
 * folded `run: >` block spans lines, so the body is flattened first; an invocation ends at the next
 * step. `--flag=value` and the value after `--config`/`--reporter`/`--grep`/`-g`/`--workers` are
 * not filters.
 */
function playwrightInvocations(body: string): { config: string; filters: string[] }[] {
    // A GitHub expression (`${{ matrix.shard }}`) has spaces inside: one token, not three.
    const flat = body.replace(/\$\{\{.*?\}\}/g, 'EXPR').replace(/\s+/g, ' ');
    const out: { config: string; filters: string[] }[] = [];
    for (const m of flat.matchAll(/playwright test (.*?)(?= - (?:name|uses|run):|$)/g)) {
        const tokens = m[1].trim().split(' ');
        let config = '';
        const filters: string[] = [];
        for (let i = 0; i < tokens.length; i++) {
            const t = tokens[i];
            if (['--config', '--reporter', '--grep', '-g', '--workers', '--project'].includes(t)) {
                if (t === '--config') config = tokens[i + 1] ?? '';
                i++;
            } else if (!t.startsWith('-')) filters.push(t);
        }
        out.push({ config, filters });
    }
    return out;
}

// A contracts job that names its specs leaves every other spec of the certification folder — the
// regression guards — and the behavior suite to a developer's machine, never CI, while
// `pnpm certify` runs them all. CI runs what `test:certify` runs.
describe('CI certifies what pnpm certify certifies', () => {
    it('the contracts job runs playwright — the control', () => {
        expect(playwrightInvocations(jobBody('contracts')).length).toBeGreaterThan(0);
    });

    it('runs the ui-components config with no file filter: the whole folder, as test:certify does', () => {
        const ui = playwrightInvocations(jobBody('contracts')).filter((p) => p.config.endsWith('playwright-ui.config.ts'));
        expect(ui.length, 'no invocation of tests/playwright-ui.config.ts').toBeGreaterThan(0);
        for (const p of ui) expect(p.filters, 'a file filter leaves specs out of CI').toEqual([]);
    });

    it('runs the behavior suite', () => {
        const configs = playwrightInvocations(jobBody('contracts')).map((p) => p.config);
        expect(configs.some((c) => c.endsWith('playwright-behavior.config.ts')), 'CI does not run tests/playwright-behavior.config.ts').toBe(true);
    });

    it('the parser sees a filter and a second invocation — it can fail', () => {
        const planted = "run: >\n  pnpm exec playwright test --config tests/playwright-ui.config.ts a-runner --shard=${{ matrix.shard }}/2\n- name: x\n  run: pnpm exec playwright test --config tests/b.config.ts";
        expect(playwrightInvocations(planted)).toEqual([
            { config: 'tests/playwright-ui.config.ts', filters: ['a-runner'] },
            { config: 'tests/b.config.ts', filters: [] },
        ]);
    });
});

describe('CI reaches the container through the one script that decides what runs there', () => {
    it('has a visual job that runs something', () => {
        // The control: every assertion below is a substring check over a string, and an empty
        // string satisfies `not.toContain`. If the job were renamed or removed, this fails first
        // and says so, instead of the rest passing by measuring nothing.
        const body = visualJobBody();
        expect(body.length).toBeGreaterThan(100);
        expect(body).toContain('run:');
    });

    it('invokes run.mjs rather than spelling out its own playwright command', () => {
        const body = visualJobBody();
        expect(body).toContain('packages/responsive/tests/docker/run.mjs');
    });

    it('does not carry a second, competing definition of what to run', () => {
        // The failure mode this guards: a `playwright test --config ... <filter>` written
        // out in the workflow is a second source of truth, and it is what silently drops the font
        // guard. run.mjs may be given an explicit filter deliberately — but not a bare playwright
        // invocation that bypasses it.
        const body = visualJobBody();
        expect(body).not.toContain('playwright test');
    });
});
