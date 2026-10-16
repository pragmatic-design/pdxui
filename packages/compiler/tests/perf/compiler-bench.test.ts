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

import { describe, it, expect } from 'vitest';
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
<script setup>
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
<script setup>
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

/** One compile's budget, in ms: the median of a case's runs must be under it. */
const COMPILE_BUDGET_MS = 5;

function measure(label: string, fn: () => void, iterations = 100): { best: number; median: number; avg: number } {
    // Warm up: 10 runs left the JIT still settling on the complex page, whose median then read
    // 4.6 ms against 3.3 after 20.
    for (let i = 0; i < 30; i++) fn();

    const times: number[] = [];
    for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        fn();
        times.push(performance.now() - start);
    }

    const sorted = [...times].sort((a, b) => a - b);
    const best = sorted[0];
    const median = sorted[Math.floor(sorted.length / 2)];
    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    console.log(`  ⏱ ${label}: best=${best.toFixed(3)}ms median=${median.toFixed(3)}ms avg=${avg.toFixed(3)}ms`);
    return { best, median, avg };
}

describe('compiler benchmarks', () => {
    it('compile counter.pdx — new mode (decorator+rune)', () => {
        const { median } = measure('counter.pdx compile', () => {
            compile(counterPdx, 'counter.pdx');
        });
        // A compile under 5 ms: the component saved, compiled again for HMR.
        expect(median).toBeLessThan(COMPILE_BUDGET_MS);
    });

    it('compile todo.pdx — new mode with @for + signals', () => {
        const { median } = measure('todo.pdx compile', () => {
            compile(todoPdx, 'todo.pdx');
        });
        // A compile under 5 ms, with a @for and two-way binding.
        expect(median).toBeLessThan(COMPILE_BUDGET_MS);
    });

    it('compile 10 components sequentially', () => {
        const { median } = measure('10 components batch', () => {
            for (let i = 0; i < 10; i++) {
                compile(counterPdx, `comp-${i}.pdx`);
            }
        }, 20);
        // 10 compiles under 50 ms: the same 5 ms each, back to back, as a build does them.
        expect(median).toBeLessThan(10 * COMPILE_BUDGET_MS);
    });

    it('compile counter.pdx — production mode', () => {
        const { median } = measure('counter.pdx prod', () => {
            compile(counterPdx, 'counter.pdx', undefined, undefined, { production: true, minify: true });
        });
        // A compile under 5 ms with the production passes (minify, hoisting) on.
        expect(median).toBeLessThan(COMPILE_BUDGET_MS);
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
<script setup>
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

        const { median } = measure('complex page compile', () => {
            compile(complexPdx, 'users.pdx');
        });
        // A compile under 5 ms for a page with @page, @guard, @fetch, @await and a form.
        expect(median).toBeLessThan(COMPILE_BUDGET_MS);
    });
});
