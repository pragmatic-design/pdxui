// The button-group page's state: the page shows the event console, and the toggle and the
// composition sections share the selections — the composition reads the alignment and the
// formatting the toggle sections set.
@store buttonGroupDemo;

// Event console
let logs = $signal([]);
let _logId = 0;

function addLog(label, text) {
    const now = new Date();
    const time = now.toLocaleTimeString('en', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }) + '.' + String(now.getMilliseconds()).padStart(3, '0');
    logs = [{ id: ++_logId, time, label, text }, ...logs].slice(0, 30);
}

function clearLog() {
    logs = [];
}

// Single toggle state
let alignment = $signal('left');
let viewMode = $signal('list');
let priority = $signal('');

// Multiple toggle state
let formatting = $signal('');
let filters = $signal('');

function onAlignment(e) {
    alignment = e.detail;
    addLog('alignment', 'changed to "' + e.detail + '"');
}

function onViewMode(e) {
    viewMode = e.detail;
    addLog('view', 'changed to "' + e.detail + '"');
}

function onPriority(e) {
    priority = e.detail;
    addLog('priority', 'changed to "' + e.detail + '"');
}

function onFormatting(e) {
    formatting = e.detail;
    addLog('formatting', 'changed to "' + (e.detail || 'none') + '"');
}

function onFilters(e) {
    filters = e.detail;
    addLog('filters', 'changed to "' + (e.detail || 'none') + '"');
}
