// The service desk's event feed, in memory.
//
// A ticket list that does not change when a colleague changes a ticket is the moment a business
// application stops being believed. The framework ships no socket client, and should not: the
// transport is the application's decision. What it ships is the bridge — `fromCallback(setup)` —
// and this file is the other end of it, written the way a real one would be so the screen wiring
// is the same.
//
// Deliberate choices, because they are what make the demo honest:
//
//   - **events are commanded, not timed.** A setInterval feed looks alive in a screenshot and
//     makes every test a race. Here a "colleague" acts when someone (a button, a test) says so,
//     and the screen's behaviour is what is on show;
//   - **a colleague's action changes the SERVER first.** The event is emitted after the in-memory
//     store has really changed, so a refresh agrees with what the push said. A mock that only
//     emits teaches a lie: reload and the change is gone;
//   - **a dropped connection loses what happened while it was down**, and does not secretly
//     replay it. That is what a socket does. The screen's job is to notice and resynchronise,
//     and it cannot practise that against a feed that quietly covers for it.

// The store's own mutations, not `ticketTransport`: the transport carries the latency that
// makes THIS page's optimistic writes visible, and a colleague is another
// browser whose round trip this application does not model.
import { createRow, updateRow, destroyRow, ticketById, ticketCount } from './tickets';
import type { Ticket } from './tickets';
import { CUSTOMER_NAMES } from './customer-seed';

export type TicketEventType = 'created' | 'updated' | 'deleted';

export interface TicketEvent {
    type: TicketEventType;
    ticket: Ticket;
    /** Monotonic, so a reader can tell it missed something. */
    seq: number;
}

/** What the user is allowed to see about the connection, because "live" that died in silence is worse than no live at all. */
export type ConnectionState = 'live' | 'down';

type EventListener = (event: TicketEvent) => void;
type StateListener = (state: ConnectionState) => void;

let seq = 0;
let state: ConnectionState = 'live';
let missedWhileDown = 0;
const eventListeners = new Set<EventListener>();
const stateListeners = new Set<StateListener>();

/**
 * Subscribe to the feed. The shape is a socket's: hand it two callbacks, get a disposer back —
 * which is exactly what `fromCallback(setup)` wants.
 */
export function connectTicketEvents(onEvent: EventListener, onState?: StateListener): () => void {
    eventListeners.add(onEvent);
    if (onState) {
        stateListeners.add(onState);
        onState(state);
    }
    return () => {
        eventListeners.delete(onEvent);
        if (onState) stateListeners.delete(onState);
    };
}

function emit(type: TicketEventType, ticket: Ticket): void {
    // Down means down: the event happened on the server and this client did not hear it. Counting
    // it is the only trace, and it is what lets the screen say how far behind it was.
    if (state === 'down') { missedWhileDown++; return; }
    const event: TicketEvent = { type, ticket, seq: ++seq };
    for (const listener of eventListeners) listener(event);
}

function setState(next: ConnectionState): void {
    if (state === next) return;
    state = next;
    for (const listener of stateListeners) listener(next);
}

/** How many events this client did not hear. Reset when the screen resynchronises. */
export function missedCount(): number { return missedWhileDown; }
export function clearMissed(): void { missedWhileDown = 0; }
export function connectionState(): ConnectionState { return state; }

export function dropConnection(): void { setState('down'); }
export function restoreConnection(): void { setState('live'); }

// ─── What a colleague does, from their own browser ─────────────────────────────

/** Someone else closes a ticket: the server changes, then the event goes out. */
export async function colleagueClosesTicket(id: number): Promise<void> {
    const row = ticketById(id);
    if (!row) return;
    const saved = updateRow({ ...row, status: 'closed' });
    emit('updated', saved);
}

/** Someone else retitles a ticket — the case that collides with an editor open on the same row. */
export async function colleagueRetitlesTicket(id: number, subject: string): Promise<void> {
    const row = ticketById(id);
    if (!row) return;
    const saved = updateRow({ ...row, subject });
    emit('updated', saved);
}

/** A ticket raised elsewhere. */
export async function colleagueRaisesTicket(subject: string): Promise<void> {
    const created = createRow({
        subject, customer: CUSTOMER_NAMES[0], customerId: 1, priority: 'high', status: 'open',
    });
    emit('created', created);
}

/** A ticket withdrawn elsewhere — including, on purpose, one the user may have selected. */
export async function colleagueWithdrawsTicket(id: number): Promise<void> {
    const row = ticketById(id);
    if (!row) return;
    destroyRow(row);
    emit('deleted', row);
}

/** Back to a quiet feed. A test that pushes needs it, and so does the page's reset. */
export function resetLive(): void {
    seq = 0;
    state = 'live';
    missedWhileDown = 0;
}

/** How many rows the server holds — the screen uses it to say whether a resync found anything. */
export function serverTicketCount(): number { return ticketCount(); }
