// The rows and columns the selection sections show.
export const data = [
  { id: 1, name: 'Alice Johnson', email: 'alice@acme.com', role: 'Engineer', salary: 95000 },
  { id: 2, name: 'Bob Smith', email: 'bob@acme.com', role: 'Designer', salary: 82000 },
  { id: 3, name: 'Carol White', email: 'carol@acme.com', role: 'PM', salary: 105000 },
  { id: 4, name: 'David Brown', email: 'david@acme.com', role: 'Engineer', salary: 98000 },
  { id: 5, name: 'Eve Davis', email: 'eve@acme.com', role: 'DevOps', salary: 91000 },
  { id: 6, name: 'Frank Miller', email: 'frank@acme.com', role: 'QA', salary: 78000 },
  { id: 7, name: 'Grace Lee', email: 'grace@acme.com', role: 'Engineer', salary: 102000 },
  { id: 8, name: 'Henry Wilson', email: 'henry@acme.com', role: 'Designer', salary: 85000 },
];

export const columns = [
  { field: 'name', header: 'Name', width: 180 },
  { field: 'email', header: 'Email', width: 220 },
  { field: 'role', header: 'Role', width: 120 },
  { field: 'salary', header: 'Salary', type: 'currency', width: 120 },
];
