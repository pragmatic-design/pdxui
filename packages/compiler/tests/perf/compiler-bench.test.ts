// Compiler benchmark — measures compilation speed of .pdx files.
//
// Each case states one budget and asserts it (#347): a compile takes under 5 ms, the median of its
// runs. What it is for is the dev server's HMR, where a component is compiled on save and 5 ms is a
// third of a frame. The median, not the mean: a garbage collection in one run moved the mean of a
// case from 3.4 to 5.7 ms between two runs on the same machine, while its median and best did not.
// Measured 2026-10-16 on a development machine, three runs, medians: counter 2.26-2.29, todo
// 3.10-3.53, counter in production 1.55-1.66, the complex page 3.07-3.21 ms; the batch of 10,
// 17.8-18.9 ms. The cases used to state «>500 compilations/sec» and assert 100, which a compiler
// five times slower would pass.
//
// The budget is counted in units of a reference workload, not in milliseconds of whatever machine
// runs it (#643). A wall-clock 5 ms failed the pre-push on a change with no compiler code in it
// (todo measured 5.17 ms, then 4.25 alone and 2.3 an hour later, on the same code): the number
// measured the machine. So every iteration runs the case and then the reference — TypeScript
// transpiling a fixed module, the same kind of work and none of it ours — and the case is held to
// its median over the reference's. Measured 2026-10-24 with every other core spinning: the times grew
// 7-8× (todo 3.5 → 27 ms) and the ratio moved under 10% (todo 1.00 → 0.93, counter 0.66 → 0.68),
// while the compiler of 2026-10-16 still read apart from today's (todo 0.80, counter 0.51).
//
// The 5 ms is still the budget: REFERENCE_MS is what the reference takes on the development machine
// these numbers come from, idle, so a case may take 5 / 4 = 1.25 references. The closest case, todo,
// read 0.87-1.06 over ten runs, five idle and five loaded, while its time went from 3.9 to 37 ms. A TypeScript upgrade that changes the reference's speed moves
// every ratio: measure REFERENCE_MS again with it.

import { describe, it, expect } from 'vitest';
import ts from 'typescript';
import { compile } from '../../src/plugin';

const counterPdx = `
<template>
  <div class="counter">
    <h3>{{ label }}</h3>
    <span>{{ count }}</span>
    <button @click="inc">+</button>
    @if (count > 10) { <div class="alert">High!</div> }
  </div>
</template>
<script>
  @prop label: string = 'Counter';
  @prop initial: number = 0;
  let count = $signal(initial);
  const doubled = $derived(count * 2);
  function inc() { count++; }
  function dec() { count--; }
</script>
<style scoped>
  .counter { padding: 1rem; }
  .alert { color: red; }
  button:hover { background: #eee; }
</style>`;

const todoPdx = `
<template>
  <div class="todo">
    <h3>{{ title }}</h3>
    <input ::value="newItem" @keydown.enter="addItem">
    @for (items as item; track item.id) {
      <div class="item">
        {{ item.text }}
        <button @click="remove(item.id)">×</button>
      </div>
    }
    @if (items.length === 0) { <div>Empty</div> }
  </div>
</template>
<script>
  @prop title: string = 'Todo';
  let items = $signal([{ id: 1, text: 'Task 1' }, { id: 2, text: 'Task 2' }]);
  let newItem = $signal('');
  let nextId = 3;
  const count = $derived(items.length);
  function addItem() {
    if (!newItem.trim()) return;
    items = [...items, { id: nextId++, text: newItem }];
    newItem = '';
  }
  function remove(id) { items = items.filter(i => i.id !== id); }
</script>
<style scoped>
  .todo { padding: 1rem; }
  .item { display: flex; gap: 0.5rem; }
  .item:hover { background: #f5f5f5; }
</style>`;

/** One compile's budget, in ms on the development machine. */
const COMPILE_BUDGET_MS = 5;
/** The reference's median on that machine, idle: the median of 49 runs' medians, 3.0-5.2 ms (2026-10-24). */
const REFERENCE_MS = 4.0;
/** One compile's budget in references: the median ratio of a case must be under it. */
const COMPILE_BUDGET = COMPILE_BUDGET_MS / REFERENCE_MS;

// The reference: a fixed TypeScript module, transpiled. TypeScript is already the compiler's
// dependency, and it is parse-and-emit work like a compile, so load slows both alike.
const REFERENCE_SOURCE = Array.from({ length: 12 }, (_, i) => `
export interface Item${i} { id: number; text: string; done?: boolean }
export class Store${i}<T extends Item${i}> {
    private items: T[] = [];
    add(item: T): this { this.items = [...this.items, item]; return this; }
    remove(id: number): void { this.items = this.items.filter((x) => x.id !== id); }
    get count(): number { return this.items.length; }
    map<U>(fn: (x: T, i: number) => U): U[] { return this.items.map(fn); }
}
export const make${i} = (n: number) => Array.from({ length: n }, (_, k) => ({ id: k, text: \`t\${k}\` }));
`).join('\n');
const REFERENCE_OPTIONS = { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } };
const reference = () => ts.transpileModule(REFERENCE_SOURCE, REFERENCE_OPTIONS);

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

/** A case's median, the reference's, measured in turn on every iteration, and their ratio. */
function measure(label: string, fn: () => void, iterations = 100): { median: number; reference: number; ratio: number } {
    // Warm up: 10 runs left the JIT still settling on the complex page, whose median then read
    // 4.6 ms against 3.3 after 20.
    for (let i = 0; i < 30; i++) { fn(); reference(); }

    const times: number[] = [];
    const refs: number[] = [];
    for (let i = 0; i < iterations; i++) {
        let start = performance.now();
        fn();
        times.push(performance.now() - start);
        start = performance.now();
        reference();
        refs.push(performance.now() - start);
    }

    const m = median(times);
    const r = median(refs);
    console.log(`  ⏱ ${label}: median=${m.toFixed(3)}ms reference=${r.toFixed(3)}ms ratio=${(m / r).toFixed(3)} (budget ${COMPILE_BUDGET.toFixed(3)})`);
    return { median: m, reference: r, ratio: m / r };
}

describe('compiler benchmarks', () => {
    it('compile counter.pdx — new mode (decorator+rune)', () => {
        const { ratio } = measure('counter.pdx compile', () => {
            compile(counterPdx, 'counter.pdx');
        });
        // A compile under 5 ms: the component saved, compiled again for HMR.
        expect(ratio).toBeLessThan(COMPILE_BUDGET);
    });

    it('compile todo.pdx — new mode with @for + signals', () => {
        const { ratio } = measure('todo.pdx compile', () => {
            compile(todoPdx, 'todo.pdx');
        });
        // A compile under 5 ms, with a @for and two-way binding.
        expect(ratio).toBeLessThan(COMPILE_BUDGET);
    });

    it('compile 10 components sequentially', () => {
        const { ratio } = measure('10 components batch', () => {
            for (let i = 0; i < 10; i++) {
                compile(counterPdx, `comp-${i}.pdx`);
            }
        }, 20);
        // 10 compiles under 50 ms: the same 5 ms each, back to back, as a build does them.
        expect(ratio).toBeLessThan(10 * COMPILE_BUDGET);
    });

    it('compile counter.pdx — production mode', () => {
        const { ratio } = measure('counter.pdx prod', () => {
            compile(counterPdx, 'counter.pdx', undefined, undefined, { production: true, minify: true });
        });
        // A compile under 5 ms with the production passes (minify, hoisting) on.
        expect(ratio).toBeLessThan(COMPILE_BUDGET);
    });

    it('compile complex page with @fetch + @form + routing', () => {
        const complexPdx = `
<template>
  <div class="page">
    <h1>{{ title }}</h1>
    @await (users.state() !== 'loading') {
      @for (users.data() as user; track user.id) {
        <div class="user">{{ user.name }} - {{ user.email }}</div>
      }
    } @loading {
      <div>Loading...</div>
    } @error (err) {
      <div>Error: {{ err }}</div>
    }
    <form @submit="handleSubmit">
      <input ::value="name" placeholder="Name">
      <button>Submit</button>
    </form>
  </div>
</template>
<script>
  @page '/users';
  @guard 'users.view';
  @fetch users: 'GET /api/users' as User[];
  @prop title: string = 'Users';
  let name = $signal('');
  const count = $derived(users.data()?.length ?? 0);
  function handleSubmit(e) { e.preventDefault(); }
</script>
<style scoped>
  .page { max-width: 800px; margin: 0 auto; }
  .user { padding: 0.5rem; border-bottom: 1px solid #eee; }
  .user:hover { background: #f9f9f9; }
</style>`;

        const { ratio } = measure('complex page compile', () => {
            compile(complexPdx, 'users.pdx');
        });
        // A compile under 5 ms for a page with @page, @guard, @fetch, @await and a form.
        expect(ratio).toBeLessThan(COMPILE_BUDGET);
    });
});
