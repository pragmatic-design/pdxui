// Every CI job, and every step that installs Chromium's system packages, has a timeout (#642).
//
// Without one a stalled step runs until GitHub cancels the job at six hours. On #641 two
// certification jobs stalled inside `playwright install --with-deps chromium`, in apt, before any
// test ran, and the pull request waited six hours for a failure a rerun fixed. That install is also
// the step whose duration varies most: over 189 successful jobs (15 runs of quality.yml and
// certify.yml, 2026-10-23), median 0.3 minutes, p90 10, max 16 — apt falling back from the Azure
// mirror. So it gets its own timeout above that, and each job one above its own longest run.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = join(__dirname, '../../..');
const workflowsDir = join(root, '.github/workflows');

interface Job {
    id: string;
    timeout: number | null;
    /** The steps that run `playwright install --with-deps`, with their own timeout. */
    installs: { text: string; timeout: number | null }[];
}

/** The jobs of a workflow, read by indentation: jobs at 2 spaces, their keys at 4, steps at 6. */
function jobsOf(yaml: string): Job[] {
    const lines = yaml.split(/\r?\n/);
    const start = lines.indexOf('jobs:');
    if (start === -1) return [];
    const jobs: Job[] = [];
    let job: Job | null = null;
    let step: string[] | null = null;
    const closeStep = () => {
        if (job && step) {
            const text = step.join('\n');
            if (/playwright install --with-deps/.test(text)) {
                const t = text.match(/^ {8}timeout-minutes:\s*(\d+)/m);
                job.installs.push({ text: step[0].trim(), timeout: t ? Number(t[1]) : null });
            }
        }
        step = null;
    };
    for (const line of lines.slice(start + 1)) {
        if (line !== '' && !line.startsWith(' ') && !line.startsWith('#')) break;
        const header = line.match(/^ {2}([A-Za-z0-9_-]+):\s*$/);
        if (header) {
            closeStep();
            job = { id: header[1], timeout: null, installs: [] };
            jobs.push(job);
            continue;
        }
        if (!job) continue;
        const timeout = line.match(/^ {4}timeout-minutes:\s*(\d+)/);
        if (timeout) job.timeout = Number(timeout[1]);
        if (/^ {6}- /.test(line)) {
            closeStep();
            step = [line];
        } else if (step && (/^ {8}/.test(line) || line.trim() === '')) {
            step.push(line);
        } else if (/^ {0,4}\S/.test(line)) {
            closeStep();
        }
    }
    closeStep();
    return jobs;
}

const workflows = readdirSync(workflowsDir).filter((f) => f.endsWith('.yml'));

describe('every CI job has a timeout, and so does the Chromium install (#642)', () => {
    it('the parser reads jobs, their timeout and the install steps — the control', () => {
        const yaml = [
            'name: x', '', 'on: push', '', 'jobs:',
            '  a:', '    runs-on: ubuntu-latest', '    timeout-minutes: 30', '    steps:',
            '      - uses: actions/checkout@v7',
            '      - run: pnpm exec playwright install --with-deps chromium', '        timeout-minutes: 25',
            '', '  # a comment', '  b:', '    runs-on: ubuntu-latest', '    steps:',
            '      - name: Install Chromium', '        run: pnpm exec playwright install --with-deps chromium',
            '      - run: pnpm test',
        ].join('\n');
        expect(jobsOf(yaml)).toEqual([
            { id: 'a', timeout: 30, installs: [{ text: '- run: pnpm exec playwright install --with-deps chromium', timeout: 25 }] },
            { id: 'b', timeout: null, installs: [{ text: '- name: Install Chromium', timeout: null }] },
        ]);
        expect(jobsOf(yaml.replace(/\n/g, '\r\n'))).toEqual(jobsOf(yaml));
    });

    it('finds the workflows and their jobs', () => {
        expect(workflows).toEqual(expect.arrayContaining(['quality.yml', 'certify.yml']));
        const count = (f: string) => jobsOf(readFileSync(join(workflowsDir, f), 'utf-8')).length;
        expect(count('quality.yml')).toBeGreaterThanOrEqual(7);
        expect(count('certify.yml')).toBeGreaterThanOrEqual(3);
    });

    for (const file of workflows) {
        const jobs = jobsOf(readFileSync(join(workflowsDir, file), 'utf-8'));

        it(`${file}: every job declares timeout-minutes`, () => {
            expect(jobs.filter((j) => j.timeout === null).map((j) => j.id)).toEqual([]);
        });

        it(`${file}: every playwright install --with-deps step declares its own timeout-minutes`, () => {
            const missing = jobs.flatMap((j) => j.installs.filter((s) => s.timeout === null).map((s) => `${j.id}: ${s.text}`));
            expect(missing).toEqual([]);
        });
    }
});
