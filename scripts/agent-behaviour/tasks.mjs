// The tasks, on the four pages the description API was measured on (#271). Each one has a start, a
// prompt and a check the script runs itself, on the page, once the agent has stopped — the agent's
// own claim is never the check. A task that asks for an answer is checked against what the page
// shows, read by the script.
//
// `check(page)` gets `page.read(js)`, which evaluates `js` in the page, and `page.answer`, the
// agent's last message. It returns `{ done, detail }`.

/** Text without its whitespace runs, for comparing what a person reads. */
const norm = (text) => String(text ?? '').replace(/\s+/g, ' ').trim();

/** The data rows of the list in the page, each as its text. */
const ROWS = `[...document.querySelectorAll('[data-test="grid"] [data-pdx-item]')].map((r) => r.textContent.replace(/\\s+/g, ' ').trim())`;

export const TASKS = [
    {
        id: 'customers-status',
        start: '/customers',
        ready: '[data-test="grid"] [data-pdx-item]',
        prompt: 'Show only the customers whose status is Onboarding.',
        check(page) {
            const { rows, total } = page.read(`({ rows: ${ROWS}, total: document.querySelector('[data-test="total"]')?.textContent })`);
            const statuses = page.read(`[...document.querySelectorAll('[data-test="grid"] [data-pdx-item] [data-field="status"]')].map((c) => c.textContent.trim())`);
            const done = statuses.length > 0 && statuses.length === rows.length && statuses.every((s) => s === 'Onboarding') && !/^24\b/.test(norm(total));
            return { done, detail: `${rows.length} rows, statuses ${[...new Set(statuses)].join(', ') || 'none'}, "${norm(total)}"` };
        },
    },
    {
        id: 'customers-page-2',
        start: '/customers',
        ready: '[data-test="grid"] [data-pdx-item]',
        prompt: 'Go to the second page of the customers list.',
        check(page) {
            const range = norm(page.read(`document.querySelector('[data-test="grid"] [role="navigation"], [data-test="grid"] nav')?.textContent`));
            return { done: /11\s*–\s*20 of 24/.test(range), detail: range.slice(0, 60) };
        },
    },
    {
        id: 'customers-search',
        start: '/customers',
        ready: '[data-test="grid"] [data-pdx-item]',
        prompt: 'Find the customer Fourth Coffee using the search box of the customers list.',
        check(page) {
            const { rows, query } = page.read(`({ rows: ${ROWS}, query: document.querySelector('[data-test="grid"] input[type="search"], [data-test="grid"] [aria-label="Search"]')?.value })`);
            const done = !!norm(query) && rows.length > 0 && rows.every((r) => r.includes('Fourth Coffee'));
            return { done, detail: `search "${norm(query)}", ${rows.length} rows` };
        },
    },
    {
        id: 'customers-sort',
        start: '/customers',
        ready: '[data-test="grid"] [data-pdx-item]',
        prompt: 'Sort the customers by name, from Z to A.',
        check(page) {
            const sorts = page.read(`[...document.querySelectorAll('[data-test="grid"] [aria-sort]')].map((h) => [h.textContent.replace(/\\s+/g, ' ').trim(), h.getAttribute('aria-sort')]).filter(([, s]) => s !== 'none')`);
            const done = sorts.length === 1 && /^Name/.test(sorts[0][0]) && sorts[0][1] === 'descending';
            return { done, detail: sorts.map(([n, s]) => `${n.slice(0, 20)}: ${s}`).join('; ') || 'no sort' };
        },
    },
    {
        id: 'intake-invalid-email',
        start: '/intake',
        ready: '[data-test="form-intake"] form',
        prompt: 'In the first step of the intake, enter "Ada Byron" as the requester and "ada-at-example" as the email, then try to go to the next step. Reply with the exact error message the form shows for the email, and nothing else.',
        check(page) {
            const { invalid, message, step } = page.read(`(() => {
                const email = [...document.querySelectorAll('[data-test="form-intake"] input')].find((i) => /email/i.test(i.getAttribute('aria-label') || i.name || i.labels?.[0]?.textContent || ''));
                const ids = (email?.getAttribute('aria-describedby') || '').split(/\\s+/).filter(Boolean);
                const message = ids.map((id) => document.getElementById(id)?.textContent || '').join(' ');
                const step = document.querySelector('[aria-current="step"]')?.textContent;
                return { invalid: email?.getAttribute('aria-invalid'), message, step };
            })()`);
            const shown = norm(message);
            const done = invalid === 'true' && !!shown && norm(page.answer).toLowerCase().includes(shown.toLowerCase());
            return { done, detail: `aria-invalid=${invalid}, shown "${shown}", step "${norm(step)}", answered "${norm(page.answer).slice(0, 80)}"` };
        },
    },
    {
        id: 'intake-step-1',
        start: '/intake',
        ready: '[data-test="form-intake"] form',
        prompt: 'Complete the first step of the intake — requester Ada Byron, email ada@example.com, customer Northwind Traders — and move on to the second step.',
        check(page) {
            const step = norm(page.read(`document.querySelector('[data-test="wizard"]')?.textContent.match(/Step \\d+ of \\d+/)?.[0]`));
            return { done: step === 'Step 2 of 4', detail: step || 'no step shown' };
        },
    },
    {
        id: 'ticket-status',
        start: '/tickets',
        ready: '[data-test="grid"] [data-pdx-item]',
        prompt: 'Change the status of ticket T-1011 to Open, and save it.',
        check(page) {
            // The row is looked up by the script, through the list's own search: T-1011 is on page 2.
            page.act('scrollintoview', '[data-test="grid"] [aria-label="Search"]');
            page.act('fill', '[data-test="grid"] [aria-label="Search"]', 'T-1011');
            page.act('wait', '800');
            const status = page.read(`[...document.querySelectorAll('[data-test="grid"] [data-pdx-item]')].filter((r) => r.textContent.includes('T-1011')).map((r) => r.querySelector('[data-field="status"]')?.textContent.trim())`);
            return { done: status.length === 1 && status[0] === 'Open', detail: `T-1011 status: ${status.join(', ') || 'row not found'}` };
        },
    },
    {
        id: 'nav-services',
        start: '/',
        ready: '[data-test="dashboard"]',
        prompt: 'Open the page titled Services.',
        check(page) {
            const path = page.read('location.pathname');
            return { done: path === '/services', detail: path };
        },
    },
    {
        id: 'nav-users',
        start: '/',
        ready: '[data-test="dashboard"]',
        prompt: 'Open the page where the application\'s users are managed.',
        check(page) {
            const path = page.read('location.pathname');
            return { done: path === '/settings/users', detail: path };
        },
    },
    {
        id: 'dashboard-open',
        start: '/',
        ready: '[data-test="kpi-open"]',
        prompt: 'How many tickets are open? Reply with the number only.',
        check(page) {
            const shown = norm(page.read(`document.querySelector('[data-test="kpi-open"] [data-test="kpi-value"]')?.textContent`));
            const answered = norm(page.answer).match(/\d+/)?.[0] ?? '';
            return { done: !!shown && answered === shown, detail: `shown ${shown}, answered "${norm(page.answer).slice(0, 40)}"` };
        },
    },
];
