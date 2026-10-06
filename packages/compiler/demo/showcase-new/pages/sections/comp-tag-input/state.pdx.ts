// The tag-input page's event console: every section writes to it, the page shows it.
@store tagInputLog;

let logs = $signal([]);
let logId = $signal(0);

function addLog(text) {
    const now = new Date();
    const time = now.toLocaleTimeString('en', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    logId = logId + 1;
    logs = [{ id: logId, time, text }, ...logs].slice(0, 20);
}
function clearLog() { logs = []; }
