import { Component, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';

// CUSTOM_ELEMENTS_SCHEMA lets Angular templates use <pdx-*> custom elements.
// Object/array inputs use [prop] (property binding); events use (pdx-event).
@Component({
  selector: 'app-root',
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `
    <main style="padding:24px;max-width:880px;margin:0 auto;font-family:system-ui">
      <h1 class="pdx-txt-title">PDX UI + Angular</h1>
      <p class="pdx-ink-muted">
        <code>&#64;pdxui/ui</code> components from npm — [prop] / (event) bindings and imperative API.
      </p>

      <div style="display:flex;gap:12px;align-items:center;margin:20px 0">
        <pdx-button variant="primary" (click)="open(dialog)">Open dialog (imperative)</pdx-button>
        <pdx-select [options]="roles" [value]="selected" style="width:200px" (pdx-change)="onChange($event)"></pdx-select>
        <span>Role: <b>{{ selected }}</b></span>
      </div>

      <pdx-data-grid [columns]="columns" [data]="rows"></pdx-data-grid>

      <pdx-dialog #dialog title="Hello from Angular">
        <p>This dialog was opened with <code>el.show()</code>.</p>
      </pdx-dialog>
    </main>
  `,
})
export class AppComponent {
  roles = [
    { label: 'Engineer', value: 'Engineer' },
    { label: 'Designer', value: 'Designer' },
    { label: 'PM', value: 'PM' },
  ];
  columns = [
    { field: 'name', header: 'Name' },
    { field: 'role', header: 'Role' },
    { field: 'salary', header: 'Salary', type: 'currency' },
  ];
  rows = [
    { id: 1, name: 'Alice', role: 'Engineer', salary: 95000 },
    { id: 2, name: 'Bob', role: 'Designer', salary: 82000 },
    { id: 3, name: 'Carol', role: 'PM', salary: 105000 },
  ];
  selected = 'Engineer';

  onChange(e: any) { this.selected = e.detail.value; }
  open(d: any) { d.show(); } // imperative API on the custom element
}
