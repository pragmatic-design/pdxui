// The tickets list's live knobs, for the Demo panel, for `pages/tickets.pdx`.
//
// The simulated server's knobs are the DEMO's, not the screen's: they are in the Demo panel of the
// service bar, and leave with the page. They have no markup, so a module, not a `.pdx`.
// What a colleague does is here so a reader can try each case of the live list rather than read
// about it.
import type { DataSource } from '@pdxui/core';
import type { DemoKnob } from '../demo';
import type { Ticket } from '../data/tickets';
import type { LiveList } from '../data/live-list';
import { colleagueClosesTicket, colleagueRetitlesTicket, colleagueRaisesTicket, colleagueWithdrawsTicket } from '../data/live';

/**
 * The connection's pair and the colleague's four, as two lists: the page puts its own knobs between
 * them, in the order the panel had.
 */
export function liveDemoKnobs(source: DataSource<Ticket>, live: LiveList): { connection: DemoKnob[]; colleague: DemoKnob[] } {
    const row = (i: number) => source.data()[i];
    return {
        connection: [
            { test: 'go-offline', label: 'tickets.live.drop', run: live.goOffline, when: () => live.connection() === 'live' },
            { test: 'go-online', label: 'tickets.live.reconnect', run: () => { void live.goOnline(); }, when: () => live.connection() === 'down' },
        ],
        colleague: [
            { test: 'push-close', label: 'tickets.live.pushClose', group: 'tickets.live.colleague',
              run: () => { const r = row(1); if (r) void colleagueClosesTicket(r.id); } },
            { test: 'push-retitle', label: 'tickets.live.pushRetitle', group: 'tickets.live.colleague',
              run: () => { const r = row(1); if (r) void colleagueRetitlesTicket(r.id, 'Retitled by a colleague'); } },
            { test: 'push-raise', label: 'tickets.live.pushRaise', group: 'tickets.live.colleague',
              run: () => { void colleagueRaisesTicket('Raised from another desk'); } },
            { test: 'push-withdraw', label: 'tickets.live.pushWithdraw', group: 'tickets.live.colleague',
              run: () => { const r = row(2); if (r) void colleagueWithdrawsTicket(r.id); } },
        ],
    };
}
