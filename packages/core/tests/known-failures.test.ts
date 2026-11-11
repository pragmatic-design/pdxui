// The gate names the known intermittent failure it just hit (#1013).
//
// Six found-in-gate issues waited, labelled `blocked`, for their red to come back, and nothing tied the
// next red to its issue: someone pushing had to recognise it by eye. #587 came back that way, and its
// trace was lost to a rerun before anyone did. They are closed now, and `scripts/lib/known-failures.mjs`
// holds what each looks like; the keeper reporter (every Playwright config) and the slow-test record
// (every vitest suite of the gate) print `[known-failure] #n …` when a failure matches one.
//
// Each entry is held to an occurrence recorded in its issue, its text taken verbatim. A registry entry
// that matches nothing real recognises nothing; one that matches everything is noise.

import { describe, it, expect } from 'vitest';
import { recognize, KNOWN, knownFailureLines } from '../../../scripts/lib/known-failures.mjs';

const IDLE_PROBE = { gapMs: 300, page: { heartbeat: [], longTasks: [], longFrames: [] }, runner: { heartbeat: [] } };

/** Occurrences as their issues recorded them, and the issue each must name. */
const OCCURRENCES = [
    {
        issue: 617, why: 'a chunk the site\'s preview did not serve (2026-10-30)',
        failure: {
            file: 'packages/site/tests/component-pages.spec.ts', title: 'relation-picker',
            error: 'TypeError: Failed to fetch dynamically imported module: http://localhost:5251/assets/index-CYnFLpTt.js',
        },
    },
    {
        issue: 617, why: 'a stylesheet the site\'s preview did not serve (2026-10-23)',
        failure: {
            file: 'packages/site/tests/component-pages.spec.ts', title: 'menubar',
            error: 'Error: Unable to preload CSS for /assets/pdx-accordion-DJPtI-7N.css',
        },
    },
    {
        issue: 617, why: 'a timeout with the page idle: the refused chunk is only in the trace (2026-10-29)',
        failure: {
            file: 'packages/showcase/tests/employees.spec.ts', title: 'contracts',
            error: 'Error: expect(locator).toBeVisible() failed\nLocator: locator(\'[data-test="contracts"]\')\nTimeout: 5000ms\nError: element(s) not found',
            probe: IDLE_PROBE,
        },
    },
    {
        issue: 611, why: 'the page frozen by one 9.7 s long task of its own (2026-10-22)',
        failure: {
            file: 'packages/showcase/tests/assets.spec.ts', title: 'Details save themselves: a renamed asset keeps its name after going away and back',
            error: 'Error: expect(locator).toBeVisible() failed\nTimeout: 5000ms',
            probe: { gapMs: 300, page: { heartbeat: [{ at: 1, gap: 9790 }], longTasks: [{ at: 1, duration: 9683, name: 'self' }, { at: 2, duration: 52, name: 'self' }], longFrames: [] }, runner: { heartbeat: [] } },
        },
    },
    {
        issue: 587, why: 'row 60 of permissions-edit, timed out on the dev server (2026-11-09)',
        failure: {
            file: 'packages/showcase/tests/permissions-edit.spec.ts', title: 'a grant taken from a role is gone from the session at once, and given back it returns',
            error: 'Test timeout of 30000ms exceeded.',
        },
    },
    {
        issue: 540, why: 'no bar-title after goto(\'/\') at 390',
        failure: {
            file: 'packages/showcase/tests/topbar.spec.ts', title: 'the menu button opens the rail over the page, and Escape gives the focus back',
            error: 'Error: expect(locator(\'[data-test="bar-title"]\')).toBeVisible() failed\nTimeout: 5000ms\nError: element(s) not found',
        },
    },
    {
        issue: 937, why: 'one batch of cascaders alive after a GC',
        failure: {
            file: 'packages/showcase/tests/scenario-component-retention.spec.ts', title: 'pdx-cascader',
            error: 'Error: pdx-cascader: 100 of 700 removed instances are still alive after a GC',
        },
    },
    {
        issue: 991, why: 'a millisecond scan that timed out in the gate (2026-11-10)',
        failure: {
            file: 'packages/core/tests/public-tree.test.ts', title: 'NO published file names the old scope',
            error: 'Error: Test timed out in 5000ms.',
            slowTest: { wallMs: 5605, loopBusy: 0, cpuShare: 0, reading: 'waiting, its event loop idle' },
        },
    },
    {
        issue: 1027, why: 'remove-tree\'s grandchild case found dist/ free in the gate (2026-11-11)',
        failure: {
            file: 'packages/cli/tests/remove-tree.test.ts', title: 'on Windows, names a process outside the children that sits in the tree',
            error: 'AssertionError: the given combination of arguments (undefined and string) is invalid for this assertion',
        },
    },
];

describe('the registry of known intermittent failures', () => {
    it.each(OCCURRENCES)('#$issue is recognised: $why', ({ issue, failure }) => {
        expect(recognize(failure).map((k: { issue: number }) => k.issue)).toEqual([issue]);
    });

    it('every entry is held to at least one recorded occurrence', () => {
        const held = new Set(OCCURRENCES.map((o) => o.issue));
        expect(KNOWN.map((k: { issue: number }) => k.issue).filter((n: number) => !held.has(n))).toEqual([]);
    });

    it('an unrelated failure is not recognised', () => {
        expect(recognize({ file: 'packages/showcase/tests/customers.spec.ts', title: 'sorts by name', error: 'Error: expect(received).toBe(expected)\nExpected: 2\nReceived: 1' })).toEqual([]);
    });

    it('a timeout under a stalled machine is not taken for an idle page: the runner stalled too', () => {
        const machine = { ...IDLE_PROBE, runner: { heartbeat: [{ at: 1, gap: 6000 }] } };
        expect(recognize({ file: 'packages/showcase/tests/employees.spec.ts', title: 'x', error: 'Timeout: 5000ms', probe: machine })).toEqual([]);
    });

    it('a probe that could not read the page is no evidence of an idle one', () => {
        const unread = { gapMs: 300, page: { unreadable: 'no answer in 5000 ms: the page was still frozen' }, runner: { heartbeat: [] } };
        expect(recognize({ file: 'packages/showcase/tests/employees.spec.ts', title: 'x', error: 'Timeout: 5000ms', probe: unread })).toEqual([]);
    });

    it('a match prints one line naming the issue, the test and where its evidence is', () => {
        const [line, ...rest] = knownFailureLines(OCCURRENCES[0].failure, 'packages/site/test-results-kept/2026-11-11T07-00-00-000Z');
        expect(rest).toEqual([]);
        expect(line).toMatch(/^\[known-failure\] #617 /);
        expect(line).toContain('component-pages.spec.ts › relation-picker');
        expect(line).toContain('packages/site/test-results-kept/2026-11-11T07-00-00-000Z');
        expect(line).toContain('reopen');
    });
});
