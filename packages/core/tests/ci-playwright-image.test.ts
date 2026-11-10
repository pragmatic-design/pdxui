// Every CI job that launches Chromium runs in the official Playwright image, with no apt at run time
// (#998).
//
// `playwright install --with-deps chromium` ran `apt-get update` and installed Chromium's system
// libraries on every job. On #997 apt fell back from the Azure mirror, stalled on an index, and the
// job was cut at its 25-minute install timeout (#642) before any test ran. The image carries the
// browser and its libraries, so no job installs anything.
//
// The image's tag is the Playwright version: the browser in it is the one that version drives, and a
// mismatch fails at launch ("Executable doesn't exist"). So the tag is held to the lockfile here, in
// every workflow and in the visual job's Dockerfile, and a Playwright bump moves them together.
//
// The image resolves `localhost` to ::1 first, the runner to 127.0.0.1. In the image, a Vite preview
// bound to `localhost` listened on ::1 alone, and Node's fetch to it (the showcase's sign-in, the SSG
// build's loader) connected to 127.0.0.1 and was refused; the browser, trying both, never saw it.
// So the container resolves IPv4 first, as the runner does — measured with a probe in the image:
// bound to ::1 and refused, then with the option bound to 127.0.0.1 and answered.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(__dirname, '../../..');
const read = (path: string) => readFileSync(join(root, path), 'utf-8');

/** The one `@playwright/test` version the lockfile resolves. */
function lockedPlaywright(lockfile: string): string[] {
    // Match: a package key `  '@playwright/test@1.58.2':`. Groups: [1]=the version
    return [...new Set([...lockfile.matchAll(/^ {2}'@playwright\/test@([\d.]+)':/gm)].map((m) => m[1]))];
}

/** A job's block of a workflow: from its header at two spaces to the next one. */
function jobBlock(yaml: string, id: string): string | null {
    const lines = yaml.split(/\r?\n/);
    const start = lines.findIndex((line) => line === `  ${id}:`);
    if (start === -1) return null;
    const end = lines.findIndex((line, i) => i > start && /^ {2}[A-Za-z0-9_-]+:\s*$/.test(line));
    return lines.slice(start, end === -1 ? undefined : end).join('\n');
}

/** The image of a job's `container:`, written as `container:\n  image: …`. */
function containerImage(block: string): string | null {
    // Match: `    container:` then its `      image: x`. Groups: [1]=the image
    return /^ {4}container:\s*\n {6}image:\s*(\S+)/m.exec(block)?.[1] ?? null;
}

/** The `NODE_OPTIONS` of a job's `container.env`, written right after its image. */
function containerNodeOptions(block: string): string | null {
    // Match: the image line, `      env:`, then `        NODE_OPTIONS: x`. Groups: [1]=the value
    return /^ {6}image:.*\n {6}env:\s*\n(?: {8}.*\n)*? {8}NODE_OPTIONS:\s*(\S+)/m.exec(block)?.[1] ?? null;
}

// The jobs that launch Chromium, by workflow. The visual job is not here: it builds its own image
// from the Dockerfile (run.mjs), checked below.
const BROWSER_JOBS: Record<string, string[]> = {
    '.github/workflows/certify.yml': ['contracts', 'contracts-2024'],
    '.github/workflows/quality.yml': ['browser', 'builder'],
};

describe('the browser jobs run in the Playwright image of the locked version (#998)', () => {
    const versions = lockedPlaywright(read('pnpm-lock.yaml'));
    const image = `mcr.microsoft.com/playwright:v${versions[0]}-noble`;

    it('the readers read what they are given — the control', () => {
        expect(lockedPlaywright("packages:\n\n  '@playwright/test@1.2.3':\n    resolution: x\n")).toEqual(['1.2.3']);
        const yaml = 'jobs:\n  a:\n    runs-on: ubuntu-24.04\n    container:\n      image: img:1\n    steps:\n      - run: x\n  b:\n    steps:\n      - run: y\n';
        expect(containerImage(jobBlock(yaml, 'a')!)).toBe('img:1');
        expect(containerImage(jobBlock(yaml, 'b')!)).toBeNull();
        expect(jobBlock(yaml, 'c')).toBeNull();
        const withEnv = yaml.replace('      image: img:1\n', '      image: img:1\n      env:\n        A: 1\n        NODE_OPTIONS: --x\n');
        expect(containerNodeOptions(jobBlock(withEnv, 'a')!)).toBe('--x');
        expect(containerNodeOptions(jobBlock(yaml, 'a')!)).toBeNull();
    });

    it('the lockfile resolves one Playwright version', () => {
        expect(versions).toHaveLength(1);
    });

    for (const [workflow, jobs] of Object.entries(BROWSER_JOBS)) {
        for (const id of jobs) {
            it(`${workflow}: ${id} runs in ${image}`, () => {
                const block = jobBlock(read(workflow), id);
                expect(block, `no job '${id}'`).not.toBeNull();
                expect(containerImage(block!)).toBe(image);
                // In the image `localhost` is ::1 first; on the runner it is 127.0.0.1. A server bound
                // to localhost listened on ::1 alone, and Node's fetch to it was refused at 127.0.0.1.
                expect(containerNodeOptions(block!), 'the container resolves IPv4 first, as the runner').toBe('--dns-result-order=ipv4first');
            });
        }

        it(`${workflow}: no step installs a browser or system packages`, () => {
            const yaml = read(workflow);
            expect(yaml).not.toMatch(/playwright install/);
            expect(yaml).not.toMatch(/apt-get/);
        });
    }

    it('the visual job\'s Dockerfile starts from the same image', () => {
        const from = read('packages/responsive/tests/docker/Dockerfile').split(/\r?\n/).filter((line) => line.startsWith('FROM '));
        expect(from).toEqual([`FROM ${image}`]);
    });
});
