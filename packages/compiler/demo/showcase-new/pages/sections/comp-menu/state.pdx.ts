// The menu page's shared state: one demo menu open at a time across the sections, and the line
// every menu writes and the basic section shows.
@store menuDemo;

// Which demo menu is open: one at a time, from its button.
let shown = $signal('');

function show(key) { shown = shown === key ? '' : key; }

// Close the menu and give focus back to its button, the element before it.
function hide(e) {
  shown = '';
  var btn = e.target.previousElementSibling;
  if (btn) btn.focus();
}

let menuLog = $signal('Choose an item...');

function onSelect(e) {
  menuLog = 'pdx-select: ' + e.detail.key;
  hide(e);
}
