// The products every filtering section shows, and the columns two of them share.
export const categories = ['Electronics', 'Clothing', 'Books', 'Home', 'Sports'];
function isoDaysAgo(n) { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); }
export const products = [];
for (var i = 1; i <= 50; i++) {
  products.push({
    id: i, name: 'Product ' + i,
    category: categories[(i - 1) % categories.length],
    price: Math.round(Math.random() * 500 + 10),
    stock: Math.floor(Math.random() * 200),
    date: isoDaysAgo((i - 1) % 45), // product 1 = today, 2 = yesterday, …
    inStock: Math.random() > 0.2,
  });
}

export const filterColumns = [
  { field: 'name', header: 'Product' },
  { field: 'category', header: 'Category' },
  { field: 'price', header: 'Price', type: 'currency' },
  { field: 'stock', header: 'Stock', type: 'number' },
];
