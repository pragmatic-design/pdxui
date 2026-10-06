// The dropdown-menu page's "Last selected" line: the basic and the custom-trigger menus both write
// it, and both sections show it. The items three sections share are in data.pdx.ts: a
// @store module cannot also export them.
@store dropdownMenuLog;

let lastSelect = $signal('—');

function onSelect(e) { lastSelect = (e.detail && e.detail.key) || '—'; }
