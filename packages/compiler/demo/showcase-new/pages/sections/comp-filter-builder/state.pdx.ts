// The products both filter-builder sections filter.
export const categories = ['Electronics', 'Clothing', 'Books', 'Home', 'Sports'];
export var products = [];
for (var i = 1; i <= 50; i++) {
  products.push({ id: i, name: 'Product ' + i, category: categories[(i - 1) % 5], price: Math.round(Math.random() * 500 + 10), stock: Math.floor(Math.random() * 200) });
}
