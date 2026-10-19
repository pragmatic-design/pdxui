// The memory scenario's host (#243): a mock transport for the page's @fetch, and `window.__cycle(n, tag)`,
// which mounts the page, waits for its 200 rows, and removes it, n times.
import './memory-row.pdx';
import './memory-page.pdx';
import './memory-leaky.pdx';

const ROWS = Array.from({ length: 200 }, (_, i) => ({ id: i, name: `Row ${i}`, note: `note ${i} `.repeat(8) }));

// The page's @fetch reaches this, not a network: every mount reads a fresh response.
window.fetch = async () => new Response(JSON.stringify(ROWS), { headers: { 'content-type': 'application/json' } });

const host = document.getElementById('host');
const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));

/** Resolves once `page` shows all its rows, each with its child rendered. */
async function rendered(page) {
    for (let i = 0; i < 300; i++) {
        if (page.querySelectorAll('app-memory-row .row').length === ROWS.length) return;
        await frame();
    }
    throw new Error(`${page.localName} did not render its ${ROWS.length} rows`);
}

window.__cycle = async (n, tag = 'app-memory-page') => {
    for (let i = 0; i < n; i++) {
        const page = document.createElement(tag);
        host.append(page);
        await rendered(page);
        page.remove();
        await frame();
    }
};
window.__ready = true;
