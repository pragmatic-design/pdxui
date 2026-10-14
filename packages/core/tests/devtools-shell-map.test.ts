// `__PDX_DEVTOOLS__.shell()` and `.map()` (#272): the part of the page every route shares, and the
// route graph the router hands over.

import { describe, it, expect, afterEach } from 'vitest';
import { devtoolsApi, setDevtoolsMapSource } from '../src/debug/devtools-api';

const added: HTMLElement[] = [];
afterEach(() => {
    for (const el of added.splice(0)) el.remove();
    setDevtoolsMapSource(null);
});

function add(html: string, tag = 'div'): HTMLElement {
    const el = document.createElement(tag);
    el.innerHTML = html;
    document.body.appendChild(el);
    added.push(el);
    return el;
}

describe('shell()', () => {
    it('outlines everything outside the routed element, and nothing inside it', () => {
        add('<nav aria-label="Sections"><a href="/customers">Customers</a><a href="/tickets">Tickets</a></nav>');
        add('<main><x-page data-pdx-route><h1>Dashboard</h1><button>Refresh</button></x-page></main>');
        const shell = devtoolsApi.shell();
        expect(shell).toContain('navigation "Sections"');
        expect(shell).toContain('"Customers"');
        expect(shell).toContain('"Tickets"');
        expect(shell).not.toContain('Dashboard');
        expect(shell).not.toContain('Refresh');
    });

    it('uses the outline\'s selectors, so a ref read in the shell is a ref the agent can act on', () => {
        add('<header><button data-test="theme">Theme</button></header>');
        add('<x-page data-pdx-route><p>Body</p></x-page>');
        expect(devtoolsApi.shell()).toContain('button "Theme" [[data-test="theme"]]');
    });

    it('an overlay the route opened outside it — a filter\'s popover — is the outline\'s, not the shell\'s', () => {
        // A popover, a listbox or a menu is mounted on the body, outside the route. The user is
        // looking at it now; the shell is read once per session and would never show it.
        add('<nav aria-label="Sections"><a href="/a">A</a></nav>');
        add('<x-page data-pdx-route><button>Status</button></x-page>');
        add('<div role="dialog" aria-label="Status filter"><input type="checkbox" aria-label="Onboarding"><button>Apply</button></div>');
        add('<div role="listbox" aria-label="Closed list" hidden><div role="option">Gone</div></div>');
        const outline = devtoolsApi.outline();
        const shell = devtoolsApi.shell();
        expect(outline).toContain('dialog "Status filter"');
        expect(outline).toContain('checkbox "Onboarding"');
        expect(shell).not.toContain('Status filter');
        expect(shell).toContain('navigation "Sections"');
        // A closed overlay is in neither.
        expect(outline + shell).not.toContain('Gone');
    });

    it('a label written after the control it names is dropped, as one written before it is', () => {
        add('<x-page data-pdx-route><label><input type="checkbox" aria-label="Active"> Active</label></x-page>');
        expect(devtoolsApi.outline()).toBe('- checkbox "Active" [x-page input]');
    });

    it('an overlay inside the route stays where it is, and is not listed twice', () => {
        add('<x-page data-pdx-route><div role="dialog" aria-label="Edit"><button>Save</button></div></x-page>');
        expect(devtoolsApi.outline().match(/dialog "Edit"/g)).toHaveLength(1);
    });

    it('without a routed element there is no boundary, and so no shell', () => {
        add('<nav aria-label="Sections"><a href="/a">A</a></nav>');
        expect(devtoolsApi.shell()).toBe('');
    });
});

describe('map()', () => {
    it('is empty with no router', () => {
        expect(devtoolsApi.map()).toEqual([]);
    });

    it('is what the router hands over', () => {
        setDevtoolsMapSource(() => [
            { path: '/tickets/:id', params: [{ name: 'id', type: 'string' }], title: 'Ticket', guard: 'tickets.read', access: false },
        ]);
        expect(devtoolsApi.map()).toEqual([
            { path: '/tickets/:id', params: [{ name: 'id', type: 'string' }], title: 'Ticket', guard: 'tickets.read', access: false },
        ]);
    });
});
