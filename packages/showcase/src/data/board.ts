// The board's backend, in memory.
//
// Separate from `data/tickets.ts` on purpose: the grid's store is a transport that answers a
// `DataRequest`, and a board is not a page of rows — it is the whole set, grouped, and reordered
// within a group. Sharing one store would mean teaching the transport about ordering it does not
// have, to save a file.
//
// What it has that a happy mock would not: `refuseNextMove()`. The optimistic move is only half a
// demonstration — the half worth seeing is the card going back where it came from because the
// server said no, and something that never says no cannot show it.

import { signal } from '@pdxui/core';
import { ticketSeed } from './seed';

export type BoardStatus = 'open' | 'waiting' | 'closed';

export interface BoardCard extends Record<string, unknown> {
    id: number;
    reference: string;
    subject: string;
    status: BoardStatus;
    /** Position within its column. The server owns the order, the way a real one does. */
    rank: number;
}

/**
 * The tickets of the list, every one of them: cards of the board's own would make the two screens
 * show two data sets under one name. The records are the tickets'; the ORDER within a column is the board's, and
 * starts as the tickets' order.
 */
function seed(): BoardCard[] {
    const ranks = new Map<BoardStatus, number>();
    return ticketSeed().map(t => {
        const rank = ranks.get(t.status) ?? 0;
        ranks.set(t.status, rank + 1);
        return { id: t.id, reference: t.reference, subject: t.subject, status: t.status, rank };
    });
}

const _cards = signal<BoardCard[]>(seed());
/** Every card, in no particular order. The page groups them. */
export const cards = _cards as unknown as () => BoardCard[];

/** What the SERVER was last asked to do, for a spec to read whole. */
export interface MovePayload {
    id: number;
    from: BoardStatus;
    to: BoardStatus;
    toIndex: number;
}

let refuse = false;
/** Make the next move fail at the server, after the board has already shown it. */
export function refuseNextMove(): void { refuse = true; }

export function resetBoard(): void {
    _cards.set(seed());
    refuse = false;
    (globalThis as unknown as { __pdxLastMove?: MovePayload | null }).__pdxLastMove = null;
}

/** Apply a move locally — the optimistic half, and the rollback's half too. */
export function applyMove(id: number, to: BoardStatus, toIndex: number): BoardCard[] {
    const before = _cards();
    const card = before.find(c => c.id === id);
    if (!card) return before;

    const rest = before.filter(c => c.id !== id);
    const column = rest.filter(c => c.status === to).sort((a, b) => a.rank - b.rank);
    column.splice(Math.max(0, Math.min(toIndex, column.length)), 0, { ...card, status: to });

    const reranked = new Map<number, number>();
    column.forEach((c, i) => reranked.set(c.id, i));
    const next = before.map(c =>
        c.id === id ? { ...c, status: to, rank: reranked.get(id) ?? 0 }
            : reranked.has(c.id) ? { ...c, rank: reranked.get(c.id)! } : c);
    _cards.set(next);
    return before;
}

/** Put back exactly what was there. The rollback is a restore, not a second move. */
export function restore(snapshot: BoardCard[]): void {
    _cards.set(snapshot);
}

/**
 * Tell the server. Rejects when armed, and the page is expected to restore.
 *
 * Deliberately slow enough to be seen: an optimistic update whose server round trip is instant
 * demonstrates nothing, because the screen would look the same without it.
 */
export async function persistMove(payload: MovePayload): Promise<void> {
    await new Promise(r => setTimeout(r, 40));
    if (refuse) {
        refuse = false;
        throw new Error(`${payload.to} is full: the board refused the move.`);
    }
    (globalThis as unknown as { __pdxLastMove?: MovePayload }).__pdxLastMove = payload;
}
