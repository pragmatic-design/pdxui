// Every place CI launches Chromium sets the two variables Chromium would otherwise set itself (#63).
//
// At startup the headless shell calls setenv("DBUS_SESSION_BUS_ADDRESS", "disabled:") on its main
// thread, then setenv("FC_FONTATIONS", "1") on a thread-pool worker while a dozen other threads run.
// glibc's setenv of a variable that is not there yet reallocates the environment array, and can free
// the old one while another thread is reading it. Measured under gdb in the pinned Playwright image:
// libc's `environ` sits on the stack before the first call and on the heap at the second, so the
// second call reallocs a live array. On a runner with no D-Bus socket libdbus is reading the
// environment at that moment, which is the stack of the crash: signal 11 inside libdbus, at launch.
//
// With both variables already set, both calls only replace a value in place: measured, `environ`
// never leaves the stack and nothing is freed. The values are the ones Chromium writes itself, so the
// browser behaves the same.
//
// The cause was described first in graphty-org/graphty-monorepo#402 (30 crashes in 800 launches at
// an unlucky environment size, 0 with the variable preset). The race did not reproduce here in 4800
// launches; the mechanism did, which is what this pins.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(__dirname, '../../..');
const read = (path: string) => readFileSync(join(root, path), 'utf-8');

const PRESET = { FC_FONTATIONS: '1', DBUS_SESSION_BUS_ADDRESS: 'disabled:' };

/** The workflow-level `env:` block — the one every job and step inherits — as name → value. */
function workflowEnv(yaml: string): Record<string, string> {
    // CRLF on a Windows checkout: `env:\r` is still the block.
    const lines = yaml.split(/\r?\n/);
    const start = lines.findIndex((line) => line === 'env:');
    if (start === -1) return {};
    const env: Record<string, string> = {};
    for (const line of lines.slice(start + 1)) {
        if (line.trim() === '' || line.trim().startsWith('#')) continue;
        if (!line.startsWith(' ')) break;
        const colon = line.indexOf(':');
        const name = line.slice(0, colon).trim();
        const value = line.slice(colon + 1).trim().replace(/^'(.*)'$/, '$1').replace(/^"(.*)"$/, '$1');
        env[name] = value;
    }
    return env;
}

/** Every `ENV name=value` of a Dockerfile, as name → value. */
function dockerEnv(dockerfile: string): Record<string, string> {
    const env: Record<string, string> = {};
    for (const line of dockerfile.split(/\r?\n/)) {
        if (!line.startsWith('ENV ')) continue;
        for (const pair of line.slice(4).trim().split(/\s+/)) {
            const eq = pair.indexOf('=');
            if (eq > 0) env[pair.slice(0, eq)] = pair.slice(eq + 1);
        }
    }
    return env;
}

describe('CI launches Chromium with the environment it would write itself (#63)', () => {
    it('the parsers read a block they are given — the control', () => {
        expect(workflowEnv("name: x\n\nenv:\n  # why\n  A: '1'\n  B: \"b:\"\n\njobs:\n  j:\n    env:\n      C: 3\n")).toEqual({ A: '1', B: 'b:' });
        expect(workflowEnv("env:\r\n  A: '1'\r\njobs:\r\n")).toEqual({ A: '1' });
        expect(workflowEnv('name: x\njobs:\n  j:\n    env:\n      C: 3\n')).toEqual({});
        expect(dockerEnv('FROM x\nENV A=1 B=b:\nRUN true\n')).toEqual({ A: '1', B: 'b:' });
    });

    for (const workflow of ['.github/workflows/quality.yml', '.github/workflows/certify.yml']) {
        it(`${workflow} sets both at workflow level, for every job`, () => {
            expect(workflowEnv(read(workflow))).toMatchObject(PRESET);
        });
    }

    it('the pinned image sets both: `docker run` does not inherit the runner\'s environment', () => {
        expect(dockerEnv(read('packages/responsive/tests/docker/Dockerfile'))).toMatchObject(PRESET);
    });
});
