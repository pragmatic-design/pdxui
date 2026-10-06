import React, { useRef, useEffect, useState } from 'react';

// React (≤18) stringifies object/array props to attributes for custom elements,
// and doesn't wire hyphenated events. Two tiny hooks bridge that via the ref:
function useProp(ref, name, value) {
  useEffect(() => { if (ref.current) ref.current[name] = value; }, [value]);
}
function useEvent(ref, event, handler) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.addEventListener(event, handler);
    return () => el.removeEventListener(event, handler);
  }, [handler]);
}

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

export default function App() {
  const gridRef = useRef(null);
  const selectRef = useRef(null);
  const dialogRef = useRef(null);
  const [selected, setSelected] = useState('Engineer');

  useProp(gridRef, 'columns', columns);
  useProp(gridRef, 'data', rows);
  useProp(selectRef, 'options', roles);
  useProp(selectRef, 'value', selected);
  useEvent(selectRef, 'pdx-change', (e) => setSelected(e.detail.value));

  return (
    <main style={{ padding: 24, maxWidth: 880, margin: '0 auto', fontFamily: 'system-ui' }}>
      <h1 className="pdx-txt-title">PDX UI + React</h1>
      <p className="pdx-ink-muted"><code>@pdxui/ui</code> components from npm — props (via ref), events and imperative API.</p>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', margin: '20px 0' }}>
        <pdx-button variant="primary" onClick={() => dialogRef.current.show()}>Open dialog (imperative)</pdx-button>
        <pdx-select ref={selectRef} style={{ width: 200 }}></pdx-select>
        <span>Role: <b>{selected}</b></span>
      </div>

      <pdx-data-grid ref={gridRef}></pdx-data-grid>

      <pdx-dialog ref={dialogRef} title="Hello from React">
        <p>This dialog was opened with <code>el.show()</code>.</p>
      </pdx-dialog>
    </main>
  );
}
