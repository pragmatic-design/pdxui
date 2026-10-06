// The context-menu page's event line: both menus write to it, the right-click section shows it.
@store contextMenuLog;

let ctxLog = $signal('Right-click the area above...');

function onSelect(e) {
  ctxLog = 'pdx-select: ' + e.detail.key;
}
