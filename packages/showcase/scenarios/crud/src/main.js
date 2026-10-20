// The crud scenario's host (#245): a local mock transport, so the bundle weighed is the page's and
// nothing of a server's client. GET answers the list, POST takes a row and adds it.
import './crud-app.pdx';

const rows = Array.from({ length: 100 }, (_, i) => ({ id: i + 1, name: `Person ${i + 1}`, email: `p${i + 1}@example.com`, role: 'member' }));

window.fetch = async (input, init = {}) => {
    const path = new URL(typeof input === 'string' ? input : input.url, location.href).pathname;
    if (path === '/api/people' && (init.method ?? 'GET') === 'POST') {
        const row = { id: rows.length + 1, ...JSON.parse(init.body) };
        rows.push(row);
        return Response.json(row, { status: 201 });
    }
    if (path === '/api/people') return Response.json(rows);
    return new Response(null, { status: 404 });
};
