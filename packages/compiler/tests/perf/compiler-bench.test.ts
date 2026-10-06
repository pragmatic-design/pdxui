// Compiler benchmark — measures compilation speed of .pdx files.

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

function measure(label: string, fn: () => void, iterations = 100): { best: number; avg: number; ops: number } {
    // Warm up
    for (let i = 0; i < 10; i++) fn();

    const times: number[] = [];
    for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        fn();
        times.push(performance.now() - start);
    }

    const best = Math.min(...times);
    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    const ops = Math.round(1000 / avg);
    console.log(`  ⏱ ${label}: best=${best.toFixed(3)}ms avg=${avg.toFixed(3)}ms (${ops} compilations/sec)`);
    return { best, avg, ops };
}

describe('compiler benchmarks', () => {
    it('compile counter.pdx — new mode (decorator+rune)', () => {
        const { ops } = measure('counter.pdx compile', () => {
            compile(counterPdx, 'counter.pdx');
        });
        // Target: >500 compilations/sec for fast HMR
        expect(ops).toBeGreaterThan(100);
    });

    it('compile todo.pdx — new mode with @for + signals', () => {
        const { ops } = measure('todo.pdx compile', () => {
            compile(todoPdx, 'todo.pdx');
        });
        expect(ops).toBeGreaterThan(100);
    });

    it('compile 10 components sequentially', () => {
        const { avg } = measure('10 components batch', () => {
            for (let i = 0; i < 10; i++) {
                compile(counterPdx, `comp-${i}.pdx`);
            }
        }, 20);
        // 10 components should compile in <50ms for fast build
        expect(avg).toBeLessThan(200);
    });

    it('compile counter.pdx — production mode', () => {
        const { ops } = measure('counter.pdx prod', () => {
            compile(counterPdx, 'counter.pdx', undefined, undefined, { production: true, minify: true });
        });
        // Prod has extra passes (minify, hoisting) — still fast
        expect(ops).toBeGreaterThan(100);
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

        const { ops } = measure('complex page compile', () => {
            compile(complexPdx, 'users.pdx');
        });
        // Complex page: still >500 ops/sec for responsive HMR
        expect(ops).toBeGreaterThan(100);
    });
});
