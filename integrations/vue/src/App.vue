<script setup>
import { ref } from 'vue';

// Object/array props bind to the custom element as PROPERTIES (Vue 3 sets them
// as props when the key exists on the element). Events use @pdx-... listeners.
const roles = [
  { label: 'Engineer', value: 'Engineer' },
  { label: 'Designer', value: 'Designer' },
  { label: 'PM', value: 'PM' },
];
const columns = [
  { field: 'name', header: 'Name' },
  { field: 'role', header: 'Role' },
  { field: 'salary', header: 'Salary', type: 'currency' },
];
const rows = [
  { id: 1, name: 'Alice', role: 'Engineer', salary: 95000 },
  { id: 2, name: 'Bob', role: 'Designer', salary: 82000 },
  { id: 3, name: 'Carol', role: 'PM', salary: 105000 },
];

const selected = ref('Engineer');
const dialogRef = ref(null);

function openDialog() {
  dialogRef.value.show(); // imperative API exposed on the element
}
</script>

<template>
  <main style="padding: 24px; max-width: 880px; margin: 0 auto; font-family: system-ui">
    <h1 class="pdx-txt-title">PDX UI + Vue 3</h1>
    <p class="pdx-ink-muted"><code>@pdxui/ui</code> components installed from npm — props, events and imperative API.</p>

    <div style="display: flex; gap: 12px; align-items: center; margin: 20px 0">
      <pdx-button variant="primary" @click="openDialog">Open dialog (imperative)</pdx-button>
      <pdx-select
        :options.prop="roles"
        :value="selected"
        style="width: 200px"
        @pdx-change="(e) => (selected = e.detail.value)"
      ></pdx-select>
      <span>Role: <b>{{ selected }}</b></span>
    </div>

    <pdx-data-grid :columns.prop="columns" :data.prop="rows" hover striped></pdx-data-grid>

    <pdx-dialog ref="dialogRef" title="Hello from Vue">
      <p>This dialog was opened by calling <code>el.show()</code> on the element.</p>
    </pdx-dialog>
  </main>
</template>
