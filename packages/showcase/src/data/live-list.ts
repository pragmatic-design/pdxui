// Live: what a colleague does, arriving on the list.
//
// The framework ships no socket client, and should not — the transport is the application's
// choice. It ships the bridge: `fromCallback(setup)` turns "call me back with values" into a signal,
// and `setup` returns the disposer, so the subscription dies with the component that called this.
//
// The five questions this answers, because a live list is easy to start and hard to finish:
//
//   1. **A push for a row on screen.** `source.applyServerChange()`, never `refresh()`. A refresh
//      re-reads the page and the grid rebuilds: selection gone, scroll back to the top, an open
//      editor closed. `applyServerChange` writes into the loaded page underneath the change set, so
//      the row updates and nothing else moves.
//   2. **Write through, or invalidate and refetch?** Write through, for a change the server has
//      already described in full — it is one row, it is already here, and a refetch costs a round
//      trip to learn what the push just said. Refetch is for the case below, where what was missed
//      is unknown.
//   3. **The connection drops and comes back.** What happened while it was down is gone: this client
//      did not hear it, and a feed that secretly replays it teaches a lie. So the screen says it is
//      stale WHILE it is down, and on reconnect it does the one honest thing — refresh and start
//      listening again.
//   4. **A push and an unsaved local edit race for the same row.** `applyServerChange` returns
//      `shadowed`: the user keeps seeing their own edit (nobody should have a field yanked from under
//      them mid-sentence), the server's value sits underneath, and the notice says something arrived.
//   5. **The connection's state is visible**, because "live" that quietly died is worse than no live
//      at all.
import { signal, watch, fromCallback } from '@pdxui/core';
import type { Signal, DataSource } from '@pdxui/core';
import type { Ticket } from './tickets';
import { connectTicketEvents, dropConnection, restoreConnection, missedCount, clearMissed } from './live';
import type { ConnectionState, TicketEvent } from './live';

/** What the notice says, in the page's language: `$t` is the page's. */
export interface LiveWords {
    shadowed(reference: string): string;
    withdrawn(reference: string): string;
    changed(reference: string): string;
    resynced(count: number): string;
}

export interface LiveListOptions {
    source: DataSource<Ticket>;
    /** The selection mirror: a row that vanished under it is forgotten there. */
    list: { forget(id: unknown): void };
    words: LiveWords;
    /** A row went away: the page drops what it holds of it (the inline subject's record). */
    onRemoved?(id: unknown): void;
    /** The list was re-read on reconnect: the page re-reads what it holds. */
    afterResync?(): void;
}

export interface LiveList {
    connection: Signal<ConnectionState>;
    /** The last thing worth saying about the feed, or ''. */
    notice: Signal<string>;
    /** The simulated server drops the connection. */
    goOffline(): void;
    /** The honest reconnect: what was missed is unknown, so ask the server rather than guess. */
    goOnline(): Promise<void>;
}

/** Listen to the tickets feed and apply it to `source`. Call it during a component's setup. */
export function createLiveList({ source, list, words, onRemoved, afterResync }: LiveListOptions): LiveList {
    const connection = signal<ConnectionState>('live');
    const notice = signal('');

    // The bridge. Each event is a fresh object with a `seq`, so two identical changes in a row are
    // still two values — a signal that dedupes by identity would swallow the second.
    const lastEvent = fromCallback<TicketEvent>((emit) =>
        connectTicketEvents(
            (event) => emit(event),
            (state) => connection.set(state),
        ),
    );

    watch(lastEvent, (event) => {
        if (!event) return;
        const outcome = source.applyServerChange({ type: event.type, item: event.ticket });
        if (outcome === 'shadowed') {
            // The one case where the user has to be told: what they see is no longer what the server says.
            notice.set(words.shadowed(event.ticket.reference));
            return;
        }
        if (outcome === 'applied') {
            notice.set(event.type === 'deleted' ? words.withdrawn(event.ticket.reference) : words.changed(event.ticket.reference));
            // A row that vanished under the selection takes the selection with it. The SCREEN holds
            // the selected ids — the grid emits them, the page keeps them — so the source deselecting
            // its own copy is not enough: without this the bulk bar still counts a ticket the server
            // no longer has, and every action over it would fail.
            if (event.type === 'deleted') {
                list.forget(event.ticket.id);
                onRemoved?.(event.ticket.id);
            }
        }
    });

    return {
        connection,
        notice,
        goOffline() {
            dropConnection();
            notice.set('');
        },
        async goOnline() {
            restoreConnection();
            const missed = missedCount();
            clearMissed();
            await source.refresh();
            afterResync?.();
            notice.set(missed > 0 ? words.resynced(missed) : '');
        },
    };
}
