// The products and columns both grouping sections show.
const categories = ['Electronics', 'Clothing', 'Books', 'Home', 'Sports'];
export const products = [];
for (var i = 1; i <= 40; i++) {
  products.push({
    id: i, name: 'Product ' + i,
    category: categories[(i - 1) % categories.length],
    price: Math.round(Math.random() * 500 + 10),
    stock: Math.floor(Math.random() * 200),
  });
}

export const columns = [
  { field: 'name', header: 'Product' },
  { field: 'category', header: 'Category' },
  { field: 'price', header: 'Price', type: 'currency' },
  { field: 'stock', header: 'Stock', type: 'number' },
];
