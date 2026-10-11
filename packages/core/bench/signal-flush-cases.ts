// The cases that decide how signals flush (#48), shared by the benchmark that times them
// (`signal-flush.bench.ts`) and the test that asserts what they count
// (`tests/signal-flush-counts.test.ts`).
//
// Two strategies for what an event handler does with its writes:
//   - `sync`    — today: every write outside `batch()` flushes at once, so a handler that writes
//                 three signals runs an effect reading all three three times, and the first two runs
//                 see a state half written;
//   - `batched` — the handler's body runs inside `batch()`, which is what compiling every template
//                 handler that way would do (#114): the effects run once, after the last write.
// The strategy is a switch here, in the bench, not in `src`: what is measured is the choice.
//
// Each case is built once and then `run()` many times. `effectRuns()` counts the effect bodies run
// by `run()` calls since the case was built, so a count is read after exactly one `run()`.

import { signal, computed, effect, batch, eachRow } from '../src/index';

export type Strategy = 'sync' | 'batched';
export const STRATEGIES: readonly Strategy[] = ['sync', 'batched'];

/** A handler, as the strategy runs it. */
function handler(strategy: Strategy, body: () => void): () => void {
    return strategy === 'batched' ? () => batch(body) : body;
}

export interface FlushCase {
    /** What one click does. */
    run: () => void;
    /** Effect bodies run by `run()` calls so far. */
    effectRuns: () => number;
}

/** (a) One handler writing `n` signals, read by one effect. */
export function writesReadByOneEffect(strategy: Strategy, n: number): FlushCase {
    const sources = Array.from({ length: n }, () => signal(0));
    let runs = 0;
    let built = false;
    effect(() => {
        for (const s of sources) s();
        if (built) runs++;
    });
    built = true;
    let tick = 0;
    const run = handler(strategy, () => { tick++; for (const s of sources) s.set(tick); });
    return { run, effectRuns: () => runs };
}

/** (b) One handler writing 3 signals, each effect of 100 reading all three. */
export function writesReadByManyEffects(strategy: Strategy, effects = 100): FlushCase {
    const sources = [signal(0), signal(0), signal(0)];
    let runs = 0;
    let built = false;
    for (let i = 0; i < effects; i++) {
        effect(() => {
            for (const s of sources) s();
            if (built) runs++;
        });
    }
    built = true;
    let tick = 0;
    const run = handler(strategy, () => { tick++; for (const s of sources) s.set(tick); });
    return { run, effectRuns: () => runs };
}

interface Row { id: number; label: string }

/**
 * (c) A `@for` of 1000 rows — `eachRow`, what a compiled `@for` calls — whose handler selects a
 * row and relabels it: two writes, `selected` (read by every row) and `rows` (one row changed).
 */
export function listOfRows(strategy: Strategy, count = 1000): FlushCase {
    const rows = signal<Row[]>(Array.from({ length: count }, (_, i) => ({ id: i, label: `row ${i}` })));
    const selected = signal(-1);
    let runs = 0;
    let built = false;
    const list = eachRow(rows, 'id', (row) => {
        const li = document.createElement('li');
        effect(() => {
            li.className = selected() === row().id ? 'selected' : '';
            li.textContent = row().label;
            if (built) runs++;
        });
        return li;
    });
    const host = document.createElement('ul');
    host.appendChild(list);
    built = true;
    let tick = 0;
    const run = handler(strategy, () => {
        tick++;
        const id = tick % count;
        selected.set(id);
        rows.set(rows().map(r => (r.id === id ? { ...r, label: `row ${id} (${tick})` } : r)));
    });
    return { run, effectRuns: () => runs };
}

/** (d) One handler writing 3 signals that feed a chain of computeds 10 deep, read by one effect. */
export function computedChain(strategy: Strategy, depth = 10): FlushCase {
    const sources = [signal(0), signal(0), signal(0)];
    let node = computed(() => sources[0]() + sources[1]() + sources[2]());
    for (let i = 1; i < depth; i++) {
        const prev = node;
        node = computed(() => prev() + 1);
    }
    const last = node;
    let runs = 0;
    let built = false;
    effect(() => {
        last();
        if (built) runs++;
    });
    built = true;
    let tick = 0;
    const run = handler(strategy, () => { tick++; for (const s of sources) s.set(tick); });
    return { run, effectRuns: () => runs };
}

/**
 * (e) An effect reading a computed whose value does not change when its source does: the handler
 * writes the source three times, and the computed (`source > 1e9`) stays `false`. The effect has
 * nothing new to see; how often it runs anyway is what #115 is to bring to zero.
 */
export function unchangedComputed(strategy: Strategy): FlushCase {
    const source = signal(0);
    const big = computed(() => source() > 1e9);
    let runs = 0;
    let built = false;
    effect(() => {
        big();
        if (built) runs++;
    });
    built = true;
    let tick = 0;
    const run = handler(strategy, () => { for (let i = 0; i < 3; i++) source.set(++tick); });
    return { run, effectRuns: () => runs };
}

/** Every case, named as the bench and the test report it. */
export const CASES: { name: string; build: (s: Strategy) => FlushCase }[] = [
    { name: '(a) 1 signal, 1 effect', build: s => writesReadByOneEffect(s, 1) },
    { name: '(a) 3 signals, 1 effect', build: s => writesReadByOneEffect(s, 3) },
    { name: '(a) 10 signals, 1 effect', build: s => writesReadByOneEffect(s, 10) },
    { name: '(b) 3 signals, 100 effects', build: s => writesReadByManyEffects(s) },
    { name: '(c) @for of 1000 rows, select + relabel', build: s => listOfRows(s) },
    { name: '(d) 3 signals, computed chain 10 deep', build: s => computedChain(s) },
    { name: '(e) 3 writes, computed value unchanged', build: s => unchangedComputed(s) },
];
