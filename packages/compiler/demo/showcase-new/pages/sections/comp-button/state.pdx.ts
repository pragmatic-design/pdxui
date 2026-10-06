// The event console of the button page: the page shows it, every section writes to it.
@store buttonConsole;

let logs = $signal([]);
let _logId = 0;

function log(e) {
    const btn = e.target.closest('button') || e.target.closest('pdx-button');
    const text = btn ? btn.textContent.trim() : 'click';
    const variant = btn ? (btn.getAttribute('variant') || btn.className.replace('pdx-', '').split(' ')[0] || 'primary') : 'unknown';
    const colors = { primary: 'var(--pdx-color-primary)', secondary: 'var(--pdx-color-secondary)', outline: 'var(--pdx-color-text)', ghost: 'var(--pdx-color-muted)', link: 'var(--pdx-color-primary)', danger: 'var(--pdx-color-danger)', success: 'var(--pdx-color-success)', warning: 'var(--pdx-color-warning)', info: 'var(--pdx-color-accent)' };
    const now = new Date();
    const time = now.toLocaleTimeString('en', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }) + '.' + String(now.getMilliseconds()).padStart(3, '0');
    logs = [{ id: ++_logId, time, variant, text: '"' + text + '" clicked', color: colors[variant] || 'var(--pdx-color-text)' }, ...logs].slice(0, 50);
}

function clearLog() {
    logs = [];
}
