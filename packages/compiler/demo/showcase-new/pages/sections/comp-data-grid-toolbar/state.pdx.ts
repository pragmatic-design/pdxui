// ─── Shared data ────────────────────────────
// The products and people the toolbar page's sections show.
export const categories = ['Electronics', 'Clothing', 'Books', 'Home', 'Sports'];
export var products = [];
for (var i = 1; i <= 100; i++) {
  products.push({
    id: i,
    name: 'Product ' + i,
    category: categories[(i - 1) % categories.length],
    price: Math.round(Math.random() * 500 + 10),
    stock: Math.floor(Math.random() * 200),
    inStock: Math.random() > 0.2,
  });
}

export const typedData = [
  { id: 1, name: 'Alice Johnson', role: 'Engineer', salary: 95000, isActive: true, joinedAt: '2022-03-15' },
  { id: 2, name: 'Bob Smith', role: 'Designer', salary: 82000, isActive: true, joinedAt: '2021-07-01' },
  { id: 3, name: 'Carol White', role: 'PM', salary: 105000, isActive: false, joinedAt: '2020-01-10' },
  { id: 4, name: 'David Brown', role: 'Engineer', salary: 98000, isActive: true, joinedAt: '2023-06-20' },
  { id: 5, name: 'Eve Davis', role: 'DevOps', salary: 91000, isActive: true, joinedAt: '2022-11-05' },
  { id: 6, name: 'Frank Miller', role: 'QA', salary: 78000, isActive: false, joinedAt: '2019-09-12' },
  { id: 7, name: 'Grace Lee', role: 'Engineer', salary: 102000, isActive: true, joinedAt: '2021-02-28' },
  { id: 8, name: 'Henry Wilson', role: 'Designer', salary: 85000, isActive: true, joinedAt: '2023-01-15' },
];
