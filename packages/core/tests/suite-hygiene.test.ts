// A gate that goes red without a defect stops being read.
//
// A test that holds the FIRST `await import('../src/component/…')` in its file pays for vite
// transforming that module and its dependency graph — inside its own 5s budget, while six packages
// compile in parallel. It times out during a full run and passes on its own in about a second; the
// tests after it hit the module cache and cost nothing.
//
// A green run cannot prove that mechanism is gone: the failure is one run in three. So the
// property is asserted on the SHAPE of the suite instead — no test body pays for a cold transform
// that a `beforeAll` could have paid once, outside anyone's timeout.
//
// The rule this defends is the repo's own: a suite with permanent reds stops being read, and one
// with INTERMITTENT reds is worse, because it teaches the reader to re-run instead of look.

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const TESTS_DIR = __dirname;

/** Where a dynamic import sits: inside a test body, or inside a hook / at module scope. */
type Site = { file: string; line: number; spec: string; inTestBody: boolean };

/**
 * Find every `import('…relative path…')` and decide whether it is inside an `it`/`test` body.
 *
 * The heuristic, stated because it is one: look BACKWARDS from the import for the nearest
 * `it(`/`test(`/`beforeAll(`/`beforeEach(`/`afterAll(`/`afterEach(` opener. If the nearest is a
 * test opener, the import is in that test's budget. It cannot be fooled by nesting that occurs in
 * this repo — hooks are never declared inside an `it` — and a false positive costs a `beforeAll`,
 * which is the fix anyway.
 *
 * Only RELATIVE specifiers count. `await import('vitest')` in form-nested.test.ts pulls a module
 * the runner has already loaded; the hazard is a source module transformed for the first time.
 */
function dynamicImportSites(file: string, text: string): Site[] {
    const sites: Site[] = [];
    const opener = /\b(it|test|beforeAll|beforeEach|afterAll|afterEach)\s*\(/g;
    for (const m of text.matchAll(/\bimport\(\s*['"](\.[^'"]+)['"]\s*\)/g)) {
        const before = text.slice(0, m.index);
        let nearest = '';
        opener.lastIndex = 0;
        for (const o of before.matchAll(opener)) nearest = o[1];
        sites.push({
            file,
            line: before.split('\n').length,
            spec: m[1],
            inTestBody: nearest === 'it' || nearest === 'test',
        });
    }
    return sites;
}

describe('no test pays for a cold module transform inside its own timeout', () => {
    const files = readdirSync(TESTS_DIR).filter(f => f.endsWith('.test.ts'));
    const sites = files.flatMap(f => dynamicImportSites(f, readFileSync(join(TESTS_DIR, f), 'utf-8')));

    it('scanned the suite, not an empty directory', () => {
        // Without this the assertion below passes on a glob that matches nothing — an exclusion is
        // invisible in its own result.
        expect(files.length).toBeGreaterThan(50);
    });

    it('finds the dynamic imports it is looking for', () => {
        // And without THIS, the assertion below passes on a detector that finds nothing at all.
        // There is at least one relative dynamic import in the suite; it just has to be in a hook.
        expect(sites.length).toBeGreaterThan(0);
    });

    // Asserted from HERE, not from no-network.test.ts, and the distinction is the whole point:
    // that file imports the setup module, and the import is what installs the guard, so it passes
    // with `setupFiles` deleted from the config. This file imports nothing from setup. If the guard
    // answers here, it answers for every test file in the package.
    it('the network guard is installed for every file, not only the one that imports it', () => {
        let caught: unknown;
        try { fetch('/probe'); } catch (e) { caught = e; }
        expect(
            (caught as Error | undefined)?.name,
            'fetch reached the runtime — tests/setup/no-network.ts is not wired as a setupFile',
        ).toBe('UnmockedFetchError');
    });

    it('has none of them inside a test body', () => {
        const bad = sites.filter(s => s.inTestBody).map(s => `${s.file}:${s.line}  import('${s.spec}')`);
        expect(
            bad,
            'move these into a beforeAll: the first import of a source module pays for its whole '
            + 'dependency graph, and inside a test that cost lands in a 5s budget shared with '
            + 'whatever else the machine is compiling.',
        ).toEqual([]);
    });
});

// ─── The other half: nothing in the default run measures wall-clock time ────────────────────
//
// `pnpm test` runs six packages in parallel, so an upper bound on elapsed time reads the machine's
// load as much as core's cost: a test fails inside a full run and passes alone. It is the same class
// as the timeout above, and as the compiler's benchmarks, which run outside the shared run too. It is
// asserted on the SHAPE rather than waited for as a red, which is the point of asserting shapes.
//
// The benchmarks guard against a hot path becoming pathologically slow: they
// live in `tests/perf/` and run alone through `pnpm test:perf`, where a measurement means something.
//
// EXEMPTIONS ARE DECLARED AT THE SITE, never here. A timing assertion whose failure mode is
// SECONDS — a ReDoS guard, a delay that must actually have elapsed — has hundreds of times the
// margin a benchmark does, and belongs beside the behaviour it checks. Such a line carries
// `PERF-EXEMPT:` and its reason, so the exemption is greppable and countable instead of implied.

/** An elapsed time: `performance.now()` anywhere, or two `Date.now()` reads subtracted. */
function stopwatchLines(text: string): { line: number; source: string }[] {
    const hits: { line: number; source: string }[] = [];
    text.split('\n').forEach((line, i) => {
        // A comment naming a stopwatch is prose, not a stopwatch — this very file would otherwise
        // be its own first offender. A trailing comment on a line of code is not exempted.
        if (/^\s*(?:\/\/|\/\*|\*)/.test(line)) return;
        if (/PERF-EXEMPT:/.test(line)) return;
        const elapsedDate = /Date\.now\(\)\s*-|-\s*(?:start|started|s|t0|before)\b.*Date\.now\(\)/.test(line);
        if (/performance\.now\(\)/.test(line) || elapsedDate) hits.push({ line: i + 1, source: line.trim() });
    });
    return hits;
}

/** Every `*.test.ts` under `tests/`, relative to it — `perf/x.test.ts` included. */
function allTestFiles(dir = TESTS_DIR, prefix = ''): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
            if (entry.name === '__snapshots__' || entry.name === 'setup') continue;
            out.push(...allTestFiles(join(dir, entry.name), rel));
        } else if (entry.name.endsWith('.test.ts')) {
            out.push(rel);
        }
    }
    return out;
}

describe('nothing in the default test run measures wall-clock time', () => {
    const every = allTestFiles();
    const inDefaultRun = every.filter(f => !f.startsWith('perf/'));

    it('scanned the suite, not an empty directory', () => {
        expect(inDefaultRun.length).toBeGreaterThan(50);
    });

    it('no test in the default run reads a stopwatch', () => {
        const offenders = inDefaultRun.flatMap(f =>
            stopwatchLines(readFileSync(join(TESTS_DIR, f), 'utf-8'))
                .map(h => `${f}:${h.line}  ${h.source}`));

        expect(offenders,
            'a timing measurement taken while six packages compile in parallel is not a measurement '
            + '— move the benchmark to tests/perf/ and run it with pnpm test:perf, or mark the line '
            + 'PERF-EXEMPT: <reason> if its failure mode is seconds rather than milliseconds',
        ).toEqual([]);
    });

    it('the benchmarks were moved, not deleted', () => {
        // The counter-check: "no test reads a clock" is satisfied perfectly by deleting them.
        const perf = every.filter(f => f.startsWith('perf/'));
        expect(perf.length, 'tests/perf/ is empty — the benchmarks were deleted').toBeGreaterThan(0);

        const measured = perf.filter(f => stopwatchLines(readFileSync(join(TESTS_DIR, f), 'utf-8')).length > 0);
        expect(measured, 'no benchmark in tests/perf/ actually measures anything').not.toEqual([]);
    });

    it('tests/perf is genuinely outside the default run', () => {
        // The exemption above is only honest if the config grants it.
        const config = readFileSync(join(TESTS_DIR, '..', 'vite.config.ts'), 'utf-8');
        expect(config, 'vite.config.ts does not exclude tests/perf from the default run')
            .toMatch(/exclude:[^\]]*tests\/perf/);
    });

    it('the declared exemptions are few and each says why', () => {
        // A ratchet on the escape hatch. Four: two ReDoS guards whose failure
        // mode is seconds of backtracking, and two delay-transport lower bounds, which load can only
        // push further into passing. It may fall; it may not rise without someone choosing to.
        //
        // This file is skipped because it is where the marker is DEFINED and explained — counting
        // the definition as a use is how a ratchet starts lying about its own number.
        const marked = inDefaultRun.filter(f => f !== 'suite-hygiene.test.ts').flatMap(f =>
            readFileSync(join(TESTS_DIR, f), 'utf-8').split('\n')
                .map((l, i) => ({ l, i }))
                .filter(({ l }) => /PERF-EXEMPT:/.test(l))
                .map(({ l, i }) => ({ where: `${f}:${i + 1}`, reason: l.split('PERF-EXEMPT:')[1].trim() })));

        expect(marked.length, `declared exemptions:\n  ${marked.map(m => m.where).join('\n  ')}`)
            .toBeLessThanOrEqual(4);
        expect(marked.filter(m => m.reason.length < 20).map(m => m.where),
            'an exemption with no reason is an exemption nobody can review').toEqual([]);
    });
});

// ─── The third half: no test waits for a duration and then asserts ──────────────────────────────
//
// `await new Promise(r => setTimeout(r, 150))` followed by an assertion is a bet that the machine is
// fast enough today. It is the "sleep instead of real synchronisation" the working agreement
// forbids, and it fails in the worst way — intermittently, under the load of a full run, in the
// suite whose green count every story is closed against.
//
// Reds this exact shape produces:
//   · concatSignal, 150ms against three 20ms operations, red about one run in three;
//   · retrySignal, 100ms against three attempts with a 10ms backoff;
//   · tweenMulti, 150ms against a 100ms tween;
//   · a design-tokens failure whose cause is unknown — the reason this shape gets a check rather
//     than another round of "probably the runner".
//
// Each shows only after a full run goes red, and the first hypothesis is flaky infrastructure
// rather than a test reading a stopwatch. Asserted on the SHAPE, like the two checks
// above, because a green run cannot prove the shape is gone.
//
// The fix is `waitUntil()` in ./wait-until.ts: the condition the assertion is about, counted in
// attempts, throwing with a label. The assertion itself never changes — only the wait.
//
// ⚠️ NOT every one can be converted, and forcing it would be worse than the disease. A sleep before
// a NEGATIVE assertion — `expect(debounced()).toBeUndefined()` inside the debounce window,
// `not.toHaveBeenCalled()` — is waiting to confirm that nothing happened. There is no condition to
// wait for, and load pushes those further into passing rather than out of it. Those are declared at
// the site with `SLEEP-OK: <reason>`, greppable and counted below, exactly as `PERF-EXEMPT:` is.
//
// ⚠️ What this does NOT catch, said plainly so nobody reads it as a proof: a sleep whose next
// statement is anything but an assertion. A tween sampled mid-flight by sleeping 30ms and then
// assigning is the same bet, invisible to this check, and found by reading rather than by running. The rule is tight on purpose: widened to "a sleep anywhere near an
// assertion" it would flag the legitimate cases, and a check that cries wolf gets switched off.

/** A sleep waiting for zero: a tick flush, which is synchronisation and not a duration. */
const TICK_FLUSH = /setTimeout\([^,]*,\s*0\s*\)/;

/** `await …setTimeout(…)` whose next statement is an assertion — the shape, wherever it appears. */
function sleepThenAssert(text: string): { line: number; source: string }[] {
    const lines = text.split('\n');
    const hits: { line: number; source: string }[] = [];
    lines.forEach((line, i) => {
        if (!/await/.test(line) || !/setTimeout\(/.test(line)) return;
        if (TICK_FLUSH.test(line) || /SLEEP-OK:/.test(line)) return;
        // Skip blank lines and comments: a comment between the sleep and the assertion does not
        // change what the sleep is doing, and the fix usually adds one.
        let j = i + 1;
        while (j < lines.length && (lines[j].trim().length === 0 || /^\s*(?:\/\/|\/\*|\*)/.test(lines[j]))) j++;
        if (/^\s*(?:await\s+)?expect\(/.test(lines[j] ?? '')) hits.push({ line: i + 1, source: line.trim() });
    });
    return hits;
}

describe('no test waits for a duration and then asserts', () => {
    const inDefaultRun = allTestFiles().filter(f => !f.startsWith('perf/'));

    it('the scan can fail', () => {
        // Three shapes, because a scan that always returns [] passes the real assertion below.
        const planted = [
            '        await new Promise(r => setTimeout(r, 150));',
            "        expect(result()).toBe('done');",
        ].join('\n');
        expect(sleepThenAssert(planted).length, 'the scan cannot see its own subject').toBe(1);

        const flush = planted.replace('150', '0');
        expect(sleepThenAssert(flush), 'a tick flush is not a duration bet').toEqual([]);

        const declared = planted.replace('));', ')); // SLEEP-OK: nothing must happen in this window');
        expect(sleepThenAssert(declared), 'a declared exemption is still counted as an offence').toEqual([]);
    });

    it('scanned the suite, not an empty directory', () => {
        expect(inDefaultRun.length).toBeGreaterThan(50);
    });

    it('no test sleeps and then asserts', () => {
        const offenders = inDefaultRun.flatMap(f =>
            sleepThenAssert(readFileSync(join(TESTS_DIR, f), 'utf-8'))
                .map(h => `${f}:${h.line}  ${h.source}`));

        expect(offenders,
            'a fixed sleep before an assertion is a bet on the machine, and it is lost under the '
            + 'load of a full run — wait for the condition with waitUntil() from ./wait-until.ts, or '
            + 'mark the line SLEEP-OK: <reason> if the assertion is that NOTHING happened',
        ).toEqual([]);
    });

    it('the declared exemptions are few and each says why', () => {
        // A ratchet on the escape hatch, the same one the stopwatch check uses. Nine when this was
        // written, out of 58 sites: three "did NOT fire inside the debounce window", two "a disposed
        // or double-clicked form did not write at all", and the rest of that family. It may fall; it
        // may not rise without someone choosing to.
        //
        // This file is skipped because it is where the marker is defined: counting the definition is
        // how a ratchet starts lying about its own number.
        const marked = inDefaultRun.filter(f => f !== 'suite-hygiene.test.ts').flatMap(f =>
            readFileSync(join(TESTS_DIR, f), 'utf-8').split('\n')
                .map((l, i) => ({ l, i }))
                .filter(({ l }) => /SLEEP-OK:/.test(l))
                .map(({ l, i }) => ({ where: `${f}:${i + 1}`, reason: l.split('SLEEP-OK:')[1].trim() })));

        expect(marked.length, `declared sleeps:\n  ${marked.map(m => m.where).join('\n  ')}`)
            .toBeLessThanOrEqual(9);
        expect(marked.filter(m => m.reason.length < 20).map(m => m.where),
            'an exemption with no reason is an exemption nobody can review').toEqual([]);
    });
});
