// ─── Basic data ──────────────────────────────
export const basicData = [
  { id: 1, name: 'Alice Johnson', email: 'alice@acme.com', role: 'Engineer' },
  { id: 2, name: 'Bob Smith', email: 'bob@acme.com', role: 'Designer' },
  { id: 3, name: 'Carol White', email: 'carol@acme.com', role: 'PM' },
  { id: 4, name: 'David Brown', email: 'david@acme.com', role: 'Engineer' },
  { id: 5, name: 'Eve Davis', email: 'eve@acme.com', role: 'DevOps' },
];

// ─── Typed columns ───────────────────────────
export const typedColumns = [
  { field: 'name', header: 'Name', width: 180 },
  { field: 'email', header: 'Email', type: 'email', width: 220 },
  { field: 'role', header: 'Role', width: 120 },
  { field: 'salary', header: 'Salary', type: 'currency', width: 120 },
  { field: 'isActive', header: 'Active', type: 'boolean', width: 80 },
  { field: 'joinedAt', header: 'Joined', type: 'date', width: 130 },
];
