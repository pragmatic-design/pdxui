// The chip page's event console: the page shows it, and the removable, avatar, selectable and
// composition sections write to it.
@store chipConsole;

// Console
let logs = $signal([]);
let logId = $signal(0);

function addLog(text) {
    const now = new Date();
    const time = now.toLocaleTimeString('en', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    logId = logId + 1;
    logs = [{ id: logId, time, text }, ...logs].slice(0, 20);
}
function clearLog() { logs = []; }

// The avatar chips and the team card remove a person the same way, and say so in the console.
function dropPerson(list, e) {
    const val = e.detail ? e.detail.value : '';
    addLog('removed: ' + val);
    return list.filter(p => p.name !== val);
}
